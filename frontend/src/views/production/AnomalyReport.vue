<template>
  <div class="module-page page-container">
    <PageHeader title="异常上报 (Andon)" subtitle="装配异常快速上报与跟踪处理">
      <template #actions>
<el-button type="primary" v-permission="'production:anomaly:create'" @click="openForm()">上报异常</el-button>
      </template>
    </PageHeader>

    <!-- 统计卡片 -->
    <el-row :gutter="12" class="mb-md">
      <el-col :span="6" v-for="(item, key) in statsConfig" :key="key">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value" :class="item.colorClass">{{ stats[key] || 0 }}</div>
          <div class="stat-label">{{ item.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="data-card">
      <div class="filter-bar mb-md">
        <el-row :gutter="12">
          <el-col :span="5">
            <el-input v-model="filters.keyword" placeholder="搜索标题/编号" clearable @clear="fetchData" @keyup.enter="fetchData" />
          </el-col>
          <el-col :span="4">
            <el-select v-model="filters.status" placeholder="状态" clearable @change="fetchData" class="w-full">
              <el-option label="待处理" value="open" />
              <el-option label="处理中" value="processing" />
              <el-option label="已解决" value="resolved" />
              <el-option label="已关闭" value="closed" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-select v-model="filters.severity" placeholder="严重程度" clearable @change="fetchData" class="w-full">
              <el-option label="低" value="low" />
              <el-option label="中" value="medium" />
              <el-option label="高" value="high" />
              <el-option label="紧急" value="critical" />
            </el-select>
          </el-col>
          <el-col :span="2"><el-button @click="fetchData">查询</el-button></el-col>
        </el-row>
      </div>

      <el-table :data="tableData" v-loading="loading" border stripe>
        <el-table-column prop="code" label="编号" width="160" />
        <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
        <el-table-column prop="category" label="类别" width="100">
          <template #default="{ row }"><el-tag size="small" type="info">{{ categoryLabel[row.category] }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="severity" label="严重程度" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="severityTag[row.severity]">{{ severityLabel[row.severity] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTag[row.status]">{{ statusLabel[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reporterName" label="上报人" width="100" />
        <el-table-column prop="location" label="位置" width="100" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="上报时间" width="160" />
        <el-table-column label="操作" min-width="280" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-button class="btn-op-view" type="primary" size="small" @click="viewDetail(row)">
              <el-icon><View /></el-icon> 详情
            </el-button>
            <el-button type="warning" size="small" v-if="row.status === 'open'" v-permission="'production:anomaly:update'" @click="handleAssign(row)">
              <el-icon><User /></el-icon> 指派
            </el-button>
            <el-button type="success" size="small" v-if="row.status === 'processing'" v-permission="'production:anomaly:update'" @click="handleResolve(row)">
              <el-icon><Check /></el-icon> 解决
            </el-button>
            <el-button type="info" size="small" v-if="row.status === 'resolved'" v-permission="'production:anomaly:update'" @click="handleClose(row.id)">
              <el-icon><CircleClose /></el-icon> 关闭
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" layout="total, prev, pager, next" @change="fetchData" />
      </div>
    </el-card>

    <!-- 上报对话框 -->
    <AppDialog
      v-model="formVis"
      title="上报异常"
      mode="form"
      width="600px"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="标题" required><el-input v-model="form.title" placeholder="简要描述异常" /></el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="类别" required>
              <el-select v-model="form.category" class="w-full">
                <el-option v-for="(label, key) in categoryLabel" :key="key" :label="label" :value="key" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="严重程度" required>
              <el-select v-model="form.severity" class="w-full">
                <el-option v-for="(label, key) in severityLabel" :key="key" :label="label" :value="key" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="位置"><el-input v-model="form.location" placeholder="发生位置/工位" /></el-form-item>
        <el-form-item label="描述" required><el-input v-model="form.description" type="textarea" :rows="4" placeholder="详细描述异常情况" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVis = false">取消</el-button>
        <el-button type="primary" v-permission="'production:anomaly:create'" @click="submitReport" :loading="saving">提交</el-button>
      </template>
        </AppDialog>

    <!-- 详情/解决对话框 -->
    <AppDialog
      v-model="detailVis"
      :title="detailMode === 'resolve' ? '解决异常' : '异常详情'"
      :mode="detailMode === 'resolve' ? 'form' : 'view'"
      width="650px"
      content-width="wide"
    >
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="编号">{{ detail.code }}</el-descriptions-item>
          <el-descriptions-item label="状态"><el-tag :type="statusTag[detail.status]" size="small">{{ statusLabel[detail.status] }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="标题" :span="2">{{ detail.title }}</el-descriptions-item>
          <el-descriptions-item label="类别">{{ categoryLabel[detail.category] }}</el-descriptions-item>
          <el-descriptions-item label="严重程度"><el-tag :type="severityTag[detail.severity]" size="small">{{ severityLabel[detail.severity] }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="上报人">{{ detail.reporterName }}</el-descriptions-item>
          <el-descriptions-item label="位置">{{ detail.location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ detail.description }}</el-descriptions-item>
          <el-descriptions-item label="处理人">{{ detail.assigneeName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="解决方案" :span="2" v-if="detail.resolution">{{ detail.resolution }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="detailMode === 'resolve'" class="mt-md">
          <el-input v-model="resolution" type="textarea" :rows="3" placeholder="请输入解决方案" />
        </div>
      </template>
      <template #footer v-if="detailMode === 'resolve'">
        <el-button @click="detailVis = false">取消</el-button>
        <el-button type="primary" v-permission="'production:anomaly:update'" @click="submitResolve" :loading="saving">确认解决</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { View, User, Check, CircleClose } from '@element-plus/icons-vue'
import { anomalyReportApi } from '@/api/productionAssist'

const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const tableData = ref([])
const formVis = ref(false)
const detailVis = ref(false)
const detailMode = ref('view')
const detail = ref(null)
const resolution = ref('')
const stats = ref({})

const filters = ref({ keyword: '', status: '', severity: '' })

const form = ref({
  title: '', category: 'quality', severity: 'medium', location: '', description: '',
})

const categoryLabel = { quality: '质量', equipment: '设备', material: '物料', safety: '安全', process: '工艺', other: '其他' }
const severityLabel = { low: '低', medium: '中', high: '高', critical: '紧急' }
const severityTag = { low: 'info', medium: 'warning', high: 'danger', critical: 'danger' }
const statusLabel = { open: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' }
const statusTag = { open: 'danger', processing: 'warning', resolved: 'success', closed: 'info' }
const statsConfig = {
  open: { label: '待处理', colorClass: 'text-warning' },
  processing: { label: '处理中', colorClass: 'text-primary' },
  resolved: { label: '已解决', colorClass: 'text-success' },
  closed: { label: '已关闭', colorClass: 'text-muted' },
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await anomalyReportApi.getList({ page: page.value, pageSize: pageSize.value, ...filters.value })
    const data = res.data || res
    tableData.value = data.list || []
    total.value = data.total || 0
  } catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

const fetchStats = async () => {
  try {
    const res = await anomalyReportApi.getStats()
    stats.value = res.data || res || {}
  } catch { /* silent */ }
}

const openForm = () => {
  form.value = { title: '', category: 'quality', severity: 'medium', location: '', description: '' }
  formVis.value = true
}

const submitReport = async () => {
  if (!form.value.title?.trim()) return ElMessage.warning('请填写标题')
  if (!form.value.description?.trim()) return ElMessage.warning('请填写描述')
  saving.value = true
  try {
    await anomalyReportApi.create(form.value)
    ElMessage.success('上报成功')
    formVis.value = false
    fetchData()
    fetchStats()
  } catch (err) { ElMessage.error(err.response?.data?.message || '上报失败') }
  finally { saving.value = false }
}

const viewDetail = (row) => {
  detail.value = row
  detailMode.value = 'view'
  detailVis.value = true
}

const handleAssign = async (row) => {
  const { value } = await ElMessageBox.prompt('请输入处理人用户ID', '指派处理', { inputPattern: /^\d+$/, inputErrorMessage: '请输入数字ID' })
  try {
    await anomalyReportApi.assign(row.id, { assigned_to: Number(value) })
    ElMessage.success('指派成功')
    fetchData()
  } catch { ElMessage.error('指派失败') }
}

const handleResolve = (row) => {
  detail.value = row
  detailMode.value = 'resolve'
  resolution.value = ''
  detailVis.value = true
}

const submitResolve = async () => {
  if (!resolution.value?.trim()) return ElMessage.warning('请输入解决方案')
  saving.value = true
  try {
    await anomalyReportApi.resolve(detail.value.id, { resolution: resolution.value })
    ElMessage.success('已解决')
    detailVis.value = false
    fetchData()
    fetchStats()
  } catch { ElMessage.error('操作失败') }
  finally { saving.value = false }
}

const handleClose = async (id) => {
  try {
    await anomalyReportApi.close(id)
    ElMessage.success('已关闭')
    fetchData()
    fetchStats()
  } catch { ElMessage.error('操作失败') }
}

onMounted(() => { fetchData(); fetchStats() })
</script>

<style scoped>
.stat-value { font-size: 28px; font-weight: 700; }
.stat-label { font-size: 13px; color: var(--color-text-secondary, var(--color-text-secondary)); margin-top: 4px; }
</style>
