// Impact counter: track plans generated and crew-hours covered
// Stored in DynamoDB with simple counters updated on each plan request

import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'shiftguard-data';
const IMPACT_KEY = 'IMPACT#global'; // Single global impact record

export interface ImpactMetrics {
  plansGenerated: number;
  crewHoursCovered: number;
  lastUpdatedUtc: string;
}

export async function recordPlan(crewSize: number, shiftHours: number): Promise<ImpactMetrics> {
  const crewHours = crewSize * shiftHours;
  const now = new Date().toISOString();

  try {
    const command = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ pk: IMPACT_KEY, sk: 'metrics' }),
      UpdateExpression: 'SET plansGenerated = if_not_exists(plansGenerated, :zero) + :one, crewHoursCovered = if_not_exists(crewHoursCovered, :zero) + :hours, lastUpdatedUtc = :now',
      ExpressionAttributeValues: marshall({
        ':zero': 0,
        ':one': 1,
        ':hours': crewHours,
        ':now': now,
      }),
      ReturnValues: 'ALL_NEW',
    });

    const response = await dynamoClient.send(command);
    const attributes = response.Attributes ? unmarshall(response.Attributes) : {};

    console.log(`[impact] Recorded plan: +1 plan, +${crewHours} crew-hours (total: ${attributes.plansGenerated} plans, ${attributes.crewHoursCovered} hours)`);

    return {
      plansGenerated: (attributes.plansGenerated as number) || 0,
      crewHoursCovered: (attributes.crewHoursCovered as number) || 0,
      lastUpdatedUtc: (attributes.lastUpdatedUtc as string) || now,
    };
  } catch (error) {
    console.error(`[impact] Failed to record plan:`, error);
    // Return defaults on error (graceful degradation)
    return {
      plansGenerated: 0,
      crewHoursCovered: 0,
      lastUpdatedUtc: now,
    };
  }
}

export async function getImpactMetrics(): Promise<ImpactMetrics> {
  try {
    const command = new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ pk: IMPACT_KEY, sk: 'metrics' }),
    });

    const response = await dynamoClient.send(command);
    const item = response.Item ? unmarshall(response.Item) : undefined;

    if (!item) {
      return {
        plansGenerated: 0,
        crewHoursCovered: 0,
        lastUpdatedUtc: new Date().toISOString(),
      };
    }

    return {
      plansGenerated: (item.plansGenerated as number) || 0,
      crewHoursCovered: (item.crewHoursCovered as number) || 0,
      lastUpdatedUtc: (item.lastUpdatedUtc as string) || new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[impact] Failed to fetch metrics:`, error);
    return {
      plansGenerated: 0,
      crewHoursCovered: 0,
      lastUpdatedUtc: new Date().toISOString(),
    };
  }
}
