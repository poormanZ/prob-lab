import type { User } from "./auth";
import { LAST_STAGE } from "./duel";
import { RANKING_LIMIT } from "./records";

// The duel runs in the browser, so the server can only reject runs no legal play could produce.
export const MAX_CLEARED = LAST_STAGE + 1;
export const MAX_TURNS = 100_000;

export type DuelRecordInput = { cleared: number; turns: number };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Every cleared stage takes at least one turn. Runs that clear nothing are not worth ranking. */
export const parseDuelRecord = (body: Record<string, unknown> | null): DuelRecordInput | null => {
  const cleared = body?.cleared, turns = body?.turns;
  if (!isInt(cleared) || cleared < 1 || cleared > MAX_CLEARED) return null;
  if (!isInt(turns) || turns < cleared || turns > MAX_TURNS) return null;
  return { cleared, turns };
};

export type DuelBest = { best_cleared: number; best_turns: number; achieved_at: string };

// Keeps more stages cleared; on a tie keeps fewer turns. Equal runs keep the earlier achievement.
export const saveDuelRecord = async (db: D1Database, userId: number, r: DuelRecordInput): Promise<{ updated: boolean; best: DuelBest }> => {
  const result = await db.prepare(
    `INSERT INTO duel_records (user_id, best_cleared, best_turns, achieved_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET best_cleared = excluded.best_cleared, best_turns = excluded.best_turns, achieved_at = excluded.achieved_at
     WHERE excluded.best_cleared > duel_records.best_cleared
        OR (excluded.best_cleared = duel_records.best_cleared AND excluded.best_turns < duel_records.best_turns)`,
  ).bind(userId, r.cleared, r.turns).run();
  const best = await getDuelBest(db, userId);
  if (!best) throw new Error("Duel record missing after save");
  return { updated: (result.meta.changes ?? 0) > 0, best };
};

export const getDuelBest = (db: D1Database, userId: number): Promise<DuelBest | null> =>
  db.prepare("SELECT best_cleared, best_turns, achieved_at FROM duel_records WHERE user_id = ?").bind(userId).first<DuelBest>();

type DuelRankRow = DuelBest & { rank: number; username: string; user_id: number };

const RANKED = `SELECT r.user_id, u.username, r.best_cleared, r.best_turns, r.achieved_at,
  RANK() OVER (ORDER BY r.best_cleared DESC, r.best_turns ASC, r.achieved_at ASC) AS rank
  FROM duel_records r JOIN users u ON u.id = r.user_id WHERE u.username IS NOT NULL`;

export const getDuelRanking = async (db: D1Database, user: User | null) => {
  const top = await db.prepare(`${RANKED} ORDER BY rank, r.user_id LIMIT ?`).bind(RANKING_LIMIT).all<DuelRankRow>();
  const total = await db.prepare("SELECT COUNT(*) AS n FROM duel_records r JOIN users u ON u.id = r.user_id WHERE u.username IS NOT NULL").first<{ n: number }>();
  const mine = user ? await db.prepare(`SELECT * FROM (${RANKED}) WHERE user_id = ?`).bind(user.id).first<DuelRankRow>() : null;
  const strip = ({ user_id, ...row }: DuelRankRow) => ({ ...row, me: user?.id === user_id });
  return { total: total?.n ?? 0, ranking: (top.results ?? []).map(strip), me: mine ? strip(mine) : null };
};
