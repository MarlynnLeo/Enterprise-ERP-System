<!--
/**
 * Quotations.vue - 销售报价单列表
 * @description 销售报价单管理页面 - 替代GenericListView占位
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadQuotations"
    :show-add="false"
    list-title="报价单列表"
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
    title: '报价管理',
    searchPlaceholder: '搜索报价单号或客户',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待审核', value: 'pending' },
      { label: '已审核', value: 'approved' },
      { label: '已转单', value: 'converted' }
    ],
    fields: {
      id: 'id',
      title: 'customer_name',
      subtitle: 'quotation_code',
      icon: 'document-text',
      details: [
        { label: '报价金额', field: 'total_amount', prefix: '¥' },
        { label: '有效期至', field: 'valid_until', type: 'date' },
        { label: '报价日期', field: 'quotation_date', type: 'date' }
      ],
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            draft: { text: '草稿', color: 'default' },
            pending: { text: '待审核', color: 'warning' },
            approved: { text: '已审核', color: 'success' },
            rejected: { text: '已拒绝', color: 'danger' },
            converted: { text: '已转单', color: 'info' }
          }
        }
      ]
    }
  }))

  const loadQuotations = async (params) => {
    const response = await salesApi.getSalesQuotations(params)
    return response
  }

  const handleItemClick = (item) => {
    // 报价详情暂无单独页面
  }
</script>
