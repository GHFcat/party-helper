const { generateBombTimer } = require('../../../utils/game-logic.js')
const { getConnection } = require('../../../utils/signalr.js')

const HINTS = ['燃烧中…', '嘶嘶…', '快炸了！', '滴答滴答…', '危危危险！']
const HINT_INTERVAL = 2500

Page({
  data: {
    gameId: 0,
    gameName: '',
    // 阶段：modeSelect | setup | ticking | exploded
    phase: 'modeSelect',
    // 模式：'' | 'single' | 'multi'
    mode: '',
    roomId: 0,

    // 单机倒计时（仅内部使用，不显示数字）
    timer: 0,
    totalTime: 0,
    maxTime: 20,
    minTime: 10,
    timerInterval: null,
    exploded: false,

    // 单机提示语轮换
    hints: HINTS,
    hintIndex: 0,
    currentHint: HINTS[0],
    hintInterval: null,

    // 联机模式
    holderInfo: null, // { userId, nickName, avatar, isSelf }
    loserInfo: null   // 同 holderInfo
  },

  onLoad(options) {
    const name = options.name ? decodeURIComponent(options.name) : ''
    const patch = { gameId: options.gameId || 0 }
    if (name) {
      patch.gameName = name
      wx.setNavigationBarTitle({ title: name })
    }

    // 联机入口：通过 roomId 进入，直接进入 ticking，跳过模式选择
    if (options.roomId) {
      patch.mode = 'multi'
      patch.phase = 'ticking'
      patch.roomId = Number(options.roomId)
    }
    this.setData(patch)

    if (options.roomId) {
      // 初始持有人由大厅 GameStarted 事件透传过来（URL 参数）
      if (options.holderUserId) {
        this.setData({
          holderInfo: this._markSelf({
            userId: Number(options.holderUserId),
            userName: options.holderUserName ? decodeURIComponent(options.holderUserName) : ''
          })
        })
      }
      this.setupMultiplayer()
    }
  },

  onUnload() {
    this.clearTimer()
    this.clearHintInterval()
    this.teardownMultiplayer()
  },

  /**
   * 选择模式
   */
  selectMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === 'single') {
      this.setData({ mode: 'single', phase: 'setup' })
    } else if (mode === 'multi') {
      const url = `/pages/room/room?action=create&gameType=bomb&gameId=${this.data.gameId}&name=${encodeURIComponent(this.data.gameName)}`
      wx.navigateTo({ url })
    }
  },

  /**
   * 设置时间范围（单机）
   */
  changeMaxTime(e) {
    if (this.data.mode !== 'single') return
    const delta = e.currentTarget.dataset.delta
    const max = this.data.maxTime + delta
    if (max >= 20 && max <= 120) {
      this.setData({ maxTime: max })
    }
  },

  /**
   * 开始游戏（单机）
   */
  startBomb() {
    const totalTime = generateBombTimer(this.data.minTime, this.data.maxTime)
    this.setData({
      phase: 'ticking',
      timer: totalTime,
      totalTime,
      exploded: false,
      hintIndex: 0,
      currentHint: this.data.hints[0]
    })

    this.data.timerInterval = setInterval(() => {
      const timer = this.data.timer - 1
      if (timer <= 0) {
        this.explode()
      } else {
        this.setData({ timer })
      }
    }, 1000)

    // 提示语轮换
    this.data.hintInterval = setInterval(() => {
      const next = (this.data.hintIndex + 1) % this.data.hints.length
      this.setData({ hintIndex: next, currentHint: this.data.hints[next] })
    }, HINT_INTERVAL)
  },

  /**
   * 传递炸弹（联机：通知服务端在 RoomHub 上选定下一位持有人）
   */
  passBomb() {
    if (this.data.mode !== 'multi' || this.data.phase !== 'ticking') return
    if (!this.data.holderInfo || !this.data.holderInfo.isSelf) return
    const connection = getConnection()
    connection.invoke('PassBomb', this.data.roomId).catch(() => {})
  },

  /**
   * 爆炸
   */
  explode() {
    this.clearTimer()
    this.clearHintInterval()
    this.setData({ phase: 'exploded', exploded: true })
    wx.vibrateLong()
    // 播放爆炸音效（需添加音效文件）
    // const audio = wx.createInnerAudioContext()
    // audio.src = '/assets/audios/explosion.mp3'
    // audio.play()
  },

  /**
   * 单机下一轮
   */
  nextRound() {
    this.setData({
      phase: 'setup',
      timer: 0,
      exploded: false,
      hintIndex: 0,
      currentHint: this.data.hints[0]
    })
  },

  /**
   * 联机：回到房间大厅
   */
  backToRoom() {
    wx.navigateBack({ delta: 1 })
  },

  /**
   * 联机：退出到模式选择
   */
  exitToModeSelect() {
    wx.navigateBack({ delta: 2 })
  },

  clearTimer() {
    if (this.data.timerInterval) {
      clearInterval(this.data.timerInterval)
      this.data.timerInterval = null
    }
  },

  clearHintInterval() {
    if (this.data.hintInterval) {
      clearInterval(this.data.hintInterval)
      this.data.hintInterval = null
    }
  },

  /**
   * 联机模式：注册 SignalR 事件（连接由大厅建立，这里只挂事件）
   * 服务端只推 {userId, userName}，isSelf 由客户端比对 app.globalData.userInfo.id
   */
  setupMultiplayer() {
    const connection = getConnection()

    this._bombPassedHandler = (data) => {
      this.setData({ holderInfo: this._markSelf((data && data.holder) || null) })
    }
    this._bombExplodedHandler = (data) => {
      this.setData({ loserInfo: this._markSelf((data && data.loser) || null) })
      this.explode()
    }

    connection.on('BombPassed', this._bombPassedHandler)
    connection.on('BombExploded', this._bombExplodedHandler)
  },

  /**
   * 给服务端推来的 {userId, userName} 对象补上 isSelf 标记和 avatar 占位
   */
  _markSelf(obj) {
    if (!obj) return null
    const selfId = getApp().globalData.userInfo && getApp().globalData.userInfo.id
    return {
      userId: obj.userId,
      userName: obj.userName || '',
      avatar: obj.avatar || '',
      isSelf: selfId != null && obj.userId === selfId
    }
  },

  teardownMultiplayer() {
    if (this.data.mode !== 'multi') return
    const connection = getConnection()
    if (this._bombPassedHandler) {
      connection.off('BombPassed', this._bombPassedHandler)
      this._bombPassedHandler = null
    }
    if (this._bombExplodedHandler) {
      connection.off('BombExploded', this._bombExplodedHandler)
      this._bombExplodedHandler = null
    }
  }
})
