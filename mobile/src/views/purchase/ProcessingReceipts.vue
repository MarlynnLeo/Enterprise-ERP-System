<!--
/**
 * ProcessingReceipts.vue - 外委入库列表
 * @description 外委加工入库管理页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadReceipts"
    :show-add="false"
    list-title="外委入库列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { purchaseApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '外委入库',
    searchPlaceholder: '搜索入库单号',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待入库', value: 'pending' },
      { label: '已入库', value: 'received' }
    ],
    fields: {
      id: 'id',
      title: 'supplier_name',
      subtitle: 'receipt_code',
      icon: 'logistics',
      details: [
        { label: '入库单号', field: 'receipt_code' },
        { label: '加工单号', field: 'processing_code' },
        { label: '物料名称', field: 'material_name' },
        { label: '入库数量', field: 'quantity' },
        { label: '入库日期', field: 'receipt_date', type: 'date' }
      ],
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待入库', color: 'warning' },
            received: { text: '已入库', color: 'success' },
            rejected: { text: '已退回', color: 'danger' }
          }
        }
      ]
    }
  }))

  const loadReceipts = async (params) => {
    const response = await purchaseApi.getProcessingReceipts(params)
    return response
  }

  const handleItemClick = () => {
    // 外委入库详情
  }
</script>
