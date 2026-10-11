-- The grammar history syncs through the same table as words, each row marked
-- with what it holds. Devices from before it existed only ever pull words.
ALTER TABLE words ADD COLUMN kind TEXT NOT NULL DEFAULT 'word';
