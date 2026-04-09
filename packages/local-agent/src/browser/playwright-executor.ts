/**
 * playwright-executor.ts — Playwright 任务执行器
 *
 * 支持的任务类型（对应 CaptureTaskType）：
 *   read_page      — 读取单页主体文本
 *   paginate       — 翻页读取（列表/搜索结果等分页内容）
 *   expand_tree    — 展开树形结构（论坛帖子/评论/折叠内容）
 *   extract_table  — 提取页面表格为结构化 JSON
 */

import type { Page, Browser } from 'playwright'

// ── 公共类型 ────────────────────────────────────────────────────────

export type TaskType = 'read_page' | 'paginate' | 'expand_tree' | 'extract_table'

export interface ExecuteOptions {
  task_type: TaskType
  target_url: string
  instructions?: Record<string, unknown>
}

export interface ExecuteResult {
  success: boolean
  content: string          // 主体文本或序列化 JSON
  title: string
  source_url: string
  pages_scraped?: number
  error?: string
}

// ── 内容清洗 ─────────────────────────────────────────────────────────

const SKIP_SELECTORS = [
  'nav', 'footer', 'header', 'script', 'style', 'noscript',
  '[class*="ad-"]', '[id*="ad-"]', '.cookie-banner', '.modal-overlay',
]

async function cleanAndExtract(page: Page): Promise<string> {
  return page.evaluate((selectors: string[]) => {
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove())
    })
    const main = document.querySelector(
      'main, article, [role="main"], .content, #content, #main, .post-body'
    )
    return (((main ?? document.body) as HTMLElement).innerText ?? '').trim().slice(0, 60_000)
  }, SKIP_SELECTORS)
}

// ── 任务实现 ──────────────────────────────────────────────────────────

/** read_page: 读取单页主体内容 */
async function readPage(page: Page, url: string, instructions: Record<string, unknown>): Promise<ExecuteResult> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout((instructions.wait_ms as number | undefined) ?? 1500)

  if (instructions.scroll) {
    await autoScroll(page)
  }

  const title = await page.title()
  const content = await cleanAndExtract(page)

  return { success: true, content, title, source_url: url }
}

/** paginate: 翻页采集，合并多页内容 */
async function paginate(page: Page, url: string, instructions: Record<string, unknown>): Promise<ExecuteResult> {
  const maxPages = (instructions.max_pages as number | undefined) ?? 5
  const nextSelector = (instructions.next_selector as string | undefined) ?? 'a[rel="next"], .pagination-next, button[aria-label*="Next"], [data-testid="next-page"]'

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(1500)

  const title = await page.title()
  const parts: string[] = []
  let pageNum = 1

  while (pageNum <= maxPages) {
    const chunk = await cleanAndExtract(page)
    parts.push(`\n\n--- 第 ${pageNum} 页 ---\n${chunk}`)

    // 找下一页按钮
    const nextBtn = page.locator(nextSelector).first()
    const visible = await nextBtn.isVisible().catch(() => false)
    if (!visible) break

    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => {}),
      nextBtn.click(),
    ])
    await page.waitForTimeout(1500)
    pageNum++
  }

  return {
    success: true,
    content: parts.join('').trim().slice(0, 80_000),
    title,
    source_url: url,
    pages_scraped: pageNum,
  }
}

/** expand_tree: 展开折叠内容（评论、回复、"查看更多"等） */
async function expandTree(page: Page, url: string, instructions: Record<string, unknown>): Promise<ExecuteResult> {
  const expandSelector = (instructions.expand_selector as string | undefined) ??
    'button[class*="expand"], [aria-expanded="false"], .show-more, button:has-text("查看更多"), button:has-text("展开"), button:has-text("More")'
  const maxClicks = (instructions.max_clicks as number | undefined) ?? 20

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(1500)

  const title = await page.title()
  let clicked = 0

  // 循环点击展开按钮
  while (clicked < maxClicks) {
    const btns = page.locator(expandSelector)
    const count = await btns.count()
    if (count === 0) break

    for (let i = 0; i < Math.min(count, 5); i++) {
      await btns.nth(i).click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(500)
      clicked++
    }
  }

  await autoScroll(page)
  const content = await cleanAndExtract(page)

  return { success: true, content, title, source_url: url }
}

/** extract_table: 提取页面所有表格为 JSON 数组 */
async function extractTable(page: Page, url: string, instructions: Record<string, unknown>): Promise<ExecuteResult> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(1500)

  const title = await page.title()
  const tableSelector = (instructions.table_selector as string | undefined) ?? 'table'

  const tables = await page.evaluate((sel: string) => {
    const results: Array<{ headers: string[]; rows: string[][] }> = []
    document.querySelectorAll(sel).forEach(table => {
      const headers: string[] = []
      const rows: string[][] = []

      table.querySelectorAll('thead th, thead td').forEach(th => {
        headers.push((th.textContent ?? '').trim())
      })

      table.querySelectorAll('tbody tr').forEach(tr => {
        const row: string[] = []
        tr.querySelectorAll('td, th').forEach(td => {
          row.push((td.textContent ?? '').trim())
        })
        if (row.some(cell => cell !== '')) rows.push(row)
      })

      if (headers.length > 0 || rows.length > 0) {
        results.push({ headers, rows })
      }
    })
    return results
  }, tableSelector)

  const content = JSON.stringify(tables, null, 2)
  return { success: true, content, title, source_url: url }
}

// ── 工具函数 ──────────────────────────────────────────────────────────

async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      let lastHeight = 0
      const interval = setInterval(() => {
        window.scrollBy(0, 800)
        const h = document.body.scrollHeight
        if (h === lastHeight) { clearInterval(interval); resolve() }
        lastHeight = h
      }, 300)
      setTimeout(() => { clearInterval(interval); resolve() }, 12_000)
    })
  })
}

// ── 主入口 ─────────────────────────────────────────────────────────────

export async function execute(
  browser: Browser,
  opts: ExecuteOptions
): Promise<ExecuteResult> {
  const context = browser.contexts()[0] ?? await browser.newContext()
  const page = await context.newPage()

  // 设置 UA（降低被反爬检测概率）
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  try {
    const inst = opts.instructions ?? {}
    switch (opts.task_type) {
      case 'read_page':     return await readPage(page, opts.target_url, inst)
      case 'paginate':      return await paginate(page, opts.target_url, inst)
      case 'expand_tree':   return await expandTree(page, opts.target_url, inst)
      case 'extract_table': return await extractTable(page, opts.target_url, inst)
      default:              return await readPage(page, opts.target_url, inst)
    }
  } catch (e) {
    const msg = (e as Error).message
    return { success: false, content: '', title: '', source_url: opts.target_url, error: msg }
  } finally {
    await page.close().catch(() => {})
  }
}
