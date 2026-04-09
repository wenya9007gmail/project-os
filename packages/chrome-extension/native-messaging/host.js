#!/usr/bin/env node
/**
 * host.js — Chrome Native Messaging Host 进程
 *
 * Chrome 扩展通过 Native Messaging 协议调起此进程。
 * 本进程作为"stdio 桥"，将扩展发来的消息转发给 Local Agent HTTP API，
 * 再把结果写回 stdout 返给扩展。
 *
 * 安装方式（macOS）：
 *   cp native-messaging/com.projectos.host.json \
 *      ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
 *   chmod +x native-messaging/host.js
 *
 * 注意：path 字段必须是绝对路径，且文件必须可执行（chmod +x）。
 */

'use strict'

const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL || 'http://localhost:3001'

// ── 读写 Native Messaging 帧 ──────────────────────────────────────────

function readMessage() {
  return new Promise((resolve) => {
    let lengthBuf = Buffer.alloc(4)
    let lengthRead = 0

    function onData(chunk) {
      // 读 4 字节长度头
      while (lengthRead < 4 && chunk.length > 0) {
        chunk.copy(lengthBuf, lengthRead, 0, 1)
        chunk = chunk.slice(1)
        lengthRead++
      }
      if (lengthRead < 4) return

      const msgLen = lengthBuf.readUInt32LE(0)
      if (msgLen === 0 || msgLen > 1_048_576) {
        process.stdin.off('data', onData)
        return resolve(null)
      }

      const msgBuf = Buffer.alloc(msgLen)
      let msgRead = 0

      // 如果 chunk 里还有数据
      if (chunk.length > 0) {
        const toCopy = Math.min(chunk.length, msgLen)
        chunk.copy(msgBuf, 0, 0, toCopy)
        msgRead = toCopy
      }

      if (msgRead >= msgLen) {
        try { resolve(JSON.parse(msgBuf.toString('utf8'))) } catch { resolve(null) }
        return
      }

      function onBody(bodyChunk) {
        const toCopy = Math.min(bodyChunk.length, msgLen - msgRead)
        bodyChunk.copy(msgBuf, msgRead, 0, toCopy)
        msgRead += toCopy
        if (msgRead >= msgLen) {
          process.stdin.off('data', onBody)
          try { resolve(JSON.parse(msgBuf.toString('utf8'))) } catch { resolve(null) }
        }
      }
      process.stdin.on('data', onBody)
    }

    process.stdin.on('data', onData)
  })
}

function writeResponse(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(json.length, 0)
  process.stdout.write(len)
  process.stdout.write(json)
}

// ── 消息处理 ──────────────────────────────────────────────────────────

async function handleMessage(msg) {
  const { id, type, payload } = msg

  if (type === 'PING') {
    return { id, success: true, data: { status: 'ok' } }
  }

  if (type === 'STATUS') {
    try {
      const res = await fetch(`${LOCAL_AGENT_URL}/health`, {
        signal: AbortSignal.timeout(2000),
      })
      const data = await res.json()
      return { id, success: true, data }
    } catch (e) {
      return { id, success: false, error: e.message }
    }
  }

  if (type === 'CAPTURE') {
    try {
      const res = await fetch(`${LOCAL_AGENT_URL}/capture/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
        signal: AbortSignal.timeout(60_000),
      })
      const data = await res.json()
      return { id, success: res.ok, data }
    } catch (e) {
      return { id, success: false, error: e.message }
    }
  }

  if (type === 'EMBED') {
    try {
      const res = await fetch(`${LOCAL_AGENT_URL}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: payload?.text ?? '' }),
        signal: AbortSignal.timeout(20_000),
      })
      const data = await res.json()
      return { id, success: res.ok, data }
    } catch (e) {
      return { id, success: false, error: e.message }
    }
  }

  return { id, success: false, error: `未知消息类型: ${type}` }
}

// ── 主循环 ────────────────────────────────────────────────────────────

process.stdin.resume()

async function loop() {
  const msg = await readMessage()
  if (!msg) {
    process.exit(0)
  }

  try {
    const resp = await handleMessage(msg)
    writeResponse(resp)
  } catch (e) {
    writeResponse({ id: msg.id, success: false, error: e.message })
  }

  setImmediate(loop)
}

loop().catch(e => {
  process.stderr.write(`[native-host] Fatal: ${e.message}\n`)
  process.exit(1)
})
