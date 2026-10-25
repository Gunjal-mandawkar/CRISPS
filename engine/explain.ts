// engine/explain.ts
// Responsibility: template sentences for "why it changed" and the top 3
// evidence contributors by log-likelihood ratio (R7). No LLM.
// Filled in: Phase 5.

import type { EvidenceContribution, TickRecord } from "./types";

export function explainChange(prev: TickRecord | undefined, next: TickRecord): string[] {
  throw new Error("not implemented: explainChange (Phase 5)");
}

export function topContributors(all: EvidenceContribution[], n = 3): EvidenceContribution[] {
  throw new Error("not implemented: topContributors (Phase 5)");
}
