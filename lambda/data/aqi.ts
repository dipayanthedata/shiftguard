// OpenAQ air quality API integration
// Fetches current PM2.5 measurements (no API key required for public data)

const USER_AGENT = 'ShiftGuard (https://github.com/dipayanthedata/shiftguard; contact: 297210783+dipayanthedata@users.noreply.github.com)';

export interface AqiMeasurement {
  pm25Ug: number; // PM2.5 in µg/m³
  lastUpdatedUtc: string;
  source: string; // Reporting station name or network
}

// ============================================================================
// FETCH PM2.5 FROM OPENAQ (PUBLIC API)
// ============================================================================
// OpenAQ /latest endpoint returns current measurements from nearby stations
// No authentication required for public data

export async function getPm25ForLocation(
  latitude: number,
  longitude: number,
  radiusKm: number = 50 // Default search radius
): Promise<AqiMeasurement | null> {
  // OpenAQ API: /v2/latest?coordinates=lat,lon&radius=X&parameter=pm25
  const url = new URL('https://api.openaq.org/v2/latest');
  url.searchParams.append('coordinates', `${latitude},${longitude}`);
  url.searchParams.append('radius', radiusKm.toString());
  url.searchParams.append('parameter', 'pm25');
  url.searchParams.append('limit', '1'); // Get closest station only

  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(
      `OpenAQ API failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    results?: Array<{
      measurements: Array<{
        parameter: string;
        value: number;
        lastUpdated: string;
      }>;
      location: string;
    }>;
  };

  const results = data.results || [];
  if (results.length === 0) {
    return null; // No data found for location
  }

  const firstResult = results[0];
  const pm25Measurement = firstResult.measurements.find(
    (m) => m.parameter === 'pm25'
  );

  if (!pm25Measurement) {
    return null; // PM2.5 not available
  }

  return {
    pm25Ug: pm25Measurement.value,
    lastUpdatedUtc: pm25Measurement.lastUpdated,
    source: firstResult.location,
  };
}

// ============================================================================
// FALLBACK: NO DATA AVAILABLE
// ============================================================================
// If API fails or no measurements available, return null
// Caller should handle missing data gracefully

export async function getPm25WithFallback(
  latitude: number,
  longitude: number,
  fallbackValue: number = 10 // Conservative default: assume "Good" air quality
): Promise<AqiMeasurement> {
  try {
    const result = await getPm25ForLocation(latitude, longitude);
    if (result) {
      return result;
    }
  } catch (error) {
    // Log error but don't throw—fall through to fallback
    console.error(`OpenAQ fetch failed: ${error}`);
  }

  // Return fallback with current timestamp
  return {
    pm25Ug: fallbackValue,
    lastUpdatedUtc: new Date().toISOString(),
    source: 'FALLBACK (no data available)',
  };
}
