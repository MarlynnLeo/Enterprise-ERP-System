<!--
/**
 * ProcessTemplates.vue - 工序模板列表
 * @description 工序模板管理页面
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadTemplates"
    :show-add="false"
    list-title="工序模板列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { baseDataApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '工序模板',
    searchPlaceholder: '搜索模板名称',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '已启用', value: 'active' },
      { label: '已停用', value: 'inactive' }
    ],
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'cog',
      details: [
        { label: '模板编码', field: 'code' },
        { label: '工序数', field: 'step_count' },
        { label: '适用产品', field: 'product_name' }
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

  const loadTemplates = async (params) => {
    const response = await baseDataApi.getProcessTemplates(params)
    return response
  }

  const handleItemClick = () => {
    // 模板详情
  }
</script>
