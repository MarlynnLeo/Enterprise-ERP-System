import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Title,
  Tooltip
} from 'chart.js'
import { getAppFontFamily } from './typography'
import { getCssTokenValue } from './designTokens'
import { observeChartTheme } from './chartThemeObserver'
import { getInitialChartPixelRatio } from './chartPerformance'

// Use Chart.js lifecycle hooks rather than replacing update/destroy methods.
// Data and tooltip interactions stay live; decorative transitions never run.
const staticDataRenderingPlugin = {
  id: 'erpStaticDataRendering',
  beforeInit(chart) {
    chart.options.animation = false
    const ratio = getInitialChartPixelRatio(chart.config.options.devicePixelRatio)
    if (ratio !== undefined) chart.options.devicePixelRatio = ratio
  },
  beforeUpdate(chart) {
    chart.stop()
    chart.options.animation = false
  }
}

const themeSubscriptions = new WeakMap()
const appliedThemePlugin = {
  id: 'appliedTheme',
  beforeUpdate(chart) {
    chart.options.font = { ...chart.options.font, family: getAppFontFamily() }
  },
  afterInit(chart) {
    themeSubscriptions.set(chart, observeChartTheme(() => {
      if (chart.canvas) chart.update('none')
    }))
  },
  afterDestroy(chart) {
    themeSubscriptions.get(chart)?.()
    themeSubscriptions.delete(chart)
  }
}

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Title,
  Tooltip,
  staticDataRenderingPlugin,
  appliedThemePlugin
)

Chart.defaults.animation = false
Chart.defaults.font.family = getAppFontFamily()
Chart.defaults.color = () => getCssTokenValue('textSecondary')
Chart.defaults.borderColor = () => getCssTokenValue('borderLight')

export { Chart }
export default Chart
