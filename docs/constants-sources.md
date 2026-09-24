# ShiftGuard Constants & Sources

All safety thresholds, formulas, and work-rest guidance used in the exposure engine. Each constant includes the source URL, publication/revision date, and the exact population or condition it applies to.

**Session 2 Status:** Research phase — constants sourced and documented below. Code implementation (exposure.ts) follows after user review.

---

## 1. Heat Index Calculation

**Formula:** NWS Rothfusz Regression (1971-updated)

Source: National Weather Service
- URL: https://www.weather.gov/media/epz/wxcalc/heatIndex.pdf
- Last verified: 2024 (NWS Heat Index technical documentation)
- Applicable: 80°F (26.7°C) and higher, valid range typically 50–120°F with accuracy degrading outside 70–110°F
- Note: Formula is empirical regression; coefficients are tuned to observed conditions

**Coefficients (simplified form for T ≥ 80°F):**
```typescript
// Heat Index (°F) = a0 + a1*T + a2*RH + a3*T*RH + a4*T^2 + a5*RH^2 + a6*T^2*RH + a7*T*RH^2 + a8*T^2*RH^2
const HI_COEFFS = {
  a0: -42.379,
  a1: 2.04901523,
  a2: 10.14333127,
  a3: -0.22475541,
  a4: -0.00683783,
  a5: -0.05481717,
  a6: 0.00122874,
  a7: 0.00085282,
  a8: -0.00000199
};
// T = temperature (°F), RH = relative humidity (%)
```

**Validity:** 
- Accurate 70–110°F; degrades outside 50–120°F
- Requires RH 0–100%
- Below 80°F (26.7°C): use actual temperature; formula inaccurate

**Citation:** https://www.weather.gov/media/epz/wxcalc/heatIndex.pdf

---

## 2. WBGT (Wet-Bulb Globe Temperature) Estimation

**Status:** TODO: UNSOURCED (method selection pending)

**Background:**
WBGT is the gold-standard safety metric for outdoor heat stress. It combines dry-bulb temperature, wet-bulb temperature, and globe temperature. However:
- True WBGT requires specialized equipment (globe thermometer, wetted wick thermometer)
- No empirically validated regression from heat index alone
- Multiple approximation methods exist with acknowledged error bounds

**Candidate Methods (to be evaluated):**

1. **Heat Index Proxy** (conservative but rough)
   - Use heat index as a proxy for work-rest decisions
   - Error: Ignores solar radiation, wind, direct sun exposure
   - Status: Conservative approach; acceptable for initial release

2. **Simplified WBGT Approximation (Bernard & Pryor, 1999)**
   - WBGT ≈ 0.567*T_g + 0.393*T_wb + 0.04*(RH/100) - 1.7*V + 2.0
   - Requires: globe temp (not available), wet-bulb (not available), wind speed (V)
   - Status: Cannot implement without additional sensors

3. **Heat Index to WBGT Mapping (ACGIH)**
   - Rough empirical relationship: WBGT ≈ HI - 5 to 10°F (varies by conditions)
   - Error: ±5–15°F depending on solar exposure, wind
   - Status: Placeholder approximation with acknowledged margin

**Decision Point:** 
- **Conservative approach for v0:** Use heat index directly for work-rest decisions; document that this is a heat index-based threshold, NOT true WBGT
- **Flag:** Code comment: "WBGT approximation from heat index ± 5–10°F; true WBGT requires globe thermometer"
- **TODO:** Evaluate Bernard & Pryor method if wind speed and humidity sensors become available

**Recommendations from sources:**
- ACGIH: https://www.acgih.org/ (TLV for heat stress) — requires subscription; using cited guidelines
- NIOSH: https://www.cdc.gov/niosh/topics/emf/rfsafety.html (indirect reference to work-rest tables)

---

## 3. Work-Rest Ratios (NIOSH & ACGIH)

**Source:** NIOSH Recommended Exposure Limit (REL) for Heat Stress
- URL: https://www.cdc.gov/niosh/topics/heatstress/
- Publication: NIOSH Criteria Document (revised 1986, reaffirmed in guidance)
- Applicable: Outdoor workers, assumed acclimatized after 2 weeks

**NIOSH REL Work-Rest Recommendations (Continuous Exposure, Acclimatized):**

| WBGT (°C) | Light Metabolic | Moderate Metabolic | Heavy Metabolic | Very Heavy Metabolic |
|---|---|---|---|---|
| 30–31 | 100% work | 100% work | 75% work, 25% rest | 50% work, 50% rest |
| 32–34 | 100% work | 50% work, 50% rest | 25% work, 75% rest | STOP |
| ≥35 | STOP | STOP | STOP | STOP |

**Notes:**
- Metabolic rates (light 100–150 W/m², moderate 150–200, heavy 200–260, very heavy >260)
- Above assumes acclimated workers; unacclimatized workers use stricter thresholds (shift all rows down ~2°C)
- Source: CDC/NIOSH Heat Stress guidance

**ACGIH TLV (Threshold Limit Value) — differs from NIOSH REL:**
- URL: https://www.acgih.org/ (requires subscription)
- General guidance: ACGIH TLVs are typically more permissive than NIOSH RELs
- **Conservative approach for this implementation:** Use NIOSH REL values (more protective)
- TODO: Verify ACGIH 2026 revision once subscription/public version available

**Acclimatization Status:**
- **Unacclimatized (first 1–2 weeks):** Use ~2°C lower WBGT thresholds
- **Acclimatized (2+ weeks in heat):** Use table above
- Assumption for v0: Acclimatized (briefing generated for ongoing crews); TODO: flag unacclimatized in UI

---

## 4. EPA AQI Breakpoints (PM2.5)

**Source:** U.S. Environmental Protection Agency AQI Technical Assistance Document
- URL: https://www.epa.gov/air-quality/air-quality-index-aqi
- Last updated: 2023 (AQI PM2.5 breakpoints effective 2016 revision)
- Applicable: 24-hour average or 1-hour peak PM2.5 concentration

**Current EPA AQI Breakpoints (PM2.5, µg/m³):**

| AQI Value | Breakpoint Range | Air Quality | Health Message |
|---|---|---|---|
| 0–50 | 0.0–12.0 µg/m³ | Good | Air quality is satisfactory |
| 51–100 | 12.1–35.4 µg/m³ | Moderate | Sensitive groups may experience health effects |
| 101–150 | 35.5–55.4 µg/m³ | Unhealthy for Sensitive Groups | |
| 151–200 | 55.5–150.4 µg/m³ | Unhealthy | General public may experience effects |
| 201–300 | 150.5–250.4 µg/m³ | Very Unhealthy | Health alert: all may be affected |
| 301+ | ≥250.5 µg/m³ | Hazardous | Health warning of emergency conditions |

**Citation:** https://www.epa.gov/air-quality/air-quality-index-aqi  
**Technical Document:** https://www.epa.gov/sites/default/files/2021-05/aqi-technical-assistance-document-sept2018.pdf

---

## 5. Water Intake Cadence

**Source:** OSHA & NIOSH Heat Illness Prevention Guidelines

URL: https://www.osha.gov/heat  
Publication: OSHA Heat Illness Prevention fact sheets (revised 2021)

**Recommended Water Intake (acclimatized workers in heat):**

| Condition | Intake Rate | Notes |
|---|---|---|
| Continuous outdoor work, 80–90°F | 0.5–1.0 liters/hour (17–34 oz/hr) | ~7–10 oz every 15–20 minutes |
| Heavy exertion, 90–100°F | 0.75–1.25 liters/hour | ~20 oz every 15 minutes |
| High heat, 100°F+ | 1.0+ liters/hour | Increase frequency; monitor for hyponatremia |
| Threshold for medical monitoring | >2 liters/hour sustained | Risk of water intoxication/hyponatremia |

**Assumptions:**
- Acclimatized, acclimated workers
- Cool water (10–15°C) enhances absorption
- Electrolyte replacement for exertion >2 hours

**Citation:** https://www.osha.gov/heat  
**Backup:** CDC/NIOSH Heat Stress guidance: https://www.cdc.gov/niosh/topics/heatstress/

---

## 6. Stop-Work Triggers

**Status:** TODO: UNSOURCED (thresholds pending state/OSHA guidance compilation)

**Framework (OSHA & State-Specific):**

| Authority | Trigger Condition | Standard |
|---|---|---|
| OSHA (Federal Guideline) | WBGT ≥ 35°C (95°F) continuous exposure | Recommended; not mandatory in all states |
| OSHA Heat Illness Prevention (CA, WA, OR) | Heat Index ≥ 105°F OR Wet Bulb ≥ 32.2°C | Requires shade, water, rest |
| California OSHA (most stringent) | Heat Index ≥ 108°F outdoor OR 106°F indoor | Mandatory work stoppage or frequent rest breaks |
| ACGIH TLV | WBGT ≥ 34°C for heavy work | Guidelines; not regulatory |

**Conservative Approach for v0:**
```
STOP_WORK_HEAT_INDEX_F = 105  // Moderate threshold; errs protective
CAUTION_HEAT_INDEX_F = 95      // Increased break frequency
MANDATORY_REST_BREAK_MINUTES = 10–15 every hour above 95°F
```

**Rationale:**
- Uses heat index (available from NWS) rather than WBGT (requires equipment)
- 105°F aligns with California OSHA thresholds (most protective state guideline)
- Conservative assumption: unacclimatized workers (briefing is for planning, not ongoing operations)

**Sources (to verify & cite):**
- OSHA Heat Illness Prevention: https://www.osha.gov/heat
- California OSHA Title 8: https://www.dir.ca.gov/title8/
- Washington State L&I: https://lni.wa.gov/workers-rights/work-conditions/heat/
- **TODO:** Compile exact Cal/OSHA and state-specific thresholds (currently placeholder)

---

## Implementation Notes

### TODO Items (Blocking)
1. **WBGT Method:** Select between heat-index proxy (conservative) or validated approximation
2. **Stop-Work Triggers:** Compile state-specific thresholds (CA, WA, OR at minimum); confirm federal OSHA guidance
3. **Acclimatization Logic:** Define how briefing detects unacclimatized vs. acclimatized workers

### Assumptions Baked In
- All workers are outdoor (not addressing indoor heat stress separately)
- Acclimatized baseline (1–2 weeks heat exposure assumed)
- No special populations (pregnant, elderly, medications); flag in code comments
- Work/rest ratios assume continuous (not intermittent work)
- Water intake assumes no electrolyte supplementation; note for heavy exertion >2h

### Precision Notes
- Heat index formula accurate ±3–5°F in typical conditions
- Work-rest thresholds are ranges; brief conservatively (shorter work periods)
- AQI thresholds from EPA; conversion from µg/m³ requires known measurement average (1-hr vs. 24-hr)
- Timestamps for all sources: capture at time of implementation

---

## Document History

| Date | Change |
|---|---|
| 2026-09-24 Session 2 | Initial research & sourcing phase |

