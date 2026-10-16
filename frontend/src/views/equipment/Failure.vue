<template>
  <EquipmentRecordPage
    title="设备故障记录"
    api-method="getFailures"
    record-kind="failure"
    :columns="columns"
    :status-options="statusOptions"
    :status-labels="statusLabels"
  />
</template>

<script setup>
import EquipmentRecordPage from './components/EquipmentRecordPage.vue'
const columns = [
  { prop: 'equipmentCode', label: '设备编号', minWidth: 130 },
  { prop: 'equipmentName', label: '设备名称', minWidth: 150 },
  { prop: 'failureType', label: '故障类型', minWidth: 120 },
  { prop: 'description', label: '故障描述', minWidth: 180 },
  { prop: 'failureDate', label: '故障日期', type: 'date' },
  { prop: 'status', label: '状态', type: 'status' },
  { prop: 'resolvedBy', label: '维修人' },
  { prop: 'resolution', label: '维修结果', minWidth: 180 },
  { prop: 'resolvedDate', label: '完成日期', type: 'date' },
  { prop: 'downtimeHours', label: '停机小时' },
  { prop: 'repairCost', label: '维修费用', type: 'money' },
]
const statusLabels = {
  reported: '已上报',
  diagnosing: '诊断中',
  repairing: '维修中',
  resolved: '已解决',
  unresolved: '未解决',
}
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }))
</script>
