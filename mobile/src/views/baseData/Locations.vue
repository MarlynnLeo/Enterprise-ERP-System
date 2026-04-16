<!--
/**
 * Locations.vue - 库位管理列表
 * @description 库位管理页面 - 替代GenericListView占位
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadLocations"
    :show-add="false"
    list-title="库位列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { baseDataApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '库位管理',
    searchPlaceholder: '搜索库位名称或编码',
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'location',
      details: [
        { label: '库位编码', field: 'code' },
        { label: '所属仓库', field: 'warehouse_name' },
        { label: '库位类型', field: 'type' }
      ],
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            active: { text: '启用', color: 'success' },
            inactive: { text: '停用', color: 'default' }
          }
        }
      ]
    }
  }))

  const loadLocations = async (params) => {
    const response = await baseDataApi.getLocations(params)
    return response
  }

  const handleItemClick = (item) => {
    // 库位详情
  }
</script>
