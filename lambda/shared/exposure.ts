// Pure TypeScript exposure engine — no network calls, no AWS SDK, no model calls
//
// STRUCTURAL NOTE: Washington State heat rule (WAC 296-62-095) is driven by
// AMBIENT AIR TEMPERATURE, not heat index. All WA compliance decisions use
// tempF directly. Heat index is calculated and reported as advisory context only.
//
// NIOSH work-rest tables (based on WBGT) are NOT included in v1. True WBGT
// requires specialized equipment (globe thermometer + wet-bulb thermometer).
// WBGT cannot be reliably estimated from NWS gridpoint API (which provides
// temperature, relative humidity, pressure). Attempting to use heat index as
// a WBGT substitute would produce misleading safety decisions. Future enhancement:
// integrate NIOSH logic if WBGT data source or validated estimation method becomes available.
// See constants-sources.md for full rationale.

import {
  WA_ACTION_LEVEL_F,
  WA_NONBREATHING_CLOTHING_ACTION_LEVEL_F,
  WA_HIGH_HEAT_PROCEDURES_TRIGGER_F,
  WA_TABLE_2_COOLDOWN_CADENCE_90_99F,
  WA_TABLE_2_COOLDOWN_CADENCE_100F_PLUS,
  WA_WATER_INTAKE_QUARTS_PER_HOUR,
  WA_ACCLIMATIZATION_OBSERVATION_WINDOW_DAYS,
  WA_INCIDENTAL_EXPOSURE_EXEMPTION_MINUTES,
  WA_SMOKE_TRAINING_RESPONSE_THRESHOLD,
  WA_SMOKE_MANDATORY_N95_THRESHOLD,
  WA_SMOKE_HIGH_RISK_THRESHOLD,
  AQI_BREAKPOINTS_PM25,
  AQI_CATEGORIES,
  getUnverifiedThresholds,
  JURISDICTION_WASHINGTON,
  JURISDICTION_DEFAULT,
} from './thresholds';

// ============================================================================
// HEAT INDEX CALCULATION (NWS Rothfusz Regression) — ADVISORY ONLY
// ============================================================================

export function heatIndex(tempF: number, relativeHumidity: number): number {
  const rh = Math.max(0, Math.min(100, relativeHumidity));

  if (tempF < 80) {
    return tempF;
  }

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

  // Low humidity adjustment
  if (rh < 13 && tempF >= 80 && tempF <= 112) {
    const adjustment = ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
    return hi - adjustment;
  }

  // High humidity adjustment
  if (rh > 85 && tempF >= 80 && tempF <= 87) {
    const adjustment = ((rh - 85) / 10) * ((87 - tempF) / 5);
    return hi + adjustment;
  }

  return hi;
}

// ============================================================================
// AQI CLASSIFICATION FROM PM2.5 (µg/m³) — VERIFIED 2024 EPA BREAKPOINTS
// ============================================================================

export interface AqiClassification {
  pm25: number;
  aqi: number;
  category: string;
}

export function classifyAqi(pm25: number): AqiClassification {
  const breakpoints = AQI_BREAKPOINTS_PM25.value as number[][];

  for (let i = 0; i < breakpoints.length; i++) {
    const [low, high] = breakpoints[i];
    if (pm25 >= low && (high === Infinity || pm25 <= high)) {
      const aqi_low = AQI_CATEGORIES[i].min;
      const aqi_high = AQI_CATEGORIES[i].max;

      let aqi: number;
      if (high === Infinity) {
        // Beyond AQI: scale based on 100 µg/m³ intervals above 325.5
        aqi = aqi_low + (pm25 - low) / 100;
      } else {
        aqi = aqi_low + ((pm25 - low) / (high - low)) * (aqi_high - aqi_low);
      }

      return {
        pm25: Math.round(pm25 * 10) / 10,
        aqi: Math.round(aqi),
        category: AQI_CATEGORIES[i].label,
      };
    }
  }

  return {
    pm25: Math.round(pm25 * 10) / 10,
    aqi: 0,
    category: 'Good',
  };
}

// ============================================================================
// WASHINGTON STATE COOL-DOWN CADENCE (WA TABLE 2)
// ============================================================================
// Driven by ambient temperature; no action required below 90°F.

export interface CoolDownCadence {
  tempF: number;
  coolDownRequired: boolean;
  cadence: string | null;
  minutesPerHour: number | null;
  requiresShade: boolean;
  requiresWater: boolean;
  source: string;
}

export function coolDownCadence(tempF: number): CoolDownCadence {
  const actionLevel = (WA_ACTION_LEVEL_F.value as number);
  const highHeatTrigger = (WA_HIGH_HEAT_PROCEDURES_TRIGGER_F.value as number);

  if (tempF < actionLevel) {
    return {
      tempF,
      coolDownRequired: false,
      cadence: null,
      minutesPerHour: null,
      requiresShade: false,
      requiresWater: false,
      source: 'WA WAC 296-62-095 (below action level)',
    };
  }

  if (tempF >= actionLevel && tempF < highHeatTrigger) {
    // 80–89°F: action level but below high-heat procedures
    return {
      tempF,
      coolDownRequired: true,
      cadence: 'Preventative cool-down on request; mandatory observation',
      minutesPerHour: null,
      requiresShade: true,
      requiresWater: true,
      source: 'WA WAC 296-62-095 (action level)',
    };
  }

  if (tempF >= highHeatTrigger && tempF < 100) {
    // 90–99°F: Table 2 cadence
    const cadence = WA_TABLE_2_COOLDOWN_CADENCE_90_99F.value as string;
    return {
      tempF,
      coolDownRequired: true,
      cadence,
      minutesPerHour: 10, // 10 min rest per 2 hours = 5 min per hour
      requiresShade: true,
      requiresWater: true,
      source: 'WA WAC 296-62-095 Table 2 (90–99°F)',
    };
  }

  // 100°F+: Table 2 high-heat cadence
  const cadence = WA_TABLE_2_COOLDOWN_CADENCE_100F_PLUS.value as string;
  return {
    tempF,
    coolDownRequired: true,
    cadence,
    minutesPerHour: 15, // 15 min rest per 1 hour
    requiresShade: true,
    requiresWater: true,
    source: 'WA WAC 296-62-095 Table 2 (100°F+)',
  };
}

// ============================================================================
// WASHINGTON STATE SMOKE EXPOSURE REQUIREMENTS (WAC 296-820)
// ============================================================================
// Keyed to PM2.5 µg/m³ (not AQI, which changed with 2024 EPA revision).

export interface SmokeRequirements {
  pm25: number;
  category: 'low' | 'training' | 'mandatory-ppe' | 'high-risk';
  trainingRequired: boolean;
  responsePlanRequired: boolean;
  voluntaryN95Available: boolean;
  mandatoryN95Provided: boolean;
  additionalActions: string | null;
  source: string;
  sourceStatus: 'VERIFIED' | 'UNSOURCED';
}

export function smokeRequirements(pm25: number): SmokeRequirements {
  const trainingThreshold = (WA_SMOKE_TRAINING_RESPONSE_THRESHOLD.value as number);
  const mandatoryN95Threshold = (WA_SMOKE_MANDATORY_N95_THRESHOLD.value as number);
  const highRiskThreshold = (WA_SMOKE_HIGH_RISK_THRESHOLD.value as number);

  if (pm25 < trainingThreshold) {
    return {
      pm25,
      category: 'low',
      trainingRequired: false,
      responsePlanRequired: false,
      voluntaryN95Available: false,
      mandatoryN95Provided: false,
      additionalActions: null,
      source: 'WA WAC 296-820 (outdoor PM2.5 < 20.5 µg/m³)',
      sourceStatus: 'VERIFIED',
    };
  }

  if (pm25 >= trainingThreshold && pm25 < mandatoryN95Threshold) {
    return {
      pm25,
      category: 'training',
      trainingRequired: true,
      responsePlanRequired: true,
      voluntaryN95Available: true,
      mandatoryN95Provided: false,
      additionalActions: 'REGULATORY: Employer must provide training and response plan; N95s available on employee request (voluntary)',
      source: 'WA WAC 296-820 (outdoor PM2.5 20.5–35.4 µg/m³)',
      sourceStatus: 'VERIFIED',
    };
  }

  if (pm25 >= mandatoryN95Threshold && pm25 < highRiskThreshold) {
    return {
      pm25,
      category: 'mandatory-ppe',
      trainingRequired: true,
      responsePlanRequired: true,
      voluntaryN95Available: true,
      mandatoryN95Provided: true,
      additionalActions: 'REGULATORY: Employer MUST provide NIOSH-approved N95 respirators at no cost and encourage use',
      source: 'WA WAC 296-820 (outdoor PM2.5 35.5–250.4 µg/m³)',
      sourceStatus: 'VERIFIED',
    };
  }

  // pm25 >= 250.5: high-risk, requirements unconfirmed
  return {
    pm25,
    category: 'high-risk',
    trainingRequired: true,
    responsePlanRequired: true,
    voluntaryN95Available: true,
    mandatoryN95Provided: true,
    additionalActions: 'SHIFTGUARD RECOMMENDATION (UNSOURCED): Conditions extremely hazardous; strongly consider work stoppage or evacuation. Specific regulatory requirements above PM2.5 250.5 µg/m³ not yet verified.',
    source: 'WA WAC 296-820 (outdoor PM2.5 ≥250.5 µg/m³) — UNSOURCED',
    sourceStatus: 'UNSOURCED',
  };
}

// ============================================================================
// SHIFT PLANNING
// ============================================================================

export interface HourlyForecast {
  hour: number;
  tempF: number;
  relativeHumidity: number;
  pm25: number;
}

export interface ShiftWindow {
  startHour: number;
  endHour: number;
  jurisdiction: 'washington-state' | 'federal-osha';
  isNewOrReturningWorker: boolean;
}

export interface HourlyAnalysis {
  hour: number;
  tempF: number;
  heatIndexF: number;
  pm25: number;
  aqi: AqiClassification;
  coolDown: CoolDownCadence;
  smoke: SmokeRequirements;
}

export interface ShiftPlan {
  jurisdiction: string;
  shift: ShiftWindow;
  hourlyAnalysis: HourlyAnalysis[];
  regulatoryRequirements: string[];
  shiftGuardRecommendations: string[];
  unverifiedThresholds: string[];
}

export function planShift(hourlyForecast: HourlyForecast[], shift: ShiftWindow): ShiftPlan {
  const analysis = hourlyForecast
    .filter((h) => h.hour >= shift.startHour && h.hour < shift.endHour)
    .map((h) => ({
      hour: h.hour,
      tempF: Math.round(h.tempF * 10) / 10,
      heatIndexF: Math.round(heatIndex(h.tempF, h.relativeHumidity) * 10) / 10,
      pm25: Math.round(h.pm25 * 10) / 10,
      aqi: classifyAqi(h.pm25),
      coolDown: coolDownCadence(h.tempF),
      smoke: smokeRequirements(h.pm25),
    }));

  // Always-applicable regulatory requirements
  const regulatoryRequirements: string[] = [];

  if (shift.jurisdiction === JURISDICTION_WASHINGTON) {
    regulatoryRequirements.push('REGULATORY: Ambient temperature below 80°F: no heat rule triggers.');
    regulatoryRequirements.push('REGULATORY: At 80°F+: employer must provide shade, drinking water, opportunity for rest.');
    regulatoryRequirements.push('REGULATORY: Water intake: minimum 1 quart per employee per hour when ambient ≥80°F.');

    if (shift.isNewOrReturningWorker) {
      regulatoryRequirements.push('REGULATORY: New or returning worker in heat: mandatory observation for 14 consecutive days of heat exposure (acclimatization period).');
    }

    const incidentalExemption = (WA_INCIDENTAL_EXPOSURE_EXEMPTION_MINUTES.value as number);
    regulatoryRequirements.push(`REGULATORY: Incidental exposure exemption: if heat exposure ≤${incidentalExemption} minutes in any 60-minute period, rule does not apply.`);

    // Add smoke requirements if relevant
    const hasSmoke = analysis.some((h) => h.pm25 >= 20.5);
    if (hasSmoke) {
      regulatoryRequirements.push('REGULATORY: Wildfire smoke (PM2.5 ≥20.5 µg/m³): employer must have training, response plan, and provide N95s as required by tier.');
    }
  } else {
    regulatoryRequirements.push('Federal OSHA General Duty Clause applies. No state-specific rule matched.');
  }

  // ShiftGuard recommendations (always clearly labeled)
  const shiftGuardRecommendations: string[] = [];

  const peakTemp = analysis.reduce((max, h) => (h.tempF > max ? h.tempF : max), 0);
  if (peakTemp >= 90) {
    shiftGuardRecommendations.push(`SHIFTGUARD RECOMMENDATION: Peak ambient temperature ${peakTemp}°F. Monitor workers frequently for heat illness symptoms. Ensure first-aid responders are on-site.`);
  }

  const peakPm25 = analysis.reduce((max, h) => (h.pm25 > max ? h.pm25 : max), 0);
  if (peakPm25 >= 35.5) {
    shiftGuardRecommendations.push(`SHIFTGUARD RECOMMENDATION: Peak PM2.5 ${peakPm25} µg/m³ (AQI ${analysis.find((h) => h.pm25 === peakPm25)?.aqi.aqi}). If outdoors during peak smoke, consider shorter shifts or evacuation to cleaner air.`);
  }

  shiftGuardRecommendations.push('SHIFTGUARD RECOMMENDATION: Heat index and smoke are reported for context. Primary decision-making uses ambient temperature (WA rule) and PM2.5 µg/m³ (smoke rule).');

  return {
    jurisdiction: shift.jurisdiction === JURISDICTION_WASHINGTON ? 'Washington State (WAC 296-62-095 heat, WAC 296-820 smoke)' : 'Federal OSHA',
    shift,
    hourlyAnalysis: analysis,
    regulatoryRequirements,
    shiftGuardRecommendations,
    unverifiedThresholds: getUnverifiedThresholds(),
  };
}
