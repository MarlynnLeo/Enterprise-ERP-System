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

  const pageConfig = computed(() => ({
    title: '加班审批',
    searchPlaceholder: '搜索员工姓名或部门',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待审批', value: 'pending' },
      { label: '已通过', value: 'approved' },
      { label: '已驳回', value: 'rejected' }
    ],

    fields: {
      id: 'id',
      title: 'empName',
      subtitle: 'department',
      icon: 'clock-o',
      status: 'status',

      details: [
        { label: '开始时间', field: 'startTime', type: 'datetime' },
        { label: '结束时间', field: 'endTime', type: 'datetime' },
        { label: '时长', field: 'duration', suffix: '小时' },
        { label: '加班事由', field: 'reason' }
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
      { icon: 'plus', label: '申请加班', action: 'create' }
    ]
  }))

  const loadOvertime = async (params) => {
    return {
      data: {
        list: [
          { id: 1, empName: '张技术', department: '工程部', startTime: '2026-04-18 18:30', endTime: '2026-04-18 21:30', duration: 3, reason: '项目攻坚抢版', status: 'pending' },
          { id: 2, empName: '刘操作员', department: '生产部', startTime: '2026-04-17 18:00', endTime: '2026-04-17 20:00', duration: 2, reason: '赶进度加工订单', status: 'approved' }
        ],
        total: 2
      }
    }
  }
</script>
