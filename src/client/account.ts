export type Best = { best_stage: number; best_amount: number; achieved_at: string };
export type DuelBest = { best_cleared: number; best_turns: number; achieved_at: string };
type Me = { user: { id: number; username: string | null }; best: Best | null; duelBest: DuelBest | null };
export type Game = "streak" | "duel";

const won = (v: number): string => `${Math.round(v).toLocaleString("ko-KR")}원`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};

let me: Me | null = null;
let root: HTMLElement | null = null;
let notice = "";
let game: Game = "streak";

export const duelResultText = (cleared: number, turns: number): string =>
  `${cleared > 20 ? "완주" : `${cleared}개 클리어`} · ${turns.toLocaleString("ko-KR")}턴`;

const sendJson = (path: string, method: string, body: unknown): Promise<Response> =>
  fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const renderGuest = (box: HTMLElement): void => {
  const login = el("a", "카카오로 로그인", "kakao");
  login.href = "/auth/kakao";
  const pitch = game === "duel"
    ? "로그인하면 가장 멀리 간 판이 랭킹에 올라갑니다. 같으면 턴 수가 적은 쪽이 위."
    : "로그인하면 상금 받기로 확정한 최고 기록이 랭킹에 올라갑니다.";
  box.append(el("span", notice || pitch, notice ? "acc-msg bad" : "acc-msg"), login);
};

const renderSignup = (box: HTMLElement): void => {
  const form = el("form", "", "signup");
  const input = el("input");
  Object.assign(input, { name: "username", placeholder: "아이디 (2~12자)", maxLength: 12, required: true, autocomplete: "nickname" });
  input.setAttribute("aria-label", "랭킹에 보일 아이디");
  const submit = el("button", "아이디 만들기", "btn go small");
  const msg = el("span", "랭킹에 보일 아이디를 만들어 주세요. 한글·영문·숫자·_", "acc-msg");
  form.append(input, submit);
  form.onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      const res = await sendJson("/api/me/username", "PUT", { username: input.value });
      const data = await res.json().catch(() => ({})) as { username?: string; error?: string };
      if (!res.ok || !data.username) throw new Error(data.error ?? "아이디를 저장하지 못했습니다.");
      me!.user.username = data.username;
      render();
    } catch (error) {
      msg.textContent = error instanceof Error ? error.message : "아이디를 저장하지 못했습니다.";
      msg.className = "acc-msg bad";
      submit.disabled = false;
      input.focus();
    }
  };
  box.append(msg, form);
  queueMicrotask(() => input.focus());
};

const bestText = (m: Me): string => {
  if (game === "duel") return m.duelBest ? `내 최고 ${duelResultText(m.duelBest.best_cleared, m.duelBest.best_turns)}` : "판이 끝나면 기록됩니다";
  return m.best ? `내 최고 ${m.best.best_stage}단계 · ${won(m.best.best_amount)}` : "상금을 받으면 기록됩니다";
};

const renderUser = (box: HTMLElement, m: Me, username: string): void => {
  const logout = el("button", "로그아웃", "link");
  logout.onclick = async () => {
    logout.disabled = true;
    await fetch("/auth/logout", { method: "POST" }).catch(() => null);
    me = null;
    render();
  };
  box.append(
    el("strong", username, "acc-name"),
    el("span", bestText(m), "acc-best"),
    logout,
  );
};

const render = (): void => {
  if (!root) return;
  const box = el("div", "", "acc");
  if (!me) renderGuest(box);
  else if (!me.user.username) renderSignup(box);
  else renderUser(box, me, me.user.username);
  root.replaceChildren(box);
};

export const mountAccount = async (container: HTMLElement, which: Game = "streak"): Promise<void> => {
  root = container;
  game = which;
  const params = new URLSearchParams(location.search);
  if (params.get("login") === "failed") {
    notice = "카카오 로그인에 실패했습니다. 다시 시도해 주세요.";
    params.delete("login");
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  }
  try {
    const res = await fetch("/api/me");
    me = res.ok ? await res.json() as Me : null;
  } catch {
    me = null;
  }
  render();
};

// Sends only improvements over the known best; most cash-outs need no request.
export const reportStage = async (stage: number, amount: number): Promise<Best | null> => {
  if (!me?.user.username || stage <= 0) return null;
  const b = me.best;
  const rounded = Math.round(amount);
  if (b && (stage < b.best_stage || (stage === b.best_stage && rounded <= b.best_amount))) return null;
  // Optimistic so a quick run of successes doesn't resend the same stage; reverted if the server refuses.
  me.best = { best_stage: stage, best_amount: rounded, achieved_at: new Date().toISOString() };
  render();
  const revert = (): null => { if (me) { me.best = b; render(); } return null; };
  try {
    const res = await sendJson("/api/records", "POST", { stage, amount: rounded });
    if (!res.ok) return revert();
    const data = await res.json() as { updated: boolean; best: Best };
    if (me) { me.best = data.best; render(); }
    return data.updated ? data.best : null;
  } catch {
    return revert();
  }
};

// Same idea as reportStage: only a better run (more cleared, or fewer turns on a tie) is sent.
export const reportDuel = async (cleared: number, turns: number): Promise<DuelBest | null> => {
  if (!me?.user.username || cleared < 1) return null;
  const b = me.duelBest;
  if (b && (cleared < b.best_cleared || (cleared === b.best_cleared && turns >= b.best_turns))) return null;
  me.duelBest = { best_cleared: cleared, best_turns: turns, achieved_at: new Date().toISOString() };
  render();
  const revert = (): null => { if (me) { me.duelBest = b; render(); } return null; };
  try {
    const res = await sendJson("/api/duel/records", "POST", { cleared, turns });
    if (!res.ok) return revert();
    const data = await res.json() as { updated: boolean; best: DuelBest };
    if (me) { me.duelBest = data.best; render(); }
    return data.updated ? data.best : null;
  } catch {
    return revert();
  }
};
