import { LAST_STAGE } from "../duel";
import { MAX_STAGE } from "../game";
import { duelResultText, mountAccount, type Game } from "./account";

type Base = { rank: number; username: string; achieved_at: string; me: boolean };
type StreakRow = Base & { best_stage: number; best_amount: number };
type DuelRow = Base & { best_cleared: number; best_turns: number };
type Ranking<R> = { total: number; ranking: R[]; me: R | null };

interface Board<R extends Base> {
  api: string; rule: string; note: string; head: string[];
  cells: (r: R) => HTMLTableCellElement[];
  mine: (r: R) => string;
}

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const won = (v: number): string => `${Math.round(v).toLocaleString("ko-KR")}원`;
const cell = (text: string, className = ""): HTMLTableCellElement => {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
};
const barCell = (label: string, share: number): HTMLTableCellElement => {
  const td = cell("", "stage");
  const bar = document.createElement("span");
  bar.className = "sbar";
  bar.style.setProperty("--w", `${share * 100}%`);
  const num = document.createElement("b");
  num.textContent = label;
  td.append(num, bar);
  return td;
};
const clearedLabel = (n: number): string => (n > LAST_STAGE ? "완주" : `${n}개`);

const streak: Board<StreakRow> = {
  api: "/api/ranking",
  rule: "상금 받은 단계 순. 같으면 받은 상금 순.",
  note: "상금 받기로 끝낸 판만 기록. 잭팟 포함.",
  head: ["순위", "아이디", "최고 단계", "받은 상금", "달성일"],
  cells: (r) => [barCell(`${r.best_stage}단계`, r.best_stage / MAX_STAGE), cell(won(r.best_amount), "amt")],
  mine: (r) => `${r.best_stage}단계 · ${won(r.best_amount)}`,
};
const duel: Board<DuelRow> = {
  api: "/api/duel/ranking",
  rule: "클리어한 스테이지 수 순. 같으면 그 판의 턴 수가 적은 순.",
  note: "판이 끝날 때(쓰러지거나 완주) 기록. 0스테이지도 1개로 셈, 20스테이지까지 깨면 완주(21개).",
  head: ["순위", "아이디", "클리어", "턴 수", "달성일"],
  cells: (r) => [barCell(clearedLabel(r.best_cleared), r.best_cleared / (LAST_STAGE + 1)), cell(`${r.best_turns.toLocaleString("ko-KR")}턴`, "amt")],
  mine: (r) => duelResultText(r.best_cleared, r.best_turns),
};

const game: Game = new URLSearchParams(location.search).get("game") === "duel" ? "duel" : "streak";

const show = async <R extends Base>(board: Board<R>): Promise<void> => {
  $("rankRule").textContent = board.rule;
  $("rankNote").textContent = board.note;
  $("rankHead").replaceChildren(...board.head.map((h) => Object.assign(document.createElement("th"), { textContent: h })));
  const tab = $(`tab-${game}`);
  tab.setAttribute("aria-current", "page");
  const body = $("rankRows");
  const message = (text: string): void => {
    const tr = document.createElement("tr");
    tr.append(Object.assign(cell(text, "empty"), { colSpan: board.head.length }));
    body.replaceChildren(tr);
  };
  try {
    const res = await fetch(board.api);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json() as Ranking<R>;
    $("rankTotal").textContent = `${data.total.toLocaleString("ko-KR")}명 참여`;
    if (!data.ranking.length) message("아직 기록이 없습니다. 첫 기록의 주인이 되어 보세요.");
    else body.replaceChildren(...data.ranking.map((r) => {
      const tr = document.createElement("tr");
      if (r.me) tr.className = "mine";
      if (r.rank <= 3) tr.dataset.top = String(r.rank);
      // D1 CURRENT_TIMESTAMP is UTC without a zone marker.
      const day = new Date(`${r.achieved_at.replace(" ", "T")}Z`).toLocaleDateString("sv-SE");
      tr.append(cell(String(r.rank), "rk"), cell(r.username, "who"), ...board.cells(r), cell(day, "day"));
      return tr;
    }));
    const mine = $("myRank");
    mine.hidden = !data.me || data.ranking.some((r) => r.me);
    if (data.me && !mine.hidden) mine.textContent = `내 순위 ${data.me.rank}위 · ${board.mine(data.me)}`;
  } catch {
    message("랭킹을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.");
  }
};

document.title = game === "duel" ? "대결 랭킹" : "연속 도전 랭킹";
$("gameLink").setAttribute("href", game === "duel" ? "/duel" : "/");
void mountAccount($("account"), game);
void (game === "duel" ? show(duel) : show(streak));
