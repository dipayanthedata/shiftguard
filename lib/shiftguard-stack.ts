import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as custom from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'path';

export class ShiftGuardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const account = this.account;

    // S3 bucket for static site (private, no public access)
    const bucket = new s3.Bucket(this, 'AppBucket', {
      bucketName: `shiftguard-${account}-app`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
    });

    // Lambda Function URL for /api/health
    const healthHandler = new lambda.Function(this, 'HealthHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      version: '0.0.1',
      timestamp: new Date().toISOString(),
    }),
  };
};
      `),
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
    });

    const functionUrl = healthHandler.addFunctionUrl({
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST],
        allowedHeaders: ['Content-Type'],
      },
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    // Create explicit execution role for Plan Lambda with all needed permissions
    const planHandlerRole = new iam.Role(this, 'PlanHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Lambda logs
    planHandlerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // DynamoDB read/write (will be granted separately)
    planHandlerRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
        resources: [`arn:aws:dynamodb:${this.region}:${account}:table/shiftguard-data`],
      })
    );

    // SSM GetParameter for AirNow API key
    planHandlerRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:${this.region}:${account}:parameter/shiftguard/*`],
      })
    );

    // KMS Decrypt for SSM SecureString
    planHandlerRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: [`arn:aws:kms:${this.region}:${account}:key/*`],
        conditions: {
          StringEquals: {
            'kms:ViaService': `ssm.${this.region}.amazonaws.com`,
          },
        },
      })
    );

    // Bedrock InvokeModel for narration (Claude Haiku 4.5 inference profile + all routed regions)
    // Inference profile routes to us-east-1, us-east-2, us-west-2; must grant foundation-model access in all
    planHandlerRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}:${account}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
          'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
          'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
          'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
        ],
      })
    );

    // Lambda for POST /api/plan endpoint
    const planHandler = new nodejs.NodejsFunction(this, 'PlanHandler', {
      entry: 'lambda/plan/handler.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      environment: {
        DYNAMODB_TABLE_NAME: 'shiftguard-data',
        BEDROCK_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      },
      bundling: {
        externalModules: ['@aws-sdk'],
      },
      role: planHandlerRole,
    });

    const planFunctionUrl = planHandler.addFunctionUrl({
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: ['Content-Type'],
      },
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    // DynamoDB table
    const table = new dynamodb.Table(this, 'DataTable', {
      tableName: 'shiftguard-data',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: false,
    });

    // CloudFront distribution with two behaviors
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        '/api/plan': {
          origin: new origins.FunctionUrlOrigin(planFunctionUrl),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        '/api/*': {
          origin: new origins.FunctionUrlOrigin(functionUrl),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: true,
      defaultRootObject: 'index.html',
    });

    // Update S3 bucket policy for CloudFront OAC
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontOAC',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [bucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${account}:distribution/${distribution.distributionId}`,
          },
        },
      })
    );

    // Deploy web files and invalidate CloudFront cache
    const deployment = new s3deploy.BucketDeployment(this, 'WebDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../web'))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Invalidate CloudFront cache on deployment
    new custom.AwsCustomResource(this, 'InvalidateCloudFront', {
      onUpdate: {
        action: 'createInvalidation',
        service: 'CloudFront',
        parameters: {
          DistributionId: distribution.distributionId,
          InvalidationBatch: {
            Paths: {
              Quantity: 1,
              Items: ['/*'],
            },
            CallerReference: cdk.Fn.select(0, cdk.Fn.split(':', cdk.Fn.ref('AWS::StackId'))),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of('CloudFrontInvalidation'),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [`arn:aws:cloudfront::${account}:distribution/${distribution.distributionId}`],
      }),
    });

    // Grant plan Lambda permissions to read/write DynamoDB cache
    table.grantReadWriteData(planHandler);

    // Budget alarm at $20
    new budgets.CfnBudget(this, 'Budget20', {
      budget: {
        budgetName: 'ShiftGuard-$20-Alert-dipayandas',
        budgetLimit: {
          amount: 20,
          unit: 'USD',
        },
        timeUnit: 'MONTHLY',
        budgetType: 'COST',
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: 'dipayandas.data@gmail.com',
            },
          ],
        },
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: distribution.domainName,
      description: 'CloudFront distribution domain',
    });

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: functionUrl.url,
      description: 'Lambda Function URL for /api/health (for reference; use CloudFront domain)',
    });

    new cdk.CfnOutput(this, 'PlanFunctionUrl', {
      value: planFunctionUrl.url,
      description: 'Lambda Function URL for /api/plan (for reference; use CloudFront domain)',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'DynamoDB table name',
    });
  }
}
