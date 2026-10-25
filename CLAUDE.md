# CLAUDE.md

1. Read `docs/SPEC.md` first. It is the full spec (requirements R1-R12).
2. We build in phases (0-6). Each phase ends at a gate: run it, show real output, stop. Do not start the next phase until asked.
3. Keep code simple: small files, plain-language comments on the math, readable by beginners.
4. Never add heavy dependencies. Runtime: `express` only. Dev: `typescript`, `tsx`, `vitest`, `@types/node`, `@types/express`.
5. No LLM anywhere in the engine's decision loop. Explanations are template sentences.
6. The engine (`/engine`) must never import ground truth (`GroundTruth` lives in `sim/truth.ts`, simulator and eval only).
