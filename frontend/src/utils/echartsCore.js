import * as echarts from 'echarts/core'
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

echarts.use([
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
echarts.registerPreprocessor((option) => {
  option.textStyle = { ...option.textStyle, fontFamily: getAppFontFamily() }
})

export { echarts }
export default echarts
