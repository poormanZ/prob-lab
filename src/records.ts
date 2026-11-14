import type { User } from "./auth";
import { grantOption, MAX_STACKS, MAX_STAGE, newGame, rewardAt, type GameState } from "./game";

// The game runs in the browser, so the server can only reject records no legal run could produce.
const maxedRewardState = ((): GameState => {
  let s = newGame();
  for (const id of ["D1", "D2", "D3", "D4"] as const) for (let i = 0; i < MAX_STACKS; i += 1) s = grantOption(s, id);
  return s;
})();
// wins can outrun the stage when safety nets keep a run alive, so give it generous headroom.
// ×2 covers the jackpot option, which doubles the cash-out.
export const maxAmountAt = (stage: number): number => Math.ceil(rewardAt(maxedRewardState, stage, stage * 3) * 2);

export type RecordInput = { stage: number; amount: number };

export const parseRecord = (body: Record<string, unknown> | null): RecordInput | null => {
  const stage = body?.stage, amount = body?.amount;
  if (typeof stage !== "number" || !Number.isInteger(stage) || stage < 1 || stage > MAX_STAGE) return null;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  const rounded = Math.round(amount);
  return rounded <= maxAmountAt(stage) ? { stage, amount: rounded } : null;
};

export type BestRecord = { best_stage: number; best_amount: number; achieved_at: string };

// Keeps the higher stage; on the same stage keeps the larger amount. Ties keep the earlier achievement.
export const saveRecord = async (db: D1Database, userId: number, r: RecordInput): Promise<{ updated: boolean; best: BestRecord }> => {
  const result = await db.prepare(
    `INSERT INTO records (user_id, best_stage, best_amount, achieved_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET best_stage = excluded.best_stage, best_amount = excluded.best_amount, achieved_at = excluded.achieved_at
     WHERE excluded.best_stage > records.best_stage
        OR (excluded.best_stage = records.best_stage AND excluded.best_amount > records.best_amount)`,
  ).bind(userId, r.stage, r.amount).run();
  const best = await db.prepare("SELECT best_stage, best_amount, achieved_at FROM records WHERE user_id = ?").bind(userId).first<BestRecord>();
  if (!best) throw new Error("Record missing after save");
  return { updated: (result.meta.changes ?? 0) > 0, best };
};

export type RankRow = BestRecord & { rank: number; username: string };

// Users who never picked a username stay off the board.
const RANKED = `SELECT r.user_id, u.username, r.best_stage, r.best_amount, r.achieved_at,
  RANK() OVER (ORDER BY r.best_stage DESC, r.best_amount DESC, r.achieved_at ASC) AS rank
  FROM records r JOIN users u ON u.id = r.user_id WHERE u.username IS NOT NULL`;

export const RANKING_LIMIT = 100;

export const getRanking = async (db: D1Database, user: User | null) => {
  const top = await db.prepare(`${RANKED} ORDER BY rank, r.user_id LIMIT ?`).bind(RANKING_LIMIT).all<RankRow & { user_id: number }>();
  const total = await db.prepare("SELECT COUNT(*) AS n FROM records r JOIN users u ON u.id = r.user_id WHERE u.username IS NOT NULL").first<{ n: number }>();
  const mine = user ? await db.prepare(`SELECT * FROM (${RANKED}) WHERE user_id = ?`).bind(user.id).first<RankRow & { user_id: number }>() : null;
  const strip = ({ user_id, ...row }: RankRow & { user_id: number }) => ({ ...row, me: user?.id === user_id });
  return {
    total: total?.n ?? 0,
    ranking: (top.results ?? []).map(strip),
    me: mine ? strip(mine) : null,
  };
};
