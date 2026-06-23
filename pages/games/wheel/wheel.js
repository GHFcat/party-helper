const api = require('../../../utils/api.js')
const color = require('../../../utils/color.js')

Page({
  data: {
    gameId: 0,
    gameName: '',
    colorList:[],
    // colorList: [
    //   '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
    //   '#98D8C8', '#F7DC6F', '#BB8FCE', '#F1948A'
    // ],
    // colorList:[
    //   '#E53E3E',
    //   '#DD6B20',
    //   '#D69E2E',
    //   '#38A169',
    //   '#319795',
    //   '#3182CE',
    //   '#805AD5',
    //   '#D53F8C',
    //   '#C53030',
    //   '#2D3748'
    // ],

    items: [],      // 原始选项（编辑面板使用）
    segments: [],   // 计算好 clip-path 与文字位置的扇形（转盘渲染使用）
    rotation: 0,
    isSpinning: false,
    result: null,
    showResult: false,
    loading: true,
    newItemText: '',
    showEditor: false
  },

  onLoad(options) {
    const name = options.name ? decodeURIComponent(options.name) : ''
    // 自动更新导航栏标题 + 页内标题
    if (name) {
      this.setData({ gameName: name })
      wx.setNavigationBarTitle({ title: name })
    }
    this.setData({ gameId: options.gameId })
    this.ensureTokenThenLoad()
  },

  /**
   * 等待登录拿到 token 后再请求（接口需 Bearer Token）
   */
  ensureTokenThenLoad() {
    const app = getApp()
    if (app.globalData.token) {
      this.loadData()
    } else {
      app.globalData.tokenReadyCallback = () => this.loadData()
    }
  },

  /**
   * 从后台拉取转盘选项
   */
  loadData() {
    const gameId = this.data.gameId
    if (!gameId) {
      this.setData({ loading: false })
      return
    }
    api.get('/wx/game/item', { gameId, status:0,pageSize: 100 }).then(res => {
      const list = (res && res.data && res.data.items) || []
      if (list.length === 0) {
        wx.showToast({ title: '暂无选项', icon: 'none' })
        this.setData({ loading: false })
        return
      }else{
        this.setData({ colorList: color.generateGoldenColors(list.length) })
      }
      const items = list.map(it => ({
        text: this.shorten(it.content),
        fullText: it.content,
        punishValue: it.punishValue || ''
      }))
      this.buildSegments(items)
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    })
  },

  shorten(text) {
    if (!text) return ''
    return text.length > 6 ? text.substring(0, 5) + '…' : text
  },

  /**
   * 根据选项数量计算每个扇形的 clip-path 与文字位置
   * 扇形从顶部（-90°）起按顺时针铺开
   */
  buildSegments(items) {
    const n = items.length
    if (n === 0) {
      this.setData({ items: [], segments: [], loading: false })
      return
    }

    const colorList = this.data.colorList
    const segAngle = (2 * Math.PI) / n
    // 扇形越多字号越小，限制在 20~30rpx
    const fontSize = Math.max(20, Math.min(30, Math.floor(200 / n)))

    const segments = items.map((item, i) => {
      const startAngle = -Math.PI / 2 + segAngle * i-segAngle/2 //指针方向 - 半个扇区角度，保证指针指向扇区的正中间
      const endAngle = startAngle + segAngle
      const bisector = (startAngle + endAngle) / 2
      return {
        ...item,
        color: colorList[i % colorList.length],
        clipPath: this.buildClipPath(startAngle, endAngle),
        textStyle: this.buildTextStyle(bisector, fontSize)
      }
    })

    this.setData({ items, segments, loading: false })
  },

  /**
   * 生成扇形 clip-path 多边形：圆心 → 沿弧线插值点 → 回到圆心
   */
  buildClipPath(startAngle, endAngle) {
    const cx = 50, cy = 50, r = 50
    const points = [`${cx}% ${cy}%`]
    const degrees = (endAngle - startAngle) * 180 / Math.PI
    const steps = Math.max(2, Math.ceil(degrees / 5)) // 每 5° 一个插值点，保证弧线平滑
    for (let s = 0; s <= steps; s++) {
      const a = startAngle + (endAngle - startAngle) * (s / steps)
      const x = (cx + r * Math.cos(a)).toFixed(2)
      const y = (cy + r * Math.sin(a)).toFixed(2)
      points.push(`${x}% ${y}%`)
    }
    return `polygon(${points.join(', ')})`
  },

  /**
   * 文字沿半径方向放置，指向左半圆时翻转 180° 保持正立可读
   */
  buildTextStyle(bisector, fontSize) {
    const textR = 32 // 距圆心的百分比（外缘为 50%）
    const tx = (50 + textR * Math.cos(bisector)).toFixed(2)
    const ty = (50 + textR * Math.sin(bisector)).toFixed(2)
    let rotate = bisector * 180 / Math.PI
    if (Math.cos(bisector) < 0) rotate += 180
    return `left:${tx}%;top:${ty}%;transform:translate(-50%,-50%) rotate(${rotate.toFixed(1)}deg);font-size:${fontSize}rpx;`
  },

  /**
   * 旋转转盘 —— 精确命中目标扇形
   * 先随机选定目标，再反推所需角度，保证指针落点与结果一致
   */
  spin() {
    if (this.data.isSpinning || this.data.segments.length === 0) return

    this.setData({ isSpinning: true, showResult: false })

    const segments = this.data.segments
    const n = segments.length
    const targetIndex = Math.floor(Math.random() * n)

    // 扇形 i 中心相对顶部的偏移角（顺时针）：segAngleDeg * (i + 0.5)
    // 要把目标中心转到顶部指针处，需正向旋转 (360 - 偏移角)
    const segAngleDeg = 360 / n
    const baseRotation = (360 - segAngleDeg * (targetIndex + 0.5)+segAngleDeg/2) % 360

    // 在原圈数基础上再加 5~7 圈，保证视觉效果且始终正向累加
    const prevTurns = Math.floor(this.data.rotation / 360)
    const extraTurns = 5 + Math.floor(Math.random() * 3)
    const newRotation = (prevTurns + extraTurns) * 360 + baseRotation

    const target = segments[targetIndex]
    const result = {
      index: targetIndex,
      text: target.fullText,
      punishValue: target.punishValue,
      color: target.color
    }

    this.setData({ rotation: newRotation, result })

    wx.vibrateShort()

    setTimeout(() => {
      this.setData({ isSpinning: false, showResult: true })
      wx.vibrateLong()
    }, 4000)
  },

  /**
   * 编辑惩罚项目
   */
  showEditPanel() {
    this.setData({ showEditor: !this.data.showEditor })
  },

  onNewItemInput(e) {
    this.setData({ newItemText: e.detail.value })
  },

  addItem() {
    const text = this.data.newItemText.trim()
    if (!text) return
    const items = [...this.data.items, { text: this.shorten(text), fullText: text, punishValue: '' }]
    this.setData({ newItemText: '',colorList: color.generateGoldenColors(items.length) })
    this.buildSegments(items)
  },

  removeItem(e) {
    const index = e.currentTarget.dataset.index
    const items = this.data.items.filter((_, i) => i !== index)
    this.buildSegments(items)
  },

  /**
   * 再转一次
   */
  spinAgain() {
    this.setData({ showResult: false })
    this.spin()
  },

  /**
   * 占位事件，用于 catchtouchmove 阻止背景滚动穿透
   */
  noop() {}
})
