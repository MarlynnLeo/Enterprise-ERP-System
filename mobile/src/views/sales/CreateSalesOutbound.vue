<template>
  <div class="create-page">
    <NavBar title="新建销售出库" left-arrow @click-left="router.back()">
      <template #right>
        <Button type="primary" size="small" :loading="submitting" @click="handleSubmit">保存</Button>
      </template>
    </NavBar>

    <div class="content">
      <CellGroup inset title="出库信息">
        <Cell title="关联订单" is-link :value="selectedOrderTitle" @click="showOrderPicker = true" />
        <Field v-model="form.delivery_date" label="出库日期" type="date" />
        <Field v-model="form.remarks" label="备注" type="textarea" rows="2" autosize />
      </CellGroup>

      <CellGroup inset title="出库明细">
        <div v-if="items.length" class="items">
          <div v-for="(item, index) in items" :key="item.product_id || index" class="item-card">
            <div class="item-title">{{ item.product_name || item.material_name || `物料#${item.product_id}` }}</div>
            <div class="item-subtitle">{{ item.product_code || item.material_code || '-' }}</div>
            <Field v-model="item.quantity" label="出库数量" type="number" input-align="right" />
            <Field v-model="item.price" label="单价" type="number" input-align="right" />
          </div>
        </div>
        <Empty v-else description="请选择销售订单后带出明细" />
      </CellGroup>

      <div class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleSubmit">保存出库单</Button>
      </div>
    </div>

    <Popup v-model:show="showOrderPicker" round position="bottom" :style="{ height: '75%' }">
      <div class="picker-panel">
        <Search v-model="orderKeyword" placeholder="搜索订单号或客户" @search="fetchOrders" />
        <div class="picker-list">
          <Cell
            v-for="order in orders"
            :key="order.id"
            :title="order.order_no || order.code"
            :label="order.customer_name || order.customerName"
            clickable
            @click="pickOrder(order)"
          />
          <Empty v-if="orders.length === 0" description="暂无销售订单" />
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { Button, Cell, CellGroup, Empty, Field, NavBar, Popup, Search, showToast } from 'vant'
  import { salesApi } from '@/api'
  import { extractApiData, extractApiList } from '@/utils/apiHelper'

  const router = useRouter()
  const submitting = ref(false)
  const showOrderPicker = ref(false)
  const orderKeyword = ref('')
  const orders = ref([])
  const selectedOrder = ref(null)
  const items = ref([])

  const form = reactive({
    delivery_date: new Date().toISOString().slice(0, 10),
    remarks: ''
  })

  const selectedOrderTitle = computed(() => {
    if (!selectedOrder.value) return '请选择订单'
    return `${selectedOrder.value.order_no || selectedOrder.value.code || ''} ${selectedOrder.value.customer_name || selectedOrder.value.customerName || ''}`
  })

  const normalizeOrderItems = (order) => {
    const sourceItems = order.items || order.order_items || []
    return sourceItems
      .map((item) => {
        const productId = item.product_id || item.material_id
        return {
          product_id: productId,
          material_id: productId,
          product_name: item.product_name || item.material_name || item.name,
          product_code: item.product_code || item.material_code || item.code,
          quantity: item.remaining_quantity || item.unshipped_quantity || item.quantity || 0,
          price: item.unit_price || item.price || 0,
          source_order_id: order.id,
          source_order_no: order.order_no || order.code
        }
      })
      .filter((item) => item.product_id)
  }

  const fetchOrders = async () => {
    const response = await salesApi.getSalesOrders({
      search: orderKeyword.value || undefined,
      page: 1,
      pageSize: 50
    })
    orders.value = extractApiList(response)
  }

  const pickOrder = async (order) => {
    selectedOrder.value = order
    showOrderPicker.value = false
    try {
      const response = await salesApi.getSalesOrder(order.id)
      const detail = extractApiData(response, order)
      selectedOrder.value = { ...order, ...detail }
      items.value = normalizeOrderItems(selectedOrder.value)
    } catch (error) {
      console.warn('加载订单详情失败，使用列表数据', error)
      items.value = normalizeOrderItems(order)
    }
  }

  const handleSubmit = async () => {
    if (!selectedOrder.value) return showToast('请选择关联订单')
    const validItems = items.value
      .filter((item) => Number(item.quantity) > 0 && item.product_id)
      .map((item) => ({
        product_id: item.product_id,
        material_id: item.material_id,
        quantity: Number(item.quantity),
        price: item.price === null || item.price === undefined || item.price === '' ? null : Number(item.price),
        source_order_id: item.source_order_id,
        source_order_no: item.source_order_no
      }))
    if (validItems.length === 0) return showToast('请填写出库明细')

    submitting.value = true
    try {
      const response = await salesApi.createSalesOutbound({
        order_id: selectedOrder.value.id,
        delivery_date: form.delivery_date,
        status: 'draft',
        remarks: form.remarks,
        items: validItems
      })
      const data = extractApiData(response, {})
      showToast({ type: 'success', message: '销售出库单已创建' })
      router.replace(data.id ? `/sales/outbound/${data.id}` : '/sales/outbound')
    } catch (error) {
      console.error('创建销售出库失败', error)
    } finally {
      submitting.value = false
    }
  }

  onMounted(fetchOrders)
</script>

<style lang="scss" scoped>
  .create-page {
    min-height: 100%;
    background: var(--bg-primary);
  }

  .content {
    padding: 12px 0 24px;
  }

  .items {
    padding: 0 12px var(--app-bottom-space);
  }

  .item-card {
    margin-bottom: 10px;
    padding: 12px;
    border: 1px solid var(--surface-border);
    border-radius: 8px;
    background: var(--bg-secondary);
  }

  .item-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .item-subtitle {
    margin-top: 3px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .submit-area {
    padding: 20px 16px;
  }

  .picker-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .picker-list {
    flex: 1;
    overflow-y: auto;
  }
</style>
