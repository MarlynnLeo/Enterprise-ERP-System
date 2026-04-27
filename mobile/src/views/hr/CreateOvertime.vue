<template>
  <div class="page-container">
    <NavBar title="加班申请" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <CellGroup inset title="加班信息">
        <Cell title="加班日期" is-link :value="form.date || '请选择'" @click="showDatePicker = true" />
        <Field v-model="form.start_time" label="开始时间" placeholder="如 18:00" />
        <Field v-model="form.end_time" label="结束时间" placeholder="如 21:00" />
        <Field v-model="form.hours" label="加班时长(h)" type="digit" placeholder="小时数" />
        <Cell title="加班类型" is-link :value="form.type || '请选择'" @click="showTypePicker = true" />
        <Field v-model="form.reason" type="textarea" rows="3" label="加班原因" placeholder="请输入加班原因..." autosize />
      </CellGroup>
      <div class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleSubmit">提交申请</Button>
      </div>
    </div>

    <Popup v-model:show="showDatePicker" round position="bottom">
      <DatePicker v-model="dateVal" title="选择加班日期" @confirm="onDateConfirm" @cancel="showDatePicker = false" />
    </Popup>
    <Popup v-model:show="showTypePicker" round position="bottom">
      <Picker :columns="overtimeTypes" @confirm="onTypeConfirm" @cancel="showTypePicker = false" />
    </Popup>
  </div>
</template>

<script setup>
  import { ref } from 'vue'
  import { NavBar, CellGroup, Cell, Field, Button, Popup, Picker, DatePicker, showToast } from 'vant'
  import { useRouter } from 'vue-router'

  const router = useRouter()
  const submitting = ref(false)
  const showDatePicker = ref(false)
  const showTypePicker = ref(false)
  const dateVal = ref([])
  const form = ref({ date: '', start_time: '', end_time: '', hours: '', type: '', reason: '' })

  const overtimeTypes = ['工作日加班', '周末加班', '节假日加班']

  const onDateConfirm = ({ selectedValues }) => { form.value.date = selectedValues.join('-'); showDatePicker.value = false }
  const onTypeConfirm = ({ selectedValues }) => { form.value.type = selectedValues[0]; showTypePicker.value = false }

  const handleSubmit = async () => {
    if (!form.value.date) return showToast('请选择加班日期')
    if (!form.value.hours) return showToast('请填写加班时长')
    if (!form.value.reason) return showToast('请填写加班原因')
    submitting.value = true
    try {
      showToast('加班申请已提交，等待审批')
      setTimeout(() => router.go(-1), 800)
    } finally { submitting.value = false }
  }
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
  .submit-area { padding: 20px 16px; }
</style>
