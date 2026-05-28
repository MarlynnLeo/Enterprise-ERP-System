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
        action: 'create',
        path: '/production/plans/create'
      }
    ]
  }))

  const normalizePlan = (plan = {}) => ({
    ...plan,
    productName: plan.productName || plan.product_name || plan.material_name,
    productCode: plan.productCode || plan.product_code || plan.material_code,
    startDate: plan.startDate || plan.start_date,
    endDate: plan.endDate || plan.end_date,
    deliveryDate: plan.deliveryDate || plan.delivery_date,
    completedQuantity: Number(plan.completedQuantity ?? plan.completed_quantity) || 0,
    taskQuantity: Number(plan.taskQuantity ?? plan.task_quantity) || 0,
    progress: Number(plan.progress) || 0
  })

  const normalizePlanResponse = (response) => {
    const normalizeArray = (list) => list.map(normalizePlan)

    if (Array.isArray(response?.data)) response.data = normalizeArray(response.data)
    if (Array.isArray(response?.list)) response.list = normalizeArray(response.list)
    if (Array.isArray(response?.items)) response.items = normalizeArray(response.items)
    if (Array.isArray(response?.data?.list)) response.data.list = normalizeArray(response.data.list)
    if (Array.isArray(response?.data?.items)) response.data.items = normalizeArray(response.data.items)
    if (Array.isArray(response?.data?.data)) response.data.data = normalizeArray(response.data.data)

    return response
  }

  // 加载生产计划数据
  const loadPlans = async (params) => {
    // 处理状态筛选
    const apiParams = { ...params }
    if (!params.status || params.status === 'all') {
      delete apiParams.status
    }

    const response = await productionApi.getProductionPlans(apiParams)

    return normalizePlanResponse(response)
  }

  // 处理项目点击
  const handleItemClick = (plan) => {
    router.push(`/production/plans/${plan.id}`)
  }
</script>

<style lang="scss" scoped>
  // 使用 UniversalListPage 的样式，无需额外样式
</style>
