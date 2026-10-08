// Keep the original defect count even when stock is later repaired or accepted.
export function resolveFinalInspectionResult({ quantity, qualifiedQuantity, unqualifiedQuantity, items }) {
  const total = Number(quantity)
  const good = Number(qualifiedQuantity)
  const bad = Number(unqualifiedQuantity)
  if (![total, good, bad].every(Number.isFinite) || total <= 0 || good < 0 || bad < 0 ||
      Math.abs(good + bad - total) > 0.0001) {
    throw new Error('合格数量与不合格数量之和必须等于检验数量')
  }
  if (!items?.length || items.some(item => !['passed', 'failed'].includes(item.result))) {
    throw new Error('请完成所有检验项目的判定')
  }
  const failures = items.filter(item => item.result === 'failed')
  if (bad > 0 && failures.length === 0) {
    throw new Error('已记录不合格数量，请将对应检验项目标记为不合格并填写不良情况')
  }
  if (bad === 0 && failures.length > 0) {
    throw new Error('检验项目存在不合格项，请核对合格与不合格数量')
  }
  if (good > 0 && failures.some(item => item.isCritical === true || item.isCritical === 1)) {
    throw new Error('关键检验项目不合格时，整批必须判定为不合格，请核对数量')
  }
  return bad === 0 ? 'passed' : good === 0 ? 'failed' : 'partial'
}
