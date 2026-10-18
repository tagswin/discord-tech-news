CREATE TABLE news_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  state_json TEXT NOT NULL,
  last_check INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0,
  last_message_id TEXT
);
