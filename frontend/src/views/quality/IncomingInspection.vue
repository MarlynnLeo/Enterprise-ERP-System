<!--
/**
 * IncomingInspection.vue
 * @description 来料检验管理主页面
 * @date 2026-04-03
 * @version 2.0.0
 *
 * 重构说明：
 * - 从 3273 行缩减为 ~480 行（-85%）
 * - 6 个弹窗组件已拆分为独立文件
 * - 主文件仅保留列表页面、搜索筛选、统计卡片和子组件编排
 */
-->
<template>
  <div class="module-page inspection-container">
    <PageHeader title="来料检验管理" subtitle="来料检验单创建、执行与判定">
      <template #actions>
        <el-button type="primary" v-if="canCreate" @click="createDialogVisible = true">
          <el-icon><Plus /></el-icon>新增
        </el-button>
      </template>
    </PageHeader>

    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.total }}</div>
        <div class="stat-label">全部检验单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.pending }}</div>
        <div class="stat-label">待检验</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.passed }}</div>
        <div class="stat-label">合格</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.failed }}</div>
        <div class="stat-label">不合格</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.partial }}</div>
        <div class="stat-label">部分合格</div>
      </el-card>
    </div>

    <FinanceQueryCard :model="searchFormModel" :loading="loading" @search="handleSearch" @reset="handleRefresh">
      <template #basic>
        <el-form-item label="关键词">
          <el-input
            v-model="searchKeyword"
            placeholder="检验单号/物料名称/供应商"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="检验状态">
          <el-select v-model="statusFilter" placeholder="检验状态" clearable class="form-control-md">
            <el-option label="待检验" value="pending" />
            <el-option label="合格" value="passed" />
            <el-option label="不合格" value="failed" />
            <el-option label="部分合格" value="partial" />
          </el-select>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <el-card class="data-card">
      <!-- 检验单列表 -->
      <el-table
        :data="inspectionList"
        border
        class="w-full"
        v-loading="loading"
      >
        <template #empty>
          <EmptyState description="暂无检验单数据" />
        </template>
        <el-table-column prop="inspectionNo" label="检验单号" min-width="120" show-overflow-tooltip />
        <el-table-column prop="purchaseOrderNo" label="采购单号" min-width="110" show-overflow-tooltip />
        <el-table-column prop="itemCode" label="物料编码" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.itemCode || row.productCode || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="itemName" label="物料名称" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.itemName || row.productName || extractMaterialName(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="itemSpecs" label="产品型号" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.itemSpecs || row.productCode || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="supplierName" label="供应商" min-width="150" show-overflow-tooltip />
        <el-table-column prop="quantity" label="检验数" min-width="90" show-overflow-tooltip>
          <template #default="scope">
            {{ Math.floor(scope.row.quantity || 0) }}
          </template>
        </el-table-column>
        <el-table-column prop="qualifiedQuantity" label="合格数" min-width="90" show-overflow-tooltip>
          <template #default="scope">
            <span v-if="scope.row.qualifiedQuantity !== null && scope.row.qualifiedQuantity !== undefined" class="text-success font-weight-700">
              {{ Math.floor(scope.row.qualifiedQuantity) }}
            </span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="unqualifiedQuantity" label="不合格" min-width="70" show-overflow-tooltip>
          <template #default="scope">
            <span v-if="scope.row.unqualifiedQuantity !== null && scope.row.unqualifiedQuantity !== undefined && scope.row.unqualifiedQuantity > 0" class="text-danger font-weight-700">
              {{ Math.floor(scope.row.unqualifiedQuantity) }}
            </span>
            <span v-else-if="scope.row.unqualifiedQuantity === 0" class="text-muted">0</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="plannedDate" label="检验日期" min-width="100" show-overflow-tooltip>
          <template #default="scope">
            {{ formatDate(scope.row.actualDate || scope.row.plannedDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="inspectorName" label="检验员" min-width="70" show-overflow-tooltip />
        <el-table-column prop="status" label="检验状态" min-width="92" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="getQualityStatusColor(scope.row.status)">
              {{ getQualityStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="batchNo" label="批次号" min-width="170" show-overflow-tooltip />
        <el-table-column label="操作" fixed="right" min-width="320" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button class="btn-op-view" type="primary" size="small" @click="handleView(scope.row)">查看</el-button>
            <el-button
              v-if="scope.row.status === 'pending' && canInspect"
              size="small"
              type="primary"
              @click="handleInspect(scope.row)"
            >检验</el-button>
            <el-button
              v-if="scope.row.status === 'failed' && reworkStatusMap[scope.row.id]?.allowReinspection && canInspect"
              size="small"
              type="primary"
              @click="handleReview(scope.row)"
            >复检</el-button>
            <el-tag
              v-else-if="scope.row.status === 'failed' && !reworkStatusMap[scope.row.id]?.allowReinspection"
              type="info"
              size="small"
              effect="plain"
            >{{ getReworkHintText(scope.row.id) }}</el-tag>
            <el-button
              v-if="scope.row.status !== 'pending'"
              size="small"
              type="success"
              @click="handlePrint(scope.row)"
            >打印</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(total, 1)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- ===== 子组件弹窗 ===== -->

    <!-- 新建检验单 -->
    <CreateInspectionDialog
      v-model:visible="createDialogVisible"
      @success="fetchData"
    />

    <!-- 检验操作 -->
    <InspectDialog
      v-model:visible="inspectDialogVisible"
      :row="currentRow"
      @success="fetchData"
    />

    <!-- 复检操作 -->
    <ReviewDialog
      v-model:visible="reviewDialogVisible"
      :row="currentRow"
      @success="fetchData"
    />

    <!-- 查看详情 -->
    <DetailDialog
      v-model:visible="detailDialogVisible"
      :row="currentRow"
      @inspect="handleInspect"
    />

    <!-- 检验报告 -->
    <ReportDialog
      v-model:visible="reportDialogVisible"
      :inspection="currentReportInspection"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { qualityApi, baseDataApi } from '@/api'
import { parseListData, parsePaginatedData, parseResponseData } from '@/utils/responseParser'
import 'dayjs'
import { getQualityStatusText, getQualityStatusColor } from '@/constants/systemConstants'
import { extractMaterialNameSimple, extractSupplierNameSimple, extractMaterialSpecsSimple, fetchInspectionDetailWithItems } from '@/utils/inspectionHelpers'
import { formatDate } from '@/utils/helpers/dateUtils'
// 子组件
import CreateInspectionDialog from './components/CreateInspectionDialog.vue'
import InspectDialog from './components/InspectDialog.vue'
import ReviewDialog from './components/ReviewDialog.vue'
import DetailDialog from './components/DetailDialog.vue'
import ReportDialog from './components/ReportDialog.vue'
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
// ===== 搜索相关 =====
const authStore = useAuthStore()
const BATCH_MATERIAL_QUERY_LIMIT = 100
const chunkArray = (items, size) => {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}
const searchKeyword = ref('')

// 权限控制
const canCreate = computed(() => authStore.hasPermission('quality:inspections:create') || authStore.isAdmin)
const canInspect = computed(() => authStore.hasPermission('quality:inspections:update') || authStore.isAdmin)
const statusFilter = ref('')
const dateRange = ref([])
const searchFormModel = computed(() => ({
  keyword: searchKeyword.value,
  status: statusFilter.value,
  dateRange: dateRange.value,
}))

// ===== 表格数据相关 =====
const loading = ref(false)
const inspectionList = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

// ===== 弹窗控制 =====
const createDialogVisible = ref(false)
const inspectDialogVisible = ref(false)
const reviewDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const reportDialogVisible = ref(false)
const currentRow = ref(null)
const currentReportInspection = ref(null)

// ===== 统计数据 =====
const inspectionStats = ref({ total: 0, pending: 0, passed: 0, failed: 0, partial: 0 })

// ===== 返工状态缓存 =====
const reworkStatusMap = ref({})

// ===== 物料缓存 =====
const materialCache = ref({})

// ===== 初始化 =====
onMounted(() => { fetchData() })

// ===== 数据获取 =====
const fetchData = async () => {
  try {
    loading.value = true

    const filters = {
      page: currentPage.value,
      limit: pageSize.value,
      keyword: searchKeyword.value,
      status: statusFilter.value,
      startDate: dateRange.value?.[0],
      endDate: dateRange.value?.[1],
      include_supplier: true,
      include_reference: true,
      with_details: true,
      include_material: true
    }

    const response = await qualityApi.getIncomingInspections(filters)
    const { list, total: totalCount } = parsePaginatedData(response)

    if (list.length > 0 || totalCount >= 0) {
      // 后端已输出 camel；仅补展示别名
      inspectionList.value = list.map((item) => ({
        ...item,
        purchaseOrderNo: item.referenceNo || item.purchaseOrderNo,
        materialName: item.itemName || item.productName || extractMaterialName(item),
        specs: item.itemSpecs || extractMaterialSpecsSimple(item),
        supplierName: item.supplierName || extractSupplierNameSimple(item),
        inspectionDate: item.actualDate || item.plannedDate,
        inspector: item.inspectorName || '-'
      }))
      total.value = totalCount

      // 异步加载缺失的物料信息
      asyncLoadMaterialInfo()
    }

    calculateInspectionStats()
    await fetchReworkStatusForFailedInspections()
  } catch (error) {
    console.error('获取检验单列表失败:', error)
    ElMessage.error(`获取检验单列表失败: ${error.message}`)
  } finally {
    loading.value = false
  }
}

// ===== 异步物料信息加载 =====
const applyMaterialInfoToList = (materialId, info) => {
  if (!materialId || !info) return

  inspectionList.value.forEach(item => {
    if (String(item.materialId) === String(materialId)) {
      const materialName = info.name || info.materialName
      const specs = info.specs || info.specification
      if (materialName) item.materialName = materialName
      if (specs && (!item.specs || item.specs === '-')) item.specs = specs
    }
  })
}

const asyncLoadMaterialInfo = () => {
  setTimeout(async () => {
    const itemsNeedInfo = inspectionList.value.filter(item =>
      item.materialId && (!item.materialName || item.materialName === '-' ||
        item.materialName.startsWith('物料 ') || item.materialName.includes('采购单') ||
        item.materialName.includes('PO') || !item.specs)
    )

    if (itemsNeedInfo.length === 0) return

    const materialIds = [...new Set(itemsNeedInfo.map(i => i.materialId).filter(Boolean))]
    const missingMaterialIds = materialIds.filter(materialId => !materialCache.value[materialId])

    try {
      if (missingMaterialIds.length > 0) {
        const materials = []
        for (const chunk of chunkArray(missingMaterialIds, BATCH_MATERIAL_QUERY_LIMIT)) {
          const response = await baseDataApi.getMaterialsByIds(chunk)
          materials.push(...parseListData(response, { enableLog: false }))
        }
        materials.forEach(material => {
          if (!material?.id) return
          materialCache.value[material.id] = {
            ...material,
            name: material.name || material.materialName,
            specs: material.specs || material.specification
          }
        })
      }

      materialIds.forEach(materialId => {
        applyMaterialInfoToList(materialId, materialCache.value[materialId])
      })
    } catch (error) {
      console.error('批量加载物料信息失败:', error)
    }
  }, 100)
}

// ===== 物料名称提取 =====
const extractMaterialName = (item) => {
  if (!item) return '未知物料'
  const name = extractMaterialNameSimple(item)
  if (name !== '未知物料') return name

  const materialId = item.materialId
  if (materialId && materialCache.value[materialId]) {
    return materialCache.value[materialId].name || '未知物料'
  }
  return '未知物料'
}

// ===== 统计数据 =====
const calculateInspectionStats = async () => {
  try {
    const response = await qualityApi.getIncomingInspectionStats()
    const data = parseResponseData(response, {})
    const pending = Number(data.pending) || 0
    const passed = Number(data.passed) || 0
    const failed = Number(data.failed) || 0
    const partial = Number(data.partial) || 0
    inspectionStats.value = {
      total: Number(data.total) || pending + passed + failed + partial,
      pending,
      passed,
      failed,
      partial
    }
  } catch (err) {
    console.error('获取统计数据失败:', err)
    const stats = { total: total.value, pending: 0, passed: 0, failed: 0, partial: 0 }
    inspectionList.value.forEach(item => {
      if (item.status === 'pending') stats.pending++
      else if (item.status === 'passed') stats.passed++
      else if (item.status === 'failed') stats.failed++
      else if (item.status === 'partial') stats.partial++
    })
    inspectionStats.value = stats
  }
}

// ===== 返工状态 =====
const fetchReworkStatusForFailedInspections = async () => {
  const failedItems = inspectionList.value.filter(row => row.status === 'failed')
  if (failedItems.length === 0) return

  try {
    const res = await qualityApi.getReworkStatusByInspectionIds(failedItems.map(row => row.id))
    const data = parseResponseData(res, {})
    failedItems.forEach(row => {
      reworkStatusMap.value[row.id] = data[row.id] || { allow_reinspection: false }
    })
  } catch {
    failedItems.forEach(row => {
      reworkStatusMap.value[row.id] = { allow_reinspection: false }
    })
  }
}

const getReworkHintText = (inspectionId) => {
  const status = reworkStatusMap.value[inspectionId]
  if (!status) return '查询中...'
  if (!status.hasNcp) return '待处置'
  if (!status.hasRework && status.disposition === 'rework') return '待返工'
  if (!status.hasRework) return status.disposition === 'scrap' ? '已报废' : '待处理'
  if (status.reworkStatus === 'pending') return '返工待分配'
  if (status.reworkStatus === 'in_progress') return '返工中'
  return '返工中'
}

// ===== 辅助函数 =====
// formatDate 已统一引用公共实现

// ===== 搜索/分页操作 =====
const handleSearch = () => { currentPage.value = 1; fetchData() }
const handleRefresh = () => { searchKeyword.value = ''; statusFilter.value = ''; dateRange.value = []; currentPage.value = 1; fetchData() }
const handleSizeChange = (val) => { pageSize.value = val; fetchData() }
const handleCurrentChange = (val) => { currentPage.value = val; fetchData() }

// ===== 弹窗操作 =====
const handleView = (row) => { currentRow.value = row; detailDialogVisible.value = true }
const handleInspect = (row) => { currentRow.value = row; inspectDialogVisible.value = true }
const handleReview = (row) => { currentRow.value = row; reviewDialogVisible.value = true }

const handlePrint = async (row) => {
  try {
    currentReportInspection.value = await fetchInspectionDetailWithItems(
      row.id, row, extractMaterialName, extractMaterialSpecsSimple, extractSupplierNameSimple
    )
    reportDialogVisible.value = true
  } catch (error) {
    console.error('获取检验报告数据失败:', error)
    ElMessage.error(`获取检验报告数据失败: ${error.message}`)
  }
}
</script>

<style scoped>
.search-container { margin-bottom: var(--spacing-base); }
.search-buttons { display: flex; gap: 8px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }

.el-dropdown { vertical-align: middle; display: inline-flex; }
.el-button { display: inline-flex; align-items: center; }

:deep(.el-table__cell) { overflow: hidden; text-overflow: ellipsis; }
</style>
