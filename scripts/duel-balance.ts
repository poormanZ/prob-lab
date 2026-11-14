// Ranks duel options by how far a run gets when that option is always taken first.
// Usage: node scripts/duel-balance.ts [--runs 3000] [--write]
import { writeFileSync } from "node:fs";
import { autoDuel, DUEL_OPTION_IDS, duelOptionName, type AutoMode, type Chooser } from "../src/duel.ts";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const RUNS = Number(arg("--runs") ?? 3000);
let seed = 20261115;
const rng = (): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const measure = (mode: AutoMode) => {
  let sum = 0, full = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const k = autoDuel(mode, rng);
    sum += k;
    if (k > 20) full += 1;
  }
  return { avg: +(sum / RUNS).toFixed(2), full: +(full / RUNS).toFixed(4) };
};

const random = measure({ chooser: "random" });
const rows = DUEL_OPTION_IDS.map((id) => {
  const r = measure({ chooser: "priority", priority: [id] });
  console.log(id, duelOptionName(id), r.avg, `(${r.avg >= random.avg ? "+" : ""}${(r.avg - random.avg).toFixed(2)})`);
  return { id, name: duelOptionName(id), avg: r.avg, diff: +(r.avg - random.avg).toFixed(2) };
}).sort((a, b) => b.avg - a.avg);
const priority = rows.map((r) => r.id);
const base = Object.fromEntries((["none", "random", "priority", "greedy"] as Chooser[]).map((c) => [c, c === "random" ? random : measure({ chooser: c, priority })]));
const report = { runs: RUNS, base, rows };
console.log(base);
if (process.argv.includes("--write")) writeFileSync(new URL("../src/duel-report.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
