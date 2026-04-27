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

  const pageConfig = computed(() => ({
    title: '部门管理',
    searchPlaceholder: '搜索部门名称',

    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'cluster-o',
      
      details: [
        { label: '上级部门', field: 'parentName' },
        { label: '负责人', field: 'manager' },
        { label: '部门人数', field: 'empCount', suffix: '人' }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '新增部门', action: 'create' }
    ]
  }))

  const loadDepartments = async (params) => {
    return {
      data: {
        list: [
          { id: 1, name: '总经办', code: 'DEPT-GM', parentName: '-', manager: '王总', empCount: 5 },
          { id: 2, name: '生产部', code: 'DEPT-PROD', parentName: '总经办', manager: '陈经理', empCount: 85 },
          { id: 3, name: '质量部', code: 'DEPT-QC', parentName: '总经办', manager: '赵工', empCount: 12 }
        ],
        total: 3
      }
    }
  }
</script>
