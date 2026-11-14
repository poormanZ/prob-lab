export type Action = "attack" | "defend" | "charge";
export const ACTIONS: readonly Action[] = ["attack", "defend", "charge"];
export const ACTION_NAME: Record<Action, string> = { attack: "공격", defend: "방어", charge: "충전" };
export const LAST_STAGE = 20;
export const OFFER_SIZE = 3;

/** Enemy grows with the stage: 0 → 1/0/0, 20 → 11/7/5 (hp/atk/def). */
export const ENEMY = { hpEvery: 2, atkEvery: 3, defEvery: 4 };
export const enemyAt = (stage: number): Fighter => ({
  hp: 1 + Math.floor(stage / ENEMY.hpEvery),
  atk: Math.ceil(stage / ENEMY.atkEvery),
  def: Math.floor(stage / ENEMY.defEvery),
});
export interface Fighter { hp: number; atk: number; def: number }

export type DuelGroup = "능력" | "공격" | "방어" | "충전" | "간파";
export const DUEL_OPTION_IDS = ["S1", "S2", "S3", "A1", "A2", "A3", "D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "E1"] as const;
export type DuelOptionId = (typeof DUEL_OPTION_IDS)[number];
export type DuelTuning = Record<DuelOptionId, number>;
export const DUEL_TUNING: DuelTuning = {
  S1: 1, S2: 1, S3: 1, A1: 1, A2: 2, A3: 1, D1: 1, D2: 0.2, D3: 1, D4: 0.1, C1: 1, C2: 1, C3: 1, C4: 1, E1: 0.25,
};

interface DuelOptionDef { group: DuelGroup; name: string; max: number; desc: (m: number, n: number) => string }
const p100 = (v: number): string => `${+(v * 100).toFixed(1)}%`;
export const DUEL_OPTIONS: Record<DuelOptionId, DuelOptionDef> = {
  S1: { group: "능력", name: "체력", max: 99, desc: (m) => `최대 체력 +${m}` },
  S2: { group: "능력", name: "공격력", max: 99, desc: (m) => `공격력 +${m}` },
  S3: { group: "능력", name: "방어력", max: 99, desc: (m) => `방어력 +${m}` },
  A1: { group: "공격", name: "선제", max: 1, desc: () => "서로 공격하면 내가 먼저 때림. 쓰러뜨리면 안 맞음" },
  A2: { group: "공격", name: "관통", max: 3, desc: (m) => `공격할 때 상대 방어력 ${m} 무시` },
  A3: { group: "공격", name: "빈틈", max: 3, desc: (m) => `상대가 충전할 때 공격하면 피해 +${p100(m)}` },
  D1: { group: "방어", name: "반격", max: 3, desc: (m) => `방어로 막은 피해의 ${p100(m)}를 되돌려 줌` },
  D2: { group: "방어", name: "회피", max: 3, desc: (m) => `맞을 때 ${p100(m)} 확률로 안 맞음` },
  D3: { group: "방어", name: "부활", max: 3, desc: () => "쓰러질 때 1번 체력 1로 버팀. 판 전체에서 1번" },
  D4: { group: "방어", name: "위압", max: 3, desc: (m) => `상대가 공격 고를 확률 ${p100(m)}p 줄고 그만큼 방어` },
  C1: { group: "충전", name: "강충전", max: 3, desc: (m) => `충전 배율 +${m} (×2 → ×${2 + m})` },
  C2: { group: "충전", name: "충전 방어", max: 1, desc: () => "충전 중 맞아도 방어력만큼 덜 맞음" },
  C3: { group: "충전", name: "예열", max: 1, desc: () => "스테이지를 충전 1번 된 상태로 시작" },
  C4: { group: "충전", name: "기 흡수", max: 1, desc: () => "방어할 때 상대가 충전하면 나도 충전" },
  E1: { group: "간파", name: "간파", max: 3, desc: (m) => `턴마다 ${p100(m)} 확률로 상대 행동이 미리 보임` },
};

export type Stacks = Partial<Record<DuelOptionId, number>>;
export const duelOptionName = (id: DuelOptionId): string => DUEL_OPTIONS[id].name;
export const duelOptionDesc = (id: DuelOptionId, tuning: DuelTuning = DUEL_TUNING): string => DUEL_OPTIONS[id].desc(tuning[id], 1);

export interface Kit {
  maxHp: number; atk: number; def: number;
  firstStrike: boolean; pierce: number; punish: number;
  counter: number; dodge: number; awe: number;
  chargePower: number; chargeGuard: boolean; preheat: boolean; absorb: boolean;
  peek: number;
}
export const kitOf = (stacks: Stacks, t: DuelTuning = DUEL_TUNING): Kit => {
  const n = (id: DuelOptionId): number => stacks[id] ?? 0;
  return {
    maxHp: 1 + n("S1") * t.S1, atk: 1 + n("S2") * t.S2, def: 1 + n("S3") * t.S3,
    firstStrike: n("A1") > 0, pierce: n("A2") * t.A2, punish: n("A3") * t.A3,
    counter: n("D1") * t.D1, dodge: Math.min(0.9, n("D2") * t.D2), awe: Math.min(1 / 3, n("D4") * t.D4),
    chargePower: 1 + n("C1") * t.C1, chargeGuard: n("C2") > 0, preheat: n("C3") > 0, absorb: n("C4") > 0,
    peek: Math.min(1, n("E1") * t.E1),
  };
};

export const enemyOdds = (kit: Kit): Record<Action, number> => ({ attack: 1 / 3 - kit.awe, defend: 1 / 3 + kit.awe, charge: 1 / 3 });

/** One fight position. `r` is run-wide revives left. */
export interface Pos { h: number; e: number; mc: number; ec: number; r: number }
export interface Outcome {
  p: number; pos: Pos; end: "win" | "lose" | null;
  taken: number; dealt: number; dodged: boolean; revived: boolean; countered: number;
}

/** Every random branch of one turn. The DP and the live game both read this, so they cannot disagree. */
export const resolve = (kit: Kit, foe: Fighter, s: Pos, a: Action, b: Action): Outcome[] => {
  const myAtk = kit.atk * (s.mc ? 1 + kit.chargePower : 1);
  const foeAtk = foe.atk * (s.ec ? 2 : 1);
  const chargeUp = 1;
  const base = (): Outcome => ({ p: 1, pos: { ...s }, end: null, taken: 0, dealt: 0, dodged: false, revived: false, countered: 0 });

  const hitMe = (o: Outcome, dmg: number): Outcome[] => {
    if (dmg <= 0) return [o];
    const land = (p: number): Outcome => {
      const x: Outcome = { ...o, p: o.p * p, pos: { ...o.pos }, taken: dmg };
      x.pos.h -= dmg;
      if (x.pos.h <= 0 && x.pos.r > 0) { x.pos.h = 1; x.pos.r -= 1; x.revived = true; }
      if (x.pos.h <= 0) { x.pos.h = 0; x.end = "lose"; }
      return x;
    };
    if (kit.dodge <= 0) return [land(1)];
    return [{ ...o, p: o.p * kit.dodge, pos: { ...o.pos }, dodged: true }, land(1 - kit.dodge)];
  };
  const hitFoe = (o: Outcome, dmg: number): Outcome => {
    if (o.end || dmg <= 0) return o;
    const x: Outcome = { ...o, pos: { ...o.pos }, dealt: o.dealt + dmg };
    x.pos.e -= dmg;
    if (x.pos.e <= 0) { x.pos.e = 0; x.end = "win"; }
    return x;
  };
  const set = (list: Outcome[], f: (p: Pos) => void): Outcome[] => list.map((o) => {
    if (!o.end) f(o.pos);
    return o;
  });

  if (a === "attack" && b === "attack") {
    const start = base();
    start.pos.mc = 0;
    start.pos.ec = 0;
    if (kit.firstStrike) {
      const first = hitFoe(start, myAtk);
      return first.end ? [first] : hitMe(first, foeAtk);
    }
    return hitMe(start, foeAtk).map((o) => hitFoe(o, myAtk));
  }
  if (a === "attack") {
    const start = base();
    start.pos.mc = 0;
    const dmg = b === "defend" ? Math.max(0, myAtk - Math.max(0, foe.def - kit.pierce)) : Math.floor(myAtk * (1 + kit.punish));
    return set([hitFoe(start, dmg)], (p) => { if (b === "charge") p.ec = 1; });
  }
  if (a === "defend") {
    if (b === "attack") {
      const taken = Math.max(0, foeAtk - kit.def);
      const back = Math.floor((foeAtk - taken) * kit.counter);
      const start = base();
      start.pos.ec = 0;
      return hitMe(start, taken).map((o) => {
        if (o.end || back <= 0) return o;
        return { ...hitFoe(o, back), countered: back };
      });
    }
    return set([base()], (p) => {
      if (b === "charge") { p.ec = 1; if (kit.absorb) p.mc = chargeUp; }
    });
  }
  // charge
  if (b === "attack") {
    const start = base();
    start.pos.ec = 0;
    return set(hitMe(start, Math.max(0, foeAtk - (kit.chargeGuard ? kit.def : 0))), (p) => { p.mc = chargeUp; });
  }
  return set([base()], (p) => {
    p.mc = chargeUp;
    if (b === "charge") p.ec = 1;
  });
};

export interface Advice { blind: Record<Action, number>; seen: Record<Action, Record<Action, number>>; value: number }
export interface StageSolver { advise: (s: Pos) => Advice; best: (s: Pos, seen: Action | null) => Action; value: (s: Pos) => number }

const PICK_ORDER: Action[] = ["attack", "charge", "defend"];
const argmax = (q: Record<Action, number>): Action => {
  let best: Action = PICK_ORDER[0];
  for (const a of PICK_ORDER) if (q[a] > q[best] + 1e-12) best = a;
  return best;
};

/**
 * Exact best clear chance for one stage. Positions are solved in blocks of equal (r, e, h):
 * leaving a block always lowers r, e or h, so only the small charge cycle inside a block needs iterating.
 */
export const solveStage = (kit: Kit, foe: Fighter): StageSolver => {
  const odds = enemyOdds(kit);
  const nLocal = 4;
  const memo = new Map<number, Float64Array>();
  const keyOf = (r: number, h: number, e: number): number => (r * 256 + h) * 65536 + e;
  const local = (p: Pos): number => p.mc * 2 + p.ec;

  const solveBlock = (r: number, h: number, e: number): Float64Array => {
    const key = keyOf(r, h, e);
    const hit = memo.get(key);
    if (hit) return hit;
    // Edges: [local][a][b] → list of (prob, constant, inBlockIndex | -1)
    const edges: { p: number; c: number; j: number }[][][][] = [];
    for (let i = 0; i < nLocal; i += 1) {
      const pos: Pos = { h, e, r, mc: i >> 1, ec: i & 1 };
      edges[i] = ACTIONS.map((a) => ACTIONS.map((b) => resolve(kit, foe, pos, a, b).map((o) => {
        if (o.end) return { p: o.p, c: o.end === "win" ? 1 : 0, j: -1 };
        if (o.pos.r === r && o.pos.h === h && o.pos.e === e) return { p: o.p, c: 0, j: local(o.pos) };
        return { p: o.p, c: solveBlock(o.pos.r, o.pos.h, o.pos.e)[local(o.pos)], j: -1 };
      })));
    }
    const v = new Float64Array(nLocal);
    const pb = ACTIONS.map((b) => odds[b]);
    for (let iter = 0; iter < 2000; iter += 1) {
      let delta = 0;
      for (let i = 0; i < nLocal; i += 1) {
        const q = edges[i].map((row) => row.map((list) => list.reduce((s, x) => s + x.p * (x.j >= 0 ? v[x.j] : x.c), 0)));
        let blind = 0, seen = 0;
        for (let ai = 0; ai < 3; ai += 1) blind = Math.max(blind, q[ai][0] * pb[0] + q[ai][1] * pb[1] + q[ai][2] * pb[2]);
        for (let bi = 0; bi < 3; bi += 1) seen += pb[bi] * Math.max(q[0][bi], q[1][bi], q[2][bi]);
        const next = kit.peek * seen + (1 - kit.peek) * blind;
        delta = Math.max(delta, Math.abs(next - v[i]));
        v[i] = next;
      }
      if (delta < 1e-12) break;
    }
    memo.set(key, v);
    return v;
  };

  const valueAt = (p: Pos): number => (p.e <= 0 ? 1 : p.h <= 0 ? 0 : solveBlock(p.r, p.h, p.e)[local(p)]);
  const advise = (s: Pos): Advice => {
    const seen = {} as Record<Action, Record<Action, number>>;
    const blind = {} as Record<Action, number>;
    for (const a of ACTIONS) {
      seen[a] = {} as Record<Action, number>;
      blind[a] = 0;
      for (const b of ACTIONS) {
        seen[a][b] = resolve(kit, foe, s, a, b).reduce((sum, o) => sum + o.p * (o.end === "win" ? 1 : o.end === "lose" ? 0 : valueAt(o.pos)), 0);
        blind[a] += odds[b] * seen[a][b];
      }
    }
    return { blind, seen, value: valueAt(s) };
  };
  const best = (s: Pos, seenAction: Action | null): Action => {
    const adv = advise(s);
    if (!seenAction) return argmax(adv.blind);
    return argmax({ attack: adv.seen.attack[seenAction], defend: adv.seen.defend[seenAction], charge: adv.seen.charge[seenAction] });
  };
  return { advise, best, value: valueAt };
};

export type DuelStatus = "fight" | "offer" | "dead" | "clear";
export interface DuelState {
  stage: number; stacks: Stacks; status: DuelStatus;
  pos: Pos; turn: number; offer: DuelOptionId[] | null;
  peek: Action; peekSeen: boolean;
}
export interface TurnResult extends Outcome { mine: Action; theirs: Action; state: DuelState }

const drawEnemy = (kit: Kit, rng: () => number): Action => {
  const odds = enemyOdds(kit);
  const x = rng();
  return x < odds.attack ? "attack" : x < odds.attack + odds.defend ? "defend" : "charge";
};
/** Pre-draws the enemy move so 간파 shows the real one. */
const withPeek = (s: DuelState, rng: () => number): DuelState => {
  const kit = kitOf(s.stacks);
  const peek = drawEnemy(kit, rng);
  return { ...s, peek, peekSeen: kit.peek > 0 && rng() < kit.peek };
};

export const startStage = (stage: number, stacks: Stacks, revives: number, rng: () => number): DuelState => {
  const kit = kitOf(stacks);
  const pos: Pos = { h: kit.maxHp, e: enemyAt(stage).hp, mc: kit.preheat ? 1 : 0, ec: 0, r: revives };
  return withPeek({ stage, stacks, status: "fight", pos, turn: 0, offer: null, peek: "attack", peekSeen: false }, rng);
};
export const newDuel = (rng: () => number): DuelState => startStage(0, {}, 0, rng);
export const visiblePeek = (s: DuelState): Action | null => (s.status === "fight" && s.peekSeen ? s.peek : null);

export const drawOffer = (stacks: Stacks, rng: () => number): DuelOptionId[] => {
  const pool = DUEL_OPTION_IDS.filter((id) => (stacks[id] ?? 0) < DUEL_OPTIONS[id].max);
  const out: DuelOptionId[] = [];
  while (out.length < OFFER_SIZE && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
};

export const act = (s: DuelState, mine: Action, rng: () => number): TurnResult => {
  if (s.status !== "fight") throw new Error("not fighting");
  const kit = kitOf(s.stacks);
  const theirs = s.peek;
  const outcomes = resolve(kit, enemyAt(s.stage), s.pos, mine, theirs);
  let x = rng(), o = outcomes[outcomes.length - 1];
  for (const c of outcomes) { if (x < c.p) { o = c; break; } x -= c.p; }
  let state: DuelState = { ...s, pos: o.pos, turn: s.turn + 1 };
  if (o.end === "lose") state = { ...state, status: "dead" };
  else if (o.end === "win") {
    state = s.stage >= LAST_STAGE
      ? { ...state, status: "clear" }
      : { ...state, status: "offer", offer: drawOffer(s.stacks, rng) };
  } else state = withPeek(state, rng);
  return { ...o, mine, theirs, state };
};

export const choose = (s: DuelState, id: DuelOptionId, rng: () => number): DuelState => {
  if (s.status !== "offer" || !s.offer?.includes(id)) throw new Error("not offered");
  const stacks = { ...s.stacks, [id]: (s.stacks[id] ?? 0) + 1 };
  return startStage(s.stage + 1, stacks, s.pos.r + (id === "D3" ? 1 : 0), rng);
};

/** Stages cleared, 0 … LAST_STAGE + 1. */
export const clearedOf = (s: DuelState): number => s.stage + (s.status === "dead" || s.status === "fight" ? 0 : 1);

const solverCache = new Map<string, StageSolver>();
export const solverFor = (stacks: Stacks, stage: number, tuning: DuelTuning = DUEL_TUNING): StageSolver => {
  const kit = kitOf(stacks, tuning);
  const foe = enemyAt(stage);
  const key = `${JSON.stringify(kit)}|${foe.hp},${foe.atk},${foe.def}`;
  let solver = solverCache.get(key);
  if (!solver) {
    if (solverCache.size > 4000) solverCache.clear();
    solver = solveStage(kit, foe);
    solverCache.set(key, solver);
  }
  return solver;
};

export type Chooser = "greedy" | "priority" | "random" | "none";
export interface AutoMode { chooser: Chooser; priority?: readonly DuelOptionId[] }

/** Clear chance of the next stage if `id` is taken now. */
export const nextClearWith = (s: DuelState, id: DuelOptionId | null): number => {
  const stacks = id ? { ...s.stacks, [id]: (s.stacks[id] ?? 0) + 1 } : s.stacks;
  const kit = kitOf(stacks);
  const stage = s.stage + 1;
  const r = s.pos.r + (id === "D3" ? 1 : 0);
  return solverFor(stacks, stage).value({ h: kit.maxHp, e: enemyAt(stage).hp, mc: kit.preheat ? 1 : 0, ec: 0, r });
};

const pickOption = (s: DuelState, mode: AutoMode, rng: () => number): DuelOptionId => {
  const offer = s.offer!;
  if (mode.chooser === "greedy") {
    let best = offer[0], bestV = -1;
    for (const id of offer) {
      const v = nextClearWith(s, id);
      if (v > bestV + 1e-12) { best = id; bestV = v; }
    }
    return best;
  }
  if (mode.chooser === "priority" && mode.priority) {
    for (const id of mode.priority) if (offer.includes(id)) return id;
  }
  return offer[Math.floor(rng() * offer.length)];
};

/** Plays one full run with the exact per-stage policy. "none" skips the option but still advances. */
export const autoDuel = (mode: AutoMode, rng: () => number): number => {
  let s = newDuel(rng);
  for (let guard = 0; guard < 100_000; guard += 1) {
    if (s.status === "dead" || s.status === "clear") return clearedOf(s);
    if (s.status === "offer") {
      s = mode.chooser === "none"
        ? startStage(s.stage + 1, s.stacks, s.pos.r, rng)
        : choose(s, pickOption(s, mode, rng), rng);
      continue;
    }
    const solver = solverFor(s.stacks, s.stage);
    s = act(s, solver.best(s.pos, visiblePeek(s)), rng).state;
  }
  return clearedOf(s);
};

export interface StageRow { stage: number; foe: Fighter; baseClear: number }
export const enemyTable = (): StageRow[] => Array.from({ length: LAST_STAGE + 1 }, (_, stage) => {
  const foe = enemyAt(stage);
  const kit = kitOf({});
  return { stage, foe, baseClear: solveStage(kit, foe).value({ h: kit.maxHp, e: foe.hp, mc: 0, ec: 0, r: 0 }) };
});
