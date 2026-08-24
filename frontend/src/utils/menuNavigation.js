import {
  House,
  DataAnalysis,
  DataLine,
  Calendar,
  Tickets,
  SetUp,
  Warning,
  Goods,
  Document,
  List,
  Box,
  TakeawayBox,
  Files,
  Fold,
  DocumentCopy,
  Van,
  ShoppingBag,
  Money,
  Wallet,
  Timer,
  ArrowRight,
  User,
  UserFilled,
  Lock,
  Menu,
  Collection,
  Setting,
  Tools,
  Connection,
  Monitor,
  Histogram,
  TrendCharts,
  PieChart,
  Grid,
  Share,
  Management,
  OfficeBuilding,
  CreditCard,
  Coin,
  PriceTag,
  DCaret,
  Link,
  Postcard,
  Edit,
  Search,
  Delete,
  Plus,
  Minus,
  Check,
  Close,
  InfoFilled,
  WarningFilled,
  CircleCheck,
  CircleClose,
  QuestionFilled,
  Refresh,
  Upload,
  Download,
  View,
  Hide,
  Expand,
  Operation,
  Switch,
  FullScreen,
  Position,
  Location,
  Compass,
  HomeFilled,
  Memo,
  Notebook,
  Stamp,
  Trophy,
  FirstAidKit,
  Suitcase,
  HelpFilled,
  Sunny,
  Moon,
  Clock,
  Promotion,
  VideoCamera,
  Microphone,
  Aim,
  Ticket,
  Odometer,
  Printer,
  ChatDotRound,
  Avatar,
  Briefcase,
  Sell,
  ShoppingCart,
  RefreshLeft,
  Bell,
  Folder,
  Cpu,
  Right
} from '@element-plus/icons-vue'

const iconMap = {
  'icon-home': House,
  'icon-dashboard': Histogram,
  'icon-data-analysis': DataAnalysis,
  'icon-data-line': DataLine,
  'icon-calendar': Calendar,
  'icon-tickets': Tickets,
  'icon-set-up': SetUp,
  'icon-warning': Warning,
  'icon-goods': Goods,
  'icon-document': Document,
  'icon-list': List,
  'icon-box': Box,
  'icon-takeaway-box': TakeawayBox,
  'icon-files': Files,
  'icon-fold': Fold,
  'icon-document-copy': DocumentCopy,
  'icon-van': Van,
  'icon-shopping-bag': ShoppingBag,
  'icon-money': Money,
  'icon-wallet': Wallet,
  'icon-timer': Timer,
  'icon-time': Timer,
  'icon-arrow-right': ArrowRight,
  'icon-user': User,
  'icon-lock': Lock,
  'icon-menu': Menu,
  'icon-collection': Collection,
  'icon-setting': Setting,
  'icon-tools': Tools,
  'icon-connection': Connection,
  'icon-monitor': Monitor,
  'icon-histogram': Histogram,
  'icon-trend-charts': TrendCharts,
  'icon-pie-chart': PieChart,
  'icon-grid': Grid,
  'icon-share': Share,
  'icon-management': Management,
  'icon-office-building': OfficeBuilding,
  'icon-credit-card': CreditCard,
  'icon-coin': Coin,
  'icon-price-tag': PriceTag,
  'icon-d-caret': DCaret,
  'icon-link': Link,
  'icon-postcard': Postcard,
  'icon-edit': Edit,
  'icon-edit-outline': Edit,
  'icon-search': Search,
  'icon-delete': Delete,
  'icon-plus': Plus,
  'icon-minus': Minus,
  'icon-check': Check,
  'icon-close': Close,
  'icon-info-filled': InfoFilled,
  'icon-warning-filled': WarningFilled,
  'icon-circle-check': CircleCheck,
  'icon-circle-close': CircleClose,
  'icon-question-filled': QuestionFilled,
  'icon-refresh': Refresh,
  'icon-refresh-left': RefreshLeft,
  'icon-upload': Upload,
  'icon-download': Download,
  'icon-view': View,
  'icon-hide': Hide,
  'icon-expand': Expand,
  'icon-operation': Operation,
  'icon-switch': Switch,
  'icon-full-screen': FullScreen,
  'icon-position': Position,
  'icon-location': Location,
  'icon-compass': Compass,
  'icon-home-filled': HomeFilled,
  'icon-memo': Memo,
  'icon-notebook': Notebook,
  'icon-stamp': Stamp,
  'icon-trophy': Trophy,
  'icon-first-aid-kit': FirstAidKit,
  'icon-suitcase': Suitcase,
  'icon-help-filled': HelpFilled,
  'icon-sunny': Sunny,
  'icon-moon': Moon,
  'icon-clock': Clock,
  'icon-promotion': Promotion,
  'icon-video-camera': VideoCamera,
  'icon-microphone': Microphone,
  'icon-aim': Aim,
  'icon-ticket': Ticket,
  'icon-stock': Box,
  'icon-sales': TrendCharts,
  'icon-quality': CircleCheck,
  'icon-data-board': Histogram,
  'icon-odometer': Odometer,
  'icon-printer': Printer,
  'icon-robot': ChatDotRound,
  'icon-customer': Avatar,
  'icon-outbound': Briefcase,
  'icon-sell': Sell,
  'icon-shopping-cart': ShoppingCart,
  'icon-return': RefreshLeft,
  'icon-finished': CircleCheck,
  'icon-order': Tickets,
  'icon-exchange': Switch,
  'icon-quotation': Postcard,
  'icon-user-filled': UserFilled,
  'icon-bell': Bell,
  'icon-folder': Folder,
  'icon-cpu': Cpu,
  'icon-right': Right,
  'icon-chart': PieChart,
  'icon-base': Collection,
  'icon-inventory': Box,
  'icon-material': Goods,
  'icon-bom': Files,
  'icon-supplier': ShoppingBag,
  'icon-category': Collection,
  'icon-unit': Tickets,
  'icon-account': CreditCard,
  'icon-document-checked': Document
}

const toKebabIconName = (value) => {
  return String(value)
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

export const getIconComponent = (iconName) => {
  if (!iconName) return null

  const rawName = String(iconName).trim()
  const normalizedName = toKebabIconName(rawName)
  const lookupKeys = [
    rawName,
    normalizedName,
    rawName.startsWith('icon-') ? rawName : `icon-${normalizedName}`
  ]

  return lookupKeys.map(key => iconMap[key]).find(Boolean) || Document
}

const isFlagEnabled = (value) => value === undefined || value === null || Number(value) !== 0

export const isMenuDisplayable = (menu) => {
  return Boolean(menu) && Number(menu.type) !== 2 && isFlagEnabled(menu.visible) && isFlagEnabled(menu.status)
}

// Normalize the permission response once so recursive menu rendering does not
// repeatedly filter and inspect the complete raw tree on every interaction.
export const prepareMenuTree = (nodes) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return []

  const prepare = (items) => {
    const result = []
    for (const item of items) {
      if (!item || typeof item !== 'object') continue

      const children = Array.isArray(item.children) ? prepare(item.children) : []
      const prepared = {
        ...item,
        path: item.path || '',
        icon: item.icon || '',
        children,
        hasChildren: children.length > 0
      }
      prepared.menuIndex = prepared.hasChildren
        ? `menu-${prepared.id}`
        : (prepared.path || `menu-${prepared.id}`)
      const isVisible = isMenuDisplayable(prepared) &&
        (Boolean(prepared.path) || prepared.hasChildren)

      if (isVisible) result.push(prepared)
    }
    return result
  }

  return prepare(nodes)
}

export const isRouteMatch = (menuPath, currentPath) => {
  if (!menuPath || menuPath === '/') return currentPath === menuPath
  return currentPath === menuPath || currentPath.startsWith(`${menuPath}/`)
}

export const resolveMenuNavigationState = (nodes, currentPath, ancestors = []) => {
  let best = { activePath: currentPath, openeds: [], score: -1 }

  for (const menu of nodes || []) {
    const visibleChildren = menu.children
    const menuHasChildren = menu.hasChildren
    const menuIndex = menu.menuIndex
    const nextAncestors = menuHasChildren ? [...ancestors, menuIndex] : ancestors

    if (menu.path && isRouteMatch(menu.path, currentPath)) {
      const score = menu.path.length
      if (score > best.score) {
        best = {
          activePath: menu.path,
          openeds: ancestors,
          score
        }
      }
    }

    if (menuHasChildren) {
      const childState = resolveMenuNavigationState(visibleChildren, currentPath, nextAncestors)
      if (childState.score > best.score) {
        best = childState
      }
    }
  }

  return best
}

export const buildMenuSearchOptions = (nodes, parentBreadcrumbs = []) => {
  const options = []

  for (const item of nodes || []) {
    if (!item?.name) continue

    const currentBreadcrumbs = [...parentBreadcrumbs, item.name]
    const visibleChildren = item.children

    if (item.path && visibleChildren.length === 0) {
      options.push({
        path: item.path,
        title: item.name,
        breadcrumbs: currentBreadcrumbs,
        icon: getIconComponent(item.icon)
      })
    }

    if (visibleChildren.length > 0) {
      options.push(...buildMenuSearchOptions(visibleChildren, currentBreadcrumbs))
    }
  }

  return options
}
