-- Global scores
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,          -- 'breakout' | 'space-shooter' | 'highway-hopper'
  player TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scores_game_score
  ON scores (game, score DESC);

-- Achievements (optional for later)
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,
  code TEXT NOT NULL,          -- e.g. 'first_clear','no_deaths'
  player TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 5,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
