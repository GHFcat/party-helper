const { drawKingNumbers } = require('../../../utils/game-logic.js')
const { getConnection } = require('../../../utils/signalr.js')

Page({
  data: {
    phase: 'draw', // draw | reveal | command
    playerCount: 4,
    cards: [],
    myCard: null,
    isKing: false,
    kingCommand: '',
    targetNumber: ''
  },

  onLoad(options) {
    if (options.roomCode) {
      this.setupSignalR(options.roomCode)
    }
  },

  /**
   * 开始抽牌
   */
  startDraw() {
    const { playerCount } = this.data
    const cards = drawKingNumbers(playerCount)
    // 在单机模式下，默认玩家是第一个
    const myCard = cards[0]
    this.setData({
      cards,
      myCard,
      isKing: myCard.isKing,
      phase: 'reveal'
    })
    wx.vibrateShort()
  },

  /**
   * 翻开所有人的牌
   */
  revealAll() {
    this.setData({ phase: 'command' })
  },

  /**
   * 国王指派任务
   */
  onCommandInput(e) {
    this.setData({ kingCommand: e.detail.value })
  },

  onTargetInput(e) {
    this.setData({ targetNumber: e.detail.value })
  },

  submitCommand() {
    const { kingCommand, targetNumber } = this.data
    if (!kingCommand || !targetNumber) {
      wx.showToast({ title: '请填写完整', icon: 'none' })
      return
    }

    wx.showToast({ title: '命令已下达！', icon: 'success' })

    // 重置
    setTimeout(() => {
      this.setData({
        phase: 'draw',
        cards: [],
        myCard: null,
        isKing: false,
        kingCommand: '',
        targetNumber: ''
      })
    }, 2000)
  },

  /**
   * 调整玩家数量
   */
  changePlayerCount(e) {
    const delta = e.currentTarget.dataset.delta
    const count = this.data.playerCount + delta
    if (count >= 3 && count <= 12) {
      this.setData({ playerCount: count })
    }
  },

  setupSignalR(roomCode) {
    const connection = getConnection()
    connection.on('KingCardsDrawn', (data) => {
      this.setData({
        cards: data.cards,
        myCard: data.myCard,
        isKing: data.myCard.isKing,
        phase: 'reveal'
      })
    })
    connection.on('KingCommand', (data) => {
      this.setData({ kingCommand: data.command, targetNumber: data.target, phase: 'command' })
    })
  }
})
