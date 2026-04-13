/**
 * useOrderForm.js
 * @description 销售订单表单逻辑的组合式函数（从 SalesOrders.vue 抽取）
 * 包含：表单数据、验证规则、金额计算、物料操作、客户选择、提交逻辑
 */
import { ref, reactive, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesApi, baseDataApi, inventoryApi } from '@/api'
import { parseListData } from '@/utils/responseParser'
import { searchMaterials } from '@/utils/searchConfig'
import { checkInventory } from '@/composables/useInventoryCheck'
import { useFinanceStore } from '@/stores/finance'
import { storeToRefs } from 'pinia'

/** 默认交期天数 */
const DEFAULT_DELIVERY_DAYS = 21

export function useOrderForm(fetchDataCallback, updateParamsCallback) {
  // 财务 store
  const financeStore = useFinanceStore()
  const { vatRateOptions, defaultVATRate } = storeToRefs(financeStore)

  // 对话框控制
  const dialogVisible = ref(false)
  const dialogLoading = ref(false)
  const dialogType = ref('add')

  // 表单引用
  const formRef = ref(null)
  const contractCodeInput = ref(null)

  // 客户列表和产品列表
  const customers = ref([])
  const filteredCustomers = ref([])
  const customerSearchLoading = ref(false)
  const products = ref([])
  const filteredProducts = ref([])
  const materialsLoading = ref(false)

  // 表单数据
  const form = reactive({
    customer_id: '',
    customer_name: '',
    contract_code: '',
    contact: '',
    phone: '',
    address: '',
    deliveryDate: '',
    status: 'pending',
    items: [],
    remark: '',
    subtotal: 0,
    tax_amount: 0,
    total_amount: 0
  })

  // 表单验证规则
  const rules = {
    customer_id: [
      { required: true, message: '请选择客户', trigger: 'change' }
    ],
    deliveryDate: [
      { required: true, message: '请选择交付日期', trigger: 'change' }
    ]
  }

  // 组件引用管理
  const materialSelectRefs = ref({})
  const quantityInputRefs = ref({})

  const setMaterialSelectRef = (el, index) => {
    if (el) materialSelectRefs.value[index] = el
  }

  const setQuantityInputRef = (el, index) => {
    if (el) quantityInputRefs.value[index] = el
  }

  // 简化监听器
  watch(() => products.value.length, (newLength) => {
    if (newLength > 0 && filteredProducts.value.length === 0) {
      filteredProducts.value = [...products.value]
    }
  })

  // ========== 金额计算 ==========

  const calculateTotalAmount = () => {
    const subtotal = form.items.reduce((total, item) => total + (item.amount || 0), 0)
    const taxAmount = form.items.reduce((total, item) => total + (item.tax_amount || 0), 0)
    form.subtotal = subtotal
    form.tax_amount = taxAmount
    form.total_amount = subtotal + taxAmount
  }

  watch(() => form.items, () => {
    calculateTotalAmount()
  }, { deep: true })

  const calculateItemAmount = (index) => {
    if (index < 0 || index >= form.items.length) return
    const item = form.items[index]
    if (!item) return

    let quantity = typeof item.quantity === 'string'
      ? parseFloat(item.quantity.replace(/,/g, '') || 0) : Number(item.quantity || 0)
    let unitPrice = typeof item.unit_price === 'string'
      ? parseFloat(item.unit_price.replace(/,/g, '') || 0) : Number(item.unit_price || 0)

    if (isNaN(quantity)) quantity = 0
    if (isNaN(unitPrice)) unitPrice = 0

    item.quantity = quantity
    item.unit_price = unitPrice
    item.amount = quantity * unitPrice
    const taxRate = item.tax_rate !== undefined ? item.tax_rate : 0
    item.tax_amount = item.amount * taxRate
    calculateTotalAmount()
  }

  // ========== 客户操作 ==========

  const fetchCustomers = async () => {
    try {
      const response = await baseDataApi.getCustomers({ status: 'active' })
      const customersData = parseListData(response, { enableLog: false })
      if (customersData.length > 0) {
        customers.value = customersData.map(customer => ({
          id: customer.id,
          code: customer.code || customer.customer_code || `C${customer.id}`,
          name: customer.name,
          contact_person: customer.contact_person,
          contact_phone: customer.contact_phone,
          address: customer.address
        }))
        filteredCustomers.value = [...customers.value]
      } else {
        customers.value = []
        filteredCustomers.value = []
      }
    } catch (error) {
      console.error('获取客户数据失败:', error)
      ElMessage.error('获取客户数据失败')
      customers.value = []
      filteredCustomers.value = []
    }
  }

  const searchCustomers = (query) => {
    customerSearchLoading.value = true
    setTimeout(() => {
      if (query) {
        filteredCustomers.value = customers.value.filter(customer => {
          const searchText = query.toLowerCase()
          return (
            customer.code.toLowerCase().includes(searchText) ||
            customer.name.toLowerCase().includes(searchText) ||
            (customer.contact_person && customer.contact_person.toLowerCase().includes(searchText))
          )
        })
      } else {
        filteredCustomers.value = [...customers.value]
      }
      customerSearchLoading.value = false
    }, 300)
  }

  const handleCustomerChange = (customerId) => {
    if (!Array.isArray(customers.value)) {
      console.error('customers.value不是数组:', customers.value)
      ElMessage.error('客户数据格式错误')
      return
    }
    const selectedCustomer = customers.value.find(c => c.id === customerId)
    if (selectedCustomer) {
      form.customer_name = selectedCustomer.name
      form.contact = selectedCustomer.contact_person || selectedCustomer.contact || ''
      form.phone = selectedCustomer.contact_phone || selectedCustomer.phone || ''
      form.address = selectedCustomer.address || ''
    }
  }

  const handleCustomerEnterKey = () => {
    if (filteredCustomers.value && filteredCustomers.value.length > 0) {
      const firstCustomer = filteredCustomers.value[0]
      form.customer_id = firstCustomer.id
      handleCustomerChange(firstCustomer.id)
      ElMessage.success(`已自动选择客户: ${firstCustomer.code} - ${firstCustomer.name}`)
      nextTick(() => {
        if (contractCodeInput.value) contractCodeInput.value.focus()
      })
    } else if (customers.value && customers.value.length > 0) {
      const firstCustomer = customers.value[0]
      form.customer_id = firstCustomer.id
      handleCustomerChange(firstCustomer.id)
      ElMessage.success(`已自动选择客户: ${firstCustomer.code} - ${firstCustomer.name}`)
      nextTick(() => {
        if (contractCodeInput.value) contractCodeInput.value.focus()
      })
    } else {
      ElMessage.warning('没有可选择的客户，请先加载客户数据')
    }
  }

  // ========== 物料操作 ==========

  const addMaterial = () => {
    form.items.push({
      id: '', material_id: '', material_name: '', material_code: '',
      name: '', code: '', specification: '',
      quantity: '', unit_name: '', unit_id: '',
      unit_price: '', amount: 0,
      tax_rate: defaultVATRate.value, tax_amount: 0, remark: ''
    })
  }

  const removeMaterial = (index) => {
    form.items.splice(index, 1)
  }

  const fetchMaterialSuggestions = async (query, callback) => {
    if (!query || query.length < 1) {
      callback([])
      return
    }
    try {
      const searchResults = await searchMaterials(baseDataApi, query.trim(), {
        pageSize: 500, includeAll: true
      })
      const suggestions = searchResults.map(item => ({
        value: item.code || '无编码', code: item.code || '无编码',
        name: item.name || '未命名',
        specs: item.specification || item.specs || '',
        stock_quantity: item.stock_quantity || 0, id: item.id,
        unit_name: item.unit_name || '个', unit_id: item.unit_id,
        price: item.price || 0
      }))
      filteredProducts.value = suggestions
      callback(suggestions)
    } catch (error) {
      ElMessage.error('搜索物料失败')
      callback([])
    }
  }

  const handleMaterialSelect = (item, index) => {
    const materialId = Number(item.id)
    if (!materialId || isNaN(materialId)) {
      console.error('物料ID无效:', item.id)
      ElMessage.error('物料ID无效，请重新选择')
      return
    }
    form.items[index].material_id = materialId
    form.items[index].code = item.code
    form.items[index].material_code = item.code
    form.items[index].name = item.name
    form.items[index].material_name = item.name
    form.items[index].specification = item.specs
    form.items[index].unit_name = item.unit_name
    form.items[index].unit_id = item.unit_id
    const defaultPrice = parseFloat(item.price) || 0
    if (defaultPrice > 0) {
      form.items[index].unit_price = defaultPrice
      const quantity = parseFloat(form.items[index].quantity) || 0
      form.items[index].amount = quantity * defaultPrice
      calculateTotalAmount()
    }
    nextTick(() => {
      const quantityInput = quantityInputRefs.value[index]
      if (quantityInput) quantityInput.focus()
    })
  }

  const handleMaterialClear = (index) => {
    const fields = ['material_id', 'code', 'material_code', 'name', 'material_name', 'specification', 'unit_name', 'unit_id', 'unit_price']
    fields.forEach(f => { form.items[index][f] = '' })
  }

  const handleMaterialEnter = async (index) => {
    const inputCode = form.items[index].code?.trim()
    if (!inputCode) { ElMessage.warning('请输入物料编码'); return }

    let exactMatch = filteredProducts.value.find(m => {
      const codeMatch = m.code === inputCode || m.code.toLowerCase() === inputCode.toLowerCase()
      const specsMatch = m.specs === inputCode || m.specs?.toLowerCase() === inputCode.toLowerCase()
      return codeMatch || specsMatch
    })
    if (exactMatch) { handleMaterialSelect(exactMatch, index); return }

    try {
      const res = await baseDataApi.getMaterials({ keyword: inputCode, page: 1, pageSize: 20 })
      const materials = parseListData(res, { enableLog: false })
      exactMatch = materials.find(m => {
        const codeMatch = (m.code || '').toLowerCase() === inputCode.toLowerCase()
        const specsMatch = (m.specs || m.specification || '').toLowerCase() === inputCode.toLowerCase()
        return codeMatch || specsMatch
      })
      if (exactMatch) {
        const materialItem = {
          id: exactMatch.id, code: exactMatch.code || exactMatch.material_code || '',
          name: exactMatch.name || exactMatch.material_name || '',
          specs: exactMatch.specs || exactMatch.specification || '',
          stock_quantity: exactMatch.stock_quantity || exactMatch.inventory || 0,
          unit_name: exactMatch.unit_name || exactMatch.unit || '', unit_id: exactMatch.unit_id
        }
        handleMaterialSelect(materialItem, index); return
      }
      if (filteredProducts.value.length > 0) {
        const firstMaterial = filteredProducts.value[0]
        const displayInfo = firstMaterial.specs ? `${firstMaterial.code} (${firstMaterial.specs})` : firstMaterial.code
        ElMessage.info(`未找到精确匹配 "${inputCode}"，已自动选择: ${displayInfo}`)
        handleMaterialSelect(firstMaterial, index); return
      }
      ElMessage.warning(`未找到包含 "${inputCode}" 的物料`)
    } catch (error) {
      if (filteredProducts.value.length > 0) {
        const firstMaterial = filteredProducts.value[0]
        const displayInfo = firstMaterial.specs ? `${firstMaterial.code} (${firstMaterial.specs})` : firstMaterial.code
        ElMessage.info(`已自动选择: ${displayInfo}`)
        handleMaterialSelect(firstMaterial, index)
      } else {
        ElMessage.error('查找物料失败，请重试')
      }
    }
  }

  const handleQuantityEnter = (index) => {
    addMaterial()
    nextTick(() => {
      const newIndex = form.items.length - 1
      const materialSelect = materialSelectRefs.value[newIndex]
      if (materialSelect) materialSelect.focus()
    })
  }

  // checkInventory 使用 @/composables/useInventoryCheck 公共实现

  // ========== 表单提交 ==========

  const handleSubmit = async () => {
    if (!form.customer_id) { ElMessage.error('请选择客户'); return }
    if (form.items.length === 0) { ElMessage.error('请添加至少一项产品'); return }

    const invalidItems = []
    form.items.forEach((item, index) => { if (!item.material_id) invalidItems.push(index + 1) })
    if (invalidItems.length > 0) {
      ElMessage.error(`第 ${invalidItems.join(', ')} 行物料未选择，请选择物料后再提交`); return
    }

    const incompleteItems = []
    form.items.forEach((item, index) => {
      const quantity = Number(item.quantity)
      if (!quantity || quantity <= 0) incompleteItems.push(index + 1)
    })
    if (incompleteItems.length > 0) {
      ElMessage.error(`第 ${incompleteItems.join(', ')} 行数量不正确，请检查后再提交`); return
    }

    try {
      const insufficientItems = await checkInventory(form.items)
      let orderStatus
      let shouldGeneratePlans = false

      if (dialogType.value === 'edit') {
        orderStatus = form.status || 'pending'
        if (insufficientItems.length > 0) {
          const itemMessages = insufficientItems.map(item =>
            `${item.materialName || item.material_name || '未知物料'}: 需要 ${item.quantity}, 库存 ${item.currentStock}`)
          const alertMessage = `以下物料库存不足:\n${itemMessages.join('\n')}\n\n是否继续保存并生成生产/采购计划?`
          try {
            await ElMessageBox.confirm(alertMessage, '库存不足警告', {
              confirmButtonText: '继续保存', cancelButtonText: '取消', type: 'warning',
            })
            shouldGeneratePlans = true
          } catch (userChoice) { return }
        }
      } else {
        if (insufficientItems.length > 0) {
          const itemMessages = insufficientItems.map(item =>
            `${item.materialName || item.material_name || '未知物料'}: 需要 ${item.quantity}, 库存 ${item.currentStock}`)
          const alertMessage = `以下物料库存不足:\n${itemMessages.join('\n')}\n\n是否仍要创建订单?`
          try {
            await ElMessageBox.confirm(alertMessage, '库存不足警告', {
              confirmButtonText: '继续创建', cancelButtonText: '取消', type: 'warning',
            })
            orderStatus = 'in_production'
            shouldGeneratePlans = true
          } catch (userChoice) { return }
        } else {
          orderStatus = 'ready_to_ship'
        }
      }

      dialogLoading.value = true
      const postData = {
        customer_id: form.customer_id,
        contract_code: form.contract_code || '',
        delivery_date: form.deliveryDate,
        order_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
        status: orderStatus,
        should_generate_plans: shouldGeneratePlans,
        subtotal: form.subtotal || 0,
        total_amount: form.total_amount || 0,
        notes: form.remark || '',
        items: form.items.map(item => {
          const quantity = parseFloat(item.quantity) || 0
          const unitPrice = parseFloat(item.unit_price) || 0
          const taxRate = item.tax_rate !== undefined ? item.tax_rate : defaultVATRate.value
          const amount = quantity * unitPrice
          const taxAmount = amount * taxRate
          return {
            material_id: item.material_id, quantity, unit_price: unitPrice,
            amount, tax_percent: taxRate, tax_amount: taxAmount,
            specification: item.specification, remark: item.remark || ''
          }
        })
      }

      let orderSaved = false
      try {
        if (dialogType.value === 'edit') {
          await salesApi.updateOrder(form.id, postData)
          ElMessage.success('订单更新成功')
          orderSaved = true
        } else {
          await salesApi.createOrder(postData)
          ElMessage.success('订单创建成功')
          if (updateParamsCallback) updateParamsCallback({ page: 1 })
          orderSaved = true
        }
        dialogVisible.value = false
      } catch (error) {
        const action = dialogType.value === 'edit' ? '更新' : '创建'
        console.error(`${action}订单失败:`, error)
        ElMessage.error(`${action}订单失败: ` + (error.message || '未知错误'))
      } finally {
        dialogLoading.value = false
        if (orderSaved && fetchDataCallback) await fetchDataCallback()
      }
    } catch (error) {
      console.error('提交过程中发生错误:', error)
      ElMessage.error('提交过程中发生错误: ' + (error.message || '未知错误'))
    }
  }

  // ========== 新增/编辑入口 ==========

  const handleAdd = async () => {
    dialogType.value = 'add'
    Object.keys(form).forEach(key => {
      if (key === 'items') {
        form[key] = [{
          id: '', name: '', code: '', material_name: '', material_code: '', material_id: '',
          specification: '', quantity: '', unit_name: '', unit_id: '',
          unit_price: '', amount: 0, remark: ''
        }]
      } else if (key === 'deliveryDate') {
        const today = new Date(); const deliveryDate = new Date(today)
        deliveryDate.setDate(today.getDate() + DEFAULT_DELIVERY_DAYS)
        form[key] = deliveryDate.toISOString().split('T')[0]
      } else if (key === 'taxRate') {
        form[key] = defaultVATRate.value
      } else if (key === 'subtotal' || key === 'tax_amount' || key === 'total_amount') {
        form[key] = 0
      } else {
        form[key] = ''
      }
    })
    const productsArray = Array.isArray(products.value) ? products.value : []
    filteredProducts.value = [...productsArray]
    if (customers.value.length === 0) {
      await fetchCustomers()
    } else {
      filteredCustomers.value = [...customers.value]
    }
    if (products.value.length === 0) {
      try {
        materialsLoading.value = true
        const materialsRes = await baseDataApi.getMaterials({ limit: 100, pageSize: 100, page: 1 })
        const resData = materialsRes.data
        const materialsData = Array.isArray(resData) ? resData
          : Array.isArray(resData?.list) ? resData.list
          : Array.isArray(resData?.data) ? resData.data : []
        products.value = materialsData.map(material => ({
          id: material.id, code: material.code || '', value: material.code || '',
          name: material.name || '', material_name: material.name || '',
          specs: material.specs || material.specification || '',
          drawing_no: material.drawing_no || '',
          stock_quantity: material.stock_quantity || material.quantity || 0,
          label: `${material.code || ''} - ${material.name || ''} ${material.specs ? `(${material.specs})` : ''} [库存:${material.stock_quantity || material.quantity || 0}]`,
          specification: material.specification || material.specs || '',
          unit_id: material.unit_id, unit_name: material.unit_name || '个',
          price: material.price || 0
        })).filter(item => item.id)
        filteredProducts.value = [...products.value]
      } catch (error) {
        console.error('加载物料数据失败:', error)
      } finally {
        materialsLoading.value = false
      }
    }
    dialogVisible.value = true
  }

  const handleEdit = async (row) => {
    dialogType.value = 'edit'
    Object.keys(form).forEach(key => {
      if (key === 'items') form[key] = []
      else form[key] = ''
    })
    dialogVisible.value = true
    dialogLoading.value = true
    try {
      const response = await salesApi.getOrder(row.id)
      const orderDetail = response.data
      Object.assign(form, {
        id: orderDetail.id,
        customer_id: orderDetail.customer_id || row.customer_id || '',
        customer_name: orderDetail.customer_name || row.customer_name || row.customer || '',
        deliveryDate: orderDetail.deliveryDate || orderDetail.delivery_date || row.deliveryDate || row.delivery_date || '',
        address: orderDetail.address || orderDetail.delivery_address || row.address || '',
        contact: orderDetail.contact || orderDetail.contact_person || row.contact || '',
        phone: orderDetail.phone || orderDetail.contact_phone || row.phone || '',
        contract_code: orderDetail.contract_code || row.contract_code || '',
        status: orderDetail.status || row.status || 'pending',
        remark: orderDetail.remark || orderDetail.remarks || orderDetail.notes || row.remark || '',
        items: []
      })
      const orderItems = orderDetail.items || row.items || []
      if (Array.isArray(orderItems) && orderItems.length > 0) {
        form.items = orderItems.map(item => {
          let quantity = typeof item.quantity === 'string' ? parseFloat(item.quantity.replace(/,/g, '') || 0) : Number(item.quantity || 0)
          let unitPrice = typeof item.unit_price === 'string' ? parseFloat(item.unit_price.replace(/,/g, '') || 0) : Number(item.unit_price || 0)
          let amount = typeof item.amount === 'string' ? parseFloat(item.amount.replace(/,/g, '') || 0) : Number(item.amount || 0)
          if (isNaN(amount) || amount === 0) amount = quantity * unitPrice
          return {
            ...item,
            code: item.material_code || item.code || '',
            material_code: item.material_code || item.code || '',
            material_name: item.material_name || item.name || '',
            material_id: item.material_id || '',
            specification: item.specification || item.specs || '',
            quantity, unit_price: unitPrice,
            unit_name: item.unit_name || '个', unit_id: item.unit_id || '',
            amount,
            tax_rate: item.tax_rate !== undefined ? item.tax_rate : (item.tax_percent !== undefined ? item.tax_percent : defaultVATRate.value),
            tax_amount: item.tax_amount || parseFloat((amount * (item.tax_rate || item.tax_percent || 0)).toFixed(2)),
            remark: item.remark || item.remarks || ''
          }
        })
        // 异步补充缺失的 material_id
        const itemsNeedingMaterialId = form.items.filter(item => !item.material_id && item.code)
        if (itemsNeedingMaterialId.length > 0) {
          setTimeout(async () => {
            for (let i = 0; i < form.items.length; i++) {
              const item = form.items[i]
              if (!item.material_id && item.code) {
                try {
                  const res = await baseDataApi.getMaterials({ keyword: item.code, page: 1, pageSize: 10 })
                  const materials = parseListData(res, { enableLog: false })
                  const exactMatch = materials.find(m =>
                    (m.code || '').toLowerCase() === item.code.toLowerCase() ||
                    (m.specs || m.specification || '').toLowerCase() === item.code.toLowerCase()
                  )
                  if (exactMatch) {
                    form.items[i].material_id = exactMatch.id
                    form.items[i].material_code = exactMatch.code || item.code
                    form.items[i].material_name = exactMatch.name || item.material_name
                    form.items[i].specification = exactMatch.specs || exactMatch.specification || item.specification
                    form.items[i].unit_id = exactMatch.unit_id || item.unit_id
                    form.items[i].unit_name = exactMatch.unit_name || item.unit_name
                  }
                } catch (error) { console.error(`查找物料 ${item.code} 失败:`, error) }
              }
            }
          }, 500)
        }
      }
    } catch (error) {
      console.error('获取订单详情失败:', error)
      ElMessage.error('获取订单详情失败，请重试')
      dialogLoading.value = false
      return
    } finally {
      dialogLoading.value = false
    }
    calculateTotalAmount()
    filteredProducts.value = [...products.value]
    if (!form.customer_id && form.customer_name && Array.isArray(customers.value)) {
      const matchedCustomer = customers.value.find(c => c.name === form.customer_name || c.name === form.customer)
      if (matchedCustomer) form.customer_id = matchedCustomer.id
    }
  }

  return {
    // 对话框控制
    dialogVisible, dialogLoading, dialogType,
    // 表单
    formRef, contractCodeInput, form, rules,
    // 客户
    customers, filteredCustomers, customerSearchLoading,
    fetchCustomers, searchCustomers, handleCustomerChange, handleCustomerEnterKey,
    // 产品/物料
    products, filteredProducts, materialsLoading,
    materialSelectRefs, quantityInputRefs,
    setMaterialSelectRef, setQuantityInputRef,
    addMaterial, removeMaterial,
    fetchMaterialSuggestions, handleMaterialSelect, handleMaterialClear,
    handleMaterialEnter, handleQuantityEnter,
    // 金额
    calculateItemAmount, calculateTotalAmount,
    // 提交
    handleSubmit, handleAdd, handleEdit,
    // 税率
    vatRateOptions, defaultVATRate, financeStore
  }
}
