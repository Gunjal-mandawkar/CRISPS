# The First 10 Minutes

An online prediction and decision system for the first minutes of a possible city crisis.
Every simulated minute it reads a messy multi-source event stream and outputs:

1. calibrated probabilities over NOISE, SENSOR_FAILURE, ISOLATED_INCIDENT, CASCADING_CRISIS
2. a recommended action (WATCH, PREPARE, ALERT, ESCALATE) that minimizes expected cost
3. a forecast of the next 3 events with time windows
4. a plain-language explanation of why the belief or action changed

Full spec: [docs/SPEC.md](docs/SPEC.md). Status: **Phase 1 done** (simulator, naive baseline, eval skeleton). No Bayesian engine yet. Phase reports: [docs/phase-reports/](docs/phase-reports/).

## Architecture

```
sim/ (seeded episodes + hidden GroundTruth)
  │  events only, truth stays behind
  ▼
engine/adapter → validate (quarantine) → log (arrived_at <= now)
  → dedupe + retractions → cluster (gateway / rumor / near-dup)
  → filter (Bayesian, log-space) → decide (cost + hysteresis)
  → forecast (causal graph) → explain (templates)
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
npm run eval -- --split dev --policy all
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
| R1 | Honest probabilities + twin test | eval only: Brier, log-loss, twin score; twin pairs in the simulator |
| R2 | Optimal stopping + cost model | eval only: cost matrix scoring with growing WATCH-under-cascade cost |
| R3 | Foresight (causal forecast) | not started |
| R4 | Learning + prior shifts | simulator only: 100-episode prior-shift sequence, drifting-reliability sources |
| R5 | Adversity + cutouts | simulator only: gateway outage + lie, cutouts, rumor waves, backlog bursts, fuzz events |
| R6 | Stability (hysteresis) | eval only: flip-flop metric |
| R7 | Explainability | not started |
| R8 | Strict future-data isolation | partial: eval passes only `arrived_at <= t`; baseline has a future-injection test; engine/ never imports sim/ (tested) |
| R9 | Clock skew | simulator only: hidden per-source offsets (+/- 2 min) |
| R10 | Near-duplicate clustering | simulator only: duplicate storms and genuine surges |
| R11 | Safe fallback | baseline ready in engine/baseline.ts; wiring in Phase 3 |
| R12 | Demo mode | seeded deterministic scenarios exist; demo scripts in Phase 6 |

## LIMITATIONS

_Placeholder. Filled in Phase 6. Will state plainly anything only partly done._
