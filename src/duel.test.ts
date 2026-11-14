import { describe, expect, it } from "vitest";
import {
  act, autoDuel, choose, drawOffer, DUEL_OPTIONS, DUEL_OPTION_IDS, enemyAt, enemyTable, isOfferable, kitOf, LAST_STAGE, newDuel,
  resolve, solveStage, startStage, type Action, type DuelState, type Pos, type Stacks,
} from "./duel";

const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
const pos = (p: Partial<Pos> = {}): Pos => ({ h: 1, e: 1, mc: 0, ec: 0, cb: 0, r: 0, ...p });
const only = (stacks: Stacks, foe: { hp: number; atk: number; def: number }, p: Pos, a: Action, b: Action) => {
  const out = resolve(kitOf(stacks), foe, p, a, b);
  expect(out).toHaveLength(1);
  return out[0];
};
const foe = (atk: number, def = 0, hp = 10) => ({ hp, atk, def });

describe("turn rules", () => {
  it("attack vs attack hurts me first, so a 1-hp player dies before striking", () => {
    const o = only({}, foe(1, 0, 1), pos({ e: 1 }), "attack", "attack");
    expect(o.end).toBe("lose");
    expect(o.pos.e).toBe(1);
  });

  it("선제 strikes first and takes no hit when the blow is lethal", () => {
    const o = only({ A1: 1 }, foe(5, 0, 1), pos({ e: 1 }), "attack", "attack");
    expect(o.end).toBe("win");
    expect(o.taken).toBe(0);
  });

  it("attack vs defend deals attack minus defense, and 관통 ignores some defense", () => {
    expect(only({ S2: 3 }, foe(1, 3), pos({ e: 5 }), "attack", "defend").dealt).toBe(1);
    expect(only({ S2: 3, A2: 1 }, foe(1, 3), pos({ e: 5 }), "attack", "defend").dealt).toBe(3);
  });

  it("charge doubles the next attack, then it is spent", () => {
    const o = only({ S2: 1 }, foe(1), pos({ e: 9, mc: 1 }), "attack", "defend");
    expect(o.dealt).toBe(4);
    expect(o.pos.mc).toBe(0);
    expect(only({ S2: 1, C1: 1 }, foe(1), pos({ e: 9, mc: 1 }), "attack", "defend").dealt).toBe(6);
  });

  it("charging takes the full enemy attack unless 충전 방어", () => {
    const hit = only({ S1: 4, S3: 2 }, foe(2), pos({ h: 5 }), "charge", "attack");
    expect(hit.taken).toBe(2);
    expect(hit.pos.mc).toBe(1);
    expect(only({ S1: 4, S3: 1, C2: 1 }, foe(2), pos({ h: 5 }), "charge", "attack").taken).toBe(0);
  });

  it("a charged enemy hits for double through defense, and 반격 returns what was blocked", () => {
    const o = only({ S1: 4, D1: 1 }, foe(2), pos({ h: 5, e: 5, ec: 1 }), "defend", "attack");
    expect(o.taken).toBe(4 - 1);
    expect(o.countered).toBe(1);
    expect(o.pos.ec).toBe(0);
  });

  it("an enemy that charges takes my full attack, boosted by 빈틈", () => {
    expect(only({}, foe(1, 5), pos({ e: 5 }), "attack", "charge").dealt).toBe(1);
    expect(only({ A3: 1 }, foe(1, 5), pos({ e: 5 }), "attack", "charge").dealt).toBe(2);
  });

  it("회피 splits a hit into a dodge branch, 부활 survives a lethal one", () => {
    const out = resolve(kitOf({ D2: 1 }), foe(3), pos(), "charge", "attack");
    expect(out.map((o) => o.dodged)).toEqual([true, false]);
    expect(out.reduce((s, o) => s + o.p, 0)).toBeCloseTo(1);
    const saved = only({}, foe(3), pos({ e: 5, r: 1 }), "attack", "attack");
    expect(saved).toMatchObject({ revived: true, end: null, pos: { h: 1, r: 0 } });
  });
});

describe("new and chain options", () => {
  it("연타 adds damage per landed hit and resets when blocked; 연쇄 doubles it", () => {
    const hit = only({ A4: 1 }, foe(1), pos({ e: 9, cb: 2 }), "attack", "charge");
    expect(hit.dealt).toBe(1 + 2);
    expect(hit.pos.cb).toBe(3);
    expect(only({ A4: 1 }, foe(1, 5), pos({ e: 9, cb: 2 }), "attack", "defend").pos.cb).toBe(0);
    expect(only({ A4: 1, X7: 1 }, foe(1), pos({ e: 9, cb: 2 }), "attack", "charge").dealt).toBe(1 + 4);
    expect(only({ A4: 1 }, foe(1), pos({ e: 9, cb: 2 }), "defend", "defend").pos.cb).toBe(0);
  });

  it("가시 hurts the enemy whenever I am hit and survive", () => {
    const o = only({ S1: 3, D5: 2 }, foe(1), pos({ h: 4, e: 5 }), "charge", "attack");
    expect(o.taken).toBe(1);
    expect(o.pos.e).toBe(3);
  });

  it("철벽 charges me after a full block", () => {
    expect(only({ S3: 1, X4: 1 }, foe(2), pos({ e: 5 }), "defend", "attack").pos.mc).toBe(1);
    expect(only({ S3: 1 }, foe(2), pos({ e: 5 }), "defend", "attack").pos.mc).toBe(0);
  });

  it("불사조 revives at full health and charged", () => {
    const o = only({ S1: 3, D3: 1, X2: 1 }, foe(9), pos({ h: 4, e: 5, r: 1 }), "charge", "attack");
    expect(o).toMatchObject({ revived: true, pos: { h: 4, mc: 1, r: 0 } });
  });

  it("통찰 doubles an attack only on a turn 간파 revealed", () => {
    const kit = kitOf({ E1: 1, X6: 1 });
    expect(resolve(kit, foe(0), pos({ e: 9 }), "attack", "charge", true)[0].dealt).toBe(2);
    expect(resolve(kit, foe(0), pos({ e: 9 }), "attack", "charge", false)[0].dealt).toBe(1);
  });

  it("단련 doubles every stat option, including ones already owned", () => {
    expect(kitOf({ S1: 2, S2: 1, S4: 1 })).toMatchObject({ maxHp: 5, atk: 3, def: 1 });
  });

  it("chain options appear only after their base option", () => {
    expect(isOfferable("X1", {})).toBe(false);
    expect(isOfferable("X1", { D2: 1 })).toBe(true);
    expect(isOfferable("X1", { D2: 1, X1: 1 })).toBe(false);
    for (let i = 0; i < 50; i += 1) expect(drawOffer({}, Math.random).some((id) => DUEL_OPTIONS[id].requires)).toBe(false);
  });

  it("전리품 shows more options", () => {
    expect(drawOffer({ E2: 1 }, Math.random)).toHaveLength(4);
    expect(drawOffer({ E2: 2 }, Math.random)).toHaveLength(5);
  });
});

describe("solver", () => {
  it("matches the hand result for the base kit: 2/3 when every move risks a 1/3 lethal attack", () => {
    const v = solveStage(kitOf({}), foe(1, 0, 1)).value(pos());
    expect(v).toBeCloseTo(2 / 3, 9);
  });

  it("agrees with Monte Carlo play of its own policy", () => {
    const stacks: Stacks = { S1: 2, S2: 1, S3: 1, D2: 1 };
    const enemy = enemyAt(8);
    const kit = kitOf(stacks);
    const solver = solveStage(kit, enemy);
    const start = pos({ h: kit.maxHp, e: enemy.hp });
    let wins = 0;
    const N = 20_000;
    let x = 7;
    const rng = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < N; i += 1) {
      let s: DuelState = { ...startStage(8, stacks, 0, rng), pos: { ...start } };
      while (s.status === "fight") s = act(s, solver.best(s.pos, null), rng).state;
      if (s.status !== "dead") wins += 1;
    }
    expect(Math.abs(wins / N - solver.value(start))).toBeLessThan(0.015);
  });

  it("knowing the enemy move never lowers the clear chance", () => {
    const enemy = enemyAt(12);
    const build: Stacks = { S1: 4, S2: 3, S3: 3 };
    const blind = solveStage(kitOf(build), enemy).value(pos({ h: 5, e: enemy.hp }));
    const seen = solveStage(kitOf({ ...build, E1: 2 }), enemy).value(pos({ h: 5, e: enemy.hp }));
    expect(seen).toBeGreaterThan(blind);
  });
});

describe("run flow", () => {
  it("starts at stage 0 against a harmless enemy", () => {
    const s = newDuel(Math.random);
    expect(s).toMatchObject({ stage: 0, status: "fight", pos: { h: 1, e: 1 } });
    expect(enemyAt(0)).toEqual({ hp: 1, atk: 0, def: 0 });
    expect(enemyAt(LAST_STAGE)).toEqual({ hp: 51, atk: 19, def: 17 });
  });

  it("plays the pre-drawn enemy move, so 간파 shows the truth", () => {
    const s: DuelState = { ...startStage(4, { S1: 5 }, 0, Math.random), peek: "defend", peekSeen: true };
    expect(act(s, "attack", Math.random).theirs).toBe("defend");
  });

  it("offers three different options and never a maxed one", () => {
    const offer = drawOffer({ A1: 1, C2: 1, C3: 1, C4: 1 }, seq(0, 0, 0));
    expect(new Set(offer).size).toBe(3);
    for (const id of offer) expect(["A1", "C2", "C3", "C4"]).not.toContain(id);
  });

  it("clearing a stage opens an offer; picking one starts the next stage at full health", () => {
    const won = act(newDuel(seq(0.1)), "attack", seq(0.5, 0, 0, 0));
    expect(won.state.status).toBe("offer");
    const next = choose(won.state, won.state.offer![0], Math.random);
    const kit = kitOf(next.stacks);
    expect(next).toMatchObject({ stage: 1, status: "fight", pos: { h: kit.maxHp, e: enemyAt(1).hp, mc: 0, ec: 0 } });
  });

  it("부활 adds a run-wide revive", () => {
    const s: DuelState = { ...newDuel(Math.random), status: "offer", offer: ["D3", "S1", "S2"] };
    expect(choose(s, "D3", Math.random).pos.r).toBe(1);
  });

  it("auto play always ends between 0 and a full clear", () => {
    for (let i = 0; i < 30; i += 1) {
      const k = autoDuel({ chooser: "random" }, Math.random);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(LAST_STAGE + 1);
    }
  });

  it("lists every stage with the base-kit clear chance", () => {
    const rows = enemyTable();
    expect(rows).toHaveLength(LAST_STAGE + 1);
    expect(rows[0].baseClear).toBe(1);
    expect(rows[1].baseClear).toBeCloseTo(2 / 3, 9);
    expect(DUEL_OPTION_IDS.every((id) => DUEL_OPTIONS[id].max >= 1)).toBe(true);
  });
});
