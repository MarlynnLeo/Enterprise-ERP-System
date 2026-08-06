<!--
/**
 * MaterialShortage.vue
 * @description 生产计划缺料统计页面
 * @date 2025-10-15
 * @version 1.0.0
 */
-->
<script setup>
import { ref, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { getProductionStatusText, getProductionStatusColor } from '@/constants/systemConstants'
import { productionApi, purchaseApi } from '@/api'
import { formatQuantity } from '@/utils/helpers/quantity'
import { parseApiResponse, parsePaginatedData } from '@/utils/responseParser'
import dayjs from 'dayjs'
import { formatDate } from '@/utils/helpers/dateUtils'
import { Download, ShoppingCart, Select, Close, InfoFilled } from '@element-plus/icons-vue'
import { loadExcelJS } from '@/utils/lazyVendors'
const props = defineProps({
  pageTitle: {
    type: String,
    default: '生产计划缺料统计'
  },
  pageSubtitle: {
    type: String,
    default: '统计生产计划物料缺口'
  }
})

// 数据定义
const loading = ref(false)
const shortageList = ref([])
const statistics = ref({
  affectedPlans: 0,
  shortageMaterials: 0,
  totalShortage: 0
})
// 添加响应式分页对象
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})
// 搜索表单
const searchForm = ref({
  material: '',
  purchaseStatus: '' // 采购状态：'' 全部，'pending' 待申请，'requested' 已申请
})
// 批量选择相关
const shortageTableRef = ref(null)
const selectedShortages = ref([])
const batchLoading = ref(false)
// 确认对话框相关
const confirmDialogVisible = ref(false)
const confirmMaterialList = ref([])
// 获取生产状态文本 — 委托给 systemConstants
const getStatusText = (status) => getProductionStatusText(status)
// 获取状态颜色 — 委托给 systemConstants
const _getStatusType = (status) => getProductionStatusColor(status)
// 格式化日期
// formatDate 已统一引用公共实现
// 获取缺料统计数据
const fetchShortageData = async (force = false) => {
  // 防止重复请求，除非强制刷新
  if (loading.value && !force) return
  loading.value = true
  try {
    const params = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize
    }
    if (searchForm.value.material) params.material = searchForm.value.material
    if (searchForm.value.purchaseStatus) params.purchaseStatus = searchForm.value.purchaseStatus
    const response = await productionApi.getMaterialShortageSummary(params)
    // 使用统一解析器处理分页数据
    const { list, total, statistics: stats } = parsePaginatedData(response, { enableLog: false })
    shortageList.value = list
    pagination.total = Number(total) || 0
    statistics.value = stats || {
      affectedPlans: 0,
      shortageMaterials: 0,
      totalShortage: 0
    }
  } catch (error) {
    console.error('获取缺料统计失败:', error)
    ElMessage.error('获取缺料统计失败: ' + (error.response?.data?.message || error.message))
  } finally {
    loading.value = false
  }
}
// 搜索
const handleSearch = () => {
  pagination.currentPage = 1
  fetchShortageData()
}
// 重置搜索
const handleReset = () => {
  searchForm.value = {
    material: '',
    purchaseStatus: ''
  }
  pagination.currentPage = 1
  fetchShortageData()
}
// 导出数据
const handleExport = async () => {
  if (shortageList.value.length === 0) {
    ElMessage.warning('没有数据可以导出')
    return
  }
  try {
    // 动态导入 ExcelJS 库
    const ExcelJS = await loadExcelJS()
    // 创建工作簿
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('缺料统计')
    // 设置列
    worksheet.columns = [
      { header: '计划编号', key: 'plan_code', width: 15 },
      { header: '计划名称', key: 'plan_name', width: 20 },
      { header: '计划状态', key: 'plan_status', width: 10 },
      { header: '物料编码', key: 'material_code', width: 15 },
      { header: '物料名称', key: 'material_name', width: 25 },
      { header: '规格型号', key: 'material_specs', width: 20 },
      { header: '单位', key: 'unit', width: 8 },
      { header: '需求数量', key: 'required_quantity', width: 12 },
      { header: '当前库存', key: 'current_stock_quantity', width: 12 },
      { header: '本次可用', key: 'stock_quantity', width: 12 },
      { header: '缺料数量', key: 'shortage_quantity', width: 12 },
      { header: '采购状态', key: 'purchase_status', width: 10 },
      { header: '计划开始日期', key: 'start_date', width: 12 },
      { header: '计划结束日期', key: 'end_date', width: 12 }
    ]
    // 添加数据
    shortageList.value.forEach(item => {
      worksheet.addRow({
        plan_code: item.planCode || '',
        plan_name: item.planName || '',
        plan_status: getStatusText(item.planStatus),
        material_code: item.materialCode || '',
        material_name: item.materialName || '',
        material_specs: item.materialSpecs || '',
        unit: item.unit || '',
        required_quantity: formatQuantity(item.requiredQuantity),
        current_stock_quantity: formatQuantity(item.currentStockQuantity),
        stock_quantity: formatQuantity(item.stockQuantity),
        shortage_quantity: formatQuantity(item.shortageQuantity),
        purchase_status: item.purchaseStatus === 'requested' ? '已申请' : '待申请',
        start_date: formatDate(item.startDate),
        end_date: formatDate(item.endDate)
      })
    })
    // 生成文件名
    const fileName = `缺料统计_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`
    // 生成并下载文件
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    window.URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败: ' + (error.message || '未知错误'))
  }
}
// 分页处理
const handleSizeChange = (val) => {
  pagination.pageSize = val
  fetchShortageData()
}
const handleCurrentChange = (val) => {
  pagination.currentPage = val
  fetchShortageData()
}
// 跳转到生产计划详情
const viewPlanDetail = (planId) => {
  // 这里可以实现跳转到生产计划详情页面的逻辑
  ElMessage.info(`跳转到生产计划详情 ID: ${planId}`)
}
// 批量选择相关方法
const handleSelectionChange = (selection) => {
  selectedShortages.value = selection
}
const clearSelection = () => {
  if (shortageTableRef.value) {
    shortageTableRef.value.clearSelection()
  }
  selectedShortages.value = []
}
// 批量创建采购申请 - 显示确认对话框
const handleBatchCreateRequisition = () => {
  try {
    // 按物料分组整合数据
    const materialMap = new Map()

    selectedShortages.value.forEach(item => {
      const key = item.materialId
      if (materialMap.has(key)) {
        // 如果已存在该物料，累加数量
        const existing = materialMap.get(key)
        existing.shortage_quantity = parseFloat(existing.shortage_quantity) + parseFloat(item.shortageQuantity)
        existing.plans.push({
          plan_code: item.planCode,
          plan_name: item.planName
        })
      } else {
        // 新物料
        materialMap.set(key, {
          material_id: item.materialId,
          material_code: item.materialCode,
          material_name: item.materialName,
          material_specs: item.materialSpecs,
          unit: item.unit,
          shortage_quantity: parseFloat(item.shortageQuantity),
          plans: [{
            plan_code: item.planCode,
            plan_name: item.planName
          }]
        })
      }
    })
    // 检查是否有已申请的记录
    const requestedItems = selectedShortages.value.filter(item => item.purchaseStatus === 'requested')

    // 如果全部都已申请，给出警告并阻止
    if (requestedItems.length === selectedShortages.value.length) {
      ElMessage.warning('选中的所有缺料记录都已创建过采购申请，请勿重复提交！')
      return
    }
    // 准备确认对话框的数据
    confirmMaterialList.value = Array.from(materialMap.values()).map(item => ({
      ...item,
      // 添加一个编辑用的数量字段
      edit_quantity: item.shortageQuantity
    }))

    // 显示确认对话框
    confirmDialogVisible.value = true
  } catch (error) {
    console.error('准备采购申请失败:', error)
    ElMessage.error(error.message || '准备采购申请失败')
  }
}
// 确认提交采购申请
const confirmSubmitRequisition = async () => {
  try {
    // 验证数量
    const invalidItems = confirmMaterialList.value.filter(item => !item.editQuantity || item.editQuantity <= 0)
    if (invalidItems.length > 0) {
      ElMessage.warning('请输入有效的采购数量（必须大于0）')
      return
    }

    batchLoading.value = true
    // 仅允许带生产计划来源的申请（source_type/source_id/source_material_id）
    const planMaterialMap = new Map()
    for (const row of selectedShortages.value) {
      if (row.purchaseStatus === 'requested') continue
      const planId = row.planId
      if (!planId) {
        throw new Error(`物料 ${row.materialCode || row.materialId} 缺少生产计划来源，无法创建采购申请`)
      }
      if (!planMaterialMap.has(planId)) {
        planMaterialMap.set(planId, {
          plan_id: planId,
          plan_code: row.planCode,
          materials: new Map()
        })
      }
      const bucket = planMaterialMap.get(planId)
      const confirmItem = confirmMaterialList.value.find(m => m.materialId === row.materialId)
      const qty = parseFloat(confirmItem?.edit_quantity ?? row.shortageQuantity) || 0
      if (qty <= 0) continue
      if (bucket.materials.has(row.materialId)) {
        bucket.materials.get(row.materialId).quantity += qty
      } else {
        bucket.materials.set(row.materialId, {
          material_id: row.materialId,
          material_code: row.materialCode,
          material_name: row.materialName,
          specs: row.materialSpecs,
          unit: row.unit,
          quantity: qty,
          remarks: `生产计划缺料 - ${row.planCode}`
        })
      }
    }

    if (planMaterialMap.size === 0) {
      throw new Error('没有可提交的缺料明细（可能均已请购或数量无效）')
    }

    const createdNos = []
    let materialCount = 0
    for (const bucket of planMaterialMap.values()) {
      for (const mat of bucket.materials.values()) {
        const response = await purchaseApi.createRequisition({
          request_date: dayjs().format('YYYY-MM-DD'),
          materials: [mat],
          remarks: `根据生产计划缺料统计自动生成 - 计划: ${bucket.plan_code}`,
          source_type: 'production_plan',
          source_id: bucket.planId,
          source_material_id: mat.materialId
        })
        const result = parseApiResponse(response)
        if (!(result.success && result.data)) {
          throw new Error(result.error || `计划 ${bucket.plan_code} 物料 ${mat.materialCode} 创建失败`)
        }
        const no = result.data.requisitionNumber || result.data.requisitionNo || ''
        if (no) {
          createdNos.push(result.data.alreadyExists ? `${no}(已存在)` : no)
        }
        materialCount += 1
      }
    }
    ElMessage({
      message: `采购申请处理完成：${materialCount} 种物料，单号：${createdNos.join('、') || '—'}`,
      type: 'success',
      duration: 5000,
      showClose: true
    })
    confirmDialogVisible.value = false
    clearSelection()
    batchLoading.value = false
    await fetchShortageData(true)
  } catch (error) {
    console.error('批量创建采购申请失败:', error)
    ElMessage.error(error.message || '批量创建采购申请失败')
    batchLoading.value = false
  }
}
// 取消提交
const cancelSubmitRequisition = () => {
  confirmDialogVisible.value = false
  confirmMaterialList.value = []
}
// 生命周期
onMounted(() => {
  fetchShortageData()
})
</script>
<template>
  <div class="module-page material-shortage-container">
    <!-- 页面标题 -->
    <PageHeader :title="props.pageTitle" :subtitle="props.pageSubtitle">
      <template #actions>
        <el-button type="success" :icon="Download" @click="handleExport" v-permission="'production:plans:export'">导出</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="handleSearch"
      @reset="handleReset"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input  v-model="searchForm.material" placeholder="物料名称" clearable />
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="采购状态">
          <el-select v-model="searchForm.purchaseStatus" placeholder="全部" clearable @change="handleSearch">
            <el-option label="待申请" value="pending" />
            <el-option label="已申请" value="requested" />
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.affectedPlans }}</div>
        <div class="stat-label">受影响的生产计划</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.shortageMaterials }}</div>
        <div class="stat-label">缺料物料种类</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatQuantity(statistics.totalShortage) }}</div>
        <div class="stat-label">总缺料数量</div>
      </el-card>
    </div>
    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        ref="shortageTableRef"
        :data="shortageList"
        border
        class="w-full"
        v-loading="loading"
        :default-sort="{ prop: 'start_date', order: 'ascending' }"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" fixed="left"></el-table-column>
        <el-table-column prop="planCode" label="计划编号" width="140" fixed="left">
          <template #default="scope">
            <el-link type="primary" @click="viewPlanDetail(scope.row.planId)">
              {{ scope.row.planCode }}
            </el-link>
          </template>
        </el-table-column>

        <el-table-column prop="contractCode" label="合同编码" width="150" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.contractCode || '-' }}
          </template>
        </el-table-column>

        <el-table-column label="计划开始日期" width="120" sortable>
          <template #default="scope">
            {{ formatDate(scope.row.startDate) }}
          </template>
        </el-table-column>

        <el-table-column prop="productName" label="产品名称" width="180" show-overflow-tooltip />

        <el-table-column prop="productCode" label="产品编码" width="130" />

        <el-table-column prop="productSpecs" label="产品规格" width="150" show-overflow-tooltip>
          <template #default="scope">
            <el-tooltip
              v-if="scope.row.productSpecs"
              :content="scope.row.productSpecs"
              placement="top"
            >
              <span class="specs-text">{{ scope.row.productSpecs }}</span>
            </el-tooltip>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="计划数量" width="100">
          <template #default="scope">
            {{ formatQuantity(scope.row.planQuantity) }}
          </template>
        </el-table-column>

        <el-table-column prop="materialCode" label="缺料编码" width="130" />

        <el-table-column prop="materialName" label="缺料名称" width="180" show-overflow-tooltip />

        <el-table-column prop="materialSpecs" label="缺料规格" width="150" show-overflow-tooltip>
          <template #default="scope">
            <el-tooltip
              v-if="scope.row.materialSpecs"
              :content="scope.row.materialSpecs"
              placement="top"
            >
              <span class="specs-text">{{ scope.row.materialSpecs }}</span>
            </el-tooltip>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column label="需求数量" width="110">
          <template #default="scope">
            {{ formatQuantity(scope.row.requiredQuantity) }}
          </template>
        </el-table-column>

        <el-table-column label="当前库存" width="110">
          <template #default="scope">
            <span class="text-info">{{ formatQuantity(scope.row.currentStockQuantity) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="本次可用" width="110">
          <template #default="scope">
            <span class="text-info">{{ formatQuantity(scope.row.stockQuantity) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="缺料数量" width="110">
          <template #default="scope">
            <span class="text-danger shortage-quantity">
              {{ formatQuantity(scope.row.shortageQuantity) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="采购状态" width="100" fixed="right">
          <template #default="scope">
            <el-tag :type="scope.row.purchaseStatus === 'requested' ? 'success' : 'warning'">
              {{ scope.row.purchaseStatus === 'requested' ? '已申请' : '待申请' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="unit" label="单位" width="80" fixed="right" />
      </el-table>
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.pageSize"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
        >
        </el-pagination>
      </div>
    </el-card>
    <!-- 确认采购申请对话框 -->
    <AppDialog
      v-model="confirmDialogVisible"
      title="确认采购申请"
      mode="form"
      wide
    >
      <div class="confirm-dialog-content">
        <el-table
          :data="confirmMaterialList"
          border
          class="w-full"
          max-height="400"
        >
          <el-table-column type="index" label="序号" width="60" />

          <el-table-column prop="materialCode" label="物料编码" width="110" />

          <el-table-column prop="materialName" label="物料名称" min-width="140" show-overflow-tooltip />

          <el-table-column prop="materialSpecs" label="规格" width="150" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row.materialSpecs || '-' }}
            </template>
          </el-table-column>

          <el-table-column label="关联计划" min-width="130" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row.plans.map(p => p.plan_code).join(', ') }}
            </template>
          </el-table-column>

          <el-table-column label="缺料数量" width="100">
            <template #default="scope">
              <span class="text-danger">{{ formatQuantity(scope.row.shortageQuantity) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="采购数量" width="110">
            <template #default="scope">
              <el-input
                v-model.number="scope.row.editQuantity"
                type="number"
                size="small"
                placeholder="请输入数量"
              />
            </template>
          </el-table-column>

          <el-table-column prop="unit" label="单位" width="70" />
        </el-table>
        <div class="dialog-summary">
          <el-icon><InfoFilled /></el-icon>
          <span>共 <strong>{{ confirmMaterialList.length }}</strong> 种物料，总采购数量：<strong>{{ formatQuantity(confirmMaterialList.reduce((sum, item) => sum + parseFloat(item.editQuantity || 0), 0)) }}</strong></span>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="cancelSubmitRequisition" :disabled="batchLoading">取消</el-button>
          <el-button type="primary" @click="confirmSubmitRequisition" :loading="batchLoading">
            <el-icon><ShoppingCart /></el-icon> 确认提交
          </el-button>
        </span>
      </template>
        </AppDialog>
    <!-- 浮动批量操作栏 -->
    <Transition name="slide-up">
      <div v-if="selectedShortages.length > 0" class="floating-batch-bar">
        <div class="batch-info">
          <el-icon><Select /></el-icon>
          <span>已选中 <strong>{{ selectedShortages.length }}</strong> 项缺料</span>
        </div>
        <div class="batch-buttons">
          <el-button
            type="primary"
            @click="handleBatchCreateRequisition"
            :loading="batchLoading"
          >
            <el-icon><ShoppingCart /></el-icon> 批量创建采购申请
          </el-button>
          <el-button
            @click="clearSelection"
          >
            <el-icon><Close /></el-icon> 清空选择
          </el-button>
        </div>
      </div>
    </Transition>
  </div>
</template>
<style scoped>
.header-card {
  margin-bottom: 20px;
}
.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}
.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}
.text-danger {
  color: var(--color-danger);
}
.danger {
  color: var(--color-danger);
}
.task-detail {
  padding: 20px;
}
.specs-text {
  display: inline-block;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.text-nowrap {
  white-space: nowrap;
}
.status-card {
  margin-bottom: var(--spacing-lg);
}
.status-card .el-card__body {
  padding: 10px;
}
.status-item {
  text-align: center;
  cursor: pointer;
}
.status-item:hover {
  background-color: var(--color-bg-hover);
}
.status-value {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 5px;
}
.status-label {
  color: var(--color-text-regular);
}
.drawer-title {
  font-size: 16px;
  margin-bottom: 10px;
}
/* 增强型号规格的显示 */
.el-table .specs-text {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
/* 确保工具提示有足够的宽度 */
:deep(.el-tooltip__popper) {
  max-width: 500px;
  word-break: break-word;
}
/* 操作列样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}
/* 加载规格的样式 */
.loading-specs {
  cursor: pointer;
  color: var(--color-text-secondary);
  text-decoration: underline;
  text-decoration-style: dotted;
}
.loading-specs:hover {
  color: var(--color-primary);
}
/* 产品搜索选项样式 */
.no-bom {
  color: var(--color-text-secondary) !important;
}
/* 表格单元格内容不换行，超出省略 */
:deep(.el-table .cell) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 确保表格列宽度限制 */
:deep(.el-table th.el-table__cell),
:deep(.el-table td.el-table__cell) {
  overflow: hidden;
}
/* 确认对话框样式 */
.confirm-dialog-content {
  padding: 0;
}
.dialog-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: var(--spacing-base);
  padding: 12px;
  background: var(--color-primary-light-9);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  color: var(--color-primary-dark-2, var(--color-primary));
  font-size: 14px;
}
.dialog-summary .el-icon {
  font-size: 18px;
  color: var(--color-primary);
}
.dialog-summary strong {
  color: var(--color-primary-dark-2, var(--color-primary));
  font-size: 15px;
}
.dialog-footer {
  display: flex;
  gap: 12px;
}
/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
