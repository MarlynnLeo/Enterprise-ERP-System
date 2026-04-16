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
    <NavBar title="新建采购订单" left-arrow @click-left="onClickLeft">
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
            v-model="orderForm.order_no"
            name="order_no"
            label="订单编号"
            placeholder="系统自动生成"
            readonly
            right-icon="refresh"
            @click-right-icon="generateOrderNo"
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
            v-model="orderForm.order_date"
            name="order_date"
            label="订单日期"
            placeholder="请选择订单日期"
            type="date"
            :rules="[{ required: true, message: '请选择订单日期' }]"
          />

          <Field
            v-model="orderForm.expected_delivery_date"
            name="expected_delivery_date"
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
            v-model="orderForm.contact_person"
            name="contact_person"
            label="联系人"
            placeholder="请输入联系人"
          />

          <Field
            v-model="orderForm.contact_phone"
            name="contact_phone"
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
                <span class="item-name">{{ item.material_name || '未选择物料' }}</span>
                <VanIcon name="cross" size="16" @click="removeOrderItem(index)" />
              </div>

              <div class="item-details">
                <div class="item-row">
                  <span class="label">物料编码:</span>
                  <span class="value">{{ item.material_code || '-' }}</span>
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
                  <span class="value">¥{{ formatAmount(item.unit_price) }}</span>
                </div>
                <div class="item-row">
                  <span class="label">小计:</span>
                  <span class="value total">¥{{ formatAmount(item.total_price) }}</span>
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
            v-model="orderForm.remark"
            name="remark"
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
              <div class="supplier-contact" v-if="supplier.contact_person">
                联系人: {{ supplier.contact_person }}
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
              v-model="currentItem.unit_price"
              name="unit_price"
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
              v-model="currentItem.remark"
              name="remark"
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
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Button,
    Form,
    Field,
    Popup,
    Search,
    Empty,
    Icon,
    showToast,
    showLoadingToast,
    closeToast,
    Icon as VanIcon
  } from 'vant'
  import { purchaseApi, baseDataApi } from '@/services/api'

  const router = useRouter()
  const formRef = ref()
  const itemFormRef = ref()

  // 表单数据
  const orderForm = reactive({
    order_no: '',
    supplier_id: '',
    order_date: '',
    expected_delivery_date: '',
    contact_person: '',
    contact_phone: '',
    remark: ''
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
    material_id: '',
    material_name: '',
    material_code: '',
    specification: '',
    quantity: '',
    unit_price: '',
    unit: '',
    remark: ''
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
      return sum + (parseFloat(item.total_price) || 0)
    }, 0)
  })

  // 生成订单编号
  const generateOrderNo = async () => {
    try {
      const today = new Date()
      const dateStr = `${today.getFullYear().toString().slice(-2)}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`
      const randomStr = Math.random().toString(36).substr(2, 4).toUpperCase()
      orderForm.order_no = `PO${dateStr}${randomStr}`
    } catch (error) {
      console.error('生成订单编号失败:', error)
      showToast('生成订单编号失败')
    }
  }

  // 获取供应商列表
  const fetchSuppliers = async () => {
    try {
      const response = await baseDataApi.getSuppliers({
        page: 1,
        pageSize: 1000,
        status: 1 // 只获取启用的供应商
      })
      supplierList.value = response.data?.items || response.data || []
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
        pageSize: 1000,
        status: 1
      }

      if (supplierSearchValue.value) {
        params.name = supplierSearchValue.value
        params.code = supplierSearchValue.value
      }

      const response = await baseDataApi.getSuppliers(params)
      supplierList.value = response.data?.items || response.data || []
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
      orderForm.supplier_id = tempSelectedSupplier.value.id

      // 自动填充联系信息
      if (tempSelectedSupplier.value.contact_person) {
        orderForm.contact_person = tempSelectedSupplier.value.contact_person
      }
      if (tempSelectedSupplier.value.contact_phone) {
        orderForm.contact_phone = tempSelectedSupplier.value.contact_phone
      }

      showSupplierPicker.value = false
    }
  }

  // 获取物料列表
  const fetchMaterials = async () => {
    try {
      const response = await baseDataApi.getMaterials({
        page: 1,
        pageSize: 1000
      })
      const resData = response.data || response
      const materials = Array.isArray(resData)
        ? resData
        : Array.isArray(resData.list)
          ? resData.list
          : Array.isArray(resData.items)
            ? resData.items
            : Array.isArray(resData.data)
              ? resData.data
              : []
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
        pageSize: 1000
      }

      if (materialSearchValue.value) {
        const keyword = materialSearchValue.value.trim()
        params.name = keyword
        params.code = keyword
        params.specs = keyword
      }

      const response = await baseDataApi.getMaterials(params)
      const resData2 = response.data || response
      const materials = Array.isArray(resData2)
        ? resData2
        : Array.isArray(resData2.list)
          ? resData2.list
          : Array.isArray(resData2.items)
            ? resData2.items
            : Array.isArray(resData2.data)
              ? resData2.data
              : []
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
      currentItem.material_id = tempSelectedMaterial.value.id
      currentItem.material_name = tempSelectedMaterial.value.name
      currentItem.material_code = tempSelectedMaterial.value.code
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
      id: item.material_id,
      name: item.material_name,
      code: item.material_code,
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

      if (!currentItem.material_id) {
        showToast('请选择物料')
        return
      }

      // 计算小计
      const quantity = parseFloat(currentItem.quantity) || 0
      const unitPrice = parseFloat(currentItem.unit_price) || 0
      currentItem.total_price = quantity * unitPrice

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
      material_id: '',
      material_name: '',
      material_code: '',
      specification: '',
      quantity: '',
      unit_price: '',
      unit: '',
      remark: ''
    })
    selectedMaterial.value = null
  }

  // 格式化金额
  const formatAmount = (amount) => {
    if (!amount) return '0.00'
    return parseFloat(amount).toFixed(2)
  }

  // 提交表单
  const submitForm = async () => {
    try {
      await formRef.value?.validate()

      if (!orderForm.supplier_id) {
        showToast('请选择供应商')
        return
      }

      if (orderItems.value.length === 0) {
        showToast('请添加订单明细')
        return
      }

      // 验证日期
      if (orderForm.order_date && orderForm.expected_delivery_date) {
        if (new Date(orderForm.expected_delivery_date) < new Date(orderForm.order_date)) {
          showToast('预计交货日期不能早于订单日期')
          return
        }
      }

      submitting.value = true
      showLoadingToast({ message: '保存中...', forbidClick: true })

      const formData = {
        order_no: orderForm.order_no,
        supplier_id: orderForm.supplier_id,
        order_date: orderForm.order_date,
        expected_delivery_date: orderForm.expected_delivery_date,
        contact_person: orderForm.contact_person,
        contact_phone: orderForm.contact_phone,
        total_amount: totalAmount.value,
        remark: orderForm.remark,
        items: orderItems.value.map((item) => ({
          material_id: item.material_id,
          quantity: parseFloat(item.quantity),
          unit_price: parseFloat(item.unit_price),
          total_price: parseFloat(item.total_price),
          remark: item.remark
        }))
      }

      await purchaseApi.createOrder(formData)

      closeToast()
      showToast('采购订单创建成功')

      // 返回列表页面
      router.back()
    } catch (error) {
      closeToast()
      console.error('创建采购订单失败:', error)
      showToast(error.response?.data?.message || '创建采购订单失败')
    } finally {
      submitting.value = false
    }
  }

  // 返回上一页
  const onClickLeft = () => {
    router.back()
  }

  onMounted(() => {
    generateOrderNo()
    fetchSuppliers()
    fetchMaterials()

    // 设置默认订单日期为今天
    orderForm.order_date = new Date().toISOString().split('T')[0]
  })
</script>

<style lang="scss" scoped>
  .create-order-page {
    height: 100vh;
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
      border-bottom: 1px solid var(--glass-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  .items-container {
    padding: 16px;
  }

  .item-card {
    border: 1px solid var(--glass-border);
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
    border-bottom: 1px solid var(--glass-border);

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
    border-bottom: 1px solid var(--glass-border);
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
    border: 1px solid var(--glass-border);
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
