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

  // 假设后端存在类似接口，我们用假数据模拟
  const pageConfig = computed(() => ({
    title: '员工档案',
    searchPlaceholder: '搜索员工姓名或工号',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '在职', value: 'active' },
      { label: '试用期', value: 'probation' },
      { label: '离职', value: 'resigned' }
    ],

    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'empNo',
      icon: 'contact',
      status: 'status',

      details: [
        { label: '部门', field: 'department' },
        { label: '职位', field: 'position' },
        { label: '入职时间', field: 'joinDate', type: 'date' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            active: { text: '在职', color: 'success' },
            probation: { text: '试用期', color: 'warning' },
            resigned: { text: '离职', color: 'default' }
          }
        }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '新员工入职', action: 'create' }
    ]
  }))

  const loadEmployees = async (params) => {
    return {
      data: {
        list: [
          { id: 1, name: '陈经理', empNo: 'EMP-001', department: '生产部', position: '部门经理', joinDate: '2023-01-15', status: 'active' },
          { id: 2, name: '李工', empNo: 'EMP-008', department: '工程部', position: '高级工程师', joinDate: '2025-11-20', status: 'probation' },
          { id: 3, name: '张三', empNo: 'EMP-012', department: '销售部', position: '销售专员', joinDate: '2024-05-10', status: 'active' }
        ],
        total: 3
      }
    }
  }
</script>
