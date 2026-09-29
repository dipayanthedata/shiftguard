// Pure piecewise linear inversion: AQI → PM2.5 concentration
// No AWS SDK, no network calls — pure function for testing
// Breakpoints derived from thresholds.ts AQI_BREAKPOINTS_PM25 (single source of truth)

import { AQI_BREAKPOINTS_PM25 } from './thresholds';

// Derive complete breakpoint array from EPA AQI_BREAKPOINTS_PM25
// Format: [AQI_low, AQI_high, C_low, C_high]
function getAqiBreakpoints(): Array<[number, number, number, number]> {
  const pmRanges = AQI_BREAKPOINTS_PM25.value as number[][];
  return [
    [0, 50, pmRanges[0]![0], pmRanges[0]![1]],
    [51, 100, pmRanges[1]![0], pmRanges[1]![1]],
    [101, 150, pmRanges[2]![0], pmRanges[2]![1]],
    [151, 200, pmRanges[3]![0], pmRanges[3]![1]],
    [201, 300, pmRanges[4]![0], pmRanges[4]![1]],
    [301, 500, pmRanges[5]![0], pmRanges[5]![1]],
  ];
}

export function deriveConcentrationFromAqi(aqi: number): number | null {
  if (aqi < 0 || !Number.isFinite(aqi)) {
    return null;
  }

  const breakpoints = getAqiBreakpoints();

  for (const [aqiLow, aqiHigh, cLow, cHigh] of breakpoints) {
    if (aqi >= aqiLow && aqi <= aqiHigh) {
      const concentration =
        ((aqi - aqiLow) / (aqiHigh - aqiLow)) * (cHigh - cLow) + cLow;
      return parseFloat(concentration.toFixed(1));
    }
  }

  // Beyond AQI 500, extrapolate using last segment's slope
  const [, , c300, c500] = breakpoints[5]!;
  const concentration = c500 + ((aqi - 500) / 100) * (c500 - c300);
  return parseFloat(concentration.toFixed(1));
}
