// eval/baselines.ts
// Dumb comparison policies. Any real engine must beat these to be worth anything.
//   always-watch    : never acts, always says "the base rates" (a climatology forecast)
//   count-threshold : engine/baseline.ts (more anomalies in 5 min => bigger button)
// A policy only gets events (already cut to arrived_at <= now) and the public registry.

import { BASE_RATES } from "../config/transitions";
import { countThresholdBaseline } from "../engine/baseline";
import type { Action, Event, Hypothesis, PublicRegistry, Seconds } from "../engine/types";

export interface PolicyOutput {
  action: Action;
  probabilities: Record<Hypothesis, number>;
}

export interface Policy {
  name: string;
  decide(events: Event[], now: Seconds, registry: PublicRegistry): PolicyOutput;
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

export const POLICIES: Record<string, Policy> = {
  [alwaysWatch.name]: alwaysWatch,
  [countThreshold.name]: countThreshold,
};
