<!--
/**
 * Leave.vue
 * @description 请假管理
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadLeave" />
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
    title: '请假记录',
    searchPlaceholder: '搜索员工、编号或部门',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待审批', value: 'pending' },
      { label: '已通过', value: 'approved' },
      { label: '已拒绝', value: 'rejected' }
    ],

    fields: {
      id: 'id',
      title: (item) => item.employee_name || item.applicant_name || '请假申请',
      subtitle: (item) => `${item.start_date || '-'} 至 ${item.end_date || '-'}`,
      icon: 'notes-o',
      status: {
        field: 'status',
        map: statusMap
      },

      details: [
        { label: '请假类型', field: 'leave_type' },
        { label: '请假天数', field: 'duration', suffix: '天' },
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
      { icon: 'plus', label: '发起请假', action: 'create', path: '/hr/leave/create' }
    ]
  }))

  const loadLeave = async (params = {}) => {
    return await hrApi.getLeaveRequests(params)
  }
</script>
