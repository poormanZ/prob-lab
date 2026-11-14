-- One row per user: the most stages cleared in a duel run, and that run's total turns.
CREATE TABLE IF NOT EXISTS duel_records (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  best_cleared INTEGER NOT NULL,
  best_turns INTEGER NOT NULL,
  achieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_duel_records_rank ON duel_records(best_cleared DESC, best_turns ASC, achieved_at ASC);
