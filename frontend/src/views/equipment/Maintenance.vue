<template>
  <el-tabs v-model="activeTab">
    <el-tab-pane label="保养记录" name="maintenance">
      <EquipmentRecordPage
        title="设备维护记录"
        api-method="getMaintenances"
        record-kind="maintenance"
        :columns="columns"
        :status-options="statusOptions"
        :status-labels="statusLabels"
      />
    </el-tab-pane>
    <el-tab-pane label="故障维修" name="failure" lazy><Failure /></el-tab-pane>
  </el-tabs>
</template>

<script setup>
import EquipmentRecordPage from './components/EquipmentRecordPage.vue'
import { ref } from 'vue'
import Failure from './Failure.vue'
const activeTab = ref('maintenance')

const columns = [
  { prop: 'equipmentCode', label: '设备编号', minWidth: 130 },
  { prop: 'equipmentName', label: '设备名称', minWidth: 160 },
  { prop: 'maintenanceType', label: '维护类型', minWidth: 120 },
  { prop: 'maintenanceDate', label: '维护日期', type: 'date', minWidth: 120 },
  { prop: 'maintenancePerson', label: '维护人员', minWidth: 120 },
  { prop: 'completedDate', label: '完成日期', type: 'date', minWidth: 120 },
  { prop: 'cost', label: '费用', type: 'money', minWidth: 100 },
  { prop: 'nextMaintenanceDate', label: '下次维护', type: 'date', minWidth: 120 },
  { prop: 'status', label: '状态', type: 'status', minWidth: 110 },
  { prop: 'remarks', label: '备注', minWidth: 180 },
]

const statusOptions = [
  { label: '待执行', value: 'pending' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'completed' },
]

const statusLabels = {
  pending: '待执行',
  in_progress: '进行中',
  completed: '已完成',
}
</script>
