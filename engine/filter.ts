// engine/filter.ts
// Responsibility: the Bayesian forward filter. Minute by minute, in log-space:
// predict with the transition matrix, then update with clustered evidence (R1).
// Filled in: Phase 2.

import type { Hypothesis, Minutes } from "./types";
import type { EvidenceCluster } from "./cluster";

export function runFilter(
  clusters: EvidenceCluster[],
  now: Minutes,
): Record<Hypothesis, number> {
  throw new Error("not implemented: runFilter (Phase 2)");
}
