<template>
  <UniversalListPage :config="pageConfig" :api-function="loadIncoming" @item-click="handleItemClick" />
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
    title: '来料检验',
    searchPlaceholder: '搜索批次号或供应商',

    // 筛选标签
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待检验', value: 'pending' },
      { label: '检验中', value: 'in_progress' },
      { label: '已完成', value: 'completed' },
      { label: '已入库', value: 'received' }
    ],

    // 字段映射
    fields: {
      id: 'id',
      title: 'inspection_number',
      subtitle: 'batch_number',
      icon: 'shield-check',
      status: 'status',

      // 详情字段 — 精简为4列
      details: [
        { label: '物料名称', field: (item) => `${item.item_name || '—'}` },
        { label: '供应商', field: (item) => `${item.supplier_name || '—'}` },
        { label: '抽检数', field: (item) => `${item.quantity ?? 0} ${item.unit || '个'}` },
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
            received: { text: '已入库', color: 'primary' }
          }
        }
      ]
    },

    // 详情路由
    detailRoute: '/quality/incoming/:id',

    // 右上角按钮
    headerActions: [
      {
        icon: 'scan',
        label: '扫码检验',
        action: 'scan',
        handler: () => {
          router.push('/scan?type=inspection')
        }
      },
      {
        icon: 'plus',
        label: '新建检验',
        action: 'create',
        handler: () => {
          router.push('/quality/incoming/create')
        }
      },
      {
        icon: 'upgrade',
        label: '批量导入',
        action: 'import',
        handler: () => {
          showToast('批量导入功能建设中')
        }
      }
    ]
  }))

  // 加载数据
  const loadIncoming = async (params) => {
    // 处理状态筛选
    const apiParams = { ...params, include_supplier: true }
    if (!params.status || params.status === 'all') {
      delete apiParams.status
    }
    const response = await qualityApi.getIncomingInspections(apiParams)
    
    // 对 response 数据进行格式化或容错处理
    if (response && response.data && Array.isArray(response.data.list)) {
      response.data.list = response.data.list.map(item => ({
        ...item,
        // 万一后端批次号或单号为空，做个保护
        inspection_number: item.inspection_number || item.inspection_no || '-',
        batch_number: item.batch_number || item.batch_no || '-'
      }))
    }
    
    return response
  }

  // 处理项目点击
  const handleItemClick = (inspection) => {
    router.push(`/quality/incoming/${inspection.id}`)
  }
</script>

<style lang="scss" scoped>
  // UniversalListPage 自带 UI，无需再手写冗余样式
</style>
