<!--
/**
 * Exchanges.vue - 销售换货列表
 * @description 销售换货管理页面 - 替代GenericListView占位
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadExchanges"
    :show-add="false"
    list-title="销售换货列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { salesApi } from '@/services/api'

  const router = useRouter()

  const pageConfig = computed(() => ({
    title: '销售换货',
    searchPlaceholder: '搜索换货单号或客户',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待处理', value: 'pending' },
      { label: '已完成', value: 'completed' }
    ],
    fields: {
      id: 'id',
      title: 'customer_name',
      subtitle: 'exchange_no',
      icon: 'exchange',
      details: [
        { label: '换货原因', field: 'reason' },
        { label: '换货日期', field: 'exchange_date', type: 'date' }
      ],
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待处理', color: 'warning' },
            processing: { text: '处理中', color: 'info' },
            completed: { text: '已完成', color: 'success' }
          }
        }
      ]
    }
  }))

  const loadExchanges = async (params) => {
    const response = await salesApi.getSalesExchanges(params)
    return response
  }

  const handleItemClick = (item) => {
    // 换货详情暂无单独页面
  }
</script>
