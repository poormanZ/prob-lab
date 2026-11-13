// Tunes option magnitudes so a full stack (MAX_STACKS) of each option lifts per-run EV by the same target,
// because players choose options and strong ones end up stacked. Then measures the full game.
// Usage: node scripts/balance.ts [--target 0.5] [--runs 100000] [--write]
import { writeFileSync } from "node:fs";
import {
  autoPlayRun, DEFAULT_TUNING, MAX_STACKS, OPTION_IDS, optionLabel, OPTIONS,
  type AutoPlayMode, type OptionId, type Rng, type Tuning,
} from "../src/game.ts";

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const TARGET = Number(arg("target", "0.5"));
const RUNS = Number(arg("runs", "100000"));
const WRITE = process.argv.includes("--write");

const seeded = (seed: number): Rng => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Same seed for every call: common random numbers keep comparisons and binary search smooth.
const ev = (tuning: Tuning, mode: AutoPlayMode, runs = RUNS): number => {
  const rng = seeded(12345);
  let sum = 0;
  for (let i = 0; i < runs; i += 1) sum += autoPlayRun(mode, rng, tuning).payout;
  return sum / runs;
};

const RANGES: Partial<Record<OptionId, [number, number]>> = {
  A1: [0, 0.5], A2: [0, 0.03], A3: [0, 0.3], A4: [0, 0.03], A5: [0, 1], A6: [0, 0.3], A8: [0, 1],
  B1: [0, 0.5], B2: [0, 1], B3: [0, 1], C1: [0, 1], C2: [0, 0.8], C3: [0, 0.8], C4: [0, 0.5], C5: [0, 1000], C6: [0, 500],
  D1: [0, 1], D2: [0, 0.5], D3: [0, 1000], D4: [0, 500], D5: [0, 1],
};
const DECREASING = new Set<OptionId>(["A5", "B2", "B3", "C1"]);

const base = ev(DEFAULT_TUNING, {});
const effect = (tuning: Tuning, ids: OptionId[]): number => ev(tuning, { start: ids }) / base - 1;

const tuning: Tuning = { ...DEFAULT_TUNING };
for (const id of OPTION_IDS) {
  const range = RANGES[id];
  if (!range) continue;
  let [lo, hi] = range;
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    const tooStrong = effect({ ...tuning, [id]: mid }, Array(MAX_STACKS).fill(id)) > TARGET;
    if (tooStrong !== DECREASING.has(id)) hi = mid; else lo = mid;
  }
  tuning[id] = (lo + hi) / 2;
}

// Round to values that read well in the UI.
const ROUND: Partial<Record<OptionId, number>> = { A1: 0.005, A5: 0.01, A6: 0.005, A8: 0.01, B2: 0.01, B3: 0.01, C5: 5, C6: 5, D5: 0.01, A2: 0.001, A3: 0.01, A4: 0.001, B1: 0.01, C1: 0.05, C2: 0.01, C3: 0.01, C4: 0.01, D1: 0.01, D2: 0.01, D3: 10, D4: 5 };
for (const id of OPTION_IDS) {
  const step = ROUND[id];
  if (step) tuning[id] = Math.max(step, Math.round(tuning[id] / step) * step);
}

const rows = OPTION_IDS.map((id) => ({
  id,
  group: OPTIONS[id].group,
  m: tuning[id],
  label: optionLabel(id, tuning),
  one: effect(tuning, [id]),
  three: effect(tuning, Array(MAX_STACKS).fill(id)),
})).sort((a, b) => b.three - a.three);

const priority = rows.map((r) => r.id);
const fullGreedy = ev(tuning, { chooser: "priority", priority }) / base;
const fullRandom = ev(tuning, { chooser: "random" }) / base;

const report = { target: TARGET, runs: RUNS, base, fullGreedy, fullRandom, tuning, rows };
console.log(`base ${base.toFixed(1)}원 | full greedy x${fullGreedy.toFixed(2)} | full random x${fullRandom.toFixed(2)}`);
for (const r of rows) console.log(`${r.id} ${r.label.padEnd(36)} one ${(r.one * 100).toFixed(1)}% three ${(r.three * 100).toFixed(1)}%`);
if (WRITE) writeFileSync(new URL("../src/balance-report.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
