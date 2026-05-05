<!--
/**
 * BOMs.vue - BOM管理列表
 * @description BOM物料清单管理页面
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadBoms"
    :show-add="false"
    list-title="BOM列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { baseDataApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: 'BOM管理',
    searchPlaceholder: '搜索BOM名称或编码',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '已审核', value: 'approved' },
      { label: '草稿', value: 'draft' }
    ],
    fields: {
      id: 'id',
      title: 'product_name',
      subtitle: 'bom_code',
      icon: 'cog',
      details: [
        { label: 'BOM编码', field: 'bom_code' },
        { label: '版本', field: 'version' },
        { label: '组件数', field: 'component_count' }
      ],
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            draft: { text: '草稿', color: 'default' },
            approved: { text: '已审核', color: 'success' },
            disabled: { text: '已停用', color: 'danger' }
          }
        }
      ]
    }
  }))

  const loadBoms = async (params) => {
    const response = await baseDataApi.getBoms(params)
    return response
  }

  const handleItemClick = () => {
    // BOM详情
  }
</script>
