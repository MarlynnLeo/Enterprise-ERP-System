<!--
/**
 * Periods.vue - 会计期间
 * @description 会计期间管理页面
 * @date 2026-04-15
 * @version 2.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadPeriods"
    :show-add="false"
    list-title="会计期间"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { financeApi } from '@/services/api'

  const router = useRouter()

  const pageConfig = computed(() => ({
    title: '会计期间',
    searchPlaceholder: '搜索期间名称',
    fields: {
      id: 'id',
      title: 'period_name',
      subtitle: (item) => `${item.fiscal_year || ''}年度`,
      icon: 'calendar',
      details: [
        { label: '开始日期', field: 'start_date', format: 'date' },
        { label: '结束日期', field: 'end_date', format: 'date' }
      ],
      status: {
        field: 'is_closed',
        map: {
          0: { text: '已开启', class: 'status-success' },
          1: { text: '已关闭', class: 'status-default' },
          false: { text: '已开启', class: 'status-success' },
          true: { text: '已关闭', class: 'status-default' }
        }
      }
    }
  }))

  const loadPeriods = async (params) => {
    const response = await financeApi.getPeriods(params)
    return response
  }

  const handleItemClick = (item) => {
    // 可以跳转到期间详情/科目余额页面
    router.push(`/finance/gl/periods/${item.id}`)
  }
</script>
