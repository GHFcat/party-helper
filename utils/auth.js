const app = getApp()

/**
 * 微信授权登录
 */
const login = () => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) {
          resolve(res.code)
        } else {
          reject(new Error('微信登录失败'))
        }
      },
      fail: reject
    })
  })
}

/**
 * 获取用户信息（需用户主动触发）
 */
const getUserProfile = () => {
  return new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: '用于完善个人资料',
      success: (res) => resolve(res.userInfo),
      fail: reject
    })
  })
}

/**
 * 检查登录状态
 */
const checkAuth = () => {
  return !!app.globalData.token
}

/**
 * 退出登录
 */
const logout = () => {
  app.globalData.token = null
  app.globalData.userInfo = null
  wx.removeStorageSync('token')
  wx.removeStorageSync('userInfo')
}

module.exports = { login, getUserProfile, checkAuth, logout }
