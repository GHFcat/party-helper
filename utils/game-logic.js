/**
 * 本地游戏逻辑（单机模式）
 */

/**
 * 惩罚转盘逻辑
 */
const spinWheel = (items) => {
  const totalWeight = items.length
  const index = Math.floor(Math.random() * totalWeight)
  return items[index]
}

/**
 * 炸弹倒计时逻辑
 */
const generateBombTimer = (min = 10, max = 60) => {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * 骰子逻辑
 */
const rollDice = (count = 2) => {
  const results = []
  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * 6) + 1)
  }
  return results
}

/**
 * 国王游戏 - 抽号码牌
 */
const drawKingNumbers = (playerCount) => {
  const numbers = []
  for (let i = 1; i <= playerCount; i++) {
    numbers.push(i)
  }
  // Fisher-Yates 洗牌
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[numbers[i], numbers[j]] = [numbers[j], numbers[i]]
  }
  // 随机选国王
  const kingIndex = Math.floor(Math.random() * playerCount)
  return numbers.map((num, idx) => ({
    number: num,
    isKing: idx === kingIndex
  }))
}

/**
 * 金陵十三钗 - 生成词对
 */
const generateWordPairs = () => {
  const pairs = [
    ['西瓜', '哈密瓜'], ['苹果', '梨'], ['猫', '狗'],
    ['眉毛', '睫毛'], ['饺子', '馄饨'], ['牛奶', '豆浆'],
    ['老虎', '狮子'], ['火锅', '麻辣烫'], ['口红', '唇釉'],
    ['冰箱', '空调'], ['微信', 'QQ'], ['太阳', '月亮']
  ]
  const pair = pairs[Math.floor(Math.random() * pairs.length)]
  return { civilian: pair[0], spy: pair[1] }
}

/**
 * 生成房间号
 */
const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

module.exports = {
  spinWheel,
  generateBombTimer,
  rollDice,
  drawKingNumbers,
  generateWordPairs,
  generateRoomCode
}
