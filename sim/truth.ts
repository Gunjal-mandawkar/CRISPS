// sim/truth.ts
// SIMULATOR-ONLY types. The hidden truth behind an episode.
// RULE: nothing under /engine may import this file (R8). Only /sim and /eval may.
// Phase 1 fills the simulator that produces these.

import type { Event, Hypothesis, Minutes, SourceRegistryEntry, Zone } from "../engine/types";

// A source as the simulator knows it, including facts the engine must estimate.
export interface SimSourceEntry extends SourceRegistryEntry {
  true_reliability: number; // hidden, 0..1, may drift over time
  clock_offset: Minutes; // hidden, about -2..+2 (R9)
}

// Per-event hidden labels.
export interface EventTruth {
  event_id: string;
  is_lie: boolean; // e.g. a failed gateway's fake anomaly
  is_mimic: boolean; // e.g. a rumor wave report
  is_duplicate: boolean;
}

export interface GroundTruth {
  hypothesis: Hypothesis;
  onset?: Minutes; // when the true situation began
  twin_split?: Minutes; // for twin episodes: when the twins diverge
  cutouts: { source_type: string; from: Minutes; to: Minutes }[];
  failed_gateways: string[];
  rumor_narrative_ids: string[];
  event_truths: EventTruth[];
  sources: SimSourceEntry[];
}

// A full simulated episode. The engine only ever receives `events`,
// `sources` stripped down to SourceRegistryEntry, and `zones`.
export interface Episode {
  episode_id: string;
  seed: number;
  scenario: string;
  duration: Minutes;
  zones: Zone[];
  events: Event[];
  truth: GroundTruth;
}
