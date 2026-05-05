<!--
/**
 * Employees.vue
 * @description 员工档案
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadEmployees" />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { hrApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '员工档案',
    searchPlaceholder: '搜索员工姓名或工号',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '在职', value: 'active' },
      { label: '试用期', value: 'probation' },
      { label: '离职', value: 'left' }
    ],

    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'employee_no',
      icon: 'contact',
      status: 'employment_status',

      details: [
        { label: '部门', field: 'department_name' },
        { label: '职位', field: 'position' },
        { label: '入职时间', field: 'join_date', type: 'date' }
      ],

      tags: [
        {
          field: 'employment_status',
          type: 'status',
          map: {
            active: { text: '在职', color: 'success' },
            probation: { text: '试用期', color: 'warning' },
            resigned: { text: '离职', color: 'default' },
            left: { text: '离职', color: 'default' }
          }
        }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '新员工入职', action: 'create' }
    ]
  }))

  const loadEmployees = async (params) => {
    const apiParams = { keyword: params.search, status: params.status }
    if (apiParams.status === 'all') {
      delete apiParams.status
    }
    return await hrApi.getEmployees(apiParams)
  }
</script>
