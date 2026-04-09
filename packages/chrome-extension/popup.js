const LOCAL_AGENT = 'http://localhost:3001'
const WEB_APP = 'http://localhost:3002'

let currentTab = null
let projects = []
let pendingTasks = []
let selectedTaskIndex = null
let activeMode = 'new'
let pinnedProjectId = null

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  currentTab = tab
  document.getElementById('page-title').textContent = tab.title || tab.url
  document.getElementById('page-url').textContent = tab.url

  const agentOk = await checkAgent()
  const dot = document.getElementById('dot')
  const label = document.getElementById('dot-label')
  if (agentOk) { dot.className = 'dot on'; label.textContent = '本地服务在线' }
  else { dot.className = 'dot off'; label.textContent = '本地服务离线' }

  const stored = await chrome.storage.local.get(['pinnedProjectId'])
  pinnedProjectId = stored.pinnedProjectId ?? null

  await Promise.all([loadProjects(), loadTasks()])

  // 🔑 Fix 1: 有固定项目时自动切换到「添加」tab
  if (pinnedProjectId) switchMode('add')
}

async function checkAgent() {
  try {
    const res = await fetch(`${LOCAL_AGENT}/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch { return false }
}

async function loadProjects() {
  try {
    const res = await fetch(`${WEB_APP}/api/projects`)
    const { data } = await res.json()
    projects = data ?? []
    const sel = document.getElementById('project-select')
    projects.forEach(p => {
      const opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = p.name
      sel.appendChild(opt)
    })

    if (pinnedProjectId) {
      const exists = projects.find(p => p.id === pinnedProjectId)
      if (exists) {
        sel.value = pinnedProjectId
        document.getElementById('btn-add').disabled = false
        renderPinnedBadge(exists.name)
      } else {
        pinnedProjectId = null
        chrome.storage.local.remove('pinnedProjectId')
      }
    }

    sel.addEventListener('change', () => {
      document.getElementById('btn-add').disabled = !sel.value
      if (!sel.value) {
        pinnedProjectId = null
        chrome.storage.local.remove('pinnedProjectId')
        hidePinnedBadge()
      }
    })
  } catch { projects = [] }
}

async function loadTasks() {
  try {
    const res = await fetch(`${WEB_APP}/api/capture?status=pending`)
    const { data } = await res.json()
    pendingTasks = data ?? []
  } catch { pendingTasks = [] }
  renderTasks()
  if (pendingTasks.length > 0) {
    chrome.action.setBadgeText({ text: String(pendingTasks.length) })
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' })
  }
}

function renderTasks() {
  const list = document.getElementById('task-list')
  if (!pendingTasks.length) {
    list.innerHTML = '<div class="empty">暂无待采集任务</div>'
    return
  }
  list.innerHTML = pendingTasks.map((t, i) => `
    <div class="task-item${selectedTaskIndex === i ? ' selected' : ''}" data-i="${i}">
      <div class="task-url">${t.target_url}</div>
      <div class="task-meta">${t.project_name ?? ''}</div>
    </div>
  `).join('')
  list.querySelectorAll('.task-item').forEach(el => {
    el.addEventListener('click', () => {
      selectedTaskIndex = parseInt(el.dataset.i)
      renderTasks()
      document.getElementById('btn-task').disabled = false
    })
  })
}

// ── Pinned badge ──────────────────────────────────────────────────
function renderPinnedBadge(name) {
  const badge = document.getElementById('pinned-badge')
  badge.textContent = `📌 已固定：${name}`
  badge.style.display = ''
  document.getElementById('btn-pin').textContent = '取消固定'
  document.getElementById('btn-pin').classList.add('pinned')
}

function hidePinnedBadge() {
  document.getElementById('pinned-badge').style.display = 'none'
  document.getElementById('btn-pin').textContent = '📌 固定'
  document.getElementById('btn-pin').classList.remove('pinned')
}

document.getElementById('btn-pin').addEventListener('click', () => {
  const sel = document.getElementById('project-select')
  if (pinnedProjectId) {
    pinnedProjectId = null
    chrome.storage.local.remove('pinnedProjectId')
    hidePinnedBadge()
  } else {
    const projectId = sel.value
    if (!projectId) return
    const project = projects.find(p => p.id === projectId)
    pinnedProjectId = projectId
    chrome.storage.local.set({ pinnedProjectId })
    renderPinnedBadge(project?.name ?? projectId)
  }
})

// ── 🔑 Fix 2: 智能内容提取 — 等待动态加载 + 更广泛的选择器 ───────
async function extractContent() {
  // 先让页面滚动一下，触发懒加载内容
  await chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    func: () => {
      window.scrollTo(0, 300)
      setTimeout(() => window.scrollTo(0, 0), 500)
    },
  })

  // 等待 800ms 让动态内容渲染
  await new Promise(r => setTimeout(r, 800))

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    func: () => {
      // 噪音标签移除（在 clone 上）
      const clone = document.body.cloneNode(true)
      const noiseSelectors = [
        'script','style','nav','footer','header',
        '.sidebar','.side-bar','[class*="sidebar"]',
        '.breadcrumb','[class*="breadcrumb"]',
        '.ad','[class*="ad-"]','[class*="banner"]',
        '.comment','[class*="comment"]',
        '.recommend','[class*="recommend"]',
        '.toolbar','[class*="toolbar"]',
        '.action','[class*="action-bar"]',
        '[class*="menu"]','[class*="nav-"]',
      ]
      noiseSelectors.forEach(sel => {
        try { clone.querySelectorAll(sel).forEach(el => el.remove()) } catch {}
      })

      // 内容选择器优先级：从最具体到最宽泛
      const contentSelectors = [
        // 生财有术 / 典型课程平台
        '[class*="chapter-content"]','[class*="lesson-content"]',
        '[class*="course-content"]','[class*="doc-content"]',
        '[class*="article-content"]','[class*="post-content"]',
        '[class*="content-body"]','[class*="content-main"]',
        '[class*="rich-text"]','[class*="richtext"]',
        '[class*="markdown"]','[class*="text-content"]',
        // 通用
        'article','.article','[itemprop="articleBody"]',
        'main','[role="main"]',
        '#content','#main','#article',
        '.content','.main',
      ]

      let mainEl = null
      for (const sel of contentSelectors) {
        const el = clone.querySelector(sel)
        if (el && (el.innerText?.trim()?.length ?? 0) > 100) {
          mainEl = el
          break
        }
      }

      // 最终兜底：取文字最长的 div/section
      if (!mainEl) {
        const candidates = [...clone.querySelectorAll('div, section, main')]
          .filter(el => {
            const txt = el.innerText?.trim() ?? ''
            // 直接子文字超过 200 字符，且不包含过多链接（避免导航栏）
            const links = el.querySelectorAll('a').length
            const words = txt.length
            return words > 200 && links < words / 20
          })
          .sort((a, b) => (b.innerText?.length ?? 0) - (a.innerText?.length ?? 0))
        mainEl = candidates[0] ?? clone
      }

      const text = mainEl.innerText?.trim()?.slice(0, 80000) ?? ''

      // 图片从 live DOM 采集
      const liveSelectors = [
        '[class*="chapter-content"]','[class*="lesson-content"]',
        '[class*="course-content"]','[class*="doc-content"]',
        '[class*="article-content"]','[class*="rich-text"]',
        'article','main','[role="main"]','#content',
      ]
      let liveMain = null
      for (const sel of liveSelectors) {
        const el = document.querySelector(sel)
        if (el && (el.innerText?.trim()?.length ?? 0) > 100) { liveMain = el; break }
      }
      liveMain = liveMain ?? document.body

      const imgs = [...liveMain.querySelectorAll('img')]
        .map(img => ({ src: img.currentSrc || img.src, alt: img.alt || '' }))
        .filter(({ src }) => src && src.startsWith('http') &&
          !src.match(/(icon|avatar|logo|emoji|badge|btn|button|arrow|dot|spinner|1x1|pixel)/i))
        .slice(0, 40)

      const imgSection = imgs.length
        ? '\n\n---\n[页面图片 ' + imgs.length + ' 张]\n' +
          imgs.map((img, i) => `![${img.alt || '图片' + (i + 1)}](${img.src})`).join('\n')
        : ''

      // 调试信息：返回提取长度
      return { text: text + imgSection, debug: `选择器匹配: ${mainEl.tagName}.${mainEl.className?.split?.(' ')?.[0] ?? ''}, 文字长度: ${text.length}` }
    },
  })

  const { text = '', debug = '' } = result?.result ?? {}
  console.log('[extract]', debug)
  return text
}

// ── Mode tabs ─────────────────────────────────────────────────────
function switchMode(mode) {
  activeMode = mode
  ;['new','add','tasks'].forEach(m => {
    document.getElementById(`tab-${m}`).classList.toggle('active', m === mode)
    document.getElementById(`panel-${m}`).style.display = m === mode ? '' : 'none'
  })
  document.getElementById('result').style.display = 'none'
}

document.getElementById('tab-new').addEventListener('click', () => switchMode('new'))
document.getElementById('tab-add').addEventListener('click', () => switchMode('add'))
document.getElementById('tab-tasks').addEventListener('click', () => switchMode('tasks'))

// ── 新建项目 ──────────────────────────────────────────────────────
document.getElementById('btn-new').addEventListener('click', async () => {
  const btn = document.getElementById('btn-new')
  btn.textContent = '⏳ 读取页面...'
  btn.disabled = true
  hideResult()

  try {
    const content = await extractContent()
    if (!content || content.length < 50) throw new Error('页面内容太短，请确认页面已完整加载后重试')

    btn.textContent = '⏳ AI 创建中...'
    const res = await fetch(`${LOCAL_AGENT}/capture/direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_url: currentTab.url, title: currentTab.title, content }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '创建失败')

    showResult('ok', `✅ 项目已创建！<a id="goto-project">点击查看 →</a>`)
    document.getElementById('goto-project')?.addEventListener('click', () => {
      chrome.tabs.create({ url: `${WEB_APP}/projects/${data.project_id}` })
    })
  } catch (e) {
    showResult('err', `❌ ${e.message}`)
  } finally {
    btn.textContent = '🚀 采集并创建项目'
    btn.disabled = false
  }
})

// ── 添加到项目 ────────────────────────────────────────────────────
document.getElementById('btn-add').addEventListener('click', async () => {
  const projectId = document.getElementById('project-select').value
  if (!projectId) return
  const btn = document.getElementById('btn-add')
  btn.textContent = '⏳ 读取页面...'
  btn.disabled = true
  hideResult()

  try {
    const content = await extractContent()
    if (!content || content.length < 50) throw new Error('页面内容太短，请确认页面已完整加载后重试')

    btn.textContent = '⏳ 保存中...'
    const res = await fetch(`${LOCAL_AGENT}/capture/direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, target_url: currentTab.url, title: currentTab.title, content }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '添加失败')

    showResult('ok', `✅ 已添加！<a id="goto-proj2">查看项目 →</a>`)
    document.getElementById('goto-proj2')?.addEventListener('click', () => {
      chrome.tabs.create({ url: `${WEB_APP}/projects/${projectId}` })
    })
  } catch (e) {
    showResult('err', `❌ ${e.message}`)
  } finally {
    btn.textContent = '📎 采集并添加到项目'
    btn.disabled = false
  }
})

// ── 任务队列 ──────────────────────────────────────────────────────
document.getElementById('btn-task').addEventListener('click', async () => {
  if (selectedTaskIndex === null) return
  const task = pendingTasks[selectedTaskIndex]
  const btn = document.getElementById('btn-task')
  btn.textContent = '⏳ 采集中...'
  btn.disabled = true

  try {
    if (currentTab.url !== task.target_url) {
      await chrome.tabs.update(currentTab.id, { url: task.target_url })
      await new Promise(r => setTimeout(r, 2500))
    }
    const result = await chrome.runtime.sendMessage({
      type: 'CAPTURE_PAGE',
      payload: { task_id: task.id, project_id: task.project_id },
    })
    if (result.success) {
      showResult('ok', `✅ 采集成功：${result.title}`)
      pendingTasks.splice(selectedTaskIndex, 1)
      selectedTaskIndex = null
      renderTasks()
    } else throw new Error(result.error)
  } catch (e) {
    showResult('err', `❌ ${e.message}`)
  } finally {
    btn.textContent = '采集选中任务页面'
    btn.disabled = selectedTaskIndex === null
  }
})

document.getElementById('btn-open').addEventListener('click', () => {
  chrome.tabs.create({ url: WEB_APP })
})

function showResult(type, html) {
  const el = document.getElementById('result')
  el.className = `result ${type}`
  el.innerHTML = html
  el.style.display = ''
}
function hideResult() {
  document.getElementById('result').style.display = 'none'
}

init()
