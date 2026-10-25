// config/transitions.ts
// Transition matrix for the forward filter: P(hypothesis next minute | hypothesis now).
// Rows sum to 1.
//
// Each episode has ONE true situation, so the belief should mostly "stay put".
// Every minute we let a small share FORGET of it drift back to the base rates:
//   T[a][b] = (1 - FORGET) * (a == b ? 1 : 0) + FORGET * PRIOR[b]
// With no evidence at all, the belief slowly returns to the base rates (never
// to some arbitrary hypothesis), and an early mistake can be undone.
// Hand-set, tune later.

import { HYPOTHESES, type Hypothesis } from "../engine/types";
import { PRIOR } from "./priors";

export const FORGET = 0.02;

export const TRANSITIONS: Record<Hypothesis, Record<Hypothesis, number>> = Object.fromEntries(
  HYPOTHESES.map((a) => [a, Object.fromEntries(HYPOTHESES.map((b) => [b, (1 - FORGET) * (a === b ? 1 : 0) + FORGET * PRIOR[b]]))]),
) as Record<Hypothesis, Record<Hypothesis, number>>;

// Kept under its old name: always-WATCH and the twin-test metric use it.
export const BASE_RATES: Record<Hypothesis, number> = PRIOR;
