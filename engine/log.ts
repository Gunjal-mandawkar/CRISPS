// engine/log.ts
// Responsibility: the append-only event log. Each tick, the engine asks it for
// "all events with arrived_at <= now" (R8) and rebuilds belief from scratch.
// Filled in: Phase 2.

import type { Event, Minutes } from "./types";

export interface EventLog {
  append(event: Event): void;
  visibleAt(now: Minutes): Event[];
}

export function createEventLog(): EventLog {
  throw new Error("not implemented: createEventLog (Phase 2)");
}
