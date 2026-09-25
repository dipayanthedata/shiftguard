import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

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

    // Lambda for POST /api/plan endpoint
    const planHandler = new lambda.Function(this, 'PlanHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'plan/handler.handler',
      code: lambda.Code.fromAsset('.'),
      memorySize: 512, // More memory for data fetching
      timeout: cdk.Duration.seconds(60), // Longer timeout for API calls
      environment: {
        DYNAMODB_TABLE_NAME: 'shiftguard-data',
        AWS_REGION: this.region,
      },
    });

    const planFunctionUrl = planHandler.addFunctionUrl({
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.POST, lambda.HttpMethod.OPTIONS],
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
