<template>
  <div class="page-container">
    <NavBar title="请假申请" left-arrow @click-left="router.back()" />
    <div class="page-body">
      <CellGroup inset title="请假信息">
        <Cell title="请假类型" is-link :value="form.type || '请选择'" @click="showTypePicker = true" />
        <Cell title="开始日期" is-link :value="form.start_date || '请选择'" @click="showStartPicker = true" />
        <Cell title="结束日期" is-link :value="form.end_date || '请选择'" @click="showEndPicker = true" />
        <Field v-model="form.duration" label="请假天数" type="number" placeholder="请输入天数" />
        <Field v-model="form.reason" type="textarea" rows="3" label="请假事由" placeholder="请输入请假原因" autosize />
      </CellGroup>
      <div class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleSubmit">提交申请</Button>
      </div>
    </div>

    <Popup v-model:show="showTypePicker" round position="bottom">
      <Picker :columns="leaveTypes" @confirm="onTypeConfirm" @cancel="showTypePicker = false" />
    </Popup>
    <Popup v-model:show="showStartPicker" round position="bottom">
      <DatePicker v-model="startDate" title="选择开始日期" @confirm="onStartConfirm" @cancel="showStartPicker = false" />
    </Popup>
    <Popup v-model:show="showEndPicker" round position="bottom">
      <DatePicker v-model="endDate" title="选择结束日期" @confirm="onEndConfirm" @cancel="showEndPicker = false" />
    </Popup>
  </div>
</template>

<script setup>
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { NavBar, CellGroup, Cell, Field, Button, Popup, Picker, DatePicker, showToast } from 'vant'
  import { hrApi } from '@/api'

  const router = useRouter()
  const submitting = ref(false)
  const showTypePicker = ref(false)
  const showStartPicker = ref(false)
  const showEndPicker = ref(false)
  const startDate = ref([])
  const endDate = ref([])
  const form = ref({ type: '', start_date: '', end_date: '', duration: '', reason: '' })

  const leaveTypes = ['事假', '病假', '年假', '婚假', '产假', '丧假', '调休']
    .map((type) => ({ text: type, value: type }))

  const onTypeConfirm = ({ selectedOptions, selectedValues }) => {
    form.value.type = selectedOptions?.[0]?.value || selectedValues?.[0] || ''
    showTypePicker.value = false
  }
  const onStartConfirm = ({ selectedValues }) => {
    form.value.start_date = selectedValues.join('-')
    showStartPicker.value = false
  }
  const onEndConfirm = ({ selectedValues }) => {
    form.value.end_date = selectedValues.join('-')
    showEndPicker.value = false
  }

  const handleSubmit = async () => {
    if (!form.value.type) return showToast('请选择请假类型')
    if (!form.value.start_date) return showToast('请选择开始日期')
    if (!form.value.end_date) return showToast('请选择结束日期')
    if (!Number(form.value.duration)) return showToast('请填写请假天数')
    if (!form.value.reason.trim()) return showToast('请填写请假事由')

    submitting.value = true
    try {
      const response = await hrApi.createLeaveRequest({
        type: form.value.type,
        start_date: form.value.start_date,
        end_date: form.value.end_date,
        duration: Number(form.value.duration),
        reason: form.value.reason.trim()
      })
      showToast({ type: 'success', message: response?._message || '请假申请已提交' })
      router.back()
    } catch (error) {
      console.error('提交请假申请失败:', error)
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100%; background: var(--bg-primary); }
  .page-body { padding: 0 12px var(--app-bottom-space); }
  .submit-area { padding: 20px 16px; }
</style>
