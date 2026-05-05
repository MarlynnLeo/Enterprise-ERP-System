<!--
/**
 * Types.vue
 * @description 设备类别管理
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadTypes" />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { equipmentApi } from '@/services/api'
  import { filterByKeyword, getResponseList, toPagedResponse } from '@/utils/listResponse'

  const pageConfig = computed(() => ({
    title: '设备类别',
    searchPlaceholder: '搜索类别名称',

    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'cluster-o',
      
      details: [
        { label: '设备数量', field: 'count', suffix: '台' },
        { label: '厂商', field: 'manufacturer' }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '新增类别', action: 'create' }
    ]
  }))

  const loadTypes = async (params = {}) => {
    const response = await equipmentApi.getList({ page: 1, pageSize: 100, search: params.search })
    const groups = new Map()

    getResponseList(response).forEach((equipment) => {
      const name = equipment.model || equipment.type || '未分类'
      const key = name || '未分类'
      const current = groups.get(key) || {
        id: key,
        name: key,
        code: equipment.model || equipment.type || '',
        manufacturer: equipment.manufacturer || '',
        count: 0
      }
      current.count += 1
      if (!current.manufacturer && equipment.manufacturer) current.manufacturer = equipment.manufacturer
      groups.set(key, current)
    })

    const list = filterByKeyword(Array.from(groups.values()), params.search, ['name', 'code', 'manufacturer'])
    return toPagedResponse(list)
  }
</script>
