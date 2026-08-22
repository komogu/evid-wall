CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  side TEXT NOT NULL CHECK (side IN ('pro', 'con')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 90),
  claim TEXT NOT NULL CHECK (length(claim) BETWEEN 1 AND 120),
  author TEXT NOT NULL CHECK (length(author) BETWEEN 1 AND 40),
  context TEXT NOT NULL CHECK (length(context) BETWEEN 1 AND 180),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 3000),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_file (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL CHECK (length(original_name) BETWEEN 1 AND 180),
  content_type TEXT NOT NULL CHECK (length(content_type) BETWEEN 1 AND 120),
  size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 20971520),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS evidence_public_idx ON evidence(status, created_at DESC);
CREATE INDEX IF NOT EXISTS evidence_ip_day_idx ON evidence(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS evidence_file_entry_idx ON evidence_file(evidence_id);

CREATE TABLE IF NOT EXISTS rebuttal (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('pro', 'con')),
  author TEXT NOT NULL CHECK (length(author) BETWEEN 1 AND 40),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS rebuttal_entry_idx ON rebuttal(evidence_id, created_at ASC);
