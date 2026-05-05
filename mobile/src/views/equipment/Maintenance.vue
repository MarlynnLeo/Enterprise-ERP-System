<!--
/**
 * Maintenance.vue
 * @description 设备保养管理
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadMaintenance" />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { equipmentApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '保养计划',
    searchPlaceholder: '搜索保养工单或设备名称',
    
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '计划中', value: 'planned' },
      { label: '执行中', value: 'in_progress' },
      { label: '已完成', value: 'completed' }
    ],

    fields: {
      id: 'id',
      title: 'equipmentName',
      subtitle: 'maintenance_type',
      icon: 'setting-o',
      status: 'status',

      details: [
        { label: '保养日期', field: 'maintenance_date', type: 'date' },
        { label: '保养人', field: 'maintenance_person' },
        { label: '下次保养', field: 'next_maintenance_date', type: 'date' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待执行', color: 'default' },
            planned: { text: '计划中', color: 'default' },
            in_progress: { text: '执行中', color: 'warning' },
            processing: { text: '执行中', color: 'warning' },
            completed: { text: '已完成', color: 'success' }
          }
        }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '制定计划', action: 'create' }
    ]
  }))

  const loadMaintenance = async (params) => {
    return await equipmentApi.getMaintenanceRecords(params)
  }
</script>
