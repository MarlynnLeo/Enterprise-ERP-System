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
      return '销售订单'
    } else if (prevPath === 'purchase') {
      return t('menu.orders')
    }
  }

  // 处理list在不同模块下
  if (path === 'list') {
    if (prevPath === 'assets') {
      return '资产列表'
    } else if (prevPath === 'equipment') {
      return '设备列表'
    }
    return '列表'
  }

  // 处理categories在不同模块下
  if (path === 'categories' || path === '物料分类') {
    if (prevPath === 'assets') {
      return t('menu.assetCategories')
    } else if (prevPath === 'basedata' || prevPath === '基础数据') {
      return t('menu.categories')
    }
    return '分类'
  }

  // 处理report在不同模块下
  if (path === 'report') {
    if (prevPath === 'inventory') {
      return t('menu.inventoryReport')
    } else if (prevPath === 'production') {
      return t('menu.productionReport')
    }
    return '报表'
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
    return '费用管理'
  }
  if (path === 'categories' && prevPath === 'expenses') {
    return '费用类型'
  }

  // 处理成本管理下的路径
  if (path === 'cost' && prevPath === 'finance') {
    return '成本管理'
  }
  if (path === 'dashboard' && prevPath === 'cost') {
    return '成本驾驶舱'
  }
  if (path === 'standard' && prevPath === 'cost') {
    return '标准成本'
  }
  if (path === 'actual' && prevPath === 'cost') {
    return '实际成本'
  }
  if (path === 'variance' && prevPath === 'cost') {
    return '成本差异'
  }
  if (path === 'settings' && prevPath === 'cost') {
    return '成本设置'
  }
  if (path === 'center' && prevPath === 'cost') {
    return '成本中心'
  }
  if (path === 'ledger' && prevPath === 'cost') {
    return '成本明细账'
  }
  if (path === 'profitability' && prevPath === 'cost') {
    return '盈利分析'
  }
  if (path === 'abc' && prevPath === 'cost') {
    return '作业成本法'
  }

  // 处理invoices在不同模块下的显示（ar=销售发票，ap=采购发票）
  if (path === 'invoices') {
    if (prevPath === 'ar') {
      return t('menu.arInvoices')
    } else if (prevPath === 'ap') {
      return t('menu.apInvoices')
    } else if (prevPath === 'tax') {
      return '税务发票'
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
    'equipment-monitoring': '设备监控',
    'material-shortage': '缺料统计',
    'mrp': 'MRP需求计划',
    'data-view': '数据视图',

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
    'product-categories': '产品分类',
    '产品分类': '产品分类',
    '物料分类': t('menu.categories'),

    // 库存管理
    'inventory': t('menu.inventory'),
    'stock': t('menu.stock'),
    'inbound': t('menu.inbound'),
    'outbound': t('menu.outbound'),
    'transfer': t('menu.transfer'),
    'check': t('menu.check'),
    'transaction': t('menu.transaction'),
    'manual-transaction': '手工出入库',

    // 采购管理
    'purchase': t('menu.purchase'),
    'requisitions': t('menu.requisitions'),
    'orders': t('menu.orders'),
    'returns': t('menu.returns'),
    'processing': t('menu.processing'),
    'processing-receipts': t('menu.processingReceipts'),

    // 销售管理
    'sales': t('menu.sales'),
    'quotations': t('menu.quotations'),
    'exchanges': t('menu.exchanges'),
    'packing-lists': '装箱单',
    'delivery-stats': '交付统计',

    // 财务管理
    'finance': t('menu.finance'),
    'gl': '总账',
    'accounts': t('menu.accounts'),
    'entries': t('menu.entries'),
    'periods': t('menu.periods'),
    'trial-balance': '试算平衡表',
    'period-closing': '期间结账',
    'ar': '应收账款',
    'invoices': t('menu.arInvoices'),
    'aging': t('menu.arAging'),
    'ap': '应付账款',
    'payments': t('menu.payments'),
    'assets': t('menu.assets'),
    'depreciation': t('menu.depreciation'),
    'cash': t('menu.cashierManagement'),
    'bank-transactions': t('menu.bankTransactions'),
    'cash-transactions': t('menu.cashTransactions'),
    'transactions': t('menu.transactions'),
    'reconciliation': t('menu.reconciliation'),
    'reports': '报表',
    'balance-sheet': t('menu.balanceSheet'),
    'income-statement': t('menu.incomeStatement'),
    'cash-flow': t('menu.cashFlow'),
    'automation': '自动化',
    'expenses': '费用管理',
    'pricing': '产品定价',
    
    // 税务管理
    'tax': '税务管理',
    'returns': '纳税申报',
    'account-config': '税务科目配置',
    
    // 预算管理
    'budget': '预算管理',
    'execution': '预算执行',
    'analysis': '预算分析',
    
    // 成本管理
    'cost': '成本管理',
    'standard': '标准成本',
    'actual': '实际成本',
    'variance': '成本差异',
    'center': '成本中心',
    'ledger': '成本明细账',
    'profitability': '盈利分析',
    'abc': '作业成本法',

    // 质量管理
    'quality': t('menu.quality'),
    'incoming': t('menu.incoming'),
    'templates': t('menu.templates'),
    'traceability': t('menu.traceability'),
    'final': t('menu.final'),
    'first-article': '首检管理',
    'nonconforming': '不合格品',
    'replacement-orders': '换货单管理',
    'rework-tasks': '返工任务',
    'scrap-records': '废品记录',
    'traceability-monitor': '追溯监控',

    // 设备管理
    'equipment': t('menu.equipment'),
    'maintenance': t('menu.maintenance'),
    'inspection': t('menu.inspection'),
    'status': '设备状态',

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
    'business-types': '业务类型',
    'technical-communication': '技术沟通',
    'settings': '系统设置',
    
    // 个人中心
    'profile': '个人中心',
    
    // 通用操作
    'create': '新建',
    'edit': '编辑',
    'detail': '详情'
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