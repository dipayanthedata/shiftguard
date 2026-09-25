// POST /api/plan — Main shift planning endpoint
// Accepts coordinates and shift parameters, returns exposure plan

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getForecastForLocation } from '../data/nws';
import { getPm25WithFallback } from '../data/aqi';
import { planShift, HourlyForecast, ShiftWindow } from '../shared/exposure';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

interface PlanRequest {
  latitude: number;
  longitude: number;
  startHour: number; // 0–23
  endHour: number; // 0–23
  workloadWm2?: number; // Metabolic rate W/m²; default 200 (moderate)
  isNewOrReturningWorker?: boolean; // Default false (assume acclimated)
}

function validateRequest(body: unknown): PlanRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const req = body as Record<string, unknown>;

  if (
    typeof req.latitude !== 'number' ||
    typeof req.longitude !== 'number' ||
    typeof req.startHour !== 'number' ||
    typeof req.endHour !== 'number'
  ) {
    return null;
  }

  return {
    latitude: req.latitude,
    longitude: req.longitude,
    startHour: Math.max(0, Math.min(23, Math.floor(req.startHour))),
    endHour: Math.max(0, Math.min(23, Math.floor(req.endHour))),
    workloadWm2: typeof req.workloadWm2 === 'number' ? req.workloadWm2 : 200,
    isNewOrReturningWorker:
      typeof req.isNewOrReturningWorker === 'boolean' ? req.isNewOrReturningWorker : false,
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  console.log(`[plan] ${event.requestContext.http.method} ${event.rawPath}`);

  // Handle OPTIONS (CORS preflight)
  if (event.requestContext.http.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
    };
  }

  // Only POST allowed
  if (event.requestContext.http.method !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    let planRequest: PlanRequest | null = null;
    if (event.body) {
      try {
        planRequest = validateRequest(JSON.parse(event.body));
      } catch (e) {
        console.error('[plan] JSON parse error:', e);
      }
    }

    if (!planRequest) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Invalid request',
          required: ['latitude', 'longitude', 'startHour', 'endHour'],
          optional: ['workloadWm2', 'isNewOrReturningWorker'],
        }),
      };
    }

    console.log(`[plan] Request: lat=${planRequest.latitude}, lon=${planRequest.longitude}`);

    // Fetch NWS forecast
    console.log('[plan] Fetching NWS forecast...');
    const nwsForecast = await getForecastForLocation(planRequest.latitude, planRequest.longitude);

    // Fetch AQI data
    console.log('[plan] Fetching AQI data...');
    const aqiData = await getPm25WithFallback(planRequest.latitude, planRequest.longitude);

    // Merge AQI into hourly forecast
    const hourlyForecast: HourlyForecast[] = nwsForecast.map((h) => ({
      ...h,
      pm25: aqiData.pm25Ug,
    }));

    // Generate shift plan
    console.log('[plan] Generating shift plan...');
    const shiftWindow: ShiftWindow = {
      startHour: planRequest.startHour,
      endHour: planRequest.endHour,
      jurisdiction: 'washington-state', // v1: WA only
      isNewOrReturningWorker: planRequest.isNewOrReturningWorker || false,
    };

    const plan = planShift(hourlyForecast, shiftWindow);

    console.log(`[plan] Success: ${plan.hourlyAnalysis.length} hours analyzed`);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(plan),
    };
  } catch (error) {
    console.error('[plan] Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: message }),
    };
  }
}
