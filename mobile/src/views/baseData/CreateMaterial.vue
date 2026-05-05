<!--
/**
 * CreateMaterial.vue - 新建物料
 * @description 移动端新建物料表单（与网页端字段完全对齐）
 * @date 2026-04-20
 * @version 2.0.0
 */
-->
<template>
  <div class="create-page">
    <NavBar :title="isEdit ? '编辑物料' : '新建物料'" left-arrow @click-left="router.back()">
      <template #right>
        <Button type="primary" size="small" @click="submitForm" :loading="submitting">保存</Button>
      </template>
    </NavBar>

    <div class="content-container">
      <Form @submit="submitForm" ref="formRef">
        <!-- 基本信息 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">📋</span>基本信息
          </div>
          <Field
            v-model="selectedProductCategoryName"
            name="product_category_id"
            label="物料大类"
            placeholder="请选择物料大类"
            readonly
            is-link
            @click="showProductCategoryPicker = true"
            :rules="[{ required: true, message: '请选择物料大类' }]"
          />
          <Field
            v-model="form.code"
            name="code"
            label="物料编码"
            placeholder="选择大类后自动生成"
            readonly
            right-icon="replay"
            @click-right-icon="regenerateCode"
            :rules="[{ required: true, message: '请生成物料编码' }]"
          />
          <Field
            v-model="form.name"
            name="name"
            label="物料名称"
            placeholder="请输入物料名称"
            :rules="[{ required: true, message: '请输入物料名称' }]"
          />
          <Field
            v-model="selectedCategoryName"
            name="category_id"
            label="物料类型"
            placeholder="请选择物料类型"
            readonly
            is-link
            @click="showCategoryPicker = true"
            :rules="[{ required: true, message: '请选择物料类型' }]"
          />
          <Field
            v-model="form.specs"
            name="specs"
            label="规格型号"
            placeholder="请输入规格型号"
          />
          <Field
            v-model="selectedUnitName"
            name="unit_id"
            label="计量单位"
            placeholder="请选择单位"
            readonly
            is-link
            @click="showUnitPicker = true"
            :rules="[{ required: true, message: '请选择计量单位' }]"
          />
        </div>

        <!-- 来源与检验 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">🔍</span>来源与检验
          </div>
          <Field
            v-model="selectedInspectionMethodName"
            name="inspection_method_id"
            label="检验方式"
            placeholder="请选择检验方式"
            readonly
            is-link
            @click="showInspectionMethodPicker = true"
          />
          <Field
            v-model="selectedMaterialSourceName"
            name="material_source_id"
            label="物料来源"
            placeholder="请选择物料来源"
            readonly
            is-link
            @click="showMaterialSourcePicker = true"
          />
          <Field
            v-model="selectedSupplierName"
            name="supplier_id"
            label="供应商"
            placeholder="请选择供应商"
            readonly
            is-link
            @click="showSupplierPicker = true"
          />
          <Field
            v-model="selectedProductionGroupName"
            name="production_group_id"
            label="生产组"
            placeholder="请选择生产组"
            readonly
            is-link
            @click="showProductionGroupPicker = true"
          />
        </div>

        <!-- 物料特征 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">🏷️</span>物料特征
          </div>
          <Field
            v-model="form.material_type"
            name="material_type"
            label="材质"
            placeholder="如：304不锈钢"
          />
          <Field
            v-model="form.drawing_no"
            name="drawing_no"
            label="图号"
            placeholder="请输入图号"
          />
          <Field
            v-model="form.color_code"
            name="color_code"
            label="色号"
            placeholder="请输入色号"
          />
        </div>

        <!-- 存储信息 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">🏭</span>存储信息
          </div>
          <Field
            v-model="selectedLocationName"
            name="location_id"
            label="仓库"
            placeholder="请选择仓库"
            readonly
            is-link
            @click="showLocationPicker = true"
          />
          <Field
            v-model="selectedManagerName"
            name="manager_id"
            label="物料负责人"
            placeholder="请选择负责人"
            readonly
            is-link
            @click="showManagerPicker = true"
          />
          <Field
            v-model="form.location_detail"
            name="location_detail"
            label="物料位置"
            placeholder="如：零部件库-3排-4列"
          />
        </div>

        <!-- 价格信息 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">💰</span>价格信息
          </div>
          <Field
            v-model="form.price"
            name="price"
            label="销售价格"
            placeholder="0.00"
            type="number"
          />
          <Field
            v-model="form.cost_price"
            name="cost_price"
            label="采购成本"
            placeholder="采购入库时自动更新"
            type="number"
            disabled
          />
          <Field
            v-model="selectedTaxRateName"
            name="tax_rate"
            label="税率"
            placeholder="请选择税率"
            readonly
            is-link
            @click="showTaxRatePicker = true"
          />
        </div>

        <!-- 库存参数 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">📦</span>库存参数
          </div>
          <Field
            v-model="form.safety_stock"
            name="safety_stock"
            label="安全库存"
            placeholder="请输入安全库存"
            type="number"
          />
          <Field
            v-model="form.min_stock"
            name="min_stock"
            label="最小库存"
            placeholder="请输入最小库存"
            type="number"
          />
          <Field
            v-model="form.max_stock"
            name="max_stock"
            label="最大库存"
            placeholder="请输入最大库存"
            type="number"
          />
        </div>

        <!-- 备注 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">📝</span>备注信息
          </div>
          <Field
            v-model="form.remark"
            name="remark"
            label="备注"
            placeholder="请输入备注（可选）"
            type="textarea"
            rows="3"
          />
        </div>

        <!-- 底部安全间距 -->
        <div style="height: 20px;"></div>
      </Form>
    </div>

    <!-- 物料大类选择器（搜索模式） -->
    <Popup v-model:show="showProductCategoryPicker" position="bottom" round :style="{ height: '70vh' }">
      <div class="search-picker-container">
        <div class="search-picker-header">
          <span class="search-picker-cancel" @click="showProductCategoryPicker = false">取消</span>
          <span class="search-picker-title">选择物料大类</span>
          <span class="search-picker-spacer"></span>
        </div>
        <div class="search-picker-search">
          <Field v-model="productCategoryKeyword" placeholder="输入编码或名称搜索" clearable left-icon="search" />
        </div>
        <div class="search-picker-list">
          <div
            v-for="item in filteredProductCategories"
            :key="item.value"
            class="search-picker-item"
            :class="{ active: form.product_category_id === item.value }"
            @click="onProductCategorySelect(item)"
          >
            <span class="search-picker-item-text">{{ item.text }}</span>
            <van-icon v-if="form.product_category_id === item.value" name="success" class="search-picker-item-check" />
          </div>
          <div v-if="filteredProductCategories.length === 0" class="search-picker-empty">
            无匹配项
          </div>
        </div>
      </div>
    </Popup>

    <!-- 物料类型选择器 -->
    <Popup v-model:show="showCategoryPicker" position="bottom" round>
      <Picker :columns="categoryColumns" @confirm="onCategoryConfirm" @cancel="showCategoryPicker = false" title="选择物料类型" />
    </Popup>

    <!-- 单位选择器 -->
    <Popup v-model:show="showUnitPicker" position="bottom" round>
      <Picker :columns="unitColumns" @confirm="onUnitConfirm" @cancel="showUnitPicker = false" title="选择单位" />
    </Popup>

    <!-- 检验方式选择器 -->
    <Popup v-model:show="showInspectionMethodPicker" position="bottom" round>
      <Picker :columns="inspectionMethodColumns" @confirm="onInspectionMethodConfirm" @cancel="showInspectionMethodPicker = false" title="选择检验方式" />
    </Popup>

    <!-- 物料来源选择器 -->
    <Popup v-model:show="showMaterialSourcePicker" position="bottom" round>
      <Picker :columns="materialSourceColumns" @confirm="onMaterialSourceConfirm" @cancel="showMaterialSourcePicker = false" title="选择物料来源" />
    </Popup>

    <!-- 供应商选择器 -->
    <Popup v-model:show="showSupplierPicker" position="bottom" round>
      <div class="supplier-search-header">
        <Field v-model="supplierSearchKeyword" placeholder="搜索供应商名称或编码" @update:model-value="searchSuppliers" clearable />
      </div>
      <Picker :columns="supplierColumns" @confirm="onSupplierConfirm" @cancel="showSupplierPicker = false" title="选择供应商" />
    </Popup>

    <!-- 生产组选择器 -->
    <Popup v-model:show="showProductionGroupPicker" position="bottom" round>
      <Picker :columns="productionGroupColumns" @confirm="onProductionGroupConfirm" @cancel="showProductionGroupPicker = false" title="选择生产组" />
    </Popup>

    <!-- 仓库选择器 -->
    <Popup v-model:show="showLocationPicker" position="bottom" round>
      <Picker :columns="locationColumns" @confirm="onLocationConfirm" @cancel="showLocationPicker = false" title="选择仓库" />
    </Popup>

    <!-- 物料负责人选择器 -->
    <Popup v-model:show="showManagerPicker" position="bottom" round>
      <Picker :columns="managerColumns" @confirm="onManagerConfirm" @cancel="showManagerPicker = false" title="选择负责人" />
    </Popup>

    <!-- 税率选择器 -->
    <Popup v-model:show="showTaxRatePicker" position="bottom" round>
      <Picker :columns="taxRateColumns" @confirm="onTaxRateConfirm" @cancel="showTaxRatePicker = false" title="选择税率" />
    </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, computed, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { NavBar, Button, Form, Field, Popup, Picker, showToast, showLoadingToast, closeToast } from 'vant'
  import { baseDataApi } from '@/services/api'

  const router = useRouter()
  const route = useRoute()
  const isEdit = computed(() => !!route.params.id)
  const editId = computed(() => route.params.id)
  const formRef = ref()
  const submitting = ref(false)

  // 表单数据 - 与网页端完全对齐
  const form = reactive({
    code: '',
    name: '',
    product_category_id: null,
    category_id: null,
    inspection_method_id: null,
    material_source_id: null,
    unit_id: null,
    location_id: null,
    location_detail: '',
    manager_id: null,
    supplier_id: null,
    production_group_id: null,
    material_type: '',
    specs: '',
    drawing_no: '',
    color_code: '',
    price: '',
    cost_price: '',
    safety_stock: '',
    min_stock: '',
    max_stock: '',
    tax_rate: 0.13,
    remark: ''
  })

  // === 选择器显示状态 ===
  const showProductCategoryPicker = ref(false)
  const showCategoryPicker = ref(false)
  const showUnitPicker = ref(false)
  const showInspectionMethodPicker = ref(false)
  const showMaterialSourcePicker = ref(false)
  const showSupplierPicker = ref(false)
  const showProductionGroupPicker = ref(false)
  const showLocationPicker = ref(false)
  const showManagerPicker = ref(false)
  const showTaxRatePicker = ref(false)

  // === 选中项显示文本 ===
  const selectedProductCategoryName = ref('')
  const selectedCategoryName = ref('')
  const selectedUnitName = ref('')
  const selectedInspectionMethodName = ref('')
  const selectedMaterialSourceName = ref('')
  const selectedSupplierName = ref('')
  const selectedProductionGroupName = ref('')
  const selectedLocationName = ref('')
  const selectedManagerName = ref('')
  const selectedTaxRateName = ref('13%')

  // === 原始数据源 ===
  const productCategories = ref([])
  const categories = ref([])
  const units = ref([])
  const inspectionMethods = ref([])
  const materialSources = ref([])
  const suppliers = ref([])
  const productionGroups = ref([])
  const locations = ref([])
  const managers = ref([])

  // 供应商搜索关键字
  const supplierSearchKeyword = ref('')
  // 物料大类搜索关键字
  const productCategoryKeyword = ref('')

  // === Picker 列数据 ===
  // 将产品大类树形数据展平为一维数组（显示层级缩进）
  const flattenTree = (tree, level = 0) => {
    const result = []
    for (const item of tree) {
      const prefix = level > 0 ? '　'.repeat(level) + '└ ' : ''
      const displayName = item.code ? `${item.code} - ${item.name}` : item.name
      result.push({ text: prefix + displayName, value: item.id })
      if (item.children && item.children.length > 0) {
        result.push(...flattenTree(item.children, level + 1))
      }
    }
    return result
  }

  const productCategoryColumns = computed(() => {
    if (productCategories.value.length === 0) return []
    return flattenTree(productCategories.value)
  })

  // 物料大类搜索过滤
  const filteredProductCategories = computed(() => {
    const keyword = productCategoryKeyword.value?.trim().toLowerCase()
    if (!keyword) return productCategoryColumns.value
    return productCategoryColumns.value.filter(item =>
      item.text.toLowerCase().includes(keyword)
    )
  })

  const categoryColumns = computed(() => categories.value.map(c => ({ text: c.name, value: c.id })))
  const unitColumns = computed(() => units.value.map(u => ({ text: u.name, value: u.id })))
  const inspectionMethodColumns = computed(() => inspectionMethods.value.map(m => ({ text: m.name, value: m.id })))
  const materialSourceColumns = computed(() => materialSources.value.map(s => ({ text: s.name, value: s.id })))
  const supplierColumns = computed(() => suppliers.value.map(s => ({ text: `${s.name}${s.code ? ' (' + s.code + ')' : ''}`, value: s.id })))
  const productionGroupColumns = computed(() => productionGroups.value.map(g => ({ text: g.name, value: g.id })))
  const locationColumns = computed(() => locations.value.map(l => ({ text: l.name, value: l.id })))
  const managerColumns = computed(() => managers.value.map(m => ({ text: m.real_name || m.nickname || m.username, value: m.id })))

  const taxRateColumns = [
    { text: '0%', value: 0 },
    { text: '1%', value: 0.01 },
    { text: '3%', value: 0.03 },
    { text: '6%', value: 0.06 },
    { text: '9%', value: 0.09 },
    { text: '13%', value: 0.13 }
  ]

  // === 确认回调 ===
  // 物料大类 - 搜索列表点击选中
  const onProductCategorySelect = (item) => {
    form.product_category_id = item.value
    selectedProductCategoryName.value = item.text.replace(/^[　└ ]+/, '')
    productCategoryKeyword.value = ''
    showProductCategoryPicker.value = false
    // 选择大类后自动生成编码
    autoGenerateCode(item.value)
  }

  const onCategoryConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) { form.category_id = opt.value; selectedCategoryName.value = opt.text }
    showCategoryPicker.value = false
  }

  const onUnitConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) { form.unit_id = opt.value; selectedUnitName.value = opt.text }
    showUnitPicker.value = false
  }

  const onInspectionMethodConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) { form.inspection_method_id = opt.value; selectedInspectionMethodName.value = opt.text }
    showInspectionMethodPicker.value = false
  }

  const onMaterialSourceConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) { form.material_source_id = opt.value; selectedMaterialSourceName.value = opt.text }
    showMaterialSourcePicker.value = false
  }

  const onSupplierConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) { form.supplier_id = opt.value; selectedSupplierName.value = opt.text }
    showSupplierPicker.value = false
  }

  const onProductionGroupConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) { form.production_group_id = opt.value; selectedProductionGroupName.value = opt.text }
    showProductionGroupPicker.value = false
  }

  const onLocationConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) { form.location_id = opt.value; selectedLocationName.value = opt.text }
    showLocationPicker.value = false
  }

  const onManagerConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) { form.manager_id = opt.value; selectedManagerName.value = opt.text }
    showManagerPicker.value = false
  }

  const onTaxRateConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) { form.tax_rate = opt.value; selectedTaxRateName.value = opt.text }
    showTaxRatePicker.value = false
  }

  // === 物料编码自动生成 ===
  // 在产品大类树中递归查找节点
  const findCategoryNode = (targetId, nodes) => {
    for (const node of nodes) {
      if (node.id === targetId) return node
      if (node.children && node.children.length > 0) {
        const found = findCategoryNode(targetId, node.children)
        if (found) return found
      }
    }
    return null
  }

  const autoGenerateCode = async (categoryId) => {
    try {
      const node = findCategoryNode(categoryId, productCategories.value)
      if (!node || !node.code) {
        showToast('选中的大类无编码信息')
        return
      }
      // 调用后端获取下一个物料序号
      const res = await baseDataApi.getNextMaterialCode({ prefix: node.code })
      const data = res?.data || res
      if (data?.nextSequence) {
        form.code = node.code + data.nextSequence.toString().padStart(3, '0')
      } else {
        form.code = node.code + '001'
      }
    } catch (e) {
      console.error('自动生成编码失败:', e)
      form.code = ''
      showToast('自动生成编码失败，请稍后重试')
    }
  }

  const regenerateCode = () => {
    if (!form.product_category_id) {
      showToast('请先选择物料大类')
      return
    }
    autoGenerateCode(form.product_category_id)
  }

  // === 供应商远程搜索 ===
  const searchSuppliers = async (keyword) => {
    if (!keyword) {
      suppliers.value = []
      return
    }
    try {
      const res = await baseDataApi.getSuppliersList({ keyword, page: 1, pageSize: 20 })
      const data = res?.data || res
      suppliers.value = data?.list || data || []
    } catch (e) {
      console.error('搜索供应商失败:', e)
    }
  }

  // === 提交表单 ===
  const submitForm = async () => {
    try {
      await formRef.value?.validate()
      submitting.value = true
      showLoadingToast({ message: '保存中...', forbidClick: true })
      if (isEdit.value) {
        await baseDataApi.updateMaterial(editId.value, form)
        closeToast()
        showToast('物料更新成功')
      } else {
        await baseDataApi.createMaterial(form)
        closeToast()
        showToast('物料创建成功')
      }
      router.back()
    } catch (e) {
      closeToast()
      console.error(isEdit.value ? '更新物料失败:' : '创建物料失败:', e)
      showToast(e.response?.data?.message || (isEdit.value ? '更新物料失败' : '创建物料失败'))
    } finally {
      submitting.value = false
    }
  }

  // === 编辑模式：加载物料现有数据 ===
  const loadMaterialForEdit = async () => {
    if (!isEdit.value) return
    try {
      showLoadingToast({ message: '加载中...', forbidClick: true })
      const res = await baseDataApi.getMaterial(editId.value)
      const data = res?.data?.data || res?.data || res
      if (data) {
        // 回填表单数据
        Object.keys(form).forEach(key => {
          if (data[key] !== undefined && data[key] !== null) {
            form[key] = data[key]
          }
        })
        // 回填选择器显示文本
        if (data.category_name) selectedCategoryName.value = data.category_name
        if (data.unit_name) selectedUnitName.value = data.unit_name
        if (data.product_category_name) selectedProductCategoryName.value = data.product_category_name
        if (data.material_source_name) selectedMaterialSourceName.value = data.material_source_name
        if (data.supplier_name) selectedSupplierName.value = data.supplier_name
        if (data.inspection_method_name) selectedInspectionMethodName.value = data.inspection_method_name
        if (data.location_name) selectedLocationName.value = data.location_name
        if (data.manager_name) selectedManagerName.value = data.manager_name
        if (data.tax_rate !== undefined) selectedTaxRateName.value = `${Math.round(data.tax_rate * 100)}%`
      }
    } catch (e) {
      console.error('加载物料数据失败:', e)
      showToast('加载物料数据失败')
    } finally {
      closeToast()
    }
  }

  // === 加载基础数据 ===
  // 安全解析列表数据
  const parseList = (res) => {
    const data = res?.data || res
    return data?.list || (Array.isArray(data) ? data : [])
  }

  // 构建产品大类树形结构
  const buildTree = (flatData, parentId = 0) => {
    const tree = []
    for (const item of flatData) {
      const pid = item.parent_id || 0
      if (pid === parentId) {
        const node = { ...item, children: buildTree(flatData, item.id) }
        if (node.children.length === 0) delete node.children
        tree.push(node)
      }
    }
    return tree
  }

  onMounted(async () => {
    try {
      const [catRes, unitRes, pCatRes, sourceRes, inspRes, locRes, userRes] = await Promise.all([
        baseDataApi.getCategories(),
        baseDataApi.getUnits(),
        baseDataApi.getProductCategoryOptions().catch(() => ({ data: [] })),
        baseDataApi.getMaterialSources().catch(() => ({ data: [] })),
        baseDataApi.getInspectionMethods().catch(() => ({ data: [] })),
        baseDataApi.getLocations().catch(() => ({ data: [] })),
        baseDataApi.getUsersList().catch(() => ({ data: [] }))
      ])

      categories.value = parseList(catRes)
      units.value = parseList(unitRes)

      // 产品大类 - 构建树形结构
      const pCatList = parseList(pCatRes)
      productCategories.value = buildTree(pCatList)

      materialSources.value = parseList(sourceRes)
      inspectionMethods.value = parseList(inspRes)
      locations.value = parseList(locRes)

      // 用户列表
      const userList = parseList(userRes)
      managers.value = userList.map(u => ({
        id: u.id,
        username: u.username,
        real_name: u.real_name || u.nickname || u.username
      }))

      // 生产组暂用空数组，后端如有枚举接口再对接
      productionGroups.value = []

      // 编辑模式时加载现有数据
      if (isEdit.value) {
        await loadMaterialForEdit()
      }
    } catch (e) {
      console.error('加载基础数据失败:', e)
      showToast('部分基础数据加载失败')
    }
  })
</script>

<style lang="scss" scoped>
  .create-page {
    height: 100vh;
    background: var(--bg-primary);
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
      padding: 14px 16px;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary);
      border-bottom: 1px solid var(--glass-border);
      display: flex;
      align-items: center;
      gap: 6px;

      .section-icon {
        font-size: 1rem;
      }
    }
  }

  .supplier-search-header {
    padding: 8px 16px 0;
    background: var(--bg-secondary);

    :deep(.van-field) {
      background: var(--bg-primary);
      border-radius: 8px;
    }
  }

  /* 搜索选择器样式 */
  .search-picker-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .search-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--glass-border);
  }

  .search-picker-cancel {
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .search-picker-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .search-picker-spacer {
    width: 2rem;
  }

  .search-picker-search {
    padding: 8px 12px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--glass-border);

    :deep(.van-field) {
      background: var(--bg-primary);
      border-radius: 8px;
    }
  }

  .search-picker-list {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .search-picker-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--glass-border);
    cursor: pointer;
    transition: background 0.15s;

    &:active {
      background: rgba(0, 0, 0, 0.04);
    }

    &.active {
      color: var(--color-primary);
      background: rgba(64, 150, 255, 0.06);
    }
  }

  .search-picker-item-text {
    font-size: 0.875rem;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    .active & {
      color: var(--color-primary);
      font-weight: 600;
    }
  }

  .search-picker-item-check {
    color: var(--color-primary);
    font-size: 1.125rem;
    flex-shrink: 0;
    margin-left: 8px;
  }

  .search-picker-empty {
    padding: 40px 16px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 0.875rem;
  }
</style>
