<!--
/**
 * Customers.vue - 客户管理
 * @description 客户管理页面 - 使用通用列表组件
 * @date 2025-12-27
 * @version 2.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadCustomers"
    :show-add="true"
    :show-filter="true"
    list-title="客户列表"
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
    title: '客户管理',
    searchPlaceholder: '搜索客户名称或联系人',
    tags: [
      { label: '全部', value: 'all' },
      { label: '重点客户', value: 'vip' },
      { label: '普通客户', value: 'normal' }
    ],
    stats: [
      { label: '总客户', field: 'total', icon: 'user-group', iconClass: 'bg-blue' },
      { label: '活跃客户', field: 'active', icon: 'user-group', iconClass: 'bg-green' }
    ],
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'contact',
      icon: 'shield',
      details: [
        { label: '联系电话', field: 'phone' },
        { label: '地址', field: 'address' },
        { label: '信用等级', field: 'credit_level' }
      ]
    },
    detailRoute: '/baseData/customers/:id'
  }))

  // API 函数
  const loadCustomers = async (params) => {
    try {
      const response = await baseDataApi.getCustomers(params)
      return response
    } catch (error) {
      console.error('加载客户列表失败:', error)
      throw error
    }
  }

  // 事件处理
  const handleAdd = () => {
    router.push('/baseData/customers/create')
  }

  const handleFilter = () => {
    // 筛选功能由 UniversalListPage 内置处理
  }

  const handleItemClick = (item) => {
    router.push(`/baseData/customers/${item.id}`)
  }
</script>
