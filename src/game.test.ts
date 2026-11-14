import { describe, expect, it } from "vitest";
import {
  autoPlayRun, baseStageTable, cashOut, challenge, chooseOption, continueGain, DEFAULT_TUNING, foreseen, grantOption,
  HIGH_STAGE_MIN, MAX_STACKS, MAX_STAGE, newGame, OPTION_IDS, reveal, rewardAt, successChance, type GameState, type Rng,
} from "./game";

const seq = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length];
};
const WIN = 0;
const LOSE = 0.999;

const climb = (stage: number): GameState => {
  let s = newGame();
  for (let i = 0; i < stage; i += 1) s = challenge(s, seq(WIN, LOSE), false).state;
  return s;
};

describe("base game", () => {
  it("decays success chance by 0.9x per stage from 90%", () => {
    expect(successChance(newGame())).toBeCloseTo(0.9);
    expect(successChance(climb(1))).toBeCloseTo(0.81);
    expect(successChance(climb(2))).toBeCloseTo(0.729);
  });

  it("doubles the reward from 100 at stage 1", () => {
    const s = newGame();
    expect([0, 1, 2, 3].map((k) => rewardAt(s, k))).toEqual([0, 100, 200, 400]);
  });

  it("peaks expected value at stage 6 without options", () => {
    const table = baseStageTable();
    const best = table.reduce((a, b) => (b.expectedValue > a.expectedValue ? b : a));
    expect(best.stage).toBe(6);
    expect(best.expectedValue).toBeCloseTo(3200 * 0.9 ** 21);
    expect(continueGain(climb(5))).toBeGreaterThan(0);
    expect(continueGain(climb(6))).toBeLessThan(0);
  });

  it("resets to stage 0 on failure", () => {
    const out = challenge(climb(3), seq(LOSE));
    expect(out.result).toBe("failed");
    expect(out.state.stage).toBe(0);
    expect(out.payout).toBe(0);
  });
});

describe("options", () => {
  it("offers 3 options after a success and blocks challenges until one is chosen", () => {
    const out = challenge(newGame(), seq(WIN, LOSE, 0.1, 0.2, 0.3));
    expect(out.state.offer).toHaveLength(3);
    expect(() => challenge(out.state, seq(WIN))).toThrow();
    const picked = chooseOption(out.state, out.state.offer![0]);
    expect(picked.offer).toBeNull();
    expect(picked.stacks[out.state.offer![0]]).toBe(1);
  });

  it("rejects options that were not offered", () => {
    const out = challenge(newGame(), seq(WIN, LOSE, 0.5));
    const missing = OPTION_IDS.find((id) => !out.state.offer!.includes(id))!;
    expect(() => chooseOption(out.state, missing)).toThrow();
  });

  it("stops offering an option once it reaches the stack limit", () => {
    let s = newGame();
    for (let i = 0; i < MAX_STACKS; i += 1) s = grantOption(s, "D1");
    for (let i = 0; i < 20; i += 1) {
      const out = challenge({ ...s, stage: 0 }, seq(WIN, LOSE, i / 20, 0.37, 0.71));
      expect(out.state.offer).not.toContain("D1");
    }
  });

  it("guaranteed success always wins once", () => {
    const s = grantOption(newGame(), "A5");
    expect(successChance(s)).toBe(1);
    const out = challenge(s, seq(LOSE), false);
    expect(out.state.stage).toBe(1);
    expect(successChance(out.state)).toBeCloseTo(0.81);
  });

  it("revive keeps the stage and cuts the reward", () => {
    const s = grantOption(climb(3), "C1");
    const out = challenge(s, seq(LOSE, LOSE), false);
    expect(out.result).toBe("revived");
    expect(out.state.stage).toBe(3);
    expect(rewardAt(out.state, 3)).toBeLessThan(rewardAt(s, 3));
  });

  it("cash out pays the current reward and resets", () => {
    const { state, payout } = cashOut(climb(4));
    expect(payout).toBe(800);
    expect(state.stage).toBe(0);
    expect(() => cashOut(newGame())).toThrow();
  });
});

describe("added options", () => {
  it("ends at stage 20", () => {
    expect(MAX_STAGE).toBe(20);
    expect(baseStageTable()).toHaveLength(21);
    expect(() => challenge({ ...newGame(), stage: MAX_STAGE }, seq(WIN))).toThrow();
  });

  it("start boost only applies up to stage 5", () => {
    const s = grantOption(newGame(), "A6");
    expect(successChance(s)).toBeCloseTo(0.9 + DEFAULT_TUNING.A6);
    expect(successChance({ ...climb(5), mods: s.mods })).toBeCloseTo(0.9 ** 6);
  });

  it("retry folds a second roll into the success chance", () => {
    const r = DEFAULT_TUNING.A8;
    const s = grantOption(climb(2), "A8");
    expect(successChance(s)).toBeCloseTo(0.729 + 0.271 * r * 0.729);
  });

  it("rocket makes the next success jump two stages", () => {
    const out = challenge(grantOption(climb(1), "B3"), seq(WIN, LOSE), false);
    expect(out.result).toBe("double");
    expect(out.state.stage).toBe(3);
    expect(out.state.mods.rocket).toBe(0);
  });

  it("a failure never pays: only a cash-out does", () => {
    for (const id of OPTION_IDS) {
      const out = challenge(grantOption(climb(3), id), seq(LOSE), false);
      if (out.result === "failed") expect(out.payout).toBe(0);
    }
  });

  it("anchor catches one failure partway down but drops the other options", () => {
    const s = grantOption(grantOption(grantOption(climb(8), "C7"), "C7"), "D1");
    const caught = challenge(s, seq(LOSE, LOSE, LOSE), false);
    expect(caught.result).toBe("anchored");
    expect(caught.state.stage).toBe(4);
    expect(caught.state.stacks).toEqual({ C7: 1 });
    expect(caught.state.mods.rewardMul).toBeCloseTo(1 - DEFAULT_TUNING.C7);
    const again = challenge(caught.state, seq(LOSE, LOSE, LOSE), false);
    expect(again.result).toBe(caught.state.stage > 1 ? "anchored" : "failed");
  });

  it("foresight, when it shows, reveals the roll the challenge then uses", () => {
    const shownFail = reveal(grantOption(climb(3), "C8"), seq(0.99, 0));
    expect(foreseen(shownFail)).toBe(false);
    expect(continueGain(shownFail)).toBeLessThan(0);
    expect(challenge(shownFail, seq(WIN, WIN, WIN), false).result).toBe("failed");
    const shownWin = reveal(grantOption(climb(3), "C8"), seq(0.01, 0));
    expect(foreseen(shownWin)).toBe(true);
    expect(challenge(shownWin, seq(LOSE, LOSE), false).state.stage).toBe(4);
    const hidden = reveal(grantOption(climb(3), "C8"), seq(0.01, 0.999));
    expect(foreseen(hidden)).toBeNull();
  });

  it("high-stage bonus only pays from stage 7", () => {
    const s = grantOption(newGame(), "D6");
    expect(rewardAt(s, HIGH_STAGE_MIN - 1)).toBe(rewardAt(newGame(), HIGH_STAGE_MIN - 1));
    expect(rewardAt(s, HIGH_STAGE_MIN)).toBeCloseTo(rewardAt(newGame(), HIGH_STAGE_MIN) * (1 + DEFAULT_TUNING.D6));
  });

  it("jackpot doubles the cash-out", () => {
    const s = grantOption(climb(4), "D5");
    expect(cashOut(s, seq(0)).payout).toBe(1600);
    expect(cashOut(s, seq(LOSE)).payout).toBe(800);
  });
});

describe("autoPlayRun", () => {
  it("cashes out at stage 6 without options when every try succeeds", () => {
    expect(autoPlayRun({}, seq(WIN, LOSE))).toEqual({ payout: 3200, maxStage: 6 });
  });
});
