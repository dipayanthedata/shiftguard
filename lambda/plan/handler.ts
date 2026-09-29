// POST /api/plan — Main shift planning endpoint
// Accepts coordinates and shift parameters, returns exposure plan

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getForecastForLocation } from '../data/nws';
import { getPm25 } from '../data/aqi';
import { planShift, HourlyForecast, ShiftWindow } from '../shared/exposure';
import { narrateShift } from '../narrate/handler';
import { recordPlan, getImpactMetrics } from '../data/impact';

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
  date: string; // ISO date YYYY-MM-DD; defaults to today if not provided
  workloadWm2?: number; // Metabolic rate W/m²; default 200 (moderate)
  isNewOrReturningWorker?: boolean; // Default false (assume acclimated)
  crewSize?: number; // Number of workers; default 1 (for impact counter)
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
    date: typeof req.date === 'string' ? req.date : new Date().toISOString().split('T')[0], // Default to today UTC
    workloadWm2: typeof req.workloadWm2 === 'number' ? req.workloadWm2 : 200,
    isNewOrReturningWorker:
      typeof req.isNewOrReturningWorker === 'boolean' ? req.isNewOrReturningWorker : false,
    crewSize: typeof req.crewSize === 'number' ? Math.max(1, Math.floor(req.crewSize)) : 1,
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
    console.log('[plan] Fetching AQI data (attempt 1)...');
    const aqiData = await getPm25(planRequest.latitude, planRequest.longitude);
    const aqiAvailable = aqiData !== null;
    const pm25Source = aqiData?.pm25Source || null;

    if (!aqiAvailable) {
      console.warn('[plan] Air quality data unavailable; smoke requirements omitted');
    } else if (pm25Source === 'derived_from_aqi') {
      console.log('[plan] PM2.5 derived from AQI (not direct measurement)');
    }

    // Merge AQI into hourly forecast (pm25 may be undefined)
    const hourlyForecast: HourlyForecast[] = nwsForecast.map((h) => ({
      ...h,
      pm25: aqiData?.pm25Ug,
    }));

    // Generate shift plan
    console.log('[plan] Generating shift plan...');
    const shiftWindow: ShiftWindow = {
      date: planRequest!.date,
      startHour: planRequest!.startHour,
      endHour: planRequest!.endHour,
      jurisdiction: 'washington-state', // v1: WA only
      isNewOrReturningWorker: planRequest!.isNewOrReturningWorker || false,
    };

    const plan = planShift(hourlyForecast, shiftWindow);

    console.log(`[plan] Success: ${plan.hourlyAnalysis.length} hours analyzed (aqiAvailable=${aqiAvailable})`);

    // Generate narration (English and Spanish)
    console.log('[plan] Generating narration...');
    const narration = await narrateShift(plan as unknown as Record<string, unknown>);

    // Record impact metrics
    const shiftHours = planRequest!.endHour - planRequest!.startHour;
    const impact = await recordPlan(planRequest!.crewSize || 1, shiftHours);
    const metrics = await getImpactMetrics();

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ...plan,
        aqiAvailable,
        pm25Source,
        pm25SourceNote: pm25Source === 'derived_from_aqi' ? 'PM2.5 concentration derived from EPA NowCast AQI (not direct measurement)' : undefined,
        aqiNote: !aqiAvailable ? 'Air quality data unavailable. Check WA Ecology AirNow (airnow.gov) directly.' : undefined,
        narration,
        impact: {
          plansGenerated: metrics.plansGenerated,
          crewHoursCovered: metrics.crewHoursCovered,
          lastUpdatedUtc: metrics.lastUpdatedUtc,
        },
      }),
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
