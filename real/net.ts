// real/net.ts
// Small helpers for talking to public data portals, shared by the discovery
// and fetch scripts. No dependencies: Node's built-in fetch only.
//
// Every raw response is cached under data/real/raw/ (gitignored). If a cached
// file exists we read it instead of the network, so a re-run is offline and
// byte-identical.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const RAW_DIR = join(process.cwd(), "data", "real", "raw");

// Read KEY=value lines from .env without printing anything. Missing file = no keys.
export function readEnv(path = join(process.cwd(), ".env")): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] !== "") out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export interface CachedResponse {
  url: string; // the request URL WITHOUT tokens (tokens go in headers)
  status: number;
  headers: Record<string, string>; // only the few headers we use
  body: string;
}

const KEEP_HEADERS = ["content-type", "x-soda2-fields", "x-soda2-types"];

// Cache file name = readable prefix + hash of the URL, so the same request
// always maps to the same file.
function cachePath(prefix: string, url: string): string {
  const h = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return join(RAW_DIR, `${prefix}-${h}.json`);
}

// GET with cache, retry and exponential backoff on 429 and 5xx.
// Tokens are passed as headers so they never appear in the URL, logs or cache.
export async function cachedGet(
  prefix: string,
  url: string,
  headers: Record<string, string> = {},
  maxTries = 5,
): Promise<CachedResponse> {
  const file = cachePath(prefix, url);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as CachedResponse;

  let wait = 2000;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers });
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < maxTries) {
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2; // 2 s, 4 s, 8 s, 16 s
      continue;
    }
    const kept: Record<string, string> = {};
    for (const k of KEEP_HEADERS) {
      const v = res.headers.get(k);
      if (v !== null) kept[k] = v;
    }
    const out: CachedResponse = { url, status: res.status, headers: kept, body: await res.text() };
    // Only successful responses are cached: a failure must be retried next run.
    if (res.ok) {
      mkdirSync(RAW_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify(out, null, 1));
    }
    return out;
  }
}

// Build a Socrata SoQL URL with URLSearchParams (never by hand).
export function soqlUrl(datasetId: string, params: Record<string, string>): string {
  const u = new URL(`https://data.cityofnewyork.us/resource/${datasetId}.json`);
  u.search = new URLSearchParams(params).toString();
  return u.toString();
}

export function socrataHeaders(env: Record<string, string>): Record<string, string> {
  return env.SOCRATA_APP_TOKEN ? { "X-App-Token": env.SOCRATA_APP_TOKEN } : {};
}
