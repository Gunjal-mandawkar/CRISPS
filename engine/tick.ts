// engine/tick.ts
// The tick runner: one simulated minute of the engine pipeline.
//
//   1-2  adapt each raw event (unknown schema -> counted and skipped)
//   3    validate (malformed -> quarantined, kept for the dashboard)
//   4    append to the log (dedupe by id, retractions incl. orphans)
//   ---- inside try/catch ----
//   5    build the cleaned, ordered window
//   6    update source statuses (live / stale / dark)
//   7    forward filter: prior -> posterior
//   8    decide: posterior + hysteresis state -> action + expected cost
//   ---- on ANY error: count-threshold baseline, fallback = true (R11) ----
//   9-10 build the TickRecord; the raw posterior becomes next tick's prior
//
// The engine only ever sees what it is given: the PUBLIC registry and the
// events handed to tick(). It never reads ground truth.

import { type LLRow } from "../config/likelihoods";
import { PRIOR } from "../config/priors";
import { adaptEvent } from "./adapter";
import { decide as defaultDecide, type DecisionConfig, type DecisionState, expectedCosts, initialDecisionState } from "./decide";
import { fallbackDecision } from "./fallback";
import { forwardFilter as defaultFilter, DEFAULT_FILTER_CONFIG, type FilterConfig } from "./filter";
import { EventLog } from "./log";
import { buildCleanedWindow, offsetEstimates } from "./order";
import { SourceTracker, summarize } from "./source-status";
import type { Event, ProbabilityVector, PublicRegistry, QuarantinedEvent, Seconds, SourceStatus, TickRecord } from "./types";
import { validateEvent } from "./validate";

export interface EngineOptions {
  filter?: typeof defaultFilter; // swap in for tests (e.g. one that throws)
  decide?: typeof defaultDecide;
  filterConfig?: FilterConfig;
  decisionConfig?: DecisionConfig;
}

export class Engine {
  readonly log = new EventLog();
  readonly errors: string[] = []; // every caught exception, "t=600: message"
  unparsedTotal = 0;
  private tracker: SourceTracker;
  private offsets: Map<string, Seconds>;
  private zones: Set<string>;
  private prior: ProbabilityVector = { ...PRIOR }; // raw posterior of the last good tick
  private decision: DecisionState = initialDecisionState();
  private scored = new Map<string, LLRow>(); // event id -> what it added to the belief
  private filter: typeof defaultFilter;
  private decideFn: typeof defaultDecide;
  private filterConfig: FilterConfig;
  private decisionConfig: DecisionConfig | undefined;

  constructor(registry: PublicRegistry, opts: EngineOptions = {}) {
    this.tracker = new SourceTracker(registry);
    this.offsets = offsetEstimates(registry);
    this.zones = new Set(registry.zones.map((z) => z.zone_id));
    this.filter = opts.filter ?? defaultFilter;
    this.decideFn = opts.decide ?? defaultDecide;
    this.filterConfig = opts.filterConfig ?? DEFAULT_FILTER_CONFIG;
    this.decisionConfig = opts.decisionConfig;
    if (opts.decisionConfig) this.decision = initialDecisionState(opts.decisionConfig.knobs);
  }

  tick(rawEvents: unknown[], now: Seconds): TickRecord {
    // 1-4: adapt, validate, append. These are pure and per event: one bad event cannot stop the others.
    let unparsed = 0;
    const quarantined: QuarantinedEvent[] = [];
    for (const raw of rawEvents) {
      const e = adaptEvent(raw);
      if (e === null) {
        unparsed++;
        continue;
      }
      const v = validateEvent(e, { now, zones: this.zones });
      if ("quarantined" in v) {
        quarantined.push({ event: v.quarantined, reason: v.reason });
        continue;
      }
      if (this.log.append(v.valid, now) === "added") this.tracker.observe(v.valid);
    }
    this.log.applyPendingRetractions();
    this.unparsedTotal += unparsed;

    try {
      // 5. evidence window; events scored earlier but retracted since are withdrawn
      const window = buildCleanedWindow(this.log, this.offsets, now, this.filterConfig.knobs.window_s, this.scored);
      const withdrawnIds = [...this.scored.keys()].filter((id) => this.log.isRetracted(id));
      // 6. who is still talking to us
      const statuses = this.tracker.statuses(now);
      // 7. belief
      const fr = this.filter(this.prior, window, statuses, this.filterConfig, withdrawnIds.map((id) => this.scored.get(id)!));
      // 8. action
      const d = this.decideFn(fr.posterior, this.decision, this.decisionConfig);

      // commit the new state only after every step succeeded
      for (const id of withdrawnIds) this.scored.delete(id);
      for (const [id, ll] of fr.contributions) this.scored.set(id, ll);
      this.prior = fr.raw;
      this.decision = d.state;
      return this.record(now, {
        probabilities: fr.posterior,
        action: d.action,
        expected_cost: d.expected_cost,
        expected_costs: d.expected_costs,
        degraded: fr.degraded,
        fallback: false,
        statuses,
        quarantined,
        unparsed,
      });
    } catch (err) {
      return this.fallbackTick(now, err, quarantined, unparsed);
    }
  }

  // R11: never crash mid-episode. Baseline probabilities, action capped at the previous one.
  private fallbackTick(now: Seconds, err: unknown, quarantined: QuarantinedEvent[], unparsed: number): TickRecord {
    this.errors.push(`t=${now}: ${err instanceof Error ? err.message : String(err)}`);
    const previous = this.decision.current;
    const fb = fallbackDecision(this.log.all(), now, previous);
    if (fb.action !== previous) this.decision = { ...initialDecisionState(), current: fb.action, ticks_at_current: 1 };
    else this.decision = { ...this.decision, ticks_at_current: this.decision.ticks_at_current + 1 };
    let statuses: Record<string, SourceStatus> = {};
    try {
      statuses = this.tracker.statuses(now);
    } catch {
      // statuses are informational here; leave them empty
    }
    const ec = expectedCosts(fb.probabilities);
    return this.record(now, {
      probabilities: fb.probabilities,
      action: fb.action,
      expected_cost: ec[fb.action],
      expected_costs: ec,
      degraded: true,
      fallback: true,
      statuses,
      quarantined,
      unparsed,
    });
  }

  private record(
    now: Seconds,
    x: Pick<TickRecord, "probabilities" | "action" | "expected_cost" | "expected_costs" | "degraded" | "fallback" | "quarantined" | "unparsed"> & {
      statuses: Record<string, SourceStatus>;
    },
  ): TickRecord {
    return {
      tick_time: now,
      probabilities: x.probabilities,
      action: x.action,
      expected_cost: x.expected_cost,
      expected_costs: x.expected_costs,
      forecast: [], // Phase 3
      top_evidence: [], // Phase 5
      changes: [], // Phase 5
      degraded: x.degraded,
      fallback: x.fallback,
      source_statuses: x.statuses,
      source_summary: summarize(x.statuses),
      trust: [], // Phase 4
      retroactive_revisions: [],
      quarantined: x.quarantined,
      unparsed: x.unparsed,
    };
  }
}

// Convenience for tests and eval: feed events whose arrived_at falls in (prev, now].
export function newArrivals(events: Event[], from: Seconds, to: Seconds): Event[] {
  return events.filter((e) => e.arrived_at > from && e.arrived_at <= to);
}
