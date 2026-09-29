import { describe, it, expect } from 'vitest';
import { deriveConcentrationFromAqi } from './aqi-inversion';

describe('AQI Piecewise Linear Inversion (Production Function)', () => {
  it('AQI 50 (Good upper bound) -> 9.0 µg/m³', () => {
    expect(deriveConcentrationFromAqi(50)).toBe(9.0);
  });

  it('AQI 100 (Moderate upper bound) -> 35.4 µg/m³', () => {
    expect(deriveConcentrationFromAqi(100)).toBe(35.4);
  });

  it('AQI 150 (Unhealthy for Sensitive Groups upper bound) -> 55.4 µg/m³', () => {
    expect(deriveConcentrationFromAqi(150)).toBe(55.4);
  });

  it('AQI 200 (Unhealthy upper bound) -> 125.4 µg/m³', () => {
    expect(deriveConcentrationFromAqi(200)).toBe(125.4);
  });

  it('AQI 72 (near WA training threshold) -> 20.4 µg/m³', () => {
    const result = deriveConcentrationFromAqi(72);
    expect(result).toBeCloseTo(20.4, 1);
  });

  it('AQI 44 (Seattle current observation) -> 7.9 µg/m³', () => {
    const result = deriveConcentrationFromAqi(44);
    expect(result).toBeCloseTo(7.9, 1);
  });
});
