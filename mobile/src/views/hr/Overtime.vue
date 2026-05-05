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
  import dayjs from 'dayjs'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { hrApi } from '@/services/api'
  import { filterByKeyword, getResponseList, toPagedResponse } from '@/utils/listResponse'

  const pageConfig = computed(() => ({
    title: '加班记录',
    searchPlaceholder: '搜索员工姓名或部门',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '草稿', value: 'draft' },
      { label: '已确认', value: 'confirmed' }
    ],

    fields: {
      id: 'id',
      title: 'empName',
      subtitle: 'department',
      icon: 'clock-o',
      status: 'status',

      details: [
        { label: '期间', field: 'period' },
        { label: '加班时长', field: 'overtimeHours', suffix: '小时' },
        { label: '部门', field: 'department' }
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
      { icon: 'plus', label: '申请加班', action: 'create' }
    ]
  }))

  const loadOvertime = async (params = {}) => {
    const response = await hrApi.getAttendance({ period: dayjs().format('YYYY-MM') })
    const records = getResponseList(response)
      .map((row) => ({
        id: row.id,
        empName: row.name || row.employee_name || '',
        department: row.department_name || '',
        period: row.period || '',
        overtimeHours: Number(row.overtime_hours ?? 0),
        status: row.status || 'confirmed'
      }))
      .filter((row) => row.overtimeHours > 0)

    return toPagedResponse(filterByKeyword(records, params.search, ['empName', 'period', 'department']))
  }
</script>
