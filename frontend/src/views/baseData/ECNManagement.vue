<template>
  <div class="page-container">
    <!-- 页面头部卡片 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>工程变更管理 (ECN/ECO)</h2>
          <p class="subtitle">管理产品、BOM、工艺的工程变更通知与变更订单</p>
        </div>
        <el-button type="primary" @click="openForm()">新建ECN</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="搜索">
          <el-input v-model="keyword" placeholder="编号/标题" clearable @keyup.enter="fetchList">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterStatus" placeholder="全部" clearable @change="fetchList">
            <el-option label="草稿" value="draft" /><el-option label="待审批" value="pending_approval" />
            <el-option label="已批准" value="approved" /><el-option label="实施中" value="implementing" />
            <el-option label="已完成" value="completed" /><el-option label="已拒绝" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="tableData" v-loading="loading" border stripe>
      <el-table-column prop="code" label="ECN编号" width="140" />
      <el-table-column prop="title" label="变更标题" min-width="200" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="80">
        <template #default="{ row }"><el-tag size="small">{{ row.type === 'ecn' ? 'ECN' : 'ECO' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="priority" label="优先级" width="80">
        <template #default="{ row }">
          <el-tag :type="{ urgent:'danger', high:'warning', medium:'info', low:'info' }[row.priority] || 'info'" size="small">{{ { urgent:'紧急', high:'高', medium:'中', low:'低' }[row.priority] || row.priority }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTypeMap[row.status] || 'info'" size="small">
            {{ statusTextMap[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="requested_by_name" label="申请人" width="100" />
      <el-table-column prop="effective_date" label="生效日期" width="110" />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="viewDetail(row)">详情</el-button>
          <!-- 草稿 → 提交审批 -->
          <el-button v-if="row.status === 'draft'" link type="warning" @click="submitForApproval(row)">提交审批</el-button>
          <!-- 已批准 → 开始实施 -->
          <el-button v-if="row.status === 'approved'" link type="success" @click="handleStatusChange(row, 'implementing')">开始实施</el-button>
          <!-- 实施中 → 标记完成 -->
          <el-button v-if="row.status === 'implementing'" link type="success" @click="handleStatusChange(row, 'completed')">标记完成</el-button>
          <!-- 已拒绝 → 退回草稿 -->
          <el-button v-if="row.status === 'rejected'" link type="info" @click="handleStatusChange(row, 'draft')">退回草稿</el-button>
          <!-- 删除（草稿和已拒绝可删除） -->
          <el-popconfirm v-if="['draft', 'rejected', 'cancelled'].includes(row.status)" title="确定删除？" @confirm="handleDelete(row.id)">
            <template #reference><el-button link type="danger">删除</el-button></template>
          </el-popconfirm>
        </template>
      </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" @change="fetchList" />
      </div>
    </el-card>

    <!-- 新建/编辑/查看 ECN 弹窗 -->
    <el-dialog v-model="formVis" :title="dialogTitle" width="800px" destroy-on-close>
      <el-form :model="formData" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="标题" required><el-input v-model="formData.title" :disabled="!isEditable" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="类型">
            <el-select v-model="formData.type" style="width:100%" :disabled="!isEditable"><el-option label="ECN" value="ecn" /><el-option label="ECO" value="eco" /></el-select>
          </el-form-item></el-col>
          <el-col :span="8"><el-form-item label="优先级">
            <el-select v-model="formData.priority" style="width:100%" :disabled="!isEditable">
              <el-option label="低" value="low" /><el-option label="中" value="medium" /><el-option label="高" value="high" /><el-option label="紧急" value="urgent" />
            </el-select>
          </el-form-item></el-col>
        </el-row>
        <el-form-item label="变更原因" required><el-input v-model="formData.reason" type="textarea" :rows="2" :disabled="!isEditable" /></el-form-item>
        <el-form-item label="变更描述"><el-input v-model="formData.description" type="textarea" :rows="2" :disabled="!isEditable" /></el-form-item>
        <el-form-item label="影响分析"><el-input v-model="formData.impact_analysis" type="textarea" :rows="2" :disabled="!isEditable" /></el-form-item>
        <el-form-item label="生效日期"><el-date-picker v-model="formData.effective_date" type="date" value-format="YYYY-MM-DD" :disabled="!isEditable" /></el-form-item>

        <!-- 变更明细区域 -->
        <el-divider content-position="left">变更明细</el-divider>
        <div v-if="isEditable" style="margin-bottom: 12px;">
          <el-button type="primary" size="small" @click="addItem">+ 添加变更项</el-button>
        </div>
        <el-table v-if="formData.items && formData.items.length" :data="formData.items" border size="small">
          <el-table-column label="变更类型" width="150">
            <template #default="{ row }">
              <el-select v-if="isEditable" v-model="row.change_type" size="small" style="width:100%">
                <el-option label="BOM新增物料" value="bom_add" />
                <el-option label="BOM移除物料" value="bom_remove" />
                <el-option label="BOM修改" value="bom_modify" />
                <el-option label="物料属性修改" value="material_modify" />
              </el-select>
              <span v-else>{{ changeTypeMap[row.change_type] || row.change_type }}</span>
            </template>
          </el-table-column>
          <!-- 物料搜索选择器 -->
          <el-table-column label="物料" min-width="220">
            <template #default="{ row }">
              <el-select
                v-if="isEditable"
                v-model="row.material_id"
                filterable
                remote
                reserve-keyword
                :remote-method="(q) => searchMaterial(q)"
                :loading="materialSearching"
                placeholder="搜索编码/名称"
                size="small"
                style="width:100%"
                @change="(val) => onMaterialSelect(row, val)"
              >
                <!-- 如果已选但不在搜索结果中，保留已选项 -->
                <el-option
                  v-if="row.material_id && !materialOptions.find(o => o.id === row.material_id)"
                  :key="row.material_id"
                  :label="`${row.material_code} ${row.material_name}`"
                  :value="row.material_id"
                />
                <el-option
                  v-for="m in materialOptions"
                  :key="m.id"
                  :label="`${m.code} ${m.name}`"
                  :value="m.id"
                />
              </el-select>
              <span v-else>{{ row.material_code }} {{ row.material_name }}</span>
            </template>
          </el-table-column>
          <!-- 字段名 -->
          <el-table-column label="字段" width="120">
            <template #default="{ row }">
              <el-select v-if="isEditable && ['bom_modify','material_modify'].includes(row.change_type)" v-model="row.field_name" size="small" style="width:100%" placeholder="选择字段">
                <template v-if="row.change_type === 'bom_modify'">
                  <el-option label="数量" value="quantity" />
                  <el-option label="备注" value="remark" />
                </template>
                <template v-else>
                  <el-option label="名称" value="name" />
                  <el-option label="规格" value="specification" />
                  <el-option label="安全库存" value="safety_stock" />
                  <el-option label="单价" value="price" />
                </template>
              </el-select>
              <span v-else>{{ row.field_name || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="变更前" width="100">
            <template #default="{ row }">
              <el-input v-if="isEditable" v-model="row.old_value" size="small" />
              <span v-else>{{ row.old_value }}</span>
            </template>
          </el-table-column>
          <el-table-column label="变更后" width="100">
            <template #default="{ row }">
              <el-input v-if="isEditable" v-model="row.new_value" size="small" />
              <span v-else>{{ row.new_value }}</span>
            </template>
          </el-table-column>
          <el-table-column v-if="isEditable" label="操作" width="60">
            <template #default="{ $index }">
              <el-button link type="danger" size="small" @click="removeItem($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else-if="!isEditable" description="暂无变更明细" :image-size="60" />
      </el-form>
      <template #footer>
        <el-button @click="formVis = false">关闭</el-button>
        <!-- 新建保存 -->
        <el-button v-if="!formData.id" type="primary" @click="handleSave" :loading="saving">保存</el-button>
        <!-- 草稿状态下编辑保存 -->
        <el-button v-if="formData.id && formData.status === 'draft'" type="primary" @click="handleUpdate" :loading="saving">保存修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { ecnApi } from '@/api/enhanced'
import { baseDataApi } from '@/api/baseData'

// 状态映射表
const statusTypeMap = { draft:'info', pending_approval:'warning', approved:'success', implementing:'primary', completed:'success', rejected:'danger', cancelled:'info' }
const statusTextMap = { draft:'草稿', pending_approval:'待审批', approved:'已批准', implementing:'实施中', completed:'已完成', rejected:'已拒绝', cancelled:'已取消' }
const changeTypeMap = { bom_add:'BOM新增物料', bom_remove:'BOM移除物料', bom_modify:'BOM修改', material_modify:'物料属性修改', process_modify:'工艺修改', drawing_modify:'图纸修改' }

const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const filterStatus = ref('')
const page = ref(1)
const total = ref(0)
const tableData = ref([])
const formVis = ref(false)
const formData = ref({})

// 物料搜索相关
const materialSearching = ref(false)
const materialOptions = ref([])
let searchTimer = null

// 物料远程搜索
const searchMaterial = (query) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!query || query.length < 1) { materialOptions.value = []; return }
  searchTimer = setTimeout(async () => {
    materialSearching.value = true
    try {
      const res = await baseDataApi.getMaterials({ keyword: query, page: 1, pageSize: 20 })
      const data = res.data || res
      materialOptions.value = (data.list || data || []).map(m => ({
        id: m.id,
        code: m.code,
        name: m.name
      }))
    } catch { materialOptions.value = [] }
    finally { materialSearching.value = false }
  }, 300)
}

// 选中物料后自动填充编码和名称
const onMaterialSelect = (row, materialId) => {
  const m = materialOptions.value.find(o => o.id === materialId)
  if (m) {
    row.material_code = m.code
    row.material_name = m.name
  }
}

// 弹窗标题
const dialogTitle = computed(() => {
  if (!formData.value.id) return '新建ECN'
  if (formData.value.status === 'draft') return 'ECN编辑 - ' + (formData.value.code || '')
  return 'ECN详情 - ' + (formData.value.code || '')
})

// 是否可编辑：新建或草稿状态
const isEditable = computed(() => !formData.value.id || formData.value.status === 'draft')

// 获取列表
const fetchList = async () => {
  loading.value = true
  try {
    const res = await ecnApi.getList({ keyword: keyword.value, status: filterStatus.value, page: page.value, pageSize: 20 })
    const d = res.data || res
    tableData.value = d.list || []
    total.value = d.total || 0
  } catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

// 新建表单
const openForm = () => {
  formData.value = { type: 'ecn', priority: 'medium', title: '', reason: '', items: [] }
  formVis.value = true
}

// 查看详情
const viewDetail = async (row) => {
  try {
    const res = await ecnApi.getById(row.id)
    const data = res.data || res
    if (!data.items) data.items = []
    formData.value = data
    formVis.value = true
  } catch { ElMessage.error('获取详情失败') }
}

// 创建保存
const handleSave = async () => {
  if (!formData.value.title?.trim()) return ElMessage.warning('请输入标题')
  if (!formData.value.reason?.trim()) return ElMessage.warning('请输入变更原因')
  saving.value = true
  try {
    await ecnApi.create(formData.value)
    ElMessage.success('创建成功'); formVis.value = false; fetchList()
  } catch (e) { ElMessage.error(e.message || '创建失败') }
  finally { saving.value = false }
}

// 编辑保存（草稿状态）
const handleUpdate = async () => {
  if (!formData.value.title?.trim()) return ElMessage.warning('请输入标题')
  if (!formData.value.reason?.trim()) return ElMessage.warning('请输入变更原因')
  saving.value = true
  try {
    await ecnApi.update(formData.value.id, formData.value)
    ElMessage.success('保存成功'); formVis.value = false; fetchList()
  } catch (e) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

// 提交审批
const submitForApproval = async (row) => {
  try { await ecnApi.updateStatus(row.id, 'pending_approval'); ElMessage.success('已提交审批'); fetchList() }
  catch { ElMessage.error('提交失败') }
}

// 状态流转（开始实施/完成/退回草稿）
const handleStatusChange = async (row, targetStatus) => {
  const actionMap = { implementing: '开始实施', completed: '标记完成', draft: '退回草稿' }
  const action = actionMap[targetStatus] || targetStatus
  try {
    await ElMessageBox.confirm(`确定要将此ECN「${action}」吗？`, '操作确认', { type: 'warning' })
    await ecnApi.updateStatus(row.id, targetStatus)
    ElMessage.success(`已${action}`)
    fetchList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '操作失败')
  }
}

// 删除
const handleDelete = async (id) => {
  try { await ecnApi.delete(id); ElMessage.success('已删除'); fetchList() }
  catch { ElMessage.error('删除失败') }
}

// 变更明细 — 添加行
const addItem = () => {
  if (!formData.value.items) formData.value.items = []
  formData.value.items.push({
    change_type: 'bom_modify',
    material_id: null,
    material_code: '',
    material_name: '',
    bom_id: null,
    field_name: '',
    old_value: '',
    new_value: '',
    remark: ''
  })
}

// 变更明细 — 删除行
const removeItem = (index) => {
  formData.value.items.splice(index, 1)
}

onMounted(fetchList)
</script>

<style scoped>
/* 页面专属样式已由 common-styles.css 统一提供 */
</style>
