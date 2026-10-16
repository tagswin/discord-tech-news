CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  rules_accepted_at INTEGER NOT NULL,
  rules_version TEXT NOT NULL
);
CREATE INDEX oauth_expiry ON oauth_states(expires_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  rules_accepted_at INTEGER NOT NULL,
  rules_version TEXT NOT NULL
);
CREATE INDEX session_expiry ON sessions(expires_at);

CREATE TABLE applications (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  rules_accepted_at INTEGER NOT NULL,
  rules_version TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  role_granted_at INTEGER
);
CREATE INDEX application_date ON applications(submitted_at);
