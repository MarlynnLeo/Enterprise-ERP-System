<!--
/**
 * CreateReceipt.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="create-receipt-page">
    <NavBar title="创建入库单" left-arrow @click-left="onClickLeft">
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
            v-model="receiptForm.receiptNo"
            name="receipt_no"
            label="入库单号"
            placeholder="系统自动生成"
            readonly
          />

          <Field
            v-model="orderInfo"
            name="order"
            label="关联订单"
            placeholder="请选择采购订单"
            readonly
            is-link
            @click="showOrderPicker = true"
            :rules="[{ required: true, message: '请选择采购订单' }]"
          />

          <Field
            v-model="receiptForm.receiptDate"
            name="receiptDate"
            label="入库日期"
            placeholder="请选择入库日期"
            type="date"
            :rules="[{ required: true, message: '请选择入库日期' }]"
          />

          <Field
            v-model="receiptForm.warehouseName"
            name="warehouse"
            label="入库仓库"
            placeholder="请选择入库仓库"
            readonly
            is-link
            @click="showWarehousePicker = true"
            :rules="[{ required: true, message: '请选择入库仓库' }]"
          />
        </div>

        <!-- 供应商信息 -->
        <div class="form-section" v-if="selectedOrder">
          <div class="section-title">供应商信息</div>

          <div class="info-grid">
            <div class="info-item">
              <span class="label">供应商</span>
              <span class="value">{{ selectedOrder.supplierName }}</span>
            </div>
            <div class="info-item" v-if="selectedOrder.contact_person">
              <span class="label">联系人</span>
              <span class="value">{{ selectedOrder.contact_person }}</span>
            </div>
            <div class="info-item" v-if="selectedOrder.contact_phone">
              <span class="label">联系电话</span>
              <span class="value">{{ selectedOrder.contact_phone }}</span>
            </div>
          </div>
        </div>

        <!-- 入库明细 -->
        <div class="form-section" v-if="receiptItems.length > 0">
          <div class="section-title">入库明细</div>

          <div class="items-list">
            <div v-for="(item, index) in receiptItems" :key="index" class="item-card">
              <div class="item-header">
                <span class="item-name">{{ item.materialName }}</span>
                <Checkbox v-model="item.selected" @change="onItemSelect(index)" />
              </div>

              <div class="item-details">
                <div class="item-row">
                  <span class="label">物料编码:</span>
                  <span class="value">{{ item.materialCode }}</span>
                </div>
                <div class="item-row" v-if="item.specification">
                  <span class="label">规格:</span>
                  <span class="value">{{ item.specification }}</span>
                </div>
                <div class="item-row">
                  <span class="label">订单数量:</span>
                  <span class="value">{{ item.orderQuantity }} {{ item.unitName || item.unit || '' }}</span>
                </div>
                <div class="item-row">
                  <span class="label">已收数量:</span>
                  <span class="value">{{ item.receivedQuantity || 0 }} {{ item.unitName || item.unit || '' }}</span>
                </div>
                <div class="item-row">
                  <span class="label">待收数量:</span>
                  <span class="value">{{ item.pendingQuantity }} {{ item.unitName || item.unit || '' }}</span>
                </div>
              </div>

              <div class="item-input" v-if="item.selected">
                <Field
                  v-model="item.receiptQuantity"
                  name="receiptQuantity"
                  label="本次入库数量"
                  placeholder="请输入入库数量"
                  type="number"
                  :rules="[
                    { required: true, message: '请输入入库数量' },
                    { validator: (val) => validateReceiptQuantity(val, item) }
                  ]"
                />

                <Field
                  v-model="item.remarks"
                  name="remarks"
                  label="备注"
                  placeholder="请输入备注（可选）"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 入库汇总 -->
        <div class="form-section" v-if="selectedItems.length > 0">
          <div class="section-title">入库汇总</div>

          <div class="summary-container">
            <div class="summary-row">
              <span class="label">入库物料种类:</span>
              <span class="value">{{ selectedItems.length }} 种</span>
            </div>
            <div class="summary-row">
              <span class="label">入库总金额:</span>
              <span class="value total-amount">¥{{ formatAmount(totalReceiptAmount) }}</span>
            </div>
          </div>
        </div>

        <!-- 备注信息 -->
        <div class="form-section">
          <div class="section-title">备注信息</div>

          <Field
            v-model="receiptForm.remarks"
            name="remarks"
            label="备注"
            placeholder="请输入备注信息（可选）"
            type="textarea"
            rows="3"
          />
        </div>
      </Form>
    </div>

    <!-- 采购订单选择弹窗 -->
    <Popup v-model:show="showOrderPicker" position="bottom" :style="{ height: '70%' }">
      <div class="order-picker">
        <div class="picker-header">
          <span @click="showOrderPicker = false">取消</span>
          <span class="picker-title">选择采购订单</span>
          <span @click="confirmOrder">确定</span>
        </div>

        <div class="picker-search">
          <Search
            v-model="orderSearchValue"
            placeholder="搜索订单号或供应商"
            @search="searchOrders"
          />
        </div>

        <div class="picker-content">
          <div
            v-for="order in orderList"
            :key="order.id"
            class="order-item"
            :class="{ active: tempSelectedOrder?.id === order.id }"
            @click="selectOrder(order)"
          >
            <div class="order-info">
              <div class="order-no">{{ order.orderNo }}</div>
              <div class="order-supplier">{{ order.supplierName }}</div>
              <div class="order-date">{{ formatDate(order.order_date) }}</div>
            </div>
            <div class="order-status">
              <Tag :type="getOrderStatusType(order.status)" size="small">
                {{ getOrderStatusText(order.status) }}
              </Tag>
            </div>
          </div>

          <div v-if="orderList.length === 0" class="empty-state">
            <Empty description="暂无可入库的采购订单" />
          </div>
        </div>
      </div>
    </Popup>

    <!-- 仓库选择弹窗 -->
    <Popup v-model:show="showWarehousePicker" position="bottom" :style="{ height: '50%' }">
      <div class="warehouse-picker">
        <div class="picker-header">
          <span @click="showWarehousePicker = false">取消</span>
          <span class="picker-title">选择仓库</span>
          <span @click="confirmWarehouse">确定</span>
        </div>

        <div class="picker-content">
          <div
            v-for="warehouse in warehouseList"
            :key="warehouse.id"
            class="warehouse-item"
            :class="{ active: tempSelectedWarehouse?.id === warehouse.id }"
            @click="selectWarehouse(warehouse)"
          >
            <div class="warehouse-info">
              <div class="warehouse-name">{{ warehouse.name }}</div>
              <div class="warehouse-code">{{ warehouse.code }}</div>
            </div>
          </div>

          <div v-if="warehouseList.length === 0" class="empty-state">
            <Empty description="暂无仓库数据" />
          </div>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, computed, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import {
    NavBar,
    Button,
    Form,
    Field,
    Popup,
    Search,
    Empty,
    Tag,
    Checkbox,
    showToast,
    showLoadingToast,
    closeToast
  } from 'vant'
  import { purchaseApi, inventoryApi } from '@/api'

  const router = useRouter()
  const route = useRoute()
  const formRef = ref()

  // 表单数据（纯 camel，后端 purchaseReceiptMap.fromApi）
  const receiptForm = reactive({
    receiptNo: '',
    orderId: '',
    receiptDate: '',
    warehouseId: '',
    warehouseName: '',
    remarks: ''
  })

  // 状态管理
  const submitting = ref(false)
  const showOrderPicker = ref(false)
  const showWarehousePicker = ref(false)

  // 订单相关
  const orderList = ref([])
  const orderSearchValue = ref('')
  const selectedOrder = ref(null)
  const tempSelectedOrder = ref(null)

  // 仓库相关
  const warehouseList = ref([])
  const selectedWarehouse = ref(null)
  const tempSelectedWarehouse = ref(null)

  // 入库明细
  const receiptItems = ref([])

  // 计算属性
  const orderInfo = computed(() => {
    return selectedOrder.value
      ? `${selectedOrder.value.orderNo} - ${selectedOrder.value.supplierName}`
      : ''
  })

  const selectedItems = computed(() => {
    return receiptItems.value.filter((item) => item.selected)
  })

  const totalReceiptAmount = computed(() => {
    return selectedItems.value.reduce((sum, item) => {
      const quantity = parseFloat(item.receiptQuantity) || 0
      const unitPrice = parseFloat(item.unitPrice) || 0
      return sum + quantity * unitPrice
    }, 0)
  })

  // 获取可入库的采购订单
  const fetchOrders = async () => {
    try {
      const response = await purchaseApi.getOrders({
        status: 'confirmed', // 只获取已确认的订单
        page: 1,
        pageSize: 50
      })
      orderList.value = response.data?.items || response.data || []
    } catch (error) {
      console.error('获取采购订单列表失败:', error)
      showToast('获取采购订单列表失败')
    }
  }

  // 搜索订单
  const searchOrders = async () => {
    try {
      const params = {
        status: 'confirmed',
        page: 1,
        pageSize: 50
      }

      if (orderSearchValue.value) {
        params.orderNo = orderSearchValue.value
      }

      const response = await purchaseApi.getOrders(params)
      orderList.value = response.data?.items || response.data || []
    } catch (error) {
      console.error('搜索采购订单失败:', error)
      showToast('搜索采购订单失败')
    }
  }

  // 选择订单
  const selectOrder = (order) => {
    tempSelectedOrder.value = order
  }

  // 确认选择订单
  const confirmOrder = async () => {
    if (tempSelectedOrder.value) {
      selectedOrder.value = tempSelectedOrder.value
      receiptForm.orderId = tempSelectedOrder.value.id
      showOrderPicker.value = false

      // 加载订单明细
      await loadOrderItems(tempSelectedOrder.value.id)
    }
  }

  // 加载订单明细
  const loadOrderItems = async (orderId) => {
    try {
      const response = await purchaseApi.getOrder(orderId)
      const orderData = response.data

      if (orderData.items && orderData.items.length > 0) {
        receiptItems.value = orderData.items.map((item) => {
          const qty = Number(item.quantity) || 0
          const received = Number(item.receivedQuantity || 0)
          return {
            materialId: item.materialId,
            materialName: item.materialName,
            materialCode: item.materialCode,
            specification: item.specification,
            unitPrice: item.unitPrice,
            unitName: item.unitName || item.unit,
            orderQuantity: qty,
            receivedQuantity: received,
            pendingQuantity: Math.max(0, qty - received),
            receiptQuantity: '',
            selected: false,
            remarks: ''
          }
        })
      }
    } catch (error) {
      console.error('获取订单明细失败:', error)
      showToast('获取订单明细失败')
    }
  }

  // 获取仓库列表
  const fetchWarehouses = async () => {
    try {
      const response = await inventoryApi.getWarehouses({
        page: 1,
        pageSize: 50,
        status: 1 // 只获取启用的仓库
      })
      warehouseList.value = response.data?.items || response.data || []
    } catch (error) {
      console.error('获取仓库列表失败:', error)
      showToast('获取仓库列表失败')
    }
  }

  // 选择仓库
  const selectWarehouse = (warehouse) => {
    tempSelectedWarehouse.value = warehouse
  }

  // 确认选择仓库
  const confirmWarehouse = () => {
    if (tempSelectedWarehouse.value) {
      selectedWarehouse.value = tempSelectedWarehouse.value
      receiptForm.warehouseId = tempSelectedWarehouse.value.id
      receiptForm.warehouseName = tempSelectedWarehouse.value.name
      showWarehousePicker.value = false
    }
  }

  // 物料选择变化
  const onItemSelect = (index) => {
    const item = receiptItems.value[index]
    if (!item.selected) {
      item.receiptQuantity = ''
      item.remarks = ''
    } else {
      // 默认设置为待收数量
      item.receiptQuantity = String(item.pendingQuantity)
    }
  }

  // 验证入库数量
  const validateReceiptQuantity = (value, item) => {
    const quantity = parseFloat(value)
    if (isNaN(quantity) || quantity <= 0) {
      return '请输入有效的入库数量'
    }
    if (quantity > item.pendingQuantity) {
      return '入库数量不能超过待收数量'
    }
    return true
  }

  // 获取订单状态类型
  const getOrderStatusType = (status) => {
    const statusMap = {
      confirmed: 'primary',
      partial_received: 'warning',
      completed: 'success'
    }
    return statusMap[status] || 'default'
  }

  // 获取订单状态文本
  const getOrderStatusText = (status) => {
    const statusMap = {
      confirmed: '已确认',
      partial_received: '部分收货',
      completed: '已完成'
    }
    return statusMap[status] || status
  }

  // 格式化日期
  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('zh-CN')
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

      if (!receiptForm.orderId) {
        showToast('请选择采购订单')
        return
      }

      if (!receiptForm.warehouseId) {
        showToast('请选择入库仓库')
        return
      }

      if (selectedItems.value.length === 0) {
        showToast('请选择要入库的物料')
        return
      }

      // 验证所有选中物料的入库数量
      for (const item of selectedItems.value) {
        if (!item.receiptQuantity || parseFloat(item.receiptQuantity) <= 0) {
          showToast(`请输入${item.materialName}的入库数量`)
          return
        }
      }

      submitting.value = true
      showLoadingToast({ message: '保存中...', forbidClick: true })

      // 纯 camel，后端 purchaseReceiptMap.fromApi
      const formData = {
        receiptNo: receiptForm.receiptNo || undefined,
        orderId: receiptForm.orderId,
        receiptDate: receiptForm.receiptDate,
        warehouseId: receiptForm.warehouseId,
        totalAmount: totalReceiptAmount.value,
        remarks: receiptForm.remarks,
        items: selectedItems.value.map((item) => ({
          materialId: item.materialId,
          quantity: parseFloat(item.receiptQuantity),
          unitPrice: parseFloat(item.unitPrice),
          remarks: item.remarks
        }))
      }

      await purchaseApi.createReceipt(formData)

      closeToast()
      showToast('入库单创建成功')

      // 返回列表页面
      router.back()
    } catch (error) {
      closeToast()
      console.error('创建入库单失败:', error)
      showToast(error.response?.data?.message || '创建入库单失败')
    } finally {
      submitting.value = false
    }
  }

  // 返回上一页
  const onClickLeft = () => {
    router.back()
  }

  onMounted(() => {
    fetchOrders()
    fetchWarehouses()

    // 设置默认入库日期为今天
    receiptForm.receiptDate = new Date().toISOString().split('T')[0]

    // 如果URL中有orderId参数，自动选择该订单
    const orderId = route.query.orderId
    if (orderId) {
      const order = orderList.value.find((o) => o.id == orderId)
      if (order) {
        selectedOrder.value = order
        receiptForm.orderId = order.id
        loadOrderItems(order.id)
      }
    }
  })
</script>

<style lang="scss" scoped>
  .create-receipt-page {
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
    }
  }

  .info-grid {
    padding: 16px;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;

    &:last-child {
      margin-bottom: 0;
    }

    .label {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .value {
      color: var(--text-primary);
      font-size: 0.875rem;
    }
  }

  .items-list {
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
    }
  }

  .item-input {
    border-top: 1px solid var(--surface-border, var(--border-subtle));
    padding-top: 12px;
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

  .order-picker,
  .warehouse-picker {
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

  .order-item,
  .warehouse-item {
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

  .order-info,
  .warehouse-info {
    flex: 1;

    .order-no,
    .warehouse-name {
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .order-supplier,
    .warehouse-code {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-bottom: 2px;
    }

    .order-date {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
  }

  .empty-state {
    text-align: center;
    padding: 40px 0;
  }
</style>
