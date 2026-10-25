// engine/forecast.ts
// Responsibility: forecast the next 3 events along the causal graph, with
// [p10, p90] windows, weighted by P(cascade) (R3).
// Filled in: Phase 4.

import type { Event, ForecastItem, Hypothesis, Seconds } from "./types";

export function forecastNext(
  events: Event[],
  posterior: Record<Hypothesis, number>,
  now: Seconds,
): ForecastItem[] {
  throw new Error("not implemented: forecastNext (Phase 4)");
}
