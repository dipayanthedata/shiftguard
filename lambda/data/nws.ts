// NWS gridpoint forecast API integration
// Fetches hourly forecasts from api.weather.gov (no API key required)
// Returns temperature, relative humidity, and weather description
//
// Two-step process:
// 1. Convert lat/lon to NWS grid reference (cached 30 days)
// 2. Fetch hourly forecast from gridpoint (cached 1 hour)

import * as cache from './cache';

const USER_AGENT = 'ShiftGuard (https://github.com/dipayanthedata/shiftguard; contact: 297210783+dipayanthedata@users.noreply.github.com)';

export interface NwsPoint {
  x: number;
  y: number;
  gridId: string;
}

export interface NwsHourlyForecast {
  date: string; // ISO date YYYY-MM-DD UTC
  hour: number; // 0–23 UTC
  tempF: number;
  relativeHumidity: number;
  weatherDescription: string;
  windSpeedMph: number;
}

// ============================================================================
// CONVERT LAT/LN TO NWS GRID POINT
// ============================================================================
// NWS API requires grid coordinates (gridId, x, y), not lat/lon directly.
// Step 1: Call /points/{lat},{lon} to get the gridpoint info

export async function getGridPoint(
  latitude: number,
  longitude: number
): Promise<NwsPoint> {
  // Try cache first (30-day TTL)
  const cached = await cache.getCachedGridPoint(latitude, longitude);
  if (cached) {
    return {
      gridId: cached.gridId,
      x: cached.gridX,
      y: cached.gridY,
    };
  }

  // Cache miss: fetch from NWS API
  const url = `https://api.weather.gov/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(
      `NWS points API failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    properties: {
      cwa: string;
      gridX: number;
      gridY: number;
    };
  };

  const cwa = data.properties.cwa;
  const gridX = data.properties.gridX;
  const gridY = data.properties.gridY;

  // Cache the result (30 days)
  await cache.cacheGridPoint(latitude, longitude, cwa, gridX, gridY);

  return {
    gridId: cwa,
    x: gridX,
    y: gridY,
  };
}

// ============================================================================
// FETCH HOURLY GRIDPOINT FORECAST
// ============================================================================
// Step 2: Call /gridpoints/{gridId}/{x},{y}/forecast/hourly to get forecast

export async function getHourlyForecast(
  gridId: string,
  x: number,
  y: number,
  startDate: string = new Date().toISOString().split('T')[0] // Default to today UTC
): Promise<NwsHourlyForecast[]> {
  const url = `https://api.weather.gov/gridpoints/${gridId}/${x},${y}/forecast/hourly`;

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(
      `NWS forecast API failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    properties: {
      periods: Array<{
        number: number;
        temperature: number;
        temperatureUnit: string;
        relativeHumidity?: { value: number | null };
        shortForecast: string;
        windSpeed: string;
      }>;
    };
  };

  // Convert to hourly format with dates
  const periods = data.properties.periods || [];
  const startDateObj = new Date(startDate + 'T00:00:00Z');

  return periods.map((period, index) => {
    // Calculate date for this hour (starting from startDate + index hours)
    const hourDate = new Date(startDateObj.getTime() + index * 60 * 60 * 1000);
    const date = hourDate.toISOString().split('T')[0]; // YYYY-MM-DD UTC
    const hour = hourDate.getUTCHours();

    // Temperature from NWS is in °F when temperatureUnit is 'F'
    const tempF = period.temperature;

    // Relative humidity may be null
    let relativeHumidity = 50; // Conservative default
    if (period.relativeHumidity?.value !== null && period.relativeHumidity?.value !== undefined) {
      relativeHumidity = Math.min(100, Math.max(0, period.relativeHumidity.value));
    }

    // Parse wind speed (e.g., "10 mph", "15 mph")
    const windSpeedStr = period.windSpeed.split(' ')[0];
    const windSpeedMph = parseInt(windSpeedStr, 10) || 0;

    return {
      date,
      hour,
      tempF,
      relativeHumidity,
      weatherDescription: period.shortForecast,
      windSpeedMph,
    };
  });
}

// ============================================================================
// COMBINED: LAT/LON -> FORECAST
// ============================================================================

export async function getForecastForLocation(
  latitude: number,
  longitude: number
): Promise<NwsHourlyForecast[]> {
  // Try cache first (1-hour TTL)
  const cachedForecast = await cache.getCachedForecast(latitude, longitude);
  if (cachedForecast) {
    return cachedForecast.forecast;
  }

  // Cache miss: get grid point (may be cached for 30 days) and fetch forecast
  const point = await getGridPoint(latitude, longitude);
  const forecast = await getHourlyForecast(point.gridId, point.x, point.y);

  // Cache the forecast (1 hour)
  await cache.cacheForecast(latitude, longitude, forecast);

  return forecast;
}
