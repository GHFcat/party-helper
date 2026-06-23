const app = getApp()

/**
 * SignalR WebSocket 连接管理
 * 使用微信小程序 wx.connectSocket 实现简易版
 * 后续可替换为 @microsoft/signalr 小程序适配版
 */
class SignalRClient {
  constructor() {
    this.socket = null
    this.handlers = {}
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 2000
  }

  /**
   * 连接 Hub
   */
  connect(hubPath) {
    return new Promise((resolve, reject) => {
      const url = `${app.globalData.wsUrl}${hubPath}?token=${app.globalData.token}`

      this.socket = wx.connectSocket({
        url: url,
        success: () => {
          this.reconnectAttempts = 0
        },
        fail: reject
      })

      this.socket.onOpen(() => {
        console.log('SignalR connected:', hubPath)
        resolve()
      })

      this.socket.onMessage((data) => {
        this._handleMessage(data)
      })

      this.socket.onClose((res) => {
        console.log('SignalR closed:', res)
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this._reconnect(hubPath)
        }
      })

      this.socket.onError((err) => {
        console.error('SignalR error:', err)
      })
    })
  }

  /**
   * 发送消息
   */
  invoke(method, ...args) {
    if (!this.socket) return

    const message = JSON.stringify({
      method,
      args
    })

    this.socket.send({
      data: message
    })
  }

  /**
   * 注册事件处理
   */
  on(method, handler) {
    if (!this.handlers[method]) {
      this.handlers[method] = []
    }
    this.handlers[method].push(handler)
  }

  /**
   * 移除事件处理
   */
  off(method, handler) {
    if (this.handlers[method]) {
      this.handlers[method] = this.handlers[method].filter(h => h !== handler)
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.handlers = {}
  }

  _handleMessage(data) {
    try {
      const msg = JSON.parse(data)
      if (msg.method && this.handlers[msg.method]) {
        this.handlers[msg.method].forEach(handler => handler(...(msg.args || [])))
      }
    } catch (e) {
      console.error('Parse message error:', e)
    }
  }

  _reconnect(hubPath) {
    this.reconnectAttempts++
    const delay = this.reconnectDelay * this.reconnectAttempts

    setTimeout(() => {
      console.log(`Reconnecting... attempt ${this.reconnectAttempts}`)
      this.connect(hubPath)
    }, delay)
  }
}

// 单例
let instance = null

const getConnection = () => {
  if (!instance) {
    instance = new SignalRClient()
  }
  return instance
}

module.exports = { SignalRClient, getConnection }
