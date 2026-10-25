// engine/adapter.ts
// Responsibility: the ONE place that maps an outside event format (ours, or the
// organizers') into our Event type. Swap this file to plug in another schema.
// Filled in: Phase 3. (The simulator already emits our schema, so Phase 1 needs no mapping.)

import type { Event } from "./types";

export function adaptEvent(raw: unknown): Event {
  throw new Error("not implemented: adaptEvent (Phase 1)");
}
