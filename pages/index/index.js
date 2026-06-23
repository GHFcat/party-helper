const app = getApp()
const api = require('../../utils/api.js')
Page({
  data: {
    userInfo: null,
    categories: [],        // 所有分类
    activeCategoryId: '0',   // 当前选中的分类Id，0=全部
    allGames: [],          // 全部游戏
    displayGames: [],      // 当前展示的游戏（按选中分类过滤）
    loading: true
  },

  onLoad() {
    var nickName="微信用户"
    var avatarUrl=""
    
    var that=this
    wx.getUserInfo({
      success: function(res) {
        var userInfo = res.userInfo
         nickName = userInfo.nickName
         avatarUrl = userInfo.avatarUrl
      },
      complete:function(res){
        var userInfo=app.globalData.userInfo
        if(userInfo.nickName==null){
          userInfo.nickName=nickName
        }
        if(userInfo.avatar==null){
          userInfo.avatar=avatarUrl
        }
        that.setData({ userInfo: userInfo })
        app.globalData.userInfo = userInfo
      }
    })
    
    if (app.globalData.token) {
      this.loadData()
    } else {
      // 等 app.js 登录完成后再加载
      app.globalData.tokenReadyCallback = () => {
        this.loadData()
      }
    }
  },

  onShow() {
    if (app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo })
    }
  },

  /**
   * 加载分类和游戏库
   */
  loadData() {
  
    Promise.all([
      api.get('/wx/game/category'),
      api.get('/wx/game/library', { pageSize: 100 })
    ]).then(([catRes, libRes]) => {
      const categories = (catRes.data || []).filter(c => c.status === 0)
      const items = (libRes.data?.items || []).map(this.mapGame)
      this.setData({
        categories,
        allGames: items,
        displayGames: items,
        loading: false
      })
    }).catch(() => {
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  /**
   * 后台数据映射到小程序展示字段
   */
  mapGame(item) {
    return {
      id: item.id,
      name: item.name,
      desc: item.description || '',
      icon: item.icon || '',
      coverImage: item.coverImage || '',
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      difficulty: item.difficulty,
      minPlayers: item.minPlayers,
      maxPlayers: item.maxPlayers,
      duration: item.duration,
      isHot: item.isHot,
      tags: item.tags || [],
      rules: item.rules || '',
      wxPagePath: item.wxPagePath || ''
    }
  },

  /**
   * 切换分类
   */
  selectCategory(e) {
    const id = e.currentTarget.dataset.id
    const displayGames = id === '0' ? this.data.allGames : this.data.allGames.filter(g => g.categoryId === id)
    this.setData({ activeCategoryId: id, displayGames })
  },

  /**
   * 选择游戏
   */
  selectGame(e) {
    const game = e.currentTarget.dataset.game
    if (!game.wxPagePath) {
      wx.showToast({ title: '该游戏页面未配置', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `${game.wxPagePath}?gameId=${game.id}&name=${encodeURIComponent(game.name)}`
    })
  },

  /**
   * 快速开始 - 随机选一个游戏
   */
  quickStart() {
    const games = this.data.displayGames
    if (games.length === 0) return
    const random = games[Math.floor(Math.random() * games.length)]
    this.selectGame({ currentTarget: { dataset: { game: random } } })
  },

  onShareAppMessage() {
    return {
      title: '聚会神器·酒桌助手 - 一起来玩吧！',
      path: '/pages/index/index'
    }
  }
})
