-- Accounts: one row per Google account. `seq` hands out the change versions
-- that a device's sync cursor counts up through.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  seq INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Only a hash of the cookie is kept, so a leaked table signs nobody in.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_by_user ON sessions (user_id);

-- One row per word, deletions included: a deleted word keeps its row with
-- `data` null, so other devices learn about it.
CREATE TABLE words (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX words_by_version ON words (user_id, version);
