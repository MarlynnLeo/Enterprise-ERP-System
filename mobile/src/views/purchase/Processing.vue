<!--
/**
 * Processing.vue - 委外加工列表
 * @description 委外加工管理页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadProcessing"
    :show-add="false"
    list-title="委外加工列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { purchaseApi } from '@/api'

  const router = useRouter()

  const pageConfig = computed(() => ({
    title: '委外加工',
    searchPlaceholder: '搜索加工单号或供应商',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待发料', value: 'pending' },
      { label: '加工中', value: 'processing' },
      { label: '已完成', value: 'completed' }
    ],
    fields: {
      id: 'id',
      title: 'supplierName',
      subtitle: 'processingCode',
      icon: 'setting-o',
      details: [
        { label: '加工单号', field: 'processingCode' },
        { label: '物料名称', field: 'materialName' },
        { label: '加工数量', field: 'quantity' },
        { label: '预计完成', field: 'expectedDate', type: 'date' }
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
    router.push(`/purchase/processing/${item.id}`)
  }
</script>
