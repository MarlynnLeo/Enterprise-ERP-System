<!--
/**
 * CreateInbound.vue
 * @description 新建入库单页面 - 支持物料搜索选择和仓库动态加载
 * @date 2026-04-14
 * @version 2.0.0
 */
-->
<template>
  <div class="create-page">
    <NavBar title="新建入库单" left-arrow @click-left="$router.go(-1)" />

    <Form @submit="onSubmit">
      <CellGroup inset title="基本信息">
        <Field
          v-model="form.inbound_type"
          is-link
          readonly
          label="入库类型"
          placeholder="请选择"
          @click="showTypePicker = true"
          :rules="[{ required: true, message: '请选择入库类型' }]"
        />
        <Popup v-model:show="showTypePicker" round position="bottom">
          <Picker
            :columns="typeOptions"
            @cancel="showTypePicker = false"
            @confirm="onTypeConfirm"
          />
        </Popup>

        <Field
          v-model="form.warehouse_name"
          is-link
          readonly
          label="目标仓库"
          placeholder="请选择仓库"
          @click="showWarehousePicker = true"
          :rules="[{ required: true, message: '请选择仓库' }]"
        />
        <Popup v-model:show="showWarehousePicker" round position="bottom">
          <Picker
            :columns="warehouseOptions"
            :loading="warehouseLoading"
            @cancel="showWarehousePicker = false"
            @confirm="onWarehouseConfirm"
          />
        </Popup>

        <Field v-model="form.source_no" label="来源单号" placeholder="选填" />

        <Field
          v-model="form.remarks"
          type="textarea"
          rows="2"
          autosize
          label="备注说明"
          placeholder="选填补充说明"
        />
      </CellGroup>

      <CellGroup inset title="入库物料">
        <div v-for="(item, index) in form.items" :key="index" class="material-item">
          <div class="item-header">
            <span>物料明细 {{ index + 1 }}</span>
            <Icon
              name="delete-o"
              color="var(--color-danger)"
              size="18"
              @click="removeItem(index)"
              v-if="form.items.length > 1"
            />
          </div>
          <Field
            v-model="item.material_name"
            is-link
            readonly
            label="选择物料"
            placeholder="点击搜索物料"
            @click="openMaterialPicker(index)"
            :rules="[{ required: true, message: '请选择物料' }]"
          />
          <Field
            v-model="item.quantity"
            label="入库数量"
            placeholder="必填"
            type="number"
            :rules="[{ required: true, message: '请输入数量' }]"
          />
        </div>
        <div class="add-btn-wrapper">
          <Button plain type="primary" size="small" icon="plus" @click="addItem" block
            >添加物料明细</Button
          >
        </div>
      </CellGroup>

      <div class="submit-wrapper">
        <Button round block type="primary" native-type="submit" :loading="submitting">
          提交入库单
        </Button>
      </div>
    </Form>

    <!-- 物料搜索弹窗 -->
    <Popup v-model:show="showMaterialPicker" round position="bottom" :style="{ height: '60%' }">
      <div class="material-search-popup">
        <div class="popup-header">
          <span class="popup-title">选择物料</span>
          <Icon name="cross" size="20" @click="showMaterialPicker = false" />
        </div>
        <Search
          v-model="materialKeyword"
          placeholder="输入物料名称或编码搜索"
          @search="searchMaterials"
          @update:model-value="onMaterialKeywordChange"
        />
        <div class="material-list" v-if="materialList.length > 0">
          <Cell
            v-for="mat in materialList"
            :key="mat.id"
            :title="mat.name || mat.material_name"
            :label="`编码: ${mat.code || mat.material_code || '--'} | 规格: ${mat.spec || mat.specification || '--'}`"
            is-link
            @click="onMaterialSelect(mat)"
          />
        </div>
        <Empty v-else-if="!materialLoading" description="输入关键字搜索物料" image="search" />
        <Loading v-if="materialLoading" class="loading-center" />
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Form,
    Field,
    CellGroup,
    Button,
    Popup,
    Picker,
    Icon,
    Search,
    Cell,
    Empty,
    Loading,
    showToast
  } from 'vant'
  import { inventoryApi } from '@/services/api'

  const router = useRouter()
  const submitting = ref(false)

  // ==================== 入库类型 ====================
  const showTypePicker = ref(false)
  const typeOptions = [
    { text: '采购入库', value: 'purchase' },
    { text: '生产入库', value: 'production' },
    { text: '退货入库', value: 'return' },
    { text: '其他入库', value: 'other' }
  ]

  // ==================== 仓库选择 ====================
  const showWarehousePicker = ref(false)
  const warehouseOptions = ref([])
  const warehouseLoading = ref(false)

  const loadWarehouses = async () => {
    warehouseLoading.value = true
    try {
      const response = await inventoryApi.getWarehouses()
      const data = response.data || response
      const items = data.items || data.list || data.rows || data || []
      const list = Array.isArray(items) ? items : []
      warehouseOptions.value = list.map((w) => ({
        text: w.name || w.warehouse_name || `仓库#${w.id}`,
        value: String(w.id)
      }))
    } catch (error) {
      console.error('加载仓库列表失败:', error)
      warehouseOptions.value = []
      showToast('仓库列表加载失败，请稍后重试')
    } finally {
      warehouseLoading.value = false
    }
  }

  // ==================== 物料搜索 ====================
  const showMaterialPicker = ref(false)
  const materialKeyword = ref('')
  const materialList = ref([])
  const materialLoading = ref(false)
  const activeMaterialIndex = ref(-1)
  let searchTimer = null

  const openMaterialPicker = (index) => {
    activeMaterialIndex.value = index
    materialKeyword.value = ''
    materialList.value = []
    showMaterialPicker.value = true
  }

  const onMaterialKeywordChange = (val) => {
    clearTimeout(searchTimer)
    if (val.length >= 1) {
      searchTimer = setTimeout(() => searchMaterials(), 400)
    }
  }

  const searchMaterials = async () => {
    if (!materialKeyword.value) return
    materialLoading.value = true
    try {
      const response = await inventoryApi.getMaterials({
        keyword: materialKeyword.value,
        page: 1,
        pageSize: 30
      })
      const data = response.data || response
      const items = data.items || data.list || data.rows || data || []
      materialList.value = Array.isArray(items) ? items : []
    } catch (error) {
      console.error('搜索物料失败:', error)
      materialList.value = []
    } finally {
      materialLoading.value = false
    }
  }

  const onMaterialSelect = (mat) => {
    if (activeMaterialIndex.value >= 0) {
      form.items[activeMaterialIndex.value].material_id = mat.id
      form.items[activeMaterialIndex.value].material_name =
        mat.name || mat.material_name || `物料#${mat.id}`
    }
    showMaterialPicker.value = false
  }

  // ==================== 表单 ====================
  const form = reactive({
    inbound_type: '采购入库',
    inbound_type_value: 'purchase',
    warehouse_id: null,
    warehouse_name: '',
    source_no: '',
    remarks: '',
    items: [{ material_id: '', material_name: '', quantity: '' }]
  })

  const onTypeConfirm = ({ selectedOptions }) => {
    form.inbound_type = selectedOptions[0].text
    form.inbound_type_value = selectedOptions[0].value
    showTypePicker.value = false
  }

  const onWarehouseConfirm = ({ selectedOptions }) => {
    const warehouseId = Number.parseInt(selectedOptions[0]?.value, 10)
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      showToast('请选择有效仓库')
      return
    }
    form.warehouse_name = selectedOptions[0].text
    form.warehouse_id = warehouseId
    showWarehousePicker.value = false
  }

  const addItem = () => {
    form.items.push({ material_id: '', material_name: '', quantity: '' })
  }

  const removeItem = (index) => {
    form.items.splice(index, 1)
  }

  const onSubmit = async () => {
    if (form.items.some((item) => !item.material_id || !item.quantity)) {
      showToast('物料明细填写不完整')
      return
    }

    if (!form.warehouse_id) {
      showToast('请选择仓库')
      return
    }

    submitting.value = true
    try {
      const payload = {
        inbound_type: form.inbound_type_value,
        warehouse_id: form.warehouse_id,
        source_no: form.source_no,
        remarks: form.remarks,
        items: form.items.map((i) => ({
          material_id: parseInt(i.material_id),
          quantity: parseFloat(i.quantity)
        }))
      }

      await inventoryApi.createInbound(payload)
      showToast('新建入库单成功')
      setTimeout(() => {
        router.back()
      }, 1000)
    } catch (error) {
      showToast('提交失败: ' + (error.message || '系统错误'))
    } finally {
      submitting.value = false
    }
  }

  onMounted(() => {
    loadWarehouses()
  })
</script>

<style lang="scss" scoped>
  .create-page {
    min-height: 100vh;
    background-color: var(--van-background-2);
    padding-bottom: 30px;
  }
  .material-item {
    background: var(--van-background);
    margin-bottom: 8px;
    border-bottom: 1px dashed var(--van-border-color);
    padding-bottom: 8px;
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
  .material-search-popup {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    font-size: 1rem;
    font-weight: 600;
    border-bottom: 1px solid var(--van-border-color);
  }
  .popup-title {
    font-weight: 600;
  }
  .material-list {
    flex: 1;
    overflow-y: auto;
  }
  .loading-center {
    display: flex;
    justify-content: center;
    padding: 24px;
  }
</style>
