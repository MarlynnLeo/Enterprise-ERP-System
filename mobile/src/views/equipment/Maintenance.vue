<!--
/**
 * Maintenance.vue
 * @description 设备保养管理
 */
-->
<template>
  <UniversalListPage :key="listVersion" :config="pageConfig" :api-function="loadMaintenance" @item-click="openRecord" />
  <RecordEditor v-model:show="editorVisible" :record="selectedRecord" kind="maintenance" @saved="listVersion++" />
</template>

<script setup>
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { equipmentApi } from '@/api'
  import RecordEditor from './RecordEditor.vue'

  const router = useRouter()
  const selectedRecord = ref(null)
  const editorVisible = ref(false)
  const listVersion = ref(0)
  const openRecord = record => { selectedRecord.value = record; editorVisible.value = true }

  const pageConfig = computed(() => ({
    title: '保养计划',
    searchPlaceholder: '搜索保养工单或设备名称',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待执行', value: 'pending' },
      { label: '执行中', value: 'in_progress' },
      { label: '已完成', value: 'completed' }
    ],

    fields: {
      id: 'id',
      title: 'equipmentName',
      subtitle: 'maintenanceType',
      icon: 'setting-o',
      status: 'status',

      details: [
        { label: '保养日期', field: 'maintenanceDate', type: 'date' },
        { label: '保养人', field: 'maintenancePerson' },
        { label: '完成日期', field: 'completedDate', type: 'date' },
        { label: '下次保养', field: 'nextMaintenanceDate', type: 'date' }
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
      { icon: 'plus', label: '制定计划', action: 'create', permission: 'production:equipment:update', handler: () => router.push('/equipment/maintenance/create') }
    ]
  }))

  const loadMaintenance = async (params) => {
    return await equipmentApi.getMaintenanceRecords(params)
  }
</script>
