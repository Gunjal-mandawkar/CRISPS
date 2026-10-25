// eval/baselines.ts
// Responsibility: dumb comparison policies: always-WATCH and a simple
// count-threshold rule. The count-threshold one is also the R11 fallback.
// Filled in: Phase 1.

import type { Action, Event, Minutes } from "../engine/types";

export function alwaysWatch(): Action {
  return "WATCH";
}

export function countThreshold(events: Event[], now: Minutes): Action {
  throw new Error("not implemented: countThreshold (Phase 1)");
}
