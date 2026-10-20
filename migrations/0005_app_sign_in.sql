-- Signing in from the native app: the same shape as dev_sign_ins, but handing
-- a ticket to a custom scheme instead of to another origin. `challenge` is the
-- hash of the verifier the app kept, so an intercepted link is worthless.
CREATE TABLE app_sign_ins (
  state_hash TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  scheme TEXT NOT NULL,
  ticket_hash TEXT UNIQUE,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX app_sign_ins_by_expiry ON app_sign_ins (expires_at);
