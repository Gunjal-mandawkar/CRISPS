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
