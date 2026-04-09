// Background service worker — Project OS Chrome Extension
const LOCAL_AGENT = 'http://localhost:3001'
const WEB_APP = 'http://localhost:3002'

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_PAGE') {
    captureCurrentTab(message.payload).then(sendResponse).catch(err => {
      sendResponse({ success: false, error: err.message })
    })
    return true // async response
  }

  if (message.type === 'GET_STATUS') {
    checkLocalAgent().then(ok => sendResponse({ agentRunning: ok }))
    return true
  }
})

async function captureCurrentTab(payload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) throw new Error('No active tab found')

  // Inject content capture script
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageContent,
  })

  const content = result?.result ?? ''
  const title = tab.title ?? tab.url

  // Send to local agent
  const res = await fetch(`${LOCAL_AGENT}/capture/direct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_id: payload.task_id,
      project_id: payload.project_id,
      target_url: tab.url,
      title,
      content,
    }),
  })

  if (!res.ok) throw new Error(`Local agent error: ${res.status}`)
  return { success: true, title, length: content.length }
}

function extractPageContent() {
  // Runs in page context — extract readable text
  const skip = ['script', 'style', 'nav', 'footer', 'header', '[class*="ad"]']
  skip.forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()))

  const main = document.querySelector('main, article, [role="main"], .content, #content')
  return (main ?? document.body).innerText?.trim()?.slice(0, 50000) ?? ''
}

async function checkLocalAgent() {
  try {
    const res = await fetch(`${LOCAL_AGENT}/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

// Listen for pending capture tasks on startup
chrome.runtime.onStartup.addListener(pollPendingTasks)
chrome.runtime.onInstalled.addListener(pollPendingTasks)

async function pollPendingTasks() {
  try {
    const res = await fetch(`${WEB_APP}/api/capture?status=pending`)
    if (!res.ok) return
    const { data } = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      chrome.action.setBadgeText({ text: String(data.length) })
      chrome.action.setBadgeBackgroundColor({ color: '#EF4444' })
    } else {
      chrome.action.setBadgeText({ text: '' })
    }
  } catch { /* ignore */ }
}

// Poll every 5 minutes
setInterval(pollPendingTasks, 5 * 60 * 1000)
