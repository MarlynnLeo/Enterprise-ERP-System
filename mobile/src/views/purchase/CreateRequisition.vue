<!--
/**
 * CreateRequisition.vue
 * @description 新建采购申请单页面
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <div class="create-page" :inert="submitting" :aria-busy="submitting">
    <NavBar title="新建采购申请" left-arrow @click-left="$router.go(-1)" />

    <Form @submit="onSubmit" :disabled="submitting || submitted" :inert="submitting || submitted">
      <CellGroup inset title="申请信息">
        <Field
          v-model="form.requestDate"
          is-link
          readonly
          label="申请日期"
          placeholder="请选择"
          @click="showDatePicker = true"
          :rules="[{ required: true, message: '请选择申请日期' }]"
        />
        <Popup v-model:show="showDatePicker" round position="bottom">
          <DatePicker
            v-model="currentDate"
            title="选择日期"
            :min-date="minDate"
            :max-date="maxDate"
            @confirm="onDateConfirm"
            @cancel="showDatePicker = false"
          />
        </Popup>

        <Field
          v-model="form.requester"
          label="申请人"
          placeholder="请输入申请人"
          :rules="[{ required: true, message: '请输入申请人' }]"
        />

        <Field v-model="form.department" label="申请部门" placeholder="选填" />

        <Field
          v-model="form.remarks"
          type="textarea"
          rows="2"
          autosize
          label="申请原因"
          placeholder="选填"
        />
      </CellGroup>

      <CellGroup inset title="需求明细">
        <div v-for="(item, index) in form.items" :key="index" class="material-item">
          <div class="item-header">
            <span>物料需求 {{ index + 1 }}</span>
            <Icon
              name="delete-o"
              color="var(--color-danger)"
              size="18"
              @click="removeItem(index)"
              v-if="form.items.length > 1"
            />
          </div>
          <Field
            v-model="item.materialName"
            label="选择物料"
            placeholder="请选择物料"
            readonly
            is-link
            @click="openMaterialPicker(index)"
            :rules="[{ required: true, message: '请选择物料' }]"
          />
          <div v-if="item.materialCode" class="material-code">物料编码：{{ item.materialCode }}</div>
          <Field
            v-model="item.quantity"
            label="申请数量"
            placeholder="必填"
            type="number"
            :rules="[{ required: true, message: '请输入数量' }]"
          />
          <Field
            v-model="item.requiredDate"
            is-link
            readonly
            label="需求日期"
            placeholder="请选择"
            @click="openItemDatePicker(index)"
          />
        </div>
        <div class="add-btn-wrapper">
          <Button plain type="default" size="small" icon="plus" @click="addItem"
            >添加物料需求</Button
          >
        </div>
      </CellGroup>

      <!-- 明细需求日期弹窗 -->
      <Popup v-model:show="showItemDatePicker" round position="bottom">
        <DatePicker
          title="选择需求日期"
          :min-date="minDate"
          :max-date="maxDate"
          @confirm="onItemDateConfirm"
          @cancel="showItemDatePicker = false"
        />
      </Popup>

      <Popup v-model:show="showMaterialPicker" position="bottom" :style="{ height: '70%' }">
        <div class="material-picker">
          <div class="picker-header">
            <span @click="showMaterialPicker = false">取消</span>
            <span class="picker-title">选择物料</span>
            <span @click="confirmMaterial">确定</span>
          </div>
          <Search
            v-model="materialSearchValue"
            placeholder="搜索物料名称或编码"
            @search="searchMaterials"
          />
          <div class="picker-content">
            <div
              v-for="material in materialList"
              :key="material.id"
              class="material-option"
              :class="{ active: tempSelectedMaterial?.id === material.id }"
              @click="tempSelectedMaterial = material"
            >
              <div>
                <div class="material-name">{{ material.name || '未命名物料' }}</div>
                <div class="material-code">{{ material.code || '无编码' }}</div>
                <div v-if="material.specs" class="material-spec">{{ material.specs }}</div>
              </div>
              <span>{{ material.unit || '件' }}</span>
            </div>
            <Empty v-if="materialList.length === 0" description="暂无可用物料" />
          </div>
        </div>
      </Popup>

      <div class="submit-wrapper">
        <Button round block type="primary" native-type="submit" :loading="submitting" :disabled="submitted">
          提交申请
        </Button>
      </div>
    </Form>
  </div>
</template>

<script setup>
  import { ref, reactive, onBeforeUnmount } from 'vue'
  import { useRouter } from 'vue-router'
  import { NavBar, Form, Field, CellGroup, Button, Popup, DatePicker, Icon, Search, Empty, showToast } from 'vant'
  import { purchaseApi, baseDataApi } from '@/api'
  import { extractApiList } from '@/utils/apiHelper'
  import { getApiErrorMessage } from '@/utils/errorHandler'
  import { useUnsavedChanges } from '@/composables/useUnsavedChanges'

  const router = useRouter()
  const submitting = ref(false)
  const submitted = ref(false)
  let disposed = false
  onBeforeUnmount(() => { disposed = true })

  const showDatePicker = ref(false)
  const showItemDatePicker = ref(false)
  const activeItemIndex = ref(-1)
  const showMaterialPicker = ref(false)
  const materialSearchValue = ref('')
  const materialList = ref([])
  const tempSelectedMaterial = ref(null)

  const today = new Date()
  const minDate = new Date(today.getFullYear() - 1, today.getMonth(), 1)
  const maxDate = new Date(today.getFullYear() + 2, 11, 31)

  const currentDate = ref([today.getFullYear(), today.getMonth() + 1, today.getDate()])

  const formatDate = (dateArr) => {
    return `${dateArr[0]}-${String(dateArr[1]).padStart(2, '0')}-${String(dateArr[2]).padStart(2, '0')}`
  }

  // 纯 camel 提交（后端若尚未 FieldMap，控制器应兼容 camel）
  const form = reactive({
    requestDate: formatDate([today.getFullYear(), today.getMonth() + 1, today.getDate()]),
    requester: '',
    department: '',
    remarks: '',
    items: [{ materialId: '', materialCode: '', materialName: '', quantity: '', requiredDate: '' }]
  })

  const { markSaved } = useUnsavedChanges(form, { busy: submitting })

  const onDateConfirm = ({ selectedValues }) => {
    if (submitting.value || submitted.value || disposed) return
    form.requestDate = formatDate(selectedValues)
    showDatePicker.value = false
  }

  const openItemDatePicker = (index) => {
    if (submitting.value || submitted.value || disposed) return
    activeItemIndex.value = index
    showItemDatePicker.value = true
  }

  const onItemDateConfirm = ({ selectedValues }) => {
    if (submitting.value || submitted.value || disposed) return
    if (activeItemIndex.value !== -1) {
      form.items[activeItemIndex.value].requiredDate = formatDate(selectedValues)
    }
    showItemDatePicker.value = false
  }

  const addItem = () => {
    if (submitting.value || submitted.value || disposed) return
    form.items.push({ materialId: '', materialCode: '', materialName: '', quantity: '', requiredDate: '' })
  }

  const removeItem = (index) => {
    if (submitting.value || submitted.value || disposed) return
    form.items.splice(index, 1)
  }

  const searchMaterials = async () => {
    try {
      const keyword = materialSearchValue.value.trim()
      const response = await baseDataApi.getMaterials({
        page: 1,
        pageSize: 50,
        status: 1,
        ...(keyword ? { name: keyword, code: keyword, specs: keyword } : {})
      })
      materialList.value = extractApiList(response)
    } catch (error) {
      console.error('搜索物料失败:', error)
      showToast(getApiErrorMessage(error, '搜索物料失败'))
    }
  }

  const openMaterialPicker = async (index) => {
    if (submitting.value || submitted.value || disposed) return
    activeItemIndex.value = index
    const item = form.items[index]
    tempSelectedMaterial.value = item.materialId
      ? { id: item.materialId, code: item.materialCode, name: item.materialName }
      : null
    showMaterialPicker.value = true
    if (!materialList.value.length) await searchMaterials()
  }

  const confirmMaterial = () => {
    if (submitting.value || submitted.value || disposed) return
    if (!tempSelectedMaterial.value || activeItemIndex.value < 0) return
    const item = form.items[activeItemIndex.value]
    item.materialId = tempSelectedMaterial.value.id
    item.materialCode = tempSelectedMaterial.value.code || ''
    item.materialName = tempSelectedMaterial.value.name || tempSelectedMaterial.value.code || '未命名物料'
    showMaterialPicker.value = false
  }

  const onSubmit = async () => {
    if (submitting.value || submitted.value || disposed) return
    if (form.items.some((item) => !item.materialId || !item.quantity)) {
      showToast('带有必填项的物料明细填写不完整')
      return
    }

    submitting.value = true
    showDatePicker.value = false
    showItemDatePicker.value = false
    showMaterialPicker.value = false
    const submittedForm = JSON.parse(JSON.stringify(form))
    try {
      const payload = {
        requestDate: submittedForm.requestDate,
        requester: submittedForm.requester,
        department: submittedForm.department,
        remarks: submittedForm.remarks,
        items: submittedForm.items.map((i) => ({
          materialId: parseInt(i.materialId, 10),
          quantity: parseFloat(i.quantity),
          requiredDate: i.requiredDate || null
        }))
      }

      await purchaseApi.createRequisition(payload)
      if (disposed) return
      submitted.value = true
      markSaved(submittedForm)
      showToast('提交申请单成功')
      submitting.value = false
      router.back()
    } catch (error) {
      if (!disposed) showToast(`提交失败：${getApiErrorMessage(error, '系统错误')}`)
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .create-page {
    min-height: 100%;
    background-color: var(--van-background-2);
    padding-bottom: var(--app-bottom-space);
  }
  .material-item {
    background: var(--van-background);
    margin-bottom: 8px;
    border-bottom: 1px dashed var(--van-border-color);
    padding-bottom: 8px;
  }
  .material-code {
    padding: 0 16px 8px;
    color: var(--van-text-color-2);
    font-size: 12px;
  }
  .material-picker {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid var(--van-border-color);
  }
  .picker-title {
    font-weight: 600;
  }
  .picker-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 16px 24px;
  }
  .material-option {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--van-border-color);
  }
  .material-option.active {
    color: var(--van-primary-color);
  }
  .material-name {
    font-weight: 600;
  }
  .material-spec {
    color: var(--van-text-color-2);
    font-size: 12px;
  }
  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    font-size: 0.875rem;
    color: var(--van-text-color-2);
    background: var(--van-background-2);
  }
  .add-btn-wrapper {
    padding: 10px 16px;
  }
  .submit-wrapper {
    margin: 24px 16px;
  }
</style>
