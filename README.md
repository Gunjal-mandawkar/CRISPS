# The First 10 Minutes

An online prediction and decision system for the first minutes of a possible city crisis.
Every simulated minute it reads a messy multi-source event stream and outputs:

1. calibrated probabilities over NOISE, SENSOR_FAILURE, ISOLATED_INCIDENT, CASCADING_CRISIS
2. a recommended action (WATCH, PREPARE, ALERT, ESCALATE) that minimizes expected cost
3. a forecast of the next 3 events with time windows
4. a plain-language explanation of why the belief or action changed

Full spec: [docs/SPEC.md](docs/SPEC.md). Status: **Phase 4 done (one gate item missed, see the report)**: learning between episodes (per-source Beta trust with forgetting, learned base rates with decay, CUSUM drift detector), dev-tuned likelihood tables and measured forecast lags (`npm run tune`), trust-weighted DEGRADED, and the prior-shift evaluation. On the test split the tuned engine beats the hand-set one on Brier (0.414 vs 0.427) and both beat count-threshold on Brier, false alarms (2.5% vs 34.8%) and cost (2.62 vs 7.73 per tick). Learning the base rate moves the prior as designed on the prior-shift sequence (P(cascade) 0.06 at episode 25, 0.22 at 75) but does not lower Brier there (0.401 vs 0.397 static). Lead time is still behind count-threshold (-6.2 vs -3.9 min). Phase reports: [docs/phase-reports/](docs/phase-reports/).

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
| R12 | Demo mode | seeded deterministic scenarios exist; demo scripts in Phase 6 |

## LIMITATIONS

Full write-up in Phase 6. Known so far (Phase 4):

- **Calibrated against its own simulator.** The likelihood tables are tuned on dev episodes and the forecast lags are measured on dev cascades, and both come from the simulator we wrote. A good score says the engine fits our simulator; it says nothing yet about a real city. In a real deployment, tuning on data generated from your own assumptions would be circular. For a competition with a fixed simulator, tuning on dev and reporting test is the right method.
- **Lead time is poor** (-6.2 min on test: the first ALERT comes about 6 minutes after the first hospital stage). In the simulator, cascades and lookalikes look alike until the cascade diverges, which happens late. Tuning did not change that.
- **Learning the base rate did not help Brier** on the prior-shift sequence (0.401 vs 0.397 static, episodes 51-100) or on 10 dev-seeded copies of it (adaptive worse on 9 of 10). The prior moves as designed. A 20-episode memory is noisy, and in our simulator the evidence soon outweighs the prior.
- **Per-source trust learns source TYPES, not individual sources.** The simulator draws each source's reliability fresh every episode, so a source id has no lasting personality to learn. Citizen channels end up mid-table (0.71), because in the simulator they rarely make loud false reports outside the few rumor waves.
- **DEGRADED never fires on simulated data.** No simulated cutout removes enough trust-weighted coverage to drop below 0.5. The rule is unit-tested on a hand-made city.
- **Dev/test benchmark mix**: dev and test are about 28% cascades by construction, against a configured base rate of 10%. The tuner was constrained (do-no-harm rules) so that it could not buy Brier with extra false alarms.
