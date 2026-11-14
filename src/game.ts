export const MAX_STAGE = 20;
export const BASE_SUCCESS = 0.9;
export const BASE_DECAY = 0.9;
export const BASE_REWARD = 100;
export const BASE_GROWTH = 2;
export const MAX_SUCCESS = 0.95;
export const MAX_DECAY = 0.97;
export const MAX_STACKS = 3;
export const OFFER_SIZE = 3;
export const FOCUS_TRIES = 3;
export const MOMENTUM_CAP_PER_STACK = 0.1;
export const LOW_STAGE_MAX = 5;
// First stage past the no-option optimum (6): 고층 보너스 pays from here.
export const HIGH_STAGE_MIN = 7;
// 발판 keeps a fixed half: tuning the kept share directly jumps in whole-stage steps, so its prize cut is tuned instead.
export const ANCHOR_KEEP = 0.5;

export const OPTION_IDS = [
  "A1", "A2", "A3", "A4", "A5", "A6", "A8", "B1", "B2", "B3",
  "C1", "C2", "C4", "C7", "C8", "D1", "D2", "D3", "D4", "D5", "D6",
] as const;
export type OptionId = (typeof OPTION_IDS)[number];
export type Tuning = Record<OptionId, number>;

// Magnitudes come from `npm run balance` (scripts/balance.ts).
export const DEFAULT_TUNING: Tuning = {
  A1: 0.025, A2: 0.006, A3: 0.04, A4: 0.004, A5: 0.07, A6: 0.02, A8: 0.07,
  B1: 0.04, B2: 0.07, B3: 0.25, C1: 0.8, C2: 0.1, C4: 0.07, C7: 0.54, C8: 0.11,
  D1: 0.17, D2: 0.05, D3: 160, D4: 60, D5: 0.2, D6: 0.18,
};

export type Mods = {
  successMul: number;
  decay: number;
  focus: number;
  focusLeft: number;
  momentum: number;
  momentumCap: number;
  guaranteed: number;
  double: number;
  lives: number;
  lifeCut: number;
  soften: number;
  dodge: number;
  rewardMul: number;
  growth: number;
  flat: number;
  perWin: number;
  lowBoost: number;
  retry: number;
  rocket: number;
  jackpot: number;
  anchors: number;
  anchorCut: number;
  // Prize multiplier that survives a 발판 catch, so its cut can't be shed by losing the other options.
  carryMul: number;
  foresight: number;
  highBonus: number;
};

export type GameState = {
  stage: number;
  tries: number;
  wins: number;
  mods: Mods;
  stacks: Partial<Record<OptionId, number>>;
  offer: OptionId[] | null;
  // 예지: the next challenge's roll, drawn early. Shown to the player only when peekSeen.
  peek: number | null;
  peekSeen: boolean;
};

export type Rng = () => number;

export type OptionGroup = "확률" | "단계" | "보호" | "상금";

type OptionDef = {
  group: OptionGroup;
  name: string;
  // Plain-language effect, then the price paid for it (if any).
  desc: (m: number) => string;
  cost?: (m: number) => string;
  apply: (state: GameState, m: number) => void;
};

const pct = (v: number): string => `${+(v * 100).toFixed(1)}%`;
const pp = (v: number): string => `${+(v * 100).toFixed(1)}%p`;
const combine = (current: number, add: number): number => 1 - (1 - current) * (1 - add);

export const OPTIONS: Record<OptionId, OptionDef> = {
  A1: { group: "확률", name: "정밀", desc: (m) => `모든 강화의 성공확률이 ${pct(m)} 늘어남 (예: 80% → ${+(80 * (1 + m)).toFixed(1)}%)`,
    apply: (s, m) => { s.mods.successMul += m; } },
  A2: { group: "확률", name: "끈기", desc: (m) => `단계가 오를 때 성공확률이 덜 떨어짐 (매 단계 ×0.9 → ×${+(BASE_DECAY + m).toFixed(3)})`,
    apply: (s, m) => { s.mods.decay = Math.min(MAX_DECAY, s.mods.decay + m); } },
  A3: { group: "확률", name: "집중", desc: (m) => `다음 ${FOCUS_TRIES}번 강화의 성공확률 +${pp(m)}`,
    apply: (s, m) => { s.mods.focus = Math.max(s.mods.focus, m); s.mods.focusLeft += FOCUS_TRIES; } },
  A4: { group: "확률", name: "기세", desc: (m) => `이번 판에서 강화할 때마다 성공확률 +${pp(m)}씩 쌓임 (최대 +${pp(MOMENTUM_CAP_PER_STACK)})`,
    apply: (s, m) => { s.mods.momentum += m; s.mods.momentumCap += MOMENTUM_CAP_PER_STACK; } },
  A5: { group: "확률", name: "확신", desc: () => "다음 강화 1번은 무조건 성공", cost: (m) => `상금 ${pct(m)} 줄어듦`,
    apply: (s, m) => { s.mods.guaranteed += 1; s.mods.rewardMul *= 1 - m; } },
  B1: { group: "단계", name: "점프", desc: (m) => `성공할 때 ${pct(m)} 확률로 2단계 오름`,
    apply: (s, m) => { s.mods.double = combine(s.mods.double, m); } },
  B2: { group: "단계", name: "도약", desc: () => "고르는 즉시 1단계 오름", cost: (m) => `상금 ${pct(m)} 줄어듦`,
    apply: (s, m) => { s.stage = Math.min(MAX_STAGE, s.stage + 1); s.mods.rewardMul *= 1 - m; } },
  C1: { group: "보호", name: "부활", desc: () => "실패해도 1번은 버팀 (단계 유지)", cost: (m) => `버틸 때 상금 ${pct(m)} 줄어듦`,
    apply: (s, m) => { s.mods.lives += 1; s.mods.lifeCut = m; } },
  C2: { group: "보호", name: "안전장치", desc: (m) => `실패할 때 ${pct(m)} 확률로 한 단계 아래로만 떨어짐`,
    apply: (s, m) => { s.mods.soften = combine(s.mods.soften, m); } },
  C4: { group: "보호", name: "행운", desc: (m) => `실패해도 ${pct(m)} 확률로 없던 일이 됨`,
    apply: (s, m) => { s.mods.dodge = combine(s.mods.dodge, m); } },
  D1: { group: "상금", name: "보너스", desc: (m) => `상금이 ${pct(m)} 늘어남`,
    apply: (s, m) => { s.mods.rewardMul += m; } },
  D2: { group: "상금", name: "복리", desc: (m) => `단계마다 상금이 ${BASE_GROWTH}배 대신 ${+(BASE_GROWTH + m).toFixed(3)}배씩 늘어남`,
    apply: (s, m) => { s.mods.growth += m; } },
  D3: { group: "상금", name: "수당", desc: (m) => `상금 받을 때 ${Math.round(m)}원 더 받음`,
    apply: (s, m) => { s.mods.flat += m; } },
  D4: { group: "상금", name: "연승 수당", desc: (m) => `이번 판에서 성공 1번마다 상금 +${Math.round(m)}원`,
    apply: (s, m) => { s.mods.perWin += m; } },
  A6: { group: "확률", name: "출발 가속", desc: (m) => `1~${LOW_STAGE_MAX}단계로 오르는 강화의 성공확률 +${pp(m)}`,
    apply: (s, m) => { s.mods.lowBoost += m; } },
  A8: { group: "확률", name: "재강화", desc: (m) => `실패하면 ${pct(m)} 확률로 바로 한 번 더 굴림`,
    apply: (s, m) => { s.mods.retry = combine(s.mods.retry, m); } },
  B3: { group: "단계", name: "로켓", desc: () => "다음 성공은 무조건 2단계 오름", cost: (m) => `상금 ${pct(m)} 줄어듦`,
    apply: (s, m) => { s.mods.rocket += 1; s.mods.rewardMul *= 1 - m; } },
  C7: { group: "보호", name: "발판", desc: () => "실패해도 1번은 0단계 대신 단계 절반으로 떨어짐. 다른 옵션은 사라짐",
    cost: (m) => `떨어질 때 상금 ${pct(m)} 줄어듦`,
    apply: (s, m) => { s.mods.anchors += 1; s.mods.anchorCut = m; } },
  C8: { group: "보호", name: "예지", desc: (m) => `강화마다 ${pct(m)} 확률로 성공·실패를 미리 보여 줌`,
    apply: (s, m) => { s.mods.foresight = combine(s.mods.foresight, m); } },
  D6: { group: "상금", name: "고층 보너스", desc: (m) => `${HIGH_STAGE_MIN}단계 이상에서 상금 +${pct(m)}`,
    apply: (s, m) => { s.mods.highBonus += m; } },
  D5: { group: "상금", name: "잭팟", desc: (m) => `상금 받을 때 ${pct(m)} 확률로 2배`,
    apply: (s, m) => { s.mods.jackpot = combine(s.mods.jackpot, m); } },
};

export const optionName = (id: OptionId): string => OPTIONS[id].name;
export const optionDesc = (id: OptionId, tuning: Tuning = DEFAULT_TUNING): string => OPTIONS[id].desc(tuning[id]);
export const optionCost = (id: OptionId, tuning: Tuning = DEFAULT_TUNING): string | null => OPTIONS[id].cost?.(tuning[id]) ?? null;
export const optionLabel = (id: OptionId, tuning: Tuning = DEFAULT_TUNING): string => {
  const cost = optionCost(id, tuning);
  return `${optionName(id)}: ${optionDesc(id, tuning)}${cost ? ` (대신 ${cost})` : ""}`;
};

const freshMods = (): Mods => ({
  successMul: 1, decay: BASE_DECAY, focus: 0, focusLeft: 0, momentum: 0, momentumCap: 0, guaranteed: 0,
  double: 0, lives: 0, lifeCut: 0, soften: 0, dodge: 0, rewardMul: 1, growth: BASE_GROWTH, flat: 0, perWin: 0,
  lowBoost: 0, retry: 0, rocket: 0, jackpot: 0, anchors: 0, anchorCut: 0, carryMul: 1, foresight: 0, highBonus: 0,
});

export const newGame = (): GameState => ({ stage: 0, tries: 0, wins: 0, mods: freshMods(), stacks: {}, offer: null, peek: null, peekSeen: false });

const clone = (s: GameState): GameState => ({ ...s, mods: { ...s.mods }, stacks: { ...s.stacks }, offer: s.offer && [...s.offer] });

// Base chance of the challenge stage -> stage+1, before options: 90%, 81%, 72.9%, ...
export const baseSuccessChance = (stage: number, decay = BASE_DECAY): number => BASE_SUCCESS * decay ** stage;

export const successChance = (s: GameState): number => {
  if (s.stage >= MAX_STAGE) return 0;
  if (s.mods.guaranteed > 0) return 1;
  const m = s.mods;
  const target = s.stage + 1;
  const raw = baseSuccessChance(s.stage, m.decay) * m.successMul
    + (m.focusLeft > 0 ? m.focus : 0)
    + Math.min(m.momentumCap, m.momentum * s.tries)
    + (target <= LOW_STAGE_MAX ? m.lowBoost : 0);
  const p = Math.min(MAX_SUCCESS, Math.max(0, raw));
  // A reroll at the same chance is equivalent to one roll at p + (1-p)·retry·p.
  return Math.min(MAX_SUCCESS, p + (1 - p) * m.retry * p);
};

// Stage 0 pays nothing, so cashing out there can't mint free money.
export const rewardAt = (s: GameState, stage: number, wins = s.wins): number => {
  if (stage <= 0) return 0;
  const m = s.mods;
  const high = stage >= HIGH_STAGE_MIN ? 1 + m.highBonus : 1;
  return BASE_REWARD * m.growth ** (stage - 1) * m.rewardMul * high + m.flat + m.perWin * wins;
};

export type ChallengeResult = "success" | "double" | "dodged" | "revived" | "softened" | "anchored" | "failed";

export type ChallengeOutcome = { state: GameState; result: ChallengeResult; from: number; chance: number; payout: number };

const drawOffer = (s: GameState, rng: Rng): OptionId[] | null => {
  const pool = OPTION_IDS.filter((id) => (s.stacks[id] ?? 0) < MAX_STACKS);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const offer = pool.slice(0, OFFER_SIZE);
  return offer.length ? offer : null;
};

// 예지: draws the next roll early and decides whether the player gets to see it. Call after every state change.
export const reveal = (s: GameState, rng: Rng): GameState => {
  if (s.mods.foresight <= 0 || s.peek !== null || s.offer || s.stage >= MAX_STAGE) return s;
  const peek = rng();
  return { ...s, peek, peekSeen: rng() < s.mods.foresight };
};

// null when the next roll isn't shown; otherwise whether it beats the current chance.
export const foreseen = (s: GameState): boolean | null => (s.peek !== null && s.peekSeen ? s.peek < successChance(s) : null);

// Where a failure lands when 발판 catches it: half the stage, every other option gone, prize cut kept for the run.
// null when it can't help (no charge, or half rounds down to 0).
const anchorLanding = (s: GameState): GameState | null => {
  const stage = Math.floor(s.stage * ANCHOR_KEEP);
  if (s.mods.anchors <= 0 || stage <= 0) return null;
  const landed: GameState = { ...newGame(), stage, tries: s.tries };
  const left = s.mods.anchors - 1;
  landed.mods.carryMul = s.mods.carryMul * (1 - s.mods.anchorCut);
  landed.mods.rewardMul = landed.mods.carryMul;
  if (left > 0) {
    landed.mods.anchors = left;
    landed.mods.anchorCut = s.mods.anchorCut;
    landed.stacks = { C7: left };
  }
  return landed;
};

export const challenge = (prev: GameState, rng: Rng, withOffer = true): ChallengeOutcome => {
  if (prev.offer) throw new Error("Choose an option first");
  if (prev.stage >= MAX_STAGE) throw new Error("Already at max stage");
  const s = clone(prev);
  const from = s.stage;
  const chance = successChance(s);
  if (s.mods.guaranteed > 0) s.mods.guaranteed -= 1;
  else if (s.mods.focusLeft > 0) s.mods.focusLeft -= 1;
  s.tries += 1;
  let roll: number;
  if (s.peek !== null) {
    roll = s.peek;
    s.peek = null;
    s.peekSeen = false;
  } else {
    roll = rng();
  }

  if (roll < chance) {
    const rocket = s.mods.rocket > 0;
    if (rocket) s.mods.rocket -= 1;
    const jump = rocket || rng() < s.mods.double ? 2 : 1;
    s.stage = Math.min(MAX_STAGE, s.stage + jump);
    s.wins += 1;
    if (withOffer) s.offer = drawOffer(s, rng);
    return { state: s, result: jump === 2 ? "double" : "success", from, chance, payout: 0 };
  }
  if (rng() < s.mods.dodge) return { state: s, result: "dodged", from, chance, payout: 0 };
  if (s.mods.lives > 0) {
    s.mods.lives -= 1;
    s.mods.rewardMul *= 1 - s.mods.lifeCut;
    return { state: s, result: "revived", from, chance, payout: 0 };
  }
  if (s.stage > 0 && rng() < s.mods.soften) {
    s.stage -= 1;
    return { state: s, result: "softened", from, chance, payout: 0 };
  }
  // Keeping the other options across a catch let stacks snowball and blew up the EV, so they are dropped.
  const landed = anchorLanding(s);
  if (landed) return { state: landed, result: "anchored", from, chance, payout: 0 };
  return { state: newGame(), result: "failed", from, chance, payout: 0 };
};

export const chooseOption = (prev: GameState, id: OptionId, tuning: Tuning = DEFAULT_TUNING): GameState => {
  if (!prev.offer?.includes(id)) throw new Error("Option not offered");
  const s = clone(prev);
  OPTIONS[id].apply(s, tuning[id]);
  s.stacks[id] = (s.stacks[id] ?? 0) + 1;
  s.offer = null;
  return s;
};

// Applies an option outside the offer flow (used by balance measurement).
export const grantOption = (prev: GameState, id: OptionId, tuning: Tuning = DEFAULT_TUNING): GameState =>
  chooseOption({ ...prev, offer: [id] }, id, tuning);

export const cashOut = (s: GameState, rng: Rng = Math.random): { state: GameState; payout: number; jackpot: boolean } => {
  if (s.stage === 0) throw new Error("Nothing to cash out");
  const jackpot = s.mods.jackpot > 0 && rng() < s.mods.jackpot;
  return { state: newGame(), payout: rewardAt(s, s.stage) * (jackpot ? 2 : 1), jackpot };
};

// Expected money change of exactly one more challenge vs cashing out now.
// Ignores the value of the option a success would offer, so it slightly undervalues continuing.
export const continueGain = (s: GameState): number => {
  if (s.stage >= MAX_STAGE) return 0;
  const m = s.mods;
  const cash = 1 + m.jackpot;
  const now = rewardAt(s, s.stage) * cash;
  const sure = foreseen(s);
  const p = sure === null ? successChance(s) : Number(sure);
  const up = (jump: number) => rewardAt(s, Math.min(MAX_STAGE, s.stage + jump), s.wins + 1) * cash;
  const win = m.rocket > 0 ? up(2) : (1 - m.double) * up(1) + m.double * up(2);
  let fail: number;
  if (m.lives > 0) fail = now * (1 - m.lifeCut);
  else {
    const landed = anchorLanding(s);
    const caught = landed ? rewardAt(landed, landed.stage) : 0;
    fail = m.soften * rewardAt(s, s.stage - 1) * cash + (1 - m.soften) * caught;
  }
  // A foreseen failure is a plain roll; 행운 can still cancel it, so keep the dodge term.
  const failValue = m.dodge * now + (1 - m.dodge) * fail;
  return p * win + (1 - p) * failValue - now;
};

export type StageRow = { stage: number; successRate: number; failRate: number; reachProbability: number; reward: number; expectedValue: number };

// No-option reference table: reach probability, reward and expected value per stage.
export const baseStageTable = (): StageRow[] => {
  const s = newGame();
  let reach = 1;
  return Array.from({ length: MAX_STAGE + 1 }, (_, stage) => {
    const successRate = stage === 0 ? 1 : baseSuccessChance(stage - 1);
    reach *= successRate;
    const reward = rewardAt(s, stage);
    return { stage, successRate, failRate: 1 - successRate, reachProbability: reach, reward, expectedValue: reach * reward };
  });
};

export type AutoPlayMode = {
  start?: OptionId[];
  chooser?: "random" | "priority";
  priority?: readonly OptionId[];
};

export type RunResult = { payout: number; maxStage: number };

// One run: pick options per `chooser`, cash out once one more try has non-positive expected gain.
export const autoPlayRun = (mode: AutoPlayMode, rng: Rng, tuning: Tuning = DEFAULT_TUNING): RunResult => {
  let s = newGame();
  for (const id of mode.start ?? []) s = grantOption(s, id, tuning);
  let maxStage = s.stage;
  for (;;) {
    s = reveal(s, rng);
    if (s.offer) {
      const offer = s.offer;
      const pick = mode.chooser === "priority" && mode.priority
        ? mode.priority.find((id) => offer.includes(id)) ?? offer[0]
        : offer[Math.floor(rng() * offer.length)];
      s = reveal(chooseOption(s, pick, tuning), rng);
      maxStage = Math.max(maxStage, s.stage);
    }
    if (s.stage > 0 && (s.stage >= MAX_STAGE || continueGain(s) <= 0)) return { payout: cashOut(s, rng).payout, maxStage };
    const out = challenge(s, rng, Boolean(mode.chooser));
    if (out.result === "failed") return { payout: out.payout, maxStage };
    s = out.state;
    maxStage = Math.max(maxStage, s.stage);
  }
};
