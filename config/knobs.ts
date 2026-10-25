// config/knobs.ts
// Decision and robustness knobs. All hand-set, tune later.

export const KNOBS = {
  // Hysteresis (R6)
  escalate_consecutive_ticks: 2, // optimal action must be higher for 2 ticks in a row
  deescalate_consecutive_ticks: 4, // ...and lower for 4 ticks before stepping down
  deescalate_max_p_cascade: 0.1, // only step down if P(cascade) is below this
  min_dwell_ticks: 3, // stay at least 3 ticks on any action
  fast_commit_p_cascade: 0.9, // skip waiting if P(cascade) is above this

  // Rumor waves: a single narrative cluster counts as at most this many
  // "weak sensor" evidence units unless physically corroborated.
  rumor_cap_units: 1,

  // Near-duplicate clustering (R10): same zone + kind within this window.
  near_dup_window_minutes: 2,

  // Clock skew tolerance when ordering events (R9).
  skew_tolerance_minutes: 2,

  // A source is "stale" / "dark" after this many silent minutes (R5).
  stale_after_minutes: 3,
  dark_after_minutes: 5,

  // Calibration temperature (fit on dev seeds in Phase 2). 1 = no change.
  temperature: 1,
};

// Naive count-threshold baseline (engine/baseline.ts), also the future FALLBACK (R11).
// Count distinct, non-retracted anomaly events that ARRIVED in the last 5 minutes,
// then map the count to an action and a fixed probability vector.
// Thresholds hand-set by eyeballing DEV episodes only (never test).
export const BASELINE_KNOBS = {
  window_seconds: 300,
  prepare_at: 30, // >= 30 anomalies in 5 min -> PREPARE
  alert_at: 40, // >= 40 -> ALERT
  escalate_at: 55, // >= 55 -> ESCALATE
  // Probability vector per bucket [NOISE, SENSOR_FAILURE, ISOLATED_INCIDENT, CASCADING_CRISIS].
  // Simple rule of thumb: more anomalies => less NOISE, more CASCADE. Each row sums to 1.
  bucket_probabilities: {
    WATCH: [0.7, 0.12, 0.12, 0.06],
    PREPARE: [0.4, 0.15, 0.3, 0.15],
    ALERT: [0.2, 0.1, 0.35, 0.35],
    ESCALATE: [0.08, 0.07, 0.25, 0.6],
  },
};
