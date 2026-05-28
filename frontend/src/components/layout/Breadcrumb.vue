<!--
/**
 * Breadcrumb.vue
 * @description Vue组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <el-breadcrumb class="breadcrumb">
    <el-breadcrumb-item v-for="item in breadcrumbs" :key="item.path" :to="item.path">
      {{ item.title }}
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()

const breadcrumbs = computed(() => {
  const pathArray = route.path.split('/').filter(Boolean)
  const breadcrumbs = []
  let path = ''
  let prevSegment = ''

  // 添加首页
  breadcrumbs.push({
    path: '/',
    title: t('menu.dashboard')
  })

  // 构建面包屑
  pathArray.forEach(segment => {
    path += `/${segment}`
    // 传递前一个路径片段作为上下文
    const title = getTitleByPath(segment, prevSegment)
    if (title) {
      breadcrumbs.push({
        path,
        title
      })
    }
    prevSegment = segment
  })

  return breadcrumbs
})

// 根据路径获取标题，考虑前一级路径
const getTitleByPath = (path, prevPath = '') => {
  if (path === 'outbound') {
    if (prevPath === 'sales') {
      return t('menu.salesOutbound')
    } else if (prevPath === 'inventory') {
      return t('menu.outbound')
    }
  }

  if (path === 'returns') {
    if (prevPath === 'sales') {
      return t('menu.salesReturns')
    } else if (prevPath === 'purchase') {
      return t('menu.returns')
    } else if (prevPath === 'tax') {
      return t('menu.taxReturns')
    }
  }

  // 处理特殊情况：相同路径名在不同模块下的映射

  // 处理receipts在不同模块下
  if (path === 'receipts') {
    if (prevPath === 'purchase') {
      return t('menu.receipts')
    } else if (prevPath === 'finance' || prevPath === 'ar') {
      return t('menu.receiptsManagement')
    }
  }

  // 处理orders在不同模块下
  if (path === 'orders') {
    if (prevPath === 'sales') {
      return t('menu.salesOrders')
    } else if (prevPath === 'purchase') {
      return t('menu.orders')
    }
  }

  // 处理list在不同模块下
  if (path === 'list') {
    if (prevPath === 'assets') {
      return t('menu.assets')
    } else if (prevPath === 'equipment') {
      return t('menu.equipmentList')
    } else if (prevPath === 'budget') {
      return t('menu.budgetList')
    }
    return path
  }

  // 处理categories在不同模块下
  if (path === 'categories' || path === '物料分类') {
    if (prevPath === 'assets') {
      return t('menu.assetCategories')
    } else if (prevPath === 'basedata' || prevPath === '基础数据') {
      return t('menu.categories')
    } else if (prevPath === 'expenses') {
      return t('menu.expenseCategories')
    }
    return path
  }

  // 处理report在不同模块下
  if (path === 'report') {
    if (prevPath === 'inventory') {
      return t('menu.inventoryReport')
    } else if (prevPath === 'production') {
      return t('menu.productionReport')
    }
    return path
  }

  // 处理财务管理下的现金管理路径
  if (path === 'cash' && prevPath === 'finance') {
    return t('menu.cashierManagement')
  }

  // 处理银行交易和现金交易
  if (path === 'bank-transactions' && prevPath === 'cash') {
    return t('menu.bankTransactions')
  }
  if (path === 'cash-transactions' && prevPath === 'cash') {
    return t('menu.cashTransactions')
  }

  // 处理费用管理下的路径
  if (path === 'expenses' && prevPath === 'finance') {
    return t('menu.expenses')
  }
  if (path === 'categories' && prevPath === 'expenses') {
    return t('menu.expenseCategories')
  }

  // 处理成本管理下的路径
  if (path === 'cost' && prevPath === 'finance') {
    return t('menu.costAccounting')
  }
  if (path === 'dashboard' && prevPath === 'cost') {
    return t('menu.costDashboard')
  }
  if (path === 'standard' && prevPath === 'cost') {
    return t('menu.standardCost')
  }
  if (path === 'actual' && prevPath === 'cost') {
    return t('menu.actualCost')
  }
  if (path === 'variance' && prevPath === 'cost') {
    return t('menu.costVariance')
  }
  if (path === 'settings' && prevPath === 'cost') {
    return t('menu.costSettings')
  }
  if (path === 'center' && prevPath === 'cost') {
    return t('menu.costCenter')
  }
  if (path === 'ledger' && prevPath === 'cost') {
    return t('menu.costLedger')
  }
  if (path === 'profitability' && prevPath === 'cost') {
    return t('menu.profitability')
  }
  if (path === 'abc' && prevPath === 'cost') {
    return t('menu.activityBasedCosting')
  }

  // 处理invoices在不同模块下的显示（ar=销售发票，ap=采购发票）
  if (path === 'invoices') {
    if (prevPath === 'ar') {
      return t('menu.arInvoices')
    } else if (prevPath === 'ap') {
      return t('menu.apInvoices')
    } else if (prevPath === 'tax') {
      return t('menu.taxInvoices')
    }
  }

  // 处理accounts在不同上下文下的显示
  if (path === 'accounts') {
    if (prevPath === 'cash') {
      return t('menu.bankAccounts')
    } else if (prevPath === 'gl' || prevPath === 'finance') {
      return t('menu.accounts')
    }
  }

  const titleMap = {
    // 首页
    'dashboard': t('menu.dashboard'),

    // 数据概览
    'dataoverview': t('menu.dataOverview'),

    // 生产管理
    'production': t('menu.production'),
    'plan': t('menu.productionPlan'),
    'task': t('menu.productionTask'),
    'process': t('menu.productionProcess'),
    'equipment-monitoring': t('menu.equipmentMonitoring'),
    'material-shortage': t('menu.materialShortage'),
    'mrp': t('menu.mrpPlanning'),
    'data-view': t('menu.productionDataView'),
    'gantt': t('menu.productionGantt'),

    // 基础数据
    'basedata': t('menu.baseData'),
    '基础数据': t('menu.baseData'),
    'materials': t('menu.materials'),
    '物料管理': t('menu.materials'),
    'boms': t('menu.boms'),
    'BOM管理': t('menu.boms'),
    'customers': t('menu.customers'),
    '客户管理': t('menu.customers'),
    'suppliers': t('menu.suppliers'),
    '供应商管理': t('menu.suppliers'),
    'units': t('menu.units'),
    '计量单位': t('menu.units'),
    'locations': t('menu.locations'),
    '库位管理': t('menu.locations'),
    'process-templates': t('menu.processTemplates'),
    '工序模板': t('menu.processTemplates'),
    'product-categories': t('menu.productCategories'),
    '产品分类': t('menu.productCategories'),
    'ecn': t('menu.ecnManagement'),
    '物料分类': t('menu.categories'),

    // 库存管理
    'inventory': t('menu.inventory'),
    'stock': t('menu.stock'),
    'inbound': t('menu.inbound'),
    'outbound': t('menu.outbound'),
    'transfer': t('menu.transfer'),
    'check': t('menu.check'),
    'transaction': t('menu.transaction'),
    'manual-transaction': t('menu.manualTransaction'),
    'year-end': t('menu.yearEnd'),

    // 采购管理
    'purchase': t('menu.purchase'),
    'requisitions': t('menu.requisitions'),
    'orders': t('menu.orders'),
    'returns': t('menu.returns'),
    'processing': t('menu.processing'),
    'processing-receipts': t('menu.processingReceipts'),
    'history': t('menu.purchaseHistory'),

    // 销售管理
    'sales': t('menu.sales'),
    'quotations': t('menu.quotations'),
    'exchanges': t('menu.exchanges'),
    'packing-lists': t('menu.packingLists'),
    'delivery-stats': t('menu.deliveryStats'),
    'contracts': t('menu.contracts'),

    // 财务管理
    'finance': t('menu.finance'),
    'gl': t('menu.entries'),
    'accounts': t('menu.accounts'),
    'entries': t('menu.entries'),
    'periods': t('menu.periods'),
    'trial-balance': t('menu.trialBalance'),
    'period-closing': t('menu.periodClosing'),
    'opening-balances': t('menu.openingBalances'),
    'ar': t('menu.arInvoices'),
    'invoices': t('menu.arInvoices'),
    'aging': t('menu.arAging'),
    'ap': t('menu.apInvoices'),
    'payments': t('menu.payments'),
    'assets': t('menu.assets'),
    'depreciation': t('menu.depreciation'),
    'cip': t('menu.assetCIP'),
    'cash': t('menu.cashierManagement'),
    'bank-transactions': t('menu.bankTransactions'),
    'cash-transactions': t('menu.cashTransactions'),
    'transactions': t('menu.transactions'),
    'reconciliation': t('menu.reconciliation'),
    'reports': t('menu.balanceSheet'),
    'balance-sheet': t('menu.balanceSheet'),
    'income-statement': t('menu.incomeStatement'),
    'cash-flow': t('menu.cashFlow'),
    'standard-cash-flow': t('menu.standardCashFlow'),
    'automation': t('menu.financeAutomation'),
    'expenses': t('menu.expenses'),
    'pricing': t('menu.productPricing'),

    // 税务管理
    'tax': t('menu.taxManagement'),
    'account-config': t('menu.taxAccountConfig'),

    // 预算管理
    'budget': t('menu.budgetManagement'),
    'execution': t('menu.budgetExecution'),
    'analysis': t('menu.budgetManagement'),
    'ai': t('menu.budgetAI'),

    // 成本管理
    'cost': t('menu.costAccounting'),
    'standard': t('menu.standardCost'),
    'actual': t('menu.actualCost'),
    'variance': t('menu.costVariance'),
    'center': t('menu.costCenter'),
    'ledger': t('menu.costLedger'),
    'profitability': t('menu.profitability'),
    'abc': t('menu.activityBasedCosting'),
    'versions': t('menu.standardCost'),

    // 质量管理
    'quality': t('menu.quality'),
    'incoming': t('menu.incoming'),
    'templates': t('menu.templates'),
    'traceability': t('menu.traceability'),
    'final': t('menu.final'),
    'first-article': t('menu.firstArticle'),
    'nonconforming': t('menu.nonconforming'),
    '8d-reports': t('menu.eightDReport'),
    'aql-standards': t('menu.aqlStandards'),
    'replacement-orders': t('menu.replacementOrders'),
    'rework-tasks': t('menu.reworkTasks'),
    'scrap-records': t('menu.scrapRecords'),
    'statistics': t('menu.qualityStatistics'),
    'gauges': t('menu.gaugeManagement'),
    'spc': t('menu.spcControlChart'),
    'supplier-quality': t('menu.supplierQuality'),

    // 设备管理
    'equipment': t('menu.equipment'),
    'maintenance': t('menu.maintenance'),
    'inspection': t('menu.inspection'),
    'status': t('menu.equipmentStatus'),

    // 人力资源
    'hr': t('menu.hr'),
    'employees': t('menu.employees'),
    'attendance': t('menu.attendance'),
    'salary': t('menu.salary'),
    'performance': t('menu.performance'),

    // 系统管理
    'system': t('menu.system'),
    'users': t('menu.users'),
    'departments': t('menu.departments'),
    'permissions': t('menu.permissions'),
    'print': t('menu.print'),
    'business-types': t('menu.businessTypes'),
    'technical-communication': t('menu.technicalCommunication'),
    'workflow': t('menu.workflow'),
    'coding-rules': t('menu.codingRules'),
    'documents': t('menu.documents'),
    'business-alerts': t('menu.businessAlerts'),
    'notifications': t('menu.notifications'),
    'settings': t('menu.financeSettings'),
    'exchange-rates': t('menu.exchangeRates'),

    // 个人中心
    'profile': t('user.profile'),

    // 通用操作
    'create': t('common.add'),
    'edit': t('common.edit'),
    'detail': t('common.detail')
  }
  return titleMap[path] || path
}
</script>

<style scoped>
.breadcrumb {
  display: inline-block;
  line-height: 1;
}
</style>
