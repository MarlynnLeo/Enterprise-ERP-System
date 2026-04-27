<template>
  <UniversalListPage :config="pageConfig" :api-function="loadList" @item-click="handleItemClick" />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { qualityApi } from '@/services/api'

  const router = useRouter()

  const pageConfig = computed(() => ({
    title: '不合格品处理',
    searchPlaceholder: '搜索编号或物料名称',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待处理', value: 'pending' },
      { label: '处理中', value: 'processing' },
      { label: '已完成', value: 'completed' },
      { label: '已关闭', value: 'closed' }
    ],
    fields: {
      id: 'id',
      title: 'ncp_no',
      subtitle: 'material_name',
      icon: 'warning-o',
      status: 'status',
      details: [
        { label: '严重程度', field: (item) => ({ critical: '致命', major: '严重', minor: '轻微' })[item.severity] || item.severity || '--' },
        { label: '数量', field: (item) => `${item.quantity ?? 0} ${item.unit || '个'}` },
        { label: '处置方式', field: (item) => ({ return: '退货', rework: '返工', scrap: '报废', concession: '让步接收', pending: '待决定' })[item.disposition] || item.disposition || '--' },
        { label: '创建时间', field: (item) => item.created_at ? item.created_at.substring(0, 10) : '--' }
      ],
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待处理', color: 'warning' },
            processing: { text: '处理中', color: 'primary' },
            completed: { text: '已完成', color: 'success' },
            closed: { text: '已关闭', color: 'default' }
          }
        }
      ]
    },
    detailRoute: '/quality/nonconformance/:id'
  }))

  const loadList = async (params) => {
    const apiParams = { ...params }
    if (!params.status || params.status === 'all') {
      delete apiParams.status
    }
    const response = await qualityApi.getNonconformanceRecords(apiParams)
    // 后端返回 { success, data: { items, total } }，转换为通用组件期望的 { data: { list, total } }
    if (response?.data?.data?.items) {
      response.data.data.list = response.data.data.items
    }
    return response
  }

  const handleItemClick = (item) => {
    router.push(`/quality/nonconformance/${item.id}`)
  }
</script>

<style lang="scss" scoped>
</style>
