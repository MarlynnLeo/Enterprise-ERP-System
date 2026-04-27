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

  const pageConfig = computed(() => ({
    title: '请假审阅',
    searchPlaceholder: '搜索员工姓名',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待审批', value: 'pending' },
      { label: '已通过', value: 'approved' },
      { label: '已驳回', value: 'rejected' }
    ],

    fields: {
      id: 'id',
      title: 'empName',
      subtitle: 'leaveType',
      icon: 'notes-o',
      status: 'status',

      details: [
        { label: '开始时间', field: 'startTime', type: 'datetime' },
        { label: '结束时间', field: 'endTime', type: 'datetime' },
        { label: '时长', field: 'duration', suffix: '小时' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待审批', color: 'warning' },
            approved: { text: '已通过', color: 'success' },
            rejected: { text: '已驳回', color: 'danger' }
          }
        }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '发起请假', action: 'create' }
    ]
  }))

  const loadLeave = async (params) => {
    return {
      data: {
        list: [
          { id: 1, empName: '王五', leaveType: '病假', startTime: '2026-04-19 09:00', endTime: '2026-04-19 18:00', duration: 8, status: 'pending' },
          { id: 2, empName: '李工程师', leaveType: '年假', startTime: '2026-05-01 09:00', endTime: '2026-05-03 18:00', duration: 24, status: 'approved' }
        ],
        total: 2
      }
    }
  }
</script>
