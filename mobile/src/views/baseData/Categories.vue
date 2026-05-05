<!--
/**
 * Categories.vue - 分类管理列表
 * @description 物料分类管理页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadCategories"
    :show-add="false"
    list-title="分类列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { baseDataApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '分类管理',
    searchPlaceholder: '搜索分类名称',
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'label-o',
      details: [
        { label: '分类编码', field: 'code' },
        { label: '上级分类', field: 'parent_name' },
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

  const loadCategories = async (params) => {
    const response = await baseDataApi.getCategories(params)
    return response
  }

  const handleItemClick = () => {
    // 分类详情 — 暂不跳转
  }
</script>
