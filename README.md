# The First 10 Minutes

An online prediction and decision system for the first minutes of a possible city crisis.
Every simulated minute it reads a messy multi-source event stream and outputs:

1. calibrated probabilities over NOISE, SENSOR_FAILURE, ISOLATED_INCIDENT, CASCADING_CRISIS
2. a recommended action (WATCH, PREPARE, ALERT, ESCALATE) that minimizes expected cost
3. a forecast of the next 3 events with time windows
4. a plain-language explanation of why the belief or action changed

Full spec: [docs/SPEC.md](docs/SPEC.md). Status: **Phase 3 done**: engine core plus near-duplicate clustering (weight 1 + ln n, surge protection), common-cause grouping (lying-gateway detector, rumor cap, one weather event per zone), causal-chain forecast with time windows, one-step lookahead and template explanations. On the test split it beats count-threshold on Brier (0.431 vs 0.724), false alarms (3.8% vs 34.8%) and cost (2.63 vs 7.73 per tick); forecast accuracy 82%. It is still later than count-threshold (lead -6.2 vs -3.9 min). No learning yet (Phase 4). Phase reports: [docs/phase-reports/](docs/phase-reports/).

## Architecture

```
sim/ (seeded episodes + hidden GroundTruth)
  │  events only, truth stays behind
  ▼
engine/adapter → validate (quarantine) → log (arrived_at <= now, dedupe, retractions)
  → order (cleaned 15-min window) + source-status (live/stale/dark)
  → cluster (near-dup, narrative) + grouping (gateway lie, rumor cap, weather) → evidence units
  → forecast check (causal graph) → filter (Bayesian, log-space, scores units)
  → forecast + lookahead → decide (cost + hysteresis) → explain (templates)   engine/tick.ts runs it all
  │  TickRecord every minute (fallback.ts catches failures)
  ▼
server/ (Express + SSE) → dashboard/ (vanilla HTML/JS)

eval/ runs ~200 seeded episodes, compares to baselines, and is the only
place (besides sim/) that reads ground truth.
```

| Folder | What lives there |
|---|---|
| `config/` | Hand-set tables: likelihoods, transitions, costs, causal graph, knobs, trust priors |
| `engine/` | The decision engine. Never imports `sim/` |
| `sim/` | Simulator and simulator-only truth types (`sim/truth.ts`) |
| `eval/` | Metrics, baselines, harness |
| `server/` | Express + Server-Sent Events |
| `dashboard/` | Vanilla HTML/JS page |
| `tests/` | Vitest unit tests |
| `docs/` | Spec and notes |

## How to run

```bash
npm install
npx tsc --noEmit   # type check (also: npm run typecheck)
npm test           # vitest

# Simulator (writes data/episodes/, which is gitignored)
npm run sim -- --build                          # dev (302), test (302), prior-shift (100) episodes
npm run sim -- --stats                          # size / duration table per episode type
npm run sim -- --type cascade --seed 7 --print  # minute-by-minute timeline + ground-truth stage times
npm run sim -- --type twin --seed 7 --print     # both twins, with the split line and prefix check
#   other types: noise sensor_failure isolated rain_only storm_calls flu_cluster gateway_outage
#                cutout rumor_wave duplicate_storm surge drifting   (options: --variant v --fuzz --json)

# Eval (needs --build first; saves data/eval-results.json)
npm run eval -- --split test --policy always-watch
npm run eval -- --split test --policy count-threshold
npm run eval -- --split test --policy engine    # the Bayesian engine + 3-row comparison + delta line
npm run eval -- --split dev --policy all
npx tsx eval/trace.ts --split test --episode test-cascade-5120   # tick-by-tick belief of one episode
npx tsx eval/trace.ts --split test --group cutout                # one line per episode of a group
npx tsx eval/trace.ts --split test --episode test-cascade-5120 --detail 5,10,15   # + explanation text at those minutes
npx tsx eval/trace.ts --split test --twin test-twin-5200         # twin pair side by side, identity check up to the split
npx tsx eval/separability.ts --split dev        # how separable cascades vs lookalikes are, minute by minute

npm run dev        # Phase 5
```

Requires Node 22.12+ (tested on Node 22.22).

### Time, seeds, events

- Time is whole **seconds** since episode start. One tick = 60 s. Episodes are 38-45 minutes (cascades 45).
- Seeds: dev 1000+, test 5000+, prior-shift 8000+. Same (type, seed, options) gives byte-identical JSON.
- `occurred_at` is the source's own (skewed) clock, `arrived_at` is the engine clock. A source whose clock runs fast can report `occurred_at > arrived_at`.
- Every source sends a heartbeat about every 5 minutes, so an episode has ~1,000 heartbeats on top of 150-600 "real" events. The 100-700 health range counts non-heartbeat events.

## Requirements status

| Req | Description | Status |
|---|---|---|
| R1 | Honest probabilities + twin test | partial: Bayesian forward filter on de-duplicated evidence units; Brier 0.431 (test). Twins byte-identical up to the split (tested); pre-split overconfidence 0.035. No temperature calibration yet (Phase 4) |
| R2 | Optimal stopping + cost model | done: expected-cost action choice from config/costs.ts plus one-step lookahead (defer / anticipate) in engine/decide.ts. Lookahead has no measurable effect on dev |
| R3 | Foresight (causal forecast) | done: next 3 stages with p10-p90 windows and P(cascade) x pass-through; confirmed forecasts add to CASCADE, missed ones subtract; "no further escalation" when benign dominates. Forecast accuracy 82% (test). Lags are the simulator's own |
| R4 | Learning + prior shifts | simulator only: 100-episode prior-shift sequence, drifting-reliability sources |
| R5 | Adversity + cutouts | done for Phase 3 scope: validation + quarantine, live/stale/dark, silence nudge, coverage widening + DEGRADED, gateway perfect-correlation detector (lie FA 0%, Brier 0.390), rumor cap |
| R6 | Stability (hysteresis) | done: 2 up / 4 down + P(cascade) thresholds / dwell 3 / fast commit > 0.9 (engine/decide.ts) |
| R7 | Explainability | done: top 3 evidence units by LLR, what changed and why (incl. "Revised: ..." on retraction, gateway lost), forecast in words. Template sentences only |
| R8 | Strict future-data isolation | done for the engine: log refuses arrived_at > now, future-injection test on the engine, engine/ never imports sim/ or eval/ (tested) |
| R9 | Clock skew | simulator only: hidden per-source offsets (+/- 2 min) |
| R10 | Near-duplicate clustering | done: same zone + kind within 3 min, weight 1 + ln(n), surge protection (n >= 30, value sd > 3), retraction at cluster level |
| R11 | Safe fallback | done: try/catch around steps 5-8, count-threshold baseline, action capped at the previous one, FALLBACK flag, fallback ticks in eval |
| R12 | Demo mode | seeded deterministic scenarios exist; demo scripts in Phase 6 |

## LIMITATIONS

_Placeholder. Filled in Phase 6. Will state plainly anything only partly done._
