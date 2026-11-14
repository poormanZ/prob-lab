import { MAX_STAGE } from "../game";
import { mountAccount } from "./account";

type Row = { rank: number; username: string; best_stage: number; best_amount: number; achieved_at: string; me: boolean };
type Ranking = { total: number; ranking: Row[]; me: Row | null };

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const won = (v: number): string => `${Math.round(v).toLocaleString("ko-KR")}원`;
const cell = (text: string, className = ""): HTMLTableCellElement => {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
};

const stageCell = (stage: number): HTMLTableCellElement => {
  const td = cell("", "stage");
  const bar = document.createElement("span");
  bar.className = "sbar";
  bar.style.setProperty("--w", `${(stage / MAX_STAGE) * 100}%`);
  const num = document.createElement("b");
  num.textContent = `${stage}단계`;
  td.append(num, bar);
  return td;
};

const row = (r: Row): HTMLTableRowElement => {
  const tr = document.createElement("tr");
  if (r.me) tr.className = "mine";
  if (r.rank <= 3) tr.dataset.top = String(r.rank);
  // D1 CURRENT_TIMESTAMP is UTC without a zone marker.
  const day = new Date(`${r.achieved_at.replace(" ", "T")}Z`).toLocaleDateString("sv-SE");
  tr.append(cell(String(r.rank), "rk"), cell(r.username, "who"), stageCell(r.best_stage), cell(won(r.best_amount), "amt"), cell(day, "day"));
  return tr;
};

const load = async (): Promise<void> => {
  const body = $("rankRows");
  try {
    const res = await fetch("/api/ranking");
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json() as Ranking;
    $("rankTotal").textContent = `${data.total.toLocaleString("ko-KR")}명 참여`;
    if (!data.ranking.length) {
      const tr = document.createElement("tr");
      tr.append(Object.assign(cell("아직 기록이 없습니다. 첫 기록의 주인이 되어 보세요.", "empty"), { colSpan: 5 }));
      body.replaceChildren(tr);
    } else {
      body.replaceChildren(...data.ranking.map(row));
    }
    const mine = $("myRank");
    mine.hidden = !data.me || data.ranking.some((r) => r.me);
    if (data.me && !mine.hidden) mine.textContent = `내 순위 ${data.me.rank}위 · ${data.me.best_stage}단계 · ${won(data.me.best_amount)}`;
  } catch {
    const tr = document.createElement("tr");
    tr.append(Object.assign(cell("랭킹을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.", "empty"), { colSpan: 5 }));
    body.replaceChildren(tr);
  }
};

void mountAccount($("account"));
void load();
