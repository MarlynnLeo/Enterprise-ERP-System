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

export { echarts }
export default echarts
