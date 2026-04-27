<!--
/**
 * Attendance.vue
 * @description 考勤记录
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadAttendance" />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'

  const pageConfig = computed(() => ({
    title: '考勤记录',
    searchPlaceholder: '搜索员工或日期',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '正常', value: 'normal' },
      { label: '迟到', value: 'late' },
      { label: '早退', value: 'early' },
      { label: '缺卡', value: 'missing' }
    ],

    fields: {
      id: 'id',
      title: 'empName',
      subtitle: 'recordDate',
      icon: 'calendar-o',
      status: 'status',

      details: [
        { label: '上班打卡', field: 'clockInTime' },
        { label: '下班打卡', field: 'clockOutTime' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            normal: { text: '正常', color: 'success' },
            late: { text: '迟到', color: 'warning' },
            early: { text: '早退', color: 'warning' },
            missing: { text: '缺卡', color: 'danger' }
          }
        }
      ]
    },

    headerActions: [
      { icon: 'passed', label: '手动补卡', action: 'create' }
    ]
  }))

  const loadAttendance = async (params) => {
    return {
      data: {
        list: [
          { id: 1, empName: '张三', recordDate: '2026-04-18', clockInTime: '08:55', clockOutTime: '18:05', status: 'normal' },
          { id: 2, empName: '李四', recordDate: '2026-04-18', clockInTime: '09:12', clockOutTime: '-', status: 'late' }
        ],
        total: 2
      }
    }
  }
</script>
