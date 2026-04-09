// ─── Project OS v1 — Global Types ────────────────────────────────

export type ProjectType = 'ip' | 'ai_content' | 'tool' | 'other'
export type ProjectStatus =
  | 'pending'       // 待分析
  | 'analyzing'     // 分析中
  | 'needs_info'    // 待补资料
  | 'pending_dev'   // 待开发
  | 'in_dev'        // 开发中
  | 'validating'    // 待内容验证
  | 'active'        // 进行中
  | 'paused'        // 暂停
  | 'abandoned'     // 放弃

export type ProjectStage =
  | 'draft'         // 创建
  | 'sourcing'      // 输入资料
  | 'analysis'      // 初步分析
  | 'gap_fill'      // 缺口识别&补充研究
  | 'deep_analysis' // 二次分析
  | 'automation'    // 自动化判断
  | 'dispatch'      // 任务分发
  | 'executing'     // 执行中
export type SourceType = 'text' | 'url' | 'file' | 'capture' | 'chat' | 'image_desc'
export type HandoffType = 'dev' | 'content' | 'research'
export type CaptureTaskType = 'read_page' | 'paginate' | 'expand_tree' | 'extract_table'
export type CaptureStatus = 'pending' | 'running' | 'done' | 'error' | 'manual'
export type LogType = 'analysis' | 'capture' | 'handoff' | 'user' | 'system'
export type AutomationLevel = 'full' | 'semi' | 'manual'
export type ChunkType = 'raw' | 'summary' | 'rule' | 'sop' | 'opportunity' | 'conclusion'
export type EmbedStatus = 'pending' | 'done' | 'error'

// ── DB Row Types ─────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  type: ProjectType
  description: string | null
  goal: string | null
  status: ProjectStatus
  stage: ProjectStage
  automation_score: number
  next_action: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ProjectSource {
  id: string
  project_id: string
  source_type: SourceType
  source_title: string | null
  source_url: string | null
  content_raw: string
  content_summary: string | null
  embed_status: EmbedStatus
  created_at: string
}

export interface ProjectAnalysis {
  id: string
  project_id: string
  project_definition: string | null
  target_user: string | null
  monetization: string | null          // JSON stringified array
  workflow: string | null              // JSON stringified array
  risks: string | null                 // JSON stringified array
  gaps: string | null                  // JSON stringified array
  automation_map: AutomationNode[] | null
  mvp_suggestion: string | null
  confidence: number
  pass_count: number
  raw_response: string | null
  created_at: string
}

export interface AutomationNode {
  node: string              // 节点名称
  current_approach: string  // 当前做法
  automatable: boolean
  level: AutomationLevel    // full | semi | manual
  recommended_solution: string
  priority: 'high' | 'medium' | 'low'
  needs_human: boolean
}

export interface ProjectHandoff {
  id: string
  project_id: string
  handoff_type: HandoffType
  handoff_content: string   // Markdown
  version: number
  created_at: string
}

export interface ProjectLog {
  id: string
  project_id: string
  log_type: LogType
  content: string
  meta: Record<string, unknown> | null
  created_at: string
}

export interface CaptureTask {
  id: string
  project_id: string
  target_url: string
  task_type: CaptureTaskType
  instructions: Record<string, unknown> | null
  status: CaptureStatus
  result_source_id: string | null
  error_msg: string | null
  created_at: string
  updated_at: string
}

export interface KnowledgeChunk {
  id: string
  project_id: string | null
  source_id: string
  title: string | null
  chunk_text: string
  chunk_index: number
  tags: string[]
  chunk_type: ChunkType
  updated_at: string
}

// ── API Request/Response Types ──────────────────────────────────

export interface CreateProjectInput {
  name: string
  type: ProjectType
  description?: string
  goal?: string
  notes?: string
}

export interface UpdateProjectInput {
  name?: string
  type?: ProjectType
  description?: string
  goal?: string
  status?: ProjectStatus
  stage?: ProjectStage
  next_action?: string
  notes?: string
}

export interface AddSourceInput {
  project_id: string
  source_type: SourceType
  source_title?: string
  source_url?: string
  content_raw: string
}

export interface AnalysisResult {
  analysis: ProjectAnalysis
  handoffs: ProjectHandoff[]
  gaps_requiring_capture: string[]
  obsidian_written: boolean
}

export interface CreateCaptureTaskInput {
  project_id: string
  target_url: string
  task_type: CaptureTaskType
  instructions?: Record<string, unknown>
}

// ── UI Helper Types ───────────────────────────────────────────────

export interface ProjectWithStats extends Project {
  source_count?: number
  last_analysis?: ProjectAnalysis | null
}

export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: string }
