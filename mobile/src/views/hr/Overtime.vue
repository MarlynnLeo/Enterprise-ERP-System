<!--
/**
 * Overtime.vue
 * @description 加班管理
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadOvertime" />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { hrApi } from '@/api'

  const statusMap = {
    pending: { text: '待审批', color: 'warning' },
    approved: { text: '已通过', color: 'success' },
    rejected: { text: '已拒绝', color: 'danger' },
    withdrawn: { text: '已撤回', color: 'default' }
  }

  const pageConfig = computed(() => ({
    title: '加班记录',
    searchPlaceholder: '搜索员工、编号或部门',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待审批', value: 'pending' },
      { label: '已通过', value: 'approved' },
      { label: '已拒绝', value: 'rejected' }
    ],

    fields: {
      id: 'id',
      title: (item) => item.employee_name || item.applicant_name || '加班申请',
      subtitle: (item) => item.overtime_date || '-',
      icon: 'clock-o',
      status: {
        field: 'status',
        map: statusMap
      },

      details: [
        { label: '加班类型', field: 'overtime_type' },
        { label: '加班时长', field: 'hours', suffix: '小时' },
        { label: '部门', field: 'department_name' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: statusMap
        }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '申请加班', action: 'create', path: '/hr/overtime/create' }
    ]
  }))

  const loadOvertime = async (params = {}) => {
    return await hrApi.getOvertimeRequests(params)
  }
</script>
