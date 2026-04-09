/**
 * cdp-client.ts — CDP（Chrome DevTools Protocol）连接管理
 *
 * 负责：
 *  1. 探测本地 Chrome 是否开启了 --remote-debugging-port=9222
 *  2. 返回 WebSocket 调试端点，供 Playwright connectOverCDP 使用
 *  3. 列出当前所有已打开的 Tab（用于 Native Bridge 场景）
 */

import { chromium, Browser } from 'playwright'

const DEFAULT_CDP_URL = process.env.CHROME_CDP_URL ?? 'http://localhost:9222'

export interface CdpTabInfo {
  id: string
  title: string
  url: string
  type: string
  webSocketDebuggerUrl: string
}

/** 获取 Chrome CDP WebSocket 端点 */
export async function getCdpWsEndpoint(cdpUrl = DEFAULT_CDP_URL): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(`${cdpUrl}/json/version`, { signal: controller.signal })
    if (!res.ok) throw new Error(`CDP /json/version 返回 ${res.status}`)
    const data = (await res.json()) as { webSocketDebuggerUrl?: string }
    if (!data.webSocketDebuggerUrl) throw new Error('webSocketDebuggerUrl 为空')
    return data.webSocketDebuggerUrl
  } finally {
    clearTimeout(timer)
  }
}

/** 列出当前所有 Tab */
export async function listCdpTabs(cdpUrl = DEFAULT_CDP_URL): Promise<CdpTabInfo[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(`${cdpUrl}/json`, { signal: controller.signal })
    if (!res.ok) throw new Error(`CDP /json 返回 ${res.status}`)
    const tabs = (await res.json()) as CdpTabInfo[]
    return tabs.filter(t => t.type === 'page')
  } finally {
    clearTimeout(timer)
  }
}

/** 检查 CDP 是否可用 */
export async function isCdpAvailable(cdpUrl = DEFAULT_CDP_URL): Promise<boolean> {
  try {
    await getCdpWsEndpoint(cdpUrl)
    return true
  } catch {
    return false
  }
}

/**
 * 连接到用户已有 Chrome（保留登录态）。
 * 若 CDP 不可用，降级为启动新 headless 浏览器（无登录态，输出警告）。
 */
export async function connectBrowser(cdpUrl = DEFAULT_CDP_URL): Promise<{
  browser: Browser
  isUserChrome: boolean
}> {
  const available = await isCdpAvailable(cdpUrl)
  if (available) {
    try {
      const wsEndpoint = await getCdpWsEndpoint(cdpUrl)
      const browser = await chromium.connectOverCDP(wsEndpoint)
      return { browser, isUserChrome: true }
    } catch (e) {
      console.warn('[cdp-client] connectOverCDP 失败，降级为 headless：', (e as Error).message)
    }
  } else {
    console.warn(
      '[cdp-client] Chrome CDP 不可用。请用以下命令启动 Chrome：\n' +
      '  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222'
    )
  }

  // 降级：无头新浏览器
  const browser = await chromium.launch({ headless: true })
  return { browser, isUserChrome: false }
}
