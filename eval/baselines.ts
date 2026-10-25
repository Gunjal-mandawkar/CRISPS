// eval/baselines.ts
// Dumb comparison policies. Any real engine must beat these to be worth anything.
//   always-watch    : never acts, always says "the base rates" (a climatology forecast)
//   count-threshold : engine/baseline.ts (more anomalies in 5 min => bigger button)
//   engine          : engine/tick.ts, the Bayesian engine (stateful: one Engine per episode)
// A policy only gets events (already cut to arrived_at <= now) and the public registry.

import { BASE_RATES } from "../config/transitions";
import { countThresholdBaseline } from "../engine/baseline";
import { Engine } from "../engine/tick";
import type { Action, Event, Hypothesis, PublicRegistry, Seconds, TickRecord } from "../engine/types";

export interface PolicyOutput {
  action: Action;
  probabilities: Record<Hypothesis, number>;
}

// Stateless policies implement decide(all visible events). A stateful policy
// implements start(registry) instead and is then fed only the NEW arrivals each tick.
export interface Policy {
  name: string;
  decide?(events: Event[], now: Seconds, registry: PublicRegistry): PolicyOutput;
  start?(registry: PublicRegistry): (newEvents: Event[], now: Seconds) => TickRecord;
}

export const alwaysWatch: Policy = {
  name: "always-watch",
  decide: () => ({ action: "WATCH", probabilities: { ...BASE_RATES } }),
};

export const countThreshold: Policy = {
  name: "count-threshold",
  decide: (events, now) => {
    const out = countThresholdBaseline(events, now);
    return { action: out.action, probabilities: out.probabilities };
  },
};

export const engine: Policy = {
  name: "engine",
  start: (registry) => {
    const e = new Engine(registry);
    return (newEvents, now) => e.tick(newEvents, now);
  },
};

export const POLICIES: Record<string, Policy> = {
  [alwaysWatch.name]: alwaysWatch,
  [countThreshold.name]: countThreshold,
  [engine.name]: engine,
};
