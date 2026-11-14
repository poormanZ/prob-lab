// Ranks duel options by how far a run gets when that option is always taken first
// and every other pick maximizes the next stage's clear chance ("greedy").
// A chain option is measured together with its base option ([base, chain]).
// Usage: node scripts/duel-balance.ts [--runs 3000] [--write]
import { writeFileSync } from "node:fs";
import { autoDuel, DUEL_OPTION_IDS, DUEL_OPTIONS, duelOptionName, ENEMY, type AutoMode, type Chooser, type DuelOptionId } from "../src/duel.ts";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const RUNS = Number(arg("--runs") ?? 3000);
if (arg("--enemy")) Object.assign(ENEMY, JSON.parse(arg("--enemy")!));
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

const greedy = measure({ chooser: "greedy" });
const alone = new Map<DuelOptionId, number>();
const rows = DUEL_OPTION_IDS.map((id) => {
  const req = DUEL_OPTIONS[id].requires;
  const r = measure({ chooser: "priority", priority: req ? [req, id] : [id], fallback: "greedy" });
  if (!req) alone.set(id, r.avg);
  return { id, name: duelOptionName(id), requires: req ?? null, avg: r.avg, diff: +(r.avg - greedy.avg).toFixed(2) };
}).map((row) => ({ ...row, chainGain: row.requires ? +(row.avg - alone.get(row.requires)!).toFixed(2) : null }))
  .sort((a, b) => b.avg - a.avg);
for (const r of rows) console.log(r.id, r.name, r.avg, r.diff, r.chainGain ?? "");
// A chain option can only be taken after its base, so list it right after the base.
const ordered = rows.filter((r) => !r.requires).flatMap((r) => [r, ...rows.filter((c) => c.requires === r.id)]);
const priority = ordered.map((r) => r.id);
const base = Object.fromEntries((["none", "random", "priority", "greedy"] as Chooser[]).map((c) => [c, c === "greedy" ? greedy : measure({ chooser: c, priority })]));
const report = { runs: RUNS, enemy: { ...ENEMY }, base, rows: ordered };
console.log(base);
if (process.argv.includes("--write")) writeFileSync(new URL("../src/duel-report.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
