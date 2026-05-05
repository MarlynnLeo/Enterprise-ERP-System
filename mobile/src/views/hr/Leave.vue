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
  import dayjs from 'dayjs'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { hrApi } from '@/services/api'
  import { filterByKeyword, getResponseList, toPagedResponse } from '@/utils/listResponse'

  const pageConfig = computed(() => ({
    title: '请假记录',
    searchPlaceholder: '搜索员工姓名或期间',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '草稿', value: 'draft' },
      { label: '已确认', value: 'confirmed' }
    ],

    fields: {
      id: 'id',
      title: 'empName',
      subtitle: 'period',
      icon: 'notes-o',
      status: 'status',

      details: [
        { label: '部门', field: 'department' },
        { label: '请假/缺勤', field: 'leaveDays', suffix: '天' },
        { label: '年假', field: 'vacationDays', suffix: '天' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            draft: { text: '草稿', color: 'warning' },
            confirmed: { text: '已确认', color: 'success' }
          }
        }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '发起请假', action: 'create' }
    ]
  }))

  const loadLeave = async (params = {}) => {
    const response = await hrApi.getAttendance({ period: dayjs().format('YYYY-MM') })
    const records = getResponseList(response)
      .map((row) => ({
        id: row.id,
        empName: row.name || row.employee_name || '',
        period: row.period || '',
        department: row.department_name || '',
        leaveDays: Number(row.leave_days ?? row.total_leave_days ?? 0),
        vacationDays: Number(row.vacation_days ?? 0),
        status: row.status || 'confirmed'
      }))
      .filter((row) => row.leaveDays > 0 || row.vacationDays > 0)

    return toPagedResponse(filterByKeyword(records, params.search, ['empName', 'period', 'department']))
  }
</script>
