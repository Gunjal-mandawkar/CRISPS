// scripts/real/discover.ts
// Phase 7 step A: find out what the real NYC datasets actually look like.
// For each dataset we fetch 5 rows and read the REAL column names and types
// from the portal (Socrata sends them in the X-SODA2-Fields / X-SODA2-Types
// headers), count the rows in the Ida week, and write docs/real-data-schema.md.
// Nothing here assumes a field name: the date field is picked from the
// columns the portal reports, and the choice is printed.
//
// Run: npx tsx scripts/real/discover.ts
// Tokens (optional) are read from .env and never printed.

import { writeFileSync } from "node:fs";
import { cachedGet, readEnv, soqlUrl, socrataHeaders } from "../../real/net";

const env = readEnv();
const SOCRATA = socrataHeaders(env);

// The Ida week: Monday 30 Aug to Sunday 5 Sep 2021, local NYC time
// (Socrata floating timestamps are local time with no zone).
const IDA_FROM = "2021-08-30T00:00:00";
const IDA_TO = "2021-09-06T00:00:00";

interface Finding {
  name: string;
  id: string;
  usable: boolean;
  reason?: string;
  columns: { name: string; type: string }[];
  dateField?: string;
  locationFields: string[];
  idaRows?: number;
  note?: string;
}

const SOCRATA_DATASETS = [
  { name: "311 Service Requests", id: "erm2-nwe9" },
  { name: "DOT Traffic Speeds NBE", id: "i4gi-tjb9" },
  { name: "Motor Vehicle Collisions - Crashes", id: "h9gi-nx95" },
  { name: "EMS Incident Dispatch", id: "76xm-jjuj" },
];

// Words that suggest the main event time, best first. Used only to RANK the
// timestamp columns the portal actually reports.
const DATE_HINTS = [/^created_date$/, /incident_datetime/, /^crash_date$/, /data_as_of/, /date/, /time/];
const LOCATION_HINT = /borough|boro|community|board|zip|incident_zip|latitude|longitude|location|link|geom|zone|district|precinct|cd$/i;

function pickDateField(cols: { name: string; type: string }[]): string | undefined {
  const ts = cols.filter((c) => c.type === "floating_timestamp" || c.type === "calendar_date");
  for (const hint of DATE_HINTS) {
    const hit = ts.find((c) => hint.test(c.name));
    if (hit) return hit.name;
  }
  return ts[0]?.name;
}

function errText(e: unknown): string {
  const err = e as { message?: string; cause?: { code?: string; message?: string } };
  return [err.message, err.cause?.code, err.cause?.message].filter(Boolean).join(" / ");
}

async function discoverSocrata(name: string, id: string): Promise<Finding> {
  const f: Finding = { name, id, usable: false, columns: [], locationFields: [] };
  try {
    const sample = await cachedGet(`discover-${id}`, soqlUrl(id, { $limit: "5" }), SOCRATA);
    if (sample.status !== 200) {
      f.reason = `HTTP ${sample.status}: ${sample.body.slice(0, 200)}`;
      return f;
    }
    const names: string[] = JSON.parse(sample.headers["x-soda2-fields"] ?? "[]");
    const types: string[] = JSON.parse(sample.headers["x-soda2-types"] ?? "[]");
    f.columns = names.map((n, i) => ({ name: n, type: types[i] ?? "?" }));
    if (f.columns.length === 0) {
      // Fall back to the keys of the sample rows if the headers are missing.
      const rows = JSON.parse(sample.body) as Record<string, unknown>[];
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
      f.columns = keys.map((k) => ({ name: k, type: "unknown (no type header)" }));
    }
    f.dateField = pickDateField(f.columns);
    f.locationFields = f.columns.map((c) => c.name).filter((n) => LOCATION_HINT.test(n));
    if (!f.dateField) {
      f.reason = "no timestamp column reported";
      return f;
    }
    const count = await cachedGet(
      `discover-count-${id}`,
      soqlUrl(id, { $select: "count(*) AS n", $where: `${f.dateField} >= '${IDA_FROM}' AND ${f.dateField} < '${IDA_TO}'` }),
      SOCRATA,
    );
    if (count.status !== 200) {
      f.reason = `count query HTTP ${count.status}: ${count.body.slice(0, 200)}`;
      return f;
    }
    f.idaRows = Number((JSON.parse(count.body) as { n: string }[])[0]?.n ?? 0);
    f.usable = f.idaRows > 0;
    if (!f.usable) f.reason = `0 rows between ${IDA_FROM} and ${IDA_TO} on ${f.dateField}`;
  } catch (e) {
    f.reason = `network error: ${errText(e)}`;
  }
  return f;
}

// Syndromic / ED visits: the id 2nwr-zzis is unverified. Check what it is,
// and search the portal catalog for the right one.
async function discoverSyndromic(): Promise<Finding> {
  const f: Finding = { name: "Syndromic / ED visits", id: "2nwr-zzis (unverified)", usable: false, columns: [], locationFields: [] };
  const notes: string[] = [];
  try {
    const meta = await cachedGet("discover-meta-2nwr-zzis", "https://data.cityofnewyork.us/api/views/2nwr-zzis.json", SOCRATA);
    notes.push(meta.status === 200 ? `2nwr-zzis is "${(JSON.parse(meta.body) as { name?: string }).name}"` : `2nwr-zzis: HTTP ${meta.status}`);
    const hits: { id: string; name: string }[] = [];
    for (const q of ["syndromic", "emergency department visits"]) {
      const u = new URL("https://api.us.socrata.com/api/catalog/v1");
      u.search = new URLSearchParams({ domains: "data.cityofnewyork.us", q, limit: "10" }).toString();
      const res = await cachedGet(`discover-catalog-${q.replace(/\W+/g, "_")}`, u.toString(), SOCRATA);
      if (res.status !== 200) continue;
      for (const r of (JSON.parse(res.body) as { results: { resource: { id: string; name: string } }[] }).results)
        if (!hits.some((h) => h.id === r.resource.id)) hits.push({ id: r.resource.id, name: r.resource.name });
    }
    notes.push(`catalog hits: ${hits.map((h) => `${h.id} "${h.name}"`).join("; ") || "none"}`);
    // Prefer a daily ED-visit table; the first hit whose name says so.
    const best = hits.find((h) => /emergency department|syndromic|ed visits/i.test(h.name));
    if (best) {
      const g = await discoverSocrata(f.name, best.id);
      g.note = notes.join(". ");
      return g;
    }
    f.reason = "no ED / syndromic dataset found in the catalog";
  } catch (e) {
    f.reason = `network error: ${errText(e)}`;
  }
  f.note = notes.join(". ");
  return f;
}

// Rain: NYS Mesonet (5-minute) first if it answers without a key, otherwise NOAA.
// Note: NOAA CDO's hourly precipitation set (PRECIP_HLY) stops before 2021, so
// the hourly source is NCEI's Integrated Surface Data ("global-hourly", no token
// needed), and CDO daily summaries (GHCND, token) are used to pick rain days.
const STATIONS = [
  { name: "Central Park", ghcnd: "USW00094728", isd: "72505394728" },
  { name: "JFK", ghcnd: "USW00094789", isd: "74486094789" },
  { name: "LaGuardia", ghcnd: "USW00014732", isd: "72503014732" },
];

async function discoverRain(): Promise<Finding[]> {
  const out: Finding[] = [];
  const mesonet: Finding = { name: "NYS Mesonet 5-minute", id: "api.nysmesonet.org", usable: false, columns: [], locationFields: [] };
  try {
    const r = await cachedGet("discover-mesonet", "https://api.nysmesonet.org/data/dynserv/timeseries/5min/latest");
    mesonet.reason = r.status === 200 ? undefined : `HTTP ${r.status} (needs an account key)`;
    mesonet.usable = r.status === 200;
  } catch (e) {
    mesonet.reason = `network error: ${errText(e)}`;
  }
  out.push(mesonet);

  const isd: Finding = { name: "NOAA ISD hourly (global-hourly)", id: STATIONS.map((s) => s.isd).join(", "), usable: false, columns: [], locationFields: ["STATION", "NAME", "LATITUDE", "LONGITUDE"] };
  try {
    const u = new URL("https://www.ncei.noaa.gov/access/services/data/v1");
    u.search = new URLSearchParams({
      dataset: "global-hourly", stations: STATIONS.map((s) => s.isd).join(","),
      startDate: "2021-08-30", endDate: "2021-09-05", format: "json", includeAttributes: "false",
    }).toString();
    const r = await cachedGet("discover-isd-ida", u.toString());
    if (r.status === 200) {
      const rows = JSON.parse(r.body) as Record<string, string>[];
      const keys = [...new Set(rows.slice(0, 5).flatMap((x) => Object.keys(x)))].sort();
      isd.columns = keys.map((k) => ({ name: k, type: "string" }));
      isd.dateField = keys.includes("DATE") ? "DATE" : undefined;
      isd.idaRows = rows.length;
      isd.usable = rows.length > 0 && keys.includes("AA1"); // AA1 = liquid precipitation
      if (!isd.usable) isd.reason = keys.includes("AA1") ? "0 rows" : "no AA1 (precipitation) column";
    } else isd.reason = `HTTP ${r.status}: ${r.body.slice(0, 200)}`;
  } catch (e) {
    isd.reason = `network error: ${errText(e)}`;
  }
  out.push(isd);

  const cdo: Finding = { name: "NOAA CDO daily (GHCND)", id: STATIONS.map((s) => s.ghcnd).join(", "), usable: false, columns: [], locationFields: ["station"] };
  if (!env.NOAA_TOKEN) cdo.reason = "NOAA_TOKEN not set in .env (only needed to pick rain-control days)";
  else {
    try {
      const u = new URL("https://www.ncei.noaa.gov/cdo-web/api/v2/data");
      u.search = new URLSearchParams({
        datasetid: "GHCND", datatypeid: "PRCP", stationid: `GHCND:${STATIONS[0].ghcnd}`,
        startdate: "2021-08-30", enddate: "2021-09-05", units: "metric", limit: "5",
      }).toString();
      const r = await cachedGet("discover-cdo-ida", u.toString(), { token: env.NOAA_TOKEN });
      if (r.status === 200) {
        const rows = (JSON.parse(r.body) as { results?: Record<string, unknown>[] }).results ?? [];
        cdo.columns = [...new Set(rows.flatMap((x) => Object.keys(x)))].sort().map((k) => ({ name: k, type: typeof rows[0][k] }));
        cdo.dateField = "date";
        cdo.idaRows = rows.length;
        cdo.usable = rows.length > 0;
      } else cdo.reason = `HTTP ${r.status}: ${r.body.slice(0, 200)}`;
    } catch (e) {
      cdo.reason = `network error: ${errText(e)}`;
    }
  }
  out.push(cdo);
  return out;
}

function markdown(all: Finding[]): string {
  const lines = [
    "# Real data schema (Phase 7, step A)",
    "",
    "Generated by `npx tsx scripts/real/discover.ts`. Columns and types are what the portals",
    "returned; nothing is assumed. Ida week = 2021-08-30 to 2021-09-05 (local time).",
    "",
    "| Dataset | Confirmed id | Usable | Date field | Location fields | Ida-week rows | Reason if unusable |",
    "|---|---|---|---|---|---|---|",
    ...all.map((f) => `| ${f.name} | ${f.usable ? f.id : f.id + " (not confirmed)"} | ${f.usable ? "yes" : "NO"} | ${f.dateField ?? "-"} | ${f.locationFields.join(", ") || "-"} | ${f.idaRows ?? "-"} | ${f.reason ?? ""} |`),
    "",
  ];
  for (const f of all) {
    lines.push(`## ${f.name}`, "");
    if (f.note) lines.push(f.note, "");
    if (f.columns.length === 0) lines.push("No columns: the dataset was not reached.", "");
    else lines.push("| Column | Type |", "|---|---|", ...f.columns.map((c) => `| ${c.name} | ${c.type} |`), "");
  }
  return lines.join("\n");
}

async function main() {
  const all: Finding[] = [];
  for (const d of SOCRATA_DATASETS) all.push(await discoverSocrata(d.name, d.id));
  all.push(await discoverSyndromic());
  all.push(...(await discoverRain()));

  for (const f of all) {
    console.log(`\n== ${f.name} (${f.id}) ${f.usable ? "OK" : "UNUSABLE: " + f.reason}`);
    if (f.note) console.log(`   ${f.note}`);
    for (const c of f.columns) console.log(`   ${c.name.padEnd(36)} ${c.type}`);
    if (f.dateField) console.log(`   date field: ${f.dateField}; Ida-week rows: ${f.idaRows ?? "-"}`);
  }
  writeFileSync("docs/real-data-schema.md", markdown(all));
  // Rain counts as one dataset: usable if any rain source works.
  const rainOk = all.filter((f) => /Mesonet|ISD/.test(f.name)).some((f) => f.usable);
  const unusable = all.filter((f) => !/Mesonet|ISD|CDO/.test(f.name) && !f.usable).length + (rainOk ? 0 : 1);
  console.log(`\nwrote docs/real-data-schema.md; unusable datasets: ${unusable}`);
  if (unusable > 1) {
    console.log("STOP: more than one dataset is unusable. Review docs/real-data-schema.md before step B.");
    process.exitCode = 2;
  }
}

main();
