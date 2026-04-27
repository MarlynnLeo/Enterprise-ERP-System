<!--
/**
 * Plans.vue - 生产计划列表
 * @description 生产计划列表页面 - Unified 风格
 * @date 2025-12-27
 * @version 2.0.0
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadPlans" @item-click="handleItemClick" />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { productionApi } from '@/services/api'

  const router = useRouter()

  // 页面配置
  const pageConfig = computed(() => ({
    title: '生产计划',
    searchPlaceholder: '搜索计划编号或产品名称',

    // 筛选标签
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '草稿', value: 'draft' },
      { label: '已分配', value: 'allocated' },
      { label: '进行中', value: 'in_progress' },
      { label: '已完成', value: 'completed' },
      { label: '已取消', value: 'cancelled' }
    ],

    // 字段映射
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'calendar',
      status: 'status',

      // 详情字段
      details: [
        { label: '产品', field: 'productName' },
        { label: '计划数量', field: 'quantity', suffix: 'unit' },
        { label: '开始时间', field: 'startDate', type: 'date' },
        { label: '结束时间', field: 'endDate', type: 'date' }
      ],

      // 标签
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            draft: { text: '草稿', color: 'default' },
            pending: { text: '待开始', color: 'info' },
            allocated: { text: '已分配', color: 'info' },
            preparing: { text: '备料中', color: 'warning' },
            material_issuing: { text: '发料中', color: 'warning' },
            material_issued: { text: '已发料', color: 'warning' },
            in_progress: { text: '生产中', color: 'warning' },
            inspection: { text: '待检验', color: 'info' },
            warehousing: { text: '待入库', color: 'info' },
            completed: { text: '已完成', color: 'success' },
            cancelled: { text: '已取消', color: 'default' },
            paused: { text: '已暂停', color: 'danger' }
          }
        }
      ],

      // 进度条
      progress: {
        field: 'progress',
        label: '完成进度'
      }
    },

    // 详情路由
    detailRoute: '/production/plans/:id',

    // 右上角按钮
    headerActions: [
      {
        icon: 'plus',
        label: '新建',
        action: 'create'
      }
    ]
  }))

  // 加载生产计划数据
  const loadPlans = async (params) => {
    // 处理状态筛选
    const apiParams = { ...params }
    if (!params.status || params.status === 'all') {
      delete apiParams.status
    }

    const response = await productionApi.getProductionPlans(apiParams)

    return response
  }

  // 处理项目点击
  const handleItemClick = (plan) => {
    router.push(`/production/plans/${plan.id}`)
  }
</script>

<style lang="scss" scoped>
  // 使用 UniversalListPage 的样式，无需额外样式
</style>
