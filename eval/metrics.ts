// eval/metrics.ts
// Responsibility: scoring functions: Brier, log-loss, reliability table,
// total cost, lead time, false-alarm rate, flip-flops, twin-test score.
// Filled in: Phase 1 (basic) and Phase 2+.

import type { Hypothesis } from "../engine/types";

export function brierScore(p: Record<Hypothesis, number>, truth: Hypothesis): number {
  throw new Error("not implemented: brierScore (Phase 1)");
}
