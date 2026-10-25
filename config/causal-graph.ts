// config/causal-graph.ts
// Causal chain used for forecasting (R3):
// rain -> drainage -> traffic -> emergency calls -> hospital arrivals -> power/comms load
//
// Each edge says: "if the upstream stage started at time t, the downstream stage
// usually starts lag.mean seconds later, give or take lag.sd", and pass_through is
// the chance a cascade actually reaches the next stage (not every flood blocks roads).
// Hand-set from the crisis story. Honest note: the lag means are the simulator's
// own stage lags, rounded (the simulator was written from the same story).
// The hospital -> power edge is our approximation: in the simulator power load
// follows the calls about 4.5 min later, i.e. about 2 min after the hospital stage.

import type { EventKind } from "../engine/types";

export interface CausalEdge {
  from: EventKind;
  to: EventKind;
  lag: { mean: number; sd: number }; // SECONDS
  pass_through: number; // P(downstream stage happens | upstream happened, cascade)
}

export const CAUSAL_ORDER: EventKind[] = [
  "rain_heavy",
  "drainage_anomaly",
  "traffic_slowdown",
  "emergency_call_spike",
  "hospital_arrivals_unusual",
  "power_comms_load",
];

export const CAUSAL_EDGES: CausalEdge[] = [
  { from: "rain_heavy", to: "drainage_anomaly", lag: { mean: 180, sd: 60 }, pass_through: 0.9 },
  { from: "drainage_anomaly", to: "traffic_slowdown", lag: { mean: 120, sd: 45 }, pass_through: 0.9 },
  { from: "traffic_slowdown", to: "emergency_call_spike", lag: { mean: 120, sd: 45 }, pass_through: 0.85 },
  { from: "emergency_call_spike", to: "hospital_arrivals_unusual", lag: { mean: 150, sd: 60 }, pass_through: 0.85 },
  { from: "hospital_arrivals_unusual", to: "power_comms_load", lag: { mean: 120, sd: 90 }, pass_through: 0.7 },
];
