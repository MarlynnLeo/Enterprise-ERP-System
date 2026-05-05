<!--
/**
 * CreateSalesOrder.vue - 新建销售订单
 * @description 移动端新建销售订单表单
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <div class="create-page">
    <NavBar title="新建销售订单" left-arrow @click-left="router.back()">
      <template #right>
        <Button type="primary" size="small" @click="submitForm" :loading="submitting">保存</Button>
      </template>
    </NavBar>

    <div class="content-container">
      <Form @submit="submitForm" ref="formRef">
        <!-- 基本信息 -->
        <div class="form-section">
          <div class="section-title">基本信息</div>
          <Field v-model="form.order_no" name="order_no" label="订单编号" placeholder="系统自动生成" readonly />
          <Field v-model="selectedCustomerName" name="customer" label="选择客户" placeholder="请选择客户" readonly is-link @click="showCustomerPicker = true" :rules="[{ required: true, message: '请选择客户' }]" />
          <Field v-model="form.order_date" name="order_date" label="订单日期" placeholder="请选择订单日期" type="date" :rules="[{ required: true, message: '请选择订单日期' }]" />
          <Field v-model="form.delivery_date" name="delivery_date" label="交货日期" placeholder="请选择交货日期" type="date" :rules="[{ required: true, message: '请选择交货日期' }]" />
        </div>

        <!-- 联系信息 -->
        <div class="form-section" v-if="selectedCustomer">
          <div class="section-title">联系信息</div>
          <Field v-model="form.contact_person" name="contact_person" label="联系人" placeholder="请输入联系人" />
          <Field v-model="form.contact_phone" name="contact_phone" label="联系电话" placeholder="请输入联系电话" type="tel" />
          <Field v-model="form.shipping_address" name="shipping_address" label="收货地址" placeholder="请输入收货地址" type="textarea" rows="2" />
        </div>

        <!-- 订单明细 -->
        <div class="form-section">
          <div class="section-title">
            订单明细
            <Button type="primary" size="mini" @click="addItem">添加产品</Button>
          </div>

          <div class="items-container" v-if="orderItems.length > 0">
            <div v-for="(item, index) in orderItems" :key="index" class="item-card">
              <div class="item-header">
                <span class="item-name">{{ item.material_name || '未选择产品' }}</span>
                <VanIcon name="cross" size="16" @click="removeItem(index)" />
              </div>
              <div class="item-details">
                <div class="item-row"><span class="label">编码:</span><span class="value">{{ item.material_code || '-' }}</span></div>
                <div class="item-row"><span class="label">数量:</span><span class="value">{{ item.quantity }} {{ item.unit || '件' }}</span></div>
                <div class="item-row"><span class="label">单价:</span><span class="value">¥{{ formatAmount(item.unit_price) }}</span></div>
                <div class="item-row"><span class="label">小计:</span><span class="value total">¥{{ formatAmount(item.total_price) }}</span></div>
              </div>
              <div class="item-actions"><Button size="small" @click="editItem(index)">编辑</Button></div>
            </div>
          </div>

          <div v-else class="empty-items">
            <Empty description="暂无订单明细" />
            <Button type="primary" @click="addItem">添加产品</Button>
          </div>
        </div>

        <!-- 订单汇总 -->
        <div class="form-section" v-if="orderItems.length > 0">
          <div class="section-title">订单汇总</div>
          <div class="summary-container">
            <div class="summary-row"><span class="label">产品种类:</span><span class="value">{{ orderItems.length }} 种</span></div>
            <div class="summary-row"><span class="label">订单总额:</span><span class="value total-amount">¥{{ formatAmount(totalAmount) }}</span></div>
          </div>
        </div>

        <!-- 备注 -->
        <div class="form-section">
          <div class="section-title">备注信息</div>
          <Field v-model="form.remark" name="remark" label="备注" placeholder="请输入备注信息（可选）" type="textarea" rows="3" />
        </div>
      </Form>
    </div>

    <!-- 客户选择弹窗 -->
    <Popup v-model:show="showCustomerPicker" position="bottom" :style="{ height: '70%' }">
      <div class="picker-panel">
        <div class="picker-header">
          <span @click="showCustomerPicker = false">取消</span>
          <span class="picker-title">选择客户</span>
          <span @click="confirmCustomer">确定</span>
        </div>
        <div class="picker-search">
          <Search v-model="customerSearchValue" placeholder="搜索客户名称" @search="searchCustomers" />
        </div>
        <div class="picker-content">
          <div v-for="c in customerList" :key="c.id" class="picker-item" :class="{ active: tempCustomer?.id === c.id }" @click="tempCustomer = c">
            <div class="picker-item-name">{{ c.name }}</div>
            <div class="picker-item-sub">{{ c.contact }} · {{ c.phone }}</div>
          </div>
          <Empty v-if="customerList.length === 0" description="暂无客户数据" />
        </div>
      </div>
    </Popup>

    <!-- 产品编辑弹窗 -->
    <Popup v-model:show="showItemEditor" position="bottom" :style="{ height: '80%' }">
      <div class="picker-panel">
        <div class="picker-header">
          <span @click="showItemEditor = false">取消</span>
          <span class="picker-title">{{ editingIndex >= 0 ? '编辑' : '添加' }}产品</span>
          <span @click="confirmItem">确定</span>
        </div>
        <div class="editor-content">
          <Form ref="itemFormRef">
            <Field v-model="selectedMaterialName" name="material" label="选择产品" placeholder="请选择产品" readonly is-link @click="showMaterialPicker = true" :rules="[{ required: true, message: '请选择产品' }]" />
            <Field v-model="currentItem.quantity" name="quantity" label="销售数量" placeholder="请输入数量" type="number" :rules="[{ required: true, message: '请输入数量' }]" />
            <Field v-model="currentItem.unit_price" name="unit_price" label="销售单价" placeholder="请输入单价" type="number" :rules="[{ required: true, message: '请输入单价' }]" />
            <Field v-model="currentItem.remark" name="remark" label="备注" placeholder="请输入备注（可选）" />
          </Form>
        </div>
      </div>
    </Popup>

    <!-- 产品选择弹窗 -->
    <Popup v-model:show="showMaterialPicker" position="bottom" :style="{ height: '70%' }">
      <div class="picker-panel">
        <div class="picker-header">
          <span @click="showMaterialPicker = false">取消</span>
          <span class="picker-title">选择产品</span>
          <span @click="confirmMaterial">确定</span>
        </div>
        <div class="picker-search">
          <Search v-model="materialSearchValue" placeholder="搜索产品名称或编码" @search="searchMaterials" />
        </div>
        <div class="picker-content">
          <div v-for="m in materialList" :key="m.id" class="picker-item" :class="{ active: tempMaterial?.id === m.id }" @click="tempMaterial = m">
            <div class="picker-item-name">{{ m.name }}</div>
            <div class="picker-item-sub">{{ m.code }} · {{ m.specs || '' }}</div>
          </div>
          <Empty v-if="materialList.length === 0" description="暂无产品数据" />
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { NavBar, Button, Form, Field, Popup, Search, Empty, Icon as VanIcon, showToast, showLoadingToast, closeToast } from 'vant'
  import { salesApi, baseDataApi } from '@/services/api'

  const router = useRouter()
  const formRef = ref()
  const itemFormRef = ref()
  const submitting = ref(false)

  const form = reactive({
    order_no: '', customer_id: '', order_date: '', delivery_date: '',
    contact_person: '', contact_phone: '', shipping_address: '', remark: ''
  })

  // 弹窗状态
  const showCustomerPicker = ref(false)
  const showItemEditor = ref(false)
  const showMaterialPicker = ref(false)

  // 客户
  const customerList = ref([])
  const customerSearchValue = ref('')
  const selectedCustomer = ref(null)
  const tempCustomer = ref(null)
  const selectedCustomerName = computed(() => selectedCustomer.value ? selectedCustomer.value.name : '')

  // 产品
  const materialList = ref([])
  const materialSearchValue = ref('')
  const tempMaterial = ref(null)
  const selectedMaterial = ref(null)
  const selectedMaterialName = computed(() => selectedMaterial.value ? `${selectedMaterial.value.name} (${selectedMaterial.value.code})` : '')

  // 订单明细
  const orderItems = ref([])
  const currentItem = reactive({ material_id: '', material_name: '', material_code: '', quantity: '', unit_price: '', unit: '', remark: '' })
  const editingIndex = ref(-1)
  const totalAmount = computed(() => orderItems.value.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0))

  const formatAmount = (v) => v ? parseFloat(v).toFixed(2) : '0.00'

  // 客户操作
  const searchCustomers = async () => {
    try {
      const res = await baseDataApi.getCustomers({ page: 1, pageSize: 100, name: customerSearchValue.value })
      customerList.value = res.data?.items || res.data?.list || res.data || []
    } catch (e) { console.error(e) }
  }
  const confirmCustomer = () => {
    if (tempCustomer.value) {
      selectedCustomer.value = tempCustomer.value
      form.customer_id = tempCustomer.value.id
      if (tempCustomer.value.contact) form.contact_person = tempCustomer.value.contact
      if (tempCustomer.value.phone) form.contact_phone = tempCustomer.value.phone
      if (tempCustomer.value.address) form.shipping_address = tempCustomer.value.address
    }
    showCustomerPicker.value = false
  }

  // 产品操作
  const searchMaterials = async () => {
    try {
      const res = await baseDataApi.getMaterials({ page: 1, pageSize: 100, name: materialSearchValue.value })
      const d = res.data || res
      materialList.value = Array.isArray(d) ? d : d.list || d.items || []
    } catch (e) { console.error(e) }
  }
  const confirmMaterial = () => {
    if (tempMaterial.value) {
      selectedMaterial.value = tempMaterial.value
      currentItem.material_id = tempMaterial.value.id
      currentItem.material_name = tempMaterial.value.name
      currentItem.material_code = tempMaterial.value.code
      currentItem.unit = tempMaterial.value.unit || '件'
    }
    showMaterialPicker.value = false
  }

  // 明细操作
  const addItem = () => { resetItem(); editingIndex.value = -1; showItemEditor.value = true }
  const editItem = (i) => {
    const item = orderItems.value[i]
    Object.assign(currentItem, item)
    selectedMaterial.value = { id: item.material_id, name: item.material_name, code: item.material_code }
    editingIndex.value = i
    showItemEditor.value = true
  }
  const confirmItem = async () => {
    try {
      await itemFormRef.value?.validate()
      if (!currentItem.material_id) { showToast('请选择产品'); return }
      currentItem.total_price = (parseFloat(currentItem.quantity) || 0) * (parseFloat(currentItem.unit_price) || 0)
      if (editingIndex.value >= 0) orderItems.value[editingIndex.value] = { ...currentItem }
      else orderItems.value.push({ ...currentItem })
      showItemEditor.value = false
      resetItem()
    } catch (e) { console.error(e) }
  }
  const removeItem = (i) => orderItems.value.splice(i, 1)
  const resetItem = () => {
    Object.assign(currentItem, { material_id: '', material_name: '', material_code: '', quantity: '', unit_price: '', unit: '', remark: '' })
    selectedMaterial.value = null
  }

  const submitForm = async () => {
    try {
      await formRef.value?.validate()
      if (!form.customer_id) { showToast('请选择客户'); return }
      if (orderItems.value.length === 0) { showToast('请添加订单明细'); return }
      submitting.value = true
      showLoadingToast({ message: '保存中...', forbidClick: true })
      await salesApi.createSalesOrder({
        ...form,
        total_amount: totalAmount.value,
        items: orderItems.value.map(i => ({
          material_id: i.material_id, quantity: parseFloat(i.quantity),
          unit_price: parseFloat(i.unit_price), total_price: parseFloat(i.total_price), remark: i.remark
        }))
      })
      closeToast()
      showToast('销售订单创建成功')
      router.back()
    } catch (e) {
      closeToast()
      console.error('创建销售订单失败:', e)
      showToast(e.response?.data?.message || '创建销售订单失败')
    } finally { submitting.value = false }
  }

  onMounted(async () => {
    form.order_date = new Date().toISOString().split('T')[0]
    await Promise.all([searchCustomers(), searchMaterials()])
  })
</script>

<style lang="scss" scoped>
  .create-page { height: 100vh; background: var(--bg-primary); display: flex; flex-direction: column; overflow: hidden; }
  .content-container { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .form-section { background: var(--bg-secondary); margin-bottom: 12px;
    .section-title { padding: 16px; font-size: 1rem; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; }
  }
  .items-container { padding: 16px; }
  .item-card { border: 1px solid var(--glass-border); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
  .item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
    .item-name { font-weight: 500; color: var(--text-primary); }
  }
  .item-details { margin-bottom: 12px; }
  .item-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.875rem;
    .label { color: var(--text-secondary); }
    .value { color: var(--text-primary); &.total { color: var(--van-primary-color); font-weight: 500; } }
  }
  .item-actions { text-align: right; }
  .empty-items { padding: 40px 20px; text-align: center; }
  .summary-container { padding: 16px; }
  .summary-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 0.9375rem;
    .total-amount { color: var(--van-primary-color); font-weight: 600; font-size: 1.125rem; }
  }
  .picker-panel { height: 100%; display: flex; flex-direction: column; }
  .picker-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid var(--glass-border);
    .picker-title { font-weight: 600; }
    span { color: var(--van-primary-color); cursor: pointer; }
  }
  .picker-search { padding: 8px; }
  .picker-content { flex: 1; overflow-y: auto; }
  .picker-item { padding: 12px 16px; border-bottom: 1px solid var(--glass-border); cursor: pointer;
    &.active { background: rgba(25, 137, 250, 0.1); }
    .picker-item-name { font-weight: 500; color: var(--text-primary); }
    .picker-item-sub { font-size: 0.8125rem; color: var(--text-secondary); margin-top: 4px; }
  }
  .editor-content { flex: 1; overflow-y: auto; }
</style>
