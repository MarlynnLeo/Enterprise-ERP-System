import { getPerformanceMode } from './performanceMode'

/**
 * ERP charts present data immediately, including updates and hover feedback.
 * Decorative motion is disabled on every device, so changing performance
 * preferences never needs to recreate a chart or replace its instance methods.
 * Pixel density is chosen only when a canvas is created; keep existing chart
 * data, zoom, selection and resolution intact when the preference changes.
 */
export function getInitialChartPixelRatio(requestedRatio) {
  const mode = getPerformanceMode()
  if (!mode.lowEnd && !mode.saveData) return requestedRatio
  const ratio = Number(requestedRatio)
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(ratio, 1) : 1
}

const asArray = value => Array.isArray(value) ? value : value ? [value] : []
const localAnimationOptions = ['axisPointer', 'markPoint', 'markLine', 'markArea']
const componentOptions = [
  'series', 'graphic', 'xAxis', 'yAxis', 'angleAxis', 'radiusAxis',
  'singleAxis', 'radar', 'geo', 'axisPointer', 'tooltip'
]

function disableMotion(option) {
  if (!option || typeof option !== 'object') return
  option.animation = false
  option.animationDuration = 0
  option.animationDurationUpdate = 0
  option.animationDelay = 0
  option.animationDelayUpdate = 0
  option.stateAnimation = { ...option.stateAnimation, duration: 0 }
  for (const key of localAnimationOptions) asArray(option[key]).forEach(disableMotion)
  for (const tooltip of asArray(option.tooltip)) {
    disableMotion(tooltip)
    tooltip.transitionDuration = 0
  }
}

function disableGraphicMotion(element) {
  if (!element || typeof element !== 'object') return
  for (const key of ['enterAnimation', 'updateAnimation', 'leaveAnimation']) {
    element[key] = { ...element[key], duration: 0, delay: 0 }
  }
  // ECharts' graphic removal bypasses animation:false when leaveTo exists;
  // zrender would then supply its own 500 ms default. Static removal must not
  // register a leave target, including targets nested in shape/style/extra.
  for (const target of [element, element.shape, element.style, element.extra]) {
    if (target && typeof target === 'object') delete target.leaveTo
  }
  for (const keyframe of asArray(element.keyframeAnimation)) {
    if (!keyframe || typeof keyframe !== 'object') continue
    keyframe.duration = 0
    keyframe.delay = 0
    keyframe.loop = false
  }
  asArray(element.children).forEach(disableGraphicMotion)
  disableGraphicMotion(element.clipPath)
}

export function disableEchartsMotion(option) {
  // ECharts calls preprocessors with a clone of the submitted options. Only
  // inspect configuration nodes: walking series.data would tax large charts.
  disableMotion(option)
  for (const key of componentOptions) asArray(option[key]).forEach(disableMotion)
  for (const tooltip of asArray(option.tooltip)) tooltip.transitionDuration = 0
  for (const graphic of asArray(option.graphic)) {
    asArray(graphic.elements).forEach(disableGraphicMotion)
  }
}
