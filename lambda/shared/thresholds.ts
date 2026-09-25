// Safety thresholds for heat & air quality exposure planning
// Every numeric constant lives here; all carry sourceStatus and source metadata
// NEVER hardcode thresholds elsewhere in the codebase
//
// STRUCTURAL NOTE (v1): Washington State heat rule uses AMBIENT AIR TEMPERATURE,
// not heat index. All WA compliance logic is driven by tempF; heat index is
// advisory context only. NIOSH work-rest tables (WBGT-indexed) are removed
// from v1 as WBGT cannot be reliably estimated from NWS gridpoint API.

export type SourceStatus = 'VERIFIED' | 'UNSOURCED';

export interface Threshold {
  value: number | number[][] | [number, number[]][] | string;
  sourceStatus: SourceStatus;
  sourceUrl: string | null;
  note: string;
}

// ============================================================================
// WASHINGTON STATE HEAT RULE (WAC 296-62-095) — AMBIENT TEMPERATURE
// ============================================================================
// All thresholds are triggered by ambient air temperature, NOT heat index.
// Heat index is reported as advisory context only.

export const WA_ACTION_LEVEL_F: Threshold = {
  value: 80,
  sourceStatus: 'VERIFIED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-62-095',
  note: 'Action level for all other clothing; triggers mandatory shade, water, observation, cool-down breaks',
};

export const WA_NONBREATHING_CLOTHING_ACTION_LEVEL_F: Threshold = {
  value: 52,
  sourceStatus: 'VERIFIED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-62-095',
  note: 'Action level for employers using non-breathing clothing (vapor barriers); lower threshold',
};

export const WA_HIGH_HEAT_PROCEDURES_TRIGGER_F: Threshold = {
  value: 90,
  sourceStatus: 'VERIFIED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-62-095',
  note: 'Triggers high-heat procedures: mandatory cool-down breaks, frequent observation, medical monitoring',
};

export const WA_TABLE_2_COOLDOWN_CADENCE_90_99F: Threshold = {
  value: '10 min rest per 2 hours work',
  sourceStatus: 'VERIFIED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-62-095',
  note: 'Table 2: cool-down requirement at 90–99°F ambient; rest in shade with water access',
};

export const WA_TABLE_2_COOLDOWN_CADENCE_100F_PLUS: Threshold = {
  value: '15 min rest per 1 hour work',
  sourceStatus: 'VERIFIED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-62-095',
  note: 'Table 2: cool-down requirement at 100°F+ ambient; rest in shade with water access',
};

export const WA_CLOTHING_TABLE_1_MIDDLE_ROW_F: Threshold = {
  value: 80,
  sourceStatus: 'UNSOURCED',
  sourceUrl: null,
  note: 'Table 1 middle row (double-layer woven clothing): pre-2023 value was 77°F, current value unconfirmed. Using more protective 80°F as placeholder.',
};

export const WA_WATER_INTAKE_QUARTS_PER_HOUR: Threshold = {
  value: 1,
  sourceStatus: 'VERIFIED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-62-095',
  note: 'Minimum water intake: 1 quart per employee per hour when ambient ≥ action level',
};

export const WA_ACCLIMATIZATION_OBSERVATION_WINDOW_DAYS: Threshold = {
  value: 14,
  sourceStatus: 'VERIFIED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-62-095',
  note: 'Acclimatization period: employer must observe new/returning workers for 14 days in heat',
};

export const WA_INCIDENTAL_EXPOSURE_EXEMPTION_MINUTES: Threshold = {
  value: 15,
  sourceStatus: 'VERIFIED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-62-095',
  note: 'Exemption: exposure ≤15 min in any 60-min period does not trigger rule requirements',
};

// ============================================================================
// HEAT INDEX (ADVISORY CONTEXT ONLY — NOT USED FOR WA COMPLIANCE)
// ============================================================================
// Heat index is calculated and reported alongside ambient temperature for
// informational purposes. Washington's heat rule is driven by ambient tempF only.
// NIOSH work-rest tables (WBGT-indexed) are NOT INCLUDED in v1 — see
// constants-sources.md for rationale and future enhancement plans.

// ============================================================================
// EPA PM2.5 AQI BREAKPOINTS (24-hour average) — VERIFIED 2024
// ============================================================================
// Source: EPA Air Quality System code table (machine-readable authoritative source)
// Rule: Reconsideration of NAAQS for Particulate Matter (2024 revision, effective May 6, 2024)
// Changes in 2024: annual standard 12→9 µg/m³; AQI 0-50 breakpoint updated to 9.0;
// upper breakpoints revised: 150.4→125.4, 250.4→225.4, 500→325.4

export const AQI_BREAKPOINTS_PM25: Threshold = {
  value: [
    [0, 9.0], // Good: 0.0–9.0 µg/m³ → AQI 0–50 (revised 2024)
    [9.1, 35.4], // Moderate: 9.1–35.4 µg/m³ → AQI 51–100
    [35.5, 55.4], // Unhealthy for Sensitive Groups: 35.5–55.4 µg/m³ → AQI 101–150
    [55.5, 125.4], // Unhealthy: 55.5–125.4 µg/m³ → AQI 151–200 (revised 2024)
    [125.5, 225.4], // Very Unhealthy: 125.5–225.4 µg/m³ → AQI 201–300 (revised 2024)
    [225.5, 325.4], // Hazardous: 225.5–325.4 µg/m³ → AQI 301–500 (revised 2024)
    [325.5, Infinity], // Hazardous (beyond AQI): ≥325.5 µg/m³ → AQI 501+ (revised 2024)
  ],
  sourceStatus: 'VERIFIED',
  sourceUrl: 'https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.csv',
  note: 'EPA Air Quality System code table (authoritative). Federal Register: https://www.federalregister.gov/documents/2024/03/06/2024-02637/reconsideration-of-the-national-ambient-air-quality-standards-for-particulate-matter. Effective May 6, 2024.',
};

// ============================================================================
// AQI CATEGORY LABELS (2024 EPA, corresponds to breakpoints above)
// ============================================================================

export const AQI_CATEGORIES = [
  { min: 0, max: 50, label: 'Good', pm25High: 9.0 },
  { min: 51, max: 100, label: 'Moderate', pm25High: 35.4 },
  { min: 101, max: 150, label: 'Unhealthy for Sensitive Groups', pm25High: 55.4 },
  { min: 151, max: 200, label: 'Unhealthy', pm25High: 125.4 },
  { min: 201, max: 300, label: 'Very Unhealthy', pm25High: 225.4 },
  { min: 301, max: 500, label: 'Hazardous', pm25High: 325.4 },
  { min: 501, max: Infinity, label: 'Hazardous (Beyond AQI)', pm25High: Infinity },
];

// ============================================================================
// NOTE: NIOSH WORK-REST TABLES REMOVED FROM V1
// ============================================================================
// NIOSH tables are indexed to WBGT (Wet-Bulb Globe Temperature), which requires
// specialized equipment (globe thermometer + wet-bulb thermometer). WBGT cannot
// be reliably estimated from the NWS gridpoint forecast API (which provides
// temperature, RH, and pressure only). Heat index is not a valid substitute for
// WBGT in work-rest decisions.
//
// Washington's heat rule uses ambient temperature and Table 2 cool-down cadence
// (see WA_TABLE_2_* constants above), which are fully verifiable and computable.
//
// FUTURE ENHANCEMENT: Integrate NIOSH work-rest logic in v2 if WBGT data source
// or validated WBGT estimation method (e.g., solar irradiance API) becomes available.

// ============================================================================
// WASHINGTON STATE WILDFIRE SMOKE EXPOSURE (WAC 296-820)
// ============================================================================
// Ambient PM2.5 µg/m³ thresholds trigger specific employer actions.
// Note: The rule defines both PM2.5 and NowCast AQI thresholds; use PM2.5
// (more stable across time than AQI, which changed with 2024 EPA revision).

export const WA_SMOKE_TRAINING_RESPONSE_THRESHOLD: Threshold = {
  value: 20.5,
  sourceStatus: 'VERIFIED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-820',
  note: 'PM2.5 ≥20.5 µg/m³ (outdoor): employer must provide training, have response plan, and offer voluntary N95s on request',
};

export const WA_SMOKE_MANDATORY_N95_THRESHOLD: Threshold = {
  value: 35.5,
  sourceStatus: 'VERIFIED',
  sourceUrl: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-820',
  note: 'PM2.5 ≥35.5 µg/m³ (outdoor): employer MUST provide N95 respirators at no cost and encourage their use',
};

export const WA_SMOKE_HIGH_RISK_THRESHOLD: Threshold = {
  value: 250.5,
  sourceStatus: 'UNSOURCED',
  sourceUrl: null,
  note: 'PM2.5 ≥250.5 µg/m³ (outdoor): specific employer requirements not yet read from primary source. TODO: extract from WAC 296-820.',
};

// ============================================================================
// JURISDICTION CONTEXT (v1: Washington State only)
// ============================================================================

export const JURISDICTION_DEFAULT = 'federal-osha'; // No state match; use federal OSHA general duty clause
export const JURISDICTION_WASHINGTON = 'washington-state'; // WAC 296-62-095 (heat) + WAC 296-820 (smoke)

// ============================================================================
// COLLECT ALL UNSOURCED THRESHOLDS FOR BRIEFING
// ============================================================================

export function getUnverifiedThresholds(): string[] {
  const thresholds: Array<{ name: string; status: SourceStatus }> = [
    { name: 'WA_CLOTHING_TABLE_1_MIDDLE_ROW_F', status: WA_CLOTHING_TABLE_1_MIDDLE_ROW_F.sourceStatus },
    { name: 'WA_SMOKE_HIGH_RISK_THRESHOLD', status: WA_SMOKE_HIGH_RISK_THRESHOLD.sourceStatus },
  ];

  return thresholds.filter((t) => t.status === 'UNSOURCED').map((t) => t.name);
}
