// config/priors.ts
// Base rates: how often each situation happens, before we see any evidence.
// This is the engine's starting belief, and what calibration widening falls
// back to when sensors go dark. Hand-set; learned across episodes in Phase 4 (R4).

import type { ProbabilityVector } from "../engine/types";

export const PRIOR: ProbabilityVector = {
  NOISE: 0.55,
  SENSOR_FAILURE: 0.15,
  ISOLATED_INCIDENT: 0.2,
  CASCADING_CRISIS: 0.1,
};
