<template>
  <div class="create-page">
    <NavBar title="新建来料检验" left-arrow @click-left="$router.go(-1)" />
    <div class="content-container">
      <Form @submit="onSubmit">
        <CellGroup inset title="采购来源">
          <Field v-model="form.referenceNo" label="采购订单" placeholder="请选择采购订单"
            readonly is-link :rules="[{ required: true, message: '请选择采购订单' }]" @click="openOrderPicker" />
          <Field v-model="form.supplierName" label="供应商" readonly placeholder="随采购订单带入" />
          <Field v-model="form.materialName" label="物料名称" placeholder="请选择订单物料"
            readonly is-link :rules="[{ required: true, message: '请选择订单物料' }]" @click="openMaterialPicker" />
        </CellGroup>
        <CellGroup inset title="数量信息">
          <Field v-model="form.batchNo" label="批次号" placeholder="请输入到货批次号" maxlength="50"
            :rules="[{ required: true, message: '请输入批次号' }]" />
          <Field v-model="form.quantity" label="到货数量" type="number" placeholder="请输入到货数量"
            :rules="[{ required: true, message: '请输入到货数量' }]" />
          <Field v-model="form.unit" label="单位" readonly placeholder="随订单物料带入" />
        </CellGroup>
        <CellGroup inset title="检验信息">
          <Field v-model="form.templateName" label="检验模板" placeholder="请选择适用的检验模板"
            readonly is-link :rules="[{ required: true, message: '请选择检验模板' }]" @click="openTemplatePicker" />
          <Field v-model="form.plannedDate" label="检验日期" placeholder="请选择检验日期"
            readonly is-link @click="showDatePicker = true"
            :rules="[{ required: true, message: '请选择检验日期' }]" />
          <Field :model-value="inspectionMethodLabel" label="检验方式" readonly is-link @click="showTypePicker = true" />
          <Field v-model="form.note" label="备注" type="textarea" placeholder="请输入备注信息" rows="3" autosize />
        </CellGroup>
        <div class="submit-section">
          <Button round block type="primary" native-type="submit" :loading="submitting" :disabled="orderLoading || templateLoading">
            提交检验单
          </Button>
        </div>
      </Form>
    </div>

    <Popup v-model:show="showOrderPicker" position="bottom" round :style="{ height: '65%' }">
      <div class="picker-content">
        <h3>选择采购订单</h3>
        <Search v-model="orderKeyword" placeholder="输入采购单号或供应商搜索" show-action @search="searchOrders">
          <template #action><span @click="searchOrders">搜索</span></template>
        </Search>
        <Cell v-for="order in orderOptions" :key="order.id" :title="order.orderNo"
          :label="order.supplierName" is-link @click="selectOrder(order)" />
        <Empty v-if="!ordersLoading && orderOptions.length === 0" description="暂无可检验的采购订单" />
        <Button v-if="!ordersFinished" block plain :loading="ordersLoading" @click="loadOrders(false)">加载更多</Button>
      </div>
    </Popup>
    <Popup v-model:show="showMaterialPicker" position="bottom" round>
      <Picker title="选择订单物料" :columns="materialOptions" @confirm="onMaterialConfirm" @cancel="showMaterialPicker = false" />
    </Popup>
    <Popup v-model:show="showTemplatePicker" position="bottom" round>
      <Picker title="选择检验模板" :columns="templateOptions" :loading="templateLoading"
        @confirm="onTemplateConfirm" @cancel="showTemplatePicker = false" />
    </Popup>
    <Popup v-model:show="showDatePicker" position="bottom" round>
      <DatePicker v-model="currentDate" title="选择检验日期" @confirm="onDateConfirm" @cancel="showDatePicker = false" />
    </Popup>
    <Popup v-model:show="showTypePicker" position="bottom" round>
      <Picker :columns="inspectionTypes" @confirm="onTypeConfirm" @cancel="showTypePicker = false" />
    </Popup>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NavBar, Form, Field, Cell, CellGroup, Button, Popup, DatePicker, Picker, Search, Empty,
  showToast, showLoadingToast, closeToast } from 'vant'
import { purchaseApi, qualityApi } from '@/api'
import { extractApiData, extractApiList, extractApiTotal } from '@/utils/apiHelper'

const router = useRouter()
const today = new Date()
const currentDate = ref([String(today.getFullYear()), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')])
const form = ref({
  referenceId: null, referenceNo: '', supplierId: null, supplierName: '',
  materialId: null, materialName: '', materialCode: '', unitId: null, unit: '',
  batchNo: '', quantity: '', templateId: null, templateName: '',
  plannedDate: currentDate.value.join('-'), inspectionMethod: 'sampling', note: ''
})
const submitting = ref(false)
const showOrderPicker = ref(false)
const showMaterialPicker = ref(false)
const showTemplatePicker = ref(false)
const showDatePicker = ref(false)
const showTypePicker = ref(false)
const orderKeyword = ref('')
const orderOptions = ref([])
const orderItems = ref([])
const ordersLoading = ref(false)
const orderLoading = ref(false)
const ordersFinished = ref(false)
const templateLoading = ref(false)
const templateOptions = ref([])
let orderPage = 1
let activeOrderKeyword = ''
let orderListRequest = 0
let orderSelection = 0
let templateRequest = 0
const validOrderStatuses = ['confirmed', 'approved', 'received', 'partial_received', 'inspecting', 'inspected', 'warehousing']
const inspectionTypes = [{ text: '全检', value: 'full' }, { text: '抽检', value: 'sampling' }]
const inspectionMethodLabel = computed(() => inspectionTypes.find(item => item.value === form.value.inspectionMethod)?.text || '抽检')
const materialOptions = computed(() => orderItems.value.map(item => ({
  text: ((item.materialCode || '') + ' ' + (item.materialName || '')).trim(), value: String(item.id)
})))

const loadOrders = async (reset = false) => {
  if (ordersLoading.value && !reset) return
  if (reset) {
    orderPage = 1
    activeOrderKeyword = orderKeyword.value.trim()
    orderOptions.value = []
    ordersFinished.value = false
  }
  const request = ++orderListRequest
  const page = orderPage
  const keyword = activeOrderKeyword
  ordersLoading.value = true
  try {
    const response = await purchaseApi.getOrders({ page, pageSize: 50, keyword: keyword || undefined })
    if (request !== orderListRequest) return
    const list = extractApiList(response)
    orderOptions.value.push(...list.filter(order => validOrderStatuses.includes(order.status)))
    const total = extractApiTotal(response)
    ordersFinished.value = list.length < 50 || (total >= 0 && page * 50 >= total)
    orderPage = page + 1
  } catch (error) {
    if (request === orderListRequest) showToast(error.response?.data?.message || '采购订单加载失败')
  } finally {
    if (request === orderListRequest) ordersLoading.value = false
  }
}
const searchOrders = () => loadOrders(true)
const openOrderPicker = () => {
  showOrderPicker.value = true
  if (orderOptions.value.length === 0) loadOrders(true)
}
const clearMaterial = () => {
  templateRequest++
  Object.assign(form.value, { materialId: null, materialName: '', materialCode: '', quantity: '', unitId: null, unit: '', templateId: null, templateName: '' })
  templateOptions.value = []
  templateLoading.value = false
}
const selectOrder = async (order) => {
  const selection = ++orderSelection
  clearMaterial()
  orderItems.value = []
  Object.assign(form.value, { referenceId: null, referenceNo: '', supplierId: null, supplierName: '' })
  orderLoading.value = true
  try {
    const response = await purchaseApi.getOrder(order.id)
    if (selection !== orderSelection) return
    const detail = extractApiData(response)
    if (!detail.id || !validOrderStatuses.includes(detail.status)) throw new Error('请选择已确认的有效采购订单')
    Object.assign(form.value, { referenceId: detail.id, referenceNo: detail.orderNo, supplierId: detail.supplierId, supplierName: detail.supplierName || '' })
    orderItems.value = (detail.items || []).filter(item => item.materialId)
    showOrderPicker.value = false
  } catch (error) {
    if (selection === orderSelection) showToast(error.response?.data?.message || error.message || '采购订单明细加载失败')
  } finally {
    if (selection === orderSelection) orderLoading.value = false
  }
}
const openMaterialPicker = () => {
  if (!form.value.referenceId) return showToast('请先选择采购订单')
  if (orderItems.value.length === 0) return showToast('采购订单没有可检验的物料')
  showMaterialPicker.value = true
}
const loadTemplates = async () => {
  const request = ++templateRequest
  const materialId = form.value.materialId
  templateLoading.value = true
  try {
    const options = []
    for (let page = 1; ; page++) {
      const response = await qualityApi.getInspectionTemplates({ page, pageSize: 100, inspectionType: 'incoming', status: 'active', materialType: materialId, includeGeneral: true })
      if (request !== templateRequest) return
      const list = extractApiList(response)
      options.push(...list.filter(item => (item.inspectionItems || item.InspectionItems || item.items || []).length > 0)
        .map(item => ({ text: item.templateName, value: String(item.id) })))
      const total = extractApiTotal(response)
      if (list.length < 100 || (total >= 0 && page * 100 >= total)) break
    }
    templateOptions.value = options
    if (options.length === 1) {
      form.value.templateId = Number(options[0].value)
      form.value.templateName = options[0].text
    }
    if (options.length === 0) showToast('该物料暂无有效来料检验模板，请先维护模板')
  } catch (error) {
    if (request === templateRequest) showToast(error.response?.data?.message || '检验模板加载失败')
  } finally {
    if (request === templateRequest) templateLoading.value = false
  }
}
const onMaterialConfirm = ({ selectedOptions }) => {
  const item = orderItems.value.find(item => String(item.id) === String(selectedOptions[0]?.value))
  if (!item) return
  clearMaterial()
  Object.assign(form.value, { materialId: item.materialId, materialName: item.materialName, materialCode: item.materialCode || '', unitId: item.unitId, unit: item.unitName || item.unit || '', quantity: String(item.quantity ?? '') })
  showMaterialPicker.value = false
  loadTemplates()
}
const openTemplatePicker = () => {
  if (!form.value.materialId) return showToast('请先选择订单物料')
  if (!templateLoading.value && templateOptions.value.length === 0) loadTemplates()
  showTemplatePicker.value = true
}
const onTemplateConfirm = ({ selectedOptions }) => {
  const option = templateOptions.value.find(item => item.value === selectedOptions[0]?.value)
  if (!option) return
  form.value.templateId = Number(option.value)
  form.value.templateName = option.text
  showTemplatePicker.value = false
}
const onDateConfirm = ({ selectedValues }) => {
  form.value.plannedDate = selectedValues.join('-')
  showDatePicker.value = false
}
const onTypeConfirm = ({ selectedOptions }) => {
  form.value.inspectionMethod = selectedOptions[0]?.value || 'sampling'
  showTypePicker.value = false
}
const onSubmit = async () => {
  if (submitting.value || orderLoading.value || templateLoading.value) return
  if (!form.value.referenceId || !form.value.referenceNo) return showToast('请选择采购订单')
  if (!form.value.materialId || !form.value.unit) return showToast('请选择有效的订单物料')
  if (!form.value.templateId) return showToast('请选择有效的检验模板')
  const quantity = Number(form.value.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return showToast('到货数量必须是大于0的有效数字')
  if (!form.value.batchNo.trim() || !form.value.plannedDate) return showToast('请填写批次号和检验日期')
  submitting.value = true
  showLoadingToast({ message: '提交中...', forbidClick: true })
  try {
    await qualityApi.createIncomingInspection({
      inspectionType: 'incoming', sourceType: 'purchase_order',
      referenceId: form.value.referenceId, referenceNo: form.value.referenceNo,
      materialId: form.value.materialId, productName: form.value.materialName,
      supplierId: form.value.supplierId, batchNo: form.value.batchNo.trim(),
      quantity, unit: form.value.unit, unitId: form.value.unitId,
      templateId: form.value.templateId, isFullInspection: form.value.inspectionMethod === 'full',
      plannedDate: form.value.plannedDate, note: form.value.note || undefined, status: 'pending'
    })
    closeToast()
    showToast('来料检验单创建成功')
    router.replace('/quality/incoming')
  } catch (error) {
    closeToast()
    showToast(error.response?.data?.message || '创建失败，请重试')
  } finally {
    submitting.value = false
  }
}
</script>

<style lang="scss" scoped>
.create-page { min-height: 100%; background-color: var(--van-background-2); }
.content-container { padding: 12px; }
.submit-section { padding: 24px 16px; }
.picker-content { padding: 16px; }
.picker-content h3 { margin: 0 0 12px; }
</style>
