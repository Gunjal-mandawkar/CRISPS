// eval/report.ts
// Aggregate per-episode results into the summary table.

import { mean } from "./metrics";
import { COMMIT_P, type EpisodeResult } from "./run";

export interface Summary {
  episodes: number;
  ticks: number;
  brier: number;
  log_loss: number;
  cost_per_tick: number; // mean of per-episode cost/tick (length-normalized)
  cost_total: number; // raw sum over all ticks of all episodes
  cascades: number;
  cascades_alerted: number;
  mean_lead_min: number;
  benign: number;
  false_alarms: number;
  false_alarm_rate: number;
  flips_total: number;
  flips_per_episode: number;
  twin_pre_split_overconf: number;
  twin_commit_cascade_min: number;
  twin_commit_cascade_never: number;
  twin_commit_benign_min: number;
  twin_commit_benign_never: number;
  fallback_ticks: number;
}

// "Benign" = nothing real is happening: NOISE or SENSOR_FAILURE truth.
const isBenign = (r: EpisodeResult) => r.hypothesis === "NOISE" || r.hypothesis === "SENSOR_FAILURE";

export function summarize(rs: EpisodeResult[]): Summary {
  const cas = rs.filter((r) => r.hypothesis === "CASCADING_CRISIS");
  const ben = rs.filter(isBenign);
  const twins = rs.filter((r) => r.twin_role !== undefined);
  const commits = (role: string) => twins.filter((r) => r.twin_role === role);
  const done = (xs: EpisodeResult[]) => xs.filter((r) => r.commit_min !== null && r.commit_min !== undefined).map((r) => r.commit_min!);
  const fa = ben.filter((r) => r.any_alert).length;
  return {
    episodes: rs.length,
    ticks: rs.reduce((s, r) => s + r.ticks, 0),
    brier: mean(rs.map((r) => r.brier)),
    log_loss: mean(rs.map((r) => r.log_loss)),
    cost_per_tick: mean(rs.map((r) => r.cost_per_tick)),
    cost_total: rs.reduce((s, r) => s + r.cost_total, 0),
    cascades: cas.length,
    cascades_alerted: cas.filter((r) => r.lead_min !== undefined).length,
    mean_lead_min: mean(cas.filter((r) => r.lead_min !== undefined).map((r) => r.lead_min!)),
    benign: ben.length,
    false_alarms: fa,
    false_alarm_rate: ben.length ? fa / ben.length : NaN,
    flips_total: rs.reduce((s, r) => s + r.flips, 0),
    flips_per_episode: mean(rs.map((r) => r.flips)),
    twin_pre_split_overconf: mean(twins.map((r) => r.pre_split_overconf!)),
    twin_commit_cascade_min: mean(done(commits("cascade"))),
    twin_commit_cascade_never: commits("cascade").length - done(commits("cascade")).length,
    twin_commit_benign_min: mean(done(commits("benign"))),
    twin_commit_benign_never: commits("benign").length - done(commits("benign")).length,
    fallback_ticks: rs.reduce((s, r) => s + r.fallback_ticks, 0),
  };
}

export function groupBy(rs: EpisodeResult[]): [string, EpisodeResult[]][] {
  const m = new Map<string, EpisodeResult[]>();
  for (const r of rs) {
    if (!m.has(r.group)) m.set(r.group, []);
    m.get(r.group)!.push(r);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

const f = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "-");
const pct = (x: number) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : "-");
const pad = (x: string | number, n: number) => String(x).padStart(n);

export function formatReport(policy: string, split: string, s: Summary, groups: [string, EpisodeResult[]][]): string {
  const L: string[] = [];
  L.push(`Policy: ${policy}   split: ${split}   episodes: ${s.episodes}   ticks: ${s.ticks}`);
  L.push("");
  L.push(`  Brier score (mean per episode, 0 best, 2 worst)  ${f(s.brier)}`);
  L.push(`  Log-loss (mean per episode)                      ${f(s.log_loss)}`);
  L.push(`  Cost per tick (mean of per-episode cost/ticks)   ${f(s.cost_per_tick, 2)}`);
  L.push(`  Total cost (raw sum over all ticks)              ${f(s.cost_total, 0)}`);
  L.push(`  Mean lead time vs critical time (min)            ${f(s.mean_lead_min, 2)}   (${s.cascades_alerted}/${s.cascades} cascades reached ALERT+)`);
  L.push(`  False-alarm rate (benign episodes with ALERT+)   ${pct(s.false_alarm_rate)}   (${s.false_alarms}/${s.benign})`);
  L.push(`  Flip-flops                                       ${s.flips_total} total, ${f(s.flips_per_episode, 2)} per episode`);
  L.push(`  Twin: pre-split overconfidence (0 = base rates)  ${f(s.twin_pre_split_overconf)}`);
  L.push(`  Twin: time-to-commit after split (p>=${COMMIT_P}, min)  cascade ${f(s.twin_commit_cascade_min, 2)} (never: ${s.twin_commit_cascade_never}), benign ${f(s.twin_commit_benign_min, 2)} (never: ${s.twin_commit_benign_never})`);
  L.push(`  Fallback ticks                                   ${s.fallback_ticks}`);
  L.push("");
  L.push(`${"group".padEnd(26)} ${pad("n", 3)} ${pad("truth", 9)} ${pad("Brier", 6)} ${pad("LogLoss", 7)} ${pad("Cost/tick", 9)} ${pad("ALERT+", 7)} ${pad("Lead(min)", 9)} ${pad("Flips", 5)}`);
  for (const [g, rs] of groups) {
    const s2 = summarize(rs);
    const truth = [...new Set(rs.map((r) => short(r.hypothesis)))].join("/");
    const alertRate = rs.filter((r) => r.any_alert).length / rs.length;
    L.push(`${g.padEnd(26)} ${pad(rs.length, 3)} ${pad(truth, 9)} ${pad(f(s2.brier), 6)} ${pad(f(s2.log_loss), 7)} ${pad(f(s2.cost_per_tick, 2), 9)} ${pad(pct(alertRate), 7)} ${pad(f(s2.mean_lead_min, 2), 9)} ${pad(s2.flips_total, 5)}`);
  }
  L.push("");
  L.push(`ALERT+ = share of episodes where the policy ever reached ALERT or ESCALATE (a false alarm when truth is NOISE/SENS).`);
  return L.join("\n");
}

const short = (h: string) => ({ NOISE: "NOISE", SENSOR_FAILURE: "SENS", ISOLATED_INCIDENT: "ISO", CASCADING_CRISIS: "CASC" })[h] ?? h;
