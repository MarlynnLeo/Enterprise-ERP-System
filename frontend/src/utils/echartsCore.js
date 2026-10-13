import * as echartsCore from 'echarts/core'
import {
  BarChart,
  CustomChart,
  GaugeChart,
  LineChart,
  PieChart,
  SankeyChart,
  ScatterChart
} from 'echarts/charts'
import {
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { LegacyGridContainLabel } from 'echarts/features'
import { getAppFontFamily } from './typography'
import { disableEchartsMotion, getInitialChartPixelRatio } from './chartPerformance'

echartsCore.use([
  BarChart,
  CustomChart,
  GaugeChart,
  LineChart,
  PieChart,
  SankeyChart,
  ScatterChart,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
  CanvasRenderer,
  LegacyGridContainLabel
])

// Canvas 文本不继承页面 CSS，所有图表通过全局 textStyle 继承统一正文字体。
echartsCore.registerPreprocessor((option) => {
  option.textStyle = { ...option.textStyle, fontFamily: getAppFontFamily() }
  disableEchartsMotion(option)
})

// ECharts exposes DPR on init, not resize. Keep the real instance and its
// public API intact; a later preference change applies to the next canvas.
const echarts = Object.freeze({
  ...echartsCore,
  init(container, theme, options) {
    const ratio = getInitialChartPixelRatio(options?.devicePixelRatio)
    return echartsCore.init(container, theme, ratio === undefined
      ? options
      : { ...options, devicePixelRatio: ratio })
  }
})

export { echarts }
export default echarts
