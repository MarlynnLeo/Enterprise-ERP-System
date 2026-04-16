<!--
/**
 * CreateTask.vue - 新建生产任务
 * @description 统一卡片风格
 * @date 2026-04-15
 * @version 3.0.0
 */
-->
<template>
  <div class="create-page">
    <NavBar title="新建任务" left-arrow @click-left="$router.go(-1)" />

    <div class="content-wrapper">
      <div class="info-section">
        <div class="section-title">任务信息</div>
        <Form @submit="handleSubmit">
          <CellGroup inset>
            <Field v-model="formData.task_code" label="任务编号" placeholder="自动生成" readonly />
            <Field
              v-model="formData.product_name"
              label="产品名称"
              placeholder="请输入产品名称"
              is-link
              readonly
              @click="showProductPicker = true"
              :rules="[{ required: true }]"
            />
            <Field
              v-model="formData.quantity"
              type="number"
              label="任务数量"
              placeholder="请输入任务数量"
              :rules="[{ required: true }]"
            />
            <Field v-model="formData.unit" label="单位" placeholder="件" />
            <Field
              v-model="formData.plan_start_time"
              label="开始时间"
              placeholder="请选择"
              is-link
              readonly
              @click="showStartPicker = true"
            />
            <Field
              v-model="formData.plan_end_time"
              label="结束时间"
              placeholder="请选择"
              is-link
              readonly
              @click="showEndPicker = true"
            />
            <Field
              v-model="formData.remark"
              type="textarea"
              label="备注"
              placeholder="请输入备注"
              rows="3"
            />
          </CellGroup>

          <div class="action-bar">
            <VanButton type="primary" block round native-type="submit" :loading="submitting"
              >创建任务</VanButton
            >
          </div>
        </Form>
      </div>
    </div>

    <!-- 日期选择器 -->
    <Popup v-model:show="showStartPicker" position="bottom">
      <DatePicker
        v-model="startDate"
        title="选择开始时间"
        @confirm="onStartConfirm"
        @cancel="showStartPicker = false"
      />
    </Popup>
    <Popup v-model:show="showEndPicker" position="bottom">
      <DatePicker
        v-model="endDate"
        title="选择结束时间"
        @confirm="onEndConfirm"
        @cancel="showEndPicker = false"
      />
    </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Form,
    Field,
    CellGroup,
    Popup,
    DatePicker,
    Button as VanButton,
    showToast
  } from 'vant'
  import { productionApi } from '@/services/api'
  import dayjs from 'dayjs'

  const router = useRouter()
  const submitting = ref(false)
  const showProductPicker = ref(false)
  const showStartPicker = ref(false)
  const showEndPicker = ref(false)
  const startDate = ref([])
  const endDate = ref([])

  const formData = reactive({
    task_code: `SCT${dayjs().format('YYMMDD')}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
    product_name: '',
    product_id: null,
    quantity: '',
    unit: '件',
    plan_start_time: '',
    plan_end_time: '',
    remark: ''
  })

  const onStartConfirm = ({ selectedValues }) => {
    formData.plan_start_time = selectedValues.join('-')
    showStartPicker.value = false
  }
  const onEndConfirm = ({ selectedValues }) => {
    formData.plan_end_time = selectedValues.join('-')
    showEndPicker.value = false
  }

  const handleSubmit = async () => {
    if (!formData.product_name || !formData.quantity) {
      showToast('请填写必填项')
      return
    }
    submitting.value = true
    try {
      await productionApi.createProductionTask({
        task_code: formData.task_code,
        product_name: formData.product_name,
        planned_quantity: Number(formData.quantity),
        unit_name: formData.unit,
        plan_start_time: formData.plan_start_time,
        plan_end_time: formData.plan_end_time,
        remark: formData.remark
      })
      showToast('创建成功')
      router.go(-1)
    } catch (e) {
      console.error('创建任务失败:', e)
      showToast('创建失败')
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .create-page {
    min-height: 100vh;
    background: var(--bg-primary);
    padding-bottom: 120px;
  }
  .content-wrapper {
    padding: 12px;
  }

  .info-section {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
  }
  .section-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 12px;
  }
  .action-bar {
    margin-top: 24px;
    padding: 0 16px;
  }
</style>
