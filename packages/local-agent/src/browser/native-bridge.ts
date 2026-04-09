/**
 * native-bridge.ts — Chrome Extension Native Messaging 桥接器
 *
 * Chrome Extension 通过 Native Messaging 协议（stdin/stdout）向本地进程
 * 发送消息。本模块在 Local Agent 进程中监听这些消息，并将其转发给
 * capture / embed 等内部路由处理，再将结果写回 stdout。
 *
 * 消息格式（Chrome Native Messaging 标准）：
 *   [4字节小端 uint32 消息长度][UTF-8 JSON 字节]
 *
 * 使用方式：
 *   在 index.ts 中调用 startNativeBridge() 即可激活监听。
 *   仅当进程是由 Chrome Native Messaging Host 启动时才会真正收到消息。
 */

import { EventEmitter } from 'events'

// ── 消息类型 ──────────────────────────────────────────────────────────

export interface NativeMessage {
  id: string                   // 唯一请求 ID，响应时原样返回
  type: 'CAPTURE' | 'EMBED' | 'STATUS' | 'PING'
  payload?: Record<string, unknown>
}

export interface NativeResponse {
  id: string
  success: boolean
  data?: unknown
  error?: string
}

// ── 读写工具 ──────────────────────────────────────────────────────────

/**
 * 从 stdin 读取一条 Native Messaging 消息（4字节长度前缀 + JSON body）
 */
function readMessage(): Promise<NativeMessage | null> {
  return new Promise(resolve => {
    const lengthBuf = Buffer.alloc(4)
    let lengthBytesRead = 0

    function onData(chunk: Buffer) {
      // 先读满 4 字节长度头
      while (lengthBytesRead < 4 && chunk.length > 0) {
        chunk.copy(lengthBuf, lengthBytesRead, 0, 1)
        chunk = chunk.slice(1)
        lengthBytesRead++
      }
      if (lengthBytesRead < 4) return

      const msgLength = lengthBuf.readUInt32LE(0)
      if (msgLength === 0 || msgLength > 1_048_576) {
        // 非法长度，忽略
        process.stdin.off('data', onData)
        resolve(null)
        return
      }

      const msgBuf = Buffer.alloc(msgLength)
      let msgBytesRead = 0

      function onBody(bodyChunk: Buffer) {
        const toCopy = Math.min(bodyChunk.length, msgLength - msgBytesRead)
        bodyChunk.copy(msgBuf, msgBytesRead, 0, toCopy)
        msgBytesRead += toCopy

        if (msgBytesRead >= msgLength) {
          process.stdin.off('data', onBody)
          try {
            resolve(JSON.parse(msgBuf.toString('utf8')))
          } catch {
            resolve(null)
          }
        }
      }

      if (chunk.length > 0) {
        // chunk 里可能还有消息 body 数据
        const toCopy = Math.min(chunk.length, msgLength)
        chunk.copy(msgBuf, 0, 0, toCopy)
        msgBytesRead = toCopy
        if (msgBytesRead >= msgLength) {
          try {
            resolve(JSON.parse(msgBuf.toString('utf8')))
          } catch {
            resolve(null)
          }
          return
        }
      }
      process.stdin.on('data', onBody)
    }

    process.stdin.on('data', onData)
  })
}

/**
 * 向 stdout 写出一条 Native Messaging 响应
 */
function writeResponse(resp: NativeResponse): void {
  const json = Buffer.from(JSON.stringify(resp), 'utf8')
  const lengthBuf = Buffer.alloc(4)
  lengthBuf.writeUInt32LE(json.length, 0)
  process.stdout.write(lengthBuf)
  process.stdout.write(json)
}

// ── 事件总线（供外部订阅） ─────────────────────────────────────────────

export const bridgeEvents = new EventEmitter()

// ── 内部处理器 ─────────────────────────────────────────────────────────

const LOCAL_AGENT_URL = process.env.WEB_APP_URL
  ? `http://localhost:${process.env.LOCAL_AGENT_PORT ?? 3001}`
  : 'http://localhost:3001'

async function handleMessage(msg: NativeMessage): Promise<NativeResponse> {
  switch (msg.type) {
    case 'PING':
      return { id: msg.id, success: true, data: { status: 'ok', ts: Date.now() } }

    case 'STATUS': {
      return {
        id: msg.id,
        success: true,
        data: {
          agent_running: true,
          version: '1.0.0',
          port: process.env.LOCAL_AGENT_PORT ?? 3001,
        },
      }
    }

    case 'CAPTURE': {
      // 转发给 local-agent HTTP /capture/direct
      const payload = msg.payload ?? {}
      try {
        const res = await fetch(`${LOCAL_AGENT_URL}/capture/direct`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(60_000),
        })
        const data = await res.json()
        return { id: msg.id, success: res.ok, data }
      } catch (e) {
        return { id: msg.id, success: false, error: (e as Error).message }
      }
    }

    case 'EMBED': {
      const text = (msg.payload?.text as string | undefined) ?? ''
      try {
        const res = await fetch(`${LOCAL_AGENT_URL}/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(20_000),
        })
        const data = await res.json()
        return { id: msg.id, success: res.ok, data }
      } catch (e) {
        return { id: msg.id, success: false, error: (e as Error).message }
      }
    }

    default:
      return { id: msg.id, success: false, error: `Unknown message type: ${(msg as NativeMessage).type}` }
  }
}

// ── 主监听循环 ─────────────────────────────────────────────────────────

let bridgeStarted = false

export function startNativeBridge(): void {
  if (bridgeStarted) return
  bridgeStarted = true

  // 只在非 TTY stdin（即被 Chrome 调起时）才启动
  if (process.stdin.isTTY) {
    console.log('[native-bridge] stdin 是 TTY，跳过 Native Messaging 监听（开发模式）')
    return
  }

  console.log('[native-bridge] 启动 Native Messaging 监听...')
  process.stdin.resume()

  async function loop() {
    const msg = await readMessage()
    if (msg === null) {
      // stdin 关闭 = Chrome 已退出，结束进程
      process.exit(0)
    }

    handleMessage(msg)
      .then(resp => writeResponse(resp))
      .catch(e => writeResponse({ id: msg.id, success: false, error: (e as Error).message }))

    setImmediate(loop)
  }

  loop().catch(e => {
    console.error('[native-bridge] Fatal error:', e)
    process.exit(1)
  })
}
