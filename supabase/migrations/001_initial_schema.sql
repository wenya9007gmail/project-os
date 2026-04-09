-- Project OS v1 — Initial Schema
-- Run in Supabase SQL Editor

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. projects
CREATE TABLE IF NOT EXISTS projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'other',
  description     TEXT,
  goal            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  stage           TEXT NOT NULL DEFAULT 'draft',
  automation_score INT NOT NULL DEFAULT 0,
  next_action     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. project_sources
CREATE TABLE IF NOT EXISTS project_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type     TEXT NOT NULL DEFAULT 'text',
  source_title    TEXT,
  source_url      TEXT,
  content_raw     TEXT NOT NULL,
  content_summary TEXT,
  embed_status    TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. project_analysis
CREATE TABLE IF NOT EXISTS project_analysis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_definition  TEXT,
  target_user         TEXT,
  monetization        TEXT,
  workflow            TEXT,
  risks               TEXT,
  gaps                TEXT,
  automation_map      JSONB,
  mvp_suggestion      TEXT,
  confidence          INT NOT NULL DEFAULT 0,
  pass_count          INT NOT NULL DEFAULT 1,
  raw_response        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. project_handoffs
CREATE TABLE IF NOT EXISTS project_handoffs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  handoff_type    TEXT NOT NULL,
  handoff_content TEXT NOT NULL,
  version         INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. project_logs
CREATE TABLE IF NOT EXISTS project_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  log_type    TEXT NOT NULL DEFAULT 'system',
  content     TEXT NOT NULL,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. capture_tasks
CREATE TABLE IF NOT EXISTS capture_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_url       TEXT NOT NULL,
  task_type        TEXT NOT NULL DEFAULT 'read_page',
  instructions     JSONB,
  status           TEXT NOT NULL DEFAULT 'pending',
  result_source_id UUID REFERENCES project_sources(id) ON DELETE SET NULL,
  error_msg        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. knowledge_chunks (with vector)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  source_id   UUID REFERENCES project_sources(id) ON DELETE CASCADE,
  title       TEXT,
  chunk_text  TEXT NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  tags        TEXT[] DEFAULT '{}',
  chunk_type  TEXT NOT NULL DEFAULT 'raw',
  embedding   VECTOR(768),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sources_project     ON project_sources(project_id);
CREATE INDEX IF NOT EXISTS idx_analysis_project    ON project_analysis(project_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_project    ON project_handoffs(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_project_time   ON project_logs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capture_project_status ON capture_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_chunks_project      ON knowledge_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source       ON knowledge_chunks(source_id);

-- ── updated_at trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_capture_updated_at
  BEFORE UPDATE ON capture_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Vector search function ────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding  VECTOR(768),
  match_threshold  FLOAT   DEFAULT 0.7,
  match_count      INT     DEFAULT 10,
  filter_project   UUID    DEFAULT NULL
)
RETURNS TABLE(
  id         UUID,
  chunk_text TEXT,
  tags       TEXT[],
  chunk_type TEXT,
  similarity FLOAT
) AS $$
  SELECT
    id,
    chunk_text,
    tags,
    chunk_type,
    1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks
  WHERE
    embedding IS NOT NULL
    AND (filter_project IS NULL OR project_id = filter_project)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$ LANGUAGE SQL STABLE;
