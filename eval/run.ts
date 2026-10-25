// eval/run.ts
// Run one policy over one episode, tick by tick, and score it.
// At tick t the policy sees ONLY events with arrived_at <= t (R8).

import { BASE_RATES } from "../config/transitions";
import { ACTIONS, type Event, HYPOTHESES, type TickRecord } from "../engine/types";
import { groupOf } from "../sim/dataset";
import type { Episode } from "../sim/truth";
import type { Policy, PolicyOutput } from "./baselines";
import { brierScore, flipFlops, level, logLoss, mean, sqDistance, tickCost } from "./metrics";

export const COMMIT_P = 0.6; // "committed" = top hypothesis is the truth with p >= 0.6

export interface EpisodeResult {
  episode_id: string;
  group: string;
  hypothesis: string;
  ticks: number;
  brier: number; // mean over ticks
  log_loss: number; // mean over ticks
  cost_total: number;
  cost_per_tick: number; // cost_total / ticks: long and short episodes count equally
  max_action: string;
  any_alert: boolean; // some tick at ALERT or above
  lead_min?: number; // critical_time - first ALERT tick, minutes (cascades only)
  flips: number;
  fallback_ticks: number;
  twin_role?: string;
  pre_split_overconf?: number; // mean squared distance from the base rates before the split
  commit_min?: number | null; // minutes after the split until committed to the truth (null = never)
}

function makeRecord(t: number, out: PolicyOutput): TickRecord {
  return {
    tick_time: t,
    probabilities: out.probabilities,
    action: out.action,
    expected_cost: NaN,
    expected_costs: { WATCH: NaN, PREPARE: NaN, ALERT: NaN, ESCALATE: NaN }, // baselines do not compute these
    forecast: [],
    top_evidence: [],
    changes: [],
    degraded: false,
    fallback: false,
    source_statuses: {},
    source_summary: { live: 0, stale: 0, dark: 0, total: 0, coverage: 1 },
    trust: [],
    retroactive_revisions: [],
    quarantined: [],
    unparsed: 0,
  };
}

export function runEpisode(policy: Policy, ep: Episode): { records: TickRecord[]; result: EpisodeResult } {
  const truth = ep.truth;
  const byArrival = ep.events.slice().sort((a, b) => a.arrived_at - b.arrived_at);
  const records: TickRecord[] = [];
  const step = policy.start?.(ep.registry); // stateful policies (the engine) get only new arrivals
  let cut = 0;
  for (let t = 60; t <= ep.duration; t += 60) {
    const prev = cut;
    while (cut < byArrival.length && byArrival[cut].arrived_at <= t) cut++;
    if (step) records.push(step(byArrival.slice(prev, cut), t));
    else records.push(makeRecord(t, policy.decide!(byArrival.slice(0, cut), t, ep.registry))); // future events are never passed in
  }

  const h = truth.hypothesis;
  const costs = records.map((r) => tickCost(r.action, h, truth.onset === undefined ? 0 : (r.tick_time - truth.onset) / 60));
  const costTotal = costs.reduce((s, c) => s + c, 0);
  const firstAlert = records.find((r) => level(r.action) >= level("ALERT"));
  const result: EpisodeResult = {
    episode_id: ep.episode_id,
    group: groupOf(ep),
    hypothesis: h,
    ticks: records.length,
    brier: mean(records.map((r) => brierScore(r.probabilities, h))),
    log_loss: mean(records.map((r) => logLoss(r.probabilities, h))),
    cost_total: costTotal,
    cost_per_tick: costTotal / records.length,
    max_action: ACTIONS[Math.max(...records.map((r) => level(r.action)))],
    any_alert: firstAlert !== undefined,
    flips: flipFlops(records.map((r) => r.action)),
    fallback_ticks: records.filter((r) => r.fallback).length,
  };
  if (h === "CASCADING_CRISIS" && truth.critical_time !== undefined && firstAlert) {
    result.lead_min = (truth.critical_time - firstAlert.tick_time) / 60;
  }
  if (truth.split_time !== undefined) {
    const split = truth.split_time;
    result.twin_role = truth.twin_role;
    result.pre_split_overconf = mean(records.filter((r) => r.tick_time <= split).map((r) => sqDistance(r.probabilities, BASE_RATES)));
    const committed = records.find((r) => {
      if (r.tick_time <= split) return false;
      const top = HYPOTHESES.reduce((a, b) => (r.probabilities[b] > r.probabilities[a] ? b : a));
      return top === h && r.probabilities[h] >= COMMIT_P;
    });
    result.commit_min = committed ? (committed.tick_time - split) / 60 : null;
  }
  return { records, result };
}
