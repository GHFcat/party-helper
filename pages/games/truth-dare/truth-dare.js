const api = require('../../../utils/api.js')

Page({
  data: {
    phase: 'choose', // choose | truth | dare | reveal
    gameId:0,
    currentCard: null,
    truthQuestions: [],
    dareQuestions: [],
    selectedIndex: -1,
    // 自定义题目编辑面板
    showEditor: false,
    editorTab: 'truth',   // truth | dare
    newItemText: ''
  },

  onLoad(options) {
    this.setData({ gameId: options.gameId })
    this.loadData()
  },
  loadData() {
    const gameId = this.data.gameId
  
    api.get('/wx/game/item', { gameId, status:0,pageSize: 100 }).then(res => {
      const list = (res && res.data && res.data.items) || []
     
      const truthQuestions=list.filter(x=>x.type==1)
      const dareQuestions=list.filter(x=>x.type==2)
      console.log(truthQuestions)
      console.log(dareQuestions)
      this.setData({ truthQuestions,dareQuestions  })
      
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },
  loadQuestions() {
    api.get('/game/questions', { type: 'truth' }).then(res => {
      this.setData({ truthQuestions: res })
    })
    api.get('/game/questions', { type: 'dare' }).then(res => {
      this.setData({ dareQuestions: res })
    })
  },

  /**
   * 抽卡
   */
  drawCard() {
    const index = Math.floor(Math.random() * 10)
    this.setData({ selectedIndex: index, phase: 'choose' })
    wx.vibrateShort()
  },

  /**
   * 选择真心话
   */
  chooseTruth() {
    const questions = this.data.truthQuestions
    const question = questions[Math.floor(Math.random() * questions.length)]
    this.setData({
      currentCard: { type: 'truth', content: question.content },
      phase: 'reveal'
    })
    wx.vibrateShort()
  },

  /**
   * 选择大冒险
   */
  chooseDare() {
    const questions = this.data.dareQuestions
    const question = questions[Math.floor(Math.random() * questions.length)]
    this.setData({
      currentCard: { type: 'dare', content: question.content },
      phase: 'reveal'
    })
    wx.vibrateShort()
  },

  /**
   * 下一轮
   */
  nextRound() {
    this.setData({ phase: 'choose', currentCard: null, selectedIndex: -1 })
  },

  // ============ 自定义题目 ============

  showEditPanel() {
    this.setData({ showEditor: !this.data.showEditor })
  },

  switchEditorTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab && tab !== this.data.editorTab) {
      this.setData({ editorTab: tab, newItemText: '' })
    }
  },

  onNewItemInput(e) {
    this.setData({ newItemText: e.detail.value })
  },

  addItem() {
    const text = (this.data.newItemText || '').trim()
    if (!text) return
    const isTruth = this.data.editorTab === 'truth'
    const newItem = { type: isTruth ? 1 : 2, content: text }
    const list = isTruth ? this.data.truthQuestions : this.data.dareQuestions
    const newList = [...list, newItem]
    if (isTruth) {
      this.setData({ truthQuestions: newList, newItemText: '' })
    } else {
      this.setData({ dareQuestions: newList, newItemText: '' })
    }
  },

  removeItem(e) {
    const { tab, index } = e.currentTarget.dataset
    const i = Number(index)
    const isTruth = tab === 'truth'
    const list = isTruth ? this.data.truthQuestions : this.data.dareQuestions
    const newList = list.filter((_, idx) => idx !== i)
    if (isTruth) {
      this.setData({ truthQuestions: newList })
    } else {
      this.setData({ dareQuestions: newList })
    }
  },

  noop() {}
})
