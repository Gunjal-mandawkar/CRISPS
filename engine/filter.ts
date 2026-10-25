// engine/filter.ts
// The Bayesian forward filter: one tick of "what I believed + what I just saw".
//
//   1. PREDICT: push last tick's belief through the transition matrix
//      (a little of it drifts back toward the base rates; config/transitions.ts).
//   2. UPDATE, in log-space (adding logs = multiplying probabilities, without
//      numbers underflowing to 0). Since Phase 3 the filter scores EVIDENCE UNITS
//      (engine/grouping.ts), not raw events:
//        unit row(H) = weight x trust x LL(kind, H)
//          weight: 1 for a single event, 1 + ln(n) for a cluster of n (concave discount)
//          LL:     the kind's alone/chained row (config/likelihoods.ts), or a special row:
//                  GATEWAY_CORRELATED for a lying gateway, RUMOR_CAPPED for an
//                  uncorroborated narrative, LOW_SEVERITY for everyday blips
//      Score once: the engine remembers what each unit already added. When a
//      cluster grows (or shrinks after a retraction), only the DIFFERENCE is added:
//        log score(H) = log prior(H) + sum over changed units of (new row - old row)(H)
//                       + extra rows (forecast confirmed / missed) + silence(H)
//      then exponentiate and normalize so the 4 numbers sum to 1.
//   3. WIDEN for lost coverage (R5): with only `coverage` of the sources live,
//        posterior = coverage * raw + (1 - coverage) * base rates
//      Fewer eyes => belief pulled back toward "we don't know". DEGRADED if coverage < 0.7.
//
// Pure function: same inputs => same output. No clock, no state, no ground truth.

import { FILTER_KNOBS } from "../config/knobs";
import { GATEWAY_CORRELATED, LIKELIHOODS, type LLRow, LOW_SEVERITY, RUMOR_CAPPED } from "../config/likelihoods";
import { PRIOR } from "../config/priors";
import { TRANSITIONS } from "../config/transitions";
import { summarize } from "./source-status";
import { type EvidenceUnit, HYPOTHESES, type Hypothesis, type ProbabilityVector, type SourceStatus } from "./types";

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
  contributions: Map<string, LLRow>; // unit id -> its full row now, so later changes add only the difference
}

// A unit to (re)score this tick, and what it had already added before (zeros if new).
export interface UnitUpdate {
  unit: EvidenceUnit;
  previous: LLRow;
}

export const zeroRow = (): LLRow => ({ NOISE: 0, SENSOR_FAILURE: 0, ISOLATED_INCIDENT: 0, CASCADING_CRISIS: 0 });

// One unit's log-likelihood row, weight and trust applied.
export function unitLogLikelihood(u: EvidenceUnit): LLRow {
  const out = zeroRow();
  if (u.n === 0 || u.weight === 0) return out; // every member retracted: contributes nothing
  let base: LLRow;
  if (u.unit_type === "gateway_correlated") base = GATEWAY_CORRELATED;
  else if (!u.strong) base = LOW_SEVERITY;
  else if (u.unit_type === "narrative" && !u.corroborated) base = RUMOR_CAPPED;
  else {
    const table = LIKELIHOODS[u.kind];
    if (!table) return out; // heartbeats, retractions: no evidence
    base = u.chained && table.chained ? table.chained : table.alone;
  }
  // a lying gateway is judged as a unit: the (fake) sensors' trust does not apply
  const scale = u.unit_type === "gateway_correlated" ? u.weight : u.weight * u.trust;
  for (const h of HYPOTHESES) out[h] = scale * base[h];
  return out;
}

export function predict(prior: ProbabilityVector, transitions: FilterConfig["transitions"]): ProbabilityVector {
  const out = zeroRow();
  for (const from of HYPOTHESES) for (const to of HYPOTHESES) out[to] += prior[from] * transitions[from][to];
  return out;
}

// exp and normalize; subtracting the max first keeps exp() from overflowing.
export function normalizeLog(logp: LLRow): ProbabilityVector {
  const m = Math.max(...HYPOTHESES.map((h) => logp[h]));
  const out = zeroRow();
  let sum = 0;
  for (const h of HYPOTHESES) sum += out[h] = Math.exp(logp[h] - m);
  for (const h of HYPOTHESES) out[h] /= sum;
  return out;
}

export function forwardFilter(
  prior: ProbabilityVector,
  updates: UnitUpdate[],
  sourceStatuses: Record<string, SourceStatus>,
  config: FilterConfig = DEFAULT_FILTER_CONFIG,
  extra: LLRow[] = [], // forecast confirmed / missed this tick (engine/forecast.ts)
): FilterResult {
  const k = config.knobs;
  const predicted = predict(prior, config.transitions);
  const logp = zeroRow();
  for (const h of HYPOTHESES) logp[h] = Math.log(Math.max(1e-300, predicted[h]));

  const contributions = new Map<string, LLRow>();
  for (const { unit, previous } of updates) {
    const ll = unitLogLikelihood(unit);
    unit.hypothesis_contributions = ll;
    contributions.set(unit.unit_id, ll);
    for (const h of HYPOTHESES) logp[h] += ll[h] - previous[h]; // only what changed since last time
  }
  for (const row of extra) for (const h of HYPOTHESES) logp[h] += row[h];

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
