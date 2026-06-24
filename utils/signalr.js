const app = getApp()

// 标准 SignalR JSON Hub 协议常量
const RECORD_SEPARATOR = '\x1e'

const TYPE_INVOCATION = 1      // 调用（双向）
const TYPE_COMPLETION = 3      // 调用返回
const TYPE_PING = 6            // 心跳
const TYPE_CLOSE = 7           // 服务端关闭

let _invocationSeq = 0
const nextInvocationId = () => `${++_invocationSeq}`

/**
 * 标准 SignalR JSON Hub 客户端（基于 wx.connectSocket）
 * - 握手：open 后发送 {"protocol":"json","version":1}\x1e
 * - 帧：每条消息以 \x1e 结尾，缓冲后按 \x1e 切分
 * - invoke 返回 Promise：客户端带 invocationId 调用，服务端以 type=3 回包
 * - 鉴权：URL 携带 ?access_token=JWT（SignalR WebSocket 默认）
 */
class SignalRClient {
  constructor() {
    this.socket = null
    this.handlers = {}            // target -> [handler]
    this.pending = {}             // invocationId -> { resolve, reject }
    this.connectPromise = null
    this.handshakeComplete = false
    this.frameBuffer = ''
    this.hubPath = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 2000
    this.manuallyClosed = false
  }

  /**
   * 连接 Hub
   */
  connect(hubPath) {
    this.hubPath = hubPath
    this.manuallyClosed = false

    // 已握手完成：直接 resolve
    if (this.socket && this.handshakeComplete) {
      return Promise.resolve()
    }
    // 已有进行中的连接请求：复用
    if (this.connectPromise) {
      return this.connectPromise.promise
    }

    const promise = new Promise((resolve, reject) => {
      this.connectPromise = { resolve, reject }

      // wsUrl 在 app.js 里是 http(s)://...，WebSocket 需要 ws(s)://...
      const wsBase = (app.globalData.wsUrl || '').replace(/^http/i, 'ws')
      const token = encodeURIComponent(app.globalData.token || '')
      const url = `${wsBase}${hubPath}?access_token=${token}`

      this.socket = wx.connectSocket({
        url,
        success: () => {
          this.reconnectAttempts = 0
        },
        fail: (err) => {
          this._resolveConnect(false, err)
        }
      })

      this.socket.onOpen(() => {
        // 发送握手包
        const handshake = JSON.stringify({ protocol: 'json', version: 1 }) + RECORD_SEPARATOR
        this.socket.send({
          data: handshake,
          fail: (err) => this._resolveConnect(false, err)
        })
      })

      this.socket.onMessage((res) => this._onRaw(res.data))
      this.socket.onClose((res) => this._onClose(res))
      this.socket.onError((err) => {
        console.error('SignalR socket error:', err)
        this._resolveConnect(false, err)
      })
    })

    this.connectPromise.promise = promise
    return promise
  }

  /**
   * 调用服务端方法（带返回值）
   */
  invoke(method, ...args) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.handshakeComplete) {
        reject(new Error('SignalR 未连接'))
        return
      }
      const id = nextInvocationId()
      this.pending[id] = { resolve, reject }
      const msg = JSON.stringify({
        type: TYPE_INVOCATION,
        invocationId: id,
        target: method,
        arguments: args
      }) + RECORD_SEPARATOR
      this.socket.send({
        data: msg,
        fail: (err) => {
          delete this.pending[id]
          reject(err)
        }
      })
    })
  }

  /**
   * 调用服务端方法（无返回值，fire-and-forget）
   */
  send(method, ...args) {
    if (!this.socket || !this.handshakeComplete) return Promise.resolve()
    const msg = JSON.stringify({
      type: TYPE_INVOCATION,
      target: method,
      arguments: args
    }) + RECORD_SEPARATOR
    return new Promise((resolve, reject) => {
      this.socket.send({ data: msg, success: resolve, fail: reject })
    })
  }

  /**
   * 注册服务端 → 客户端调用
   */
  on(target, handler) {
    if (!this.handlers[target]) this.handlers[target] = []
    this.handlers[target].push(handler)
  }

  /**
   * 注销 handler（不传 handler 则清空该 target 全部）
   */
  off(target, handler) {
    const list = this.handlers[target]
    if (!list) return
    if (handler) {
      this.handlers[target] = list.filter(h => h !== handler)
    } else {
      delete this.handlers[target]
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.manuallyClosed = true
    if (this.socket) {
      try { this.socket.close() } catch (e) {}
      this.socket = null
    }
    this.handshakeComplete = false
    this.frameBuffer = ''
    this._failAllPending(new Error('连接已断开'))
  }

  _resolveConnect(ok, payload) {
    if (!this.connectPromise) return
    const { resolve, reject } = this.connectPromise
    this.connectPromise = null
    if (ok) resolve()
    else reject(payload || new Error('连接失败'))
  }

  _failAllPending(err) {
    Object.keys(this.pending).forEach(id => {
      this.pending[id].reject(err)
      delete this.pending[id]
    })
  }

  _onRaw(data) {
    if (data == null) return
    if (typeof data !== 'string') {
      // ArrayBuffer → string（按字节处理，兼容 UTF-8 多字节需进一步处理；SignalR 默认 UTF-8）
      try {
        const bytes = new Uint8Array(data)
        let s = ''
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
        data = decodeURIComponent(escape(s))
      } catch (e) {
        console.warn('decode frame failed', e)
        return
      }
    }
    this.frameBuffer += data
    let idx
    while ((idx = this.frameBuffer.indexOf(RECORD_SEPARATOR)) !== -1) {
      const raw = this.frameBuffer.slice(0, idx)
      this.frameBuffer = this.frameBuffer.slice(idx + 1)
      if (!raw) continue
      try {
        this._handleMessage(JSON.parse(raw))
      } catch (e) {
        console.warn('parse frame failed:', raw, e)
      }
    }
  }

  _handleMessage(msg) {
    // 握手响应：没有 type 字段（可能为 {} 或 {error})
    if (msg.type === undefined) {
      if (msg && msg.error) {
        this.handshakeComplete = false
        this._resolveConnect(false, new Error(msg.error))
      } else {
        this.handshakeComplete = true
        this._resolveConnect(true)
      }
      return
    }

    switch (msg.type) {
      case TYPE_INVOCATION: {
        const list = this.handlers[msg.target]
        if (list) {
          list.forEach(h => {
            try { h(...(msg.arguments || [])) } catch (e) { console.error(e) }
          })
        }
        break
      }
      case TYPE_COMPLETION: {
        const p = this.pending[msg.invocationId]
        if (!p) return
        delete this.pending[msg.invocationId]
        if (msg.error) p.reject(new Error(msg.error))
        else p.resolve(msg.result)
        break
      }
      case TYPE_PING: {
        // 回复 ping
        if (this.socket && this.handshakeComplete) {
          this.socket.send({ data: JSON.stringify({ type: TYPE_PING }) + RECORD_SEPARATOR })
        }
        break
      }
      case TYPE_CLOSE: {
        console.log('SignalR server closed:', msg.error)
        break
      }
    }
  }

  _onClose(res) {
    console.log('SignalR closed:', res)
    const wasConnected = this.handshakeComplete
    this.handshakeComplete = false
    this.socket = null
    this.frameBuffer = ''
    this._failAllPending(new Error('连接已关闭'))
    this._resolveConnect(false, new Error('连接已关闭'))

    if (!this.manuallyClosed && (wasConnected || this.reconnectAttempts < this.maxReconnectAttempts)) {
      this._reconnect()
    }
  }

  _reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return
    this.reconnectAttempts++
    const delay = this.reconnectDelay * this.reconnectAttempts
    setTimeout(() => {
      console.log(`SignalR reconnecting... attempt ${this.reconnectAttempts}`)
      this.connect(this.hubPath).catch(() => {})
    }, delay)
  }
}

// 单例
let instance = null
const getConnection = () => {
  if (!instance) instance = new SignalRClient()
  return instance
}

module.exports = { SignalRClient, getConnection }
