const app = getApp()

// 登录状态与队列
let isLoggingIn = false
let pendingRequests = []

/**
 * 内部重试函数（带 _retry 标记，防止二次登录）
 */
const requestWithRetry = (options, resolve, reject) => {
  // 添加内部标记，若再次 401 则直接失败
  const newOptions = {
    ...options,
    _retry: true
  }
  request(newOptions)
    .then(resolve)
    .catch(reject)
}

/**
 * 封装 HTTP 请求
 */
const request = (options) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.baseUrl}${options.url}`,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // 如果已经重试过，则直接拒绝（避免死循环）
          if (options._retry) {
            reject(new Error('登录后仍无权限，请重新登录'))
            return
          }

          // 将当前请求加入队列
          pendingRequests.push({
            resolve,
            reject,
            options
          })

          // 如果没有正在登录，则发起登录
          if (!isLoggingIn) {
            isLoggingIn = true
            app.login()
              .then(() => {
                // 登录成功，重试所有等待的请求
                pendingRequests.forEach(({
                  resolve,
                  reject,
                  options
                }) => {
                  requestWithRetry(options, resolve, reject)
                })
                pendingRequests = []
                isLoggingIn = false
              })
              .catch((loginErr) => {
                // 登录失败，拒绝所有等待的请求
                pendingRequests.forEach(({
                  reject
                }) => {
                  reject(new Error('登录失败，请稍后重试'))
                })
                pendingRequests = []
                isLoggingIn = false
                // 可在此提示用户
                wx.showToast({
                  title: '登录失效，请重新登录',
                  icon: 'none'
                })
              })
          }
          // 若正在登录，则当前请求已入队，无需额外操作

        } else {
          reject(new Error(res.data.message || '请求失败'))
        }
      },
      fail: (err) => {
        wx.showToast({
          title: '网络异常',
          icon: 'none'
        })
        reject(err)
      }
    })
  })
}

/**
 * 封装上传文件
 * @param {Object} options - 参数同 wx.uploadFile，额外增加 _retry 内部标记
 */
const uploadFile = (options) => {
  return new Promise((resolve, reject) => {
    const { url, filePath, name, formData = {}, header = {} } = options
    wx.uploadFile({
      url: `${app.globalData.baseUrl}${url}`,
      filePath,
      name,
      formData,
      header: {
        ...header,
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        // 注意：wx.uploadFile 的 success 回调中，data 是字符串，需要解析
        let data = {}
        try {
          data = JSON.parse(res.data)
        } catch (e) {
          data = { message: res.data }
        }
        if (res.statusCode === 200) {
          resolve(data)
        } 
        else {
          reject(new Error(data.message || '上传失败'))
        }
      },
      fail: (err) => {
        wx.showToast({ title: '上传失败', icon: 'none' })
        reject(err)
      }
    })
  })
}

const get = (url, data) => request({
  url,
  method: 'GET',
  data
})
const post = (url, data) => request({
  url,
  method: 'POST',
  data
})
const put = (url, data) => request({
  url,
  method: 'PUT',
  data
})
const patch = (url, data) => request({
  url,
  method: 'PATCH',
  data
})
const del = (url, data) => request({
  url,
  method: 'DELETE',
  data
})

const upload = (url, filePath, name, formData = {}, header = {}) => {
  return uploadFile({ url, filePath, name, formData, header })
}

module.exports = {
  request,
  get,
  post,
  put,
  patch,
  del,
  upload        
}