import {
  ArrowDown,
  Back,
  Check,
  Close,
  Cpu,
  DocumentCopy,
  Download,
  InfoFilled,
  Loading,
  Plus,
  Refresh,
  Search,
  SetUp,
  Setting,
  Upload,
  WarningFilled
} from '@element-plus/icons-vue'

const globalElementIcons = {
  ArrowDown,
  Back,
  Check,
  Close,
  Cpu,
  DocumentCopy,
  Download,
  InfoFilled,
  Loading,
  Plus,
  Refresh,
  Search,
  SetUp,
  Setting,
  Upload,
  WarningFilled
}

export function registerElementIcons(app) {
  Object.entries(globalElementIcons).forEach(([name, component]) => {
    app.component(name, component)
  })
}
