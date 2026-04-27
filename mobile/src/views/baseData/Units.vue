<!--
/**
 * Units.vue - 单位管理列表
 * @description 计量单位管理页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadUnits"
    :show-add="false"
    list-title="单位列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { baseDataApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '单位管理',
    searchPlaceholder: '搜索单位名称',
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'symbol',
      icon: 'orders-o',
      details: [
        { label: '符号', field: 'symbol' },
        { label: '说明', field: 'description' }
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

  const loadUnits = async (params) => {
    const response = await baseDataApi.getUnits(params)
    return response
  }

  const handleItemClick = (item) => {
    // 单位详情 — 暂不跳转
  }
</script>
