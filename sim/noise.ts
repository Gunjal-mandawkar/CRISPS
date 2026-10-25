// sim/noise.ts
// Responsibility: make the stream messy: delays, duplicates, retractions,
// out-of-order arrival, clock skew, cutouts, gateway failures, rumor waves.
// Filled in: Phase 1 (basic) and Phase 3 (adversity).

import type { Event } from "../engine/types";

export function addMess(events: Event[], seed: number): Event[] {
  throw new Error("not implemented: addMess (Phase 1)");
}
