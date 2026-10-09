-- A short-lived, single-use handoff from Google's fixed production callback.
CREATE TABLE dev_sign_ins (
  state_hash TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  challenge TEXT NOT NULL,
  ticket_hash TEXT UNIQUE,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX dev_sign_ins_by_expiry ON dev_sign_ins (expires_at);
