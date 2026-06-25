const { getConnection } = require('../../utils/signalr.js')

// RoomHub 路由路径
const DEFAULT_HUB = '/hubs/room'

// 各联机游戏最低开局人数
const MIN_PLAYERS_BY_GAME = {
  bomb: 3,
  thirteen: 2
}
const DEFAULT_MIN_PLAYERS = 2

// 各游戏对应的游戏页路径
const GAME_PATH_BY_TYPE = {
  bomb: '/pages/games/bomb/bomb',
  thirteen: '/pages/games/thirteen/thirteen'
}

Page({
  data: {
    roomId: 0,
    roomName: '',
    ownerUserId: 0,
    isHost: false,
    players: [],
    selfUserId: null,
    maxPlayers: 20,
    minPlayers: DEFAULT_MIN_PLAYERS,
    gameType: '',
    gameName: '',
    gameId: 0,
    inputRoomId: '',
    connection: null
  },

  onLoad(options) {
    if (options.gameType) this.setData({ gameType: options.gameType })
    if (options.gameId) this.setData({ gameId: options.gameId })
    if (options.name) this.setData({ gameName: decodeURIComponent(options.name) })

    const min = MIN_PLAYERS_BY_GAME[options.gameType] || DEFAULT_MIN_PLAYERS
    this.setData({ minPlayers: min })

    if (options.action === 'create') {
      this.createRoom()
    } else if (options.roomId) {
      this.joinRoom(Number(options.roomId))
    }
    // 否则停留在「输入房间号」界面
  },

  onUnload() {
    this._teardownListeners()
    const conn = this.data.connection
    if (conn) {
      // 主动离开房间（不等待返回）
      conn.send('LeaveRoom').catch(() => {})
    }
  },

  onCodeInput(e) {
    this.setData({ inputRoomId: e.detail.value })
  },

  /**
   * 通过输入框加入房间
   */
  joinByCode() {
    const id = (this.data.inputRoomId || '').trim()
    if (!id) {
      wx.showToast({ title: '请输入房间号', icon: 'none' })
      return
    }
    this.joinRoom(Number(id))
  },

  /**
   * 房主创建房间
   */
  createRoom() {
    const conn = getConnection()
    this.setData({ connection: conn })
    this._setupListeners(conn)

    const roomName = this.data.gameName || '聚会房间'
    conn.connect(DEFAULT_HUB).then(() => {
      return conn.invoke('CreateRoom', roomName)
    }).then(res => {
      // ApiResult<RoomDto>：{ code, message, data }
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
   * 加入指定房间
   */
  joinRoom(roomId) {
    if (!roomId || roomId <= 0) {
      wx.showToast({ title: '房间号无效', icon: 'none' })
      return
    }
    const conn = getConnection()
    this.setData({ connection: conn })
    this._setupListeners(conn)

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

  /**
   * 将 RoomDto 应用到页面状态（字段均为 camelCase）
   * RoomDto 不含 users 数组，只提供 roomId / roomName / ownerUserId / userCount；
   * 房主身份由 ownerUserId === self.id 推导，玩家列表随后通过 GetRoomUsers 拉取。
   */
  _applyRoom(room) {
    const selfUserId = this._getSelfUserId()
    const isHost = selfUserId != null && room.ownerUserId === selfUserId
    this.setData({
      roomId: room.roomId || 0,
      roomName: room.roomName || '',
      ownerUserId: room.ownerUserId,
      selfUserId,
      isHost,
      players: []
    })
    this._refreshUsers()
  },

  _refreshUsers() {
    const conn = this.data.connection
    if (!conn) return
    conn.invoke('GetRoomUsers').then(res => {
      if (!res || res.code !== 0) return
      const selfUserId = this.data.selfUserId
      // RoomUserDto: { userId, userName, isOwner, joinedAt }（无 avatar）
      const players = (res.data || []).map(u => ({
        userId: u.userId,
        userName: u.userName || '匿名',
        isOwner: !!u.isOwner,
        joinedAt: u.joinedAt || '',
        isSelf: selfUserId != null && u.userId == selfUserId
      }))
      this.setData({ players })
    }).catch(() => {})
  },

  _getSelfUserId() {
    const ui = getApp().globalData.userInfo
    return (ui && ui.id != null) ? ui.id : null
  },

  /**
   * 注册服务端推送事件
   */
  _setupListeners(conn) {
    if (this._listenersBound) return
    this._listenersBound = true

    this._userJoinedHandler = (data) => {
      // UserJoined 载荷：{ userId, userName, joinedAt }（无 isOwner / avatar）
      const userId = data && data.userId
      if (userId == null) return
      if (this.data.players.some(p => p.userId === userId)) return
      const selfUserId = this.data.selfUserId
      const player = {
        userId,
        userName: (data && data.userName) || '匿名',
        isOwner: false,
        joinedAt: (data && data.joinedAt) || '',
        isSelf: selfUserId != null && userId == selfUserId
      }
      this.setData({ players: [...this.data.players, player] })
    }
    this._userLeftHandler = (data) => {
      const userId = data && data.userId
      if (userId == null) return
      const players = this.data.players.filter(p => p.userId !== userId)
      this.setData({ players })
    }
    // 服务端广播 GameStarted：把对局初始状态（含初始持有人）透传给游戏页
    this._gameStartedHandler = (data) => {
      const path = (data && data.gamePath) || GAME_PATH_BY_TYPE[this.data.gameType]
      if (!path) return
      const holder = (data && data.holder) || {}
      const params = [
        `roomId=${this.data.roomId}`,
        `gameId=${this.data.gameId}`,
        `name=${encodeURIComponent(this.data.gameName)}`,
        `holderUserId=${holder.userId != null ? holder.userId : ''}`,
        `holderUserName=${encodeURIComponent(holder.userName || '')}`
      ].join('&')
      wx.navigateTo({ url: `${path}?${params}` })
    }

    conn.on('UserJoined', this._userJoinedHandler)
    conn.on('UserLeft', this._userLeftHandler)
    conn.on('GameStarted', this._gameStartedHandler)
  },

  _teardownListeners() {
    const conn = this.data.connection
    if (!conn) return
    if (this._userJoinedHandler) conn.off('UserJoined', this._userJoinedHandler)
    if (this._userLeftHandler) conn.off('UserLeft', this._userLeftHandler)
    if (this._gameStartedHandler) conn.off('GameStarted', this._gameStartedHandler)
    this._listenersBound = false
  },

  /**
   * 房主：开始游戏
   * 调用 RoomHub 的 StartGame 方法。服务端校验后广播 GameStarted，
   * 由 _gameStartedHandler 负责把所有人（含房主）跳进游戏页。
   */
  startGame() {
    if (this.data.players.length < this.data.minPlayers) {
      wx.showToast({ title: `至少需要${this.data.minPlayers}人`, icon: 'none' })
      return
    }
    const conn = this.data.connection
    if (!conn) return
    conn.invoke('StartGame', this.data.roomId).catch(err => {
      console.error('StartGame failed', err)
      wx.showToast({ title: '开始失败，请重试', icon: 'none' })
    })
  },

  copyRoomId() {
    wx.setClipboardData({
      data: String(this.data.roomId),
      success: () => wx.showToast({ title: '房间号已复制', icon: 'success' })
    })
  },

  onShareAppMessage() {
    return {
      title: `来聚会神器玩${this.data.gameName || '酒桌游戏'}！房间号：${this.data.roomId}`,
      path: `/pages/room/room?roomId=${this.data.roomId}&gameType=${this.data.gameType}&name=${encodeURIComponent(this.data.gameName)}`
    }
  }
})
