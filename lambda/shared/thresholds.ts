// Safety thresholds for heat & air quality exposure planning
// Every numeric constant lives here; all carry sourceStatus and source metadata
// NEVER hardcode thresholds elsewhere in the codebase

export type SourceStatus = 'VERIFIED' | 'UNSOURCED';

export interface Threshold {
  value: number | number[][] | [number, number[]][];
  sourceStatus: SourceStatus;
  sourceUrl: string | null;
  note: string;
}

// ============================================================================
// HEAT INDEX THRESHOLDS (°F)
// ============================================================================

export const HEAT_INDEX_CAUTION_F: Threshold = {
  value: 95,
  sourceStatus: 'UNSOURCED',
  sourceUrl: null,
  note: 'Mandatory monitoring threshold; triggers frequent breaks, shade, water intake monitoring',
};

export const HEAT_INDEX_SHADE_REQUIRED_F: Threshold = {
  value: 80,
  sourceStatus: 'UNSOURCED',
  sourceUrl: null,
  note: 'Shade/rest required; mentioned in CA §3395 and other state rules',
};

export const HEAT_INDEX_STOP_WORK_F: Threshold = {
  value: 105,
  sourceStatus: 'UNSOURCED',
  sourceUrl: null,
  note: 'Stop-work trigger for WA/OR; federal OSHA placeholder; CA rule may differ (TODO: UNSOURCED)',
};

// ============================================================================
// WBGT (PROXY: HEAT INDEX-BASED) THRESHOLDS
// ============================================================================
// WBGT true value requires specialized equipment (globe thermometer + wet-bulb).
// Work-rest thresholds in NIOSH tables reference WBGT; we use heat index as proxy.
// Error bounds unverified; briefing labels output as "Heat Index-Based Guidance."

export const WBGT_PROXY_METHOD: Threshold = {
  value: 0, // Placeholder; method is "use heat index directly"
  sourceStatus: 'UNSOURCED',
  sourceUrl: null,
  note: 'Method: heat index as WBGT proxy; error bounds ±5–15°F unverified',
};

// ============================================================================
// AIR QUALITY INDEX (AQI) — PM2.5 BREAKPOINTS (µg/m³)
// ============================================================================
// Breakpoints are computed from 24-hour average PM2.5 concentration.
// 2024 EPA NAAQS revision changed annual standard (12→9 µg/m³) but not 24-hour standard (35).
// AQI breakpoints remain unchanged from 2016 until EPA publishes updated AQI Technical Assistance Document.
// TODO: VERIFY against EPA AQI Technical Assistance Document for any 2024 update.

export const AQI_BREAKPOINTS_PM25: Threshold = {
  value: [
    [0, 12.0], // Good: 0.0–12.0 µg/m³ → AQI 0–50
    [12.1, 35.4], // Moderate: 12.1–35.4 µg/m³ → AQI 51–100
    [35.5, 55.4], // Unhealthy for Sensitive Groups: 35.5–55.4 µg/m³ → AQI 101–150
    [55.5, 150.4], // Unhealthy: 55.5–150.4 µg/m³ → AQI 151–200
    [150.5, 250.4], // Very Unhealthy: 150.5–250.4 µg/m³ → AQI 201–300
    [250.5, Infinity], // Hazardous: ≥250.5 µg/m³ → AQI 301+
  ],
  sourceStatus: 'UNSOURCED',
  sourceUrl: 'https://www.epa.gov/air-quality/air-quality-index-aqi',
  note: '2016 EPA standard; TODO: verify 2024 update to AQI Technical Assistance Document',
};

// ============================================================================
// AQI CATEGORY LABELS
// ============================================================================

export const AQI_CATEGORIES = [
  { min: 0, max: 50, label: 'Good' },
  { min: 51, max: 100, label: 'Moderate' },
  { min: 101, max: 150, label: 'Unhealthy for Sensitive Groups' },
  { min: 151, max: 200, label: 'Unhealthy' },
  { min: 201, max: 300, label: 'Very Unhealthy' },
  { min: 301, max: Infinity, label: 'Hazardous' },
];

// ============================================================================
// NIOSH WORK-REST RATIOS BY ACCLIMATIZATION STATE
// ============================================================================
// Work-rest cadence depends on:
//   - WBGT (we use heat index as proxy)
//   - Metabolic workload (light, moderate, heavy, very heavy)
//   - Acclimatization status (first 1–2 days vs. 2+ weeks in heat)
//
// Default: UNACCLIMATIZED (most injuries & fatalities occur in first 1–2 days)
// Acclimatized: use when supervisor confirms 2+ weeks heat exposure

// Metabolic workload levels (W/m²):
// Light: 100–150, Moderate: 150–200, Heavy: 200–260, Very Heavy: >260

export const WORK_REST_UNACCLIMATIZED: Threshold = {
  value: [
    // WBGT °C: [Light%, Moderate%, Heavy%, VeryHeavy%] work rates
    [28, [100, 100, 75, 50]],
    [29, [100, 100, 75, 50]],
    [30, [100, 50, 25, 0]], // 0 = STOP
    [31, [100, 50, 25, 0]],
    [32, [100, 50, 25, 0]],
    [33, [0, 0, 0, 0]], // STOP all work
  ],
  sourceStatus: 'UNSOURCED',
  sourceUrl: 'https://www.cdc.gov/niosh/topics/heatstress/',
  note: 'NIOSH REL: unacclimatized workers (first 1–2 days); work percentages by WBGT & metabolic rate',
};

export const WORK_REST_ACCLIMATIZED: Threshold = {
  value: [
    // WBGT °C: [Light%, Moderate%, Heavy%, VeryHeavy%] work rates
    [30, [100, 100, 75, 50]],
    [31, [100, 100, 75, 50]],
    [32, [100, 50, 25, 0]],
    [33, [100, 50, 25, 0]],
    [34, [100, 50, 25, 0]],
    [35, [0, 0, 0, 0]], // STOP all work
  ],
  sourceStatus: 'UNSOURCED',
  sourceUrl: 'https://www.cdc.gov/niosh/topics/heatstress/',
  note: 'NIOSH REL: acclimatized workers (2+ weeks in heat); work percentages by WBGT & metabolic rate',
};

// ============================================================================
// WATER INTAKE CADENCE (L/hour)
// ============================================================================

export const WATER_INTAKE_LIGHT_HEAT: Threshold = {
  value: 0.75,
  sourceStatus: 'UNSOURCED',
  sourceUrl: 'https://www.osha.gov/heat',
  note: 'Continuous work, 80–90°F: ~0.5–1.0 L/hr (7–10 oz every 15–20 min)',
};

export const WATER_INTAKE_MODERATE_HEAT: Threshold = {
  value: 1.0,
  sourceStatus: 'UNSOURCED',
  sourceUrl: 'https://www.osha.gov/heat',
  note: 'Heavy exertion, 90–100°F: ~0.75–1.25 L/hr (20 oz every 15 min)',
};

export const WATER_INTAKE_HIGH_HEAT: Threshold = {
  value: 1.25,
  sourceStatus: 'UNSOURCED',
  sourceUrl: 'https://www.osha.gov/heat',
  note: 'High heat, 100°F+: 1.0+ L/hr; monitor for hyponatremia (>2 L/hr sustained)',
};

// ============================================================================
// WASHINGTON STATE HEAT RULE (WAC 296-62-095)
// ============================================================================

export const WA_HEAT_RULE_IDENTIFIER: Threshold = {
  value: 0,
  sourceStatus: 'UNSOURCED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-62-095',
  note: 'Washington State L&I heat illness prevention rule; thresholds TODO: extract from regulation text',
};

export const WA_WILDFIRE_SMOKE_RULE_IDENTIFIER: Threshold = {
  value: 0,
  sourceStatus: 'UNSOURCED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-820',
  note: 'Washington State wildfire smoke exposure rule; AQI thresholds & actions TODO: extract from regulation text',
};

// ============================================================================
// JURISDICTION MAPPING
// ============================================================================

export const JURISDICTION_DEFAULT = 'federal-osha'; // No state match; use federal guidance
export const JURISDICTION_WASHINGTON = 'washington-state';

// ============================================================================
// COLLECT ALL UNSOURCED THRESHOLDS FOR BRIEFING
// ============================================================================

export function getUnverifiedThresholds(): string[] {
  const thresholds: Array<{ name: string; status: SourceStatus }> = [
    { name: 'HEAT_INDEX_CAUTION_F', status: HEAT_INDEX_CAUTION_F.sourceStatus },
    { name: 'HEAT_INDEX_SHADE_REQUIRED_F', status: HEAT_INDEX_SHADE_REQUIRED_F.sourceStatus },
    { name: 'HEAT_INDEX_STOP_WORK_F', status: HEAT_INDEX_STOP_WORK_F.sourceStatus },
    { name: 'WBGT_PROXY_METHOD', status: WBGT_PROXY_METHOD.sourceStatus },
    { name: 'AQI_BREAKPOINTS_PM25', status: AQI_BREAKPOINTS_PM25.sourceStatus },
    { name: 'WORK_REST_UNACCLIMATIZED', status: WORK_REST_UNACCLIMATIZED.sourceStatus },
    { name: 'WORK_REST_ACCLIMATIZED', status: WORK_REST_ACCLIMATIZED.sourceStatus },
    { name: 'WATER_INTAKE_LIGHT_HEAT', status: WATER_INTAKE_LIGHT_HEAT.sourceStatus },
    { name: 'WATER_INTAKE_MODERATE_HEAT', status: WATER_INTAKE_MODERATE_HEAT.sourceStatus },
    { name: 'WATER_INTAKE_HIGH_HEAT', status: WATER_INTAKE_HIGH_HEAT.sourceStatus },
    { name: 'WA_HEAT_RULE_IDENTIFIER', status: WA_HEAT_RULE_IDENTIFIER.sourceStatus },
    { name: 'WA_WILDFIRE_SMOKE_RULE_IDENTIFIER', status: WA_WILDFIRE_SMOKE_RULE_IDENTIFIER.sourceStatus },
  ];

  return thresholds.filter((t) => t.status === 'UNSOURCED').map((t) => t.name);
}
