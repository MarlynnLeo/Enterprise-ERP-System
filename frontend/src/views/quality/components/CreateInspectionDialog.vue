<!--
/**
 * CreateInspectionDialog.vue
 * @description 新建来料检验单弹窗组件
 * @date 2026-04-03
 * @version 1.0.0
 *
 * 职责：
 * - 采购单选择与物料联动
 * - 批次号随源单录入并校验
 * - 表单校验与创建提交
 */
-->
<template>
  <AppDialog
    v-model="dialogVisible"
    title="新建来料检验单"
    mode="form"
    width="650px"
    @close="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="采购单号" prop="purchaseOrderNo">
        <el-select
          v-model="form.purchaseOrderNo"
          placeholder="选择采购单号"
          filterable
          @change="handlePurchaseOrderChange"
          :loading="loading"
          @focus="fetchPurchaseOrders"
        >
          <el-option
            v-for="order in purchaseOrderOptions"
            :key="order.id"
            :label="order.orderNo"
            :value="order.orderNo"
          >
            <span>{{ order.orderNo }} - {{ order.supplierName }}</span>
          </el-option>
          <template #empty>
            <div v-if="loading">加载中...</div>
            <div v-else>暂无数据</div>
          </template>
        </el-select>
      </el-form-item>

      <el-form-item label="供应商" prop="supplierName">
        <el-input v-model="form.supplierName" disabled />
      </el-form-item>

      <el-form-item label="物料" prop="materialId">
        <el-select
          v-model="form.materialId"
          placeholder="选择物料"
          filterable
          @change="handleMaterialChange"
        >
          <el-option
            v-for="material in materialOptions"
            :key="material.id"
            :label="material.name"
            :value="material.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="物料型号" prop="specs">
        <el-input v-model="form.specs" placeholder="物料型号" disabled />
      </el-form-item>

      <el-form-item label="批次号" prop="batchNo">
        <el-input v-model="form.batchNo" placeholder="请输入批次号" />
      </el-form-item>

      <el-form-item label="检验数量" prop="quantity">
        <el-input-number v-model="form.quantity" :min="1" />
        <span class="unit-text">{{ form.unit }}</span>
      </el-form-item>

      <el-form-item label="到货日期" prop="arrivalDate">
        <el-date-picker
          v-model="form.arrivalDate"
          type="date"
          placeholder="选择到货日期"
        />
      </el-form-item>

      <el-form-item label="备注" prop="note">
        <el-input
          v-model="form.note"
          type="textarea"
          placeholder="请输入备注信息"
          :rows="3"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:inspections:create'" type="primary" @click="submitForm" :loading="submitting">确认</el-button>
      </span>
    </template>
    </AppDialog>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { qualityApi, purchaseApi, baseDataApi } from '@/api'
import { parseListData } from '@/utils/responseParser'
import { generateBatchNumber as generateBatchNumberHelper } from '@/utils/inspectionHelpers'
import dayjs from 'dayjs'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible', 'success'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const formRef = ref(null)
const loading = ref(false)
const submitting = ref(false)

// 采购单选项和物料选项
const purchaseOrderOptions = ref([])
const materialOptions = ref([])

// 表单数据
const form = reactive({
  purchaseOrderNo: '',
  purchaseOrderId: '',
  supplierName: '',
  supplierId: '',
  supplierCode: '',
  materialId: '',
  materialName: '',
  materialCode: '',
  specs: '',
  batchNo: '',
  quantity: 1,
  unit: '',
  arrivalDate: new Date(),
  note: ''
})

// 表单验证规则
const rules = {
  purchaseOrderNo: [{ required: true, message: '请选择采购单号', trigger: 'change' }],
  materialId: [{ required: true, message: '请选择物料', trigger: 'change' }],
  materialName: [{ required: true, message: '物料名称不能为空', trigger: 'change' }],
  batchNo: [{ required: true, message: '请输入批次号', trigger: 'blur' }],
  quantity: [{ required: true, message: '请输入检验数量', trigger: 'blur' }],
  arrivalDate: [{ required: true, message: '请选择到货日期', trigger: 'change' }]
}

// 批次号生成
const generateBatchNumber = async (supplierCode = '', supplierId = null) => {
  if (!supplierCode) {
    throw new Error('供应商编码不能为空，请先维护供应商编码或手工录入批次号')
  }
  return generateBatchNumberHelper(supplierCode, supplierId, qualityApi)
}

// 获取采购单列表
const fetchPurchaseOrders = async () => {
  try {
    const response = await purchaseApi.getOrders({ pageSize: 50 })
    const orders = parseListData(response, { enableLog: false })

    if (orders.length > 0) {
      const validStatuses = ['confirmed', 'approved', 'received', 'partial_received', 'inspecting', 'inspected', 'warehousing']
      purchaseOrderOptions.value = orders
        .filter(item => validStatuses.includes(item.status))
        .map(item => ({
          id: item.id,
          orderNo: item.orderNo || '',
          supplierName: item.supplier?.name || item.supplierName || '-',
          supplierId: item.supplierId || item.supplier?.id,
          supplierCode: item.supplier?.code || item.supplierCode || '',
          status: item.status
        }))
    } else {
      purchaseOrderOptions.value = []
    }
  } catch (error) {
    ElMessage.error(`获取采购单失败: ${error.message}`)
    purchaseOrderOptions.value = []
  }
}

// 处理采购单号选择变更
const handlePurchaseOrderChange = async (value) => {
  const selectedOrder = purchaseOrderOptions.value.find(item => item.orderNo === value)

  if (selectedOrder) {
    form.supplierName = selectedOrder.supplierName || ''
    form.supplierId = selectedOrder.supplierId || ''
    form.supplierCode = selectedOrder.supplierCode || ''
    form.purchaseOrderId = selectedOrder.id || ''

    // 如果缺少供应商编码，尝试API获取
    if (!form.supplierCode && form.supplierId) {
      try {
        const supplierResponse = await baseDataApi.getSupplier(form.supplierId)
        if (supplierResponse.data) {
          const supplier = supplierResponse.data
          form.supplierCode = supplier.supplierCode || ''
        }
      } catch (error) {
        console.warn('获取供应商编码失败:', error)
      }
    }

    // 生成批次号
    if (form.supplierCode) {
      try {
        form.batchNo = await generateBatchNumber(form.supplierCode, form.supplierId)
      } catch (error) {
        ElMessage.error(error.message)
      }
    } else {
      ElMessage.warning('供应商编码缺失，请维护供应商编码或手工录入批次号')
    }

    // 获取该采购单的物料列表
    fetchOrderMaterials(value)
  } else {
    ElMessage.warning({
      message: `采购单 ${value} 不存在或状态不符合要求。请从下拉列表中选择有效的采购单。`,
      duration: 5000
    })
    form.supplierName = ''
    form.supplierId = ''
    form.purchaseOrderId = ''
    materialOptions.value = []
    form.purchaseOrderNo = ''
  }
}

// 获取采购单物料
const fetchOrderMaterials = async (orderNo) => {
  if (!orderNo) return

  try {
    const response = await purchaseApi.getOrder(orderNo)

    if (response.data?.items) {
      materialOptions.value = response.data.items.map(item => ({
        id: item.materialId,
        name: item.materialName || `${item.materialCode} (无名称)`,
        code: item.materialCode,
        specs: item.specs || item.specification || item.materialSpecs || '',
        unit: item.unitName || item.unit,
        quantity: item.quantity,
        purchaseQuantity: item.purchaseQuantity || item.quantity
      }))
    } else {
      materialOptions.value = []
    }
  } catch (error) {
    console.error('获取采购单物料失败:', error)
    ElMessage.error(`获取物料列表失败: ${error.message}`)
    materialOptions.value = []
  }
}

// 处理物料选择变更
const handleMaterialChange = async (value) => {
  const selectedMaterial = materialOptions.value.find(item => item.id === value)

  if (selectedMaterial) {
    form.materialName = selectedMaterial.name
    form.materialCode = selectedMaterial.code
    form.specs = selectedMaterial.specs || ''
    form.unit = selectedMaterial.unit
    form.quantity = Number(selectedMaterial.purchaseQuantity) || 1

    // 如果缺少 specs，尝试从物料主数据获取
    if (!form.specs && value) {
      try {
        const materialResponse = await baseDataApi.getMaterial(value)
        if (materialResponse?.data?.specs) {
          form.specs = materialResponse.data.specs
        }
      } catch (error) {
        console.error('获取物料规格失败:', error)
      }
    }

    // 如果还没有批次号，按供应商编码生成
    if (!form.batchNo && form.supplierCode) {
      try {
        form.batchNo = await generateBatchNumber(form.supplierCode, form.supplierId)
      } catch (error) {
        ElMessage.error(error.message)
      }
    }
  } else {
    form.materialName = ''
    form.materialCode = ''
    form.specs = ''
    form.unit = ''
  }
}

// 表单提交
const submitForm = async () => {
  if (!formRef.value) return
  if (submitting.value) return
  submitting.value = true

  try {
    await formRef.value.validate()

    // 验证采购单ID是否存在
    if (form.purchaseOrderNo && !form.purchaseOrderId) {
      ElMessage.error({
        message: '采购单信息不完整,请重新从下拉列表中选择采购单',
        duration: 5000
      })
      submitting.value = false
      return
    }

    const formData = {
      inspection_type: 'incoming',
      reference_no: form.purchaseOrderNo,
      reference_id: form.purchaseOrderId || null,
      material_id: form.materialId,
      product_id: form.materialId,
      product_name: form.materialName,
      product_code: form.specs,
      batch_no: form.batchNo,
      quantity: Number(form.quantity),
      unit: form.unit,
      planned_date: dayjs(form.arrivalDate).format('YYYY-MM-DD'),
      note: form.note,
      supplier_id: form.supplierId,
      supplier_name: form.supplierName,
      status: 'pending'
    }

    const response = await qualityApi.createIncomingInspection(formData)

    const respData = response?.data
    const isSuccess = respData?.success === true ||
                      respData?.id ||
                      (respData?.data?.id) ||
                      (respData && !respData.error && !respData.message?.includes('失败'))

    if (isSuccess) {
      ElMessage.success('检验单创建成功')
      dialogVisible.value = false
      emit('success')
    } else {
      ElMessage.error(respData?.message || '检验单创建失败')
    }
  } catch (error) {
    console.error('检验单创建失败:', error)
    ElMessage.error(`检验单创建失败: ${error.message}`)
  } finally {
    submitting.value = false
  }
}

// 关闭弹窗时重置表单
const handleClose = () => {
  formRef.value?.resetFields()
  Object.assign(form, {
    purchaseOrderNo: '', purchaseOrderId: '', supplierName: '', supplierId: '',
    supplierCode: '', materialId: '', materialName: '', materialCode: '',
    specs: '', batchNo: '', quantity: 1, unit: '', arrivalDate: new Date(), note: ''
  })
}
</script>

<style scoped>
.unit-text {
  margin-left: 8px;
}
</style>
