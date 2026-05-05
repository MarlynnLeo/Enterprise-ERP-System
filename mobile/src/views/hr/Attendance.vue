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
  import dayjs from 'dayjs'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { hrApi } from '@/services/api'
  import { filterByKeyword, getResponseList, toPagedResponse } from '@/utils/listResponse'

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
      subtitle: 'period',
      icon: 'calendar-o',
      status: 'status',

      details: [
        { label: '部门', field: 'department' },
        { label: '应出勤', field: 'daysInMonth', suffix: '天' },
        { label: '请假/缺勤', field: 'leaveDays', suffix: '天' },
        { label: '加班', field: 'overtimeHours', suffix: '小时' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            draft: { text: '草稿', color: 'warning' },
            confirmed: { text: '已确认', color: 'success' },
            normal: { text: '正常', color: 'success' }
          }
        }
      ]
    },

    headerActions: [
      { icon: 'passed', label: '手动补卡', action: 'create' }
    ]
  }))

  const loadAttendance = async (params = {}) => {
    const response = await hrApi.getAttendance({ period: dayjs().format('YYYY-MM') })
    const records = getResponseList(response).map((row) => ({
      id: row.id,
      empName: row.name || row.employee_name || '',
      period: row.period || '',
      department: row.department_name || '',
      daysInMonth: row.days_in_month ?? 0,
      leaveDays: row.leave_days ?? row.total_leave_days ?? 0,
      overtimeHours: row.overtime_hours ?? 0,
      status: row.status || 'normal'
    }))

    return toPagedResponse(filterByKeyword(records, params.search, ['empName', 'period', 'department']))
  }
</script>
