<!--
/**
 * CreateOrder.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="create-order-page">
    <NavBar :title="pageTitle" left-arrow @click-left="onClickLeft">
      <template #right>
        <Button type="primary" size="small" @click="submitForm" :loading="submitting">
          保存
        </Button>
      </template>
    </NavBar>

    <div class="content-container">
      <Form @submit="submitForm" ref="formRef">
        <!-- 基本信息 -->
        <div class="form-section">
          <div class="section-title">基本信息</div>

          <Field
            v-model="orderForm.orderNo"
            name="orderNo"
            label="订单编号"
            placeholder="系统自动生成"
            readonly
          />

          <Field
            v-model="selectedSupplierName"
            name="supplier"
            label="选择供应商"
            placeholder="请选择供应商"
            readonly
            is-link
            @click="showSupplierPicker = true"
            :rules="[{ required: true, message: '请选择供应商' }]"
          />

          <Field
            v-model="orderForm.orderDate"
            name="orderDate"
            label="订单日期"
            placeholder="请选择订单日期"
            type="date"
            :rules="[{ required: true, message: '请选择订单日期' }]"
          />

          <Field
            v-model="orderForm.expectedDeliveryDate"
            name="expectedDeliveryDate"
            label="预计交货日期"
            placeholder="请选择预计交货日期"
            type="date"
            :rules="[{ required: true, message: '请选择预计交货日期' }]"
          />
        </div>

        <!-- 联系信息 -->
        <div class="form-section" v-if="selectedSupplier">
          <div class="section-title">联系信息</div>

          <Field
            v-model="orderForm.contactPerson"
            name="contactPerson"
            label="联系人"
            placeholder="请输入联系人"
          />

          <Field
            v-model="orderForm.contactPhone"
            name="contactPhone"
            label="联系电话"
            placeholder="请输入联系电话"
            type="tel"
          />
        </div>

        <!-- 订单明细 -->
        <div class="form-section">
          <div class="section-title">
            订单明细
            <Button type="primary" size="mini" @click="addOrderItem"> 添加物料 </Button>
          </div>

          <div class="items-container" v-if="orderItems.length > 0">
            <div v-for="(item, index) in orderItems" :key="index" class="item-card">
              <div class="item-header">
                <span class="item-name">{{ item.materialName || '未选择物料' }}</span>
                <VanIcon name="cross" size="16" @click="removeOrderItem(index)" />
              </div>

              <div class="item-details">
                <div class="item-row">
                  <span class="label">物料编码:</span>
                  <span class="value">{{ item.materialCode || '-' }}</span>
                </div>
                <div class="item-row" v-if="item.specification">
                  <span class="label">规格:</span>
                  <span class="value">{{ item.specification }}</span>
                </div>
                <div class="item-row">
                  <span class="label">数量:</span>
                  <span class="value">{{ item.quantity }} {{ item.unit || '件' }}</span>
                </div>
                <div class="item-row">
                  <span class="label">单价:</span>
                  <span class="value">¥{{ formatAmount(item.unitPrice) }}</span>
                </div>
                <div class="item-row">
                  <span class="label">小计:</span>
                  <span class="value total">¥{{ formatAmount(item.totalPrice) }}</span>
                </div>
              </div>

              <div class="item-actions">
                <Button size="small" @click="editOrderItem(index)">编辑</Button>
              </div>
            </div>
          </div>

          <div v-else class="empty-items">
            <Empty description="暂无订单明细" />
            <Button type="primary" @click="addOrderItem">添加物料</Button>
          </div>
        </div>

        <!-- 订单汇总 -->
        <div class="form-section" v-if="orderItems.length > 0">
          <div class="section-title">订单汇总</div>

          <div class="summary-container">
            <div class="summary-row">
              <span class="label">物料种类:</span>
              <span class="value">{{ orderItems.length }} 种</span>
            </div>
            <div class="summary-row">
              <span class="label">订单总额:</span>
              <span class="value total-amount">¥{{ formatAmount(totalAmount) }}</span>
            </div>
          </div>
        </div>

        <!-- 备注信息 -->
        <div class="form-section">
          <div class="section-title">备注信息</div>

          <Field
            v-model="orderForm.remarks"
            name="remarks"
            label="备注"
            placeholder="请输入备注信息（可选）"
            type="textarea"
            rows="3"
          />
        </div>
      </Form>
    </div>

    <!-- 供应商选择弹窗 -->
    <Popup v-model:show="showSupplierPicker" position="bottom" :style="{ height: '70%' }">
      <div class="supplier-picker">
        <div class="picker-header">
          <span @click="showSupplierPicker = false">取消</span>
          <span class="picker-title">选择供应商</span>
          <span @click="confirmSupplier">确定</span>
        </div>

        <div class="picker-search">
          <Search
            v-model="supplierSearchValue"
            placeholder="搜索供应商名称或编码"
            @search="searchSuppliers"
          />
        </div>

        <div class="picker-content">
          <div
            v-for="supplier in supplierList"
            :key="supplier.id"
            class="supplier-item"
            :class="{ active: tempSelectedSupplier?.id === supplier.id }"
            @click="selectSupplier(supplier)"
          >
            <div class="supplier-info">
              <div class="supplier-name">{{ supplier.name }}</div>
              <div class="supplier-code">{{ supplier.code }}</div>
              <div class="supplier-contact" v-if="supplier.contactPerson">
                联系人: {{ supplier.contactPerson }}
              </div>
            </div>
            <div class="supplier-status" v-if="supplier.status === 1">
              <VanIcon name="success" color="#52c41a" />
            </div>
          </div>

          <div v-if="supplierList.length === 0" class="empty-state">
            <Empty description="暂无供应商数据" />
          </div>
        </div>
      </div>
    </Popup>

    <!-- 物料编辑弹窗 -->
    <Popup v-model:show="showItemEditor" position="bottom" :style="{ height: '80%' }">
      <div class="item-editor">
        <div class="picker-header">
          <span @click="showItemEditor = false">取消</span>
          <span class="picker-title">{{ editingIndex >= 0 ? '编辑' : '添加' }}物料</span>
          <span @click="confirmOrderItem">确定</span>
        </div>

        <div class="editor-content">
          <Form ref="itemFormRef">
            <Field
              v-model="selectedMaterialName"
              name="material"
              label="选择物料"
              placeholder="请选择物料"
              readonly
              is-link
              @click="showMaterialPicker = true"
              :rules="[{ required: true, message: '请选择物料' }]"
            />

            <Field
              v-model="currentItem.quantity"
              name="quantity"
              label="采购数量"
              placeholder="请输入采购数量"
              type="number"
              :rules="[
                { required: true, message: '请输入采购数量' },
                { pattern: /^[0-9]+(\.[0-9]+)?$/, message: '请输入有效的数量' }
              ]"
            />

            <Field
              v-model="currentItem.unitPrice"
              name="unitPrice"
              label="单价"
              placeholder="请输入单价"
              type="number"
              :rules="[
                { required: true, message: '请输入单价' },
                { pattern: /^[0-9]+(\.[0-9]+)?$/, message: '请输入有效的单价' }
              ]"
            />

            <Field
              v-if="selectedMaterial"
              v-model="selectedMaterial.unit"
              name="unit"
              label="单位"
              readonly
            />

            <Field
              v-model="currentItem.remarks"
              name="remarks"
              label="备注"
              placeholder="请输入备注（可选）"
            />
          </Form>
        </div>
      </div>
    </Popup>

    <!-- 物料选择弹窗 -->
    <Popup v-model:show="showMaterialPicker" position="bottom" :style="{ height: '70%' }">
      <div class="material-picker">
        <div class="picker-header">
          <span @click="showMaterialPicker = false">取消</span>
          <span class="picker-title">选择物料</span>
          <span @click="confirmMaterial">确定</span>
        </div>

        <div class="picker-search">
          <Search
            v-model="materialSearchValue"
            placeholder="搜索物料名称或编码"
            @search="searchMaterials"
          />
        </div>

        <div class="picker-content">
          <div
            v-for="material in materialList"
            :key="material.id"
            class="material-item"
            :class="{ active: tempSelectedMaterial?.id === material.id }"
            @click="selectMaterial(material)"
          >
            <div class="material-info">
              <div class="material-name">{{ material.name }}</div>
              <div class="material-code">{{ material.code }}</div>
              <div class="material-spec" v-if="material.specs">{{ material.specs }}</div>
            </div>
            <div class="material-unit">{{ material.unit }}</div>
          </div>

          <div v-if="materialList.length === 0" class="empty-state">
            <Empty description="暂无物料数据" />
          </div>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, computed, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import {
    NavBar,
    Button,
    Form,
    Field,
    Popup,
    Search,
    Empty,
    showToast,
    showLoadingToast,
    closeToast,
    Icon as VanIcon
  } from 'vant'
  import { purchaseApi, baseDataApi } from '@/api'
  import { extractApiData, extractApiList } from '@/utils/apiHelper'

  const router = useRouter()
  const route = useRoute()
  const formRef = ref()
  const itemFormRef = ref()
  const isEdit = computed(() => !!route.params.id)
  const pageTitle = computed(() => isEdit.value ? '编辑采购订单' : '新建采购订单')

  // 表单数据（纯 camel，后端 purchaseOrderMap.fromApi）
  const orderForm = reactive({
    orderNo: '',
    supplierId: '',
    orderDate: '',
    expectedDeliveryDate: '',
    contactPerson: '',
    contactPhone: '',
    remarks: ''
  })

  // 状态管理
  const submitting = ref(false)
  const showSupplierPicker = ref(false)
  const showItemEditor = ref(false)
  const showMaterialPicker = ref(false)

  // 供应商相关
  const supplierList = ref([])
  const supplierSearchValue = ref('')
  const selectedSupplier = ref(null)
  const tempSelectedSupplier = ref(null)

  // 物料相关
  const materialList = ref([])
  const materialSearchValue = ref('')
  const selectedMaterial = ref(null)
  const tempSelectedMaterial = ref(null)

  // 订单明细
  const orderItems = ref([])
  const currentItem = reactive({
    materialId: '',
    materialName: '',
    materialCode: '',
    specification: '',
    quantity: '',
    unitPrice: '',
    unit: '',
    remarks: ''
  })
  const editingIndex = ref(-1)

  // 计算属性
  const selectedSupplierName = computed(() => {
    return selectedSupplier.value
      ? `${selectedSupplier.value.name} (${selectedSupplier.value.code})`
      : ''
  })

  const selectedMaterialName = computed(() => {
    return selectedMaterial.value
      ? `${selectedMaterial.value.name} (${selectedMaterial.value.code})`
      : ''
  })

  const totalAmount = computed(() => {
    return orderItems.value.reduce((sum, item) => {
      return sum + (parseFloat(item.totalPrice) || 0)
    }, 0)
  })

  // 获取供应商列表
  const fetchSuppliers = async () => {
    try {
      const response = await baseDataApi.getSuppliers({
        page: 1,
        pageSize: 50,
        status: 1 // 只获取启用的供应商
      })
      supplierList.value = extractApiList(response)
    } catch (error) {
      console.error('获取供应商列表失败:', error)
      showToast('获取供应商列表失败')
    }
  }

  // 搜索供应商
  const searchSuppliers = async () => {
    try {
      const params = {
        page: 1,
        pageSize: 50,
        status: 1
      }

      if (supplierSearchValue.value) {
        params.name = supplierSearchValue.value
        params.code = supplierSearchValue.value
      }

      const response = await baseDataApi.getSuppliers(params)
      supplierList.value = extractApiList(response)
    } catch (error) {
      console.error('搜索供应商失败:', error)
      showToast('搜索供应商失败')
    }
  }

  // 选择供应商
  const selectSupplier = (supplier) => {
    tempSelectedSupplier.value = supplier
  }

  // 确认选择供应商
  const confirmSupplier = () => {
    if (tempSelectedSupplier.value) {
      selectedSupplier.value = tempSelectedSupplier.value
      orderForm.supplierId = tempSelectedSupplier.value.id

      // 自动填充联系信息
      if (tempSelectedSupplier.value.contactPerson || tempSelectedSupplier.value.contact_person) {
        orderForm.contactPerson =
          tempSelectedSupplier.value.contactPerson || tempSelectedSupplier.value.contact_person
      }
      if (tempSelectedSupplier.value.contactPhone || tempSelectedSupplier.value.contact_phone) {
        orderForm.contactPhone =
          tempSelectedSupplier.value.contactPhone || tempSelectedSupplier.value.contact_phone
      }

      showSupplierPicker.value = false
    }
  }

  // 获取物料列表
  const fetchMaterials = async () => {
    try {
      const response = await baseDataApi.getMaterials({
        page: 1,
        pageSize: 50,
        status: 1
      })
      const materials = extractApiList(response)
      materialList.value = materials.map((material) => ({
        ...material,
        unit: material.unit || '件'
      }))
    } catch (error) {
      console.error('获取物料列表失败:', error)
      showToast('获取物料列表失败')
    }
  }

  // 搜索物料
  const searchMaterials = async () => {
    try {
      const params = {
        page: 1,
        pageSize: 50,
        status: 1
      }

      if (materialSearchValue.value) {
        const keyword = materialSearchValue.value.trim()
        params.name = keyword
        params.code = keyword
        params.specs = keyword
      }

      const response = await baseDataApi.getMaterials(params)
      const materials = extractApiList(response)
      materialList.value = materials.map((material) => ({
        ...material,
        unit: material.unit || '件'
      }))
    } catch (error) {
      console.error('搜索物料失败:', error)
      showToast('搜索物料失败')
    }
  }

  // 选择物料
  const selectMaterial = (material) => {
    tempSelectedMaterial.value = material
  }

  // 确认选择物料
  const confirmMaterial = () => {
    if (tempSelectedMaterial.value) {
      selectedMaterial.value = tempSelectedMaterial.value
      currentItem.materialId = tempSelectedMaterial.value.id
      currentItem.materialName = tempSelectedMaterial.value.name
      currentItem.materialCode = tempSelectedMaterial.value.code
      currentItem.specification = tempSelectedMaterial.value.specs || ''
      currentItem.unit = tempSelectedMaterial.value.unit || '件'
      showMaterialPicker.value = false
    }
  }

  // 添加订单明细
  const addOrderItem = () => {
    resetCurrentItem()
    editingIndex.value = -1
    showItemEditor.value = true
  }

  // 编辑订单明细
  const editOrderItem = (index) => {
    const item = orderItems.value[index]
    Object.assign(currentItem, item)
    selectedMaterial.value = {
      id: item.materialId,
      name: item.materialName,
      code: item.materialCode,
      specs: item.specification,
      unit: item.unit
    }
    editingIndex.value = index
    showItemEditor.value = true
  }

  // 确认订单明细
  const confirmOrderItem = async () => {
    try {
      await itemFormRef.value?.validate()

      if (!currentItem.materialId) {
        showToast('请选择物料')
        return
      }

      // 计算小计
      const quantity = parseFloat(currentItem.quantity) || 0
      const unitPrice = parseFloat(currentItem.unitPrice) || 0
      currentItem.totalPrice = quantity * unitPrice

      if (editingIndex.value >= 0) {
        // 编辑模式
        orderItems.value[editingIndex.value] = { ...currentItem }
      } else {
        // 新增模式
        orderItems.value.push({ ...currentItem })
      }

      showItemEditor.value = false
      resetCurrentItem()
    } catch (error) {
      console.error('保存订单明细失败:', error)
    }
  }

  // 删除订单明细
  const removeOrderItem = (index) => {
    orderItems.value.splice(index, 1)
  }

  // 重置当前明细
  const resetCurrentItem = () => {
    Object.assign(currentItem, {
      materialId: '',
      materialName: '',
      materialCode: '',
      specification: '',
      quantity: '',
      unitPrice: '',
      unit: '',
      remarks: ''
    })
    selectedMaterial.value = null
  }

  // 格式化金额
  const formatAmount = (amount) => {
    if (!amount) return '0.00'
    return parseFloat(amount).toFixed(2)
  }

  const normalizeDate = (value) => {
    if (!value) return ''
    return String(value).slice(0, 10)
  }

  const loadOrder = async () => {
    if (!isEdit.value) return
    try {
      const response = await purchaseApi.getOrder(route.params.id)
      const order = extractApiData(response, null)
      if (!order) return

      Object.assign(orderForm, {
        orderNo: order.orderNo || '',
        supplierId: order.supplierId || '',
        orderDate: normalizeDate(order.orderDate),
        expectedDeliveryDate: normalizeDate(order.expectedDeliveryDate),
        contactPerson: order.contactPerson || '',
        contactPhone: order.contactPhone || '',
        remarks: order.remarks || ''
      })

      if (order.supplierId) {
        selectedSupplier.value =
          supplierList.value.find((supplier) => String(supplier.id) === String(order.supplierId)) || {
            id: order.supplierId,
            name: order.supplierName || '',
            code: order.supplierCode || ''
          }
        tempSelectedSupplier.value = selectedSupplier.value
      }

      const items = order.orderItems || []
      orderItems.value = Array.isArray(items)
        ? items.map((item) => ({
            materialId: item.materialId,
            materialName: item.materialName || item.name || '',
            materialCode: item.materialCode || item.code || '',
            specification: item.specification || item.specs || '',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.amount || item.totalPrice || (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
            unit: item.unit || item.unitName || '件',
            remarks: item.remarks || ''
          }))
        : []
    } catch (error) {
      console.error('加载采购订单失败:', error)
      showToast(error.response?.data?.message || '加载采购订单失败')
    }
  }

  // 提交表单
  const submitForm = async () => {
    try {
      await formRef.value?.validate()

      if (!orderForm.supplierId) {
        showToast('请选择供应商')
        return
      }

      if (orderItems.value.length === 0) {
        showToast('请添加订单明细')
        return
      }

      // 验证日期
      if (orderForm.orderDate && orderForm.expectedDeliveryDate) {
        if (new Date(orderForm.expectedDeliveryDate) < new Date(orderForm.orderDate)) {
          showToast('预计交货日期不能早于订单日期')
          return
        }
      }

      submitting.value = true
      showLoadingToast({ message: '保存中...', forbidClick: true })

      // 纯 camel，后端 purchaseOrderMap.fromApi
      const formData = {
        orderNo: orderForm.orderNo || undefined,
        supplierId: orderForm.supplierId,
        orderDate: orderForm.orderDate,
        expectedDeliveryDate: orderForm.expectedDeliveryDate,
        contactPerson: orderForm.contactPerson,
        contactPhone: orderForm.contactPhone,
        totalAmount: totalAmount.value,
        remarks: orderForm.remarks,
        items: orderItems.value.map((item) => ({
          materialId: item.materialId,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          remarks: item.remarks
        }))
      }

      if (isEdit.value) {
        await purchaseApi.updateOrder(route.params.id, formData)
      } else {
        await purchaseApi.createOrder(formData)
      }

      closeToast()
      showToast(isEdit.value ? '采购订单更新成功' : '采购订单创建成功')

      // 返回列表页面
      router.back()
    } catch (error) {
      closeToast()
      console.error(isEdit.value ? '更新采购订单失败:' : '创建采购订单失败:', error)
      showToast(error.response?.data?.message || (isEdit.value ? '更新采购订单失败' : '创建采购订单失败'))
    } finally {
      submitting.value = false
    }
  }

  // 返回上一页
  const onClickLeft = () => {
    router.back()
  }

  onMounted(async () => {
    await Promise.all([fetchSuppliers(), fetchMaterials()])

    // 设置默认订单日期为今天
    if (!isEdit.value) {
      orderForm.orderDate = new Date().toISOString().split('T')[0]
    }
    await loadOrder()
  })
</script>

<style lang="scss" scoped>
  .create-order-page {
    height: 100%;
    background-color: var(--bg-secondary);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-container {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .form-section {
    background: var(--bg-secondary);
    margin-bottom: 12px;

    .section-title {
      padding: 16px;
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
      border-bottom: 1px solid var(--surface-border, var(--border-subtle));
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  .items-container {
    padding: 16px;
  }

  .item-card {
    border: 1px solid var(--surface-border, var(--border-subtle));
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    .item-name {
      font-weight: 500;
      color: var(--text-primary);
    }
  }

  .item-details {
    margin-bottom: 12px;
  }

  .item-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 0.875rem;

    &:last-child {
      margin-bottom: 0;
    }

    .label {
      color: var(--text-secondary);
    }

    .value {
      color: var(--text-primary);

      &.total {
        color: var(--van-primary-color);
        font-weight: 500;
      }
    }
  }

  .item-actions {
    text-align: right;
  }

  .empty-items {
    padding: 40px 20px;
    text-align: center;
  }

  .summary-container {
    padding: 16px;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 1rem;

    &:last-child {
      margin-bottom: 0;
    }

    .label {
      color: var(--text-secondary);
    }

    .value {
      color: var(--text-primary);
      font-weight: 500;

      &.total-amount {
        color: var(--van-primary-color);
        font-size: 1.125rem;
        font-weight: 600;
      }
    }
  }

  .supplier-picker,
  .material-picker,
  .item-editor {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--surface-border, var(--border-subtle));

    .picker-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    span:first-child,
    span:last-child {
      color: var(--van-primary-color);
      cursor: pointer;
    }
  }

  .picker-search {
    padding: 16px;
    border-bottom: 1px solid var(--surface-border, var(--border-subtle));
  }

  .picker-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .supplier-item,
  .material-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border: 1px solid var(--surface-border, var(--border-subtle));
    border-radius: 6px;
    margin-bottom: 8px;
    cursor: pointer;

    &:last-child {
      margin-bottom: 0;
    }

    &.active {
      border-color: var(--van-primary-color);
      background-color: rgba(99, 102, 241, 0.1);
    }
  }

  .supplier-info,
  .material-info {
    flex: 1;

    .supplier-name,
    .material-name {
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .supplier-code,
    .material-code {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-bottom: 2px;
    }

    .supplier-contact,
    .material-spec {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
  }

  .supplier-status {
    margin-left: 12px;
  }

  .material-unit {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .editor-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .empty-state {
    text-align: center;
    padding: 40px 0;
  }
</style>
