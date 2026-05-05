<template>
  <EquipmentRecordPage
    title="设备维护记录"
    api-method="getMaintenances"
    :columns="columns"
    :status-options="statusOptions"
    :status-labels="statusLabels"
  />
</template>

<script setup>
import EquipmentRecordPage from './components/EquipmentRecordPage.vue'

const columns = [
  { prop: 'equipmentCode', label: '设备编号', minWidth: 130 },
  { prop: 'equipmentName', label: '设备名称', minWidth: 160 },
  { prop: 'maintenance_type', label: '维护类型', minWidth: 120 },
  { prop: 'maintenance_date', label: '维护日期', type: 'date', minWidth: 120 },
  { prop: 'maintenance_person', label: '维护人员', minWidth: 120 },
  { prop: 'cost', label: '费用', type: 'money', minWidth: 100 },
  { prop: 'next_maintenance_date', label: '下次维护', type: 'date', minWidth: 120 },
  { prop: 'status', label: '状态', type: 'status', minWidth: 110 },
  { prop: 'remarks', label: '备注', minWidth: 180 }
]

const statusOptions = [
  { label: '计划中', value: 'planned' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'completed' },
  { label: '已逾期', value: 'overdue' }
]

const statusLabels = {
  planned: '计划中',
  in_progress: '进行中',
  completed: '已完成',
  overdue: '已逾期'
}
</script>
