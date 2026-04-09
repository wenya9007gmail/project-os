import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function parseJsonSafe<T>(str: string | null, fallback: T): T {
  if (!str) return fallback
  try { return JSON.parse(str) as T } catch { return fallback }
}

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  ip: '个人IP',
  ai_content: 'AI内容',
  tool: '工具产品',
  other: '其他',
}

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  pending:    '待分析',
  analyzing:  '分析中',
  needs_info: '待补资料',
  pending_dev:'待开发',
  in_dev:     '开发中',
  validating: '待内容验证',
  active:     '进行中',
  paused:     '暂停',
  abandoned:  '放弃',
}

export const PROJECT_STATUS_COLORS: Record<string, string> = {
  pending:    'bg-slate-100 text-slate-600',
  analyzing:  'bg-blue-100 text-blue-700',
  needs_info: 'bg-amber-100 text-amber-700',
  pending_dev:'bg-purple-100 text-purple-700',
  in_dev:     'bg-indigo-100 text-indigo-700',
  validating: 'bg-orange-100 text-orange-700',
  active:     'bg-green-100 text-green-700',
  paused:     'bg-yellow-100 text-yellow-600',
  abandoned:  'bg-red-100 text-red-600',
}

export const PROJECT_STAGE_LABELS: Record<string, string> = {
  draft:        '创建',
  sourcing:     '输入资料',
  analysis:     '初步分析',
  gap_fill:     '补充研究',
  deep_analysis:'二次分析',
  automation:   '自动化判断',
  dispatch:     '任务分发',
  executing:    '执行中',
}

export const AUTOMATION_LEVEL_COLORS: Record<string, string> = {
  full: 'text-green-600 bg-green-50',
  semi: 'text-amber-600 bg-amber-50',
  manual: 'text-red-600 bg-red-50',
}

export const AUTOMATION_LEVEL_LABELS: Record<string, string> = {
  full: '全自动',
  semi: '半自动',
  manual: '人工',
}
