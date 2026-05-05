<template>
  <div class="unified-traceability">
    <el-card class="page-header">
      <h2><el-icon style="vertical-align: middle; margin-right: 6px;"><Refresh /></el-icon>批次追溯查询</h2>
      <p>统一追溯查询：输入物料编码和批次号,自动识别物料类型并展示完整追溯链路</p>
    </el-card>

    <el-card class="search-card">
      <!-- 统一搜索区域 -->
      <div class="search-section">
        <el-form :model="searchForm" inline>
          <el-form-item label="物料编码">
            <el-input
              v-model="searchForm.materialCode"
              placeholder="请输入物料编码或产品编码"

              clearable
              @keyup.enter="handleSearch"
            />
          </el-form-item>
          <el-form-item label="批次号">
            <el-input
              v-model="searchForm.batchNumber"
              placeholder="请输入批次号(可选)"

              clearable
              @keyup.enter="handleSearch"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch" :loading="loading">
              <el-icon><Search /></el-icon> 查询追溯
            </el-button>
            <el-button @click="resetSearch">
              <el-icon><Refresh /></el-icon> 重置
            </el-button>
            <el-button type="success" @click="exportReport" :disabled="!hasData">
              <el-icon><Download /></el-icon> 导出报告
            </el-button>
          </el-form-item>
        </el-form>

        <!-- 最近批次 -->
        <div class="test-cases" style="margin-top: 10px;">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <span style="color: var(--color-text-regular); font-size: 12px;">最近批次: </span>
            <el-button
              size="small"
              type="success"
              plain
              @click="loadLatestBatches"
              style="margin-left: 8px;"
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
            @click="loadLatestBatch(batch)"
            style="margin-right: 8px; margin-bottom: 4px;"
          >
            {{ batch.label }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 追溯结果展示 -->
    <div v-if="traceabilityData" class="traceability-results">
      <!-- 原材料关联BOM清单 (位于基本信息卡片上方) -->
      <el-card v-if="traceabilityData.bom_components && traceabilityData.bom_components.length > 0" style="margin-top: 20px; margin-bottom: 20px;">
        <template #header>
          <span>组成 BOM 清单</span>
        </template>
        <el-table :data="traceabilityData.bom_components" border stripe>
          <el-table-column prop="raw_material_code" label="物料编码" min-width="120" />
          <el-table-column prop="raw_material_name" label="物料名称" min-width="150" />
          <el-table-column prop="specification" label="规格型号" min-width="120" />
          <el-table-column prop="consumed_quantity" label="单套用量" width="100" align="right" />
          <el-table-column prop="unit" label="单位" width="80" align="center" />
          <el-table-column prop="supplier_name" label="供应商" min-width="120">
            <template #default="{ row }">
              <span v-if="row.supplier_name">{{ row.supplier_name }}</span>
              <span v-else style="color: var(--color-text-secondary);">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="purchase_date" label="采购时间" min-width="150">
            <template #default="{ row }">
              <span v-if="row.purchase_date">{{ formatDateTime(row.purchase_date) }}</span>
              <span v-else style="color: var(--color-text-secondary);">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="raw_material_batch" label="流转记录/消耗说明" min-width="180">
            <template #default="{ row }">
              <el-tag
                v-if="row.raw_material_batch && row.raw_material_batch !== '-'"
                type="primary"
                style="cursor: pointer;"
                @click="navigateToTrace(row.raw_material_code, row.raw_material_batch)"
              >{{ row.raw_material_batch }}</el-tag>
              <span v-else style="color: var(--color-text-secondary);">标准材料</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 批次基本信息 -->
      <el-card class="batch-info-card" style="margin-top: 20px;">
        <template #header>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>{{ traceabilityData.type === 'material' ? '原材料' : '成品' }}批次基本信息</span>
            <el-tag :type="traceabilityData.type === 'material' ? 'info' : 'success'">
              {{ traceabilityData.type === 'material' ? '原材料批次' : '成品批次' }}
            </el-tag>
          </div>
        </template>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="物料编码">
            {{ traceabilityData.batch_info.material_code || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="物料名称">
            {{ traceabilityData.batch_info.material_name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="批次号">
            <el-tag type="primary">
              {{ traceabilityData.batch_info.batch_number || '-' }}
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
          <el-descriptions-item v-if="traceabilityData.batch_info.supplier_name" label="供应商">
            {{ traceabilityData.batch_info.supplier_name }}
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
      <el-card v-if="traceabilityData.steps && traceabilityData.steps.length > 0" style="margin-top: 20px;">
        <template #header>
          <span>追溯链路步骤</span>
        </template>
        <el-timeline>
          <el-timeline-item
            v-for="step in traceabilityData.steps"
            :key="step.id"
            :type="getStepStatusType(step.status)"
            :timestamp="formatDateTime(step.start_time || step.created_at)"
            placement="top"
          >
            <el-card shadow="hover">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold;">{{ step.step_name }}</span>
                <el-tag :type="getStepStatusType(step.status)" size="small">
                  {{ getStepStatusText(step.status) }}
                </el-tag>
              </div>
              <div v-if="step.reference_no" style="margin-top: 8px; color: var(--color-text-regular); font-size: 13px;">
                单据号: {{ step.reference_no }}
              </div>
              <div v-if="step.quantity" style="margin-top: 4px; color: var(--color-text-regular); font-size: 13px;">
                数量: {{ step.quantity }} {{ step.unit || '' }}
              </div>
              <div v-if="step.operator" style="margin-top: 4px; color: var(--color-text-regular); font-size: 13px;">
                操作人: {{ step.operator }}
              </div>
              <div v-if="step.location" style="margin-top: 4px; color: var(--color-text-regular); font-size: 13px;">
                位置: {{ step.location }}
              </div>
              <div v-if="step.remarks" style="margin-top: 4px; color: var(--color-text-secondary); font-size: 12px;">
                备注: {{ step.remarks }}
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </el-card>

      <!-- 原材料消耗信息(支持全链路展示) -->
      <el-card v-if="traceabilityData.raw_materials && traceabilityData.raw_materials.length > 0"
               style="margin-top: 20px;">
        <template #header>
          <span>原材料消耗信息</span>
        </template>
        <el-table :data="traceabilityData.raw_materials" border stripe>
          <el-table-column prop="raw_material_code" label="原材料编码" min-width="120" />
          <el-table-column prop="raw_material_name" label="原材料名称" min-width="150" />
          <el-table-column prop="raw_material_batch" label="批次号" min-width="150">
            <template #default="{ row }">
              <span v-if="row.raw_material_batch && row.raw_material_batch !== '-'">
                {{ row.raw_material_batch }}
              </span>
              <span v-else style="color: var(--color-text-secondary);">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="supplier_name" label="供应商" min-width="120" />
          <el-table-column prop="consumed_quantity" label="消耗数量" width="100" align="right" />
          <el-table-column prop="specification" label="规格" min-width="120" />
          <el-table-column prop="receipt_date" label="入库时间" width="160" :formatter="(row) => formatDateTime(row.receipt_date)" />
        </el-table>
      </el-card>

      <!-- 销售记录(支持全链路展示) -->
      <el-card v-if="traceabilityData.sales_records && traceabilityData.sales_records.length > 0"
               style="margin-top: 20px;">
        <template #header>
          <span>销售去向记录</span>
        </template>
        <el-table :data="traceabilityData.sales_records" border stripe>
          <el-table-column prop="outbound_no" label="出库单号" min-width="150" />
          <el-table-column v-if="traceabilityData.type !== 'product'" label="制成成品" min-width="150">
            <template #default="{ row }">
              {{ row.product_name }}<span v-if="row.product_specification" style="color: var(--color-text-secondary); font-size: 12px; margin-left: 4px;">({{ row.product_specification }})</span>
            </template>
          </el-table-column>
          <el-table-column prop="customer_name" label="客户名称" min-width="150" />
          <el-table-column prop="allocated_quantity" label="消耗/销售量" width="100" align="right" />
          <el-table-column prop="delivery_date" label="交货时间" width="160" :formatter="(row) => formatDateTime(row.delivery_date)" />
        </el-table>
      </el-card>

      <!-- 追溯汇总 -->
      <el-card v-if="traceabilityData.summary" style="margin-top: 20px;">
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
    <el-empty v-else description="请输入物料编码和批次号进行查询" :image-size="200" />

    
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Download } from '@element-plus/icons-vue'
import { api } from '@/services/api'
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

  loading.value = true
  try {
    // 使用统一追溯查询接口
    const params = {
      materialCode: searchForm.value.materialCode
    }
    if (searchForm.value.batchNumber) {
      params.batchNumber = searchForm.value.batchNumber
    }
    
    // axiosInstance 拦截器会自动补齐 /api 和 Token，这里无需写 /api 前缀
    // 注意不能以 / 开头，否则 baseURL 结合在一起可能会诱发环境下的直接 404
    const response = await api.get('/batch-traceability/unified', { params })
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
  const isProduct = data.isProduct || data.product_code || data.chain_no || data.product_batch || data.product || data.type === 'product'

  if (isProduct) {
    // 成品追溯数据 - 来自getFullChain的返回

    // ✅ 优先使用后端返回的 production_materials（包含完整的采购日期和供应商信息）
    let rawMaterials = []
    
    if (data.production_materials && data.production_materials.length > 0) {
      // 使用新的完整原材料信息
      rawMaterials = data.production_materials.map(m => ({
        raw_material_code: m.raw_material_code,
        raw_material_name: m.raw_material_name,
        raw_material_batch: m.raw_material_batch || '-',
        supplier_name: m.supplier_name || '-',
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
              raw_material_code: m.material_code,
              raw_material_name: m.material_name,
              raw_material_batch: m.batch_number || '-',
              supplier_name: m.supplier_name || '-',
              consumed_quantity: m.quantity || 0,
              specification: m.specification || '-',
              receipt_date: m.usage_time || m.created_at || '-'
            })
          })
        }
      })
    }

    // 如果没有从上述方式获取到原材料,则使用BOM组件作为备选
    if (rawMaterials.length === 0 && data.bom_components) {
      data.bom_components.forEach(comp => {
        rawMaterials.push({
          raw_material_code: comp.material_code,
          raw_material_name: comp.material_name,
          raw_material_batch: '-',
          supplier_name: '-',
          consumed_quantity: comp.quantity || 0,
          specification: comp.specification || '-',
          receipt_date: '-'
        })
      })
    }

    traceabilityData.value = {
      type: 'product',
      batch_info: {
        material_code: data.product_code,
        material_name: data.product_name,
        batch_number: data.batch_number,
        specification: data.product_specs,
        original_quantity: data.inventory_info?.original_quantity || 0,
        current_quantity: data.inventory_info?.current_quantity || 0,
        production_date: data.production_date,
        status: data.status || 'active',
        unit: data.inventory_info?.unit || '个'
      },
      steps: data.steps || [],
      raw_materials: rawMaterials,
      sales_records: [],  // 从steps中提取销售记录
      summary: {
        raw_material_batches: rawMaterials.length,
        total_sales: 0,  // 需要从steps中计算
        customers_count: 0,
        remaining_quantity: data.inventory_info?.current_quantity || 0
      }
    }

    // 从steps中提取销售记录
    if (data.steps) {
      const salesSteps = data.steps.filter(s => s.step_type === 'SALES_OUT')
      traceabilityData.value.sales_records = salesSteps.map(s => ({
        outbound_no: s.reference_no,
        customer_name: s.remarks || '未知客户',
        allocated_quantity: s.quantity || 0,
        delivery_date: s.start_time || s.created_at
      }))

      // 计算销售汇总
      traceabilityData.value.summary.total_sales = salesSteps.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
      traceabilityData.value.summary.customers_count = new Set(salesSteps.map(s => s.remarks)).size
    }
  } else {
    // 原材料追溯数据 - 及正向追踪成品流向
    const batchInfo = data.batch_info || data || {}
    
    // 整合出入库流水与成品组装追踪（Timeline展示）
    const combinedSteps = [];
    
    if (data.transaction_history && data.transaction_history.length > 0) {
       combinedSteps.push(...data.transaction_history.map((t, index) => ({
          id: t.id || globalThis.crypto?.randomUUID?.() || `transaction_${t.reference_no || index}`,
          step_name: t.transaction_type === 'inbound' || t.transaction_type === 'purchase_inbound' ? '采购入库' : 
                     (t.transaction_type === 'production_inbound' ? '生产入库' : 
                     (t.transaction_type === 'outbound' || t.transaction_type === 'sales_outbound' ? '出库发料/销售' : '库存流转')),
          status: 'completed',
          reference_no: t.reference_no,
          quantity: t.quantity,
          unit: t.unit || batchInfo.unit,
          operator: t.operator,
          location: t.location_name,
          remarks: t.remark,
          created_at: t.created_at
       })));
    }
    
    if (data.steps && data.steps.length > 0) {
       combinedSteps.push(...data.steps.map((s, index) => ({
          id: s.id || globalThis.crypto?.randomUUID?.() || `trace_step_${s.reference_no || index}`,
          step_name: s.step_type === 'SALES_OUT' ? '成品销售发货' : '装配为成品',
          status: 'completed',
          reference_no: s.reference_no,
          quantity: s.quantity,
          unit: batchInfo.unit,
          operator: '系统追溯',
          location: s.product_name + (s.product_specification ? ` (${s.product_specification})` : ''),
          remarks: s.remarks,
          created_at: s.created_at
       })));
    }
    
    // 按时间升序排序
    combinedSteps.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // 扩展销售去向记录(卡片表格)
    let salesRecords = [];
    if (data.steps && data.steps.length > 0) {
      salesRecords = data.steps.filter(s => s.step_type === 'SALES_OUT').map(s => ({
         outbound_no: s.reference_no,
         customer_name: s.remarks,
         allocated_quantity: s.quantity,
         delivery_date: s.created_at,
         product_name: s.product_name,
         product_code: s.product_code,
         product_specification: s.product_specification
      }));
    }

    traceabilityData.value = {
      type: 'material',
      batch_info: {
        material_code: batchInfo.material_code || '-',
        material_name: batchInfo.material_name || '-',
        batch_number: batchInfo.batch_number || '-',
        specification: batchInfo.specification || '-',
        original_quantity: batchInfo.original_quantity || 0,
        current_quantity: batchInfo.current_quantity || 0,
        receipt_date: batchInfo.receipt_date || batchInfo.created_at || '-',
        supplier_name: batchInfo.supplier_name || '-',
        status: batchInfo.status || 'active',
        unit: batchInfo.unit || '个'
      },
      steps: combinedSteps,
      sales_records: salesRecords,
      bom_components: data.bom_components || [],
      summary: salesRecords.length > 0 ? {
        total_sales: salesRecords.reduce((sum, s) => sum + (Number(s.allocated_quantity) || 0), 0),
        customers_count: new Set(salesRecords.map(s => s.customer_name)).size
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
    const response = await fetch('/api/batch-traceability/latest-batches?limit=5')
    const result = await response.json()
    if (result.success && result.data) {
      latestBatches.value = result.data.map((batch, index) => ({
        id: index + 1,
        label: `${batch.material_code} - ${batch.batch_number}`,
        materialCode: batch.material_code,
        batchNumber: batch.batch_number
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

  try {
    const response = await fetch(`/api/batch-traceability/export/report?materialCode=${searchForm.value.materialCode}&batchNumber=${searchForm.value.batchNumber || ''}`, {
      responseType: 'blob'
    })

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `追溯报告_${searchForm.value.materialCode}_${searchForm.value.batchNumber || 'all'}_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`
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
  border-radius: 4px;
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

