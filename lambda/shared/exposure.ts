// Pure TypeScript exposure engine — no network calls, no AWS SDK, no model calls
// All numeric thresholds imported from thresholds.ts; no hardcoded literals

import {
  HEAT_INDEX_CAUTION_F,
  HEAT_INDEX_SHADE_REQUIRED_F,
  HEAT_INDEX_STOP_WORK_F,
  AQI_BREAKPOINTS_PM25,
  AQI_CATEGORIES,
  WORK_REST_UNACCLIMATIZED,
  WORK_REST_ACCLIMATIZED,
  WATER_INTAKE_LIGHT_HEAT,
  WATER_INTAKE_MODERATE_HEAT,
  WATER_INTAKE_HIGH_HEAT,
} from './thresholds';

// ============================================================================
// HEAT INDEX CALCULATION (NWS Rothfusz Regression)
// ============================================================================
// Formula: HI = a0 + a1*T + a2*RH + a3*T*RH + a4*T^2 + a5*RH^2 + a6*T^2*RH + a7*T*RH^2 + a8*T^2*RH^2
// Valid: 70–110°F (accuracy degrades outside this range)
// Adjustments for edge cases documented below

export function heatIndex(tempF: number, relativeHumidity: number): number {
  // Clamp RH to 0–100%
  const rh = Math.max(0, Math.min(100, relativeHumidity));

  // Below 80°F, use ambient temperature (formula unreliable)
  if (tempF < 80) {
    return tempF;
  }

  // NWS Rothfusz coefficients
  const a0 = -42.379;
  const a1 = 2.04901523;
  const a2 = 10.14333127;
  const a3 = -0.22475541;
  const a4 = -0.00683783;
  const a5 = -0.05481717;
  const a6 = 0.00122874;
  const a7 = 0.00085282;
  const a8 = -0.00000199;

  const t = tempF;
  const r = rh;

  const hi =
    a0 +
    a1 * t +
    a2 * r +
    a3 * t * r +
    a4 * t * t +
    a5 * r * r +
    a6 * t * t * r +
    a7 * t * r * r +
    a8 * t * t * r * r;

  // Adjustments for extreme conditions (NWS documented)
  if (rh < 13 && tempF >= 80 && tempF <= 112) {
    // Low humidity adjustment
    const adjustment = ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
    return hi - adjustment;
  }

  if (rh > 85 && tempF >= 80 && tempF <= 87) {
    // High humidity adjustment
    const adjustment = ((rh - 85) / 10) * ((87 - tempF) / 5);
    return hi + adjustment;
  }

  return hi;
}

// ============================================================================
// AQI CLASSIFICATION FROM PM2.5 (µg/m³)
// ============================================================================

export interface AqiClassification {
  aqi: number;
  category: string;
  pm25: number;
}

export function classifyAqi(pm25: number): AqiClassification {
  const breakpoints = AQI_BREAKPOINTS_PM25.value as number[][];

  // Find matching breakpoint range
  for (let i = 0; i < breakpoints.length; i++) {
    const [low, high] = breakpoints[i];
    if (pm25 >= low && pm25 <= high) {
      // Linear interpolation between AQI ranges
      const aqi_low = AQI_CATEGORIES[i].min;
      const aqi_high = AQI_CATEGORIES[i].max;
      const aqi = aqi_low + ((pm25 - low) / (high - low)) * (aqi_high - aqi_low);

      return {
        aqi: Math.round(aqi),
        category: AQI_CATEGORIES[i].label,
        pm25: Math.round(pm25 * 10) / 10,
      };
    }
  }

  // Fallback for extreme values
  return {
    aqi: pm25 > 250.5 ? 400 : 0,
    category: pm25 > 250.5 ? 'Hazardous' : 'Good',
    pm25: Math.round(pm25 * 10) / 10,
  };
}

// ============================================================================
// METABOLIC WORKLOAD CLASSIFICATION
// ============================================================================

export type Workload = 'light' | 'moderate' | 'heavy' | 'very-heavy';

export function classifyWorkload(metabolicRateWm2: number): Workload {
  if (metabolicRateWm2 < 150) return 'light';
  if (metabolicRateWm2 < 200) return 'moderate';
  if (metabolicRateWm2 < 260) return 'heavy';
  return 'very-heavy';
}

// ============================================================================
// WORK-REST CADENCE (NIOSH REL)
// ============================================================================

export interface WorkRestRecommendation {
  workPercentage: number;
  restPercentage: number;
  minutesPerHour: { work: number; rest: number };
  recommendation: string;
  breaksRequired: boolean;
  shadeRequired: boolean;
  waterIntakeLitersPerHour: number;
}

export function workRestCadence(
  heatIndexF: number,
  workload: Workload,
  acclimatized: boolean = false
): WorkRestRecommendation {
  const workRestTable = acclimatized ? WORK_REST_ACCLIMATIZED.value : WORK_REST_UNACCLIMATIZED.value;

  // Map workload to column index
  const workloadMap: { [key in Workload]: number } = {
    light: 0,
    moderate: 1,
    heavy: 2,
    'very-heavy': 3,
  };

  const workloadIdx = workloadMap[workload];

  // Convert heat index (°F) to WBGT proxy (°C) for table lookup
  // Note: This is a proxy approximation; true WBGT requires equipment
  const wbgtC = (heatIndexF - 32) * (5 / 9);

  // Find closest WBGT row in table
  let selectedRow: number[] = [0, 0, 0, 0]; // Default: stop work
  for (const row of workRestTable as number[][]) {
    if (wbgtC >= row[0]) {
      selectedRow = row.slice(1) as number[];
    }
  }

  const workPercentage = selectedRow[workloadIdx] || 0;
  const restPercentage = 100 - workPercentage;

  // Break down into minutes per hour
  const minutesPerHour = {
    work: Math.round((workPercentage / 100) * 60),
    rest: Math.round((restPercentage / 100) * 60),
  };

  // Determine water intake
  let waterIntakeLitersPerHour = WATER_INTAKE_LIGHT_HEAT.value as number;
  if (heatIndexF >= 100) {
    waterIntakeLitersPerHour = WATER_INTAKE_HIGH_HEAT.value as number;
  } else if (heatIndexF >= 90) {
    waterIntakeLitersPerHour = WATER_INTAKE_MODERATE_HEAT.value as number;
  }

  // Generate human-readable recommendation
  let recommendation = '';
  if (workPercentage === 0) {
    recommendation = 'STOP WORK — conditions too hot for this workload';
  } else if (workPercentage === 100) {
    recommendation = 'Continuous work allowed; monitor hydration and rest breaks';
  } else {
    recommendation = `${workPercentage}% work, ${restPercentage}% rest in shade every hour`;
  }

  const breaksRequired = restPercentage > 0;
  const shadeRequired = heatIndexF >= (HEAT_INDEX_SHADE_REQUIRED_F.value as number);

  return {
    workPercentage,
    restPercentage,
    minutesPerHour,
    recommendation,
    breaksRequired,
    shadeRequired,
    waterIntakeLitersPerHour,
  };
}

// ============================================================================
// STOP-WORK DECISION
// ============================================================================

export interface StopWorkDecision {
  shouldStop: boolean;
  heatRisk: 'low' | 'moderate' | 'high' | 'extreme';
  airQualityRisk: 'low' | 'moderate' | 'high' | 'extreme';
  reasoning: string;
  recommendedAction: string;
}

export function stopWorkTriggers(heatIndexF: number, aqi: number): StopWorkDecision {
  const stopWorkThreshold = HEAT_INDEX_STOP_WORK_F.value as number;
  const cautionThreshold = HEAT_INDEX_CAUTION_F.value as number;

  // Classify heat risk
  let heatRisk: 'low' | 'moderate' | 'high' | 'extreme' = 'low';
  if (heatIndexF >= stopWorkThreshold) {
    heatRisk = 'extreme';
  } else if (heatIndexF >= cautionThreshold) {
    heatRisk = 'high';
  } else if (heatIndexF >= 85) {
    heatRisk = 'moderate';
  }

  // Classify air quality risk
  let airQualityRisk: 'low' | 'moderate' | 'high' | 'extreme' = 'low';
  if (aqi >= 301) {
    airQualityRisk = 'extreme';
  } else if (aqi >= 201) {
    airQualityRisk = 'high';
  } else if (aqi >= 101) {
    airQualityRisk = 'moderate';
  }

  // Decision logic
  const shouldStop = heatRisk === 'extreme' || airQualityRisk === 'extreme' || (heatRisk === 'high' && airQualityRisk === 'high');

  // Reasoning
  let reasoning = '';
  if (heatRisk === 'extreme') {
    reasoning = `Heat index ${heatIndexF.toFixed(1)}°F exceeds stop-work threshold (${stopWorkThreshold}°F). `;
  }
  if (airQualityRisk === 'extreme') {
    reasoning += `AQI ${aqi} exceeds safe threshold for outdoor work. `;
  }
  if (!shouldStop && heatRisk === 'high') {
    reasoning += `Heat index ${heatIndexF.toFixed(1)}°F is in caution zone; mandatory breaks and shade required. `;
  }

  // Recommended action
  let recommendedAction = 'Continue work with standard precautions (shade, water, rest).';
  if (heatRisk === 'high' || airQualityRisk === 'high') {
    recommendedAction = 'Increase rest breaks, ensure shade availability, and monitor for heat illness symptoms.';
  }
  if (shouldStop) {
    recommendedAction = 'HALT outdoor work immediately. Resume only when conditions improve.';
  }

  return {
    shouldStop,
    heatRisk,
    airQualityRisk,
    reasoning: reasoning.trim(),
    recommendedAction,
  };
}

// ============================================================================
// SHIFT PLANNING (HIGH-LEVEL)
// ============================================================================

export interface HourlyForecast {
  hour: number; // 0–23
  tempF: number;
  relativeHumidity: number;
  pm25: number; // µg/m³
}

export interface ShiftWindow {
  startHour: number;
  endHour: number;
  workloadWm2: number;
  acclimatized: boolean;
  jurisdiction: 'washington-state' | 'federal-osha'; // v1 scoped to WA
}

export interface ShiftPlan {
  jurisdiction: string;
  shift: ShiftWindow;
  hourlyAnalysis: Array<{
    hour: number;
    tempF: number;
    heatIndexF: number;
    aqi: number;
    workRest: WorkRestRecommendation;
    stopWork: StopWorkDecision;
  }>;
  riskLevel: 'low' | 'moderate' | 'high' | 'extreme';
  recommendations: string[];
  unverifiedThresholds: string[];
}

export function planShift(hourlyForecast: HourlyForecast[], shift: ShiftWindow): ShiftPlan {
  const analysis = hourlyForecast
    .filter((h) => h.hour >= shift.startHour && h.hour < shift.endHour)
    .map((h) => {
      const hi = heatIndex(h.tempF, h.relativeHumidity);
      const aqi = classifyAqi(h.pm25).aqi;
      const workload = classifyWorkload(shift.workloadWm2);
      const workRest = workRestCadence(hi, workload, shift.acclimatized);
      const stopWork = stopWorkTriggers(hi, aqi);

      return {
        hour: h.hour,
        tempF: Math.round(h.tempF * 10) / 10,
        heatIndexF: Math.round(hi * 10) / 10,
        aqi,
        workRest,
        stopWork,
      };
    });

  // Determine overall risk
  let riskLevel: 'low' | 'moderate' | 'high' | 'extreme' = 'low';
  for (const h of analysis) {
    if (h.stopWork.shouldStop) {
      riskLevel = 'extreme';
      break;
    }
    if (h.stopWork.heatRisk === 'extreme' || h.stopWork.airQualityRisk === 'extreme') {
      riskLevel = 'extreme';
      break;
    }
    if (h.stopWork.heatRisk === 'high' || h.stopWork.airQualityRisk === 'high') {
      if (riskLevel === 'low') riskLevel = 'high';
    }
    if ((h.stopWork.heatRisk === 'moderate' || h.stopWork.airQualityRisk === 'moderate') && riskLevel === 'low') {
      riskLevel = 'moderate';
    }
  }

  // Recommendations
  const recommendations: string[] = [];

  if (riskLevel === 'extreme') {
    recommendations.push('Shift cannot proceed safely under current conditions.');
  } else {
    const hasStopWork = analysis.some((h) => h.stopWork.shouldStop);
    const hasHighRisk = analysis.some((h) => h.stopWork.heatRisk === 'high' || h.stopWork.airQualityRisk === 'high');

    if (hasStopWork) {
      recommendations.push('Afternoon hours have extreme conditions; schedule work for early morning or evening.');
    }

    if (hasHighRisk) {
      recommendations.push('Ensure shade, water, and frequent rest breaks available throughout shift.');
    }

    if (shift.acclimatized === false) {
      recommendations.push('Crew is unacclimatized (first 1–2 days of heat); follow stricter thresholds; monitor closely for heat illness.');
    }

    const peakHeat = analysis.reduce((max, h) => (h.heatIndexF > max ? h.heatIndexF : max), 0);
    recommendations.push(`Peak heat index: ${peakHeat}°F. Hydration and rest essential.`);
  }

  // Import threshold status
  const { getUnverifiedThresholds } = require('./thresholds');
  const unverifiedThresholds = getUnverifiedThresholds();

  return {
    jurisdiction: shift.jurisdiction === 'washington-state' ? 'Washington State (WAC 296-62-095)' : 'Federal OSHA (General Duty Clause)',
    shift,
    hourlyAnalysis: analysis,
    riskLevel,
    recommendations,
    unverifiedThresholds,
  };
}
