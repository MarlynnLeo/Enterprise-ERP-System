<template>
  <div class="unified-traceability module-page">
    <PageHeader title="批次追溯查询" subtitle="统一追溯查询：输入物料编码和批次号，自动识别物料类型并展示完整追溯链路" />

    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="handleSearch"
      @reset="resetSearch"
    >
      <template #basic>
          <el-form-item label="物料名称">
            <el-input
              v-model="searchForm.materialCode"
              placeholder="物料名称/编码"
              clearable
              @keyup.enter="handleSearch"
            />
          </el-form-item>
      </template>
      <template #advanced>
          <el-form-item label="批次号">
            <el-input
              v-model="searchForm.batchNumber"
              placeholder="请输入批次号"
              clearable
              @keyup.enter="handleSearch"
            />
          </el-form-item>
      </template>
      <template #actions>
            <el-button type="success" @click="exportReport" :disabled="!hasData">
              <el-icon><Download /></el-icon> 导出报告
            </el-button>
      </template>
    </FinanceQueryCard>

        <!-- 最近批次 -->
        <div class="test-cases mt-10">
          <div class="flex-row mb-sm">
            <span class="text-regular text-sm">最近批次: </span>
            <el-button
              size="small"
              type="success"
              plain
              @click="loadLatestBatches"
              class="ml-sm"
            >
              <el-icon><Refresh /></el-icon> 获取最新批次
            </el-button>
          </div>
          <el-button
            v-for="batch in latestBatches"
            :key="batch.id"
            size="small"
            type="primary"
            plain
            class="chip-gap"
            @click="loadLatestBatch(batch)"
          >
            {{ batch.label }}
          </el-button>
        </div>

    <!-- 追溯结果展示 -->
    <div v-if="traceabilityData" class="traceability-results">
      <!-- 原材料关联BOM清单 (位于基本信息卡片上方) -->
      <el-card v-if="traceabilityData.bom_components && traceabilityData.bom_components.length > 0" class="stack-card-pair">
        <template #header>
          <span>组成 BOM 清单</span>
        </template>
        <el-table :data="traceabilityData.bom_components" border stripe>
          <el-table-column prop="rawMaterialCode" label="物料编码" min-width="120" />
          <el-table-column prop="rawMaterialName" label="物料名称" min-width="150" />
          <el-table-column prop="specification" label="规格型号" min-width="120" />
          <el-table-column prop="consumedQuantity" label="单套用量" width="100" />
          <el-table-column prop="unit" label="单位" width="80" />
          <el-table-column prop="supplierName" label="供应商" min-width="120">
            <template #default="{ row }">
              <span v-if="row.supplierName">{{ row.supplierName }}</span>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="purchaseDate" label="采购时间" min-width="150">
            <template #default="{ row }">
              <span v-if="row.purchaseDate">{{ formatDateTime(row.purchaseDate) }}</span>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="rawMaterialBatch" label="流转记录/消耗说明" min-width="180">
            <template #default="{ row }">
              <el-tag
                v-if="row.rawMaterialBatch && row.rawMaterialBatch !== '-'"
                type="primary"
                class="cursor-pointer"
                @click="navigateToTrace(row.rawMaterialCode, row.rawMaterialBatch)"
              >{{ row.rawMaterialBatch }}</el-tag>
              <span v-else class="text-muted">标准材料</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 批次基本信息 -->
      <el-card class="batch-info-card stack-card">
        <template #header>
          <div class="flex-between">
            <span>{{ traceabilityData.type === 'material' ? '原材料' : '成品' }}批次基本信息</span>
            <el-tag :type="traceabilityData.type === 'material' ? 'info' : 'success'">
              {{ traceabilityData.type === 'material' ? '原材料批次' : '成品批次' }}
            </el-tag>
          </div>
        </template>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="物料编码">
            {{ traceabilityData.batch_info.materialCode || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="物料名称">
            {{ traceabilityData.batch_info.materialName || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="批次号">
            <el-tag type="primary">
              {{ traceabilityData.batch_info.batchNumber || '-' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="规格型号">
            {{ traceabilityData.batch_info.specification || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="原始数量">
            {{ traceabilityData.batch_info.original_quantity || 0 }} {{ traceabilityData.batch_info.unit || '' }}
          </el-descriptions-item>
          <el-descriptions-item label="当前数量">
            <span :class="getQuantityClass(traceabilityData.batch_info.current_quantity)">
              {{ traceabilityData.batch_info.current_quantity || 0 }} {{ traceabilityData.batch_info.unit || '' }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item v-if="traceabilityData.batch_info.supplierName" label="供应商">
            {{ traceabilityData.batch_info.supplierName }}
          </el-descriptions-item>
          <el-descriptions-item label="入库时间">
            {{ formatDateTime(traceabilityData.batch_info.receipt_date || traceabilityData.batch_info.production_date) }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(traceabilityData.batch_info.status)">
              {{ getStatusText(traceabilityData.batch_info.status) }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 追溯链路步骤 -->
      <el-card v-if="traceabilityData.steps && traceabilityData.steps.length > 0" class="stack-card">
        <template #header>
          <span>追溯链路步骤</span>
        </template>
        <el-timeline>
          <el-timeline-item
            v-for="step in traceabilityData.steps"
            :key="step.id"
            :type="getStepStatusType(step.status)"
            :timestamp="formatDateTime(step.startTime)"
            placement="top"
          >
            <el-card shadow="hover">
              <div class="flex-between">
                <span class="font-weight-700">{{ step.step_name }}</span>
                <el-tag :type="getStepStatusType(step.status)" size="small">
                  {{ getStepStatusText(step.status) }}
                </el-tag>
              </div>
              <div v-if="step.referenceNo" class="meta-line">
                单据号: {{ step.referenceNo }}
              </div>
              <div v-if="step.quantity" class="meta-line-sm">
                数量: {{ step.quantity }} {{ step.unit || '' }}
              </div>
              <div v-if="step.operator" class="meta-line-sm">
                操作人: {{ step.operator }}
              </div>
              <div v-if="step.location" class="meta-line-sm">
                位置: {{ step.location }}
              </div>
              <div v-if="step.remarks" class="meta-line-muted">
                备注: {{ step.remarks }}
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </el-card>

      <!-- 原材料消耗信息(支持全链路展示) -->
      <el-card v-if="traceabilityData.raw_materials && traceabilityData.raw_materials.length > 0" class="stack-card">
        <template #header>
          <span>原材料消耗信息</span>
        </template>
        <el-table :data="traceabilityData.raw_materials" border stripe>
          <el-table-column prop="rawMaterialCode" label="原材料编码" min-width="120" />
          <el-table-column prop="rawMaterialName" label="原材料名称" min-width="150" />
          <el-table-column prop="rawMaterialBatch" label="批次号" min-width="150">
            <template #default="{ row }">
              <el-tag
                v-if="row.rawMaterialBatch && row.rawMaterialBatch !== '-'"
                type="primary"
                class="cursor-pointer"
                @click="navigateToTrace(row.rawMaterialCode, row.rawMaterialBatch)"
              >
                {{ row.rawMaterialBatch }}
              </el-tag>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="supplierName" label="供应商" min-width="120" />
          <el-table-column prop="consumedQuantity" label="消耗数量" width="100" />
          <el-table-column prop="specification" label="规格" min-width="120" />
          <el-table-column prop="receiptDate" label="入库时间" width="160" :formatter="(row) => formatDateTime(row.receiptDate)" />
        </el-table>
      </el-card>

      <!-- 销售记录(支持全链路展示) -->
      <el-card v-if="traceabilityData.sales_records && traceabilityData.sales_records.length > 0" class="stack-card">
        <template #header>
          <span>销售去向记录</span>
        </template>
        <el-table :data="traceabilityData.sales_records" border stripe>
          <el-table-column prop="outboundNo" label="出库单号" min-width="150" />
          <el-table-column v-if="traceabilityData.type !== 'product'" label="制成成品" min-width="150">
            <template #default="{ row }">
              <div>
                {{ row.productName }}<span v-if="row.productSpecification" class="text-muted text-sm ml-4">({{ row.productSpecification }})</span>
              </div>
              <el-tag v-if="row.productBatch" size="small" type="info" class="mt-4">
                批次 {{ row.productBatch }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="customerName" label="客户名称" min-width="150" />
          <el-table-column prop="allocatedQuantity" label="消耗/销售量" width="100" />
          <el-table-column prop="deliveryDate" label="交货时间" width="160" :formatter="(row) => formatDateTime(row.deliveryDate)" />
        </el-table>
      </el-card>

      <!-- 追溯汇总 -->
      <el-card v-if="traceabilityData.summary" class="stack-card">
        <template #header>
          <span>追溯汇总</span>
        </template>
        <el-row :gutter="20">
          <el-col :span="6" v-if="traceabilityData.summary.raw_material_batches !== undefined">
            <el-statistic title="原材料批次数" :value="traceabilityData.summary.raw_material_batches" />
          </el-col>
          <el-col :span="6" v-if="traceabilityData.summary.total_sales !== undefined">
            <el-statistic title="总销售数量" :value="traceabilityData.summary.total_sales" />
          </el-col>
          <el-col :span="6" v-if="traceabilityData.summary.customers_count !== undefined">
            <el-statistic title="客户数量" :value="traceabilityData.summary.customers_count" />
          </el-col>
          <el-col :span="6" v-if="traceabilityData.summary.remaining_quantity !== undefined">
            <el-statistic title="剩余数量" :value="traceabilityData.summary.remaining_quantity" />
          </el-col>
        </el-row>
      </el-card>
    </div>

    <!-- 空状态 -->
    <EmptyState v-else description="请输入物料编码和批次号进行查询" ::image-size="200" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Download } from '@element-plus/icons-vue'
import { qualityApi } from '@/api/quality'
import dayjs from 'dayjs'
import { formatDateTime } from '@/utils/helpers/dateUtils'
const route = useRoute()

// 搜索表单
const searchForm = ref({
  materialCode: '',
  batchNumber: ''
})

// 加载状态
const loading = ref(false)

// 追溯数据
const traceabilityData = ref(null)
const hasData = computed(() => !!traceabilityData.value)

const latestBatches = ref([])

// 查询追溯
const handleSearch = async () => {
  if (!searchForm.value.materialCode) {
    ElMessage.warning('请输入物料编码')
    return
  }
  if (!searchForm.value.batchNumber) {
    ElMessage.warning('请输入批次号')
    return
  }

  loading.value = true
  try {
    // 使用统一追溯查询接口
    const params = {
      materialCode: searchForm.value.materialCode
    }
    params.batchNumber = searchForm.value.batchNumber

    // axiosInstance 拦截器会自动补齐 /api 和 Token，这里无需写 /api 前缀
    // 注意不能以 / 开头，否则 baseURL 结合在一起可能会诱发环境下的直接 404
    const response = await qualityApi.traceability.getUnified(params)
    // response.data 已经被拦截器解包为实际业务对象
    const resultData = response.data

    if (resultData) {
      // 解析追溯数据
      parseTraceabilityData(resultData)
      ElMessage.success(response._message || '追溯查询成功')
    } else {
      traceabilityData.value = null
      ElMessage.error(response._message || '未找到该批次的追溯信息，请检查是否存在或已被消耗。')
    }
  } catch (error) {
    traceabilityData.value = null
    ElMessage.error('查询失败: ' + (error.response?._message || error.response?.data?.message || error.message))
    traceabilityData.value = null
  } finally {
    loading.value = false
  }
}

// 解析追溯数据
const parseTraceabilityData = (data) => {
  // 判断是原材料还是成品
  // 如果有product_code或chain_no字段,说明是成品追溯链
  const isProduct = data.isProduct || data.productCode || data.chainNo || data.productBatch || data.product || data.type === 'product'

  if (isProduct) {
    // 成品追溯数据 - 来自getFullChain的返回

    // ✅ 优先使用后端返回的 production_materials（包含完整的采购日期和供应商信息）
    let rawMaterials = []

    if (data.productionMaterials && data.productionMaterials.length > 0) {
      // 使用新的完整原材料信息
      rawMaterials = data.productionMaterials.map(m => ({
        raw_material_code: m.raw_material_code,
        raw_material_name: m.raw_material_name,
        raw_material_batch: m.raw_material_batch || '-',
        supplier_name: m.supplierName || '-',
        consumed_quantity: m.consumed_quantity || 0,
        specification: m.specification || '-',
        receipt_date: m.receipt_date || '-'
      }))
    } else if (data.steps) {
      // 备用：从steps中提取原材料消耗信息
      data.steps.forEach((step) => {
        // 🔥 只从 MATERIAL_ISSUE 步骤中提取原材料消耗信息
        if (step.step_type === 'MATERIAL_ISSUE' && step.materials && step.materials.length > 0) {
          step.materials.forEach(m => {
            rawMaterials.push({
              raw_material_code: m.materialCode,
              raw_material_name: m.materialName,
              raw_material_batch: m.batchNumber || '-',
              supplier_name: m.supplierName || '-',
              consumed_quantity: m.quantity || 0,
              specification: m.specification || '-',
              receipt_date: m.usageTime || '-'
            })
          })
        }
      })
    }

    // 如果没有从上述方式获取到原材料,则使用BOM组件作为备选
    if (rawMaterials.length === 0 && data.bomComponents) {
      data.bomComponents.forEach(comp => {
        rawMaterials.push({
          raw_material_code: comp.rawMaterialCode,
          raw_material_name: comp.rawMaterialName,
          raw_material_batch: comp.raw_material_batch || '-',
          supplier_name: comp.supplierName || '-',
          consumed_quantity: comp.quantity || 0,
          specification: comp.specification || '-',
          receipt_date: comp.purchase_date || '-'
        })
      })
    }

    const productBatchInfo = data.batchInfo || data.productBatch || data.product || {}
    const salesSource = Array.isArray(data.salesRecords) ? data.salesRecords : []
    const salesSteps = salesSource.length > 0
      ? salesSource
      : (Array.isArray(data.steps) ? data.steps.filter(s => s.step_type === 'SALES_OUT') : [])

    traceabilityData.value = {
      type: 'product',
      batch_info: {
        material_code: productBatchInfo.materialCode || data.productCode,
        material_name: productBatchInfo.materialName || data.productName,
        batch_number: productBatchInfo.batchNumber || data.batchNumber || data.productBatch,
        specification: productBatchInfo.specification || data.productSpecs,
        original_quantity: productBatchInfo.original_quantity || data.inventoryInfo?.original_quantity || 0,
        current_quantity: productBatchInfo.current_quantity || data.inventoryInfo?.current_quantity || 0,
        production_date: productBatchInfo.receiptDate || data.productionDate,
        status: data.status || 'active',
        unit: productBatchInfo.unit || data.inventoryInfo?.unit || '个'
      },
      steps: data.steps || [],
      raw_materials: rawMaterials,
      sales_records: salesSteps.map(s => ({
        outbound_no: s.outboundNo || s.referenceNo,
        customer_name: s.customerName || s.remarks || '未知客户',
        allocated_quantity: s.allocatedQuantity || 0,
        delivery_date: s.salesCreatedAt || s.deliveryDate || s.startTime
      })),
      summary: {
        raw_material_batches: rawMaterials.length,
        total_sales: data.traceabilitySummary?.total_sales ?? salesSteps.reduce((sum, s) => sum + (Number(s.allocated_quantity ?? s.quantity) || 0), 0),
        customers_count: data.traceabilitySummary?.customers_count ?? new Set(salesSteps.map(s => s.customerName || s.remarks)).size,
        remaining_quantity: data.traceabilitySummary?.remaining_quantity ?? productBatchInfo.current_quantity ?? data.inventoryInfo?.current_quantity ?? 0
      }
    }
  } else {
    // 原材料追溯数据 - 及正向追踪成品流向
    const batchInfo = data.batchInfo || data || {}

    // 整合出入库流水与成品组装追踪（Timeline展示）
    const combinedSteps = [];

    if (data.transactionHistory && data.transactionHistory.length > 0) {
       combinedSteps.push(...data.transactionHistory.map((t, index) => ({
          id: t.id || globalThis.crypto?.randomUUID?.() || `transaction_${t.referenceNo || index}`,
          step_name: t.transactionType === 'inbound' || t.transactionType === 'purchase_inbound' ? '采购入库' :
                     (t.transactionType === 'production_inbound' ? '生产入库' :
                     (t.transactionType === 'outbound' || t.transactionType === 'sales_outbound' ? '出库发料/销售' : '库存流转')),
          status: 'completed',
          reference_no: t.referenceNo,
          quantity: t.quantity,
          unit: t.unit || batchInfo.unit,
          operator: t.operator,
          location: t.locationName,
          remarks: t.remark,
          created_at: t.createdAt
       })));
    }

    if (data.steps && data.steps.length > 0) {
       combinedSteps.push(...data.steps.map((s, index) => ({
          id: s.id || globalThis.crypto?.randomUUID?.() || `trace_step_${s.referenceNo || index}`,
          step_name: s.step_type === 'SALES_OUT' ? '成品销售发货' : '装配为成品',
          status: 'completed',
          reference_no: s.referenceNo,
          quantity: s.quantity,
          unit: batchInfo.unit,
          operator: '系统追溯',
          location: [s.productName, s.product_batch ? `批次 ${s.product_batch}` : '', s.product_specification ? `(${s.product_specification})` : ''].filter(Boolean).join(' ') || '-',
          remarks: s.remarks,
          created_at: s.createdAt
       })));
    }

    // 按时间升序排序
    combinedSteps.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // 扩展销售去向记录(卡片表格)
    let salesRecords = [];
    if (data.steps && data.steps.length > 0) {
      salesRecords = data.steps.filter(s => s.step_type === 'SALES_OUT').map(s => ({
         outbound_no: s.referenceNo,
         customer_name: s.remarks,
         allocated_quantity: s.quantity,
         delivery_date: s.createdAt,
         product_name: s.productName,
         product_code: s.productCode,
         product_batch: s.product_batch,
         product_specification: s.product_specification
      }));
    }
    if (data.transactionHistory && data.transactionHistory.length > 0) {
      const transactionSales = data.transactionHistory
        .filter(t => t.transactionType === 'sales_outbound')
        .map(t => {
          const customerMatch = String(t.remark || '').match(/客户[:：]\s*(.+)$/)
          return {
            outbound_no: t.referenceNo,
            customer_name: customerMatch?.[1] || t.remark || '未知客户',
            allocated_quantity: Math.abs(Number(t.quantity) || 0),
            delivery_date: t.createdAt,
            product_name: batchInfo.materialName,
            product_code: batchInfo.materialCode,
            product_specification: batchInfo.specification
          }
        })
      const existingKeys = new Set(salesRecords.map(s => `${s.outboundNo || ''}_${s.customerName || ''}`))
      transactionSales.forEach(record => {
        const key = `${record.outboundNo || ''}_${record.customerName || ''}`
        if (!existingKeys.has(key)) {
          salesRecords.push(record)
        }
      })
    }

    traceabilityData.value = {
      type: 'material',
      batch_info: {
        material_code: batchInfo.materialCode || '-',
        material_name: batchInfo.materialName || '-',
        batch_number: batchInfo.batchNumber || '-',
        specification: batchInfo.specification || '-',
        original_quantity: batchInfo.original_quantity || 0,
        current_quantity: batchInfo.current_quantity || 0,
        receipt_date: batchInfo.receiptDate || '-',
        supplier_name: batchInfo.supplierName || '-',
        status: batchInfo.status || 'active',
        unit: batchInfo.unit || '个'
      },
      steps: combinedSteps,
      sales_records: salesRecords,
      bom_components: data.bomComponents || [],
      summary: salesRecords.length > 0 ? {
        total_sales: salesRecords.reduce((sum, s) => sum + (Number(s.allocated_quantity) || 0), 0),
        customers_count: new Set(salesRecords.map(s => s.customerName)).size
      } : null
    }
  }

}

// 跳转到指定物料+批次的追溯页面
const navigateToTrace = (materialCode, batchNumber) => {
  if (!materialCode || !batchNumber) return
  searchForm.value.materialCode = materialCode
  searchForm.value.batchNumber = batchNumber
  handleSearch()
}

// 重置搜索
const resetSearch = () => {
  searchForm.value.materialCode = ''
  searchForm.value.batchNumber = ''
  traceabilityData.value = null
}

const loadLatestBatch = (batch) => {
  searchForm.value.materialCode = batch.materialCode
  searchForm.value.batchNumber = batch.batchNumber
  handleSearch()
}

// 获取最新批次
const loadLatestBatches = async () => {
  try {
    const response = await qualityApi.traceability.getLatestBatches({ limit: 5 })
    const batches = Array.isArray(response.data) ? response.data : (response.data?.list || [])
    if (batches.length) {
      latestBatches.value = batches.map((batch, index) => ({
        id: index + 1,
        label: `${batch.materialCode} - ${batch.batchNumber}`,
        materialCode: batch.materialCode,
        batchNumber: batch.batchNumber
      }))
      ElMessage.success('已加载最新批次')
    }
  } catch {
    latestBatches.value = []
    ElMessage.error('获取最新批次失败')
  }
}

// 导出报告
const exportReport = async () => {
  if (!traceabilityData.value) {
    ElMessage.warning('请先查询追溯信息')
    return
  }
  if (!searchForm.value.batchNumber) {
    ElMessage.warning('请输入批次号')
    return
  }

  try {
    const response = await qualityApi.traceability.exportReport({
      materialCode: searchForm.value.materialCode,
      batchNumber: searchForm.value.batchNumber,
      direction: traceabilityData.value.type === 'product' ? 'backward' : 'forward'
    })

    const blob = response.data
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `追溯报告_${searchForm.value.materialCode}_${searchForm.value.batchNumber}_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`
    link.click()
    window.URL.revokeObjectURL(url)

    ElMessage.success('报告导出成功')
  } catch {
    ElMessage.error('导出报告失败')
  }
}

// 格式化日期时间
// formatDateTime: 使用公共实现


// 获取数量样式
const getQuantityClass = (quantity) => {
  const qty = Number(quantity) || 0
  if (qty === 0) return 'quantity-zero'
  if (qty < 10) return 'quantity-low'
  return 'quantity-normal'
}

// 获取状态类型
const getStatusType = (status) => {
  const statusMap = {
    'active': 'success',
    'in_progress': 'warning',
    'completed': 'success',
    'cancelled': 'info',
    'pending': 'warning'
  }
  return statusMap[status] || 'info'
}

// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    'active': '正常',
    'in_progress': '进行中',
    'completed': '已完成',
    'cancelled': '已取消',
    'pending': '待处理'
  }
  return statusMap[status] || status
}

// 获取步骤状态类型
const getStepStatusType = (status) => {
  const statusMap = {
    'completed': 'success',
    'in_progress': 'warning',
    'pending': 'info',
    'failed': 'danger',
    'skipped': 'info'
  }
  return statusMap[status] || 'info'
}

// 获取步骤状态文本
const getStepStatusText = (status) => {
  const statusMap = {
    'completed': '已完成',
    'in_progress': '进行中',
    'pending': '待处理',
    'failed': '失败',
    'skipped': '已跳过'
  }
  return statusMap[status] || status
}

// 监听路由参数变化实现自动查询
watch(
  () => route.query,
  (query) => {
    if (query.materialCode && query.batchNumber) {
      searchForm.value.materialCode = query.materialCode
      searchForm.value.batchNumber = query.batchNumber
      // 延迟一点等待组件渲染就绪
      setTimeout(() => {
        handleSearch()
      }, 100)
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.unified-traceability {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0 0 10px 0;
  color: var(--color-text-primary);
}

.page-header p {
  margin: 0;
  color: var(--color-text-regular);
  font-size: 14px;
}

.search-card {
  margin-bottom: 20px;
}

.search-section {
  padding: 10px 0;
}

.test-cases {
  padding: 10px;
  background: var(--color-bg-hover);
  border-radius: var(--radius-sm);
}

.quantity-zero {
  color: var(--color-danger);
  font-weight: bold;
}

.quantity-low {
  color: var(--color-warning);
  font-weight: bold;
}

.quantity-normal {
  color: var(--color-success);
  font-weight: bold;
}

.batch-info-card :deep(.el-descriptions__label) {
  font-weight: 500;
}

.traceability-results {
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
