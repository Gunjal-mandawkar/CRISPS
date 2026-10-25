// engine/types.ts
// Shared types the ENGINE is allowed to see. Everything here is "observable":
// it could come from a real city feed.
// Hidden simulator facts (true hypothesis, true reliability, clock offsets...)
// live in sim/truth.ts. The engine must never import that file.

// The 4 explanations the engine weighs against each other.
export const HYPOTHESES = [
  "NOISE",
  "SENSOR_FAILURE",
  "ISOLATED_INCIDENT",
  "CASCADING_CRISIS",
] as const;
export type Hypothesis = (typeof HYPOTHESES)[number];

// The 4 buttons the duty officer can press, cheapest/least disruptive first.
// The order matters: hysteresis (R6) moves one level at a time along this list.
export const ACTIONS = ["WATCH", "PREPARE", "ALERT", "ESCALATE"] as const;
export type Action = (typeof ACTIONS)[number];

// Where an event came from.
export type SourceType =
  | "rain_gauge"
  | "drainage_sensor"
  | "traffic_sensor"
  | "camera"
  | "dispatch" // emergency call / dispatch log
  | "hospital"
  | "utility" // power / comms load
  | "citizen_report"
  | "gateway"; // the box that relays many sensors (can fail as one unit)

// What the event says happened.
export type EventKind =
  | "rain_heavy"
  | "drainage_anomaly"
  | "traffic_slowdown"
  | "emergency_call_spike"
  | "hospital_arrivals_unusual"
  | "power_comms_load"
  | "citizen_report"
  | "heartbeat" // "I am alive" ping from a source
  | "gateway_heartbeat_lost" // a gateway stopped pinging (supports SENSOR_FAILURE)
  | "retraction"; // "ignore my earlier event X"

// Time is in whole simulated SECONDS since episode start.
// One tick = 60 s (see TICK_SECONDS). Phase 0 used minutes; Phase 1 switched to seconds.
export type Seconds = number;
export const TICK_SECONDS = 60;

// One raw observation, after the adapter has mapped it into our schema.
export interface Event {
  id: string;
  source_id: string;
  source_type: SourceType;
  gateway_id?: string; // sensors behind the same gateway share failures
  zone_id: string;
  kind: EventKind;
  value?: number; // e.g. rain mm/h, queue length
  reported_severity?: number; // 0..1 as claimed by the source
  occurred_at: Seconds; // source's own clock (may be skewed, R9; can even be > arrived_at)
  arrived_at: Seconds; // engine clock: when the engine received it (R8 uses this)
  retracts?: string; // id of an event this one cancels
  text?: string; // citizen text: DATA ONLY, never instructions
  narrative_id?: string; // rumor/narrative cluster tag
}

// What the engine knows about a source. No hidden truth here.
export interface SourceRegistryEntry {
  source_id: string;
  source_type: SourceType;
  zone_id: string;
  gateway_id?: string;
  heartbeat_interval_s: Seconds; // how often it normally says "I am alive"
  nominal_latency_s: Seconds; // typical delay between event and arrival
}

export interface Zone {
  zone_id: string;
  name: string;
  neighbours: string[]; // zone ids that touch this one (cascades spread along these)
}

export interface Gateway {
  gateway_id: string;
  zone_ids: string[]; // zones whose sensors relay through this gateway
}

// The PUBLIC description of the city the engine may see. The simulator's
// hidden version (true reliability, clock offsets) lives in sim/truth.ts.
export interface PublicRegistry {
  zones: Zone[];
  gateways: Gateway[];
  sources: SourceRegistryEntry[];
}

// Status of a source as seen by the engine at one tick.
export type SourceStatus = "ok" | "stale" | "dark";

// One forecast line: "event X likely between p10 and p90 minutes from now".
export interface ForecastItem {
  kind: EventKind;
  probability: number; // already weighted by P(cascade)
  window_p10: Seconds;
  window_p90: Seconds;
}

// One evidence contribution, for explanations (R7).
export interface EvidenceContribution {
  description: string;
  llr: number; // log-likelihood ratio, CASCADE vs the rest
}

// Per-source learned trust, Beta(alpha, beta) (R4).
export interface TrustSnapshot {
  source_id: string;
  alpha: number;
  beta: number;
  mean: number; // alpha / (alpha + beta)
}

// Everything the engine outputs for one simulated minute.
export interface TickRecord {
  tick_time: Seconds;
  probabilities: Record<Hypothesis, number>;
  action: Action;
  expected_costs: Record<Action, number>;
  forecast: ForecastItem[]; // next 3 events
  top_evidence: EvidenceContribution[]; // top 3 by |llr|
  changes: string[]; // "why it changed" sentences
  degraded: boolean; // R5: sources went dark, uncertainty widened
  fallback: boolean; // R11: main engine failed, baseline used
  source_statuses: Record<string, SourceStatus>;
  trust: TrustSnapshot[];
  retroactive_revisions: string[]; // late events that would have changed a past tick
  quarantined_ids: string[]; // malformed events rejected this tick
}
