# The First 10 Minutes

An online prediction and decision system for the first minutes of a possible city crisis.
Every simulated minute it reads a messy multi-source event stream and outputs:

1. calibrated probabilities over NOISE, SENSOR_FAILURE, ISOLATED_INCIDENT, CASCADING_CRISIS
2. a recommended action (WATCH, PREPARE, ALERT, ESCALATE) that minimizes expected cost
3. a forecast of the next 3 events with time windows
4. a plain-language explanation of why the belief or action changed

Full spec: [docs/SPEC.md](docs/SPEC.md). Status: **Phase 0 (scaffold only, no logic yet).**

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
npm test           # vitest
npx tsc --noEmit   # type check (also: npm run typecheck)
npm run sim        # Phase 1
npm run eval       # Phase 1
npm run dev        # Phase 5
```

Requires Node 22+ (tested on Node 22.22).

## Requirements status

| Req | Description | Status |
|---|---|---|
| R1 | Honest probabilities + twin test | not started |
| R2 | Optimal stopping + cost model | not started |
| R3 | Foresight (causal forecast) | not started |
| R4 | Learning + prior shifts | not started |
| R5 | Adversity + cutouts | not started |
| R6 | Stability (hysteresis) | not started |
| R7 | Explainability | not started |
| R8 | Strict future-data isolation | not started |
| R9 | Clock skew | not started |
| R10 | Near-duplicate clustering | not started |
| R11 | Safe fallback | not started |
| R12 | Demo mode | not started |

## LIMITATIONS

_Placeholder. Filled in Phase 6. Will state plainly anything only partly done._
