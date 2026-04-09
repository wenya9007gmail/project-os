-- Project OS v2 — Schema 修复迁移
-- 在 Supabase SQL Editor 中运行此文件

-- ── 1. knowledge_chunks 补充 embed_status 字段 ───────────────────────
ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS embed_status TEXT NOT NULL DEFAULT 'done';

-- ── 2. project_sources 补充 embed_status 索引（加速队列查询） ───────────
CREATE INDEX IF NOT EXISTS idx_sources_embed_status
  ON project_sources(embed_status)
  WHERE embed_status = 'pending';

-- ── 3. 重建 match_chunks RPC，返回完整字段 ───────────────────────────
-- 旧版只返回 id/chunk_text/tags/chunk_type/similarity
-- 新版补充 project_id/source_id/chunk_index/title
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding  VECTOR(768),
  match_threshold  FLOAT   DEFAULT 0.65,
  match_count      INT     DEFAULT 8,
  filter_project   UUID    DEFAULT NULL
)
RETURNS TABLE(
  id           UUID,
  project_id   UUID,
  source_id    UUID,
  title        TEXT,
  chunk_text   TEXT,
  chunk_index  INT,
  tags         TEXT[],
  chunk_type   TEXT,
  similarity   FLOAT
) AS $$
  SELECT
    kc.id,
    kc.project_id,
    kc.source_id,
    kc.title,
    kc.chunk_text,
    kc.chunk_index,
    kc.tags,
    kc.chunk_type,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE
    kc.embedding IS NOT NULL
    AND (filter_project IS NULL OR kc.project_id = filter_project)
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$ LANGUAGE SQL STABLE;

-- ── 4. knowledge_chunks updated_at 触发器 ───────────────────────────
-- PostgreSQL 不支持 CREATE TRIGGER IF NOT EXISTS，先删后建
DROP TRIGGER IF EXISTS trg_chunks_updated_at ON knowledge_chunks;
CREATE TRIGGER trg_chunks_updated_at
  BEFORE UPDATE ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
