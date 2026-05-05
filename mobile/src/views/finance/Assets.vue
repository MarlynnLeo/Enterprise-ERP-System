<!--
/**
 * Assets.vue - 固定资产
 * @description 固定资产管理页面
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadAssets"
    :show-add="false"
    list-title="固定资产列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { financeApi } from '@/services/api'

  const router = useRouter()

  const pageConfig = computed(() => ({
    title: '固定资产',
    searchPlaceholder: '搜索资产名称或编号',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '在用', value: 'in_use' },
      { label: '闲置', value: 'idle' },
      { label: '报废', value: 'scrapped' }
    ],
    fields: {
      id: 'id',
      title: (item) => item.asset_name || item.name || '',
      subtitle: 'asset_code',
      icon: 'briefcase',
      details: [
        { label: '资产编号', field: 'asset_code' },
        { label: '原值', field: 'original_value', prefix: '¥', format: 'money' },
        { label: '净值', field: 'net_value', prefix: '¥', format: 'money' },
        { label: '使用部门', field: 'department_name' }
      ],
      status: {
        field: 'status',
        map: {
          in_use: { text: '在用', class: 'status-success' },
          在用: { text: '在用', class: 'status-success' },
          idle: { text: '闲置', class: 'status-warning' },
          闲置: { text: '闲置', class: 'status-warning' },
          scrapped: { text: '报废', class: 'status-danger' },
          报废: { text: '报废', class: 'status-danger' }
        }
      }
    }
  }))

  const loadAssets = async (params) => {
    const response = await financeApi.getAssets(params)
    return response
  }

  const handleItemClick = (item) => {
    router.push(`/finance/assets/${item.id}`)
  }
</script>
