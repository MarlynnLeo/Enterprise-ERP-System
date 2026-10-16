<template>
  <Popup
    :show="show"
    position="bottom"
    round
    :closeable="!submitting"
    :close-on-click-overlay="!submitting"
    :style="{ maxHeight: '90%', overflowY: 'auto' }"
    @update:show="close"
  >
    <div v-if="record" class="record-editor">
      <h3>{{ isMaintenance ? '保养执行记录' : '故障处理记录' }}</h3>
      <CellGroup>
        <Cell title="设备" :value="record.equipmentName" />
        <Cell title="记录编号" :value="String(record.id)" />
        <Cell title="当前状态" :value="labels[currentStatus] || currentStatus" />
        <Cell title="原始说明" :label="record.description || '-'" />
        <Cell title="完成时间" :value="record.completedDate || record.resolvedDate || '尚未完成'" />
      </CellGroup>
      <Form ref="formRef" :disabled="!canEdit || submitting">
        <Field v-if="canEdit" label="处理动作">
          <template #input
            ><RadioGroup v-model="form.status" direction="horizontal"
              ><Radio
                v-for="status in nextStatuses"
                :key="status"
                :name="status"
                :disabled="submitting"
                >{{ labels[status] }}</Radio
              ></RadioGroup
            ></template
          >
        </Field>
        <Field
          v-model="form.person"
          name="person"
          label="执行人"
          maxlength="50"
          :rules="[
            {
              required: true,
              validator: (value) => Boolean(value?.trim()),
              message: '请填写执行人'
            }
          ]"
        />
        <Field
          v-model="form.result"
          name="result"
          :label="isMaintenance ? '执行结果' : '维修结果'"
          type="textarea"
          rows="3"
          autosize
          :rules="[
            {
              validator: (value) => !finishing || Boolean(value?.trim()),
              message: '请填写处理结果'
            }
          ]"
        />
        <Field
          v-model="form.cost"
          name="cost"
          :label="isMaintenance ? '保养费用' : '维修费用'"
          type="number"
          :rules="[amountRule]"
        />
        <template v-if="isMaintenance">
          <Field v-model="form.partsReplaced" label="更换备件" />
          <Field v-model="form.nextMaintenanceDate" label="下次保养" type="date" />
          <Field
            v-if="form.status === 'completed'"
            v-model="form.completedDate"
            name="completedDate"
            label="完成日期"
            type="date"
            :rules="[{ required: true, message: '请选择完成日期' }]"
          />
        </template>
        <template v-else>
          <Field
            v-model="form.downtimeHours"
            name="downtimeHours"
            label="停机小时"
            type="number"
            :rules="[amountRule]"
          />
          <Field v-model="form.remarks" label="备注" type="textarea" />
        </template>
      </Form>
      <p>完成时记录处理日期。设备运行状态请在设备台账确认。</p>
      <Button v-if="canEdit" block round type="primary" :loading="submitting" @click="submit"
        >保存处理</Button
      >
    </div>
  </Popup>
</template>

<script setup>
  import { computed, reactive, ref, watch } from 'vue'
  import { Popup, Cell, CellGroup, Form, Field, Radio, RadioGroup, Button, showToast } from 'vant'
  import dayjs from 'dayjs'
  import { useAuthStore } from '@/stores/auth'
  import { equipmentApi } from '@/api'

  const props = defineProps({
    show: Boolean,
    record: { type: Object, default: null },
    kind: { type: String, required: true }
  })
  const emit = defineEmits(['update:show', 'saved'])
  const authStore = useAuthStore()
  const formRef = ref()
  const submitting = ref(false)
  const form = reactive({
    status: '',
    person: '',
    result: '',
    cost: '0',
    partsReplaced: '',
    nextMaintenanceDate: '',
    completedDate: '',
    downtimeHours: '0',
    remarks: ''
  })
  const labels = {
    pending: '待执行',
    in_progress: '执行中',
    completed: '已完成',
    reported: '已上报',
    diagnosing: '诊断中',
    repairing: '维修中',
    resolved: '已解决',
    unresolved: '未解决'
  }
  const transitions = {
    pending: ['in_progress'],
    in_progress: ['completed'],
    reported: ['diagnosing', 'repairing'],
    diagnosing: ['repairing', 'unresolved'],
    repairing: ['resolved', 'unresolved'],
    unresolved: ['diagnosing', 'repairing']
  }
  const isMaintenance = computed(() => props.kind === 'maintenance')
  const currentStatus = computed(() => props.record?.status || props.record?.repairStatus)
  const nextStatuses = computed(() => transitions[currentStatus.value] || [])
  const canEdit = computed(
    () => authStore.hasPermission('production:equipment:update') && nextStatuses.value.length > 0
  )
  const finishing = computed(() => ['completed', 'resolved', 'unresolved'].includes(form.status))
  const amountRule = {
    validator: (value) =>
      value !== '' &&
      Number.isFinite(Number(value)) &&
      Number(value) >= 0 &&
      Number(value) <= 99999999.99 &&
      Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 0.000001,
    message: '请输入非负数字，最多两位小数'
  }

  watch(
    () => [props.record, props.show],
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
              ? '0'
              : ''
            : String(isMaintenance.value ? record.cost : record.repairCost),
        partsReplaced: record.partsReplaced || '',
        nextMaintenanceDate: record.nextMaintenanceDate?.slice(0, 10) || '',
        completedDate:
          record.completedDate?.slice(0, 10) || (canEdit.value ? dayjs().format('YYYY-MM-DD') : ''),
        downtimeHours:
          record.downtimeHours == null ? (canEdit.value ? '0' : '') : String(record.downtimeHours),
        remarks: record.remarks || ''
      })
    },
    { immediate: true }
  )

  const close = (value) => {
    if (!submitting.value) emit('update:show', value)
  }
  const submit = async () => {
    if (submitting.value || !canEdit.value) return
    if (!form.person.trim() || (finishing.value && !form.result.trim()))
      return showToast('请填写执行人和处理结果')
    if (
      !amountRule.validator(form.cost) ||
      (!isMaintenance.value && !amountRule.validator(form.downtimeHours))
    )
      return showToast(amountRule.message)
    submitting.value = true
    try {
      await formRef.value?.validate()
      const payload = isMaintenance.value
        ? {
            status: form.status,
            expectedStatus: currentStatus.value,
            maintenancePerson: form.person,
            remarks: form.result,
            cost: Number(form.cost),
            partsReplaced: form.partsReplaced,
            nextMaintenanceDate: form.nextMaintenanceDate || null,
            ...(form.status === 'completed' ? { completedDate: form.completedDate } : {})
          }
        : {
            repairStatus: form.status,
            expectedStatus: currentStatus.value,
            resolvedBy: form.person,
            resolution: form.result,
            repairCost: Number(form.cost),
            downtimeHours: Number(form.downtimeHours),
            remarks: form.remarks
          }
      await (isMaintenance.value ? equipmentApi.updateMaintenance : equipmentApi.updateFailure)(
        props.record.id,
        payload
      )
      showToast({ type: 'success', message: '处理记录已保存' })
      emit('saved')
      emit('update:show', false)
    } catch (error) {
      if (!Array.isArray(error))
        showToast(error?.response?.data?.message || error?.message || '保存失败，请重试')
    } finally {
      submitting.value = false
    }
  }
</script>

<style scoped>
  .record-editor {
    padding: 16px 16px 32px;
  }
  .record-editor h3 {
    margin: 8px 0 20px;
  }
  .record-editor p {
    color: var(--text-secondary);
    font-size: 12px;
    padding: 12px 0;
  }
</style>
