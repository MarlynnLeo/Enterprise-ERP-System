<template>
  <EquipmentRecordPage
    title="设备点检记录"
    api-method="getInspections"
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
  { prop: 'inspection_type', label: '点检类型', minWidth: 120 },
  { prop: 'checkDate', label: '点检日期', type: 'date', minWidth: 120 },
  { prop: 'checker', label: '点检人', minWidth: 120 },
  { prop: 'status', label: '结果', type: 'status', minWidth: 110 },
  { prop: 'resultDesc', label: '处理说明', minWidth: 220 },
  { prop: 'next_inspection_date', label: '下次点检', type: 'date', minWidth: 120 }
]

const statusOptions = [
  { label: '合格', value: 'pass' },
  { label: '异常', value: 'abnormal' },
  { label: '不合格', value: 'failed' }
]

const statusLabels = {
  pass: '合格',
  abnormal: '异常',
  failed: '不合格'
}
</script>
