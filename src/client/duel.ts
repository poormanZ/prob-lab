import report from "../duel-report.json";
import {
  ACTION_NAME, ACTIONS, act, autoDuel, choose, clearedOf, DUEL_OPTIONS, duelOptionDesc, duelOptionName, enemyAt,
  enemyTable, kitOf, LAST_STAGE, newDuel, nextClearWith, solverFor, visiblePeek,
  type Action, type AutoMode, type DuelOptionId, type DuelState, type TurnResult,
} from "../duel";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
};
const el = (tag: string, text = "", className?: string): HTMLElement => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};
const pct = (p: number, digits = 0): string => {
  const v = p * 100;
  if (v > 0 && v < 0.5 && digits === 0) return "<1%";
  return `${v.toFixed(digits)}%`;
};
const signed = (v: number): string => `${v >= 0 ? "▲" : "▼"}${Math.abs(v).toFixed(2)}`;

const priority = report.rows.map((r) => r.id as DuelOptionId);
const rowOf = new Map(report.rows.map((r, i) => [r.id as DuelOptionId, { ...r, rank: i + 1 }]));
const table = enemyTable();

let game: DuelState = newDuel(Math.random);
let stats = { runs: 1, best: 0, fulls: 0 };

const startPos = (s: DuelState, stage: number) => {
  const kit = kitOf(s.stacks);
  return { h: kit.maxHp, e: enemyAt(stage).hp, mc: kit.preheat ? 1 : 0, ec: 0, r: s.pos.r };
};
const solver = () => solverFor(game.stacks, game.stage);

const renderLadder = (): void => {
  const s = game;
  const rungs = table.map((row) => {
    const li = el("li", "", "rung");
    const done = row.stage < s.stage || (row.stage === s.stage && (s.status === "offer" || s.status === "clear"));
    if (done) li.classList.add("done");
    else if (row.stage === s.stage) li.classList.add(s.status === "dead" ? "lost" : "cur");
    const f = row.foe;
    const chance = done ? null : row.stage === s.stage && s.status === "fight" ? solver().value(s.pos) : solverFor(s.stacks, row.stage).value(startPos(s, row.stage));
    li.append(el("b", String(row.stage)), el("span", `${f.hp}/${f.atk}/${f.def}`, "amt"), el("span", chance === null ? "✓" : pct(chance), "p"));
    li.title = `${row.stage}스테이지 : 체력 ${f.hp}, 공격 ${f.atk}, 방어 ${f.def}`;
    return li;
  });
  $("ladder").replaceChildren(...rungs);
  const cur = $("ladder").querySelector<HTMLElement>(".cur, .lost");
  if (cur && matchMedia("(max-width: 640px)").matches) cur.scrollIntoView({ block: "nearest", inline: "center" });
};

const hpBar = (now: number, max: number, tone: string): HTMLElement => {
  const wrap = el("div", "", `hp ${tone}`);
  const track = el("div", "", "hp-track");
  const fill = el("div", "", "hp-fill");
  fill.style.width = `${max ? (Math.max(0, now) / max) * 100 : 0}%`;
  track.append(fill);
  wrap.append(el("span", `체력 ${Math.max(0, now)}/${max}`, "hp-num"), track);
  return wrap;
};

const renderFighters = (): void => {
  const s = game;
  const kit = kitOf(s.stacks);
  const foe = enemyAt(s.stage);
  const live = s.status === "fight";
  const charged = live && s.pos.mc > 0;
  const foeCharged = live && s.pos.ec > 0;
  const myAtk = kit.atk * (charged ? 1 + kit.chargePower : 1);
  const me = $("me");
  me.replaceChildren(
    el("h3", "나"),
    hpBar(s.pos.h, kit.maxHp, "me"),
    el("p", `공격 ${myAtk}${charged ? ` (×${1 + kit.chargePower})` : ""} · 방어 ${kit.def}`, "st"),
  );
  if (charged) me.append(el("span", "충전됨", "badge"));
  if (s.pos.r > 0) me.append(el("span", `부활 ${s.pos.r}`, "badge soft"));
  me.classList.toggle("charged", charged);

  const box = $("foe");
  box.replaceChildren(
    el("h3", `상대 ${s.stage}`),
    hpBar(s.pos.e, foe.hp, "foe"),
    el("p", `공격 ${foe.atk * (foeCharged ? 2 : 1)}${foeCharged ? " (×2)" : ""} · 방어 ${foe.def}`, "st"),
  );
  if (foeCharged) box.append(el("span", "충전됨", "badge warn"));
  box.classList.toggle("charged", foeCharged);
};

const renderActions = (): void => {
  const s = game;
  const over = s.status === "dead" || s.status === "clear";
  $("restart").hidden = !over;
  const fighting = s.status === "fight";
  const adv = fighting ? solver().advise(s.pos) : null;
  const peek = visiblePeek(s);
  const q = (a: Action): number => (adv ? (peek ? adv.seen[a][peek] : adv.blind[a]) : 0);
  const top = adv ? Math.max(...ACTIONS.map(q)) : 0;
  for (const a of ACTIONS) {
    const btn = $<HTMLButtonElement>(`act-${a}`);
    btn.hidden = over;
    btn.disabled = !fighting;
    btn.classList.toggle("top", Boolean(adv) && q(a) >= top - 1e-9);
    btn.querySelector(".odds")!.textContent = adv ? pct(q(a)) : "";
  }
  $("clearNow").textContent = fighting ? pct(adv!.value, 1) : s.status === "dead" ? "패배" : "클리어";
  $("clearNow").classList.toggle("bad", s.status === "dead");

  const box = $("advice");
  box.replaceChildren();
  if (s.status === "offer") { box.textContent = "옵션을 고르세요."; return; }
  if (s.status === "dead") { box.textContent = `${clearedOf(s)}개 스테이지 클리어. 다시 해 보세요.`; return; }
  if (s.status === "clear") { box.textContent = `${LAST_STAGE}스테이지까지 모두 클리어!`; return; }
  if (peek) box.append(el("span", `간파 : 상대는 ${ACTION_NAME[peek]}`, "fore up"));
  const best = ACTIONS.find((a) => q(a) >= top - 1e-9)!;
  box.append("버튼 숫자 = 그 행동 후 깰 확률. 추천 ", el("span", ACTION_NAME[best], "up"));
};

let offerShown = false;
const optionCard = (id: DuelOptionId, key: number): HTMLButtonElement => {
  const def = DUEL_OPTIONS[id];
  const card = el("button", "", `card g-${def.group}`) as HTMLButtonElement;
  const head = el("div", "", "head");
  const n = game.stacks[id] ?? 0;
  head.append(el("span", def.group, "grp"), el("span", duelOptionName(id), "name"), el("span", n ? `${n + 1}${def.max < 99 ? `/${def.max}` : "개째"}` : "", "lv"), el("kbd", String(key)));
  card.append(head, el("span", duelOptionDesc(id), "desc"));
  const before = nextClearWith(game, null), after = nextClearWith(game, id);
  card.append(el("span", `다음 스테이지 ${pct(before, 1)} → ${pct(after, 1)}`, "now"));
  card.onclick = () => pick(id);
  return card;
};
const renderOffer = (): void => {
  const offer = game.status === "offer" ? game.offer : null;
  $("offer").hidden = !offer;
  document.body.classList.toggle("locked", Boolean(offer));
  if (!offer) { offerShown = false; return; }
  const cards = offer.map((id, i) => optionCard(id, i + 1));
  $("offerList").replaceChildren(...cards);
  if (!offerShown) { offerShown = true; cards[0]?.focus({ preventScroll: true }); }
};

const renderOwned = (): void => {
  const items = (Object.entries(game.stacks) as [DuelOptionId, number][]).map(([id, n]) => {
    const chip = el("li", "", `chip g-${DUEL_OPTIONS[id].group}`);
    chip.title = duelOptionDesc(id);
    chip.append(el("span", duelOptionName(id)), el("i", `×${n}`));
    return chip;
  });
  $("owned").replaceChildren(...(items.length ? items : [el("li", "없음", "empty")]));
};

const render = (): void => {
  $("stage").textContent = String(game.stage);
  $("runs").textContent = stats.runs.toLocaleString("ko-KR");
  $("best").textContent = `${stats.best}개`;
  $("fulls").textContent = stats.fulls.toLocaleString("ko-KR");
  renderFighters();
  renderActions();
  renderLadder();
  renderOffer();
  renderOwned();
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

const describe = (t: TurnResult, before: DuelState): [string, "ok" | "bad" | ""] => {
  const power = (who: "mc" | "ec", a: Action): string => (a === "attack" && before.pos[who] ? "충전 공격" : ACTION_NAME[a]);
  const parts: string[] = [`나 ${power("mc", t.mine)} · 상대 ${power("ec", t.theirs)}`];
  if (t.dodged) parts.push("회피!");
  if (t.taken) parts.push(`내 체력 −${t.taken}`);
  if (t.revived) parts.push("부활로 버팀");
  if (t.countered) parts.push(`반격 ${t.countered}`);
  if (t.dealt - t.countered > 0) parts.push(`상대 체력 −${t.dealt - t.countered}`);
  else if (t.mine === "attack" && t.theirs === "defend") parts.push("막힘");
  if (!t.end && t.state.pos.mc && t.mine === "charge") parts.push("충전");
  if (t.end === "win") return [`${parts.join(", ")}. ${t.state.stage}스테이지 클리어!`, "ok"];
  if (t.end === "lose") return [`${parts.join(", ")}. 쓰러짐`, "bad"];
  return [parts.join(", "), t.taken ? "bad" : ""];
};

const doAct = (a: Action): void => {
  if (game.status !== "fight") return;
  const before = game;
  const t = act(game, a, Math.random);
  game = t.state;
  const [text, tone] = describe(t, before);
  if (t.end) {
    stats.best = Math.max(stats.best, clearedOf(game));
    if (game.status === "clear") stats.fulls += 1;
  }
  feedback(text, tone, t.end === "win" ? "win" : t.end === "lose" || t.taken ? "lose" : undefined);
  render();
};
const pick = (id: DuelOptionId): void => {
  if (game.status !== "offer") return;
  game = choose(game, id, Math.random);
  feedback(`옵션 선택 : ${duelOptionName(id)}`, "");
  render();
  $("act-attack").focus();
};
const restart = (): void => {
  if (game.status !== "dead" && game.status !== "clear") return;
  game = newDuel(Math.random);
  stats.runs += 1;
  feedback("새 판 시작", "");
  render();
};

for (const a of ACTIONS) $(`act-${a}`).onclick = () => doAct(a);
$("restart").onclick = restart;
$("reset").onclick = () => {
  game = newDuel(Math.random);
  stats = { runs: 1, best: 0, fulls: 0 };
  $("log").replaceChildren();
  $("flash").textContent = "";
  render();
};
document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^[1-3]$/.test(e.key)) {
    const i = Number(e.key) - 1;
    if (game.status === "offer") { const id = game.offer?.[i]; if (id) pick(id); }
    else doAct(ACTIONS[i]);
  } else if (e.key === "r" || e.key === "R") restart();
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
  $("summary").textContent = `${priority.length}개 옵션, 순위순. 오른쪽 숫자 : 이 옵션을 먼저 고를 때 평균 클리어 스테이지 수 변화 (랜덤 대비).`;
  $("guide").replaceChildren(...priority.map((id) => {
    const row = rowOf.get(id)!;
    const def = DUEL_OPTIONS[id];
    const li = el("li", "", `g-${def.group}`);
    const cap = def.max < 99 ? ` (최대 ${def.max})` : "";
    li.append(el("b", String(row.rank), "rk"), el("span", duelOptionName(id), "name"), el("span", `${duelOptionDesc(id)}${cap}`, "desc"), el("span", signed(row.diff), `fx ${row.diff < 0 ? "neg" : ""}`));
    return li;
  }));
};

const renderTable = (): void => {
  $("rows").replaceChildren(...table.map((r) => {
    const tr = document.createElement("tr");
    tr.append(el("td", String(r.stage)), el("td", String(r.foe.hp)), el("td", String(r.foe.atk)), el("td", String(r.foe.def)), el("td", pct(r.baseClear, 1)));
    return tr;
  }));
};

let simToken = 0;
$("simulate").onclick = () => {
  const chooser = $<HTMLSelectElement>("chooser").value as AutoMode["chooser"];
  const runs = Math.min(20_000, Math.max(100, Math.floor(Number($<HTMLInputElement>("simRuns").value) || 0)));
  const mode: AutoMode = { chooser, priority };
  const cleared = new Array<number>(LAST_STAGE + 2).fill(0);
  const token = ++simToken;
  const button = $<HTMLButtonElement>("simulate");
  button.disabled = true;
  let done = 0, sum = 0;
  const kv = $("simResult");
  const add = (k: string, v: string): HTMLElement => {
    const box = el("div");
    box.append(el("dt", k), el("dd", v));
    return box;
  };
  const draw = (): void => {
    kv.replaceChildren(
      add("평균 클리어", `${(sum / done).toFixed(2)}개`),
      add("10개 이상", pct(cleared.slice(10).reduce((a, b) => a + b, 0) / done, 1)),
      add("완주", pct(cleared[LAST_STAGE + 1] / done, 1)),
      add("진행", `${done.toLocaleString("ko-KR")} / ${runs.toLocaleString("ko-KR")}판`),
    );
    let atLeast = done;
    $("bars").replaceChildren(...table.map((r) => {
      atLeast -= cleared[r.stage];
      const share = atLeast / done;
      const row = el("div", "", "bar");
      const track = el("div", "", "track");
      const fill = el("div", "", "fill");
      fill.style.width = `${share * 100}%`;
      track.append(fill);
      row.append(el("span", `${r.stage}`), track, el("span", pct(share, 1)));
      return row;
    }));
    $("barsNote").hidden = false;
  };
  // Chunked so the page stays responsive on phones.
  const step = (): void => {
    if (token !== simToken) return;
    const until = Math.min(runs, done + 200);
    for (; done < until; done += 1) {
      const k = autoDuel(mode, Math.random);
      cleared[k] += 1;
      sum += k;
    }
    draw();
    if (done < runs) setTimeout(step, 0);
    else button.disabled = false;
  };
  step();
};

$<HTMLDetailsElement>("logBox").open = matchMedia("(min-width: 641px)").matches;
renderGuide();
renderTable();
render();
