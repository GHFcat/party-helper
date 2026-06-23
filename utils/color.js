
/**
 * 黄金角度算法,生成转盘色值
 */
const generateGoldenColors=(count)=> {
  const colors = [];
  const goldenRatio = 0.618033988749895; // 黄金分割比
  const saturation = 75; // 饱和度（%）
  const lightness = 60;  // 明度（%）

  for (let i = 0; i < count; i++) {
    // 每次累加 137.5 度（360 * 0.618 取整）
    const hue = (i * 360 * goldenRatio) % 360;
    colors.push(`hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`);
  }
  return colors;
}

module.exports = {
  generateGoldenColors
}
