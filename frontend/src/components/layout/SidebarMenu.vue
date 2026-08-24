<template>
  <ul class="app-menu-list" :class="`is-depth-${depth}`" role="menu">
  <template v-for="menu in menus" :key="menu.id">
    <li
      v-if="menu.menuIndex"
      class="app-menu-node"
      :class="{ 'is-branch': menu.hasChildren, 'is-opened': menu.hasChildren && isOpen(menu), 'is-active': isActive(menu) }"
      role="none"
    >
      <button
        v-if="menu.hasChildren"
        type="button"
        class="app-menu-item app-menu-title"
        :class="{ 'is-opened': isOpen(menu), 'is-active-path': isActivePath(menu) }"
        role="menuitem"
        :aria-expanded="isOpen(menu) ? 'true' : 'false'"
        :title="mini ? getMenuLabel(menu) : undefined"
        @click.stop="toggleMenu(menu)"
      >
        <el-icon v-if="menu.icon" class="app-menu-icon"><component :is="getIconComponent(menu.icon)" /></el-icon>
        <span class="app-menu-label">{{ getMenuLabel(menu) }}</span>
        <el-icon class="app-menu-arrow"><component :is="getIconComponent('icon-arrow-right')" /></el-icon>
      </button>
      <div v-if="menu.hasChildren && isOpen(menu)" class="app-menu-children is-open" role="group">
        <SidebarMenu
          :menus="menu.children"
          :open-chain="openChain"
          :active-path="activePath"
          :parent-chain="parentChain.concat(menu.menuIndex)"
          :depth="depth + 1"
          :mini="mini"
          @toggle="forwardToggle"
          @navigate="navigate"
        />
      </div>
      <button
        v-if="!menu.hasChildren && menu.path"
        type="button"
        class="app-menu-item app-menu-link"
        :class="{ 'is-active': isActive(menu) }"
        role="menuitem"
        :title="mini ? getMenuLabel(menu) : undefined"
        @click.stop="navigate(menu.path)"
      >
        <el-icon v-if="menu.icon" class="app-menu-icon"><component :is="getIconComponent(menu.icon)" /></el-icon>
        <span class="app-menu-label">{{ getMenuLabel(menu) }}</span>
      </button>
    </li>
  </template>
  </ul>
</template>
<script setup>
import { useI18n } from 'vue-i18n'
import {
  getIconComponent
} from '../../utils/menuNavigation'
defineOptions({
  name: 'SidebarMenu' // 递归组件需要名称
})
const props = defineProps({
  menus: {
    type: Array,
    default: () => []
  },
  openChain: { type: Array, default: () => [] },
  activePath: { type: String, default: '' },
  parentChain: { type: Array, default: () => [] },
  depth: { type: Number, default: 0 },
  mini: { type: Boolean, default: false }
})
const emit = defineEmits(['toggle', 'navigate'])

const { t } = useI18n()

const isOpen = (menu) => props.openChain.includes(menu.menuIndex)
const isActive = (menu) => Boolean(menu.path && props.activePath && menu.path === props.activePath)
const isActivePath = (menu) => isOpen(menu) && Boolean(props.activePath)
const toggleMenu = (menu) => emit('toggle', menu.menuIndex, props.parentChain)
const navigate = (path) => path && emit('navigate', path)
const forwardToggle = (index, parentChain) => emit('toggle', index, parentChain)

/**
 * 菜单路径到 i18n 翻译 key 的映射表
 * 根据数据库 menus 表的 path 字段，映射到 locales 文件中的 menu.* key
 * 当用户切换语言时，菜单名称会自动随之改变
 */
const pathToI18nKey = {
  // 一级模块菜单
  '/production': 'menu.production',
  '/basedata': 'menu.baseData',
  '/inventory': 'menu.inventory',
  '/purchase': 'menu.purchase',
  '/sales': 'menu.sales',
  '/system': 'menu.system',
  '/quality': 'menu.quality',
  '/finance': 'menu.finance',
  '/equipment': 'menu.equipment',
  '/hr': 'menu.hr',

  // 数据概览
  '/dataoverview/production': 'menu.productionBoard',
  '/dataoverview/inventory': 'menu.inventoryBoard',
  '/dataoverview/sales': 'menu.salesBoard',
  '/dataoverview/finance': 'menu.financeBoard',
  '/dataoverview/quality': 'menu.qualityBoard',
  '/dataoverview/purchase': 'menu.purchaseBoard',

  // 生产管理
  '/production/plan': 'menu.productionPlan',
  '/production/task': 'menu.productionTask',
  '/production/process': 'menu.productionProcess',
  '/production/report': 'menu.productionReport',
  '/production/equipment-monitoring': 'menu.equipmentMonitoring',
  '/production/material-shortage': 'menu.materialShortage',
  '/production/material-readiness': 'menu.materialReadiness',
  '/production/mrp': 'menu.mrpPlanning',
  '/production/data-view': 'menu.productionDataView',
  '/production/gantt': 'menu.productionGantt',
  '/production/calendar': 'menu.productionCalendar',
  '/production/anomaly': 'menu.productionAnomaly',
  '/production/work-stations': 'menu.workStations',
  '/production/process-routes': 'menu.processRoutes',
  '/production/assembly-board': 'menu.assemblyBoard',

  // 基础数据
  '/basedata/materials': 'menu.materials',
  '/basedata/boms': 'menu.boms',
  '/basedata/customers': 'menu.customers',
  '/basedata/suppliers': 'menu.suppliers',
  '/basedata/categories': 'menu.categories',
  '/basedata/units': 'menu.units',
  '/basedata/locations': 'menu.locations',
  '/basedata/process-templates': 'menu.processTemplates',
  '/basedata/product-categories': 'menu.productCategories',
  '/basedata/ecn': 'menu.ecnManagement',

  // 库存管理
  '/inventory/stock': 'menu.stock',
  '/inventory/inbound': 'menu.inbound',
  '/inventory/outbound': 'menu.outbound',
  '/inventory/transfer': 'menu.transfer',
  '/inventory/check': 'menu.check',
  '/inventory/report': 'menu.inventoryReport',
  '/inventory/transaction': 'menu.transaction',
  '/inventory/manual-transaction': 'menu.manualTransaction',
  '/inventory/year-end': 'menu.yearEnd',

  // 采购管理
  '/purchase/requisitions': 'menu.requisitions',
  '/purchase/orders': 'menu.orders',
  '/purchase/receipts': 'menu.receipts',
  '/purchase/returns': 'menu.returns',
  '/purchase/processing': 'menu.processing',
  '/purchase/processing-receipts': 'menu.processingReceipts',
  '/purchase/history': 'menu.purchaseHistory',

  // 销售管理
  '/sales/orders': 'menu.salesOrders',
  '/sales/outbound': 'menu.salesOutbound',
  '/sales/returns': 'menu.salesReturns',
  '/sales/exchanges': 'menu.exchanges',
  '/sales/quotations': 'menu.quotations',
  '/sales/packing-lists': 'menu.packingLists',
  '/sales/delivery-stats': 'menu.deliveryStats',
  '/sales/contracts': 'menu.contracts',

  // 质量管理
  '/quality/incoming': 'menu.incoming',
  '/quality/process': 'menu.processInspection',
  '/quality/first-article': 'menu.firstArticle',
  '/quality/final': 'menu.final',
  '/quality/templates': 'menu.templates',
  '/quality/traceability': 'menu.traceability',
  '/quality/nonconforming': 'menu.nonconforming',
  '/quality/8d-reports': 'menu.eightDReport',
  '/quality/aql-standards': 'menu.aqlStandards',
  '/quality/replacement-orders': 'menu.replacementOrders',
  '/quality/rework-tasks': 'menu.reworkTasks',
  '/quality/scrap-records': 'menu.scrapRecords',
  '/quality/statistics': 'menu.qualityStatistics',
  '/quality/gauges': 'menu.gaugeManagement',
  '/quality/spc': 'menu.spcControlChart',
  '/quality/supplier-quality': 'menu.supplierQuality',

  // 设备管理
  '/equipment/list': 'menu.equipmentList',
  '/equipment/maintenance': 'menu.maintenance',
  '/equipment/inspection': 'menu.inspection',
  '/equipment/status': 'menu.equipmentStatus',

  // 人力资源
  '/hr/employees': 'menu.employees',
  '/hr/attendance': 'menu.attendance',
  '/hr/salary': 'menu.salary',
  '/hr/performance': 'menu.performance',

  // 系统管理
  '/system/users': 'menu.users',
  '/system/departments': 'menu.departments',
  '/system/permissions': 'menu.permissions',
  '/system/print': 'menu.print',
  '/system/notifications': 'menu.notifications',
  '/system/notification-rules': 'menu.notificationRules',
  '/system/business-types': 'menu.businessTypes',
  '/system/technical-communication': 'menu.technicalCommunication',
  '/system/workflow': 'menu.workflow',
  '/system/coding-rules': 'menu.codingRules',
  '/system/documents': 'menu.documents',
  '/system/business-alerts': 'menu.businessAlerts',

  // 财务管理 - 总账
  '/finance/gl/accounts': 'menu.accounts',
  '/finance/gl/entries': 'menu.entries',
  '/finance/gl/periods': 'menu.periods',
  '/finance/gl/trial-balance': 'menu.trialBalance',
  '/finance/gl/period-closing': 'menu.periodClosing',
  '/finance/gl/opening-balances': 'menu.openingBalances',
  '/finance/gl/entries/receipt': 'menu.entries',
  '/finance/gl/entries/payment': 'menu.entries',
  '/finance/gl/entries/transfer': 'menu.entries',
  '/finance/gl/entries/general': 'menu.entries',

  // 财务管理 - 应收
  '/finance/ar/invoices': 'menu.arInvoices',
  '/finance/ar/receipts': 'menu.receiptsManagement',
  '/finance/ar/settlement': 'menu.arSettlement',
  '/finance/ar/aging': 'menu.arAging',

  // 财务管理 - 应付
  '/finance/ap/invoices': 'menu.apInvoices',
  '/finance/ap/payments': 'menu.payments',
  '/finance/ap/settlement': 'menu.apSettlement',
  '/finance/ap/three-way-match': 'menu.apThreeWayMatch',
  '/finance/ap/aging': 'menu.apAging',

  // 财务管理 - 固定资产
  '/finance/assets/list': 'menu.assets',
  '/finance/assets/categories': 'menu.assetCategories',
  '/finance/assets/depreciation': 'menu.depreciation',
  '/finance/assets/cip': 'menu.assetCIP',
  '/finance/assets/inventory': 'menu.assetInventory',
  '/finance/assets/reports': 'menu.assetReports',

  // 财务管理 - 出纳
  '/finance/cash': 'menu.cashierManagement',
  '/finance/cash/accounts': 'menu.bankAccounts',
  '/finance/cash/bank-transactions': 'menu.bankTransactions',
  '/finance/cash/cash-transactions': 'menu.cashTransactions',
  '/finance/cash/reconciliation': 'menu.reconciliation',

  // 财务管理 - 报表
  '/finance/reports/balance-sheet': 'menu.balanceSheet',
  '/finance/reports/income-statement': 'menu.incomeStatement',
  '/finance/reports/cash-flow': 'menu.cashFlow',
  '/finance/reports/standard-cash-flow': 'menu.standardCashFlow',

  // 财务管理 - 自动化/税务/预算/成本/费用/定价/设置
  // 自动化已并入设置页；保留旧 path 映射以免菜单缓存未刷新时 i18n 缺失
  '/finance/automation': 'menu.financeAutomation',
  '/finance/settings?tab=automation': 'menu.financeAutomation',
  '/finance/tax/invoices': 'menu.taxInvoices',
  '/finance/tax/returns': 'menu.taxReturns',
  '/finance/tax/account-config': 'menu.taxAccountConfig',
  '/finance/budget/list': 'menu.budgetList',
  '/finance/budget/edit': 'menu.budgetManagement',
  '/finance/budget/execution': 'menu.budgetExecution',
  '/finance/budget/ai': 'menu.budgetAI',
  '/finance/cost/dashboard': 'menu.costDashboard',
  '/finance/cost/standard': 'menu.standardCost',
  '/finance/cost/actual': 'menu.actualCost',
  '/finance/cost/variance': 'menu.costVariance',
  '/finance/cost/settings': 'menu.costSettings',
  '/finance/cost/center': 'menu.costCenter',
  '/finance/cost/ledger': 'menu.costLedger',
  '/finance/cost/profitability': 'menu.profitability',
  '/finance/cost/abc': 'menu.activityBasedCosting',
  '/finance/cost/versions': 'menu.standardCost',
  '/finance/expenses': 'menu.expenses',
  '/finance/expenses/categories': 'menu.expenseCategories',
  '/finance/pricing': 'menu.productPricing',
  '/finance/settings': 'menu.financeSettings',
  '/finance/settings/exchange-rates': 'menu.exchangeRates'
}

/**
 * 获取菜单的翻译后显示名称
 * 优先根据 path 查找 i18n key，找不到则回退显示数据库原始 name
 */
const getMenuLabel = (menu) => {
  // 1. 尝试通过 path 查找映射
  if (menu.path && pathToI18nKey[menu.path]) {
    return t(pathToI18nKey[menu.path])
  }

  // 2. 对于没有 path 的父级菜单（如"数据概览"、"总账"等分组节点），
  //    尝试根据 permission 匹配
  if (menu.permission) {
    const permissionMap = {
      'dataoverview': 'menu.dataOverview',
      'finance:gl': 'menu.entries',
      'finance:ar': 'menu.arInvoices',
      'finance:ap': 'menu.apInvoices',
      'finance:assets': 'menu.assets',
      'finance:cash': 'menu.cashierManagement',
      'finance:reports': 'menu.balanceSheet',
      'finance:tax': 'menu.taxManagement',
      'finance:budgets': 'menu.budgetManagement',
      'finance:cost': 'menu.costAccounting',
      'finance:expenses': 'menu.expenses'
    }
    if (permissionMap[menu.permission]) {
      return t(permissionMap[menu.permission])
    }
  }

  // 3. 回退：直接返回数据库原始名称
  return menu.name
}

</script>
