// engine/filter.ts
// The Bayesian forward filter: one tick of "what I believed + what I just saw".
//
//   1. PREDICT: push last tick's belief through the transition matrix
//      (a little of it drifts back toward the base rates; config/transitions.ts).
//   2. UPDATE, in log-space (adding logs = multiplying probabilities, without
//      numbers underflowing to 0):
//        log score(H) = log prior(H)
//                     + sum over FRESH evidence e of  trust(e) * LL(e, H)
//                     - sum over WITHDRAWN evidence (retracted after it was scored)
//                     + silence(H)
//      then exponentiate and normalize so the 4 numbers sum to 1.
//      Only fresh events are scored, so nothing is counted twice across ticks;
//      older window events are still used as causal context (`chained`).
//   3. WIDEN for lost coverage (R5): with only `coverage` of the sources live,
//        posterior = coverage * raw + (1 - coverage) * base rates
//      Fewer eyes => belief pulled back toward "we don't know". DEGRADED if coverage < 0.7.
//
// Pure function: same inputs => same output. No clock, no state, no ground truth.

import { FILTER_KNOBS } from "../config/knobs";
import { LIKELIHOODS, type LLRow, LOW_SEVERITY } from "../config/likelihoods";
import { PRIOR } from "../config/priors";
import { TRANSITIONS } from "../config/transitions";
import { isStrong } from "./order";
import { summarize } from "./source-status";
import { type CleanedEvent, HYPOTHESES, type Hypothesis, type ProbabilityVector, type SourceStatus } from "./types";

export interface FilterConfig {
  basePrior: ProbabilityVector;
  transitions: Record<Hypothesis, Record<Hypothesis, number>>;
  knobs: typeof FILTER_KNOBS;
}

export const DEFAULT_FILTER_CONFIG: FilterConfig = { basePrior: PRIOR, transitions: TRANSITIONS, knobs: FILTER_KNOBS };

export interface FilterResult {
  posterior: ProbabilityVector; // after widening: report and decide on this one
  raw: ProbabilityVector; // before widening: carried forward as next tick's prior
  coverage: number;
  degraded: boolean;
  contributions: Map<string, LLRow>; // per scored event, so a later retraction can withdraw it
}

const zeroRow = (): LLRow => ({ NOISE: 0, SENSOR_FAILURE: 0, ISOLATED_INCIDENT: 0, CASCADING_CRISIS: 0 });

// One event's (tempered) log-likelihood row.
export function eventLogLikelihood(e: CleanedEvent, knobs = FILTER_KNOBS): LLRow {
  const table = LIKELIHOODS[e.kind];
  if (!table) return zeroRow(); // heartbeats, retractions: no evidence
  const base = !isStrong(e) ? LOW_SEVERITY : e.chained && table.chained ? table.chained : table.alone;
  const trust = knobs.trust[e.source_type] ?? knobs.trust.default;
  const out = zeroRow();
  for (const h of HYPOTHESES) out[h] = trust * base[h];
  return out;
}

export function predict(prior: ProbabilityVector, transitions: FilterConfig["transitions"]): ProbabilityVector {
  const out = zeroRow();
  for (const from of HYPOTHESES) for (const to of HYPOTHESES) out[to] += prior[from] * transitions[from][to];
  return out;
}

// exp and normalize; subtracting the max first keeps exp() from overflowing.
function normalizeLog(logp: LLRow): ProbabilityVector {
  const m = Math.max(...HYPOTHESES.map((h) => logp[h]));
  const out = zeroRow();
  let sum = 0;
  for (const h of HYPOTHESES) sum += out[h] = Math.exp(logp[h] - m);
  for (const h of HYPOTHESES) out[h] /= sum;
  return out;
}

export function forwardFilter(
  prior: ProbabilityVector,
  evidence: CleanedEvent[],
  sourceStatuses: Record<string, SourceStatus>,
  config: FilterConfig = DEFAULT_FILTER_CONFIG,
  withdrawn: LLRow[] = [],
): FilterResult {
  const k = config.knobs;
  const predicted = predict(prior, config.transitions);
  const logp = zeroRow();
  for (const h of HYPOTHESES) logp[h] = Math.log(Math.max(1e-300, predicted[h]));

  const contributions = new Map<string, LLRow>();
  for (const e of evidence) {
    if (!e.fresh) continue;
    const ll = eventLogLikelihood(e, k);
    contributions.set(e.id, ll);
    for (const h of HYPOTHESES) logp[h] += ll[h];
  }
  for (const ll of withdrawn) for (const h of HYPOTHESES) logp[h] -= ll[h];

  // Silence is weak evidence of a broken sensor, not of calm and not of crisis.
  const st = summarize(sourceStatuses);
  const silence = Math.min(k.silence_cap_ll, st.dark * k.silence_dark_ll + st.stale * k.silence_stale_ll);
  logp.SENSOR_FAILURE += silence;

  const raw = normalizeLog(logp);
  const c = st.coverage;
  const posterior = zeroRow();
  for (const h of HYPOTHESES) posterior[h] = c * raw[h] + (1 - c) * config.basePrior[h];
  for (const h of HYPOTHESES) if (!Number.isFinite(posterior[h])) throw new Error(`filter produced a non-finite probability for ${h}`);
  return { posterior, raw, coverage: c, degraded: c < k.degraded_below_coverage, contributions };
}
