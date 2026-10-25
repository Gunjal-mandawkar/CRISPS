// config/transitions.ts
// Transition matrix for the forward filter: P(hypothesis next minute | hypothesis now).
// Rows sum to 1. Mostly "stay put", with a small chance of change.
// Placeholder values, hand-set, tune later (Phase 2).

import type { Hypothesis } from "../engine/types";

export const TRANSITIONS: Record<Hypothesis, Record<Hypothesis, number>> = {
  NOISE:             { NOISE: 0.97, SENSOR_FAILURE: 0.01, ISOLATED_INCIDENT: 0.01, CASCADING_CRISIS: 0.01 },
  SENSOR_FAILURE:    { NOISE: 0.01, SENSOR_FAILURE: 0.97, ISOLATED_INCIDENT: 0.01, CASCADING_CRISIS: 0.01 },
  ISOLATED_INCIDENT: { NOISE: 0.01, SENSOR_FAILURE: 0.01, ISOLATED_INCIDENT: 0.96, CASCADING_CRISIS: 0.02 },
  CASCADING_CRISIS:  { NOISE: 0.00, SENSOR_FAILURE: 0.00, ISOLATED_INCIDENT: 0.01, CASCADING_CRISIS: 0.99 },
};

// Starting base rates (prior) before any evidence. Learned later (R4).
// Placeholder, hand-set, tune later.
export const BASE_RATES: Record<Hypothesis, number> = {
  NOISE: 0.6,
  SENSOR_FAILURE: 0.15,
  ISOLATED_INCIDENT: 0.17,
  CASCADING_CRISIS: 0.08,
};
