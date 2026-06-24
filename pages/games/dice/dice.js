const { rollDice } = require('../../../utils/game-logic.js')

// 相机俯视倾斜（模拟从斜上方看桌面上的骰子）
const TILT_X = -70

// 各点数对应的目标旋转：让结果面转到 cube 局部的「顶部」位置（法线朝 -Y）
// 1↔6 / 2↔5 / 3↔4 互为对面
const FACE_ROTATIONS = {
  1: { x: 90,  z: 0   },  // front → top
  2: { x: 0,   z: 0   },  // top   → top（不动）
  3: { x: 0,   z: -90 },  // right → top
  4: { x: 0,   z: 90  },  // left  → top
  5: { x: 180, z: 0   },  // bottom→ top
  6: { x: -90, z: 0   }   // back  → top
}

// 6 个面在立方体上的位置定义
const DICE_FACES = [
  { name: 'front',  value: 1 },
  { name: 'back',   value: 6 },
  { name: 'top',    value: 2 },
  { name: 'bottom', value: 5 },
  { name: 'right',  value: 3 },
  { name: 'left',   value: 4 }
]

// 9 个圆点位置的索引（3x3 网格）
const PIP_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8]

// 各点数的圆点布局（true = 该位置显示圆点）
const PIP_LAYOUTS = {
  1: [false, false, false,  false, true,  false,  false, false, false],
  2: [true,  false, false,  false, false, false,  false, false, true ],
  3: [true,  false, false,  false, true,  false,  false, false, true ],
  4: [true,  false, true,   false, false, false,  true,  false, true ],
  5: [true,  false, true,   false, true,  false,  true,  false, true ],
  6: [true,  false, true,   true,  false, true,   true,  false, true ]
}

let _historyId = 0

Page({
  data: {
    gameId: 0,
    diceCount: 2,
    dice: [],
    diceFaces: DICE_FACES,
    pipIndices: PIP_INDICES,
    pipLayouts: PIP_LAYOUTS,
    totalSum: 0,
    isRolling: false,
    noAnim: false,
    history: []
  },

  onLoad(options) {
    const name = options.name ? decodeURIComponent(options.name) : ''
    // 自动更新导航栏标题 + 页内标题
    if (name) {
      this.setData({ gameName: name })
      wx.setNavigationBarTitle({ title: name })
    }
    this.setData({ gameId: options.gameId || 0 })
    this.initDice()
  },

  /**
   * 初始化骰子：保留已有骰子状态，新增的骰子给随机初始面
   * 散落位置由 CSS :nth-child 根据数量自动控制（梅花状）
   */
  initDice() {
    const oldDice = this.data.dice
    const count = this.data.diceCount
    const dice = []
    for (let i = 0; i < count; i++) {
      if (i < oldDice.length) {
        dice.push(oldDice[i])
      } else {
        const value = Math.floor(Math.random() * 6) + 1
        const base = FACE_ROTATIONS[value]
        const scatter = Math.floor(Math.random() * 360)
        dice.push({
          id: i,
          value,
          rotX: base.x,
          rotZ: base.z,
          scatter,
          transform: this.buildTransform(base.x, base.z, scatter)
        })
      }
    }
    const sum = dice.reduce((s, d) => s + d.value, 0)
    this.setData({ dice, totalSum: sum })
  },

  buildTransform(rotX, rotZ, scatter) {
    // 顺序（从右到左应用）：
    // 1. rotateX(rotX)：cube 自身翻转，把 front/back/top/bottom 翻到顶部
    // 2. rotateZ(rotZ)：cube 自身翻转，把 left/right 翻到顶部
    //    此时结果面在 cube 局部 -Y，落点恰在世界 Y 轴上
    // 3. rotateY(scatter)：绕世界 Y 轴自转一个随机散落角度（结果面在 Y 轴上不受影响）
    // 4. rotateX(TILT_X)：最后整体俯视倾斜（相机视角），结果面朝相机偏上
    return `rotateX(${TILT_X}deg) rotateY(${scatter}deg) rotateZ(${rotZ}deg) rotateX(${rotX}deg)`
  },

  /**
   * 计算累加旋转角度：保证比 current 多转至少 minDelta 度，且最终 mod 360 == base
   */
  nextRotation(current, base, minDelta) {
    const normalizedBase = ((base % 360) + 360) % 360
    const minTarget = current + minDelta
    let k = Math.ceil((minTarget - normalizedBase) / 360)
    if (k < 0) k = 0
    let result = k * 360 + normalizedBase
    while (result < minTarget) result += 360
    return result
  },

  /**
   * 调整骰子数量（1-6）
   */
  changeDiceCount(e) {
    if (this.data.isRolling) return
    const action = e.currentTarget.dataset.action
    let count = this.data.diceCount
    if (action === 'inc' && count < 6) count++
    else if (action === 'dec' && count > 1) count--
    else return

    this.setData({ diceCount: count })
    this.initDice()
  },

  /**
   * 摇骰子
   */
  roll() {
    if (this.data.isRolling) return

    this.setData({ isRolling: true })
    wx.vibrateShort()

    const results = rollDice(this.data.diceCount)
    const dice = this.data.dice.map((die, idx) => {
      const value = results[idx]
      const base = FACE_ROTATIONS[value]
      // 翻面角度：每个骰子多转 2~3 圈，X/Z 轴独立累加不同步更自然
      const rotX = this.nextRotation(die.rotX, base.x, 720 + Math.floor(Math.random() * 360))
      const rotZ = this.nextRotation(die.rotZ, base.z, 720 + Math.floor(Math.random() * 360))
      // 散落角度：每个骰子绕垂直轴多转 1~2 圈，停在 0-360 之间的随机朝向
      const scatter = this.nextRotation(die.scatter, Math.floor(Math.random() * 360), 360 + Math.floor(Math.random() * 360))
      return {
        ...die,
        value,
        rotX,
        rotZ,
        scatter,
        transform: this.buildTransform(rotX, rotZ, scatter)
      }
    })
    this.setData({ dice })

    // 等动画结束后保存历史
    setTimeout(() => {
      const sum = results.reduce((a, b) => a + b, 0)
      const record = {
        hid: ++_historyId,
        values: results.slice(),
        sum
      }
      this.setData({
        totalSum: sum,
        isRolling: false,
        history: [record, ...this.data.history].slice(0, 10)
      })
      wx.vibrateShort()
      // 归一化累加角度，避免多次摇骰后值无限增长
      this.normalizeRotation()
    }, 1500)
  },

  /**
   * 归一化每个骰子的 rotX/Z/scatter 到 [0,360)，期间禁用 transition 避免反向动画
   */
  normalizeRotation() {
    this.setData({ noAnim: true })
    setTimeout(() => {
      const dice = this.data.dice.map(die => {
        const rotX = ((die.rotX % 360) + 360) % 360
        const rotZ = ((die.rotZ % 360) + 360) % 360
        const scatter = ((die.scatter % 360) + 360) % 360
        return {
          ...die,
          rotX,
          rotZ,
          scatter,
          transform: this.buildTransform(rotX, rotZ, scatter)
        }
      })
      this.setData({ dice })
      setTimeout(() => this.setData({ noAnim: false }), 30)
    }, 30)
  }
})
