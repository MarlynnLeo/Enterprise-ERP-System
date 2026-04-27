<!--
/**
 * CreateIncoming.vue
 * @description 新建来料检验页面
 * @date 2025-12-27
 * @version 2.0.0
 */
-->
<template>
  <div class="create-page">
    <NavBar title="新建来料检验" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container">
      <Form @submit="onSubmit">
        <!-- 基本信息 -->
        <CellGroup inset title="基本信息">
          <Field
            v-model="form.batch_no"
            name="batch_no"
            label="批次号"
            placeholder="请输入批次号"
            :rules="[{ required: true, message: '请输入批次号' }]"
          />
          <Field
            v-model="form.material_name"
            name="material_name"
            label="物料名称"
            placeholder="请输入物料名称"
            :rules="[{ required: true, message: '请输入物料名称' }]"
          />
          <Field
            v-model="form.supplier_name"
            name="supplier_name"
            label="供应商"
            placeholder="请输入供应商名称"
          />
        </CellGroup>

        <!-- 数量信息 -->
        <CellGroup inset title="数量信息">
          <Field
            v-model="form.quantity"
            name="quantity"
            label="到货数量"
            type="number"
            placeholder="请输入到货数量"
            :rules="[{ required: true, message: '请输入到货数量' }]"
          />
          <Field v-model="form.unit" name="unit" label="单位" placeholder="件/kg/m" />
          <Field
            v-model="form.sample_size"
            name="sample_size"
            label="抽检数量"
            type="number"
            placeholder="请输入抽检数量"
          />
        </CellGroup>

        <!-- 检验信息 -->
        <CellGroup inset title="检验信息">
          <Field
            v-model="form.planned_date"
            name="planned_date"
            label="检验日期"
            placeholder="请选择检验日期"
            readonly
            is-link
            @click="showDatePicker = true"
            :rules="[{ required: true, message: '请选择检验日期' }]"
          />
          <Field
            v-model="form.inspection_method"
            name="inspection_method"
            label="检验类型"
            placeholder="请选择检验类型"
            readonly
            is-link
            @click="showTypePicker = true"
          />
          <Field
            v-model="form.note"
            name="note"
            label="备注"
            type="textarea"
            placeholder="请输入备注信息"
            rows="3"
            autosize
          />
        </CellGroup>

        <div class="submit-section">
          <Button round block type="primary" native-type="submit" :loading="submitting">
            提交检验单
          </Button>
        </div>
      </Form>
    </div>

    <!-- 日期选择器 -->
    <Popup v-model:show="showDatePicker" position="bottom" round>
      <DatePicker
        v-model="currentDate"
        title="选择检验日期"
        @confirm="onDateConfirm"
        @cancel="showDatePicker = false"
      />
    </Popup>

    <!-- 类型选择器 -->
    <Popup v-model:show="showTypePicker" position="bottom" round>
      <Picker
        :columns="inspectionTypes"
        @confirm="onTypeConfirm"
        @cancel="showTypePicker = false"
      />
    </Popup>
  </div>
</template>

<script setup>
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Form,
    Field,
    CellGroup,
    Button,
    Popup,
    DatePicker,
    Picker,
    showToast,
    showLoadingToast,
    closeToast
  } from 'vant'
  import { qualityApi } from '@/services/api'

  const router = useRouter()

  // 表单数据（对齐数据库 quality_inspections 表字段）
  const form = ref({
    batch_no: '',
    material_name: '',
    supplier_name: '',
    quantity: '',
    unit: '件',
    sample_size: '',
    planned_date: '',
    inspection_method: '',
    note: ''
  })

  const submitting = ref(false)
  const showDatePicker = ref(false)
  const showTypePicker = ref(false)

  // 当前日期
  const today = new Date()
  const currentDate = ref([
    today.getFullYear().toString(),
    (today.getMonth() + 1).toString().padStart(2, '0'),
    today.getDate().toString().padStart(2, '0')
  ])

  // 检验类型选项
  const inspectionTypes = [
    { text: '全检', value: 'full' },
    { text: '抽检', value: 'sampling' },
    { text: '免检', value: 'exempt' }
  ]

  // 日期确认
  const onDateConfirm = ({ selectedValues }) => {
    form.value.planned_date = selectedValues.join('-')
    showDatePicker.value = false
  }

  // 类型确认
  const onTypeConfirm = ({ selectedOptions }) => {
    form.value.inspection_method = selectedOptions[0]?.text || ''
    showTypePicker.value = false
  }

  // 提交表单
  const onSubmit = async () => {
    submitting.value = true
    showLoadingToast({ message: '提交中...', forbidClick: true })

    try {
      const data = {
        inspection_type: 'incoming',
        batch_no: form.value.batch_no,
        product_name: form.value.material_name,
        quantity: Number(form.value.quantity),
        unit: form.value.unit,
        planned_date: form.value.planned_date,
        note: form.value.note || undefined,
        status: 'pending'
      }

      await qualityApi.createIncomingInspection(data)
      closeToast()
      showToast('来料检验单创建成功')

      setTimeout(() => {
        router.replace('/quality/incoming')
      }, 500)
    } catch (error) {
      closeToast()
      console.error('创建来料检验失败:', error)
      const msg = error?.response?.data?.message || '创建失败，请重试'
      showToast(msg)
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .create-page {
    min-height: 100vh;
    background-color: var(--van-background-2);
  }

  .content-container {
    padding: 12px;
  }

  .submit-section {
    padding: 24px 16px;
  }
</style>
