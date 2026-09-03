/**
 * 检验测量规则工具。
 *
 * 检验项目的 type 只描述业务分类（performance、visual 等），并不能决定
 * 录入方式。实际录入方式由标准文本和可选的尺寸/公差字段共同决定：
 *   - 能从标准中得到数值约束时，录入实测数值并自动判定；
 *   - 没有数值约束时，录入 √ / ×。
 */

export const QUALITATIVE_MEASUREMENT_OPTIONS = [
  { label: '√', value: '√' },
  { label: '×', value: '×' }
]

const NUMBER_SOURCE = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)'
const UNIT_RE = /^(?:mm|毫米|cm|厘米|m|米|μm|um|微米|in|英寸|n(?:\s*[·.]\s*m)?|kgf?(?:\s*[·.]\s*cm)?|kg|g|克|mg|mpa|pa|kn|mhz|khz|hz|v|伏|a|安|w|瓦|%|百分比|℃|°c|度|hrc|邵氏|只|件|个|pcs|台|套|样本|项)\b/i

const STANDARD_CODE_PREFIX_RE = /(?:gb\s*\/\s*t|iso|iec|en|jis|din|ansi|astm|qc|jb)\s*$/i
const SAMPLING_BEFORE_RE = /(?:每批|每组|每次|抽样数量|取样数量|抽样|取样|抽取|抽检|检验数量|检查数量|检验|检查|样本数量|样本数|抽)\s*(?::\s*)?$/i
// 中文单位后面没有 ASCII word boundary，不能使用 `\b`，否则“抽10只”无法识别。
const SAMPLING_AFTER_RE = /^(?:只|件|个|pcs|台|套|样本|件次|组)(?:\s|$|[,;，；。])/i

function normalizeText(value) {
  return String(value ?? '')
    .replace(/&ge;|&#8805;|&#x2265;/gi, '≥')
    .replace(/&le;|&#8804;|&#x2264;/gi, '≤')
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/，/g, ',')
    .replace(/；/g, ';')
    .replace(/：/g, ':')
    .replace(/＞/g, '>')
    .replace(/＜/g, '<')
    .replace(/≧/g, '≥')
    .replace(/≦/g, '≤')
    .replace(/\s+/g, ' ')
    .trim()
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(number) ? number : null
}

function getField(item, ...names) {
  if (!item || typeof item !== 'object') return undefined
  for (const name of names) {
    if (item[name] !== undefined && item[name] !== null && item[name] !== '') return item[name]
  }
  return undefined
}

function getType(item) {
  return String(getField(item, 'type', 'itemType', 'item_type') ?? '').trim().toLowerCase()
}

/** 保留 type=dimension 的旧语义，同时兼容 API 返回的 snake/camel 字段。 */
export function isDimensionInspectionItem(item = {}) {
  return getType(item) === 'dimension'
}

function getStandardText(itemOrStandard) {
  if (itemOrStandard && typeof itemOrStandard === 'object') {
    return normalizeText(getField(
      itemOrStandard,
      'standard',
      'criteria',
      'requirement',
      'inspectionStandard',
      'inspection_standard'
    ))
  }
  return normalizeText(itemOrStandard)
}

function findNumberTokens(text) {
  const tokens = []
  const matcher = new RegExp(NUMBER_SOURCE, 'g')
  let match
  while ((match = matcher.exec(text)) !== null) {
    const raw = match[0]
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    tokens.push({
      raw,
      value,
      start: match.index,
      end: match.index + raw.length,
      before: text.slice(Math.max(0, match.index - 18), match.index),
      after: text.slice(match.index + raw.length, match.index + raw.length + 18)
    })
  }
  return tokens
}

function hasUnitAfter(text, end) {
  const suffix = text.slice(end).replace(/^\s*/, '')
  return UNIT_RE.test(suffix)
}

function isSamplingToken(token) {
  const before = token.before
  const after = token.after.replace(/^\s*/, '')
  if (!SAMPLING_BEFORE_RE.test(before)) return false
  // “每批抽10只 / 抽样数量:10” both indicate sample quantity even if
  // the unit is omitted from the standard text.
  return SAMPLING_AFTER_RE.test(after) ||
    /(?:数量|数|率)\s*:?\s*$/i.test(before) ||
    /抽\s*$/i.test(before)
}

function isStandardCodeToken(token) {
  const before = token.before.replace(/[\s(\[]+$/, '')
  return STANDARD_CODE_PREFIX_RE.test(before)
}

function getCandidateTokens(text) {
  return findNumberTokens(text).filter((token) => {
    if (isSamplingToken(token) || isStandardCodeToken(token)) return false

    // 日期、版本号和类似 “1/2” 的标准编号不是测量约束。
    const beforeChar = text[token.start - 1] || ''
    const afterChar = text[token.end] || ''
    if (beforeChar === '/' || afterChar === '/') return false
    if (/\d/.test(beforeChar) || /\d/.test(afterChar)) return false
    return true
  })
}

function makeRule({ operator, nominal = null, lowerBound = null, upperBound = null, unit = '', source = 'standard' }) {
  const rounded = (value) => value === null || value === undefined
    ? null
    : Number(Number(value).toFixed(6))
  return {
    mode: 'numeric',
    isNumeric: true,
    operator,
    nominal: rounded(nominal),
    lowerBound: rounded(lowerBound),
    upperBound: rounded(upperBound),
    unit: String(unit || '').trim(),
    source,
    hasRule: lowerBound !== null || upperBound !== null
  }
}

function unitForToken(text, token) {
  const suffix = text.slice(token.end).replace(/^\s*/, '')
  const match = suffix.match(/^([^\s,，;；()（）+\-~～至到之间以上以下]{1,12})/)
  return match ? match[1] : ''
}

function parseExplicitDimensionRule(item) {
  const nominal = toFiniteNumber(getField(item, 'dimensionValue', 'dimension_value'))
  if (nominal === null) return null

  const upperRaw = toFiniteNumber(getField(item, 'toleranceUpper', 'tolerance_upper'))
  const lowerRaw = toFiniteNumber(getField(item, 'toleranceLower', 'tolerance_lower'))
  const upper = upperRaw === null ? 0 : Math.abs(upperRaw)
  const lower = lowerRaw === null ? 0 : Math.abs(lowerRaw)
  const hasTolerance = upper > 0 || lower > 0

  return makeRule({
    operator: hasTolerance ? 'tolerance' : 'eq',
    nominal,
    lowerBound: nominal - lower,
    upperBound: nominal + upper,
    source: 'dimension'
  })
}

function parseComparisonRule(text) {
  // 符号比较，先匹配 >= / <=，避免被单字符规则截断。
  const comparison = text.match(new RegExp(`(?:^|[^\\d])((?:>=|<=|>|<|=|≥|≤))\\s*(${NUMBER_SOURCE})`))
  if (comparison) {
    const operatorText = comparison[1]
    const value = Number(comparison[2])
    const tokenStart = comparison.index + comparison[0].lastIndexOf(comparison[2])
    const token = { start: tokenStart, end: tokenStart + comparison[2].length }
    const unit = unitForToken(text, token)
    if (operatorText === '≥' || operatorText === '>=' || operatorText === '>') {
      return makeRule({ operator: operatorText === '>' ? 'gt' : 'gte', nominal: value, lowerBound: value, upperBound: null, unit })
    }
    if (operatorText === '≤' || operatorText === '<=' || operatorText === '<') {
      return makeRule({ operator: operatorText === '<' ? 'lt' : 'lte', nominal: value, lowerBound: null, upperBound: value, unit })
    }
    return makeRule({ operator: 'eq', nominal: value, lowerBound: value, upperBound: value, unit })
  }

  const keywordComparisons = [
    { pattern: new RegExp(`(不低于|不少于|不小于|至少|最低(?:值)?|下限(?:为)?)[^\\d+-]*(${NUMBER_SOURCE})`, 'i'), operator: 'gte' },
    { pattern: new RegExp(`(不高于|不超过|不大于|至多|最高(?:值)?|上限(?:为)?)[^\\d+-]*(${NUMBER_SOURCE})`, 'i'), operator: 'lte' }
  ]
  for (const candidate of keywordComparisons) {
    const match = text.match(candidate.pattern)
    if (!match) continue
    const value = Number(match[2])
    if (!Number.isFinite(value)) continue
    const start = match.index + match[0].lastIndexOf(match[2])
    const unit = unitForToken(text, { start, end: start + match[2].length })
    return candidate.operator === 'gte'
      ? makeRule({ operator: 'gte', nominal: value, lowerBound: value, upperBound: null, unit })
      : makeRule({ operator: 'lte', nominal: value, lowerBound: null, upperBound: value, unit })
  }

  // “1.5N.m以上/以下”这类后置比较。
  const postComparison = text.match(new RegExp(`(${NUMBER_SOURCE})\\s*(以上|及以上|或以上|以下|及以下|或以下|以内)`))
  if (postComparison) {
    const value = Number(postComparison[1])
    const start = postComparison.index
    const unit = unitForToken(text, { start, end: start + postComparison[1].length })
    const isLower = /以上/.test(postComparison[2])
    return isLower
      ? makeRule({ operator: 'gte', nominal: value, lowerBound: value, upperBound: null, unit })
      : makeRule({ operator: 'lte', nominal: value, lowerBound: null, upperBound: value, unit })
  }

  return null
}

function parseRangeRule(text) {
  const rangePatterns = [
    new RegExp(`(${NUMBER_SOURCE})\\s*(?:~|～|至|到|—|–)\\s*(${NUMBER_SOURCE})`),
    /([0-9]+(?:\.[0-9]+)?)\s*-\s*([0-9]+(?:\.[0-9]+)?)/
  ]
  for (const pattern of rangePatterns) {
    const match = text.match(pattern)
    if (!match) continue
    const left = Number(match[1])
    const right = Number(match[2])
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue
    const start = match.index + match[0].lastIndexOf(match[2])
    const unit = unitForToken(text, { start, end: start + match[2].length })
    return makeRule({
      operator: 'range',
      nominal: (left + right) / 2,
      lowerBound: Math.min(left, right),
      upperBound: Math.max(left, right),
      unit
    })
  }
  return null
}

function parsePlusMinusRule(text) {
  const match = text.match(new RegExp(`(${NUMBER_SOURCE})\\s*(?:±|\\+/-|\\+\\s*[/／]\\s*-|\\+\\s*、\\s*-)\\s*(${NUMBER_SOURCE})`))
  if (!match) return null
  const nominal = Number(match[1])
  const tolerance = Math.abs(Number(match[2]))
  if (!Number.isFinite(nominal) || !Number.isFinite(tolerance)) return null
  const start = match.index + match[0].lastIndexOf(match[2])
  return makeRule({
    operator: 'tolerance',
    nominal,
    lowerBound: nominal - tolerance,
    upperBound: nominal + tolerance,
    unit: unitForToken(text, { start, end: start + match[2].length })
  })
}

function parseSingleNumberRule(text) {
  const candidates = getCandidateTokens(text)
  if (candidates.length === 0) return null

  // 优先选择带单位、带小数或靠近尺寸/性能关键词的数字；这样不会把“抽10只”
  // 当成测量标准，同时能识别“扭矩 1.5”这类没有单位的写法。
  const keywordRe = /(尺寸|长度|宽度|高度|厚度|直径|外径|内径|半径|扭矩|拉力|压力|硬度|电阻|电压|电流|重量|温度|间隙|距离|深度|角度|数量)/i
  const scored = candidates.map((token) => {
    const rawContext = `${token.before} ${token.after}`
    const hasUnit = hasUnitAfter(text, token.end)
    const score = (hasUnit ? 8 : 0) + (token.raw.includes('.') ? 4 : 0) + (keywordRe.test(rawContext) ? 3 : 0)
    return { token, score }
  }).sort((left, right) => right.score - left.score || left.token.start - right.token.start)

  const selected = scored[0].token
  const hasMeaningfulSignal = (
    hasUnitAfter(text, selected.end) ||
    selected.raw.includes('.') ||
    keywordRe.test(`${selected.before} ${selected.after}`) ||
    candidates.length === 1
  )
  if (!hasMeaningfulSignal) return null

  return makeRule({
    operator: 'eq',
    nominal: selected.value,
    lowerBound: selected.value,
    upperBound: selected.value,
    unit: unitForToken(text, selected)
  })
}

/**
 * 解析检验标准。
 * @param {Object|string} itemOrStandard 检验项对象或标准文本
 * @returns {Object} numeric/qualitative 规则
 */
export function parseInspectionStandard(itemOrStandard = {}) {
  const item = itemOrStandard && typeof itemOrStandard === 'object' ? itemOrStandard : null
  const explicitRule = parseExplicitDimensionRule(item)
  if (explicitRule) return explicitRule

  const text = getStandardText(itemOrStandard)
  if (text) {
    const comparisonRule = parseComparisonRule(text)
    if (comparisonRule) return comparisonRule

    const rangeRule = parseRangeRule(text)
    if (rangeRule) return rangeRule

    const plusMinusRule = parsePlusMinusRule(text)
    if (plusMinusRule) return plusMinusRule

    const singleRule = parseSingleNumberRule(text)
    if (singleRule) return singleRule
  }

  // 旧模板中 type=dimension 即使标准文本为空也要求数值录入；保留这一兼容行为。
  if (item && isDimensionInspectionItem(item)) {
    return makeRule({ operator: 'none', source: 'dimension' })
  }

  return {
    mode: 'qualitative',
    isNumeric: false,
    operator: 'qualitative',
    nominal: null,
    lowerBound: null,
    upperBound: null,
    unit: '',
    source: 'standard',
    hasRule: false
  }
}

/** 别名：便于业务代码表达“获取数值规则”。 */
export const getInspectionNumericRule = parseInspectionStandard

export function isNumericInspectionItem(item = {}) {
  return parseInspectionStandard(item).mode === 'numeric'
}

export function getInspectionMeasurementMode(item = {}) {
  return isNumericInspectionItem(item) ? 'numeric' : 'qualitative'
}

function parseActualNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = normalizeText(value).replace(/,/g, '')
  if (!text) return null
  const exact = text.match(new RegExp(`^${NUMBER_SOURCE}$`))
  if (!exact) return null
  const number = Number(exact[0])
  return Number.isFinite(number) ? number : null
}

/** 对一个实测值执行标准比较。 */
export function compareInspectionMeasurement(item, value) {
  const rule = parseInspectionStandard(item)
  if (rule.mode !== 'numeric') {
    return { mode: 'qualitative', value: null, qualified: null, result: '', rule }
  }

  const numericValue = parseActualNumber(value)
  if (numericValue === null) {
    return { mode: 'numeric', value: null, qualified: null, result: '', rule }
  }

  let qualified = null
  switch (rule.operator) {
    case 'gte':
      qualified = numericValue >= rule.lowerBound
      break
    case 'gt':
      qualified = numericValue > rule.lowerBound
      break
    case 'lte':
      qualified = numericValue <= rule.upperBound
      break
    case 'lt':
      qualified = numericValue < rule.upperBound
      break
    case 'eq':
      qualified = numericValue === rule.nominal
      break
    case 'range':
    case 'tolerance':
      qualified = numericValue >= rule.lowerBound && numericValue <= rule.upperBound
      break
    case 'none':
      // type=dimension 但没有标准约束时仍允许数值录入，交由检验员确认结果。
      qualified = null
      break
    default:
      qualified = null
  }

  return {
    mode: 'numeric',
    value: numericValue,
    qualified,
    result: qualified === true ? 'passed' : qualified === false ? 'failed' : '',
    rule
  }
}

/** 批量比较多个样本。任何无效输入都会保持待判定，避免误报合格。 */
export function evaluateInspectionMeasurements(item, values = []) {
  const rule = parseInspectionStandard(item)
  const enteredValues = (Array.isArray(values) ? values : [values])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')

  if (rule.mode !== 'numeric') {
    return { mode: 'qualitative', result: '', qualified: null, values: [], evaluations: [], rule }
  }
  if (enteredValues.length === 0) {
    return { mode: 'numeric', result: '', qualified: null, values: [], evaluations: [], rule }
  }

  const evaluations = enteredValues.map((value) => compareInspectionMeasurement(item, value))
  const valuesAreValid = evaluations.every((evaluation) => evaluation.value !== null)
  const comparable = evaluations.filter((evaluation) => evaluation.qualified !== null)
  let result = ''
  let qualified = null
  if (valuesAreValid && comparable.length === evaluations.length) {
    qualified = comparable.every((evaluation) => evaluation.qualified === true)
    result = qualified ? 'passed' : 'failed'
  }

  return {
    mode: 'numeric',
    result,
    qualified,
    values: evaluations.map((evaluation) => evaluation.value),
    evaluations,
    rule
  }
}

export function formatInspectionMeasurement(item, value, emptyText = '{无}') {
  if (value === null || value === undefined || value === '') return emptyText
  return isNumericInspectionItem(item) ? value : normalizeQualitativeMeasurementValue(value)
}

export function normalizeQualitativeMeasurementValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return ''
  const numericValue = Number(normalized)
  if (Number.isFinite(numericValue) && numericValue === 1) return '√'
  if (Number.isFinite(numericValue) && numericValue === 0) return '×'
  if (['√', 'ok', 'pass', 'passed', 'yes', 'true', '1', '合格'].includes(normalized)) return '√'
  if (['×', 'x', 'ng', 'fail', 'failed', 'no', 'false', '0', '不合格'].includes(normalized)) return '×'
  return String(value).trim()
}

export function summarizeQualitativeMeasurements(values = []) {
  const normalizedValues = values
    .map(normalizeQualitativeMeasurementValue)
    .filter(Boolean)
  const passed = normalizedValues.filter((value) => value === '√').length
  const failed = normalizedValues.filter((value) => value === '×').length

  return {
    passed,
    failed,
    total: normalizedValues.length,
    text: normalizedValues.length === 0 ? '' : `√${passed} / ×${failed}`,
    result: failed > 0 ? 'failed' : normalizedValues.length > 0 ? 'passed' : ''
  }
}
