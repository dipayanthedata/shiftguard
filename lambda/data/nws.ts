// NWS gridpoint forecast API integration
// Fetches hourly forecasts from api.weather.gov (no API key required)
// Returns temperature, relative humidity, and weather description

const USER_AGENT = 'ShiftGuard (https://github.com/dipayanthedata/shiftguard; contact: 297210783+dipayanthedata@users.noreply.github.com)';

export interface NwsPoint {
  x: number;
  y: number;
  gridId: string;
}

export interface NwsHourlyForecast {
  hour: number; // 0–23
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
  y: number
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

  // Convert to hourly 0–23 format (API uses sequential number field)
  const periods = data.properties.periods || [];

  return periods.map((period, index) => {
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
      hour: (index % 24) as number, // Wrap to 0–23
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
  const point = await getGridPoint(latitude, longitude);
  return getHourlyForecast(point.gridId, point.x, point.y);
}
