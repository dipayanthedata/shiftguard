import { describe, it, expect } from 'vitest';
import {
  heatIndex,
  classifyAqi,
  coolDownCadence,
  smokeRequirements,
  planShift,
} from './exposure';

// ============================================================================
// HEAT INDEX TESTS
// ============================================================================

describe('heatIndex()', () => {
  it('returns ambient temp for temps below 80°F', () => {
    expect(heatIndex(70, 50)).toBe(70);
    expect(heatIndex(75, 80)).toBe(75);
  });

  it('calculates heat index for normal conditions', () => {
    const hi = heatIndex(95, 50);
    expect(hi).toBeGreaterThan(95);
    expect(hi).toBeGreaterThan(100); // Heat index > ambient at 95°F, 50% RH
  });

  it('increases with higher humidity', () => {
    const hi50 = heatIndex(95, 50);
    const hi80 = heatIndex(95, 80);
    expect(hi80).toBeGreaterThan(hi50);
  });

  it('clamps RH to 0-100%', () => {
    const hiNeg = heatIndex(90, -10);
    const hi0 = heatIndex(90, 0);
    expect(hiNeg).toBe(hi0);

    const hi150 = heatIndex(90, 150);
    const hi100 = heatIndex(90, 100);
    expect(hi150).toBe(hi100);
  });

  it('applies low-humidity adjustment', () => {
    const hiNoAdj = 100; // Approximate
    const hiLowHum = heatIndex(95, 10);
    expect(hiLowHum).toBeLessThan(100);
  });

  it('applies high-humidity adjustment', () => {
    const hiHighHum = heatIndex(85, 90);
    const hiMidHum = heatIndex(85, 70);
    expect(hiHighHum).toBeGreaterThan(hiMidHum);
  });
});

// ============================================================================
// AQI CLASSIFICATION TESTS
// ============================================================================

describe('classifyAqi()', () => {
  it('classifies Good (0-9.0 µg/m³)', () => {
    const result = classifyAqi(5);
    expect(result.aqi).toBeLessThanOrEqual(50);
    expect(result.category).toBe('Good');
    expect(result.pm25).toBe(5);
  });

  it('classifies Moderate (9.1-35.4 µg/m³)', () => {
    const result = classifyAqi(20);
    expect(result.aqi).toBeGreaterThanOrEqual(51);
    expect(result.aqi).toBeLessThanOrEqual(100);
    expect(result.category).toBe('Moderate');
  });

  it('classifies Unhealthy for Sensitive Groups (35.5-55.4 µg/m³)', () => {
    const result = classifyAqi(45);
    expect(result.aqi).toBeGreaterThanOrEqual(101);
    expect(result.aqi).toBeLessThanOrEqual(150);
    expect(result.category).toBe('Unhealthy for Sensitive Groups');
  });

  it('classifies Unhealthy (55.5-125.4 µg/m³) — 2024 revised breakpoint', () => {
    const result = classifyAqi(90);
    expect(result.aqi).toBeGreaterThanOrEqual(151);
    expect(result.aqi).toBeLessThanOrEqual(200);
    expect(result.category).toBe('Unhealthy');
  });

  it('classifies Very Unhealthy (125.5-225.4 µg/m³) — 2024 revised', () => {
    const result = classifyAqi(175);
    expect(result.aqi).toBeGreaterThanOrEqual(201);
    expect(result.aqi).toBeLessThanOrEqual(300);
    expect(result.category).toBe('Very Unhealthy');
  });

  it('classifies Hazardous (225.5-325.4 µg/m³) — 2024 revised', () => {
    const result = classifyAqi(300);
    expect(result.aqi).toBeGreaterThanOrEqual(301);
    expect(result.aqi).toBeLessThanOrEqual(500);
    expect(result.category).toBe('Hazardous');
  });

  it('classifies beyond-AQI (≥325.5 µg/m³)', () => {
    const result = classifyAqi(400);
    expect(result.aqi).toBeGreaterThan(500);
    expect(result.category).toBe('Hazardous (Beyond AQI)');
  });

  it('interpolates AQI within category range', () => {
    const lo = classifyAqi(10);
    const mid = classifyAqi(20);
    const hi = classifyAqi(35);
    expect(lo.aqi).toBeLessThan(mid.aqi);
    expect(mid.aqi).toBeLessThan(hi.aqi);
  });
});

// ============================================================================
// COOL-DOWN CADENCE TESTS (WA TABLE 2)
// ============================================================================

describe('coolDownCadence()', () => {
  it('requires no action below 80°F action level', () => {
    const result = coolDownCadence(75);
    expect(result.coolDownRequired).toBe(false);
    expect(result.cadence).toBeNull();
    expect(result.minutesPerHour).toBeNull();
  });

  it('requires action at 80°F (action level)', () => {
    const result = coolDownCadence(80);
    expect(result.coolDownRequired).toBe(true);
    expect(result.requiresShade).toBe(true);
    expect(result.requiresWater).toBe(true);
  });

  it('requires preventative cool-down at 85°F (below high-heat trigger)', () => {
    const result = coolDownCadence(85);
    expect(result.coolDownRequired).toBe(true);
    expect(result.cadence).toContain('Preventative');
    expect(result.minutesPerHour).toBeNull();
  });

  it('applies Table 2 cadence at 90–99°F (10 min per 2 hours)', () => {
    const result = coolDownCadence(95);
    expect(result.coolDownRequired).toBe(true);
    expect(result.cadence).toContain('10 min');
    expect(result.minutesPerHour).toBe(10);
  });

  it('applies Table 2 cadence at 100°F+ (15 min per 1 hour)', () => {
    const result = coolDownCadence(105);
    expect(result.coolDownRequired).toBe(true);
    expect(result.cadence).toContain('15 min');
    expect(result.minutesPerHour).toBe(15);
  });

  it('requires shade and water at all action levels', () => {
    const temps = [80, 85, 95, 105];
    for (const t of temps) {
      const result = coolDownCadence(t);
      expect(result.requiresShade).toBe(true);
      expect(result.requiresWater).toBe(true);
    }
  });
});

// ============================================================================
// SMOKE REQUIREMENTS TESTS (WA 296-820)
// ============================================================================

describe('smokeRequirements()', () => {
  it('requires no action below 20.5 µg/m³', () => {
    const result = smokeRequirements(15);
    expect(result.category).toBe('low');
    expect(result.trainingRequired).toBe(false);
    expect(result.responsePlanRequired).toBe(false);
    expect(result.voluntaryN95Available).toBe(false);
  });

  it('requires training at 20.5 µg/m³ (threshold)', () => {
    const result = smokeRequirements(20.5);
    expect(result.category).toBe('training');
    expect(result.trainingRequired).toBe(true);
    expect(result.responsePlanRequired).toBe(true);
    expect(result.voluntaryN95Available).toBe(true);
    expect(result.mandatoryN95Provided).toBe(false);
  });

  it('requires training at 30 µg/m³ (below mandatory N95)', () => {
    const result = smokeRequirements(30);
    expect(result.category).toBe('training');
    expect(result.trainingRequired).toBe(true);
    expect(result.mandatoryN95Provided).toBe(false);
  });

  it('mandates N95 at 35.5 µg/m³ (threshold)', () => {
    const result = smokeRequirements(35.5);
    expect(result.category).toBe('mandatory-ppe');
    expect(result.mandatoryN95Provided).toBe(true);
    expect(result.additionalActions).toContain('MUST provide');
  });

  it('mandates N95 at 100 µg/m³', () => {
    const result = smokeRequirements(100);
    expect(result.category).toBe('mandatory-ppe');
    expect(result.mandatoryN95Provided).toBe(true);
  });

  it('marks high-risk at 250.5 µg/m³+ and flags UNSOURCED', () => {
    const result = smokeRequirements(300);
    expect(result.category).toBe('high-risk');
    expect(result.sourceStatus).toBe('UNSOURCED');
    expect(result.additionalActions).toContain('UNSOURCED');
  });
});

// ============================================================================
// SHIFT PLANNING TESTS
// ============================================================================

describe('planShift()', () => {
  it('produces hourly analysis for each hour in shift window', () => {
    const forecast = [
      { hour: 8, tempF: 75, relativeHumidity: 50, pm25: 10 },
      { hour: 9, tempF: 85, relativeHumidity: 55, pm25: 20 },
      { hour: 10, tempF: 95, relativeHumidity: 60, pm25: 30 },
    ];

    const shift = {
      startHour: 8,
      endHour: 11,
      jurisdiction: 'washington-state' as const,
      isNewOrReturningWorker: false,
    };

    const plan = planShift(forecast, shift);
    expect(plan.hourlyAnalysis).toHaveLength(3);
  });

  it('includes WA-specific regulatory requirements', () => {
    const forecast = [{ hour: 10, tempF: 85, relativeHumidity: 50, pm25: 10 }];
    const shift = {
      startHour: 10,
      endHour: 11,
      jurisdiction: 'washington-state' as const,
      isNewOrReturningWorker: false,
    };

    const plan = planShift(forecast, shift);
    expect(plan.regulatoryRequirements.some((r) => r.includes('1 quart'))).toBe(true);
    expect(plan.regulatoryRequirements.some((r) => r.includes('shade'))).toBe(true);
  });

  it('flags new/returning worker acclimatization requirement', () => {
    const forecast = [{ hour: 10, tempF: 85, relativeHumidity: 50, pm25: 10 }];
    const shift = {
      startHour: 10,
      endHour: 11,
      jurisdiction: 'washington-state' as const,
      isNewOrReturningWorker: true,
    };

    const plan = planShift(forecast, shift);
    expect(plan.regulatoryRequirements.some((r) => r.includes('14'))).toBe(true);
  });

  it('includes unverified thresholds in output', () => {
    const forecast = [{ hour: 10, tempF: 85, relativeHumidity: 50, pm25: 10 }];
    const shift = {
      startHour: 10,
      endHour: 11,
      jurisdiction: 'washington-state' as const,
      isNewOrReturningWorker: false,
    };

    const plan = planShift(forecast, shift);
    expect(plan.unverifiedThresholds).toHaveLength(2);
    expect(plan.unverifiedThresholds).toContain('WA_CLOTHING_TABLE_1_MIDDLE_ROW_F');
    expect(plan.unverifiedThresholds).toContain('WA_SMOKE_HIGH_RISK_THRESHOLD');
  });

  it('distinguishes REGULATORY from SHIFTGUARD RECOMMENDATION in output', () => {
    const forecast = [{ hour: 10, tempF: 95, relativeHumidity: 50, pm25: 10 }];
    const shift = {
      startHour: 10,
      endHour: 11,
      jurisdiction: 'washington-state' as const,
      isNewOrReturningWorker: false,
    };

    const plan = planShift(forecast, shift);
    const hasRegulatory = plan.regulatoryRequirements.some((r) => r.includes('REGULATORY'));
    const hasRecommendation = plan.shiftGuardRecommendations.some((r) => r.includes('SHIFTGUARD'));
    expect(hasRegulatory).toBe(true);
    expect(hasRecommendation).toBe(true);
  });

  it('reports peak heat and smoke conditions', () => {
    const forecast = [
      { hour: 8, tempF: 80, relativeHumidity: 50, pm25: 10 },
      { hour: 9, tempF: 105, relativeHumidity: 60, pm25: 50 },
    ];

    const shift = {
      startHour: 8,
      endHour: 10,
      jurisdiction: 'washington-state' as const,
      isNewOrReturningWorker: false,
    };

    const plan = planShift(forecast, shift);
    expect(plan.shiftGuardRecommendations.some((r) => r.includes('105'))).toBe(true);
    expect(plan.shiftGuardRecommendations.some((r) => r.includes('50'))).toBe(true);
  });
});
