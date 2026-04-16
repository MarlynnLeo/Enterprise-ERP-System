<!--
/**
 * CreatePlan.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="create-plan-page">
    <NavBar title="新建生产计划" left-arrow @click-left="onClickLeft">
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
            v-model="planForm.code"
            name="code"
            label="计划编号"
            placeholder="系统自动生成"
            readonly
            right-icon="refresh"
            @click-right-icon="generatePlanCode"
          />

          <Field
            v-model="planForm.name"
            name="name"
            label="计划名称"
            placeholder="请输入计划名称"
            :rules="[{ required: true, message: '请输入计划名称' }]"
          />

          <Field
            v-model="planForm.start_date"
            name="start_date"
            label="开始日期"
            placeholder="请选择开始日期"
            type="date"
            :rules="[{ required: true, message: '请选择开始日期' }]"
          />

          <Field
            v-model="planForm.end_date"
            name="end_date"
            label="结束日期"
            placeholder="请选择结束日期"
            type="date"
            :rules="[{ required: true, message: '请选择结束日期' }]"
          />
        </div>

        <!-- 产品信息 -->
        <div class="form-section">
          <div class="section-title">产品信息</div>

          <Field
            v-model="selectedProductName"
            name="product"
            label="选择产品"
            placeholder="请选择产品"
            readonly
            is-link
            @click="showProductPicker = true"
            :rules="[{ required: true, message: '请选择产品' }]"
          />

          <Field
            v-model="planForm.quantity"
            name="quantity"
            label="计划数量"
            placeholder="请输入计划数量"
            type="number"
            :rules="[
              { required: true, message: '请输入计划数量' },
              { pattern: /^[1-9]\d*$/, message: '请输入有效的数量' }
            ]"
          />

          <Field
            v-if="selectedProduct"
            v-model="selectedProduct.unit"
            name="unit"
            label="单位"
            readonly
          />
        </div>

        <!-- 物料需求预览 -->
        <div class="form-section" v-if="materialRequirements.length > 0 || selectedProduct">
          <div class="section-title">
            物料需求预览
            <Button
              type="primary"
              size="mini"
              @click="calculateMaterials"
              :loading="calculating"
              v-if="selectedProduct && planForm.quantity"
            >
              {{ materialRequirements.length > 0 ? '重新计算' : '计算物料需求' }}
            </Button>
          </div>

          <div class="materials-preview">
            <div v-if="materialRequirements.length > 0">
              <div
                v-for="material in materialRequirements"
                :key="material.id"
                class="material-item"
              >
                <div class="material-info">
                  <span class="material-name">{{ material.name }}</span>
                  <span class="material-code">{{ material.code }}</span>
                </div>
                <div class="material-quantity">
                  需求: {{ material.required_quantity }} {{ material.unit }}
                </div>
              </div>
            </div>
            <div v-else-if="selectedProduct && planForm.quantity" class="no-materials-tip">
              <p>该产品暂未配置BOM，无法自动计算物料需求</p>
              <p>您可以点击上方"计算物料需求"按钮重试，或直接保存计划</p>
            </div>
            <div v-else class="no-materials-tip">
              <p>请先选择产品并输入数量，然后点击"计算物料需求"</p>
            </div>
          </div>
        </div>

        <!-- 备注信息 -->
        <div class="form-section">
          <div class="section-title">备注信息</div>

          <Field
            v-model="planForm.remark"
            name="remark"
            label="备注"
            placeholder="请输入备注信息（可选）"
            type="textarea"
            rows="3"
          />
        </div>
      </Form>
    </div>

    <!-- 产品选择弹窗 -->
    <Popup v-model:show="showProductPicker" position="bottom" :style="{ height: '70%' }">
      <div class="product-picker">
        <div class="picker-header">
          <span @click="showProductPicker = false">取消</span>
          <span class="picker-title">选择产品</span>
          <span @click="confirmProduct">确定</span>
        </div>

        <div class="picker-search">
          <Search
            v-model="productSearchValue"
            placeholder="搜索产品名称或编码"
            @search="searchProducts"
          />
        </div>

        <div class="picker-content">
          <div
            v-for="product in productList"
            :key="product.id"
            class="product-item"
            :class="{ active: tempSelectedProduct?.id === product.id }"
            @click="selectProduct(product)"
          >
            <div class="product-info">
              <div class="product-name">{{ product.name }}</div>
              <div class="product-code">{{ product.code }}</div>
              <div class="product-spec" v-if="product.specs">{{ product.specs }}</div>
            </div>
            <div class="product-unit">{{ product.unit }}</div>
          </div>

          <div v-if="productList.length === 0" class="empty-state">
            <Empty description="暂无产品数据" />
          </div>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, computed, watch, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
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
    closeToast
  } from 'vant'
  import { productionApi, baseDataApi } from '@/services/api'

  const router = useRouter()
  const formRef = ref()

  // 表单数据
  const planForm = reactive({
    code: '',
    name: '',
    start_date: '',
    end_date: '',
    productId: '',
    quantity: '',
    remark: ''
  })

  // 状态管理
  const submitting = ref(false)
  const calculating = ref(false)
  const showProductPicker = ref(false)

  // 产品相关
  const productList = ref([])
  const productSearchValue = ref('')
  const selectedProduct = ref(null)
  const tempSelectedProduct = ref(null)
  const materialRequirements = ref([])

  // 计算属性
  const selectedProductName = computed(() => {
    return selectedProduct.value
      ? `${selectedProduct.value.name} (${selectedProduct.value.code})`
      : ''
  })

  // 生成计划编号
  const generatePlanCode = async () => {
    try {
      const response = await productionApi.getTodayMaxSequence()
      const today = new Date()
      const dateStr = `${today.getFullYear().toString().slice(-2)}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`
      planForm.code = `SC${dateStr}${response.data.sequence}`
    } catch (error) {
      console.error('生成计划编号失败:', error)
      showToast('生成计划编号失败')
    }
  }

  // 获取产品列表
  const fetchProducts = async () => {
    try {
      // 获取所有产品，设置较大的分页大小
      const response = await baseDataApi.getMaterials({
        page: 1,
        pageSize: 1000 // 获取更多数据
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

      // 为每个产品添加单位信息
      productList.value = materials.map((material) => ({
        ...material,
        unit: material.unit || '件'
      }))
    } catch (error) {
      console.error('获取产品列表失败:', error)
      showToast('获取产品列表失败')
    }
  }

  // 搜索产品
  const searchProducts = async () => {
    try {
      const params = {
        page: 1,
        pageSize: 1000
      }

      // 如果有搜索关键词，搜索名称、编码和规格
      if (productSearchValue.value) {
        const keyword = productSearchValue.value.trim()
        params.name = keyword
        params.code = keyword
        params.specs = keyword
      }

      const response = await baseDataApi.getMaterials(params)
      const materials = response.data?.items || response.data || []

      // 为每个产品添加单位信息
      productList.value = materials.map((material) => ({
        ...material,
        unit: material.unit || '件'
      }))
    } catch (error) {
      console.error('搜索产品失败:', error)
      showToast('搜索产品失败')
    }
  }

  // 选择产品
  const selectProduct = (product) => {
    tempSelectedProduct.value = product
  }

  // 确认选择产品
  const confirmProduct = () => {
    if (tempSelectedProduct.value) {
      selectedProduct.value = tempSelectedProduct.value
      planForm.productId = tempSelectedProduct.value.id
      showProductPicker.value = false

      // 如果已经输入了数量，自动计算物料需求
      if (planForm.quantity) {
        calculateMaterials()
      }
    }
  }

  // 计算物料需求
  const calculateMaterials = async () => {
    if (!planForm.productId || !planForm.quantity) {
      showToast('请先选择产品和输入数量')
      return
    }

    try {
      calculating.value = true

      // 先获取产品的BOM信息
      const bomResponse = await productionApi.getProductBom(planForm.productId)
      // 处理不同的响应格式
      let bomData = null
      if (bomResponse.data?.success && bomResponse.data?.data) {
        // 格式: { success: true, data: {...} }
        bomData = bomResponse.data.data
      } else if (bomResponse.data?.data) {
        // 格式: { data: {...} }
        bomData = bomResponse.data.data
      } else if (bomResponse.data?.id) {
        // 直接是BOM数据
        bomData = bomResponse.data
      }

      // 开发环境下显示调试信息
      if (import.meta.env.DEV) {
      }

      if (!bomData || !bomData.id) {
        showToast('该产品没有配置BOM，无法计算物料需求')
        materialRequirements.value = []
        return
      }

      // 使用BOM ID计算物料需求
      const response = await productionApi.calculateMaterials({
        productId: planForm.productId,
        bomId: bomData.id,
        quantity: planForm.quantity
      })

      materialRequirements.value = response.data || []
    } catch (error) {
      console.error('计算物料需求失败:', error)
      console.error('错误详情:', error.response?.data)

      if (error.response?.status === 404) {
        const errorMsg = error.response?.data?.message || '该产品没有配置BOM，无法计算物料需求'
        showToast(errorMsg)
      } else {
        const errorMsg = error.response?.data?.message || '计算物料需求失败'
        showToast(errorMsg)
      }
      materialRequirements.value = []
    } finally {
      calculating.value = false
    }
  }

  // 提交表单
  const submitForm = async () => {
    try {
      await formRef.value?.validate()

      if (!planForm.productId) {
        showToast('请选择产品')
        return
      }

      // 验证日期
      if (planForm.start_date && planForm.end_date) {
        if (new Date(planForm.end_date) < new Date(planForm.start_date)) {
          showToast('结束日期不能早于开始日期')
          return
        }
      }

      submitting.value = true
      showLoadingToast({ message: '保存中...', forbidClick: true })

      const formData = {
        code: planForm.code,
        name: planForm.name,
        start_date: planForm.start_date,
        end_date: planForm.end_date,
        productId: planForm.productId,
        quantity: parseInt(planForm.quantity),
        remark: planForm.remark
      }

      await productionApi.createProductionPlan(formData)

      closeToast()
      showToast('生产计划创建成功')

      // 返回列表页面
      router.back()
    } catch (error) {
      closeToast()
      console.error('创建生产计划失败:', error)
      showToast(error.response?.data?.message || '创建生产计划失败')
    } finally {
      submitting.value = false
    }
  }

  // 返回上一页
  const onClickLeft = () => {
    router.back()
  }

  // 监听数量变化，自动计算物料需求
  watch(
    () => planForm.quantity,
    (newQuantity) => {
      if (newQuantity && planForm.productId && parseInt(newQuantity) > 0) {
        calculateMaterials()
      }
    }
  )

  onMounted(() => {
    generatePlanCode()
    fetchProducts()
  })
</script>

<style lang="scss" scoped>
  .create-plan-page {
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

  .materials-preview {
    padding: 16px;
  }

  .material-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: var(--bg-secondary);
    border-radius: 6px;
    margin-bottom: 8px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .material-info {
    flex: 1;

    .material-name {
      display: block;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .material-code {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
  }

  .material-quantity {
    font-size: 0.875rem;
    color: var(--van-primary-color);
    font-weight: 500;
  }

  .no-materials-tip {
    text-align: center;
    padding: 20px;
    color: var(--text-secondary);
    font-size: 0.875rem;

    p {
      margin: 8px 0;
      line-height: 1.5;
    }
  }

  .product-picker {
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

  .product-item {
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

  .product-info {
    flex: 1;

    .product-name {
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .product-code {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-bottom: 2px;
    }

    .product-spec {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
  }

  .product-unit {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .empty-state {
    text-align: center;
    padding: 40px 0;
  }
</style>
