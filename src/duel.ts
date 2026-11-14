export type Action = "attack" | "defend" | "charge";
export const ACTIONS: readonly Action[] = ["attack", "defend", "charge"];
export const ACTION_NAME: Record<Action, string> = { attack: "공격", defend: "방어", charge: "충전" };
export const LAST_STAGE = 20;
export const OFFER_SIZE = 3;
export const MAX_COMBO = 3;

/**
 * Growth = linear + quadratic per stage. The quadratic part keeps late stages hard,
 * because a stacked build grows faster than a linear enemy. Stage 0 has attack 0 so the first option is always earned.
 */
export const ENEMY = { hp: 0.5, atk: 1 / 3, def: 0.25, hp2: 0.1, atk2: 0.03, def2: 0.03 };
const grow = (s: number, k1: number, k2: number): number => s * k1 + s * s * k2;
export const enemyAt = (stage: number): Fighter => ({
  hp: 1 + Math.floor(grow(stage, ENEMY.hp, ENEMY.hp2) + 1e-9),
  atk: Math.max(0, Math.ceil(grow(stage, ENEMY.atk, ENEMY.atk2) - 1e-9)),
  def: Math.floor(grow(stage, ENEMY.def, ENEMY.def2) + 1e-9),
});
export interface Fighter { hp: number; atk: number; def: number }

export type DuelGroup = "능력" | "공격" | "방어" | "충전" | "간파";
export const DUEL_OPTION_IDS = [
  "S1", "S2", "S3", "S4", "A1", "A2", "A3", "A4", "D1", "D2", "D3", "D4", "D5", "C1", "C2", "C3", "C4", "E1", "E2",
  "X1", "X2", "X3", "X4", "X5", "X6", "X7",
] as const;
export type DuelOptionId = (typeof DUEL_OPTION_IDS)[number];
export type DuelTuning = Record<DuelOptionId, number>;
export const DUEL_TUNING: DuelTuning = {
  S1: 1, S2: 1, S3: 1, S4: 1, A1: 1, A2: 2, A3: 1, A4: 1, D1: 1, D2: 0.2, D3: 1, D4: 0.08, D5: 1,
  C1: 1, C2: 1, C3: 1, C4: 1, E1: 0.25, E2: 1, X1: 1, X2: 1, X3: 1, X4: 1, X5: 1, X6: 1, X7: 1,
};

/** `requires`: a chain option is offered only after its base option is owned. */
interface DuelOptionDef { group: DuelGroup; name: string; max: number; requires?: DuelOptionId; desc: (m: number, n: number) => string }
const p100 = (v: number): string => `${+(v * 100).toFixed(1)}%`;
export const DUEL_OPTIONS: Record<DuelOptionId, DuelOptionDef> = {
  S1: { group: "능력", name: "체력", max: 99, desc: (m) => `최대 체력 +${m}` },
  S2: { group: "능력", name: "공격력", max: 99, desc: (m) => `공격력 +${m}` },
  S3: { group: "능력", name: "방어력", max: 99, desc: (m) => `방어력 +${m}` },
  S4: { group: "능력", name: "단련", max: 1, desc: (m) => `체력·공격력·방어력 옵션 1개당 +${m} 더 (이미 가진 것 포함)` },
  A1: { group: "공격", name: "선제", max: 1, desc: () => "서로 공격하면 내가 먼저 때림. 쓰러뜨리면 안 맞음" },
  A2: { group: "공격", name: "관통", max: 3, desc: (m) => `공격할 때 상대 방어력 ${m} 무시` },
  A3: { group: "공격", name: "빈틈", max: 3, desc: (m) => `상대가 충전할 때 공격하면 피해 +${p100(m)}` },
  A4: { group: "공격", name: "연타", max: 3, desc: (m) => `공격이 들어갈 때마다 다음 공격 +${m} (최대 ${MAX_COMBO}번 쌓임). 다른 행동·막힘이면 초기화` },
  D1: { group: "방어", name: "반격", max: 3, desc: (m) => `방어로 막은 피해의 ${p100(m)}를 되돌려 줌` },
  D2: { group: "방어", name: "회피", max: 3, desc: (m) => `맞을 때 ${p100(m)} 확률로 안 맞음` },
  D3: { group: "방어", name: "부활", max: 2, desc: () => "쓰러질 때 1번 체력 1로 버팀. 판 전체에서 1번" },
  D4: { group: "방어", name: "위압", max: 3, desc: (m) => `상대가 공격 고를 확률 ${p100(m)}p 줄고 그만큼 방어` },
  D5: { group: "방어", name: "가시", max: 3, desc: (m) => `맞을 때마다 상대도 ${m} 피해` },
  C1: { group: "충전", name: "강충전", max: 3, desc: (m) => `충전 배율 +${m} (×2 → ×${2 + m})` },
  C2: { group: "충전", name: "충전 방어", max: 1, desc: () => "충전 중 맞아도 방어력만큼 덜 맞음" },
  C3: { group: "충전", name: "예열", max: 1, desc: () => "스테이지를 충전 1번 된 상태로 시작" },
  C4: { group: "충전", name: "기 흡수", max: 1, desc: () => "방어할 때 상대가 충전하면 나도 충전" },
  E1: { group: "간파", name: "간파", max: 3, desc: (m) => `턴마다 ${p100(m)} 확률로 상대 행동이 미리 보임` },
  E2: { group: "간파", name: "전리품", max: 2, desc: (m) => `옵션을 고를 때 ${m}개 더 보임` },
  X1: { group: "방어", name: "잔상", max: 1, requires: "D2", desc: () => "회피 확률 +10%p. 회피하면 충전됨" },
  X2: { group: "방어", name: "불사조", max: 1, requires: "D3", desc: () => "부활할 때 체력 가득 + 충전됨" },
  X3: { group: "방어", name: "역습", max: 1, requires: "D1", desc: () => "반격 피해 2배" },
  X4: { group: "충전", name: "철벽", max: 1, requires: "S3", desc: () => "방어로 공격을 다 막으면 충전됨" },
  X5: { group: "충전", name: "충전 관통", max: 1, requires: "C1", desc: () => "충전 배율 +1. 충전된 공격은 상대 방어력 무시" },
  X6: { group: "간파", name: "통찰", max: 1, requires: "E1", desc: () => "간파 확률 +25%p. 간파로 상대 행동이 보인 턴의 공격 피해 ×2" },
  X7: { group: "공격", name: "연쇄", max: 1, requires: "A4", desc: () => "연타 보너스 2배" },
};

export type Stacks = Partial<Record<DuelOptionId, number>>;
export const duelOptionName = (id: DuelOptionId): string => DUEL_OPTIONS[id].name;
export const duelOptionDesc = (id: DuelOptionId, tuning: DuelTuning = DUEL_TUNING): string => DUEL_OPTIONS[id].desc(tuning[id], 1);
export const isOfferable = (id: DuelOptionId, stacks: Stacks): boolean => {
  const def = DUEL_OPTIONS[id];
  return (stacks[id] ?? 0) < def.max && (!def.requires || (stacks[def.requires] ?? 0) > 0);
};

export interface Kit {
  maxHp: number; atk: number; def: number;
  firstStrike: boolean; pierce: number; punish: number;
  counter: number; dodge: number; awe: number;
  chargePower: number; chargeGuard: boolean; preheat: boolean; absorb: boolean;
  peek: number; combo: number; thorns: number;
  afterimage: boolean; phoenix: boolean; bulwark: boolean; chargePierce: boolean; insight: boolean;
}
export const kitOf = (stacks: Stacks, t: DuelTuning = DUEL_TUNING): Kit => {
  const n = (id: DuelOptionId): number => stacks[id] ?? 0;
  const per = 1 + n("S4") * t.S4;
  return {
    maxHp: 1 + n("S1") * (t.S1 * per), atk: 1 + n("S2") * (t.S2 * per), def: 1 + n("S3") * (t.S3 * per),
    firstStrike: n("A1") > 0, pierce: n("A2") * t.A2, punish: n("A3") * t.A3,
    counter: n("D1") * t.D1 * (n("X3") > 0 ? 2 : 1), dodge: Math.min(0.9, n("D2") * t.D2 + (n("X1") > 0 ? 0.1 : 0)), awe: Math.min(1 / 3, n("D4") * t.D4),
    chargePower: 1 + n("C1") * t.C1 + (n("X5") > 0 ? 1 : 0), chargeGuard: n("C2") > 0, preheat: n("C3") > 0, absorb: n("C4") > 0,
    peek: Math.min(1, n("E1") * t.E1 + (n("X6") > 0 ? 0.25 : 0)), combo: n("A4") * t.A4 * (n("X7") > 0 ? 2 : 1), thorns: n("D5") * t.D5,
    afterimage: n("X1") > 0, phoenix: n("X2") > 0, bulwark: n("X4") > 0, chargePierce: n("X5") > 0, insight: n("X6") > 0,
  };
};

export const enemyOdds = (kit: Kit): Record<Action, number> => ({ attack: 1 / 3 - kit.awe, defend: 1 / 3 + kit.awe, charge: 1 / 3 });

/** One fight position. `cb` is the 연타 streak, `r` is run-wide revives left. */
export interface Pos { h: number; e: number; mc: number; ec: number; cb: number; r: number }
export interface Outcome {
  p: number; pos: Pos; end: "win" | "lose" | null;
  taken: number; dealt: number; dodged: boolean; revived: boolean; countered: number;
}

/**
 * Every random branch of one turn. The DP and the live game both read this, so they cannot disagree.
 * `seen` = 간파 showed the enemy move this turn (matters only for 통찰).
 */
export const resolve = (kit: Kit, foe: Fighter, s: Pos, a: Action, b: Action, seen = false): Outcome[] => {
  const chargeMul = s.mc ? 1 + kit.chargePower : 1;
  const myAtk = (kit.atk + s.cb * kit.combo) * chargeMul * (seen && kit.insight ? 2 : 1);
  const foeAtk = foe.atk * (s.ec ? 2 : 1);
  const base = (): Outcome => ({ p: 1, pos: { ...s }, end: null, taken: 0, dealt: 0, dodged: false, revived: false, countered: 0 });

  const hitFoe = (o: Outcome, dmg: number): Outcome => {
    if (o.end || dmg <= 0) return o;
    const x: Outcome = { ...o, pos: { ...o.pos }, dealt: o.dealt + dmg };
    x.pos.e -= dmg;
    if (x.pos.e <= 0) { x.pos.e = 0; x.end = "win"; }
    return x;
  };
  const hitMe = (o: Outcome, dmg: number): Outcome[] => {
    if (dmg <= 0) return [o];
    const land = (p: number): Outcome => {
      const x: Outcome = { ...o, p: o.p * p, pos: { ...o.pos }, taken: dmg };
      x.pos.h -= dmg;
      if (x.pos.h <= 0 && x.pos.r > 0) {
        x.pos.r -= 1;
        x.revived = true;
        x.pos.h = kit.phoenix ? kit.maxHp : 1;
        if (kit.phoenix) x.pos.mc = 1;
      }
      if (x.pos.h <= 0) { x.pos.h = 0; x.end = "lose"; return x; }
      if (kit.thorns > 0) {
        const y = hitFoe(x, kit.thorns);
        return { ...y, countered: y.countered + kit.thorns };
      }
      return x;
    };
    if (kit.dodge <= 0) return [land(1)];
    const dodged: Outcome = { ...o, p: o.p * kit.dodge, pos: { ...o.pos }, dodged: true };
    if (kit.afterimage) dodged.pos.mc = 1;
    return [dodged, land(1 - kit.dodge)];
  };
  const set = (list: Outcome[], f: (p: Pos) => void): Outcome[] => list.map((o) => {
    if (!o.end) f(o.pos);
    return o;
  });
  /** After my attack: spend the charge, then grow or reset the 연타 streak. */
  const afterAttack = (o: Outcome, landed: boolean): Outcome => {
    if (o.end) return o;
    o.pos.mc = (o.dodged && kit.afterimage) || (o.revived && kit.phoenix) ? 1 : 0;
    if (kit.combo > 0) o.pos.cb = landed ? Math.min(MAX_COMBO, s.cb + 1) : 0;
    return o;
  };

  if (a === "attack" && b === "attack") {
    const start = base();
    start.pos.ec = 0;
    if (kit.firstStrike) {
      const first = hitFoe(start, myAtk);
      if (first.end) return [first];
      return hitMe(first, foeAtk).map((o) => afterAttack(o, true));
    }
    return hitMe(start, foeAtk).map((o) => afterAttack(hitFoe(o, myAtk), true));
  }
  if (a === "attack") {
    const def = s.mc && kit.chargePierce ? 0 : Math.max(0, foe.def - kit.pierce);
    const dmg = b === "defend" ? Math.max(0, myAtk - def) : Math.floor(myAtk * (1 + kit.punish));
    const o = afterAttack(hitFoe(base(), dmg), dmg > 0);
    return set([o], (p) => { if (b === "charge") p.ec = 1; });
  }
  const resetCombo = (list: Outcome[]): Outcome[] => set(list, (p) => { p.cb = 0; });
  if (a === "defend") {
    if (b === "attack") {
      const taken = Math.max(0, foeAtk - kit.def);
      const back = Math.floor((foeAtk - taken) * kit.counter);
      const start = base();
      start.pos.ec = 0;
      return resetCombo(hitMe(start, taken).map((o) => {
        if (o.end) return o;
        const x = back > 0 ? { ...hitFoe(o, back), countered: o.countered + back } : o;
        if (x.end) return x;
        if (kit.bulwark && taken === 0 && foeAtk > 0) x.pos.mc = 1;
        return x;
      }));
    }
    return resetCombo(set([base()], (p) => {
      if (b === "charge") { p.ec = 1; if (kit.absorb) p.mc = 1; }
    }));
  }
  // charge
  if (b === "attack") {
    const start = base();
    start.pos.ec = 0;
    return resetCombo(set(hitMe(start, Math.max(0, foeAtk - (kit.chargeGuard ? kit.def : 0))), (p) => { p.mc = 1; }));
  }
  return resetCombo(set([base()], (p) => {
    p.mc = 1;
    if (b === "charge") p.ec = 1;
  }));
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
  const nLocal = 4 * (MAX_COMBO + 1);
  const memo = new Map<number, Float64Array>();
  const keyOf = (r: number, h: number, e: number): number => (r * 256 + h) * 65536 + e;
  const local = (p: Pos): number => (p.cb * 2 + p.mc) * 2 + p.ec;

  const solveBlock = (r: number, h: number, e: number): Float64Array => {
    const key = keyOf(r, h, e);
    const hit = memo.get(key);
    if (hit) return hit;
    // Edges: [local][a][b] → list of (prob, constant, inBlockIndex | -1); `seenEdges` only differ with 통찰.
    type Edge = { p: number; c: number; j: number };
    const edge = (o: Outcome): Edge => {
      if (o.end) return { p: o.p, c: o.end === "win" ? 1 : 0, j: -1 };
      if (o.pos.r === r && o.pos.h === h && o.pos.e === e) return { p: o.p, c: 0, j: local(o.pos) };
      return { p: o.p, c: solveBlock(o.pos.r, o.pos.h, o.pos.e)[local(o.pos)], j: -1 };
    };
    const edges: Edge[][][][] = [];
    const seenEdges: Edge[][][][] = [];
    for (let i = 0; i < nLocal; i += 1) {
      const pos: Pos = { h, e, r, cb: i >> 2, mc: (i >> 1) & 1, ec: i & 1 };
      if (pos.cb > 0 && kit.combo === 0) { edges[i] = seenEdges[i] = []; continue; }
      edges[i] = ACTIONS.map((a) => ACTIONS.map((b) => resolve(kit, foe, pos, a, b).map(edge)));
      seenEdges[i] = kit.insight && kit.peek > 0 ? ACTIONS.map((a) => ACTIONS.map((b) => resolve(kit, foe, pos, a, b, true).map(edge))) : edges[i];
    }
    const v = new Float64Array(nLocal);
    const pb = ACTIONS.map((b) => odds[b]);
    for (let iter = 0; iter < 2000; iter += 1) {
      let delta = 0;
      for (let i = 0; i < nLocal; i += 1) {
        if (!edges[i].length) continue;
        const sum = (list: Edge[]): number => list.reduce((acc, x) => acc + x.p * (x.j >= 0 ? v[x.j] : x.c), 0);
        const q = edges[i].map((row) => row.map(sum));
        const qs = seenEdges[i] === edges[i] ? q : seenEdges[i].map((row) => row.map(sum));
        let blind = 0, seen = 0;
        for (let ai = 0; ai < 3; ai += 1) blind = Math.max(blind, q[ai][0] * pb[0] + q[ai][1] * pb[1] + q[ai][2] * pb[2]);
        for (let bi = 0; bi < 3; bi += 1) seen += pb[bi] * Math.max(qs[0][bi], qs[1][bi], qs[2][bi]);
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
        const q = (list: Outcome[]): number => list.reduce((sum, o) => sum + o.p * (o.end === "win" ? 1 : o.end === "lose" ? 0 : valueAt(o.pos)), 0);
        const blindQ = q(resolve(kit, foe, s, a, b));
        seen[a][b] = kit.insight ? q(resolve(kit, foe, s, a, b, true)) : blindQ;
        blind[a] += odds[b] * blindQ;
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
  /** `turn` counts the whole run, not one stage; the duel ranking breaks ties with it. */
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

export const startStage = (stage: number, stacks: Stacks, revives: number, rng: () => number, turn = 0): DuelState => {
  const kit = kitOf(stacks);
  const pos: Pos = { h: kit.maxHp, e: enemyAt(stage).hp, mc: kit.preheat ? 1 : 0, ec: 0, cb: 0, r: revives };
  return withPeek({ stage, stacks, status: "fight", pos, turn, offer: null, peek: "attack", peekSeen: false }, rng);
};
export const newDuel = (rng: () => number): DuelState => startStage(0, {}, 0, rng);
export const visiblePeek = (s: DuelState): Action | null => (s.status === "fight" && s.peekSeen ? s.peek : null);

export const drawOffer = (stacks: Stacks, rng: () => number): DuelOptionId[] => {
  const pool = DUEL_OPTION_IDS.filter((id) => isOfferable(id, stacks));
  const size = OFFER_SIZE + (stacks.E2 ?? 0) * DUEL_TUNING.E2;
  const out: DuelOptionId[] = [];
  while (out.length < size && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
};

export const act = (s: DuelState, mine: Action, rng: () => number): TurnResult => {
  if (s.status !== "fight") throw new Error("not fighting");
  const kit = kitOf(s.stacks);
  const theirs = s.peek;
  const outcomes = resolve(kit, enemyAt(s.stage), s.pos, mine, theirs, s.peekSeen);
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
  return startStage(s.stage + 1, stacks, s.pos.r + (id === "D3" ? 1 : 0), rng, s.turn);
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
/** `fallback`: how "priority" picks when no listed option is offered. */
export interface AutoMode { chooser: Chooser; priority?: readonly DuelOptionId[]; fallback?: "greedy" | "random" }

/** Clear chance of the next stage if `id` is taken now. */
export const nextClearWith = (s: DuelState, id: DuelOptionId | null): number => {
  const stacks = id ? { ...s.stacks, [id]: (s.stacks[id] ?? 0) + 1 } : s.stacks;
  const kit = kitOf(stacks);
  const stage = s.stage + 1;
  const r = s.pos.r + (id === "D3" ? 1 : 0);
  return solverFor(stacks, stage).value({ h: kit.maxHp, e: enemyAt(stage).hp, mc: kit.preheat ? 1 : 0, ec: 0, cb: 0, r });
};

const pickOption = (s: DuelState, mode: AutoMode, rng: () => number): DuelOptionId => {
  const offer = s.offer!;
  if (mode.chooser === "priority" && mode.priority) {
    for (const id of mode.priority) if (offer.includes(id)) return id;
  }
  if (mode.chooser === "greedy" || (mode.chooser === "priority" && mode.fallback === "greedy")) {
    let best = offer[0], bestV = -1;
    for (const id of offer) {
      const v = nextClearWith(s, id);
      if (v > bestV + 1e-12) { best = id; bestV = v; }
    }
    return best;
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
        ? startStage(s.stage + 1, s.stacks, s.pos.r, rng, s.turn)
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
  return { stage, foe, baseClear: solveStage(kit, foe).value({ h: kit.maxHp, e: foe.hp, mc: 0, ec: 0, cb: 0, r: 0 }) };
});
