// engine/validate.ts
// Responsibility: check each event is well-formed. Bad events are quarantined
// with a reason, never allowed to crash the engine (R5).
// Filled in: Phase 3.

import type { Event } from "./types";

export interface ValidationResult {
  ok: Event[];
  quarantined: { raw: unknown; reason: string }[];
}

export function validateEvents(raw: unknown[]): ValidationResult {
  throw new Error("not implemented: validateEvents (Phase 3)");
}
