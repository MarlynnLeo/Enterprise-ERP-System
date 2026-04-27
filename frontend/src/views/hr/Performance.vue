<!--
/**
 * Performance.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="page-container">
    <!-- 页面头部卡片 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>绩效管理</h2>
          <p class="subtitle">管理 KPI 指标库、考核周期与员工绩效评估</p>
        </div>
        <div class="operation-btns">
          <el-radio-group v-model="activeTab" @change="onTabChange">
            <el-radio-button value="indicators">KPI指标库</el-radio-button>
            <el-radio-button value="periods">考核周期</el-radio-button>
            <el-radio-button value="evaluations">绩效评估</el-radio-button>
          </el-radio-group>
          <el-button v-if="activeTab === 'indicators'" type="primary" @click="openIndicatorForm()">新建指标</el-button>
          <el-button v-if="activeTab === 'periods'" type="primary" @click="openPeriodForm()">新建周期</el-button>
          <el-button v-if="activeTab === 'evaluations'" type="primary" @click="openEvalForm()">发起评估</el-button>
        </div>
      </div>
    </el-card>

    <!-- 数据卡片 -->
    <el-card class="data-card">
      <!-- KPI 指标库 -->
      <template v-if="activeTab === 'indicators'">
        <el-table :data="tableData" v-loading="loading" border stripe>
          <el-table-column prop="code" label="编码" width="120" />
          <el-table-column prop="name" label="指标名称" min-width="180" />
          <el-table-column prop="category" label="分类" width="100">
            <template #default="{ row }">{{ catLabel[row.category] || row.category }}</template>
          </el-table-column>
          <el-table-column prop="weight" label="权重(%)" width="90" align="center" />
          <el-table-column prop="target_value" label="目标值" width="100" align="center" />
          <el-table-column prop="scoring_method" label="评分方式" width="100">
            <template #default="{ row }">{{ row.scoring_method === 'manual' ? '手动' : row.scoring_method === 'auto' ? '自动' : '公式' }}</template>
          </el-table-column>
          <el-table-column prop="is_active" label="状态" width="80">
            <template #default="{ row }"><el-tag :type="row.is_active ? 'success' : 'info'" size="small">{{ row.is_active ? '启用' : '停用' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="140">
            <template #default="{ row }">
              <el-button link type="primary" @click="openIndicatorForm(row)">编辑</el-button>
              <el-popconfirm title="确定删除？" @confirm="delIndicator(row.id)">
                <template #reference><el-button link type="danger">删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 考核周期 -->
      <template v-if="activeTab === 'periods'">
        <el-table :data="tableData" v-loading="loading" border stripe>
          <el-table-column prop="name" label="周期名称" min-width="200" />
          <el-table-column prop="type" label="类型" width="100">
            <template #default="{ row }">{{ periodTypeLabel[row.type] }}</template>
          </el-table-column>
          <el-table-column prop="start_date" label="开始日期" width="120" />
          <el-table-column prop="end_date" label="结束日期" width="120" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="periodStatusTag[row.status]" size="small">{{ periodStatusLabel[row.status] }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button v-if="row.status === 'draft'" link type="primary" @click="updatePeriodStatus(row.id, 'in_progress')">开始</el-button>
              <el-button v-if="row.status === 'in_progress'" link type="success" @click="updatePeriodStatus(row.id, 'scoring')">评分</el-button>
              <el-button v-if="row.status === 'scoring'" link type="warning" @click="updatePeriodStatus(row.id, 'completed')">完成</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 绩效评估 -->
      <template v-if="activeTab === 'evaluations'">
        <el-table :data="tableData" v-loading="loading" border stripe>
          <el-table-column prop="employee_name" label="员工" width="120" />
          <el-table-column prop="period_name" label="考核周期" min-width="180" />
          <el-table-column prop="total_score" label="总分" width="80" align="center">
            <template #default="{ row }"><span :style="{ color: row.total_score >= 80 ? 'var(--color-success)' : row.total_score >= 60 ? 'var(--color-warning)' : 'var(--color-danger)', fontWeight: 'bold' }">{{ row.total_score || '--' }}</span></template>
          </el-table-column>
          <el-table-column prop="grade" label="等级" width="60" align="center">
            <template #default="{ row }"><el-tag v-if="row.grade" :type="gradeTag[row.grade] || 'info'" size="small">{{ row.grade }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }"><el-tag :type="evalStatusTag[row.status] || 'info'" size="small">{{ evalStatusLabel[row.status] || row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="evaluator_name" label="考核人" width="100" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button link type="primary" @click="viewEval(row)">{{ row.status === 'completed' ? '查看' : '评分' }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <div class="pagination-container">
        <el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" @change="fetchData" />
      </div>
    </el-card>

    <!-- 指标表单 -->
    <el-dialog v-model="indicatorVis" :title="indicatorForm.id ? '编辑指标' : '新建指标'" width="500px">
      <el-form :model="indicatorForm" label-width="90px">
        <el-form-item label="编码" required><el-input v-model="indicatorForm.code" :disabled="!!indicatorForm.id" /></el-form-item>
        <el-form-item label="名称" required><el-input v-model="indicatorForm.name" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="indicatorForm.category" style="width:100%">
            <el-option v-for="(l,k) in catLabel" :key="k" :label="l" :value="k" />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="权重(%)"><el-input-number v-model="indicatorForm.weight" :min="0" :max="100" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="目标值"><el-input-number v-model="indicatorForm.target_value" style="width:100%" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="描述"><el-input v-model="indicatorForm.description" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="indicatorVis = false">取消</el-button>
        <el-button type="primary" @click="saveIndicator" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 周期表单 -->
    <el-dialog v-model="periodVis" title="新建考核周期" width="500px">
      <el-form :model="periodForm" label-width="90px">
        <el-form-item label="名称" required><el-input v-model="periodForm.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="periodForm.type" style="width:100%">
            <el-option v-for="(l,k) in periodTypeLabel" :key="k" :label="l" :value="k" />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="开始日期" required><el-date-picker v-model="periodForm.start_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="结束日期" required><el-date-picker v-model="periodForm.end_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="periodVis = false">取消</el-button>
        <el-button type="primary" @click="savePeriod" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceApi } from '@/api/enhanced'

const activeTab = ref('indicators')
const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const total = ref(0)
const tableData = ref([])

const indicatorVis = ref(false)
const indicatorForm = ref({})
const periodVis = ref(false)
const periodForm = ref({})

const catLabel = { work_quality:'工作质量', work_quantity:'工作数量', work_attitude:'工作态度', skill:'技能', other:'其他' }
const periodTypeLabel = { monthly:'月度', quarterly:'季度', semi_annual:'半年度', annual:'年度' }
const periodStatusLabel = { draft:'草稿', in_progress:'进行中', scoring:'评分中', completed:'已完成', archived:'已归档' }
const periodStatusTag = { draft:'info', in_progress:'primary', scoring:'warning', completed:'success', archived:'info' }
const evalStatusLabel = { draft:'草稿', self_evaluation:'自评中', manager_scoring:'上级评分', completed:'已完成' }
const evalStatusTag = { draft:'info', self_evaluation:'warning', manager_scoring:'primary', completed:'success' }
const gradeTag = { S:'danger', A:'success', B:'primary', C:'warning', D:'info' }

const fetchData = async () => {
  loading.value = true
  try {
    let res
    if (activeTab.value === 'indicators') res = await performanceApi.getIndicators({ page: page.value, pageSize: 20 })
    else if (activeTab.value === 'periods') { res = await performanceApi.getPeriods(); res = { data: { list: res.data || res, total: (res.data || res).length } } }
    else res = await performanceApi.getEvaluations({ page: page.value, pageSize: 20 })
    const d = res.data || res
    tableData.value = d.list || d || []
    total.value = d.total || tableData.value.length
  } catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

const onTabChange = () => { page.value = 1; fetchData() }
const openIndicatorForm = (row) => { indicatorForm.value = row ? { ...row } : { code:'', name:'', category:'other', weight:0, target_value:null, scoring_method:'manual' }; indicatorVis.value = true }
const openPeriodForm = () => { periodForm.value = { name:'', type:'quarterly', start_date:'', end_date:'' }; periodVis.value = true }
const openEvalForm = () => { ElMessage.info('请在考核周期中发起评估') }

const saveIndicator = async () => {
  saving.value = true
  try {
    if (indicatorForm.value.id) await performanceApi.updateIndicator(indicatorForm.value.id, indicatorForm.value)
    else await performanceApi.createIndicator(indicatorForm.value)
    ElMessage.success('保存成功'); indicatorVis.value = false; fetchData()
  } catch (e) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

const delIndicator = async (id) => {
  try { await performanceApi.deleteIndicator(id); ElMessage.success('已删除'); fetchData() }
  catch { ElMessage.error('删除失败') }
}

const savePeriod = async () => {
  saving.value = true
  try { await performanceApi.createPeriod(periodForm.value); ElMessage.success('创建成功'); periodVis.value = false; fetchData() }
  catch (e) { ElMessage.error(e.message || '创建失败') }
  finally { saving.value = false }
}

const updatePeriodStatus = async (id, status) => {
  try { await performanceApi.updatePeriodStatus(id, status); ElMessage.success('状态已更新'); fetchData() }
  catch { ElMessage.error('操作失败') }
}

const viewEval = async (row) => {
  try {
    const res = await performanceApi.getEvaluationById(row.id)
    ElMessage.info('评估详情: ' + JSON.stringify((res.data || res).total_score))
  } catch { ElMessage.error('获取详情失败') }
}

onMounted(fetchData)
</script>

<style scoped>
/* 页面专属样式已由 common-styles.css 统一提供 */
</style>