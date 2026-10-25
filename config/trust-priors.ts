// config/trust-priors.ts
// Starting trust per source type, as Beta(alpha, beta).
// Mean trust = alpha / (alpha + beta). Small totals = "we don't know yet".
// Hand-set, tune later (Phase 4).

import type { SourceType } from "../engine/types";

export const TRUST_PRIORS: Record<SourceType, { alpha: number; beta: number }> = {
  rain_gauge: { alpha: 8, beta: 2 },
  drainage_sensor: { alpha: 7, beta: 3 },
  traffic_sensor: { alpha: 7, beta: 3 },
  camera: { alpha: 7, beta: 3 },
  dispatch: { alpha: 9, beta: 1 },
  hospital: { alpha: 9, beta: 1 },
  utility: { alpha: 8, beta: 2 },
  citizen_report: { alpha: 3, beta: 3 },
  gateway: { alpha: 8, beta: 2 },
};

// Forgetting factor: each episode, old evidence is multiplied by this (R4).
export const TRUST_FORGETTING = 0.95;
