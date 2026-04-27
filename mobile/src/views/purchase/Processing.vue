<!--
/**
 * Processing.vue - 外委加工列表
 * @description 外委加工管理页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadProcessing"
    :show-add="false"
    list-title="外委加工列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { purchaseApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '外委加工',
    searchPlaceholder: '搜索加工单号或供应商',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待发料', value: 'pending' },
      { label: '加工中', value: 'processing' },
      { label: '已完成', value: 'completed' }
    ],
    fields: {
      id: 'id',
      title: 'supplier_name',
      subtitle: 'processing_code',
      icon: 'setting-o',
      details: [
        { label: '加工单号', field: 'processing_code' },
        { label: '物料名称', field: 'material_name' },
        { label: '加工数量', field: 'quantity' },
        { label: '预计完成', field: 'expected_date', type: 'date' }
      ],
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待发料', color: 'warning' },
            processing: { text: '加工中', color: 'primary' },
            completed: { text: '已完成', color: 'success' },
            cancelled: { text: '已取消', color: 'default' }
          }
        }
      ]
    }
  }))

  const loadProcessing = async (params) => {
    const response = await purchaseApi.getProcessing(params)
    return response
  }

  const handleItemClick = (item) => {
    // 外委加工详情
  }
</script>
