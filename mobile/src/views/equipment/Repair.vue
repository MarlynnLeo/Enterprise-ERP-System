<!--
/**
 * Repair.vue
 * @description 故障维修管理
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadRepairs" />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { equipmentApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '维修记录',
    searchPlaceholder: '搜索设备或维修单号',
    
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '已上报', value: 'reported' },
      { label: '维修中', value: 'repairing' },
      { label: '已解决', value: 'resolved' }
    ],

    fields: {
      id: 'id',
      title: 'equipmentName',
      subtitle: 'failure_type',
      icon: 'tools',
      status: 'status',

      details: [
        { label: '故障现象', field: 'description' },
        { label: '上报人', field: 'reported_by' },
        { label: '故障时间', field: 'failure_date', type: 'datetime' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待接单', color: 'danger' },
            reported: { text: '已上报', color: 'danger' },
            repairing: { text: '维修中', color: 'warning' },
            resolved: { text: '已解决', color: 'success' },
            completed: { text: '已修复', color: 'success' }
          }
        }
      ]
    },

    headerActions: [
      { icon: 'warning-o', label: '故障报修', action: 'create' }
    ]
  }))

  const loadRepairs = async (params) => {
    return await equipmentApi.getFailureRecords(params)
  }
</script>
