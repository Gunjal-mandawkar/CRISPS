// engine/learn.ts
// Responsibility: learning BETWEEN episodes (R4). After an episode ends and its
// outcome is revealed, update per-source trust (Beta with forgetting) and base
// rates (decayed Dirichlet counts), with a CUSUM drift detector.
// Note: the outcome arrives as a plain Hypothesis label passed in by the
// harness; this file never imports the simulator's GroundTruth type.
// Filled in: Phase 4.

import type { Hypothesis, TrustSnapshot } from "./types";

export interface LearnedState {
  trust: TrustSnapshot[];
  base_rates: Record<Hypothesis, number>;
}

export function updateAfterEpisode(
  state: LearnedState,
  revealedOutcome: Hypothesis,
  sourceWasRight: Record<string, boolean>,
): LearnedState {
  throw new Error("not implemented: updateAfterEpisode (Phase 4)");
}
