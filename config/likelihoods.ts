// config/likelihoods.ts
// P(seeing this event kind in a given minute | hypothesis).
// Bigger number = this kind of event is more typical under that hypothesis.
// All values are placeholders: hand-set, tune later (Phase 2).

import type { EventKind, Hypothesis } from "../engine/types";

type Row = Record<Hypothesis, number>;
const flat = (p: number): Row => ({
  NOISE: p,
  SENSOR_FAILURE: p,
  ISOLATED_INCIDENT: p,
  CASCADING_CRISIS: p,
});

// Placeholder: every kind is equally likely under every hypothesis,
// so in Phase 0 no event moves the belief at all.
export const LIKELIHOODS: Record<EventKind, Row> = {
  rain_heavy: flat(0.1),
  drainage_anomaly: flat(0.1),
  traffic_slowdown: flat(0.1),
  emergency_call_spike: flat(0.1),
  hospital_arrivals_unusual: flat(0.1),
  power_comms_load: flat(0.1),
  citizen_report: flat(0.1),
  heartbeat: flat(1),
  gateway_heartbeat_lost: flat(0.1),
  retraction: flat(1),
};
