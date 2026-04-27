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

  const pageConfig = computed(() => ({
    title: '维修记录',
    searchPlaceholder: '搜索设备或维修单号',
    
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待接单', value: 'pending' },
      { label: '维修中', value: 'repairing' },
      { label: '已完成', value: 'completed' }
    ],

    fields: {
      id: 'id',
      title: 'equipmentName',
      subtitle: 'repairNo',
      icon: 'tools',
      status: 'status',

      details: [
        { label: '故障现象', field: 'issue' },
        { label: '报修时间', field: 'reportTime', type: 'datetime' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待接单', color: 'danger' },
            repairing: { text: '维修中', color: 'warning' },
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
    return {
      data: {
        list: [
          { id: 1, equipmentName: '二号数控车床', repairNo: 'RP-260418001', issue: '主轴异响', reportTime: '2026-04-18 10:30', status: 'repairing' },
          { id: 2, equipmentName: '自动包装机', repairNo: 'RP-260417004', issue: '加热丝熔断', reportTime: '2026-04-17 15:20', status: 'completed' }
        ],
        total: 2
      }
    }
  }
</script>
