<!--
/**
 * APAging.vue - 应付账龄分析
 * @date 2026-04-15
 * @version 2.1.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadData"
    :show-add="false"
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
    title: '应付账龄',
    searchPlaceholder: '搜索供应商名称',
    fields: {
      id: 'supplierId',
      title: 'supplierName',
      subtitle: (item) => item.contactPerson ? `联系人: ${item.contactPerson}` : '供应商',
      icon: 'chart-trending-o',
      details: [
        { label: '应付总额', field: 'totalAmount', format: 'money', prefix: '¥' },
        { label: '30天内', field: 'within30Days', format: 'money', prefix: '¥' },
        { label: '超90天', field: 'over90Days', format: 'money', prefix: '¥' }
      ]
    }
  }))

  const loadData = async (params) => {
    const response = await financeApi.getAPAging(params)
    // 后端返回 { details: [...] } 结构，需要转换为 UniversalListPage 可识别的格式
    const responseData = response.data || response
    const list = responseData.details || responseData.data?.details || []
    return {
      data: {
        data: list,
        total: list.length
      }
    }
  }

  const handleItemClick = (item) => {
    // 使用 supplierId（camelCase，与后端一致）
    if (item.supplierId) {
      router.push(`/finance/ap/invoices?supplier_id=${item.supplierId}`)
    }
  }
</script>
