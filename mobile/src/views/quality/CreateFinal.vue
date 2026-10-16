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
            v-model="form.batchNo"
            name="batchNo"
            label="批次号"
            placeholder="请输入批次号"
            :rules="[{ required: true, message: '请输入批次号' }]"
          />
          <Field
            v-model="form.productName"
            name="productName" readonly
            label="产品名称"
            placeholder="请输入产品名称"
            :rules="[{ required: true, message: '请输入产品名称' }]"
          />
          <Field
            v-model="form.productCode"
            name="productCode" readonly
            label="产品编码"
            placeholder="请输入产品编码"
          />
          <Field
            v-model="form.referenceNo"
            name="referenceNo"
            label="关联工单号"
            placeholder="请选择生产任务"
            readonly is-link @click="openSources"
            :rules="[{ required: true, message: '请选择生产任务' }]"
          />
        </CellGroup>

        <CellGroup inset title="检验依据">
          <Field v-model="templateName" label="检验模板" readonly is-link placeholder="请选择适用模板" @click="showTemplatePicker = true" />
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
            v-model="form.plannedDate"
            name="plannedDate"
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

        <div class="submit-section" v-permission="'quality:final:create'">
          <Button round block type="primary" native-type="submit" :loading="submitting">
            提交检验单
          </Button>
        </div>
      </Form>
    </div>

    <Popup v-model:show="showSourcePicker" position="bottom" round>
      <Picker title="选择生产任务" :columns="sourceOptions" @confirm="selectSource" @cancel="showSourcePicker = false" />
    </Popup>
    <Popup v-model:show="showTemplatePicker" position="bottom" round>
      <Picker title="选择检验模板" :columns="templateOptions" @confirm="selectTemplate" @cancel="showTemplatePicker = false" />
    </Popup>
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
    Picker,
    showToast,
    showLoadingToast,
    closeToast
  } from 'vant'
  import { extractApiList, extractApiData, extractApiTotal } from '@/utils/apiHelper'
  import { qualityApi } from '@/api'
  import { getApiErrorMessage } from '@/utils/errorHandler'

  const router = useRouter()

  // 表单数据（纯 camel，后端 qualityInspectionMap.fromApi）
  const form = ref({
    batchNo: '',
    productName: '',
    productCode: '',
    referenceNo: '',
    quantity: '',
    unit: '件',
    plannedDate: '',
    note: ''
  })

  const sourceOptions = ref([])
  const templateOptions = ref([])
  const templateName = ref('')
  const showSourcePicker = ref(false)
  const showTemplatePicker = ref(false)
  const openSources = async () => {
    try {
      const response = await qualityApi.getProductionSources({ inspectionType: 'final', pageSize: 100 })
      const tasks = extractApiList(response)
      const total = extractApiTotal(response, tasks.length)
      for (let page = 2; tasks.length < total; page++) {
        const next = extractApiList(await qualityApi.getProductionSources({ inspectionType: 'final', pageSize: 100, page }))
        if (!next.length) break
        tasks.push(...next)
      }
      sourceOptions.value = tasks.map(task => ({ text: `${task.code || task.taskNo} · ${task.productName || task.materialName || ''}`, value: task.id, task }))
      if (!sourceOptions.value.length) { showToast('暂无可用生产任务'); return }
      showSourcePicker.value = true
    } catch (error) { showToast(getApiErrorMessage(error, '生产任务加载失败')) }
  }
  const selectSource = async ({ selectedOptions }) => {
    const task = selectedOptions[0]?.task
    if (!task) return
    Object.assign(form.value, { referenceId: task.id, referenceNo: task.code || task.taskNo,
      productId: task.productId || task.materialId, productName: task.productName || task.materialName,
      productCode: task.productCode || task.materialCode || task.specs || '',
      batchNo: task.batchNo || form.value.batchNo, unit: task.unit || '件',
      quantity: task.completedQuantity || task.quantity || '', templateId: null })
    templateName.value = ''
    templateOptions.value = []
    showSourcePicker.value = false
    try {
      const response = await qualityApi.getInspectionTemplates({ materialType: form.value.productId, inspectionType: 'final', status: 'active', includeGeneral: true, pageSize: 100 })
      templateOptions.value = extractApiList(response).map(template => ({ text: template.name || template.templateName, value: template.id }))
      if (!templateOptions.value.length) showToast('未找到适用的检验模板，请先维护检验项目')
      else showTemplatePicker.value = true
    } catch (error) { showToast(getApiErrorMessage(error, '检验模板加载失败')) }
  }
  const selectTemplate = async ({ selectedOptions }) => {
    const option = selectedOptions[0]
    if (!option) return
    try {
      const response = await qualityApi.getInspectionTemplate(option.value)
      const template = extractApiData(response, null)
      if (!(template?.items || template?.inspectionItems || []).length) { showToast('模板没有检验项目，请先维护'); return }
      form.value.templateId = option.value
      templateName.value = option.text
      showTemplatePicker.value = false
    } catch (error) { showToast(getApiErrorMessage(error, '检验模板加载失败')) }
  }
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
    form.value.plannedDate = selectedValues.join('-')
    showDatePicker.value = false
  }

  // 提交表单
  const onSubmit = async () => {
    if (submitting.value) return
    if (!Number.isFinite(Number(form.value.quantity)) || Number(form.value.quantity) <= 0) { showToast('检验数量必须大于0'); return }
    if (!form.value.referenceId || !form.value.productId) { showToast('请选择有效的生产任务和产品'); return }
    if (!form.value.templateId) { showToast('请选择适用的检验模板'); return }
    submitting.value = true
    showLoadingToast({ message: '提交中...', forbidClick: true })

    try {
      const data = {
        referenceId: form.value.referenceId,
        productId: form.value.productId,
        sourceType: 'production',
        templateId: form.value.templateId,
        inspectionType: 'final',
        batchNo: form.value.batchNo,
        productName: form.value.productName,
        productCode: form.value.productCode,
        referenceNo: form.value.referenceNo || undefined,
        quantity: Number(form.value.quantity),
        unit: form.value.unit,
        plannedDate: form.value.plannedDate,
        note: form.value.note || undefined,
        status: 'pending'
      }

      await qualityApi.createFinalInspection(data)
      closeToast()
      showToast('成品检验单创建成功')

      setTimeout(() => {
        router.replace('/quality/final')
      }, 500)
    } catch (error) {
      closeToast()
      console.error('创建成品检验失败:', error)
      const msg = getApiErrorMessage(error, '创建失败，请重试')
      showToast(msg)
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .create-page {
    min-height: 100%;
    background-color: var(--van-background-2);
  }

  .content-container {
    padding: 12px;
  }

  .submit-section {
    padding: 24px 16px;
  }
</style>
