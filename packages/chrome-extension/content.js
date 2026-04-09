// Content script — minimal, just listens for extraction requests
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    try {
      const skip = ['script', 'style', 'nav', 'footer', 'header']
      skip.forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()))
      const main = document.querySelector('main, article, [role="main"], .content, #content, #main')
      const text = (main ?? document.body).innerText?.trim()?.slice(0, 50000) ?? ''
      sendResponse({ success: true, content: text, title: document.title, url: location.href })
    } catch (e) {
      sendResponse({ success: false, error: e.message })
    }
    return true
  }
})
