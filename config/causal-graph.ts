// config/causal-graph.ts
// Causal chain used for forecasting (R3):
// rain -> drainage -> traffic -> emergency calls -> hospital arrivals -> power/comms load
// Each edge will get a lag distribution (mean, sd in minutes). Empty for now:
// hand-set, tune later (Phase 4).

import type { EventKind } from "../engine/types";

export interface CausalEdge {
  from: EventKind;
  to: EventKind;
  lag?: { mean: number; sd: number }; // minutes; filled in Phase 4
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
  { from: "rain_heavy", to: "drainage_anomaly" },
  { from: "drainage_anomaly", to: "traffic_slowdown" },
  { from: "traffic_slowdown", to: "emergency_call_spike" },
  { from: "emergency_call_spike", to: "hospital_arrivals_unusual" },
  { from: "hospital_arrivals_unusual", to: "power_comms_load" },
];
