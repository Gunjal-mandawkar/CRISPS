// engine/fallback.ts
// Responsibility: safe fallback (R11). If a tick throws, use the naive baseline,
// HOLD the previous action (never jump up), and set fallback = true.
// Filled in: Phase 3.

import type { Action, Event, Minutes, TickRecord } from "./types";

export function fallbackTick(events: Event[], now: Minutes, previousAction: Action): TickRecord {
  throw new Error("not implemented: fallbackTick (Phase 3)");
}
