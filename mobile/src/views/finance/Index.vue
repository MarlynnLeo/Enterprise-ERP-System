<!--
/**
 * Index.vue - 财务管理
 * @description 财务管理首页 — 仅定义业务数据，布局由 ModuleIndexPage 统一控制
 * @date 2025-12-27
 * @version 3.0.0
 */
-->
<template>
  <ModuleIndexPage
    title="财务管理"
    :stats="statsCards"
    :actions="quickActions"
    :groups="moduleGroups"
    @back="router.back()"
    @add="navigateTo('/finance/gl/entries/create')"
    @navigate="navigateTo"
  />
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  
  import ModuleIndexPage from '@/components/common/ModuleIndexPage.vue'

  const router = useRouter()

  // ---- 统计数据 ----
  const statistics = ref({
    totalAssets: 0,
    totalRevenue: 0,
    totalExpense: 0,
    netProfit: 0
  })

  // 智能缩写金额：亿 / 万 / 原值
  const formatShortMoney = (amount) => {
    if (!amount) return '¥0'
    const num = Number(amount)
    if (Math.abs(num) >= 1e8) return '¥' + (num / 1e8).toFixed(2) + '亿'
    if (Math.abs(num) >= 1e4) return '¥' + (num / 1e4).toFixed(1) + '万'
    return '¥' + num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  const statsCards = computed(() => [
    {
      label: '总资产',
      value: formatShortMoney(statistics.value.totalAssets),
      icon: 'book-open',
      color: 'bg-blue'
    },
    {
      label: '本月收入',
      value: formatShortMoney(statistics.value.totalRevenue),
      icon: 'cash',
      color: 'bg-green'
    },
    {
      label: '本月支出',
      value: formatShortMoney(statistics.value.totalExpense),
      icon: 'credit-card',
      color: 'bg-orange'
    },
    {
      label: '净利润',
      value: formatShortMoney(statistics.value.netProfit),
      icon: 'chart-trending-o',
      color: 'bg-purple'
    }
  ])

  // ---- 快捷操作 ----
  const quickActions = ref([
    {
      label: '新建凭证',
      path: '/finance/gl/entries/create',
      icon: 'plus',
      gradient: 'linear-gradient(135deg, var(--color-primary) 0%, #764ba2 100%)'
    },
    {
      label: '收款登记',
      path: '/finance/ar/receipts/create',
      icon: 'coin',
      gradient: 'linear-gradient(135deg, #2CCFB0 0%, #1BA392 100%)'
    },
    {
      label: '付款登记',
      path: '/finance/ap/payments/create',
      icon: 'cash',
      gradient: 'linear-gradient(135deg, #FF6B6B 0%, #EE5A52 100%)'
    },
    {
      label: '银行交易',
      path: '/finance/cash/transactions/create',
      icon: 'exchange',
      gradient: 'linear-gradient(135deg, var(--color-warning) 0%, #FF8A3D 100%)'
    }
  ])

  // ---- 功能模块 ----
  const glModules = ref([
    { title: '会计科目', desc: '科目设置与管理', path: '/finance/gl/accounts', icon: 'book-open' },
    {
      title: '会计凭证',
      desc: '凭证录入与查询',
      path: '/finance/gl/entries',
      icon: 'notes',
      badge: 0
    },
    { title: '会计期间', desc: '期间管理与结账', path: '/finance/gl/periods', icon: 'calendar' }
  ])
  const arModules = ref([
    { title: '应收账款', desc: '客户应收管理', path: '/finance/ar/invoices', icon: 'coin' },
    { title: '收款管理', desc: '收款登记与核销', path: '/finance/ar/receipts', icon: 'cash' },
    { title: '账龄分析', desc: '应收账龄统计', path: '/finance/ar/aging', icon: 'chart-trending-o' }
  ])
  const apModules = ref([
    { title: '应付账款', desc: '供应商应付管理', path: '/finance/ap/invoices', icon: 'receipt' },
    {
      title: '付款管理',
      desc: '付款登记与核销',
      path: '/finance/ap/payments',
      icon: 'credit-card'
    },
    { title: '账龄分析', desc: '应付账龄统计', path: '/finance/ap/aging', icon: 'chart-trending-o' }
  ])
  const cashModules = ref([
    { title: '银行账户', desc: '账户信息管理', path: '/finance/cash/accounts', icon: 'bank' },
    {
      title: '银行交易',
      desc: '银行流水管理',
      path: '/finance/cash/bank-transactions',
      icon: 'exchange'
    },
    {
      title: '现金交易',
      desc: '现金流水管理',
      path: '/finance/cash/cash-transactions',
      icon: 'cash'
    },
    {
      title: '银行对账',
      desc: '对账单核对',
      path: '/finance/cash/reconciliation',
      icon: 'clipboard-check'
    },
    { title: '出纳报表', desc: '出纳月报表', path: '/finance/reports/cash-flow', icon: 'chart-bar' }
  ])
  const reportModules = ref([
    {
      title: '资产负债表',
      desc: '资产负债状况',
      path: '/finance/reports/balance-sheet',
      icon: 'chart-trending-o'
    },
    {
      title: '利润表',
      desc: '收入支出分析',
      path: '/finance/reports/income-statement',
      icon: 'chart-bar'
    }
  ])

  const moduleGroups = computed(() => [
    { title: '总账管理', icon: 'document-text', color: 'text-blue-400', items: glModules.value },
    { title: '应收管理', icon: 'coin', color: 'text-green-400', items: arModules.value },
    { title: '应付管理', icon: 'credit-card', color: 'text-orange-400', items: apModules.value },
    { title: '出纳管理', icon: 'bank', color: 'text-purple-400', items: cashModules.value },
    { title: '财务报表', icon: 'chart-pie', color: 'text-pink-400', items: reportModules.value }
  ])

  // ---- 路由跳转 ----
  const navigateTo = (path) => {
    if (!path) {
      /* Feature Unlocked */ return
    }
    router.push(path)
  }

  // ---- 加载数据 ----
  const getFinanceStatistics = async () => {
    try {
      statistics.value = {
        totalAssets: 12500000,
        totalRevenue: 850000,
        totalExpense: 620000,
        netProfit: 230000
      }
      glModules.value[1].badge = 5
    } catch (error) {
      console.error('获取财务统计数据失败:', error)
    }
  }

  onMounted(() => {
    getFinanceStatistics()
  })
</script>
