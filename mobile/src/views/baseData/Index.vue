<!--
/**
 * Index.vue - 基础数据管理
 * @description 基础数据首页 — 仅定义业务数据，布局由 ModuleIndexPage 统一控制
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <ModuleIndexPage
    title="基础数据"
    :stats="statsCards"
    :actions="quickActions"
    :groups="moduleGroups"
    @back="router.back()"
    @navigate="navigateTo"
  />
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import ModuleIndexPage from '@/components/common/ModuleIndexPage.vue'
  import { baseDataApi } from '@/services/api'

  const router = useRouter()

  // ---- 统计数据 ----
  const statistics = ref({
    totalMaterials: 0,
    totalCustomers: 0,
    totalSuppliers: 0,
    totalLocations: 0
  })

  const statsCards = computed(() => [
    {
      label: '物料',
      value: String(statistics.value.totalMaterials || 0),
      icon: 'cube',
      color: 'bg-blue'
    },
    {
      label: '客户',
      value: String(statistics.value.totalCustomers || 0),
      icon: 'people',
      color: 'bg-green'
    },
    {
      label: '供应商',
      value: String(statistics.value.totalSuppliers || 0),
      icon: 'briefcase',
      color: 'bg-purple'
    },
    {
      label: '仓库',
      value: String(statistics.value.totalLocations || 0),
      icon: 'home',
      color: 'bg-yellow'
    }
  ])

  // ---- 快捷操作 ----
  const quickActions = ref([
    {
      label: '物料管理',
      path: '/baseData/materials',
      icon: 'cube',
      gradient: 'linear-gradient(135deg, var(--color-primary) 0%, #764ba2 100%)'
    },
    {
      label: '客户管理',
      path: '/baseData/customers',
      icon: 'people',
      gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
    },
    {
      label: '供应商管理',
      path: '/baseData/suppliers',
      icon: 'briefcase',
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
    },
    {
      label: '仓库管理',
      path: '/baseData/locations',
      icon: 'home',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
    }
  ])

  // ---- 功能模块 ----
  const materialModules = ref([
    {
      title: '物料管理',
      desc: '查看和管理物料信息',
      path: '/baseData/materials',
      icon: 'cube'
    },
    {
      title: 'BOM管理',
      desc: '物料清单管理',
      path: '/baseData/boms',
      icon: 'layers'
    }
  ])

  const partnerModules = ref([
    {
      title: '客户管理',
      desc: '查看和管理客户信息',
      path: '/baseData/customers',
      icon: 'people'
    },
    {
      title: '供应商管理',
      desc: '查看和管理供应商信息',
      path: '/baseData/suppliers',
      icon: 'briefcase'
    }
  ])

  const configModules = ref([
    {
      title: '单位管理',
      desc: '系统计量单位设置',
      path: '/baseData/units',
      icon: 'completed'
    },
    {
      title: '分类管理',
      desc: '物料与产品分类树',
      path: '/baseData/categories',
      icon: 'cluster-o'
    },
    {
      title: '仓库/库位管理',
      desc: '仓库和库位设置',
      path: '/baseData/locations',
      icon: 'home'
    },
    {
      title: '工序模板',
      desc: '生产工序模板管理',
      path: '/baseData/process-templates',
      icon: 'settings'
    }
  ])

  const moduleGroups = computed(() => [
    { title: '物料与BOM', icon: 'cube', color: 'text-blue-400', items: materialModules.value },
    { title: '合作伙伴', icon: 'people', color: 'text-green-400', items: partnerModules.value },
    { title: '基础配置', icon: 'settings', color: 'text-purple-400', items: configModules.value }
  ])

  // ---- 路由跳转 ----
  const navigateTo = (path) => {
    router.push(path)
  }

  // ---- 加载数据 ----
  const loadStatistics = async () => {
    try {
      // 并行加载各模块统计
      const [materialsRes, customersRes, suppliersRes] = await Promise.allSettled([
        baseDataApi.getMaterials({ page: 1, pageSize: 1 }),
        baseDataApi.getCustomers({ page: 1, pageSize: 1 }),
        baseDataApi.getSuppliers({ page: 1, pageSize: 1 })
      ])

      if (materialsRes.status === 'fulfilled') {
        statistics.value.totalMaterials = materialsRes.value?.data?.total || materialsRes.value?.total || 0
      }
      if (customersRes.status === 'fulfilled') {
        statistics.value.totalCustomers = customersRes.value?.data?.total || customersRes.value?.total || 0
      }
      if (suppliersRes.status === 'fulfilled') {
        statistics.value.totalSuppliers = suppliersRes.value?.data?.total || suppliersRes.value?.total || 0
      }
    } catch (error) {
      console.error('加载基础数据统计失败:', error)
    }
  }

  onMounted(() => {
    loadStatistics()
  })
</script>
