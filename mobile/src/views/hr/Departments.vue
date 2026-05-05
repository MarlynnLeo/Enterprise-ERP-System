<!--
/**
 * Departments.vue
 * @description 组织架构/部门管理
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadDepartments" />
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
        { label: '负责人', field: 'manager_name' },
        { label: '部门人数', field: 'user_count', suffix: '人' },
        { label: '联系电话', field: 'phone' }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '新增部门', action: 'create' }
    ]
  }))

  const loadDepartments = async (params = {}) => {
    return systemApi.getDepartments({
      name: params.search,
      page: params.page,
      pageSize: params.pageSize
    })
  }
</script>
