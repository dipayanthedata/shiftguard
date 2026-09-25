// DynamoDB caching layer for forecast and AQ data
// Stores fetched data with TTL to avoid redundant external API calls

import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'shiftguard-data';
const CACHE_TTL_HOURS = 6; // Forecast data valid for 6 hours

// ============================================================================
// CACHE KEY GENERATION
// ============================================================================

function getForecastCacheKey(latitude: number, longitude: number): string {
  return `forecast#${latitude.toFixed(2)}#${longitude.toFixed(2)}`;
}

function getAqiCacheKey(latitude: number, longitude: number): string {
  return `aqi#${latitude.toFixed(2)}#${longitude.toFixed(2)}`;
}

function computeTtlTimestamp(): number {
  return Math.floor((Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000) / 1000);
}

// ============================================================================
// FORECAST CACHE
// ============================================================================

export interface CachedForecast {
  latitude: number;
  longitude: number;
  forecast: Array<{
    hour: number;
    tempF: number;
    relativeHumidity: number;
    weatherDescription: string;
    windSpeedMph: number;
  }>;
  fetchedAtUtc: string;
}

export async function cacheForecast(
  latitude: number,
  longitude: number,
  forecast: Array<{
    hour: number;
    tempF: number;
    relativeHumidity: number;
    weatherDescription: string;
    windSpeedMph: number;
  }>
): Promise<void> {
  const key = getForecastCacheKey(latitude, longitude);
  const ttl = computeTtlTimestamp();

  const item = {
    pk: { S: key },
    sk: { S: 'forecast' },
    latitude: { N: latitude.toString() },
    longitude: { N: longitude.toString() },
    forecast: { S: JSON.stringify(forecast) },
    fetchedAtUtc: { S: new Date().toISOString() },
    ttl: { N: ttl.toString() },
  };

  const command = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: item,
  });

  await dynamodb.send(command);
}

export async function getCachedForecast(
  latitude: number,
  longitude: number
): Promise<CachedForecast | null> {
  const key = getForecastCacheKey(latitude, longitude);

  const command = new GetItemCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: { S: key },
      sk: { S: 'forecast' },
    },
  });

  const response = await dynamodb.send(command);
  if (!response.Item) {
    return null; // Cache miss
  }

  const item = unmarshall(response.Item);

  return {
    latitude: item.latitude,
    longitude: item.longitude,
    forecast: JSON.parse(item.forecast),
    fetchedAtUtc: item.fetchedAtUtc,
  };
}

// ============================================================================
// AQI CACHE
// ============================================================================

export interface CachedAqi {
  latitude: number;
  longitude: number;
  pm25Ug: number;
  source: string;
  fetchedAtUtc: string;
}

export async function cacheAqi(
  latitude: number,
  longitude: number,
  pm25Ug: number,
  source: string
): Promise<void> {
  const key = getAqiCacheKey(latitude, longitude);
  const ttl = computeTtlTimestamp();

  const item = {
    pk: { S: key },
    sk: { S: 'aqi' },
    latitude: { N: latitude.toString() },
    longitude: { N: longitude.toString() },
    pm25Ug: { N: pm25Ug.toString() },
    source: { S: source },
    fetchedAtUtc: { S: new Date().toISOString() },
    ttl: { N: ttl.toString() },
  };

  const command = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: item,
  });

  await dynamodb.send(command);
}

export async function getCachedAqi(
  latitude: number,
  longitude: number
): Promise<CachedAqi | null> {
  const key = getAqiCacheKey(latitude, longitude);

  const command = new GetItemCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: { S: key },
      sk: { S: 'aqi' },
    },
  });

  const response = await dynamodb.send(command);
  if (!response.Item) {
    return null; // Cache miss
  }

  const item = unmarshall(response.Item);

  return {
    latitude: item.latitude,
    longitude: item.longitude,
    pm25Ug: item.pm25Ug,
    source: item.source,
    fetchedAtUtc: item.fetchedAtUtc,
  };
}

// ============================================================================
// CACHE STATS (For monitoring/debugging)
// ============================================================================

export interface CacheStats {
  forecast: {
    hit: boolean;
    ageMinutes: number | null;
  };
  aqi: {
    hit: boolean;
    ageMinutes: number | null;
  };
}

export async function getCacheStats(
  latitude: number,
  longitude: number
): Promise<CacheStats> {
  const now = Date.now();

  const forecastCache = await getCachedForecast(latitude, longitude);
  const forecastAge =
    forecastCache && forecastCache.fetchedAtUtc
      ? Math.floor((now - new Date(forecastCache.fetchedAtUtc).getTime()) / 60000)
      : null;

  const aqiCache = await getCachedAqi(latitude, longitude);
  const aqiAge =
    aqiCache && aqiCache.fetchedAtUtc
      ? Math.floor((now - new Date(aqiCache.fetchedAtUtc).getTime()) / 60000)
      : null;

  return {
    forecast: {
      hit: !!forecastCache,
      ageMinutes: forecastAge,
    },
    aqi: {
      hit: !!aqiCache,
      ageMinutes: aqiAge,
    },
  };
}
