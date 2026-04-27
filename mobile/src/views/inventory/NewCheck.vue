<!--
/**
 * NewCheck.vue
 * @description 新建盘点单
 * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="unified-page">
    <NavBar title="新建盘点单" left-arrow @click-left="onClickLeft" />

    <div class="content-container">
      <Form @submit="onSubmit">
        <CellGroup inset title="基本信息">
          <Field
            v-model="checkForm.check_date"
            name="check_date"
            label="盘点日期"
            placeholder="选择盘点日期"
            readonly
            is-link
            @click="showDatePicker = true"
          />

          <Field
            v-model="checkTypeText"
            name="check_type"
            label="盘点类型"
            placeholder="选择盘点类型"
            readonly
            is-link
            @click="showCheckTypePicker = true"
          />

          <Field
            v-model="warehouseText"
            name="warehouse_id"
            label="仓库/库区"
            placeholder="选择仓库/库区"
            readonly
            is-link
            @click="showWarehousePicker = true"
          />
        </CellGroup>

        <CellGroup inset title="盘点描述">
          <Field
            v-model="checkForm.description"
            name="description"
            type="textarea"
            rows="3"
            autosize
            label="盘点描述"
            placeholder="请输入盘点描述"
          />
        </CellGroup>

        <CellGroup inset>
          <Field
            v-model="checkForm.remarks"
            name="remarks"
            type="textarea"
            rows="3"
            autosize
            label="备注"
            placeholder="请输入备注信息"
          />
        </CellGroup>

        <div style="margin: 16px">
          <Button round block type="primary" native-type="submit" :loading="submitting">
            保存并继续
          </Button>
        </div>
      </Form>
    </div>

    <!-- 日期选择器 -->
    <Popup v-model:show="showDatePicker" position="bottom">
      <DatePicker
        v-model="checkForm.check_date"
        title="选择盘点日期"
        :min-date="minDate"
        :max-date="maxDate"
        @confirm="showDatePicker = false"
        @cancel="showDatePicker = false"
      />
    </Popup>

    <!-- 盘点类型选择器 -->
    <Popup v-model:show="showCheckTypePicker" position="bottom">
      <Picker
        :columns="checkTypeOptions.map(item => ({ text: item.label, value: item.value }))"
        @confirm="onCheckTypeConfirm"
        @cancel="showCheckTypePicker = false"
      />
    </Popup>

    <!-- 仓库选择器 -->
    <Popup v-model:show="showWarehousePicker" position="bottom">
      <Picker
        :columns="warehouseOptions.map(item => ({ text: item.name, value: item.id }))"
        @confirm="onWarehouseConfirm"
        @cancel="showWarehousePicker = false"
        :loading="loadingWarehouses"
      />
    </Popup>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
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
    showToast
  } from 'vant'
  import { inventoryApi } from '@/services/api'

  // 获取当前日期 YYYY-MM-DD
  const getCurrentDate = () => new Date().toISOString().slice(0, 10)

  const router = useRouter()
  const submitting = ref(false)
  const showDatePicker = ref(false)
  const showCheckTypePicker = ref(false)
  const showWarehousePicker = ref(false)
  const loadingWarehouses = ref(false)
  const warehouseOptions = ref([])

  // 盘点单表单
  const checkForm = ref({
    check_date: getCurrentDate(),
    check_type: 'cycle',
    warehouse_id: '',
    description: '',
    remarks: '',
    items: []
  })

  // 日期范围
  const minDate = new Date()
  minDate.setMonth(minDate.getMonth() - 1)
  const maxDate = new Date()
  maxDate.setMonth(maxDate.getMonth() + 1)

  // 盘点类型选项
  const checkTypeOptions = [
    { value: 'cycle', label: '周期盘点' },
    { value: 'random', label: '随机盘点' },
    { value: 'full', label: '全面盘点' },
    { value: 'special', label: '专项盘点' }
  ]

  // 计算属性：获取盘点类型文本
  const checkTypeText = computed(() => {
    const type = checkTypeOptions.find((item) => item.value === checkForm.value.check_type)
    return type ? type.label : ''
  })

  // 计算属性：获取仓库文本
  const warehouseText = computed(() => {
    const warehouse = warehouseOptions.value.find(
      (item) => item.id === checkForm.value.warehouse_id
    )
    return warehouse ? warehouse.name : ''
  })

  // 返回上一页
  const onClickLeft = () => {
    router.push('/inventory/check')
  }

  // 盘点类型确认 (Vant 4 格式)
  const onCheckTypeConfirm = ({ selectedValues }) => {
    if (selectedValues && selectedValues.length > 0) {
      checkForm.value.check_type = selectedValues[0]
    }
    showCheckTypePicker.value = false
  }

  // 仓库确认 (Vant 4 格式)
  const onWarehouseConfirm = ({ selectedValues }) => {
    if (selectedValues && selectedValues.length > 0) {
      checkForm.value.warehouse_id = selectedValues[0]
    }
    showWarehousePicker.value = false
  }

  // 表单提交
  const onSubmit = async () => {
    if (!checkForm.value.check_date) {
      showToast('请选择盘点日期')
      return
    }

    if (!checkForm.value.warehouse_id) {
      showToast('请选择仓库/库区')
      return
    }

    try {
      submitting.value = true

      const formData = {
        check_date: checkForm.value.check_date,
        check_type: checkForm.value.check_type,
        location_id: checkForm.value.warehouse_id, // 后端期望字段名为 location_id
        remark: checkForm.value.remarks, // 后端期望字段名为 remark
        description: checkForm.value.description,
        status: 'draft'
      }

      const response = await inventoryApi.createCheck(formData)

      if (response && response.data) {
        showToast('盘点单创建成功')
        router.push(`/inventory/check/${response.data.id}/edit`)
      }
    } catch (error) {
      console.error('提交盘点单失败:', error)
      showToast('提交盘点单失败：' + (error.message || '未知错误'))
    } finally {
      submitting.value = false
    }
  }

  // 获取仓库列表
  const getWarehouses = async () => {
    try {
      loadingWarehouses.value = true
      const response = await inventoryApi.getLocations()
      if (response && response.data) {
        let items = []
        if (Array.isArray(response.data)) {
          items = response.data
        } else {
          items = response.data.list || response.data.items || response.data.rows || []
        }
        warehouseOptions.value = items
      }
    } catch (error) {
      console.error('获取仓库列表失败:', error)
      showToast('获取仓库列表失败')
    } finally {
      loadingWarehouses.value = false
    }
  }

  onMounted(() => {
    getWarehouses()
  })
</script>

<style lang="scss" scoped>
  .unified-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-primary);
  }

  .content-container {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  :deep(.van-field__control) {
    text-align: right;
  }

  :deep(.van-cell-group__title) {
    padding: 16px 16px 8px;
    color: var(--text-primary);
    font-size: 0.9375rem;
    font-weight: 500;
  }
</style>
