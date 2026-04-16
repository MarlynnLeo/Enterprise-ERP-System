<!--
/**
 * CreateFinal.vue
 * @description 新建成品检验页面
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <div class="create-page">
    <NavBar title="新建成品检验" left-arrow @click-left="$router.go(-1)" />

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
            v-model="form.product_name"
            name="product_name"
            label="产品名称"
            placeholder="请输入产品名称"
            :rules="[{ required: true, message: '请输入产品名称' }]"
          />
          <Field
            v-model="form.product_code"
            name="product_code"
            label="产品编码"
            placeholder="请输入产品编码"
          />
          <Field
            v-model="form.reference_no"
            name="reference_no"
            label="关联工单号"
            placeholder="请输入生产工单号"
          />
        </CellGroup>

        <!-- 数量信息 -->
        <CellGroup inset title="数量信息">
          <Field
            v-model="form.quantity"
            name="quantity"
            label="检验数量"
            type="number"
            placeholder="请输入检验数量"
            :rules="[{ required: true, message: '请输入检验数量' }]"
          />
          <Field v-model="form.unit" name="unit" label="单位" placeholder="件/kg/m" />
        </CellGroup>

        <!-- 检验信息 -->
        <CellGroup inset title="检验信息">
          <Field
            v-model="form.planned_date"
            name="planned_date"
            label="计划检验日期"
            placeholder="请选择检验日期"
            readonly
            is-link
            @click="showDatePicker = true"
            :rules="[{ required: true, message: '请选择检验日期' }]"
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
    showToast,
    showLoadingToast,
    closeToast
  } from 'vant'
  import { qualityApi } from '@/services/api'

  const router = useRouter()

  // 表单数据（对齐数据库 quality_inspections 表字段）
  const form = ref({
    batch_no: '',
    product_name: '',
    product_code: '',
    reference_no: '',
    quantity: '',
    unit: '件',
    planned_date: '',
    note: ''
  })

  const submitting = ref(false)
  const showDatePicker = ref(false)

  // 当前日期
  const today = new Date()
  const currentDate = ref([
    today.getFullYear().toString(),
    (today.getMonth() + 1).toString().padStart(2, '0'),
    today.getDate().toString().padStart(2, '0')
  ])

  // 日期确认
  const onDateConfirm = ({ selectedValues }) => {
    form.value.planned_date = selectedValues.join('-')
    showDatePicker.value = false
  }

  // 提交表单
  const onSubmit = async () => {
    submitting.value = true
    showLoadingToast({ message: '提交中...', forbidClick: true })

    try {
      const data = {
        inspection_type: 'final',
        batch_no: form.value.batch_no,
        product_name: form.value.product_name,
        product_code: form.value.product_code,
        reference_no: form.value.reference_no || undefined,
        quantity: Number(form.value.quantity),
        unit: form.value.unit,
        planned_date: form.value.planned_date,
        note: form.value.note || undefined,
        status: 'pending'
      }

      await qualityApi.createFinalInspection(data)
      closeToast()
      showToast('✓ 成品检验单创建成功')

      setTimeout(() => {
        router.replace('/quality/final')
      }, 500)
    } catch (error) {
      closeToast()
      console.error('创建成品检验失败:', error)
      const msg = error?.response?.data?.message || '创建失败，请重试'
      showToast(msg)
    } finally {
      submitting.value = false
    }
  }
</script>

<style scoped>
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
