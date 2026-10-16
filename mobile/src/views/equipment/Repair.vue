<!--
/**
 * Repair.vue
 * @description 故障维修管理
 */
-->
<template>
  <UniversalListPage :key="listVersion" :config="pageConfig" :api-function="loadRepairs" @item-click="openRecord" />
  <RecordEditor v-model:show="editorVisible" :record="selectedRecord" kind="failure" @saved="listVersion++" />
</template>

<script setup>
  import { computed, ref } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { equipmentApi } from '@/api'
  import RecordEditor from './RecordEditor.vue'

  const selectedRecord = ref(null)
  const editorVisible = ref(false)
  const listVersion = ref(0)
  const openRecord = record => { selectedRecord.value = record; editorVisible.value = true }

  const pageConfig = computed(() => ({
    title: '维修记录',
    searchPlaceholder: '搜索设备或维修单号',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '已上报', value: 'reported' },
      { label: '诊断中', value: 'diagnosing' },
      { label: '维修中', value: 'repairing' },
      { label: '未解决', value: 'unresolved' },
      { label: '已解决', value: 'resolved' }
    ],

    fields: {
      id: 'id',
      title: 'equipmentName',
      subtitle: 'failureType',
      icon: 'tools',
      status: 'status',

      details: [
        { label: '故障现象', field: 'description' },
        { label: '上报人', field: 'reportedBy' },
        { label: '维修人', field: 'resolvedBy' },
        { label: '维修结果', field: 'resolution' },
        { label: '故障时间', field: 'failureDate', type: 'datetime' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待接单', color: 'danger' },
            reported: { text: '已上报', color: 'danger' },
            diagnosing: { text: '诊断中', color: 'warning' },
            unresolved: { text: '未解决', color: 'danger' },
            repairing: { text: '维修中', color: 'warning' },
            resolved: { text: '已解决', color: 'success' },
            completed: { text: '已修复', color: 'success' }
          }
        }
      ]
    },

    headerActions: [
      {
        icon: 'warning-o',
        label: '故障报修',
        action: 'create',
        path: '/equipment/repair/create',
        permission: 'production:equipment:update'
      }
    ]
  }))

  const loadRepairs = async (params) => {
    return await equipmentApi.getFailureRecords(params)
  }
</script>
