<template>
  <AppDialog
    :model-value="modelValue"
    :title="isMaintenance ? '保养执行记录' : '故障处理记录'"
    width="620px"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @update:model-value="close"
  >
    <template v-if="record">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="设备">{{ record.equipmentName }}</el-descriptions-item>
        <el-descriptions-item label="记录编号">{{ record.id }}</el-descriptions-item>
        <el-descriptions-item label="当前状态">{{
          labels[currentStatus] || currentStatus
        }}</el-descriptions-item>
        <el-descriptions-item label="完成时间">{{
          record.completedDate || record.resolvedDate || '尚未完成'
        }}</el-descriptions-item>
        <el-descriptions-item label="原始说明" :span="2">{{
          record.description || '-'
        }}</el-descriptions-item>
      </el-descriptions>
      <el-form
        ref="formRef"
        :model="form"
        label-width="110px"
        class="record-form"
        :disabled="!canEdit || submitting"
      >
        <el-form-item v-if="canEdit" label="处理动作">
          <el-select v-model="form.status"
            ><el-option
              v-for="status in nextStatuses"
              :key="status"
              :value="status"
              :label="labels[status]"
          /></el-select>
        </el-form-item>
        <el-form-item
          label="执行人"
          prop="person"
          :rules="[{ required: true, whitespace: true, message: '请填写执行人', trigger: 'blur' }]"
          ><el-input v-model="form.person" maxlength="50"
        /></el-form-item>
        <el-form-item
          :label="isMaintenance ? '执行结果' : '维修结果'"
          prop="result"
          :rules="[
            { required: finishing, whitespace: true, message: '请填写处理结果', trigger: 'blur' },
          ]"
          ><el-input v-model="form.result" type="textarea" :rows="3"
        /></el-form-item>
        <el-form-item :label="isMaintenance ? '保养费用' : '维修费用'"
          ><el-input-number v-model="form.cost" :min="0" :max="99999999.99" :precision="2"
        /></el-form-item>
        <template v-if="isMaintenance">
          <el-form-item label="更换备件"><el-input v-model="form.partsReplaced" /></el-form-item>
          <el-form-item label="下次保养"
            ><el-date-picker
              v-model="form.nextMaintenanceDate"
              type="date"
              value-format="YYYY-MM-DD"
          /></el-form-item>
          <el-form-item v-if="form.status === 'completed'" label="完成日期"
            ><el-date-picker
              v-model="form.completedDate"
              type="date"
              value-format="YYYY-MM-DD"
              :clearable="false"
          /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="停机小时"
            ><el-input-number
              v-model="form.downtimeHours"
              :min="0"
              :max="99999999.99"
              :precision="2"
          /></el-form-item>
          <el-form-item label="备注"
            ><el-input v-model="form.remarks" type="textarea"
          /></el-form-item>
        </template>
      </el-form>
      <p class="record-help">完成时记录处理日期。设备运行状态请在设备台账确认。</p>
    </template>
    <template #footer>
      <el-button :disabled="submitting" @click="close(false)">关闭</el-button>
      <el-button v-if="canEdit" type="primary" :loading="submitting" @click="submit"
        >保存处理</el-button
      >
    </template>
  </AppDialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus/es/components/message/index'
import { equipmentApi } from '@/api'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  modelValue: Boolean,
  record: { type: Object, default: null },
  kind: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue', 'saved'])
const authStore = useAuthStore()
const formRef = ref()
const submitting = ref(false)
const form = reactive({
  status: '',
  person: '',
  result: '',
  cost: 0,
  partsReplaced: '',
  nextMaintenanceDate: '',
  completedDate: '',
  downtimeHours: 0,
  remarks: '',
})
const labels = {
  pending: '待执行',
  in_progress: '执行中',
  completed: '已完成',
  reported: '已上报',
  diagnosing: '诊断中',
  repairing: '维修中',
  resolved: '已解决',
  unresolved: '未解决',
}
const transitions = {
  pending: ['in_progress'],
  in_progress: ['completed'],
  reported: ['diagnosing', 'repairing'],
  diagnosing: ['repairing', 'unresolved'],
  repairing: ['resolved', 'unresolved'],
  unresolved: ['diagnosing', 'repairing'],
}
const isMaintenance = computed(() => props.kind === 'maintenance')
const currentStatus = computed(() => props.record?.status || props.record?.repairStatus)
const nextStatuses = computed(() => transitions[currentStatus.value] || [])
const canEdit = computed(
  () => authStore.hasPermission('production:equipment:update') && nextStatuses.value.length > 0
)
const finishing = computed(() => ['completed', 'resolved', 'unresolved'].includes(form.status))

watch(
  () => [props.record, props.modelValue],
  () => {
    const record = props.record || {}
    Object.assign(form, {
      status: nextStatuses.value[0] || currentStatus.value,
      person:
        (isMaintenance.value
          ? record.maintenancePerson || record.maintenanceStaff
          : record.resolvedBy) ||
        (canEdit.value ? authStore.user?.realName || authStore.user?.username || '' : ''),
      result: (isMaintenance.value ? record.remarks : record.resolution) || '',
      cost:
        (isMaintenance.value ? record.cost : record.repairCost) == null
          ? canEdit.value
            ? 0
            : undefined
          : Number(isMaintenance.value ? record.cost : record.repairCost),
      partsReplaced: record.partsReplaced || '',
      nextMaintenanceDate: record.nextMaintenanceDate?.slice(0, 10) || '',
      completedDate:
        record.completedDate?.slice(0, 10) || (canEdit.value ? dayjs().format('YYYY-MM-DD') : ''),
      downtimeHours:
        record.downtimeHours == null
          ? canEdit.value
            ? 0
            : undefined
          : Number(record.downtimeHours),
      remarks: record.remarks || '',
    })
  },
  { immediate: true }
)

const close = (value) => {
  if (!submitting.value) emit('update:modelValue', value)
}
const submit = async () => {
  if (submitting.value || !canEdit.value) return
  if (!form.person.trim() || (finishing.value && !form.result.trim())) {
    ElMessage.error('请填写执行人和处理结果')
    return
  }
  submitting.value = true
  try {
    if ((await formRef.value?.validate()) === false) return
    const payload = isMaintenance.value
      ? {
          status: form.status,
          expectedStatus: currentStatus.value,
          maintenancePerson: form.person,
          remarks: form.result,
          cost: form.cost,
          partsReplaced: form.partsReplaced,
          nextMaintenanceDate: form.nextMaintenanceDate || null,
          ...(form.status === 'completed' ? { completedDate: form.completedDate } : {}),
        }
      : {
          repairStatus: form.status,
          expectedStatus: currentStatus.value,
          resolvedBy: form.person,
          resolution: form.result,
          repairCost: form.cost,
          downtimeHours: form.downtimeHours,
          remarks: form.remarks,
        }
    await (isMaintenance.value ? equipmentApi.updateMaintenance : equipmentApi.updateFailure)(
      props.record.id,
      payload
    )
    ElMessage.success('处理记录已保存')
    emit('saved')
    emit('update:modelValue', false)
  } catch (error) {
    if (error?.message || error?.response)
      ElMessage.error(error.response?.data?.message || error.message || '保存失败，请重试')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.record-form {
  margin-top: 18px;
}
.record-help {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
