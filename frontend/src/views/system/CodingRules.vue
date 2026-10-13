<template>
  <div class="module-page page-container">
    <!-- 页面头部卡片 -->
    <PageHeader title="编码规则管理" subtitle="配置各业务单据的自动编号规则，默认采用两位年份和三位递增流水号">
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
              <span v-if="row.prefix" class="rule-sep">{{ row.separator || '' }}</span>
              <el-tag v-if="row.dateFormat" size="small" type="warning" class="rule-tag">{{ row.dateFormat }}</el-tag>
              <span v-if="row.dateFormat" class="rule-sep">{{ row.separator || '' }}</span>
              <el-tag size="small" type="info" class="rule-tag">{{ '0'.repeat(row.sequenceLength || 3) }}</el-tag>
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
            <span class="preview-code">{{ row.preview || '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="isActive" label="状态" width="75">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'danger'" size="small" effect="dark">{{ row.isActive ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="140" show-overflow-tooltip />
        <el-table-column label="操作" min-width="260" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button size="small" type="primary" v-permission="'system:settings:edit'" @click="openForm(row)">
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
      width="640px"
    >
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="业务类型" prop="businessType">
          <el-select
            v-if="!form.id"
            v-model="form.businessType"
            filterable
            allow-create
            default-first-option
            placeholder="选择系统单据或输入自定义英文标识（如 inventory_posting）"
            class="w-full"
            @change="handlePresetSelect"
          >
            <el-option-group v-for="group in presetGroups" :key="group.label" :label="group.label">
              <el-option
                v-for="item in group.options"
                :key="item.value"
                :label="`${item.name} (${item.value})`"
                :value="item.value"
              />
            </el-option-group>
          </el-select>
          <el-input v-else v-model="form.businessType" disabled />
        </el-form-item>
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="form.name" placeholder="如 存货过账单" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="前缀" prop="prefix">
              <el-input v-model="form.prefix" placeholder="PST" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="日期格式">
              <el-select v-model="form.dateFormat" :empty-values="[null, undefined]" :value-on-clear="''" class="w-full" clearable placeholder="选择格式">
                <el-option label="无" value="" />
                <el-option label="YYYYMMDD (20261012)" value="YYYYMMDD" />
                <el-option label="YYYYMM (202610)" value="YYYYMM" />
                <el-option label="YYYY (2026)" value="YYYY" />
                <el-option label="YYMMDD (261012)" value="YYMMDD" />
                <el-option label="YYMM (2610)" value="YYMM" />
                <el-option label="YY (26)" value="YY" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="分隔符">
              <el-select v-model="form.separator" :empty-values="[null, undefined]" class="w-full">
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
        <el-button @click="formVis = false">
          <el-icon><Close /></el-icon> 取消
        </el-button>
        <el-button type="primary" v-permission="'system:settings:edit'" @click="handleSave" :loading="saving">
          <el-icon><Check /></el-icon> 保存
        </el-button>
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
              <el-button type="danger" size="small" v-permission="'system:settings:edit'">
                <el-icon><RefreshLeft /></el-icon> 重置全部序列
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </template>
    </el-drawer>
  </div>
</template>
<script setup>
import { getApiErrorMessage } from '@/utils/errorHandler'
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { Plus, Edit, Delete, List, Check, Close, RefreshLeft } from '@element-plus/icons-vue'
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

const presetGroups = [
  {
    label: '财务与存货凭证',
    options: [
      { value: 'inventory_posting', name: '存货过账单', prefix: 'PST', dateFormat: 'YYYYMMDD', separator: '-', sequenceLength: 4, resetCycle: 'daily', description: '存货过账凭证编号（借贷平衡核算）' },
      { value: 'inventory_posting_reversal', name: '存货冲销单', prefix: 'RPST', dateFormat: 'YYYYMMDD', separator: '-', sequenceLength: 4, resetCycle: 'daily', description: '存货冲销过账凭证编号' },
      { value: 'ar_invoice', name: '应收发票', prefix: 'AR', dateFormat: 'YYYYMMDD', separator: '-', sequenceLength: 4, resetCycle: 'daily', description: '应收账款发票编号' },
      { value: 'ap_invoice', name: '应付发票', prefix: 'AP', dateFormat: 'YYYYMMDD', separator: '-', sequenceLength: 4, resetCycle: 'daily', description: '应付账款发票编号' },
      { value: 'finance_voucher', name: '记账凭证', prefix: 'V', dateFormat: 'YYMM', separator: '', sequenceLength: 3, resetCycle: 'monthly', description: '财务记账凭证号' },
    ],
  },
  {
    label: '仓储与物流',
    options: [
      { value: 'inventory_inbound', name: '入库单', prefix: 'IN', dateFormat: 'YYMMDD', separator: '', sequenceLength: 3, resetCycle: 'daily', description: '标准入库单号' },
      { value: 'inventory_outbound', name: '出库单', prefix: 'OUT', dateFormat: 'YYMMDD', separator: '', sequenceLength: 3, resetCycle: 'daily', description: '标准出库单号' },
      { value: 'inventory_transfer', name: '调拨单', prefix: 'TF', dateFormat: 'YYMMDD', separator: '', sequenceLength: 3, resetCycle: 'daily', description: '库位/仓库调拨单号' },
      { value: 'inventory_check', name: '盘点单', prefix: 'IC', dateFormat: 'YYMMDD', separator: '', sequenceLength: 3, resetCycle: 'daily', description: '库存盘点单号' },
      { value: 'inventory_adjustment', name: '库存调整单', prefix: 'TZ', dateFormat: 'YYMMDD', separator: '', sequenceLength: 3, resetCycle: 'daily', description: '库存手工调整单号' },
    ],
  },
  {
    label: '采购与销售',
    options: [
      { value: 'purchase_order', name: '采购订单', prefix: 'PO', dateFormat: 'YYMMDD', separator: '', sequenceLength: 3, resetCycle: 'daily', description: '采购订单编号' },
      { value: 'purchase_receipt', name: '采购收货单', prefix: 'RCV', dateFormat: 'YYMMDD', separator: '', sequenceLength: 3, resetCycle: 'daily', description: '采购收货入库单号' },
      { value: 'sales_order', name: '销售订单', prefix: 'SO', dateFormat: 'YYMMDD', separator: '', sequenceLength: 3, resetCycle: 'daily', description: '销售订单编号' },
      { value: 'sales_outbound', name: '销售出库单', prefix: 'SOB', dateFormat: 'YYMMDD', separator: '', sequenceLength: 3, resetCycle: 'daily', description: '销售出货单号' },
    ],
  },
]

const presetMap = new Map()
presetGroups.forEach((group) => {
  group.options.forEach((item) => {
    presetMap.set(item.value, item)
  })
})

const handlePresetSelect = (value) => {
  const item = presetMap.get(value)
  if (item) {
    if (!form.value.name) form.value.name = item.name
    if (!form.value.prefix) form.value.prefix = item.prefix
    if (item.dateFormat !== undefined) form.value.dateFormat = item.dateFormat
    if (item.separator !== undefined) form.value.separator = item.separator
    if (item.sequenceLength !== undefined) form.value.sequenceLength = item.sequenceLength
    if (item.resetCycle !== undefined) form.value.resetCycle = item.resetCycle
    if (item.description && !form.value.description) form.value.description = item.description
  }
}

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
const livePreview = computed(() => {
  const f = form.value
  if (!f.prefix) return '--'
  const parts = []
  const sep = f.separator || ''
  if (f.prefix) parts.push(f.prefix)
  if (f.dateFormat) {
    parts.push(dayjs().format(f.dateFormat))
  }
  parts.push(String(f.initialValue ?? 1).padStart(f.sequenceLength || 3, '0'))
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
    const list = []
    let page = 1
    while (true) {
      const res = await codingRuleApi.getList({ page, pageSize: 100 })
      const d = res.data || res
      const rows = d.list || d || []
      list.push(...rows)
      if (!rows.length || list.length >= (d.total ?? rows.length)) break
      page += 1
    }
    // 后端随列表返回预览；按页取齐所有规则后再筛选。
    tableData.value = list
  } catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}
const openForm = (row) => {
  form.value = row
    ? { ...row }
    : {
        businessType: '', name: '', prefix: '', dateFormat: 'YYMMDD',
        separator: '', sequenceLength: 3, resetCycle: 'daily',
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
  } catch (e) { ElMessage.error(getApiErrorMessage(e, '保存失败')) }
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
      ElMessage.error(getApiErrorMessage(error, '删除失败'))
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
  } catch (e) { ElMessage.error(getApiErrorMessage(e, '重置失败')) }
}
onMounted(fetchList)
</script>
<style scoped>
.code-text {
  font-family: var(--font-ui);
  color: var(--color-text-regular);
  font-size: 13px;
}
.rule-pattern {
  display: flex;
  align-items: center;
  gap: 2px;
}
.rule-tag {
  font-family: var(--font-ui);
  letter-spacing: 0.5px;
}
.rule-sep {
  color: var(--color-text-secondary);
  font-family: var(--font-ui);
  margin: 0 1px;
}
.preview-code {
  font-family: var(--font-ui);
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
