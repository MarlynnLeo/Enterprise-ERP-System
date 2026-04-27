<!--
/**
 * Suppliers.vue - 供应商管理
 * @description 供应商管理页面 - 使用通用列表组件
 * @date 2025-12-27
 * @version 2.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadSuppliers"
    :show-add="true"
    add-permission="basedata:suppliers:create"
    :show-filter="true"
    list-title="供应商列表"
    @add="handleAdd"
    @filter="handleFilter"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { baseDataApi } from '@/services/api'
  import { showToast } from 'vant'

  const router = useRouter()

  // 页面配置
  const pageConfig = computed(() => ({
    title: '供应商管理',
    searchPlaceholder: '搜索供应商名称或联系人',
    tags: [
      { label: '全部', value: 'all' },
      { label: '战略供应商', value: 'strategic' },
      { label: '普通供应商', value: 'normal' }
    ],
    stats: [
      { label: '总供应商', field: 'total', icon: 'office-building', iconClass: 'bg-blue' },
      { label: '合作中', field: 'active', icon: 'office-building', iconClass: 'bg-green' }
    ],
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'contact',
      icon: 'bank',
      details: [
        { label: '联系电话', field: 'phone' },
        { label: '地址', field: 'address' },
        { label: '评级', field: 'rating' }
      ]
    },
    detailRoute: '/baseData/suppliers/:id'
  }))

  // API 函数
  const loadSuppliers = async (params) => {
    try {
      const response = await baseDataApi.getSuppliers(params)
      return response
    } catch (error) {
      console.error('加载供应商列表失败:', error)
      throw error
    }
  }

  // 事件处理
  const handleAdd = () => {
    router.push('/baseData/suppliers/create')
  }

  const handleFilter = () => {
    // 筛选功能由 UniversalListPage 内置处理
  }

  const handleItemClick = (item) => {
    router.push(`/baseData/suppliers/${item.id}`)
  }
</script>
