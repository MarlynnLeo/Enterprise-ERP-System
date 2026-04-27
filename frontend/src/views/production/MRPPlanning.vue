<template>
  <div class="page-container">
    <!-- 页面头部卡片 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>MRP 物料需求计划</h2>
          <p class="subtitle">汇总全部未完成订单与生产计划，计算全局物料净需求并生成采购/生产建议</p>
        </div>
        <el-button type="primary" @click="openRunForm">新建运算</el-button>
      </div>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="runList" v-loading="loading" border stripe>
      <el-table-column prop="run_code" label="运算编号" width="160" />
      <el-table-column prop="name" label="名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTag[row.status] || 'info'" size="small">{{ statusLabel[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="plan_start_date" label="计划开始" width="110" />
      <el-table-column prop="plan_end_date" label="计划结束" width="110" />
      <el-table-column prop="total_materials" label="物料数" width="80" align="center" />
      <el-table-column prop="total_suggestions" label="建议数" width="80" align="center" />
      <el-table-column prop="created_by_name" label="创建人" width="100" />
      <el-table-column prop="created_at" label="创建时间" width="160" />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="viewRun(row)">查看结果</el-button>
        </template>
      </el-table-column>
      </el-table>
      <div class="pagination-container">
        <el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" @change="fetchRuns" />
      </div>
    </el-card>

    <!-- 新建运算 -->
    <el-dialog v-model="formVis" title="新建 MRP 运算" width="500px">
      <el-form :model="runForm" label-width="100px">
        <el-form-item label="运算名称"><el-input v-model="runForm.name" placeholder="可选，自动生成" /></el-form-item>
        <el-form-item label="计划开始" required>
          <el-date-picker v-model="runForm.plan_start_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="计划结束" required>
          <el-date-picker v-model="runForm.plan_end_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVis = false">取消</el-button>
        <el-button type="primary" @click="startRun" :loading="saving">开始运算</el-button>
      </template>
    </el-dialog>

    <!-- 运算结果 -->
    <el-dialog v-model="resultVis" title="MRP 运算结果" width="1100px" destroy-on-close>
      <template v-if="runDetail">
        <el-descriptions :column="4" border size="small" style="margin-bottom:12px">
          <el-descriptions-item label="编号">{{ runDetail.run_code }}</el-descriptions-item>
          <el-descriptions-item label="状态"><el-tag :type="statusTag[runDetail.status] || 'info'">{{ statusLabel[runDetail.status] || runDetail.status }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="物料数">{{ runDetail.total_materials }}</el-descriptions-item>
          <el-descriptions-item label="建议数">{{ runDetail.total_suggestions }}</el-descriptions-item>
        </el-descriptions>

        <div style="margin-bottom:8px">
          <el-button type="primary" size="small" :disabled="!selectedIds.length" @click="batchConfirm">批量确认 ({{ selectedIds.length }})</el-button>
          <el-button type="success" size="small" :disabled="!confirmedIds.length" @click="convertSuggestions">转化为采购/生产单 ({{ confirmedIds.length }})</el-button>
        </div>

        <el-table :data="runDetail.results || []" border size="small" max-height="500" @selection-change="onSelect">
          <el-table-column type="selection" width="40" />
          <el-table-column prop="material_code" label="物料编码" width="120" />
          <el-table-column prop="material_name" label="物料名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="gross_requirement" label="毛需求" width="90" align="right" />
          <el-table-column prop="on_hand_stock" label="现有库存" width="90" align="right" />
          <el-table-column prop="safety_stock" label="安全库存" width="90" align="right" />
          <el-table-column prop="scheduled_receipts" label="在途" width="80" align="right" />
          <el-table-column prop="net_requirement" label="净需求" width="90" align="right">
            <template #default="{ row }"><span style="color:var(--color-danger);font-weight:bold">{{ row.net_requirement }}</span></template>
          </el-table-column>
          <el-table-column prop="suggestion_type" label="建议" width="80">
            <template #default="{ row }">
              <el-tag :type="row.suggestion_type === 'purchase' ? 'warning' : 'success'" size="small">{{ row.suggestion_type === 'purchase' ? '采购' : '生产' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="planned_order_date" label="计划日期" width="110" />
          <el-table-column prop="suggestion_status" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="sugStatusTag[row.suggestion_status] || 'info'" size="small">{{ sugStatusLabel[row.suggestion_status] || row.suggestion_status }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { mrpApi } from '@/api/mrp'

const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const total = ref(0)
const runList = ref([])
const formVis = ref(false)
const runForm = ref({})
const resultVis = ref(false)
const runDetail = ref(null)
const selectedIds = ref([])

const statusLabel = { draft:'草稿', running:'运算中', completed:'已完成', failed:'失败', cancelled:'已取消' }
const statusTag = { draft:'info', running:'warning', completed:'success', failed:'danger', cancelled:'info' }
const sugStatusLabel = { pending:'待处理', confirmed:'已确认', converted:'已转化', ignored:'已忽略' }
const sugStatusTag = { pending:'warning', confirmed:'success', converted:'primary', ignored:'info' }

const fetchRuns = async () => {
  loading.value = true
  try {
    const res = await mrpApi.getRunList({ page: page.value, pageSize: 20 })
    const d = res.data || res
    runList.value = d.list || []
    total.value = d.total || 0
  } catch { ElMessage.error('获取MRP列表失败') }
  finally { loading.value = false }
}

const openRunForm = () => { runForm.value = { name: '', plan_start_date: '', plan_end_date: '' }; formVis.value = true }

const startRun = async () => {
  if (!runForm.value.plan_start_date || !runForm.value.plan_end_date) return ElMessage.warning('请选择计划日期')
  saving.value = true
  try {
    await mrpApi.createAndRun(runForm.value)
    ElMessage.success('MRP运算已启动')
    formVis.value = false
    fetchRuns()
  } catch (e) { ElMessage.error(e.message || '启动失败') }
  finally { saving.value = false }
}

const viewRun = async (row) => {
  try {
    const res = await mrpApi.getRunById(row.id)
    runDetail.value = res.data || res
    selectedIds.value = []
    confirmedIds.value = []
    resultVis.value = true
  } catch { ElMessage.error('获取结果失败') }
}

const confirmedIds = ref([])
const onSelect = (rows) => {
  selectedIds.value = rows.filter(r => r.suggestion_status === 'pending').map(r => r.id)
  confirmedIds.value = rows.filter(r => r.suggestion_status === 'confirmed').map(r => r.id)
}

const batchConfirm = async () => {
  try {
    await mrpApi.batchConfirm(selectedIds.value)
    ElMessage.success('批量确认成功')
    viewRun(runDetail.value)
  } catch { ElMessage.error('操作失败') }
}

const convertSuggestions = async () => {
  try {
    const res = await mrpApi.convertSuggestions(confirmedIds.value)
    const d = res.data || res
    let msg = '转化成功！'
    if (d.purchaseRequisitionId) msg += ` 生成采购请购单1份`
    if (d.productionPlanIds?.length) msg += ` 生成生产计划${d.productionPlanIds.length}份`
    ElMessage.success(msg)
    viewRun(runDetail.value)
  } catch (e) { ElMessage.error(e.message || '转化失败') }
}

onMounted(fetchRuns)
</script>

<style scoped>
/* 页面专属样式已由 common-styles.css 统一提供 */
</style>
