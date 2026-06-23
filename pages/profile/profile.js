const app = getApp()
const api = require('../../utils/api.js')
const auth = require('../../utils/auth.js')

Page({
  data: {
    userInfo: null,
    stats: {
      totalGames: 0,
      totalPunishments: 0,
      winRate: 0
    }
  },
  onLoad() {
    this.setData({
      userInfo: app.globalData.userInfo
    })
  },
  onShow() {


  },

  //设置个人信息
  setUserInfo() {
    wx.navigateTo({
      url: '/pages/user-info/user-info'
    })
  },
  /**
   * 获取微信用户信息
   */
  getUserProfile() {
    auth.getUserProfile().then(info => {
      api.post('/user/profile', {
        nickName: info.nickName,
        avatarUrl: info.avatarUrl
      }).then(() => {
        app.globalData.userInfo = {
          ...app.globalData.userInfo,
          ...info
        }
        this.setData({
          userInfo: app.globalData.userInfo
        })
      })
    })
  },

  /**
   * 退出登录
   */
  logout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      success: (res) => {
        if (res.confirm) {
          auth.logout()
          this.setData({
            userInfo: null,
            stats: {
              totalGames: 0,
              totalPunishments: 0,
              winRate: 0
            }
          })
        }
      }
    })
  }
})