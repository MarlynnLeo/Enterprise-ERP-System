<!--
/**
 * Returns.vue - 采购退货列表
 * @description 采购退货管理页面
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadReturns"
    :show-add="false"
    list-title="采购退货列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { purchaseApi } from '@/services/api'

  const router = useRouter()

  const pageConfig = computed(() => ({
    title: '采购退货',
    searchPlaceholder: '搜索退货单号或供应商',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待处理', value: 'pending' },
      { label: '已完成', value: 'completed' }
    ],
    fields: {
      id: 'id',
      title: 'supplier_name',
      subtitle: 'return_code',
      icon: 'exchange',
      details: [
        { label: '退货金额', field: 'total_amount', prefix: '¥' },
        { label: '退货日期', field: 'return_date', type: 'date' },
        { label: '退货原因', field: 'reason' }
      ],
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待处理', color: 'warning' },
            approved: { text: '已审核', color: 'info' },
            completed: { text: '已完成', color: 'success' }
          }
        }
      ]
    }
  }))

  const loadReturns = async (params) => {
    const response = await purchaseApi.getReturns(params)
    return response
  }

  const handleItemClick = (item) => {
    router.push(`/purchase/returns/${item.id}`)
  }
</script>
