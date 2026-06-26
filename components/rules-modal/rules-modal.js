const api = require('../../utils/api.js')

Component({
  properties: {
    // 游戏 ID，用于拉取规则
    gameId: {
      type: [String, Number],
      value: 0
    },
    // 按钮文字
    btnText: {
      type: String,
      value: '游戏规则'
    }
  },

  data: {
    rules: [],
    showRules: false,
    loaded: false,
    // 用 wx.getMenuButtonBoundingClientRect 动态计算的入口按钮定位
    // 避免和小程序右上角胶囊按钮重叠（横屏尤其严重）
    entryStyle: ''
  },

  observers: {
    'gameId': function (id) {
      if (id) this.loadRules()
    }
  },

  lifetimes: {
    attached() {
      if (this.data.gameId) this.loadRules()
      this._alignToCapsule()
    }
  },

  methods: {
    /**
     * 规则入口按钮定位
     * - 横屏（无原生导航栏）：放在胶囊下方，右边缘对齐
     * - 竖屏（有原生导航栏）：放在胶囊左侧同一行，像原生导航按钮一样
     * 失败时回退到 CSS 里的默认 top/right
     */
    _alignToCapsule() {
      try {
        const r = wx.getMenuButtonBoundingClientRect()
        if (!r || !r.right) return
        const win = wx.getWindowInfo()
        const isLandscape = win.windowWidth > win.windowHeight
        console.log(isLandscape)
        if (isLandscape) {
          const rightPx = win.windowWidth - r.right
          const topPx = r.bottom + 6
          this.setData({
            entryStyle: `top:${topPx}px;right:${rightPx}px;`
          })
        } 
      } catch (e) {
        // 老版本或 IDE 环境可能拿不到，沿用 CSS 默认值
      }
    },

    /**
     * 拉取游戏规则：/wx/game/library/{gameId} → res.data.rules
     * rules 可能是字符串（含换行）或数组，统一转成数组
     */
    loadRules() {
      const id = this.properties.gameId
      if (!id || this.data.loaded) return

      api.get('/wx/game/library/' + id).then(res => {
        const raw = res && res.data && res.data.rules
        this.setData({ rules: this.normalizeRules(raw), loaded: true })
      }).catch(() => {
        this.setData({ loaded: true })
      })
    },

    normalizeRules(raw) {
      if (!raw) return []
      if (Array.isArray(raw)) {
        return raw.map(r => String(r)).map(s => s.trim()).filter(Boolean)
      }
      // 字符串：按换行切分
      return String(raw)
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
    },

    open() {
      if (this.data.rules.length === 0) {
        wx.showToast({ title: '暂无规则', icon: 'none' })
        return
      }
      this.setData({ showRules: true })
    },

    close() {
      this.setData({ showRules: false })
    },

    // 阻止遮罩层滚动穿透
    noop() {}
  }
})
