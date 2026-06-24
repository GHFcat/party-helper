App({
  globalData: {
    userInfo: null,
    token: null,
    baseUrl: 'http://192.168.21.15:5087/api',
    wsUrl: 'http://192.168.21.15:5087',
    appId: 'wxb83e12096c08eb2d',
    // 登录完成回调（页面通过 tokenReady 回调注册）
    tokenReadyCallback: null
  },

  onLaunch() {
    this.checkLogin()
  },

  checkLogin() {
    const token = wx.getStorageSync('token')
    if (token) {
      this.globalData.token = token
      this.globalData.userInfo = wx.getStorageSync('userInfo')
    } else {
      this.login()
    }

  },

  login() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            wx.request({
              url: `${this.globalData.baseUrl}/auth/wxlogin`,
              method: 'POST',
              data: {
                code: res.code,
                appId: this.globalData.appId
              },
              header: {
                'Content-Type': 'application/json'
                // 注意：这里不要加 Authorization
              },
              success: (response) => {
                if (response.statusCode === 200) {
                  const data = response.data.data
                  if (data && data.accessToken) {
                    // 保存 token 和用户信息
                    this.globalData.token = data.accessToken
                    this.globalData.userInfo = data.userInfo
                    try {
                      wx.setStorageSync('token', data.accessToken)
                      wx.setStorageSync('userInfo', data.userInfo)
                    } catch (e) {
                      console.warn('存储 token 失败', e)
                    }
                    // 通知页面登录完成
                    if (this.globalData.tokenReadyCallback) {
                      this.globalData.tokenReadyCallback()
                    }
                    resolve(data)
                  } else {
                    reject(new Error('登录接口返回数据格式异常'))
                  }
                } else {
                  reject(new Error(`登录失败 (${response.statusCode}): ${response.data?.message || ''}`))
                }
              },
              fail: (err) => {
                reject(new Error(`请求登录接口失败: ${err.errMsg}`))
              }
            })
          } else {
            reject(new Error(`获取微信 code 失败: ${res.errMsg}`))
          }
        },
        fail: (err) => {
          reject(new Error(`wx.login 失败: ${err.errMsg}`))
        }
      })
    })
  }
})