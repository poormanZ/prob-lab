import report from "../balance-report.json";
import {
  autoPlayRun, baseStageTable, cashOut, challenge, chooseOption, continueGain, grantOption, MAX_STACKS, MAX_STAGE,
  newGame, optionCost, optionDesc, optionName, OPTIONS, rewardAt, successChance,
  type AutoPlayMode, type ChallengeOutcome, type GameState, type OptionId,
} from "../game";
import { mountAccount, reportStage } from "./account";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
};
const won = (v: number): string => `${Math.round(v).toLocaleString("ko-KR")}원`;
const wonShort = (v: number): string => (v >= 10_000 ? `${+(v / 10_000).toFixed(1)}만` : Math.round(v).toLocaleString("ko-KR"));
const pct = (p: number, digits = 1): string => {
  const v = p * 100;
  if (v === 0) return "0%";
  if (v < 0.01) return `${v.toExponential(1)}%`;
  return `${v.toFixed(digits)}%`;
};
const effect = (v: number): string => `${v >= 0 ? "▲" : "▼"}${(Math.abs(v) * 100).toFixed(0)}%`;
const el = (tag: string, text = "", className?: string): HTMLElement => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};

const priority = report.rows.map((r) => r.id as OptionId);
const rankOf = new Map(priority.map((id, i) => [id, i + 1]));
const effectOf = new Map(report.rows.map((r) => [r.id as OptionId, r]));
const table = baseStageTable();
const best = table.reduce((a, b) => (b.expectedValue > a.expectedValue ? b : a));

const optionCard = (id: OptionId, tag: "button" | "div"): HTMLElement => {
  const def = OPTIONS[id];
  const card = el(tag, "", `card g-${def.group}`);
  const head = el("div", "", "head");
  head.append(el("span", def.group, "grp"), el("span", `밸런스 ${rankOf.get(id)}위`));
  card.append(head, el("span", optionName(id), "name"), el("span", optionDesc(id), "desc"));
  const cost = optionCost(id);
  if (cost) card.append(el("span", `대신 ${cost}`, "cost"));
  return card;
};

// What changes right now if this option is picked; empty when it only matters on a later failure/success.
const preview = (s: GameState, id: OptionId): string => {
  const before = { ...s, offer: null };
  const after = grantOption(before, id);
  const parts: string[] = [];
  if (after.stage !== before.stage) parts.push(`단계 ${before.stage} → ${after.stage}`);
  const pb = successChance(before), pa = successChance(after);
  if (Math.abs(pa - pb) > 1e-9) parts.push(`다음 성공확률 ${pct(pb)} → ${pct(pa)}`);
  const rb = rewardAt(before, before.stage), ra = rewardAt(after, after.stage);
  if (Math.abs(ra - rb) > 0.5) parts.push(`지금 상금 ${won(rb)} → ${won(ra)}`);
  return parts.join(", ");
};

let game: GameState = newGame();
let stats = { tries: 0, max: 0, banked: 0 };

const renderLadder = (): void => {
  const s = game;
  const rungs = table.slice(1).map((row) => {
    const li = el("li", "", "rung");
    if (row.stage < s.stage) li.classList.add("done");
    if (row.stage === s.stage) li.classList.add("cur");
    if (row.stage === s.stage + 1 && !s.offer) li.classList.add("next");
    if (row.stage === best.stage) li.classList.add("best");
    const chance = row.stage === s.stage + 1 ? successChance(s) : row.successRate;
    li.append(el("b", String(row.stage)), el("span", wonShort(rewardAt(s, row.stage)), "amt"), el("span", pct(chance, 0), "p"));
    li.title = `${row.stage}단계 : 상금 ${won(rewardAt(s, row.stage))}, 오를 확률 ${pct(chance)}`;
    return li;
  });
  $("ladder").replaceChildren(...rungs);
};

const renderOffer = (): void => {
  const offer = game.offer;
  $("offer").hidden = !offer;
  $("actions").hidden = Boolean(offer);
  if (!offer) return;
  $("offerList").replaceChildren(...offer.map((id, i) => {
    const card = optionCard(id, "button");
    const now = preview(game, id);
    card.insertBefore(el("span", now ? `지금 고르면 : ${now}` : "나중에 성공·실패할 때 효과가 남", "now"), null);
    const foot = el("div", "", "foot");
    const n = game.stacks[id] ?? 0;
    foot.append(el("span", `${"●".repeat(n)}${"○".repeat(MAX_STACKS - n)} 보유 ${n}/${MAX_STACKS}`, "dots"), el("span", `${i + 1}번`));
    card.append(foot);
    card.onclick = () => pick(id);
    return card;
  }));
};

const renderOwned = (): void => {
  const items = (Object.entries(game.stacks) as [OptionId, number][]).map(([id, n]) => {
    const chip = el("li", "", `chip g-${OPTIONS[id].group}`);
    chip.title = optionDesc(id);
    chip.append(el("span", optionName(id)), el("i", `×${n}`));
    return chip;
  });
  const m = game.mods;
  const extra = [
    m.rocket > 0 && `로켓 ${m.rocket}회 남음`,
    m.guaranteed > 0 && `확정 성공 ${m.guaranteed}회 남음`,
    m.focusLeft > 0 && `집중 ${m.focusLeft}회 남음`,
    m.lives > 0 && `부활 ${m.lives}회 남음`,
  ].filter(Boolean).join(", ");
  if (extra) items.push(el("li", extra, "extra"));
  $("owned").replaceChildren(...(items.length ? items : [el("li", "성공하면 옵션을 고를 수 있습니다.", "empty")]));
};

const renderAdvice = (): void => {
  const box = $("advice");
  box.replaceChildren();
  if (game.offer) { box.textContent = "옵션을 먼저 고르세요."; return; }
  if (game.stage >= MAX_STAGE) { box.textContent = "마지막 단계입니다. 상금을 받으세요."; return; }
  if (game.stage === 0) { box.textContent = "0단계에서는 받을 상금이 없습니다. 도전하세요."; return; }
  const gain = continueGain(game);
  box.append(
    "한 번 더 도전하면 평균 ",
    el("span", gain >= 0 ? `+${won(gain)} 이득` : `${won(gain)} 손해`, gain >= 0 ? "up" : "down"),
    gain >= 0 ? ". 도전이 유리합니다." : ". 지금 받는 게 유리합니다.",
  );
};

const render = (): void => {
  const s = game;
  $("stage").textContent = String(s.stage);
  $("reward").textContent = won(rewardAt(s, s.stage));
  const chance = s.stage < MAX_STAGE ? successChance(s) : 0;
  $("nextRate").textContent = s.stage < MAX_STAGE ? pct(chance) : "없음";
  $("nextFill").style.width = `${chance * 100}%`;
  $("tries").textContent = stats.tries.toLocaleString("ko-KR");
  $("maxStage").textContent = `${stats.max}단계`;
  $("banked").textContent = won(stats.banked);
  $<HTMLButtonElement>("challenge").disabled = Boolean(s.offer) || s.stage >= MAX_STAGE;
  const take = $<HTMLButtonElement>("cashout");
  take.disabled = s.stage === 0;
  take.firstChild!.textContent = s.stage ? `${won(rewardAt(s, s.stage))} 받기 ` : "상금 받기 ";
  renderLadder();
  renderOffer();
  renderOwned();
  renderAdvice();
};

const feedback = (text: string, tone: "ok" | "bad" | "", motion?: "win" | "lose"): void => {
  $("log").prepend(el("li", text, tone));
  const flash = $("flash");
  flash.textContent = text;
  flash.className = `flash ${tone}`;
  const status = $("status");
  status.classList.remove("win", "lose");
  if (motion) {
    void status.offsetWidth; // restart the CSS animation
    status.classList.add(motion);
  }
};

const describe = (o: ChallengeOutcome): [string, "ok" | "bad", "win" | "lose"] => {
  const to = o.state.stage;
  const chance = pct(o.chance);
  switch (o.result) {
    case "success": return [`성공! ${o.from} → ${to}단계 (확률 ${chance})`, "ok", "win"];
    case "double": return [`점프 성공! ${o.from} → ${to}단계`, "ok", "win"];
    case "dodged": return [`실패했지만 행운으로 없던 일. ${to}단계 유지`, "ok", "win"];
    case "revived": return [`실패했지만 부활. ${to}단계 유지, 상금 줄어듦`, "bad", "lose"];
    case "softened": return [`실패. 안전장치로 ${to}단계까지만 떨어짐`, "bad", "lose"];
    case "failed": return [`실패. ${o.from} → 0단계${o.payout > 0 ? `, 보상 ${won(o.payout)} 받음` : ", 옵션 모두 사라짐"}`, "bad", "lose"];
  }
};

// Only a cash-out counts for the ranking; a run that ends in failure leaves no record.
const record = (stage: number, payout: number): void => {
  void reportStage(stage, payout).then((best) => {
    if (best) $("log").prepend(el("li", `랭킹 기록 갱신 : ${best.best_stage}단계 · ${won(best.best_amount)}`, "ok"));
  });
};

const doChallenge = (): void => {
  if (game.offer || game.stage >= MAX_STAGE) return;
  const out = challenge(game, Math.random);
  game = out.state;
  stats.tries += 1;
  stats.banked += out.payout;
  stats.max = Math.max(stats.max, game.stage);
  const [text, tone, motion] = describe(out);
  feedback(text, tone, motion);
  render();
};
const doCashOut = (): void => {
  if (game.stage === 0) return;
  const stage = game.stage;
  const { state, payout, jackpot } = cashOut(game, Math.random);
  game = state;
  stats.banked += payout;
  feedback(`${stage}단계에서 ${won(payout)} 받음${jackpot ? " (잭팟! 2배)" : ""}`, "ok", jackpot ? "win" : undefined);
  render();
  record(stage, payout);
};
const pick = (id: OptionId): void => {
  game = chooseOption(game, id);
  stats.max = Math.max(stats.max, game.stage);
  feedback(`옵션 선택 : ${optionName(id)}`, "");
  render();
  $("challenge").focus();
};

$("challenge").onclick = doChallenge;
$("cashout").onclick = doCashOut;
$("reset").onclick = () => {
  game = newGame();
  stats = { tries: 0, max: 0, banked: 0 };
  $("log").replaceChildren();
  $("flash").textContent = "";
  render();
};
document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === "Space") { e.preventDefault(); doChallenge(); }
  else if (e.key === "s" || e.key === "S") doCashOut();
  else if (game.offer && /^[1-3]$/.test(e.key)) {
    const id = game.offer[Number(e.key) - 1];
    if (id) pick(id);
  }
});

const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
for (const tab of tabs) {
  tab.onclick = () => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      $(t.getAttribute("aria-controls")!).hidden = !on;
    }
  };
}

const renderGuide = (): void => {
  $("summary").textContent =
    `옵션을 고르며 진행하면 판당 기대값이 옵션 없을 때(${won(report.base)})의 약 ${((report.fullRandom + report.fullGreedy) / 2).toFixed(1)}배가 됩니다.`;
  $("balanceNote").textContent =
    `${priority.length}개 옵션은 ${MAX_STACKS}번 쌓였을 때 효과가 모두 약 +${Math.round(report.target * 100)}%가 되도록 맞췄습니다. ` +
    `효과 = 0단계에서 그 옵션을 갖고 시작할 때 판당 기대값 증가율. ${report.runs.toLocaleString("ko-KR")}판 시뮬레이션 결과입니다.`;
  $("guide").replaceChildren(...priority.map((id) => {
    const card = optionCard(id, "div");
    const row = effectOf.get(id)!;
    const fx = el("div", "", "effect");
    fx.append(el("span", "1개 "), el("b", effect(row.one)), el("span", "3개 "), el("b", effect(row.three)));
    card.append(fx);
    return card;
  }));
};

const renderBaseTable = (): void => {
  $("rows").replaceChildren(...table.map((r) => {
    const tr = document.createElement("tr");
    if (r.stage === best.stage) tr.className = "best";
    tr.append(el("td", String(r.stage)), el("td", r.stage ? pct(r.successRate, 2) : "-"), el("td", r.stage ? pct(r.failRate, 2) : "-"),
      el("td", pct(r.reachProbability, 2)), el("td", won(r.reward)), el("td", won(r.expectedValue)));
    return tr;
  }));
};

$("simulate").onclick = () => {
  const chooser = $<HTMLSelectElement>("chooser").value;
  const runs = Math.min(500_000, Math.max(1_000, Math.floor(Number($<HTMLInputElement>("runs").value) || 0)));
  const mode: AutoPlayMode = chooser === "none" ? {} : { chooser: chooser === "random" ? "random" : "priority", priority };
  const reached = new Array<number>(MAX_STAGE + 1).fill(0);
  let total = 0;
  for (let i = 0; i < runs; i += 1) {
    const { payout, maxStage } = autoPlayRun(mode, Math.random);
    total += payout;
    for (let k = 0; k <= maxStage; k += 1) reached[k] += 1;
  }
  const avg = total / runs;
  const kv = $("simResult");
  const add = (k: string, v: string): HTMLElement => {
    const box = el("div");
    box.append(el("dt", k), el("dd", v));
    return box;
  };
  kv.replaceChildren(
    add("반복", `${runs.toLocaleString("ko-KR")}판`),
    add("판당 평균 상금", won(avg)),
    add("옵션 없을 때 이론값", won(best.expectedValue)),
    add("옵션 없을 때 대비", `${(avg / best.expectedValue).toFixed(2)}배`),
  );
  const top = reached.findLastIndex((c) => c > 0);
  $("bars").replaceChildren(...reached.slice(1, Math.max(2, top + 1)).map((c, i) => {
    const stage = i + 1;
    const emp = c / runs;
    const theory = table[stage].reachProbability;
    const row = el("div", "", "bar");
    const track = el("div", "", "track");
    const fill = el("div", "", "fill");
    fill.style.width = `${emp * 100}%`;
    const tick = el("div", "", "tick");
    tick.style.left = `${theory * 100}%`;
    track.append(fill, tick);
    row.append(el("span", `${stage}단계`), track, el("span", `${pct(emp, 2)} / ${pct(theory, 2)}`));
    return row;
  }));
  $("barsNote").hidden = false;
};

$("lastStage").textContent = String(MAX_STAGE);
renderGuide();
renderBaseTable();
render();
void mountAccount($("account"));
