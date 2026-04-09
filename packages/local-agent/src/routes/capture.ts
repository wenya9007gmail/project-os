/**
 * capture.ts — 采集任务路由
 *
 * POST /capture         — 异步采集任务（Web App 发起，task_id 模式）
 * POST /capture/direct  — Chrome 扩展直连，同步返回采集结果
 */

import { Router } from 'express'
import { connectBrowser } from '../browser/cdp-client'
import { execute, TaskType } from '../browser/playwright-executor'

export const captureRoute = Router()

const WEB_APP_URL = process.env.WEB_APP_URL ?? 'http://localhost:3002'
const LOCAL_AGENT_SECRET = process.env.LOCAL_AGENT_SECRET ?? ''

interface CapturePayload {
  task_id: string
  project_id: string
  target_url: string
  task_type?: TaskType
  instructions?: Record<string, unknown>
}

// ── POST /capture — 异步任务 ──────────────────────────────────────────

captureRoute.post('/', async (req, res) => {
  const payload = req.body as CapturePayload

  if (!payload.task_id || !payload.target_url) {
    return res.status(400).json({ error: 'task_id 和 target_url 是必填项' })
  }

  res.json({ status: 'accepted', task_id: payload.task_id })

  runCaptureTask(payload).catch(err => {
    console.error(`[capture] 任务 ${payload.task_id} 失败:`, err)
    reportResult(payload.task_id, payload.project_id, {
      success: false,
      error_msg: (err as Error).message,
    })
  })
})

// ── POST /capture/direct — Chrome 扩展同步调用 ────────────────────────

interface DirectPayload {
  task_id?: string
  project_id?: string
  target_url: string
  title?: string
  content?: string      // 扩展已提取内容时直接上传
  task_type?: TaskType
  instructions?: Record<string, unknown>
}

captureRoute.post('/direct', async (req, res) => {
  const payload = req.body as DirectPayload

  if (!payload.target_url && !payload.content) {
    return res.status(400).json({ error: 'target_url 或 content 至少提供一个' })
  }

  try {
    let content = payload.content ?? ''
    let title   = payload.title   ?? ''

    // 若扩展没提供内容，则 Playwright 采集
    if (!content && payload.target_url) {
      const { browser, isUserChrome } = await connectBrowser()
      if (!isUserChrome) {
        console.warn('[capture/direct] 使用 headless 模式（无登录态）')
      }
      const result = await execute(browser, {
        task_type: payload.task_type ?? 'read_page',
        target_url: payload.target_url,
        instructions: payload.instructions,
      })
      content = result.content
      title   = result.title
    }

    // 保存到 Web App（如有 project_id）
    if (payload.project_id) {
      await fetch(`${WEB_APP_URL}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: payload.project_id,
          source_type: 'capture',
          source_title: title || payload.target_url,
          source_url: payload.target_url,
          content_raw: content,
        }),
      }).catch(e => console.warn('[capture/direct] 保存 source 失败:', e.message))
    }

    // 若有 task_id，上报任务结果
    if (payload.task_id && payload.project_id) {
      await reportResult(payload.task_id, payload.project_id, {
        success: true, content, title, source_url: payload.target_url,
      }).catch(e => console.warn('[capture/direct] 上报失败:', e.message))
    }

    return res.json({ success: true, title, length: content.length })
  } catch (e) {
    return res.status(500).json({ success: false, error: (e as Error).message })
  }
})

// ── 内部函数 ──────────────────────────────────────────────────────────

async function runCaptureTask(payload: CapturePayload): Promise<void> {
  const { browser, isUserChrome } = await connectBrowser()
  if (!isUserChrome) console.warn('[capture] headless 模式（无登录态）')

  const result = await execute(browser, {
    task_type: payload.task_type ?? 'read_page',
    target_url: payload.target_url,
    instructions: payload.instructions,
  })

  await reportResult(payload.task_id, payload.project_id, {
    success: result.success,
    content: result.content,
    title: result.title,
    source_url: payload.target_url,
    error_msg: result.error,
  })
}

async function reportResult(
  taskId: string,
  projectId: string,
  result: { success: boolean; content?: string; title?: string; source_url?: string; error_msg?: string }
) {
  await fetch(`${WEB_APP_URL}/api/capture/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(LOCAL_AGENT_SECRET ? { Authorization: `Bearer ${LOCAL_AGENT_SECRET}` } : {}),
    },
    body: JSON.stringify({ task_id: taskId, project_id: projectId, ...result }),
    signal: AbortSignal.timeout(10_000),
  })
}
