const { generateWordPairs } = require('../../../utils/game-logic.js')
const { getConnection } = require('../../../utils/signalr.js')

Page({
  data: {
    phase: 'ready', // ready | peek | describe | vote | reveal
    players: [],
    playerCount: 4,
    myWord: '',
    isSpy: false,
    currentPlayerIndex: 0,
    describeOrder: [],
    votes: {},
    myVote: null,
    eliminatedPlayer: null,
    round: 1,
    wordPair: null
  },

  onLoad(options) {
    if (options.roomCode) {
      this.setupSignalR(options.roomCode)
    }
  },

  /**
   * 开始游戏
   */
  startGame() {
    const pair = generateWordPairs()
    const spyIndex = Math.floor(Math.random() * this.data.playerCount)
    const players = []

    for (let i = 0; i < this.data.playerCount; i++) {
      players.push({
        id: i,
        name: `玩家${i + 1}`,
        isSpy: i === spyIndex,
        word: i === spyIndex ? pair.spy : pair.civilian,
        isEliminated: false
      })
    }

    // 生成发言顺序
    const order = players.map((_, i) => i)

    this.setData({
      players,
      wordPair: pair,
      myWord: players[0].word,
      isSpy: players[0].isSpy,
      currentPlayerIndex: 0,
      describeOrder: order,
      votes: {},
      myVote: null,
      eliminatedPlayer: null,
      round: 1,
      phase: 'peek'
    })
  },

  /**
   * 看完自己的词
   */
  confirmPeek() {
    this.setData({ phase: 'describe' })
  },

  /**
   * 下一个发言
   */
  nextSpeaker() {
    const next = this.data.currentPlayerIndex + 1
    if (next >= this.data.playerCount) {
      this.setData({ phase: 'vote' })
    } else {
      this.setData({ currentPlayerIndex: next })
    }
  },

  /**
   * 投票
   */
  vote(e) {
    const targetId = e.currentTarget.dataset.id
    this.setData({ myVote: targetId })
  },

  /**
   * 确认投票
   */
  confirmVote() {
    if (this.data.myVote === null) {
      wx.showToast({ title: '请选择一个人', icon: 'none' })
      return
    }

    // 单机模式：随机AI投票
    const votes = { ...this.data.votes, 0: this.data.myVote }
    for (let i = 1; i < this.data.playerCount; i++) {
      if (!this.data.players[i].isEliminated) {
        votes[i] = Math.floor(Math.random() * this.data.playerCount)
      }
    }

    // 计票
    const voteCount = {}
    Object.values(votes).forEach(v => {
      voteCount[v] = (voteCount[v] || 0) + 1
    })

    // 找出票数最多的
    let maxVotes = 0
    let eliminated = null
    Object.entries(voteCount).forEach(([playerId, count]) => {
      if (count > maxVotes) {
        maxVotes = count
        eliminated = parseInt(playerId)
      }
    })

    const players = this.data.players.map(p => ({
      ...p,
      isEliminated: p.id === eliminated
    }))

    this.setData({
      votes,
      eliminatedPlayer: eliminated,
      players,
      phase: 'reveal'
    })
  },

  /**
   * 检查游戏是否结束
   */
  checkGameEnd() {
    const alive = this.data.players.filter(p => !p.isEliminated)
    const spyAlive = alive.filter(p => p.isSpy)

    if (spyAlive.length === 0) {
      wx.showToast({ title: '平民胜利！卧底已被找出', icon: 'none', duration: 3000 })
      return true
    }
    if (spyAlive.length >= alive.length - spyAlive.length) {
      wx.showToast({ title: '卧底胜利！卧底占领了全场', icon: 'none', duration: 3000 })
      return true
    }
    return false
  },

  /**
   * 下一轮
   */
  nextRound() {
    if (this.checkGameEnd()) return

    this.setData({
      phase: 'describe',
      currentPlayerIndex: 0,
      myVote: null,
      round: this.data.round + 1
    })
  },

  /**
   * 重新开始
   */
  restart() {
    this.setData({ phase: 'ready' })
  },

  changePlayerCount(e) {
    const delta = e.currentTarget.dataset.delta
    const count = this.data.playerCount + delta
    if (count >= 4 && count <= 12) {
      this.setData({ playerCount: count })
    }
  },

  setupSignalR(roomCode) {
    const connection = getConnection()
    connection.on('WordAssigned', (data) => {
      this.setData({
        myWord: data.word,
        isSpy: data.isSpy,
        phase: 'peek'
      })
    })
    connection.on('PlayerDescribe', (data) => {
      this.setData({ currentPlayerIndex: data.playerIndex })
    })
    connection.on('VoteResult', (data) => {
      this.setData({
        votes: data.votes,
        eliminatedPlayer: data.eliminatedId,
        players: data.players,
        phase: 'reveal'
      })
    })
  }
})
