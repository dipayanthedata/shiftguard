// AirNow air quality API integration
// Fetches current PM2.5 measurements and NowCast AQI from EPA AirNow service
// API key stored in SSM Parameter Store (secure, never in environment or repo)

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { deriveConcentrationFromAqi } from '../shared/aqi-inversion';

const USER_AGENT = 'ShiftGuard (https://github.com/dipayanthedata/shiftguard; contact: 297210783+dipayanthedata@users.noreply.github.com)';
const AIRNOW_API_BASE = 'https://www.airnowapi.org/aq/observation/latLong/current';
const AIRNOW_PARAM_PATH = '/shiftguard/airnow-api-key';
const SSM_REGION = process.env.AWS_REGION || 'us-west-2';

let cachedApiKey: string | null = null;
let keyFetchAttempted = false;

export interface AqiMeasurement {
  pm25Ug: number; // PM2.5 in µg/m³ (measured or derived from AQI)
  lastUpdatedUtc: string;
  source: string; // Station name or network
  pm25Source: 'measured' | 'derived_from_aqi'; // Track data provenance
}

// ============================================================================
// FETCH API KEY FROM SSM AT COLD START
// ============================================================================
// Read once at module initialization; cache for all subsequent requests
// Missing key or error → return null, handler will skip AQI fetch

async function getAirNowApiKey(): Promise<string | null> {
  if (keyFetchAttempted) {
    return cachedApiKey; // Already attempted; use cached result (null or key)
  }

  keyFetchAttempted = true;

  try {
    console.log(`[aqi] Fetching SSM parameter from ${SSM_REGION}: ${AIRNOW_PARAM_PATH}`);
    const ssmClient = new SSMClient({ region: SSM_REGION });
    const command = new GetParameterCommand({
      Name: AIRNOW_PARAM_PATH,
      WithDecryption: true,
    });

    const response = await ssmClient.send(command);
    cachedApiKey = response.Parameter?.Value || null;
    console.log(`[aqi] SSM key fetch: ${cachedApiKey ? 'SUCCESS (key length: ' + cachedApiKey.length + ')' : 'EMPTY'}`);
    return cachedApiKey;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[aqi] SSM key fetch FAILED: ${errorMsg}`);
    return null;
  }
}

// ============================================================================
// FETCH PM2.5 FROM AIRNOW
// ============================================================================
// AirNow observation endpoint returns measured PM2.5 concentrations.
// If Concentration field is missing, derive from AQI using inverse calculation.
// If both are missing, return null (data unavailable, not invented).

export async function getPm25ForLocation(
  latitude: number,
  longitude: number,
  distanceKm: number = 50
): Promise<AqiMeasurement | null> {
  const apiKey = await getAirNowApiKey();
  if (!apiKey) {
    console.warn('[aqi] No API key available; returning null');
    return null;
  }

  try {
    // AirNow observation endpoint: https://www.airnowapi.org/aq/observation/latLong/current/?latitude=X&longitude=Y&distance=Z&format=application/json&API_KEY=...
    const url = new URL(`${AIRNOW_API_BASE}/`);
    url.searchParams.append('latitude', latitude.toString());
    url.searchParams.append('longitude', longitude.toString());
    url.searchParams.append('distance', distanceKm.toString());
    url.searchParams.append('format', 'application/json');
    url.searchParams.append('API_KEY', apiKey);

    // Log URL with key redacted for debugging
    const urlLogged = url.toString().replace(/API_KEY=[^&]+/, 'API_KEY=***');
    console.log(`[aqi] Requesting ${urlLogged}`);

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(
        `AirNow API failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as Array<{
      DateObserved: string;
      HourObserved: number;
      LocalTimeZone: string;
      ReportingArea: string;
      StateCode: string;
      Latitude: number;
      Longitude: number;
      ParameterName: string;
      AQI: number;
      Category: { Number: number; Name: string };
    }>;

    if (!Array.isArray(data) || data.length === 0) {
      console.warn('[aqi] AirNow returned no observations');
      return null;
    }

    // Find PM2.5 measurement in response
    const pm25Obs = data.find((obs) => obs.ParameterName === 'PM2.5');
    if (!pm25Obs) {
      console.warn('[aqi] AirNow response missing PM2.5 parameter');
      return null;
    }

    // AirNow current-observation endpoint never includes Concentration field
    // Derive PM2.5 from NowCast AQI using piecewise linear inversion
    if (pm25Obs.AQI === undefined || pm25Obs.AQI === null) {
      console.warn('[aqi] AirNow PM2.5 observation missing AQI value');
      return null;
    }

    const derivedPm25 = deriveConcentrationFromAqi(pm25Obs.AQI);
    if (derivedPm25 === null) {
      console.warn('[aqi] AQI inversion failed for AQI=' + pm25Obs.AQI);
      return null;
    }

    console.log(`[aqi] Derived PM2.5 from NowCast AQI ${pm25Obs.AQI}: ${derivedPm25} µg/m³ (${pm25Obs.ReportingArea})`);
    return {
      pm25Ug: derivedPm25,
      lastUpdatedUtc: pm25Obs.DateObserved,
      source: pm25Obs.ReportingArea,
      pm25Source: 'derived_from_aqi',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const cause = (error as any)?.cause;
    console.error(`[aqi] AirNow fetch failed: ${errorMsg}`);
    if (cause) {
      console.error(`[aqi] cause: ${cause}`);
    }
    return null;
  }
}

// ============================================================================
// FETCH WITH NULL ON FAILURE (NO FABRICATED DEFAULTS)
// ============================================================================
// Never substitute a default value. If upstream is down, return null.
// Caller must handle missing air quality data and omit smoke requirements.
// During an outage, the plan briefing directs supervisor to check WA Ecology directly.

export async function getPm25(
  latitude: number,
  longitude: number
): Promise<AqiMeasurement | null> {
  try {
    return await getPm25ForLocation(latitude, longitude);
  } catch (error) {
    console.error(`[aqi] Fetch failed: ${error}`);
    return null;
  }
}
