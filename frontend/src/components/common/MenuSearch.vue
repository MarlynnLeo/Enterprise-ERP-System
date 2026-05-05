<template>
  <div class="menu-search">
    <el-tooltip content="搜索菜单 (Ctrl+K)" placement="bottom" :show-after="500">
      <div class="search-trigger" @click="openSearch">
        <el-icon><Search /></el-icon>
      </div>
    </el-tooltip>

    <el-dialog
      v-model="visible"
      :show-close="false"
      class="search-dialog"
      width="600px"
      append-to-body
      @opened="onOpened"
      @closed="onClosed"
    >
      <div class="search-input-wrapper">
        <el-input
          ref="inputRef"
          v-model="keyword"
          placeholder="搜索菜单..."
          size="large"
          clearable
          @input="handleSearch"
          @keydown.down.prevent="navigateOptions('next')"
          @keydown.up.prevent="navigateOptions('prev')"
          @keydown.enter.prevent="selectActive"
        >
          <template #prefix>
            <el-icon class="search-icon"><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <div class="search-results" v-if="keyword">
        <div v-if="filteredOptions.length === 0" class="no-results">
          <el-empty description="未找到相关菜单" :image-size="60" />
        </div>
        <div v-else class="results-list">
          <div
            v-for="(item, index) in filteredOptions"
            :key="item.path"
            class="result-item"
            :class="{ active: activeIndex === index }"
            @click="handleSelect(item)"
            @mouseenter="activeIndex = index"
          >
            <div class="item-icon">
              <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
              <el-icon v-else><Menu /></el-icon>
            </div>
            <div class="item-content">
              <div class="item-title">{{ item.title }}</div>
              <div class="item-path">
                <span v-for="(crumb, idx) in item.breadcrumbs" :key="idx">
                  {{ crumb }}
                  <el-icon v-if="idx < item.breadcrumbs.length - 1" class="separator"><ArrowRight /></el-icon>
                </span>
              </div>
            </div>
            <div class="item-action">
              <el-icon><Right /></el-icon>
            </div>
          </div>
        </div>
      </div>
      
      <div class="search-footer">
        <div class="key-hint">
          <span class="key">↑</span>
          <span class="key">↓</span>
          <span>选择</span>
        </div>
        <div class="key-hint">
          <span class="key">Enter</span>
          <span>确认</span>
        </div>
        <div class="key-hint">
          <span class="key">Esc</span>
          <span>关闭</span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { 
  Search, Menu, ArrowRight, Right
} from '@element-plus/icons-vue'

const router = useRouter()
const { t } = useI18n()

const visible = ref(false)
const keyword = ref('')
const activeIndex = ref(0)
const inputRef = ref(null)

// 菜单数据定义
const menuStructure = [
  { path: '/', key: 'menu.dashboard', icon: 'Odometer' },
  
  // 数据概览
  { path: '/dataoverview', key: 'menu.dataOverview', icon: 'DataAnalysis', children: [
    { path: '/dataoverview/production', key: 'menu.productionBoard', icon: 'DataLine' },
    { path: '/dataoverview/inventory', key: 'menu.inventoryBoard', icon: 'Tickets' },
    { path: '/dataoverview/sales', key: 'menu.salesBoard', icon: 'ShoppingBag' },
    { path: '/dataoverview/finance', key: 'menu.financeBoard', icon: 'Wallet' },
    { path: '/dataoverview/quality', key: 'menu.qualityBoard', icon: 'CircleCheck' },
    { path: '/dataoverview/purchase', key: 'menu.purchaseBoard', icon: 'ShoppingBag' }
  ]},

  // 生产管理
  { path: '/production', key: 'menu.production', icon: 'DataLine', children: [
    { path: '/production/plan', key: 'menu.productionPlan', icon: 'Calendar' },
    { path: '/production/task', key: 'menu.productionTask', icon: 'Tickets' },
    { path: '/production/process', key: 'menu.productionProcess', icon: 'SetUp' },
    { path: '/production/report', key: 'menu.productionReport', icon: 'DataAnalysis' },
    { path: '/production/material-shortage', title: '缺料统计', icon: 'Warning' },
    { path: '/production/mrp', title: 'MRP需求计划', icon: 'DataAnalysis' },
    { path: '/production/equipment-monitoring', key: 'menu.equipmentMonitoring', icon: 'Monitor' }
  ]},

  // 基础数据
  { path: '/basedata', key: 'menu.baseData', icon: 'Collection', children: [
    { path: '/basedata/materials', key: 'menu.materials', icon: 'Goods' },
    { path: '/basedata/boms', key: 'menu.boms', icon: 'List' },
    { path: '/basedata/customers', key: 'menu.customers', icon: 'Avatar' },
    { path: '/basedata/suppliers', key: 'menu.suppliers', icon: 'ShoppingBag' },
    { path: '/basedata/categories', key: 'menu.categories', icon: 'Files' },
    { path: '/basedata/units', key: 'menu.units', icon: 'Coin' },
    { path: '/basedata/locations', key: 'menu.locations', icon: 'Location' },
    { path: '/basedata/process-templates', key: 'menu.processTemplates', icon: 'SetUp' },
    { path: '/basedata/product-categories', title: '产品大类', icon: 'Files' }
  ]},

  // 库存管理
  { path: '/inventory', key: 'menu.inventory', icon: 'Box', children: [
    { path: '/inventory/stock', key: 'menu.stock', icon: 'Tickets' },
    { path: '/inventory/inbound', key: 'menu.inbound', icon: 'Plus' },
    { path: '/inventory/outbound', key: 'menu.outbound', icon: 'Minus' },
    { path: '/inventory/manual-transaction', title: '手工出入', icon: 'Edit' },
    { path: '/inventory/transfer', key: 'menu.transfer', icon: 'Sort' },
    { path: '/inventory/check', key: 'menu.check', icon: 'CircleCheck' },
    { path: '/inventory/report', key: 'menu.inventoryReport', icon: 'DataAnalysis' },
    { path: '/inventory/transaction', key: 'menu.transaction', icon: 'Connection' }
  ]},

  // 采购管理
  { path: '/purchase', key: 'menu.purchase', icon: 'ShoppingBag', children: [
    { path: '/purchase/requisitions', key: 'menu.requisitions', icon: 'Document' },
    { path: '/purchase/orders', key: 'menu.orders', icon: 'Wallet' },
    { path: '/purchase/receipts', key: 'menu.receipts', icon: 'Goods' },
    { path: '/purchase/returns', key: 'menu.returns', icon: 'RefreshLeft' },
    { path: '/purchase/processing', key: 'menu.processing', icon: 'SetUp' },
    { path: '/purchase/processing-receipts', key: 'menu.processingReceipts', icon: 'Goods' }
  ]},

  // 销售管理
  { path: '/sales', key: 'menu.sales', icon: 'ShoppingBag', children: [
    { path: '/sales/orders', key: 'menu.salesOrders', icon: 'DocumentCopy' },
    { path: '/sales/outbound', key: 'menu.salesOutbound', icon: 'Briefcase' },
    { path: '/sales/returns', key: 'menu.salesReturns', icon: 'RefreshLeft' },
    { path: '/sales/exchanges', key: 'menu.exchanges', icon: 'Sort' },
    { path: '/sales/quotations', key: 'menu.quotations', icon: 'Document' },
    { path: '/sales/packing-lists', title: '装箱单', icon: 'Box' },
    { path: '/sales/delivery-stats', title: '发货统计', icon: 'DataAnalysis' }
  ]},

  // 财务管理
  { path: '/finance', key: 'menu.finance', icon: 'Wallet', children: [
    { path: '/finance/gl/accounts', key: 'menu.accounts', icon: 'CreditCard' },
    { path: '/finance/gl/entries', key: 'menu.entries', icon: 'Document' },
    { path: '/finance/gl/periods', key: 'menu.periods', icon: 'Calendar' },
    { path: '/finance/ar/invoices', key: 'menu.arInvoices', icon: 'Tickets' },
    { path: '/finance/ap/invoices', key: 'menu.apInvoices', icon: 'Document' },
    { path: '/finance/cash/accounts', key: 'menu.bankAccounts', icon: 'Wallet' },
    { path: '/finance/assets/list', key: 'menu.assets', icon: 'Goods' },
    { path: '/finance/reports/balance-sheet', key: 'menu.balanceSheet', icon: 'Document' },
    { path: '/finance/pricing', title: '产品定价', icon: 'Money' }
  ]},

  // 质量管理
  { path: '/quality', key: 'menu.quality', icon: 'CircleCheck', children: [
    { path: '/quality/incoming', key: 'menu.incoming', icon: 'Document' },
    { path: '/quality/process', key: 'menu.processInspection', icon: 'Briefcase' },
    { path: '/quality/first-article', key: 'menu.firstArticle', icon: 'CircleCheck' },
    { path: '/quality/final', key: 'menu.final', icon: 'RefreshLeft' },
    { path: '/quality/templates', key: 'menu.templates', icon: 'Document' },
    { path: '/quality/traceability', key: 'menu.traceability', icon: 'Connection' },
    { path: '/quality/nonconforming', key: 'menu.nonconforming', icon: 'Warning' }
  ]},

  // 设备管理
  { path: '/equipment', key: 'menu.equipment', icon: 'SetUp', children: [
    { path: '/equipment/list', key: 'menu.equipmentList', icon: 'Goods' },
    { path: '/equipment/maintenance', key: 'menu.maintenance', icon: 'Tools' },
    { path: '/equipment/inspection', key: 'menu.inspection', icon: 'CircleCheck' },
    { path: '/equipment/status', key: 'menu.equipmentStatus', icon: 'Warning' }
  ]},

  // 人力资源
  { path: '/hr', key: 'menu.hr', icon: 'User', children: [
    { path: '/hr/employees', key: 'menu.employees', icon: 'User' },
    { path: '/hr/attendance', key: 'menu.attendance', icon: 'Calendar' },
    { path: '/hr/salary', key: 'menu.salary', icon: 'Wallet' },
    { path: '/hr/performance', key: 'menu.performance', icon: 'DataAnalysis' }
  ]},

  // 系统管理
  { path: '/system', key: 'menu.system', icon: 'Setting', children: [
    { path: '/system/users', key: 'menu.users', icon: 'User' },
    { path: '/system/departments', key: 'menu.departments', icon: 'OfficeBuilding' },
    { path: '/system/permissions', key: 'menu.permissions', icon: 'Lock' },
    { path: '/system/print', key: 'menu.print', icon: 'Printer' }
  ]}
]

// 扁平化菜单数据
const menuOptions = computed(() => {
  const options = []
  
  const processMenu = (items, parentTitle = '') => {
    items.forEach(item => {
      const title = item.key ? t(item.key) : item.title
      const breadcrumbs = parentTitle ? [parentTitle, title] : [title]
      
      // 如果有子菜单，只有子菜单是可搜索的，父级本身如果不作为页面则不搜索
      // 这里简化为：如果有path且不完全是目录，则可搜索
      if (item.path && (!item.children || item.children.length === 0)) {
        options.push({
          path: item.path,
          title,
          breadcrumbs,
          icon: item.icon
        })
      }
      
      if (item.children) {
        processMenu(item.children, title)
      }
    })
  }
  
  processMenu(menuStructure)
  return options
})

// 过滤选项
const filteredOptions = computed(() => {
  if (!keyword.value) return []
  const k = keyword.value.toLowerCase()
  return menuOptions.value.filter(item => 
    item.title.toLowerCase().includes(k)
  ).slice(0, 10) // 最多显示10条
})

const openSearch = () => {
  visible.value = true
  keyword.value = ''
  activeIndex.value = 0
}

const onOpened = () => {
  nextTick(() => {
    inputRef.value?.focus()
  })
}

const onClosed = () => {
  keyword.value = ''
}

const handleSearch = () => {
  activeIndex.value = 0
}

const navigateOptions = (direction) => {
  if (filteredOptions.value.length === 0) return
  
  if (direction === 'next') {
    activeIndex.value = (activeIndex.value + 1) % filteredOptions.value.length
  } else {
    activeIndex.value = (activeIndex.value - 1 + filteredOptions.value.length) % filteredOptions.value.length
  }
  
  // 滚动到可见区域
  const el = document.querySelector('.result-item.active')
  if (el) {
    el.scrollIntoView({ block: 'nearest' })
  }
}

const selectActive = () => {
  if (filteredOptions.value.length > 0) {
    handleSelect(filteredOptions.value[activeIndex.value])
  }
}

const handleSelect = (item) => {
  visible.value = false
  router.push(item.path)
}

// 快捷键支持
onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

const handleGlobalKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    openSearch()
  }
}
</script>

<style scoped>
.search-trigger {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 8px;
  color: var(--el-text-color-regular);
  transition: all 0.3s;
  margin-right: 12px;
}

.search-trigger:hover {
  background-color: var(--el-fill-color-light);
  color: var(--tech-primary);
}

.search-icon {
  font-size: 20px;
}

:deep(.search-dialog) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  
  .el-dialog__header {
    display: none;
  }
  
  .el-dialog__body {
    padding: 0;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }
}

.search-input-wrapper {
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.el-input__wrapper) {
  background-color: var(--el-fill-color-light);
  box-shadow: none !important;
  border-radius: 8px;
  
  &.is-focus {
    background-color: var(--el-bg-color);
    box-shadow: 0 0 0 2px var(--tech-primary) !important;
  }
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
  padding: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover, &.active {
    background-color: var(--el-fill-color);
  }
  
  &.active {
    .item-title {
      color: var(--tech-primary);
    }
    .item-action {
      opacity: 1;
    }
  }
}

.item-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  color: var(--el-text-color-regular);
  font-size: 16px;
}

.item-content {
  flex: 1;
  overflow: hidden;
}

.item-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.item-path {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
}

.separator {
  margin: 0 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.item-action {
  opacity: 0;
  transition: opacity 0.2s;
  color: var(--el-text-color-secondary);
}

.search-footer {
  padding: 8px 16px;
  background-color: var(--el-fill-color-light);
  display: flex;
  gap: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.key-hint {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  gap: 6px;
}

.key {
  background-color: var(--el-bg-color);
  padding: 2px 6px;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  font-family: monospace;
  min-width: 16px;
  text-align: center;
}
</style>
