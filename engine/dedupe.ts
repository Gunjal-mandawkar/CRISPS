// engine/dedupe.ts
// Responsibility: drop exact duplicates (same id) and apply retractions.
// Orphan retractions wait until their target arrives; unknown ids are logged.
// Filled in: Phase 3.

import type { Event } from "./types";

export interface DedupeResult {
  events: Event[];
  notes: string[];
}

export function dedupeAndRetract(events: Event[]): DedupeResult {
  throw new Error("not implemented: dedupeAndRetract (Phase 3)");
}
