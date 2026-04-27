<template>
  <UniversalListPage :config="pageConfig" :api-function="loadFinal" @item-click="handleItemClick" />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { showToast } from 'vant'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { qualityApi } from '@/services/api'

  const router = useRouter()

  // 页面配置
  const pageConfig = computed(() => ({
    title: '成品检验',
    searchPlaceholder: '搜索批次号或产品',

    // 筛选标签
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待检验', value: 'pending' },
      { label: '检验中', value: 'in_progress' },
      { label: '已完成', value: 'completed' },
      { label: '已入库', value: 'warehoused' }
    ],

    // 字段映射
    fields: {
      id: 'id',
      title: 'inspection_no',
      subtitle: 'batch_no', 
      icon: 'badge-check',
      status: 'status',

      // 详情字段 — 精简为4列
      details: [
        { label: '产品名称', field: (item) => `${item.item_name || '—'}` },
        { label: '批次号', field: (item) => `${item.batch_no || '—'}` },
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
            failed: { text: '不合格', color: 'danger' },
            warehoused: { text: '已入库', color: 'primary' }
          }
        }
      ]
    },

    // 详情路由
    detailRoute: '/quality/final/:id',

    // 右上角按钮
    headerActions: [
      {
        icon: 'scan',
        label: '扫码检验',
        action: 'scan',
        handler: () => {
          router.push('/scan?type=inspection_final')
        }
      },
      {
        icon: 'plus',
        label: '新建检验',
        action: 'create',
        handler: () => {
          router.push('/quality/final/create')
        }
      }
    ]
  }))

  // 加载数据
  const loadFinal = async (params) => {
    // 处理状态筛选
    const apiParams = { ...params }
    if (!params.status || params.status === 'all') {
      delete apiParams.status
    }
    const response = await qualityApi.getFinalInspections(apiParams)
    
    if (response && response.data && Array.isArray(response.data.list)) {
      response.data.list = response.data.list.map(item => ({
        ...item,
        inspection_no: item.inspection_number || item.inspection_no || '-',
        batch_no: item.batch_no || item.batch_number || '-'
      }))
    }
    
    return response
  }

  // 处理项目点击
  const handleItemClick = (inspection) => {
    router.push(`/quality/final/${inspection.id}`)
  }
</script>

<style lang="scss" scoped>
</style>
