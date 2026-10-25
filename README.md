# The First 10 Minutes

An online prediction and decision system for the first minutes of a possible city crisis.
Every simulated minute it reads a messy multi-source event stream and outputs:

1. calibrated probabilities over NOISE, SENSOR_FAILURE, ISOLATED_INCIDENT, CASCADING_CRISIS
2. a recommended action (WATCH, PREPARE, ALERT, ESCALATE) that minimizes expected cost
3. a forecast of the next 3 events with time windows
4. a plain-language explanation of why the belief or action changed

Full spec: [docs/SPEC.md](docs/SPEC.md). Status: **Phase 5 done**: a local demo dashboard (vanilla HTML/JS) fed by an Express server over Server-Sent Events, with Single, Twin, Prior-Shift and Eval modes, six pre-picked demo scenarios and `npm run demo-check`. No engine logic changed in Phase 5. Phase 4 results still stand: on the test split the tuned engine beats the hand-set one on Brier (0.414 vs 0.427) and both beat count-threshold on Brier, false alarms (2.5% vs 34.8%) and cost (2.62 vs 7.73 per tick). Learning the base rate moves the prior as designed on the prior-shift sequence (P(cascade) 0.06 at episode 25, 0.22 at 75) but does not lower Brier there (0.401 vs 0.397 static). Lead time is still behind count-threshold (-6.2 vs -3.9 min). Phase reports: [docs/phase-reports/](docs/phase-reports/).

## How to run the demo

```bash
npm install
npm run sim -- --build      # builds data/episodes/ (gitignored), about 15 s
npm run eval -- --split test --policy engine   # optional: fills the Eval tab cache (else the server runs it on first open, ~40 s)
npm run dev                 # starts the server on port 3000 (PORT=xxxx to change)
# open http://localhost:3000
npm run demo-check          # replays the 6 demo scenarios silently and checks each one
```

Pick a scenario, press Play (or Space), and watch. Speed 1x = 1 s per simulated minute, 4x = 250 ms (a 45-minute episode in about 11 s).
Keys: Space play/pause, Right arrow = next tick while paused, R reset, 1 / 2 / 4 speed. Hover the belief timeline for exact numbers,
click an event in the feed to see its evidence unit in "Why it changed", click a source type in "Source trust" for its trust over the episode.

| Mode | What it shows |
|---|---|
| Single | Probability bars, action badge + expected cost, stacked belief timeline, forecast (pending / confirmed / missed), why it changed, event feed (DUP, RET, Q, cluster badges), source trust, DEGRADED / FALLBACK banners |
| Twin | Both twins side by side in lockstep, SPLIT line, pre-split identity check, first divergence with both explanations |
| Prior-Shift | The learned P(cascade) prior over 100 episodes, true hypothesis dots, running Brier adaptive vs static, CUSUM status |
| Eval | always-watch, count-threshold, engine (hand-set), engine (tuned) on every metric, breakdown by episode type |

Demo scenarios (all from the test split, `server/scenarios.ts`): Twin Test (test-twin-5221), Gateway Outage + Rumor Wave (test-sensor_failure-5045, a lying gateway), Cutout (test-cutout-5234), Real Cascade (test-cascade-5139), Rain Only (test-rain_only-5170), Rumor Wave (test-rumor_wave-5250).
The Cutout scenario shows DEGRADED with a **demo-only threshold of 80%** trust-weighted coverage (engine default 50%, which no simulated cutout reaches); the banner says so.
Every replay is a cold start (configured base rates, type-prior trust), like the first episode of an eval run.

## Architecture

```
sim/ (seeded episodes + hidden GroundTruth)
  │  events only, truth stays behind
  ▼
engine/adapter → validate (quarantine) → log (arrived_at <= now, dedupe, retractions)
  → order (cleaned 15-min window) + source-status (live/stale/dark)
  → cluster (near-dup, narrative) + grouping (gateway lie, rumor cap, weather) → evidence units
  → forecast check (causal graph) → filter (Bayesian, log-space, scores units x source trust)
  → forecast + lookahead → decide (cost + hysteresis) → explain (templates)   engine/tick.ts runs it all
  │  TickRecord every minute (fallback.ts catches failures)
  │  after the episode, the revealed outcome goes ONLY to engine/learn.ts:
  │  trust.ts (Beta trust), priors.ts (decayed counts), drift.ts (CUSUM) -> next episode's start state
  ▼
server/ (Express + SSE) → dashboard/ (vanilla HTML/JS)

eval/ runs ~200 seeded episodes, compares to baselines, and is the only
place (besides sim/) that reads ground truth.
```

| Folder | What lives there |
|---|---|
| `config/` | Tables: likelihoods (dev-tuned, generated) and likelihoods-handset (originals), lags (measured, generated), transitions, costs, causal graph, knobs, priors, trust priors |
| `engine/` | The decision engine. Never imports `sim/` |
| `sim/` | Simulator and simulator-only truth types (`sim/truth.ts`) |
| `eval/` | Metrics, baselines, harness |
| `server/` | Express + Server-Sent Events: replay, twin, prior-shift, eval, demo scenarios, `demo-check` |
| `dashboard/` | Vanilla HTML/JS/CSS dashboard (`index.html`, `app.js`, `style.css`), canvas charts, no framework |
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
npm run eval -- --split dev --policy engine     # engine (tuned) vs engine-handset vs baselines, trust panel
npm run eval -- --split test --policy engine    # same on test, plus the dev/test agreement table
npm run eval -- --split prior-shift --policy engine   # 100 episodes IN ORDER: engine vs static prior, prior over time, CUSUM
npm run eval -- --split dev --policy all        # every policy, incl. engine-static-prior / engine-full-learning / engine-frozen

# Tuning (one-time, dev only; refuses any other split). Rewrites config/likelihoods.ts and config/lags.ts
npm run tune -- --split dev
npx tsx eval/trace.ts --split test --episode test-cascade-5120   # tick-by-tick belief of one episode (engine-frozen: no learning history)
npx tsx eval/trace.ts --split test --group cutout                # one line per episode of a group
npx tsx eval/trace.ts --split test --episode test-cascade-5120 --detail 5,10,15   # + explanation text at those minutes
npx tsx eval/trace.ts --split test --twin test-twin-5200         # twin pair side by side, identity check up to the split
npx tsx eval/separability.ts --split dev        # how separable cascades vs lookalikes are, minute by minute

npm run dev          # demo server + dashboard on http://localhost:3000
npm run demo-check   # smoke test of the 6 demo scenarios
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
| R1 | Honest probabilities + twin test | partial: Bayesian forward filter on de-duplicated evidence units, likelihoods tuned on dev Brier; Brier 0.414 (test). Twins byte-identical up to the split (tested); pre-split overconfidence 0.021. No temperature calibration (temperature knob still 1) |
| R2 | Optimal stopping + cost model | done: expected-cost action choice from config/costs.ts plus one-step lookahead (defer / anticipate) in engine/decide.ts. Lookahead has no measurable effect on dev |
| R3 | Foresight (causal forecast) | done: next 3 stages with p10-p90 windows and P(cascade) x pass-through; confirmed forecasts add to CASCADE, missed ones subtract; "no further escalation" when benign dominates. Forecast accuracy 80% (test). Lags measured on dev cascades (config/lags.ts), which come from our own simulator |
| R4 | Learning + prior shifts | done, with a caveat: per-source Beta trust (forgetting 0.98, judged on revealed event labels), base rates from decayed counts (0.95, floor 2%), CUSUM (k 0.05, h 3.0) that switches to fast forgetting (0.8 for 10 episodes). The prior adapts (P(cascade) 0.06 -> 0.22 across the shift) but adaptive priors did not lower Brier on the prior-shift sequence or on 10 dev-seeded copies of it. CUSUM fired on 9 of 10 dev copies (median episode ~70), not on the test sequence. Dev/test are benchmark buckets, so the prior is only learned on the prior-shift sequence |
| R5 | Adversity + cutouts | done: validation + quarantine, live/stale/dark, silence nudge, coverage widening + DEGRADED (trust-weighted coverage < 0.5 since Phase 4; tested, but no simulated cutout is big enough to trigger it), gateway perfect-correlation detector, rumor cap |
| R6 | Stability (hysteresis) | done: 2 up / 4 down + P(cascade) thresholds / dwell 3 / fast commit > 0.9 (engine/decide.ts) |
| R7 | Explainability | done: top 3 evidence units by LLR, what changed and why (incl. "Revised: ..." on retraction, gateway lost), forecast in words. Template sentences only |
| R8 | Strict future-data isolation | done for the engine: log refuses arrived_at > now, future-injection test on the engine, engine/ never imports sim/ or eval/ (tested) |
| R9 | Clock skew | partial: hidden per-source offsets (+/- 2 min) in the simulator; the engine orders with a 2-min tolerance using nominal latency, no per-source offset learning yet |
| R10 | Near-duplicate clustering | done: same zone + kind within 3 min, weight 1 + ln(n), surge protection (n >= 30, value sd > 3), retraction at cluster level |
| R11 | Safe fallback | done: try/catch around steps 5-8, count-threshold baseline, action capped at the previous one, FALLBACK flag, fallback ticks in eval |
| R12 | Demo mode | done: local dashboard over SSE (Single / Twin / Prior-Shift / Eval), 6 seeded demo scenarios from the test split, `npm run demo-check`. Cutout scenario uses a demo-only DEGRADED threshold (0.8) |

## LIMITATIONS

Read these before trusting any number in this repo.

1. **The data is synthetic.** Every episode comes from our own simulator (`sim/`). Calibration (Brier 0.414 on test) is verified only on that simulator; it says nothing yet about a real city. The likelihood tables are tuned on dev episodes and the forecast lags are measured on dev cascades, so a good score means "fits our simulator".
2. **The causal graph and likelihoods are hand-specified, not discovered.** The chain rain -> drainage -> traffic -> calls -> hospitals -> power, its lags and every likelihood table were written by hand (then nudged by a small dev-set tuner). Nothing was learned from real incident data.
3. **Learning is lightweight.** Per-source Beta trust counts, base rates from decayed counts and a CUSUM drift detector; no deep learning. Learning the base rate did not lower Brier on the prior-shift sequence (0.401 vs 0.397 static, episodes 51-100), and trust learns source types rather than individual sources.
4. **City-wide decision only.** One action for the whole city; there is no per-zone action, even though evidence is tracked per zone.
5. **Full recompute per tick.** Each tick re-clusters the 15-minute window and rescores changed units. That is fine at simulator scale (~1,200 events per 45-minute episode, ~100 sources) but would not scale to a real city's event volume without incremental indexes.
6. **No LLM in the core loop.** Explanations are template sentences filled from the evidence units; they can be clumsy ("Little change: 15 evidence unit(s) updated") but they never invent anything.
7. **A different cost model or data format needs recalibration.** Organizers may use another cost model or event schema. The adapter (`engine/adapter.ts`) can map schema differences, but the likelihoods, thresholds and costs would need to be re-tuned on their data.
8. **Lead time is negative.** On test the first ALERT comes about 6 minutes after the critical time (-6.2 min; count-threshold -3.9). In the simulator, cascades and their lookalikes diverge late, so a calibrated engine cannot commit early without false alarms. This is a limit of the scenario design as much as of the engine.

Also known:

- **DEGRADED never fires at the engine's default threshold on simulated data.** No simulated cutout drops trust-weighted coverage below 0.5 (lowest on test: 0.74). The demo's Cutout scenario raises the threshold to 0.8 for that scenario only.
- **Twin divergence takes about 4-5 minutes.** After the split, the next cascade stage needs ~2 minutes to start and 1-3 minutes to be reported, so no twin pair (test or dev) differs by more than 0.1 within 3 minutes; the best demo pair differs by 0.64 within 5 minutes.
- **Dev/test benchmark mix**: dev and test are about 28% cascades by construction, against a configured base rate of 10%. The tuner was constrained (do-no-harm rules) so that it could not buy Brier with extra false alarms.
- **Per-source trust learns source TYPES, not individual sources.** The simulator draws each source's reliability fresh every episode, so a source id has no lasting personality to learn.
