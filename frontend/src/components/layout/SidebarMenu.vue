<template>
  <!--
    A single flat list is intentional. The previous recursive v-if tree
    destroyed and recreated every descendant on each click. We keep branches
    that have been opened in the DOM and only toggle their `hidden` state;
    repeat expand/collapse operations therefore reuse the same VNodes.
  -->
  <ul class="app-menu-list" role="menu">
    <li
      v-for="item in renderedItems"
      :key="item.key"
      v-memo="[item.key, item.open, item.active, item.activePath, item.visible, item.label, item.icon, mini]"
      class="app-menu-node"
      :class="{
        'is-branch': item.menu.hasChildren,
        'is-opened': item.menu.hasChildren && item.open,
        'is-active': item.active
      }"
      :data-depth="item.depth"
      :hidden="!item.visible"
      :aria-hidden="item.visible ? undefined : 'true'"
      role="none"
    >
      <button
        v-if="item.menu.hasChildren"
        type="button"
        class="app-menu-item app-menu-title"
        :class="{ 'is-opened': item.open, 'is-active-path': item.activePath }"
        role="menuitem"
        :aria-level="item.depth + 1"
        :aria-expanded="item.open ? 'true' : 'false'"
        :tabindex="item.visible ? 0 : -1"
        :title="mini ? item.label : undefined"
        @click.stop="toggleMenu(item)"
      >
        <el-icon v-if="item.icon" class="app-menu-icon"><component :is="item.icon" /></el-icon>
        <span class="app-menu-label">{{ item.label }}</span>
        <el-icon class="app-menu-arrow"><component :is="arrowIcon" /></el-icon>
      </button>

      <button
        v-else-if="item.menu.path"
        type="button"
        class="app-menu-item app-menu-link"
        :class="{ 'is-active': item.active }"
        role="menuitem"
        :aria-level="item.depth + 1"
        :aria-current="item.active ? 'page' : undefined"
        :tabindex="item.visible ? 0 : -1"
        :title="mini ? item.label : undefined"
        @click.stop="navigate(item.menu.path)"
      >
        <el-icon v-if="item.icon" class="app-menu-icon"><component :is="item.icon" /></el-icon>
        <span class="app-menu-label">{{ item.label }}</span>
      </button>
    </li>
  </ul>
</template>

<script setup>
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getIconComponent } from '../../utils/menuIcons'
import { isRouteMatch } from '../../utils/menuTree'

defineOptions({ name: 'SidebarMenu' })

const props = defineProps({
  menus: { type: Array, default: () => [] },
  openChain: { type: Array, default: () => [] },
  activePath: { type: String, default: '' },
  mini: { type: Boolean, default: false }
})

const emit = defineEmits(['toggle', 'navigate'])
const { t } = useI18n()

const arrowIcon = getIconComponent('icon-arrow-right')
const mountedBranches = shallowRef(new Set())

const pathToI18nKey = {
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
  '/dataoverview/production': 'menu.productionBoard',
  '/dataoverview/inventory': 'menu.inventoryBoard',
  '/dataoverview/sales': 'menu.salesBoard',
  '/dataoverview/finance': 'menu.financeBoard',
  '/dataoverview/quality': 'menu.qualityBoard',
  '/dataoverview/purchase': 'menu.purchaseBoard',
  '/production/plan': 'menu.productionPlan',
  '/production/task': 'menu.productionTask',
  '/production/process': 'menu.productionProcess',
  '/production/report': 'menu.productionReport',
  '/production/equipment-monitoring': 'menu.equipmentMonitoring',
  '/production/material-shortage': 'menu.materialShortage',
  '/production/material-readiness': 'menu.materialReadiness',
  '/production/data-view': 'menu.productionDataView',
  '/production/gantt': 'menu.productionGantt',
  '/production/calendar': 'menu.productionCalendar',
  '/production/anomaly': 'menu.productionAnomaly',
  '/production/work-stations': 'menu.workStations',
  '/production/process-routes': 'menu.processRoutes',
  '/production/assembly-board': 'menu.assemblyBoard',
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
  '/inventory/stock': 'menu.stock',
  '/inventory/inbound': 'menu.inbound',
  '/inventory/outbound': 'menu.outbound',
  '/inventory/transfer': 'menu.transfer',
  '/inventory/check': 'menu.check',
  '/inventory/report': 'menu.inventoryReport',
  '/inventory/transaction': 'menu.transaction',
  '/inventory/manual-transaction': 'menu.manualTransaction',
  '/inventory/year-end': 'menu.yearEnd',
  '/purchase/requisitions': 'menu.requisitions',
  '/purchase/orders': 'menu.orders',
  '/purchase/receipts': 'menu.receipts',
  '/purchase/returns': 'menu.returns',
  '/purchase/processing': 'menu.processing',
  '/purchase/processing-receipts': 'menu.processingReceipts',
  '/purchase/history': 'menu.purchaseHistory',
  '/sales/orders': 'menu.salesOrders',
  '/sales/outbound': 'menu.salesOutbound',
  '/sales/returns': 'menu.salesReturns',
  '/sales/exchanges': 'menu.exchanges',
  '/sales/quotations': 'menu.quotations',
  '/sales/packing-lists': 'menu.packingLists',
  '/sales/delivery-stats': 'menu.deliveryStats',
  '/sales/contracts': 'menu.contracts',
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
  '/equipment/list': 'menu.equipmentList',
  '/equipment/maintenance': 'menu.maintenance',
  '/equipment/inspection': 'menu.inspection',
  '/equipment/status': 'menu.equipmentStatus',
  '/hr/employees': 'menu.employees',
  '/hr/attendance': 'menu.attendance',
  '/hr/salary': 'menu.salary',
  '/hr/performance': 'menu.performance',
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
  '/finance/ar/invoices': 'menu.arInvoices',
  '/finance/ar/receipts': 'menu.receiptsManagement',
  '/finance/ar/settlement': 'menu.arSettlement',
  '/finance/ar/aging': 'menu.arAging',
  '/finance/ap/invoices': 'menu.apInvoices',
  '/finance/ap/payments': 'menu.payments',
  '/finance/ap/settlement': 'menu.apSettlement',
  '/finance/ap/three-way-match': 'menu.apThreeWayMatch',
  '/finance/ap/aging': 'menu.apAging',
  '/finance/assets/list': 'menu.assets',
  '/finance/assets/categories': 'menu.assetCategories',
  '/finance/assets/depreciation': 'menu.depreciation',
  '/finance/assets/cip': 'menu.assetCIP',
  '/finance/assets/inventory': 'menu.assetInventory',
  '/finance/assets/reports': 'menu.assetReports',
  '/finance/cash': 'menu.cashierManagement',
  '/finance/cash/accounts': 'menu.bankAccounts',
  '/finance/cash/bank-transactions': 'menu.bankTransactions',
  '/finance/cash/cash-transactions': 'menu.cashTransactions',
  '/finance/cash/reconciliation': 'menu.reconciliation',
  '/finance/reports/balance-sheet': 'menu.balanceSheet',
  '/finance/reports/income-statement': 'menu.incomeStatement',
  '/finance/reports/cash-flow': 'menu.cashFlow',
  '/finance/reports/standard-cash-flow': 'menu.standardCashFlow',
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

const permissionToI18nKey = {
  dataoverview: 'menu.dataOverview',
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

const getMenuLabel = (menu) => {
  const key = menu.path && pathToI18nKey[menu.path]
  if (key) return t(key)
  const permissionKey = menu.permission && permissionToI18nKey[menu.permission]
  return permissionKey ? t(permissionKey) : menu.name
}

const openSet = computed(() => new Set(props.openChain))

const branchIndexes = computed(() => {
  const indexes = new Set()
  const walk = (nodes) => {
    for (const menu of nodes || []) {
      if (!menu.hasChildren) continue
      walk(menu.children)
      if (
        (menu.path && isRouteMatch(menu.path, props.activePath)) ||
        menu.children.some((child) => {
          if (child.path && isRouteMatch(child.path, props.activePath)) return true
          return child.hasChildren && indexes.has(child.menuIndex)
        })
      ) {
        indexes.add(menu.menuIndex)
      }
    }
  }
  walk(props.menus)
  return indexes
})

const allBranchIndexes = computed(() => {
  const indexes = new Set()
  const walk = (nodes) => {
    for (const menu of nodes || []) {
      if (!menu.hasChildren) continue
      indexes.add(menu.menuIndex)
      walk(menu.children)
    }
  }
  walk(props.menus)
  return indexes
})

const syncMountedBranches = (chain = props.openChain) => {
  const validIndexes = allBranchIndexes.value
  const next = new Set(
    [...mountedBranches.value].filter((index) => validIndexes.has(index))
  )
  for (const index of chain || []) {
    if (validIndexes.has(index)) next.add(index)
  }
  mountedBranches.value = next
}

watch(() => props.menus, () => syncMountedBranches(), { immediate: true })
watch(() => props.openChain.join('\u0000'), () => syncMountedBranches())

const renderedItems = computed(() => {
  const items = []
  const opened = openSet.value
  const mounted = mountedBranches.value
  const activeBranches = branchIndexes.value

  const walk = (nodes, depth, parentChain, parentVisible) => {
    for (const menu of nodes || []) {
      const isBranch = Boolean(menu.hasChildren)
      const isOpen = isBranch && opened.has(menu.menuIndex)
      const active = Boolean(menu.path && menu.path === props.activePath)
      const activePath = isBranch && activeBranches.has(menu.menuIndex)

      items.push({
        key: `${menu.menuIndex}:${menu.id ?? depth}`,
        menu,
        depth,
        parentChain,
        open: isOpen,
        active,
        activePath,
        visible: parentVisible,
        label: getMenuLabel(menu),
        icon: menu.icon ? getIconComponent(menu.icon) : null
      })

      // Keep a previously opened subtree mounted. `hidden` removes it from
      // layout and accessibility while preserving its VNodes for next time.
      if (isBranch && (isOpen || mounted.has(menu.menuIndex))) {
        walk(
          menu.children,
          depth + 1,
          parentChain.concat(menu.menuIndex),
          parentVisible && isOpen && !props.mini
        )
      }
    }
  }

  walk(props.menus, 0, [], true)
  return items
})

const toggleMenu = (item) => {
  if (item.menu.hasChildren && !item.open) {
    const next = new Set(mountedBranches.value)
    next.add(item.menu.menuIndex)
    mountedBranches.value = next
  }
  emit('toggle', item.menu.menuIndex, item.parentChain)
}

const navigate = (path) => {
  if (path) emit('navigate', path)
}
</script>
