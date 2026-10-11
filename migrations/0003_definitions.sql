-- Definitions the model wrote for dictionary meanings that have none worth
-- showing, kept for everyone: the first person who picks a word pays for it.
-- `key` is a hash of the meaning (language, word, type, article, translation
-- and the dictionary's own definition of it).
CREATE TABLE definitions (
  key TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  term TEXT NOT NULL,
  type TEXT NOT NULL,
  definition TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- How many definitions the model has been asked for, per day: for everyone
-- ('all') and for each account ('user:<id>'). Keeps the daily allowance safe.
CREATE TABLE definition_usage (
  day TEXT NOT NULL,
  scope TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, scope)
);
