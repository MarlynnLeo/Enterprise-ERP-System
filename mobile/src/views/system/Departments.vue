<!--
/**
 * Departments.vue - 部门管理列表
 * @description 部门管理页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadDepartments"
    :show-add="false"
    list-title="部门列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { systemApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '部门管理',
    searchPlaceholder: '搜索部门名称',
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'cluster-o',
      details: [
        { label: '部门编码', field: 'code' },
        { label: '上级部门', field: 'parent_name' },
        { label: '负责人', field: 'manager_name' },
        { label: '人数', field: 'member_count', suffix: '人' }
      ],
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            active: { text: '正常', color: 'success' },
            inactive: { text: '停用', color: 'default' }
          }
        }
      ]
    }
  }))

  const loadDepartments = async (params) => {
    const response = await systemApi.getDepartments(params)
    return response
  }

  const handleItemClick = (item) => {
    // 部门详情
  }
</script>
