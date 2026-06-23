const api = require('../../utils/api.js')
const { getConnection } = require('../../utils/signalr.js')
const { generateRoomCode } = require('../../utils/game-logic.js')

Page({
  data: {
    roomCode: '',
    isHost: false,
    players: [],
    maxPlayers: 8,
    gameType: '',
    status: 'waiting', // waiting | ready | playing
    inputCode: '',
    connection: null
  },

  onLoad(options) {
    if (options.code) {
      this.setData({
        roomCode: options.code,
        isHost: options.isHost === 'true'
      })
      this.joinRoomSocket(options.code)
    } else if (options.action === 'join') {
      // 加入房间 - 弹出输入框
    }
  },

  onUnload() {
    if (this.data.connection) {
      this.data.connection.disconnect()
    }
  },

  /**
   * 输入房间号
   */
  onCodeInput(e) {
    this.setData({ inputCode: e.detail.value.toUpperCase() })
  },

  /**
   * 加入房间
   */
  joinByCode() {
    const code = this.data.inputCode.trim()
    if (code.length !== 6) {
      wx.showToast({ title: '请输入6位房间号', icon: 'none' })
      return
    }

    api.post('/room/join', { roomCode: code }).then(res => {
      this.setData({
        roomCode: code,
        players: res.players,
        status: res.status
      })
      this.joinRoomSocket(code)
    })
  },

  /**
   * 切换准备状态
   */
  toggleReady() {
    const connection = this.data.connection
    if (connection) {
      const ready = !this.data.players.find(p => p.isSelf)?.isReady
      connection.invoke('Ready', ready)
    }
  },

  /**
   * 开始游戏（房主）
   */
  startGame() {
    const connection = this.data.connection
    if (connection) {
      connection.invoke('StartGame', this.data.gameType)
    }
  },

  /**
   * 复制房间号
   */
  copyRoomCode() {
    wx.setClipboardData({
      data: this.data.roomCode,
      success: () => {
        wx.showToast({ title: '房间号已复制', icon: 'success' })
      }
    })
  },

  /**
   * 分享房间
   */
  onShareAppMessage() {
    return {
      title: `来聚会神器玩酒桌游戏！房间号：${this.data.roomCode}`,
      path: `/pages/room/room?code=${this.data.roomCode}`
    }
  },

  /**
   * 连接 SignalR
   */
  joinRoomSocket(code) {
    const connection = getConnection()
    this.setData({ connection })

    connection.on('PlayerJoined', (player) => {
      const players = [...this.data.players, player]
      this.setData({ players })
    })

    connection.on('PlayerLeft', (userId) => {
      const players = this.data.players.filter(p => p.userId !== userId)
      this.setData({ players })
    })

    connection.on('PlayerReady', (data) => {
      const players = this.data.players.map(p =>
        p.userId === data.userId ? { ...p, isReady: data.isReady } : p
      )
      this.setData({ players })
    })

    connection.on('GameStarted', (data) => {
      wx.navigateTo({ url: `${data.gamePath}?roomCode=${this.data.roomCode}` })
    })

    connection.connect('/hubs/game').then(() => {
      connection.invoke('JoinRoom', code)
    })
  }
})
