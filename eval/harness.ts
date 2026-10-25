// eval/harness.ts
// `npm run eval -- --split dev|test --policy always-watch|count-threshold`
// Runs the policy tick by tick over every episode of the split, prints the
// summary table, and saves it to data/eval-results.json (merged by split/policy).
// Only /eval and /sim may read ground truth.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSplit, type Split } from "../sim/dataset";
import { POLICIES } from "./baselines";
import { formatReport, groupBy, summarize } from "./report";
import { runEpisode } from "./run";

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

function main(): void {
  const split = arg("split", "test") as Split;
  const policyName = arg("policy", "count-threshold");
  const names = policyName === "all" ? Object.keys(POLICIES) : [policyName];
  const episodes = loadSplit(split);
  const outFile = join(process.cwd(), "data", "eval-results.json");
  const saved: Record<string, unknown> = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};

  for (const name of names) {
    const policy = POLICIES[name];
    if (!policy) throw new Error(`unknown --policy ${name}. Options: ${Object.keys(POLICIES).join(", ")}, all`);
    const results = episodes.map((ep) => runEpisode(policy, ep).result);
    const summary = summarize(results);
    const groups = groupBy(results);
    console.log(formatReport(name, split, summary, groups));
    console.log("");
    saved[`${split}/${name}`] = {
      summary,
      groups: Object.fromEntries(groups.map(([g, rs]) => [g, summarize(rs)])),
      episodes: results,
    };
  }
  // sorted keys so the file is byte-identical for identical runs
  const ordered = Object.fromEntries(Object.keys(saved).sort().map((k) => [k, saved[k]]));
  writeFileSync(outFile, JSON.stringify(ordered, null, 1));
  console.log(`saved ${outFile}`);
}

main();
