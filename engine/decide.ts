// engine/decide.ts
// Responsibility: pick the action with the lowest expected cost (R2), compare
// "act now" vs "wait one minute", then apply hysteresis (R6).
// Filled in: Phase 2.

import type { Action, Hypothesis } from "./types";

export interface DecisionState {
  current: Action;
  ticks_at_current: number;
  ticks_above: number;
  ticks_below: number;
}

export function expectedCosts(posterior: Record<Hypothesis, number>): Record<Action, number> {
  throw new Error("not implemented: expectedCosts (Phase 2)");
}

export function decide(
  posterior: Record<Hypothesis, number>,
  state: DecisionState,
): { action: Action; state: DecisionState } {
  throw new Error("not implemented: decide (Phase 2)");
}
