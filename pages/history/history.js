const api = require('../../utils/api.js')

Page({
  data: {
    records: [],
    page: 1,
    hasMore: true
  },

  onShow() {
    this.loadHistory()
  },

  loadHistory() {
    api.get('/game/history', { page: this.data.page, size: 20 }).then(res => {
      this.setData({
        records: res.records || [],
        hasMore: res.hasMore || false
      })
    })
  },

  loadMore() {
    if (!this.data.hasMore) return
    this.setData({ page: this.data.page + 1 })
    api.get('/game/history', { page: this.data.page, size: 20 }).then(res => {
      this.setData({
        records: [...this.data.records, ...(res.records || [])],
        hasMore: res.hasMore || false
      })
    })
  }
})
