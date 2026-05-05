<!--
/**
 * Materials.vue - 物料管理
 * @description 物料管理页面 - 使用通用列表组件
 * @date 2025-12-27
 * @version 2.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadMaterials"
    :show-add="true"
    add-permission="basedata:materials:create"
    :show-filter="true"
    list-title="物料列表"
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
  

  const router = useRouter()

  // 页面配置
  const pageConfig = computed(() => ({
    title: '物料管理',
    searchPlaceholder: '搜索物料编码或名称',
    tags: [
      { label: '全部', value: 'all' },
      { label: '原材料', value: 'raw' },
      { label: '半成品', value: 'semi' },
      { label: '成品', value: 'finished' }
    ],
    stats: [
      { label: '总物料', field: 'total', icon: 'cube', iconClass: 'bg-blue' },
      { label: '低库存', field: 'lowStock', icon: 'cube', iconClass: 'bg-red' }
    ],
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'cube',
      details: [
        { label: '规格', field: 'specs' },
        { label: '单位', field: 'unit_name' },
        { label: '分类', field: 'category_name' }
      ]
    },
    detailRoute: '/baseData/materials/:id'
  }))

  // API 函数
  const loadMaterials = async (params) => {
    try {
      const response = await baseDataApi.getMaterials(params)

      return response
    } catch (error) {
      console.error('加载物料列表失败:', error)
      throw error
    }
  }

  // 事件处理
  const handleAdd = () => {
    router.push('/baseData/materials/create')
  }

  const handleFilter = () => {
    // 筛选功能由 UniversalListPage 内置处理
  }

  const handleItemClick = (item) => {
    router.push(`/baseData/materials/${item.id}`)
  }
</script>
