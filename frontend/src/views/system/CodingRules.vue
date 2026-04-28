<template>
  <div class="page-container">
    <!-- 页面头部卡片 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>编码规则管理</h2>
          <p class="subtitle">配置各业务单据的自动编号规则，支持前缀、日期、流水号组合</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="openForm()">新增规则</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="搜索">
          <el-input v-model="keyword" placeholder="业务类型/名称/前缀" clearable @keyup.enter="filterList">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item label="重置周期">
          <el-select v-model="filterCycle" placeholder="全部" clearable @change="filterList">
            <el-option v-for="(l,k) in cycleLabel" :key="k" :label="l" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-tag type="info" size="small">共 {{ filteredData.length }} 条</el-tag>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="filteredData" v-loading="loading" border stripe
        :row-class-name="({row}) => row.is_active ? '' : 'row-disabled'"
        style="width:100%">
        <el-table-column prop="business_type" label="业务类型" width="180" sortable>
          <template #default="{ row }">
            <span class="code-text">{{ row.business_type }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="规则名称" min-width="130" />
        <el-table-column label="编码规则" min-width="200">
          <template #default="{ row }">
            <div class="rule-pattern">
              <el-tag v-if="row.prefix" size="small" type="primary" class="rule-tag">{{ row.prefix }}</el-tag>
              <span v-if="row.prefix && (row.date_format || true)" class="rule-sep">{{ row.separator || '' }}</span>
              <el-tag v-if="row.date_format" size="small" type="warning" class="rule-tag">{{ row.date_format }}</el-tag>
              <span v-if="row.date_format" class="rule-sep">{{ row.separator || '' }}</span>
              <el-tag size="small" type="info" class="rule-tag">{{ '0'.repeat(row.sequence_length || 4) }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="reset_cycle" label="重置周期" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="cycleType[row.reset_cycle]" size="small" effect="plain">{{ cycleLabel[row.reset_cycle] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下一个编号" width="200">
          <template #default="{ row }">
            <span class="preview-code">{{ row._preview || '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="is_active" label="状态" width="75" align="center">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'danger'" size="small" effect="dark">{{ row.is_active ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="140" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openForm(row)">编辑</el-button>
            <el-button link type="warning" @click="openSequences(row)">序列</el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="formVis" :title="form.id ? '编辑编码规则' : '新增编码规则'" width="600px" destroy-on-close>
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="业务类型" prop="business_type">
          <el-input v-model="form.business_type" :disabled="!!form.id" placeholder="如 purchase_order" />
        </el-form-item>
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="form.name" placeholder="如 采购订单" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="前缀" prop="prefix">
              <el-input v-model="form.prefix" placeholder="PO" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="日期格式">
              <el-select v-model="form.date_format" style="width:100%" clearable placeholder="选择格式">
                <el-option label="无" value="" />
                <el-option label="YYMMDD" value="YYMMDD" />
                <el-option label="YYMM" value="YYMM" />
                <el-option label="YYYYMMDD" value="YYYYMMDD" />
                <el-option label="YYYYMM" value="YYYYMM" />
                <el-option label="YYYY" value="YYYY" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="分隔符">
              <el-select v-model="form.separator" style="width:100%">
                <el-option label="无" value="" />
                <el-option label="-" value="-" />
                <el-option label="_" value="_" />
                <el-option label="/" value="/" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="6">
            <el-form-item label="流水号位数">
              <el-input-number v-model="form.sequence_length" :min="1" :max="10" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="重置周期">
              <el-select v-model="form.reset_cycle" style="width:100%">
                <el-option v-for="(l,k) in cycleLabel" :key="k" :label="l" :value="k" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="起始值">
              <el-input-number v-model="form.initial_value" :min="0" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="步长">
              <el-input-number v-model="form.step" :min="1" :max="100" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="规则用途说明（选填）" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.is_active" :active-value="1" :inactive-value="0" />
        </el-form-item>

        <!-- 实时预览 -->
        <el-form-item label="编号预览">
          <div class="live-preview">
            <span class="preview-code large">{{ livePreview }}</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVis = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 序列详情抽屉 -->
    <el-drawer v-model="seqVis" :title="`序列详情 — ${seqType}`" size="450px">
      <div v-if="seqLoading" v-loading="true" style="height:100px" />
      <template v-else>
        <el-empty v-if="!sequences.length" description="暂无序列记录" />
        <el-descriptions v-for="s in sequences" :key="s.id" :column="1" border size="small" class="seq-item">
          <el-descriptions-item label="周期键">
            <span class="code-text">{{ s.period_key }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="当前值">
            <span style="font-size:18px;font-weight:bold;color:#409EFF">{{ s.current_value }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ s.updated_at }}</el-descriptions-item>
        </el-descriptions>
        <div style="margin-top:16px;text-align:center">
          <el-popconfirm title="确定重置该业务类型的所有序列？此操作不可撤销！" confirm-button-text="确认重置"
            cancel-button-text="取消" @confirm="handleResetSeq">
            <template #reference>
              <el-button type="danger" size="small">重置全部序列</el-button>
            </template>
          </el-popconfirm>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { codingRuleApi } from '@/api/enhanced'
import dayjs from 'dayjs'

const loading = ref(false)
const saving = ref(false)
const tableData = ref([])
const formVis = ref(false)
const formRef = ref()
const form = ref({})
const keyword = ref('')
const filterCycle = ref('')

const cycleLabel = { none: '不重置', daily: '每日', monthly: '每月', yearly: '每年' }
const cycleType = { none: 'info', daily: 'primary', monthly: 'warning', yearly: 'success' }

const formRules = {
  business_type: [{ required: true, message: '请输入业务类型', trigger: 'blur' }],
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  prefix: [{ required: true, message: '请输入前缀', trigger: 'blur' }],
}

// 筛选后的数据
const filteredData = computed(() => {
  let list = tableData.value
  if (keyword.value) {
    const kw = keyword.value.toLowerCase()
    list = list.filter(r =>
      (r.business_type || '').toLowerCase().includes(kw) ||
      (r.name || '').toLowerCase().includes(kw) ||
      (r.prefix || '').toLowerCase().includes(kw)
    )
  }
  if (filterCycle.value) {
    list = list.filter(r => r.reset_cycle === filterCycle.value)
  }
  return list
})

// 实时预览
// 将编码规则中的日期格式转为 dayjs 兼容 token（YYMMDD → YYMMDDformat: 需要映射 YY→YY 但 dayjs 用小写 yy）
const dayjsFormatMap = { YYMMDD: 'YYMMDD', YYMM: 'YYMM', YYYYMMDD: 'YYYYMMDD', YYYYMM: 'YYYYMM', YYYY: 'YYYY' }
const toDayjsFmt = (fmt) => (dayjsFormatMap[fmt] || fmt).replace(/\bYY(?!YY)/g, 'YY')
const livePreview = computed(() => {
  const f = form.value
  if (!f.prefix) return '--'
  const parts = []
  const sep = f.separator || ''
  if (f.prefix) parts.push(f.prefix)
  if (f.date_format) {
    // 手动生成日期字符串以匹配后端逻辑
    const now = new Date()
    const y4 = String(now.getFullYear())
    const y2 = y4.slice(2)
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const fmtMap = { YYYYMMDD: y4+m+d, YYYYMM: y4+m, YYYY: y4, YYMMDD: y2+m+d, YYMM: y2+m }
    parts.push(fmtMap[f.date_format] || f.date_format)
  }
  parts.push('0'.repeat(f.sequence_length || 4).slice(0, -1) + '1')
  return parts.join(sep)
})

const filterList = () => { /* computed 自动处理 */ }

const fetchList = async () => {
  loading.value = true
  try {
    const res = await codingRuleApi.getList({ pageSize: 200 })
    const d = res.data || res
    const list = d.list || d || []
    // 后端已通过 LEFT JOIN 一次性计算好 _preview，无需逐条请求
    tableData.value = list
  } catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

const openForm = (row) => {
  form.value = row
    ? { ...row }
    : {
        business_type: '', name: '', prefix: '', date_format: 'YYYYMMDD',
        separator: '-', sequence_length: 4, reset_cycle: 'daily',
        initial_value: 1, step: 1, is_active: 1, description: ''
      }
  formVis.value = true
}

const handleSave = async () => {
  if (formRef.value) {
    try { await formRef.value.validate() } catch { return }
  }
  saving.value = true
  try {
    if (form.value.id) await codingRuleApi.update(form.value.id, form.value)
    else await codingRuleApi.create(form.value)
    ElMessage.success('保存成功')
    formVis.value = false
    fetchList()
  } catch (e) { ElMessage.error(e?.response?.data?.message || e.message || '保存失败') }
  finally { saving.value = false }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除编码规则「${row.name}」(${row.business_type})？\n关联的序列数据也会一并清除！`, '删除确认', {
      type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消'
    })
    await codingRuleApi.delete(row.id)
    ElMessage.success('删除成功')
    fetchList()
  } catch {}
}

// 序列抽屉
const seqVis = ref(false)
const seqLoading = ref(false)
const seqType = ref('')
const sequences = ref([])

const openSequences = async (row) => {
  seqType.value = row.business_type
  seqVis.value = true
  seqLoading.value = true
  try {
    const res = await codingRuleApi.getSequences(row.business_type)
    sequences.value = res.data || res || []
  } catch { sequences.value = [] }
  finally { seqLoading.value = false }
}

const handleResetSeq = async () => {
  try {
    await codingRuleApi.resetSequence({ business_type: seqType.value })
    ElMessage.success('序列已重置')
    sequences.value = []
    fetchList()
  } catch (e) { ElMessage.error(e.message || '重置失败') }
}

onMounted(fetchList)
</script>

<style scoped>
.code-text {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  color: var(--color-text-regular);
  font-size: 13px;
}

.rule-pattern {
  display: flex;
  align-items: center;
  gap: 2px;
}
.rule-tag {
  font-family: monospace;
  letter-spacing: 0.5px;
}
.rule-sep {
  color: var(--color-text-secondary);
  font-family: monospace;
  margin: 0 1px;
}

.preview-code {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  color: var(--color-primary);
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.5px;
}
.preview-code.large {
  font-size: 18px;
}

.live-preview {
  background: var(--color-bg-hover);
  border: 1px dashed var(--color-border-base);
  border-radius: var(--radius-base, 6px);
  padding: var(--spacing-md) var(--spacing-lg);
  text-align: center;
}

.seq-item {
  margin-bottom: var(--spacing-md);
}

:deep(.row-disabled) {
  opacity: 0.55;
}
</style>
