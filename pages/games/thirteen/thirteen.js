const { getConnection } = require('../../../utils/signalr.js')

const SUIT_SYMBOLS = { spade: '♠', heart: '♥', diamond: '♦', club: '♣' }
const TOTAL_CARDS = 54
const DEFAULT_HUB = '/hubs/room'
const MIN_PLAYERS = 1

/**
 * 座位位置（按从自己开始的顺时针顺序，最多 8 人）
 * index 0 = 自己（单独用 .seat-self 样式，这里留空）
 */
const POSITION_SLOTS = [
  '',
  'top:50%;left:16rpx;transform:translateY(-50%);',
  'top:16rpx;left:96rpx;',
  'top:6rpx;left:50%;transform:translateX(-50%);',
  'top:16rpx;right:96rpx;',
  'top:50%;right:16rpx;transform:translateY(-50%);',
  'bottom:140rpx;right:16rpx;',
  'bottom:140rpx;left:16rpx;'
]
const LAST_SLOT = POSITION_SLOTS[POSITION_SLOTS.length - 1]

Page({
  data: {
    gameId: 0,
    gameName: '',
    // connecting（建/进房中） | table（牌桌：等待玩家 / 对局进行中）
    phase: 'connecting',
    gameStarted: false,
    roomId: 0,
    ownerUserId: 0,
    isHost: false,
    selfUserId: null,
    connection: null,
    minPlayers: MIN_PLAYERS,
    // 牌桌
    players: [],
    otherPlayers: [],
    selfPlayer: null,
    remaining: TOTAL_CARDS,
    totalCards: TOTAL_CARDS,
    nextUserId: null
  },

  onLoad(options) {
    const name = options.name ? decodeURIComponent(options.name) : ''
    const patch = { gameId: options.gameId || 0 }
    if (name) {
      patch.gameName = name
      wx.setNavigationBarTitle({ title: name })
    }
    const app = getApp()
    patch.selfUserId = (app.globalData.userInfo && app.globalData.userInfo.id) || null
    this.setData(patch)

    this._setupHubListeners()

    // 有 roomId = 通过分享进入 → 加入；否则 → 自动建房
    if (options.roomId) {
      this.joinRoom(Number(options.roomId))
    } else {
      this.createRoom()
    }
  },

  onUnload() {
    this._teardownHubListeners()
    const conn = this.data.connection
    if (conn) {
      // 主动离开房间
      conn.invoke('LeaveRoom').catch(() => {})
    }
  },

  // ============ Hub 连接 ============

  _setupHubListeners() {
    const conn = getConnection()
    this.setData({ connection: conn })

    this._userJoinedHandler = (d) => this._onUserJoined(d)
    this._userLeftHandler = (d) => this._onUserLeft(d)
    this._gameStartedHandler = () => this._onGameStarted()
    this._cardDealtHandler = (d) => this._onCardDealt(d)
    this._gameRestartedHandler = (d) => this._onGameRestarted(d)

    conn.on('UserJoined', this._userJoinedHandler)
    conn.on('UserLeft', this._userLeftHandler)
    conn.on('GameStarted', this._gameStartedHandler)
    conn.on('CardDealt', this._cardDealtHandler)
    conn.on('GameRestarted', this._gameRestartedHandler)
  },

  _teardownHubListeners() {
    const conn = this.data.connection
    if (!conn) return
    if (this._userJoinedHandler) conn.off('UserJoined', this._userJoinedHandler)
    if (this._userLeftHandler) conn.off('UserLeft', this._userLeftHandler)
    if (this._gameStartedHandler) conn.off('GameStarted', this._gameStartedHandler)
    if (this._cardDealtHandler) conn.off('CardDealt', this._cardDealtHandler)
    if (this._gameRestartedHandler) conn.off('GameRestarted', this._gameRestartedHandler)
  },

  /**
   * 房主：自动创建房间
   */
  createRoom() {
    const conn = this.data.connection
    const roomName = this.data.gameName || '扑克发牌'
    conn.connect(DEFAULT_HUB).then(() => {
      return conn.invoke('CreateRoom', roomName)
    }).then(res => {
      if (!res || res.code !== 0 || !res.data) {
        wx.showToast({ title: (res && res.message) || '创建房间失败', icon: 'none' })
        return
      }
      this._applyRoom(res.data)
    }).catch(err => {
      console.error('CreateRoom failed', err)
      wx.showToast({ title: '创建房间失败', icon: 'none' })
    })
  },

  /**
   * 通过分享进入：加入指定房间
   */
  joinRoom(roomId) {
    if (!roomId || roomId <= 0) {
      wx.showToast({ title: '房间号无效', icon: 'none' })
      return
    }
    const conn = this.data.connection
    conn.connect(DEFAULT_HUB).then(() => {
      return conn.invoke('JoinRoom', roomId)
    }).then(res => {
      if (!res || res.code !== 0 || !res.data) {
        wx.showToast({ title: (res && res.message) || '加入房间失败', icon: 'none' })
        return
      }
      this._applyRoom(res.data)
    }).catch(err => {
      console.error('JoinRoom failed', err)
      wx.showToast({ title: '加入房间失败', icon: 'none' })
    })
  },

  _applyRoom(room) {
    const selfUserId = this.data.selfUserId
    this.setData({
      roomId: room.roomId || 0,
      ownerUserId: room.ownerUserId || 0,
      isHost: selfUserId != null && room.ownerUserId == selfUserId,
      phase: 'table'
    })
    this._loadTablePlayers()
  },

  _onUserJoined() {
    // 直接在牌桌上重排座位（保留已发的手牌）
    this._loadTablePlayers()
  },

  _onUserLeft() {
    this._loadTablePlayers()
  },

  // ============ 大厅操作 ============

  startGame() {
    if (!this.data.isHost) return
    if (this.data.players.length < this.data.minPlayers) {
      wx.showToast({ title: `至少需要${this.data.minPlayers}人`, icon: 'none' })
      return
    }
    const conn = this.data.connection
    conn.invoke('StartGame', this.data.roomId).then(res => {
      // res 是服务端 StartGame 方法的返回值
      // 若返回 ApiResult：res = { code, message, data }
      // 若签名是 Task（无返回）：res 为 undefined，靠 GameStarted 广播推进
      if (res && res.code != null && res.code !== 0) {
        wx.showToast({ title: res.message || '开始失败', icon: 'none' })
      }
      // 成功时无需在此处理——_onGameStarted 会接收 GameStarted 广播并切到 dealing
    }).catch(err => {
      console.error('StartGame failed', err)
      wx.showToast({ title: '开始失败', icon: 'none' })
    })
  },

  copyRoomId() {
    wx.setClipboardData({
      data: String(this.data.roomId),
      success: () => wx.showToast({ title: '房间号已复制', icon: 'success' })
    })
  },

  exitRoom() {
    wx.showModal({
      title: '退出房间',
      content: '确定要离开当前房间吗？',
      success: (r) => {
        if (r.confirm) wx.navigateBack({ delta: 1 })
      }
    })
  },

  onShareAppMessage() {
    return {
      title: `来玩${this.data.gameName || '扑克发牌'}！点击直接加入牌局`,
      path: `/pages/games/thirteen/thirteen?roomId=${this.data.roomId}&gameId=${this.data.gameId}&name=${encodeURIComponent(this.data.gameName || '扑克发牌')}`
    }
  },

  // ============ 对局开始 ============

  _onGameStarted() {
    // 不切换页面，只标记对局已开始；座位已经在等待阶段排好
    this.setData({ gameStarted: true })
  },

  /**
   * 从 RoomHub 拉取房间玩家，排座位
   * - 按 userId 升序得到全员一致的「发牌顺序」
   * - 以自己为起点 (seatIndex 0) 计算每个玩家在桌面上的座位
   * - 重新拉取时按 userId 合并已发的手牌，避免中途加入者清空已有牌
   */
  _loadTablePlayers() {
    const conn = this.data.connection
    if (!conn) return
    conn.invoke('GetRoomUsers').then(res => {
      if (!res || res.code !== 0) return
      const users = (res.data || []).slice().sort((a, b) => a.userId - b.userId)
      const N = users.length
      const selfId = this.data.selfUserId
      let selfCanonicalIdx = users.findIndex(u => u.userId == selfId)
      if (selfCanonicalIdx < 0) selfCanonicalIdx = 0

      const prevMap = {}
      this.data.players.forEach(p => { prevMap[p.userId] = p })

      const players = users.map((u, i) => {
        const seatIndex = (i - selfCanonicalIdx + N) % N
        const prev = prevMap[u.userId]
        const hand = (prev && prev.hand) || []
        return {
          userId: u.userId,
          userName: u.userName || '匿名',
          isOwner: !!u.isOwner,
          isSelf: u.userId == selfId,
          seatIndex,
          positionStyle: seatIndex === 0 ? '' : (POSITION_SLOTS[seatIndex] || LAST_SLOT),
          hand,
          cardCount: hand.length,
          displayCount: Math.min(hand.length, 5)
        }
      })

      const selfPlayer = players.find(p => p.isSelf) || null
      this.setData({
        players,
        otherPlayers: players.filter(p => !p.isSelf),
        selfPlayer,
        isHost: !!(selfPlayer && selfPlayer.isOwner)
      })
    }).catch(err => {
      console.error('GetRoomUsers failed', err)
    })
  },

  // ============ 发牌 ============

  /**
   * 房主：发一张牌（服务端在 RoomHub 上处理）
   */
  dealCard() {
    if (!this.data.isHost) return
    if (this.data.remaining <= 0) return
    const conn = getConnection()
    conn.invoke('DealCard', this.data.roomId).catch(err => {
      console.error('DealCard failed', err)
      wx.showToast({ title: '发牌失败', icon: 'none' })
    })
  },

  /**
   * 房主：再开一局（重置牌堆、清空手牌）
   */
  restartGame() {
    if (!this.data.isHost) return
    const conn = getConnection()
    conn.invoke('RestartGame', this.data.roomId).catch(err => {
      console.error('RestartGame failed', err)
      wx.showToast({ title: '重开失败', icon: 'none' })
    })
  },

  /**
   * 服务端推送：一张牌发出了
   * 载荷 { player:{userId,userName}, card:{suit,rank,isRed,id}, remaining, nextUserId }
   */
  _onCardDealt(data) {
    if (!data || !data.player) return
    const card = this._formatCard(data.card)
    const targetUserId = data.player.userId
    let remaining = this.data.remaining
    if (data.remaining != null) remaining = data.remaining
    else remaining = Math.max(remaining - 1, 0)

    const players = this.data.players.map(p => {
      if (p.userId !== targetUserId) return p
      const hand = card ? [...p.hand, card] : p.hand
      return {
        ...p,
        hand,
        cardCount: hand.length,
        displayCount: Math.min(hand.length, 5)
      }
    })

    this.setData({
      players,
      otherPlayers: players.filter(p => !p.isSelf),
      selfPlayer: players.find(p => p.isSelf) || this.data.selfPlayer,
      remaining,
      nextUserId: data.nextUserId != null ? data.nextUserId : this.data.nextUserId
    })

    wx.vibrateShort({ type: 'light' })
  },

  /**
   * 服务端推送：对局重置
   * 载荷 { totalCards, nextUserId }
   */
  _onGameRestarted(data) {
    const total = (data && data.totalCards) || TOTAL_CARDS
    const players = this.data.players.map(p => ({
      ...p,
      hand: [],
      cardCount: 0,
      displayCount: 0
    }))
    this.setData({
      players,
      otherPlayers: players.filter(p => !p.isSelf),
      selfPlayer: players.find(p => p.isSelf) || this.data.selfPlayer,
      remaining: total,
      totalCards: total,
      nextUserId: (data && data.nextUserId) || null
    })
    wx.showToast({ title: '新一局开始', icon: 'none' })
  },

  /**
   * 把服务端的原始牌对象格式化成展示用结构
   */
  _formatCard(card) {
    if (!card) return null
    if (card.suit === 'joker') {
      return {
        id: card.id,
        isRed: !!card.isRed,
        rankLabel: card.rank === 'big' ? '大王' : '小王',
        suitSymbol: '★'
      }
    }
    return {
      id: card.id,
      isRed: !!card.isRed,
      rankLabel: card.rank,
      suitSymbol: SUIT_SYMBOLS[card.suit] || ''
    }
  }
})
