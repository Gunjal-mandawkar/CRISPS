// eval/trace.ts
// Look inside single episodes.
//   npx tsx eval/trace.ts --split test --episode test-cascade-5126       tick-by-tick belief and action
//   npx tsx eval/trace.ts --split test --group cutout --policy engine    one line per episode in the group(s)
// --group matches the start of the group name ("cutout" = cutout:cameras + cutout:gateway).

import { BASE_RATES } from "../config/transitions";
import { ACTIONS, type TickRecord } from "../engine/types";
import { groupOf, loadSplit, type Split } from "../sim/dataset";
import { POLICIES } from "./baselines";
import { runEpisode } from "./run";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const split = (arg("split") ?? "test") as Split;
const policy = POLICIES[arg("policy") ?? "engine"];
const eps = loadSplit(split);
const p = (x: number) => x.toFixed(3);
const lvl = (r: TickRecord) => ACTIONS.indexOf(r.action);

const id = arg("episode");
if (id) {
  const ep = eps.find((e) => e.episode_id === id);
  if (!ep) throw new Error(`no episode ${id} in ${split}`);
  const t = ep.truth;
  console.log(`${id}  group ${groupOf(ep)}  truth ${t.hypothesis}  onset ${t.onset !== undefined ? (t.onset / 60).toFixed(1) : "-"} min  critical ${t.critical_time !== undefined ? (t.critical_time / 60).toFixed(1) : "-"} min`);
  const stages = Object.entries(t.stage_times).map(([k, s]) => `${k} ${((s as number) / 60).toFixed(1)}`).join(", ");
  console.log(`first stage starts (min): ${stages || "-"}`);
  console.log(" min  P(NOISE) P(SENS)  P(ISO)   P(CASC)  action    E[cost]  coverage flags");
  const { records } = runEpisode(policy, ep);
  const b = BASE_RATES;
  console.log(`   0  ${p(b.NOISE)}    ${p(b.SENSOR_FAILURE)}    ${p(b.ISOLATED_INCIDENT)}    ${p(b.CASCADING_CRISIS)}    (prior: the belief before the first tick)`);
  for (const r of records) {
    const flags = [r.degraded ? "DEGRADED" : "", r.fallback ? "FALLBACK" : ""].join(" ").trim();
    const pr = r.probabilities;
    console.log(
      `${String(r.tick_time / 60).padStart(4)}  ${p(pr.NOISE)}    ${p(pr.SENSOR_FAILURE)}    ${p(pr.ISOLATED_INCIDENT)}    ${p(pr.CASCADING_CRISIS)}    ${r.action.padEnd(9)} ${Number.isFinite(r.expected_cost) ? r.expected_cost.toFixed(2).padStart(6) : "     -"}   ${r.source_summary.coverage.toFixed(2)}    ${flags}`,
    );
  }
} else {
  const g = arg("group") ?? "cutout";
  console.log(`policy ${policy.name}, split ${split}, groups starting with "${g}"`);
  console.log(`${"episode".padEnd(28)} ${"group".padEnd(20)} ${"base".padEnd(18)} ${"truth".padEnd(18)} ${"max action".padEnd(10)} first ALERT+  ESCALATE ticks  degraded ticks  fallback`);
  for (const ep of eps.filter((e) => groupOf(e).startsWith(g))) {
    const { records } = runEpisode(policy, ep);
    const max = ACTIONS[Math.max(...records.map(lvl))];
    const firstAlert = records.find((r) => lvl(r) >= 2);
    console.log(
      `${ep.episode_id.padEnd(28)} ${groupOf(ep).padEnd(20)} ${(ep.truth.base_type ?? "-").padEnd(18)} ${ep.truth.hypothesis.padEnd(18)} ${max.padEnd(10)} ${(firstAlert ? `min ${firstAlert.tick_time / 60}` : "-").padEnd(12)}  ${String(records.filter((r) => r.action === "ESCALATE").length).padStart(14)}  ${String(records.filter((r) => r.degraded).length).padStart(14)}  ${records.filter((r) => r.fallback).length}`,
    );
  }
}
