CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  version      TEXT NOT NULL,
  source_url   TEXT,
  content_hash TEXT NOT NULL,
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT PRIMARY KEY,               -- hash(documento, seção, índice)
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  section     TEXT NOT NULL,
  page        INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('prose', 'table-row', 'heading')),
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding   vector(1024),                   -- voyage-3 / multilingual-e5-large
  tsv         tsvector GENERATED ALWAYS AS (
                to_tsvector('portuguese', section || ' ' || text)
              ) STORED
);

CREATE INDEX IF NOT EXISTS chunks_document_idx  ON chunks (document_id);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx       ON chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_rejection_idx ON chunks ((metadata->>'rejectionCode'))
  WHERE metadata ? 'rejectionCode';
