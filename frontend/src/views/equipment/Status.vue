<template>
  <EquipmentRecordPage
    title="设备状态台账"
    api-method="getEquipmentList"
    :columns="columns"
    :status-options="statusOptions"
    :status-labels="statusLabels"
  />
</template>

<script setup>
import EquipmentRecordPage from './components/EquipmentRecordPage.vue'

const columns = [
  { prop: 'code', label: '设备编号', minWidth: 130 },
  { prop: 'name', label: '设备名称', minWidth: 160 },
  { prop: 'model', label: '型号', minWidth: 130 },
  { prop: 'location', label: '位置', minWidth: 140 },
  { prop: 'responsible_person', label: '负责人', minWidth: 120 },
  { prop: 'status', label: '状态', type: 'status', minWidth: 110 },
  { prop: 'inspection_date', label: '最近点检', type: 'date', minWidth: 120 },
  { prop: 'next_inspection_date', label: '下次点检', type: 'date', minWidth: 120 }
]

const statusOptions = [
  { label: '正常', value: 'normal' },
  { label: '维护中', value: 'maintenance' },
  { label: '维修中', value: 'repair' },
  { label: '已报废', value: 'scrapped' }
]

const statusLabels = {
  normal: '正常',
  maintenance: '维护中',
  repair: '维修中',
  scrapped: '已报废'
}
</script>
