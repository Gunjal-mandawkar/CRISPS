// engine/cluster.ts
// Responsibility: group correlated evidence so it is not counted many times:
// gateway groups, rumor narrative clusters, near-duplicates (same zone + kind
// in a short window, weight about 1 + ln(n)) (R10).
// Filled in: Phase 3.

import type { Event } from "./types";

export interface EvidenceCluster {
  key: string; // e.g. "zone3|traffic_slowdown|min12"
  events: Event[];
  weight: number; // diminishing-returns weight
}

export function clusterEvidence(events: Event[]): EvidenceCluster[] {
  throw new Error("not implemented: clusterEvidence (Phase 3)");
}
