const { getConnection } = require('../../../utils/signalr.js')

const SUIT_SYMBOLS = { spade: '♠', heart: '♥', diamond: '♦', club: '♣' }
const TOTAL_CARDS = 52
const DEFAULT_HUB = '/hubs/room'
const MIN_PLAYERS = 1

/**
 * 椭圆牌桌半径（百分比，相对屏幕宽 / 高）
 * 用于按人数等分布点
 */
const TABLE_RX = 44   // 水平半径
const TABLE_RY = 34   // 垂直半径
const TABLE_CX = 50   // 中心 X
const TABLE_CY = 50   // 中心 Y

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
    nextUserId: null,
    // 离线用户索引：{ [userId]: true }，单源真相
    offlineUserIds: {},
    // Mock 模式（仅供单机调试布局用，不入 SignalR 流程）
    mockMode: false,
    mockCount: 4
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

    // Mock 模式：跳过 SignalR，本地伪造玩家用于调试布局
    if (options.mock === '1') {
      const count = Math.min(8, Math.max(2, Number(options.players) || 4))
      this.setData({
        mockMode: true,
        roomId: 888888,
        ownerUserId: patch.selfUserId || 1,
        isHost: true,
        phase: 'table',
        gameStarted: options.started === '1',
        mockCount: count
      })
      this._loadMockPlayers(count)
      return
    }

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
    this._userOfflineHandler = (d) => this._onUserOffline(d)
    this._gameStartedHandler = () => this._onGameStarted()
    this._cardDealtHandler = (d) => this._onCardDealt(d)
    this._gameRestartedHandler = (d) => this._onGameRestarted(d)

    conn.on('UserJoined', this._userJoinedHandler)
    conn.on('UserLeft', this._userLeftHandler)
    conn.on('UserOffline', this._userOfflineHandler)
    conn.on('GameStarted', this._gameStartedHandler)
    conn.on('CardDealt', this._cardDealtHandler)
    conn.on('GameRestarted', this._gameRestartedHandler)
  },

  _teardownHubListeners() {
    const conn = this.data.connection
    if (!conn) return
    if (this._userJoinedHandler) conn.off('UserJoined', this._userJoinedHandler)
    if (this._userLeftHandler) conn.off('UserLeft', this._userLeftHandler)
    if (this._userOfflineHandler) conn.off('UserOffline', this._userOfflineHandler)
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

  _onUserJoined(data) {
    // 用户加入（可能是离线后重连）→ 清除离线标记再重排
    const userId = data && (data.userId || data.UserId)
    if (userId != null && this.data.offlineUserIds[userId]) {
      const offlineUserIds = { ...this.data.offlineUserIds }
      delete offlineUserIds[userId]
      this.setData({ offlineUserIds })
    }
    this._loadTablePlayers()
  },

  _onUserLeft() {
    this._loadTablePlayers()
  },

  /**
   * 用户离线：保留座位和手牌，仅标记离线
   * 后端广播载荷预期：{ userId, ... }
   */
  _onUserOffline(data) {
    const userId = data && (data.userId || data.UserId)
    if (userId == null) return
    this._setUserOffline(userId, true)
  },

  /**
   * 统一改某个用户的离线状态（同时更新 map、players、selfPlayer）
   */
  _setUserOffline(userId, isOffline) {
    const offlineUserIds = { ...this.data.offlineUserIds }
    if (isOffline) offlineUserIds[userId] = true
    else delete offlineUserIds[userId]
    const players = this.data.players.map(p =>
      (p.userId == userId) ? { ...p, isOffline } : p
    )
    const selfPlayer = (this.data.selfPlayer && this.data.selfPlayer.userId == userId)
      ? { ...this.data.selfPlayer, isOffline }
      : this.data.selfPlayer
    this.setData({
      offlineUserIds,
      players,
      otherPlayers: players.filter(p => !p.isSelf),
      selfPlayer
    })
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
   */
  _loadTablePlayers() {
    const conn = this.data.connection
    if (!conn) return
    conn.invoke('GetRoomUsers').then(res => {
      if (!res || res.code !== 0) return
      this._applyUsers(res.data || [])
    }).catch(err => {
      console.error('GetRoomUsers failed', err)
    })
  },

  /**
   * 把用户列表排成座位（公共逻辑）
   * - 按 userId 升序得到全员一致的「发牌顺序」
   * - 以自己为起点 (seatIndex 0) 计算每个玩家在桌面上的座位
   * - 重新拉取时按 userId 合并已发的手牌
   */
  _applyUsers(users) {
    const sorted = users.slice().sort((a, b) => a.userId - b.userId)
    const N = sorted.length
    const selfId = this.data.selfUserId
    let selfCanonicalIdx = sorted.findIndex(u => u.userId == selfId)
    if (selfCanonicalIdx < 0) selfCanonicalIdx = 0

    const prevMap = {}
    this.data.players.forEach(p => { prevMap[p.userId] = p })
    const offlineUserIds = this.data.offlineUserIds || {}

    const players = sorted.map((u, i) => {
      const seatIndex = (i - selfCanonicalIdx + N) % N
      const prev = prevMap[u.userId]
      const hand = (prev && prev.hand) || []
      return {
        userId: u.userId,
        userName: u.userName || '匿名',
        isOwner: !!u.isOwner,
        isSelf: u.userId == selfId,
        isOffline: !!offlineUserIds[u.userId],
        seatIndex,
        positionStyle: this._computeSeatPosition(seatIndex, N),
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
  },

  /**
   * 按 N 等分椭圆计算座位位置（self 在底部正中，逆时针分布）
   * - 椭圆中心 (50%, 50%)，半径 TABLE_RX / TABLE_RY
   * - seatIndex 0 = self（用 .seat-self 渲染，返回空字符串）
   * - seatIndex i 的角度 = i * (360 / N)，从底部逆时针
   */
  _computeSeatPosition(seatIndex, N) {
    if (seatIndex === 0 || N <= 1) return ''
    const angle = (seatIndex * 2 * Math.PI) / N
    const x = TABLE_CX - TABLE_RX * Math.sin(angle)
    const y = TABLE_CY + TABLE_RY * Math.cos(angle)
    return `left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;transform:translate(-50%,-50%);`
  },

  // ============ Mock 调试 ============

  _loadMockPlayers(count) {
    const selfId = this.data.selfUserId || 1
    const names = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九']
    const users = [{
      userId: selfId,
      userName: '我',
      isOwner: true
    }]
    for (let i = 0; i < count - 1; i++) {
      users.push({
        userId: 1000 + i,
        userName: names[i] || ('玩家' + (i + 2)),
        isOwner: false
      })
    }
    this._applyUsers(users)
  },

  mockSetCount(e) {
    const count = Number(e.currentTarget.dataset.count) || 4
    this.setData({ mockCount: count })
    this._loadMockPlayers(count)
  },

  mockDealSelf() {
    if (!this.data.selfPlayer) return
    const suits = ['spade', 'heart', 'diamond', 'club']
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const players = this.data.players.map(p => {
      if (!p.isSelf) return p
      const hand = []
      for (let i = 0; i < 5; i++) {
        const suit = suits[i % suits.length]
        const rank = ranks[(i * 3) % ranks.length]
        hand.push({
          id: 'mock-' + i,
          isRed: suit === 'heart' || suit === 'diamond',
          rankLabel: rank,
          suitSymbol: SUIT_SYMBOLS[suit]
        })
      }
      return { ...p, hand, cardCount: hand.length, displayCount: Math.min(hand.length, 5) }
    })
    this.setData({
      players,
      otherPlayers: players.filter(p => !p.isSelf),
      selfPlayer: players.find(p => p.isSelf) || this.data.selfPlayer
    })
  },

  mockToggleStarted() {
    this.setData({ gameStarted: !this.data.gameStarted })
  },

  mockDealOthers() {
    // 给其他玩家随机发几张牌，用来观察手牌正面布局
    const suits = ['spade', 'heart', 'diamond', 'club']
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const players = this.data.players.map(p => {
      if (p.isSelf) return p
      const n = Math.floor(Math.random() * 6) + 1
      const hand = []
      for (let i = 0; i < n; i++) {
        const suit = suits[Math.floor(Math.random() * 4)]
        const rank = ranks[Math.floor(Math.random() * 13)]
        hand.push({
          id: 'mock-o-' + p.userId + '-' + i,
          isRed: suit === 'heart' || suit === 'diamond',
          rankLabel: rank,
          suitSymbol: SUIT_SYMBOLS[suit]
        })
      }
      return { ...p, hand, cardCount: hand.length, displayCount: Math.min(hand.length, 5) }
    })
    this.setData({
      players,
      otherPlayers: players.filter(p => !p.isSelf)
    })
  },

  // Mock：点击某个座位切换其离线状态
  mockToggleSeatOffline(e) {
    if (!this.data.mockMode) return
    const userId = Number(e.currentTarget.dataset.userid)
    if (!userId) return
    this._setUserOffline(userId, !this.data.offlineUserIds[userId])
  },

  // Mock：切换自己的离线状态
  mockToggleSelfOffline() {
    if (!this.data.mockMode) return
    const selfId = this.data.selfUserId
    if (selfId == null) return
    this._setUserOffline(selfId, !this.data.offlineUserIds[selfId])
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
