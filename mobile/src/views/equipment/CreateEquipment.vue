<template>
  <div class="create-page">
    <NavBar title="新增设备" left-arrow @click-left="router.back()">
      <template #right>
        <Button type="primary" size="small" :loading="submitting" @click="handleSubmit">保存</Button>
      </template>
    </NavBar>

    <div class="content">
      <Form ref="formRef">
        <CellGroup inset title="基本信息">
          <Field v-model="form.code" name="code" label="设备编号" placeholder="请输入设备编号" :rules="[{ required: true, message: '请输入设备编号' }]" />
          <Field v-model="form.name" name="name" label="设备名称" placeholder="请输入设备名称" :rules="[{ required: true, message: '请输入设备名称' }]" />
          <Field v-model="form.model" name="model" label="类别/型号" placeholder="请输入类别或型号" />
          <Field v-model="form.manufacturer" name="manufacturer" label="厂商" placeholder="请输入厂商" />
          <Field v-model="form.specs" name="specs" label="规格" placeholder="请输入规格参数" />
        </CellGroup>

        <CellGroup inset title="使用信息">
          <Field v-model="form.location" name="location" label="位置" placeholder="请输入所在位置" />
          <Field v-model="form.responsible_person" name="responsible_person" label="负责人" placeholder="请输入负责人" />
          <Cell title="设备状态" is-link :value="statusText" @click="showStatusPicker = true" />
          <Field v-model="form.purchase_date" name="purchase_date" label="购置日期" type="date" />
          <Field v-model="form.inspection_date" name="inspection_date" label="检验日期" type="date" />
          <Field v-model="form.next_inspection_date" name="next_inspection_date" label="下次检验" type="date" />
        </CellGroup>

        <CellGroup inset title="备注">
          <Field v-model="form.description" name="description" type="textarea" rows="3" autosize placeholder="请输入设备说明" />
        </CellGroup>
      </Form>

      <div class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleSubmit">保存设备</Button>
      </div>
    </div>

    <Popup v-model:show="showStatusPicker" round position="bottom">
      <Picker :columns="statusOptions" @confirm="onStatusConfirm" @cancel="showStatusPicker = false" />
    </Popup>
  </div>
</template>

<script setup>
  import { computed, reactive, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { Button, Cell, CellGroup, Field, Form, NavBar, Picker, Popup, showToast } from 'vant'
  import { equipmentApi } from '@/api'

  const route = useRoute()
  const router = useRouter()
  const formRef = ref()
  const submitting = ref(false)
  const showStatusPicker = ref(false)

  const form = reactive({
    code: '',
    name: '',
    model: route.query.focus === 'type' ? '' : '',
    manufacturer: '',
    specs: '',
    location: '',
    responsible_person: '',
    status: 'normal',
    purchase_date: '',
    inspection_date: '',
    next_inspection_date: '',
    description: ''
  })

  const statusOptions = [
    { text: '正常', value: 'normal' },
    { text: '闲置', value: 'idle' },
    { text: '保养中', value: 'maintenance' },
    { text: '维修中', value: 'repair' },
    { text: '报废', value: 'scrapped' }
  ]

  const statusText = computed(() => statusOptions.find((item) => item.value === form.status)?.text || form.status)

  const onStatusConfirm = ({ selectedOptions }) => {
    form.status = selectedOptions[0]?.value || 'normal'
    showStatusPicker.value = false
  }

  const handleSubmit = async () => {
    try {
      await formRef.value?.validate()
      submitting.value = true
      await equipmentApi.createEquipment({
        ...form,
        code: form.code.trim(),
        name: form.name.trim()
      })
      showToast({ type: 'success', message: '设备已创建' })
      router.back()
    } catch (error) {
      if (error?.message) console.error('创建设备失败:', error)
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .create-page {
    min-height: 100%;
    background: var(--bg-primary);
  }

  .content {
    padding: 12px 0 24px;
  }

  .submit-area {
    padding: 20px 16px;
  }
</style>
