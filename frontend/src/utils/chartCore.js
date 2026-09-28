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
  appliedThemePlugin
)

Chart.defaults.font.family = getAppFontFamily()
Chart.defaults.color = () => getCssTokenValue('textSecondary')
Chart.defaults.borderColor = () => getCssTokenValue('borderLight')

export { Chart }
export default Chart
