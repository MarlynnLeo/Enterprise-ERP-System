<template>
  <div class="module-page page-container">
    <!-- 页面头部卡片 -->
    <PageHeader title="编码规则管理" subtitle="配置各业务单据的自动编号规则，支持前缀、日期、流水号组合">
      <template #actions>
<el-button type="primary" :icon="Plus" v-permission="'system:settings:edit'" @click="openForm()">新增规则</el-button>
      </template>
    </PageHeader>
    <!-- 搜索区域 -->
    <FinanceQueryCard
      @search="filterList"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="规则名称">
          <el-input v-model="keyword" placeholder="规则名称" clearable @keyup.enter="filterList" />
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="重置周期">
          <el-select v-model="filterCycle" placeholder="全部" clearable @change="filterList">
            <el-option v-for="(l,k) in cycleLabel" :key="k" :label="l" :value="k" />
          </el-select>
        </el-form-item>
      </template>
      <template #actions>
        <el-tag type="info" size="small">共 {{ filteredData.length }} 条</el-tag>
      </template>
    </FinanceQueryCard>
    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="filteredData" v-loading="loading" border stripe
        :row-class-name="({row}) => row.isActive ? '' : 'row-disabled'"
        class="w-full">
        <el-table-column prop="businessType" label="业务类型" width="180" sortable>
          <template #default="{ row }">
            <span class="code-text">{{ row.businessType }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="规则名称" min-width="130" />
        <el-table-column label="编码规则" min-width="200">
          <template #default="{ row }">
            <div class="rule-pattern">
              <el-tag v-if="row.prefix" size="small" type="primary" class="rule-tag">{{ row.prefix }}</el-tag>
              <span v-if="row.prefix && (row.dateFormat || true)" class="rule-sep">{{ row.separator || '' }}</span>
              <el-tag v-if="row.dateFormat" size="small" type="warning" class="rule-tag">{{ row.dateFormat }}</el-tag>
              <span v-if="row.dateFormat" class="rule-sep">{{ row.separator || '' }}</span>
              <el-tag size="small" type="info" class="rule-tag">{{ '0'.repeat(row.sequenceLength || 4) }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="resetCycle" label="重置周期" width="100">
          <template #default="{ row }">
            <el-tag :type="cycleType[row.resetCycle]" size="small" effect="plain">{{ cycleLabel[row.resetCycle] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下一个编号" width="200">
          <template #default="{ row }">
            <span class="preview-code">{{ row._preview || '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="isActive" label="状态" width="75">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'danger'" size="small" effect="dark">{{ row.isActive ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="140" show-overflow-tooltip />
        <el-table-column label="操作" min-width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button size="small" v-permission="'system:settings:edit'" @click="openForm(row)">
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-button size="small" type="warning" v-permission="'system:settings:view'" @click="openSequences(row)">
                <el-icon><List /></el-icon> 序列
              </el-button>
              <el-button size="small" type="danger" v-permission="'system:settings:edit'" @click="handleDelete(row)">
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    <!-- 新增/编辑弹窗 -->
    <AppDialog
      v-model="formVis"
      :title="form.id ? '编辑编码规则' : '新增编码规则'"
      mode="form"
      width="600px"
    >
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="业务类型" prop="businessType">
          <el-input v-model="form.businessType" :disabled="!!form.id" placeholder="如 purchase_order" />
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
              <el-select v-model="form.dateFormat" class="w-full" clearable placeholder="选择格式">
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
              <el-select v-model="form.separator" class="w-full">
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
              <el-input-number v-model="form.sequenceLength" :min="1" :max="10" class="w-full" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="重置周期">
              <el-select v-model="form.resetCycle" class="w-full">
                <el-option v-for="(l,k) in cycleLabel" :key="k" :label="l" :value="k" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="起始值">
              <el-input-number v-model="form.initialValue" :min="0" class="w-full" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="步长">
              <el-input-number v-model="form.step" :min="1" :max="100" class="w-full" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="规则用途说明（选填）" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isActive" :active-value="1" :inactive-value="0" />
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
        <el-button type="primary" v-permission="'system:settings:edit'" @click="handleSave" :loading="saving">保存</el-button>
      </template>
        </AppDialog>
    <!-- 序列详情抽屉 -->
    <el-drawer v-model="seqVis" :title="`序列详情 — ${seqType}`" size="450px">
      <div v-if="seqLoading" v-loading="true" style="height:100px" />
      <template v-else>
        <EmptyState v-if="!sequences.length" description="暂无序列记录" />
        <el-descriptions v-for="s in sequences" :key="s.id" :column="1" border size="small" class="seq-item">
          <el-descriptions-item label="周期键">
            <span class="code-text">{{ s.periodKey }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="当前值">
            <span style="font-size:18px;font-weight:bold;color:var(--color-primary)">{{ s.currentValue }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ s.updatedAt }}</el-descriptions-item>
        </el-descriptions>
        <div style="margin-top:16px;text-align:center">
          <el-popconfirm title="确定重置该业务类型的所有序列？此操作不可撤销！" confirm-button-text="确认重置"
            cancel-button-text="取消" @confirm="handleResetSeq">
            <template #reference>
              <el-button type="danger" size="small" v-permission="'system:settings:edit'">重置全部序列</el-button>
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
import { Plus, Edit, Delete, List } from '@element-plus/icons-vue'
import { codingRuleApi } from '@/api/enhanced'
import 'dayjs'
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
  businessType: [{ required: true, message: '请输入业务类型', trigger: 'blur' }],
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  prefix: [{ required: true, message: '请输入前缀', trigger: 'blur' }],
}
// 筛选后的数据
const filteredData = computed(() => {
  let list = tableData.value
  if (keyword.value) {
    const kw = keyword.value.toLowerCase()
    list = list.filter(r =>
      (r.businessType || '').toLowerCase().includes(kw) ||
      (r.name || '').toLowerCase().includes(kw) ||
      (r.prefix || '').toLowerCase().includes(kw)
    )
  }
  if (filterCycle.value) {
    list = list.filter(r => r.resetCycle === filterCycle.value)
  }
  return list
})
// 实时预览
// 将编码规则中的日期格式转为 dayjs 兼容 token（YYMMDD → YYMMDDformat: 需要映射 YY→YY 但 dayjs 用小写 yy）
const dayjsFormatMap = { YYMMDD: 'YYMMDD', YYMM: 'YYMM', YYYYMMDD: 'YYYYMMDD', YYYYMM: 'YYYYMM', YYYY: 'YYYY' }
const _toDayjsFmt = (fmt) => (dayjsFormatMap[fmt] || fmt).replace(/\bYY(?!YY)/g, 'YY')
const livePreview = computed(() => {
  const f = form.value
  if (!f.prefix) return '--'
  const parts = []
  const sep = f.separator || ''
  if (f.prefix) parts.push(f.prefix)
  if (f.dateFormat) {
    // 手动生成日期字符串以匹配后端逻辑
    const now = new Date()
    const y4 = String(now.getFullYear())
    const y2 = y4.slice(2)
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const fmtMap = { YYYYMMDD: y4+m+d, YYYYMM: y4+m, YYYY: y4, YYMMDD: y2+m+d, YYMM: y2+m }
    parts.push(fmtMap[f.dateFormat] || f.dateFormat)
  }
  parts.push('0'.repeat(f.sequenceLength || 4).slice(0, -1) + '1')
  return parts.join(sep)
})
const filterList = () => { /* computed 自动处理 */ }
const resetSearch = () => {
  keyword.value = ''
  filterCycle.value = ''
}
const fetchList = async () => {
  loading.value = true
  try {
    const res = await codingRuleApi.getList({ pageSize: 50 })
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
        businessType: '', name: '', prefix: '', dateFormat: 'YYYYMMDD',
        separator: '-', sequenceLength: 4, resetCycle: 'daily',
        initialValue: 1, step: 1, isActive: 1, description: ''
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
    await ElMessageBox.confirm(`确定删除编码规则「${row.name}」(${row.businessType})？\n关联的序列数据也会一并清除！`, '删除确认', {
      type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消'
    })
    await codingRuleApi.delete(row.id)
    ElMessage.success('删除成功')
    fetchList()
  } catch (error) {
    if (error !== 'cancel' && error?.toString() !== 'cancel') {
      console.error('删除编码规则失败:', error)
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}
// 序列抽屉
const seqVis = ref(false)
const seqLoading = ref(false)
const seqType = ref('')
const sequences = ref([])
const openSequences = async (row) => {
  seqType.value = row.businessType
  seqVis.value = true
  seqLoading.value = true
  try {
    const res = await codingRuleApi.getSequences(row.businessType)
    sequences.value = res.data || res || []
  } catch { sequences.value = [] }
  finally { seqLoading.value = false }
}
const handleResetSeq = async () => {
  try {
    await codingRuleApi.resetSequence({ businessType: seqType.value })
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
