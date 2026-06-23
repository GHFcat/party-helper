const { generateBombTimer } = require('../../../utils/game-logic.js')
const { getConnection } = require('../../../utils/signalr.js')

Page({
  data: {
    phase: 'setup', // setup | ticking | exploded | safe
    timer: 0,
    totalTime: 0,
    maxTime: 60,
    minTime: 10,
    holder: '你', // 当前持有人
    players: ['你'],
    playerIndex: 0,
    timerInterval: null,
    exploded: false
  },

  onLoad(options) {
    if (options.roomCode) {
      this.setupSignalR(options.roomCode)
    }
  },

  onUnload() {
    this.clearTimer()
  },

  /**
   * 设置时间范围
   */
  changeMaxTime(e) {
    const delta = e.currentTarget.dataset.delta
    const max = this.data.maxTime + delta
    if (max >= 30 && max <= 120) {
      this.setData({ maxTime: max })
    }
  },

  /**
   * 开始游戏
   */
  startBomb() {
    const totalTime = generateBombTimer(this.data.minTime, this.data.maxTime)
    this.setData({
      phase: 'ticking',
      timer: totalTime,
      totalTime,
      exploded: false
    })

    this.data.timerInterval = setInterval(() => {
      const timer = this.data.timer - 1
      if (timer <= 0) {
        this.explode()
      } else {
        this.setData({ timer })
      }
    }, 1000)
  },

  /**
   * 传递炸弹
   */
  passBomb() {
    if (this.data.phase !== 'ticking') return

    const nextIndex = (this.data.playerIndex + 1) % this.data.players.length
    this.setData({
      playerIndex: nextIndex,
      holder: this.data.players[nextIndex]
    })
    wx.vibrateShort()
  },

  /**
   * 爆炸
   */
  explode() {
    this.clearTimer()

    this.setData({
      phase: 'exploded',
      exploded: true
    })

    wx.vibrateLong()
    // 播放爆炸音效（需添加音效文件）
    // const audio = wx.createInnerAudioContext()
    // audio.src = '/assets/audios/explosion.mp3'
    // audio.play()
  },

  /**
   * 下一轮
   */
  nextRound() {
    this.setData({
      phase: 'setup',
      timer: 0,
      holder: '你',
      playerIndex: 0,
      exploded: false
    })
  },

  clearTimer() {
    if (this.data.timerInterval) {
      clearInterval(this.data.timerInterval)
      this.data.timerInterval = null
    }
  },

  setupSignalR(roomCode) {
    const connection = getConnection()
    connection.on('BombPassed', (data) => {
      this.setData({ holder: data.holderName, playerIndex: data.playerIndex })
    })
    connection.on('BombExploded', (data) => {
      this.explode()
    })
  }
})
