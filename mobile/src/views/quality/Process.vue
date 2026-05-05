<template>
  <UniversalListPage :config="pageConfig" :api-function="loadProcess" @item-click="handleItemClick" />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { qualityApi } from '@/services/api'

  const router = useRouter()

  // 页面配置
  const pageConfig = computed(() => ({
    title: '制程检验',
    searchPlaceholder: '搜索工单号或工序',

    // 筛选标签
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待检验', value: 'pending' },
      { label: '检验中', value: 'in_progress' },
      { label: '已完成', value: 'completed' }
    ],

    // 字段映射
    fields: {
      id: 'id',
      title: 'inspection_no',
      subtitle: 'reference_no', // 工单号
      icon: 'cog',
      status: 'status',

      // 详情字段 — 精简为3列
      details: [
        { label: '产品工序', field: (item) => `${item.item_name || '—'}` },
        { label: '检验数量', field: (item) => `${item.quantity ?? 0} ${item.unit || '个'}` },
        { label: '合格/不合格', field: (item) => `${item.qualified_quantity ?? 0} / ${item.unqualified_quantity ?? 0}` }
      ],

      // 标签
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待检验', color: 'default' },
            in_progress: { text: '检验中', color: 'warning' },
            completed: { text: '已完成', color: 'success' },
            passed: { text: '已合格', color: 'success' },
            failed: { text: '不合格', color: 'danger' }
          }
        }
      ]
    },

    // 详情路由
    detailRoute: '/quality/process/:id',

    // 右上角按钮
    headerActions: [
      {
        icon: 'scan',
        label: '扫码检验',
        action: 'scan',
        handler: () => {
          router.push('/scan?type=inspection_process')
        }
      },
      {
        icon: 'plus',
        label: '新建检验',
        action: 'create',
        handler: () => {
          router.push('/quality/process/create')
        }
      }
    ]
  }))

  // 加载数据
  const loadProcess = async (params) => {
    // 处理状态筛选
    const apiParams = { ...params }
    if (!params.status || params.status === 'all') {
      delete apiParams.status
    }
    const response = await qualityApi.getProcessInspections(apiParams)
    
    if (response && response.data && Array.isArray(response.data.list)) {
      response.data.list = response.data.list.map(item => ({
        ...item,
        inspection_no: item.inspection_number || item.inspection_no || '-',
        reference_no: item.reference_no || item.work_order_no || '-'
      }))
    }
    
    return response
  }

  // 处理项目点击
  const handleItemClick = (inspection) => {
    router.push(`/quality/process/${inspection.id}`)
  }
</script>

<style lang="scss" scoped>
  // UniversalListPage 自带 UI，无需手工覆盖
</style>
