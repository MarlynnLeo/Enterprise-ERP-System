<template>
  <div class="module-page page-container">
    <PageHeader title="工作流模板" subtitle="配置业务单据的审批流程模板">
      <template #actions>
          <el-button v-permission="'system:workflow:create'" type="primary" @click="openTemplateForm()">新建模板</el-button>
      </template>
    </PageHeader>

    <el-card class="data-card">
      <el-table class="table-row-click" :data="tableData" v-loading="loading" border stripe
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewTemplate(row))">
        <el-table-column prop="code" label="编码" width="210" />
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column prop="businessType" label="业务类型" width="140">
          <template #default="{ row }">{{ btLabel[row.businessType] || row.businessType }}</template>
        </el-table-column>
        <el-table-column prop="nodeCount" label="节点数" width="80" />
        <el-table-column prop="isActive" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="{ row }">
            <div class="table-actions">
              
              <el-button size="small" v-permission="'system:workflow:edit'" @click="openTemplateForm(row)">
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-popconfirm title="确定删除？" @confirm="delTemplate(row.id)">
                <template #reference>
                  <el-button size="small" type="danger" v-permission="'system:workflow:delete'">
                    <el-icon><Delete /></el-icon> 删除
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @change="fetchData"
        />
      </div>
    </el-card>

    <AppDialog
      v-model="formVis"
      :title="form.id ? '编辑模板' : '新建模板'"
      mode="form"
      width="760px"
    >
      <el-form :model="form" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="编码" required>
              <el-input v-model="form.code" :disabled="!!form.id" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="名称" required>
              <el-input v-model="form.name" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="业务类型" required>
              <el-select v-model="form.businessType" class="w-full">
                <el-option v-for="(label, key) in btLabel" :key="key" :label="label" :value="key" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="启用">
              <el-switch v-model="form.isActive" :active-value="1" :inactive-value="0" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>

        <el-divider content-position="left">审批节点</el-divider>
        <div v-for="(node, index) in form.nodes" :key="index" class="workflow-node-row">
          <el-row :gutter="8" align="middle">
            <el-col :span="1">
              <span class="node-index">{{ index + 1 }}</span>
            </el-col>
            <el-col :span="7">
              <el-input v-model="node.nodeName" placeholder="节点名称" size="small" />
            </el-col>
            <el-col :span="5">
              <el-select v-model="node.approverType" size="small" class="w-full" disabled>
                <el-option label="系统角色" value="role" />
              </el-select>
            </el-col>
            <el-col :span="6">
              <el-select
                v-model="node.approverRoleCodes"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                size="small"
                class="w-full"
                placeholder="选择系统角色"
              >
                <el-option
                  v-for="role in roleOptions"
                  :key="role.code"
                  :label="`${role.name}（${role.code}）`"
                  :value="role.code"
                />
              </el-select>
            </el-col>
            <el-col :span="3">
              <el-select v-model="node.multiApproveType" size="small" class="w-full">
                <el-option label="任一通过" value="any" />
                <el-option label="全部通过" value="all" />
                <el-option label="依次审批" value="sequential" />
              </el-select>
            </el-col>
            <el-col :span="2">
              <el-button link type="danger" size="small" @click="form.nodes.splice(index, 1)">删除</el-button>
            </el-col>
          </el-row>
          <div class="node-hint">换人只需调整该角色组成员，不用改审批模板</div>
        </div>
        <el-button link type="primary" @click="addNode">+ 添加节点</el-button>
      </el-form>
      <template #footer>
        <el-button @click="formVis = false">取消</el-button>
        <el-button
          type="primary"
          v-permission="form.id ? 'system:workflow:edit' : 'system:workflow:create'"
          @click="saveTemplate"
          :loading="saving"
        >
          保存
        </el-button>
      </template>
        </AppDialog>

    <AppDialog
      v-model="detailVis"
      title="模板详情"
      mode="view"
      content-width="wide"
    >
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="名称">{{ detail.name || detail.title }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="detail.isActive ? 'success' : 'info'">{{ detail.isActive ? '启用' : '停用' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="业务类型">{{ btLabel[detail.businessType] || detail.businessType }}</el-descriptions-item>
          <el-descriptions-item label="编码">{{ detail.code }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="details-title">审批节点</h4>
        <el-timeline>
          <el-timeline-item v-for="node in (detail.nodes || [])" :key="node.id" type="primary">
            <strong>{{ node.nodeName || '未命名节点' }}</strong>
            <div class="node-meta">审批人: 系统角色 {{ formatApproverIds(node.approverIds) }}</div>
          </el-timeline-item>
        </el-timeline>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, onMounted } from 'vue'

import { ElMessage } from 'element-plus/es/components/message/index'
import { Edit, Delete } from '@element-plus/icons-vue'
import { workflowApi } from '@/api/workflow'
import { systemApi } from '@/api/system'


const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const tableData = ref([])
const formVis = ref(false)
const form = ref({ nodes: [] })
const detailVis = ref(false)
const detail = ref(null)

const btLabel = {
  purchase_order: '采购订单',
  purchase_requisition: '采购请购',
  expense: '费用报销',
  scrap: '报废审批',
  leave: '请假',
  hr_leave: '请假',
  hr_overtime: '加班',
  sales_order: '销售订单',
  contract: '合同',
  ecn: '工程变更',
  production_plan: '生产计划'
}

const roleOptions = ref([])

const normalizeApproverCodes = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (!value) return []
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : []
  } catch {
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
}

const formatApproverIds = (value) => {
  const codes = normalizeApproverCodes(value)
  if (!codes.length) return '-'
  return codes
    .map((code) => {
      const role = roleOptions.value.find((item) => item.code === code || String(item.id) === String(code))
      return role ? `${role.name}（${role.code}）` : code
    })
    .join('、')
}

const toEditableNode = (node = {}) => ({
  ...node,
  nodeName: node.nodeName || '',
  nodeType: node.nodeType || 'approval',
  approverType: 'role',
  multiApproveType: node.multiApproveType || 'any',
  allowSelfApproval: false,
  approverRoleCodes: normalizeApproverCodes(node.approverIds)
})

const toPayloadNode = (node, index) => ({
  nodeName: String(node.nodeName || '').trim(),
  nodeType: node.nodeType || 'approval',
  sequence: index,
  approverType: 'role',
  multiApproveType: node.multiApproveType || 'any',
  allowSelfApproval: false,
  approverIds: Array.isArray(node.approverRoleCodes) ? node.approverRoleCodes : [],
})

const validateForm = (payload) => {
  if (!String(payload.code || '').trim()) return '请填写模板编码'
  if (!String(payload.name || '').trim()) return '请填写模板名称'
  if (!payload.businessType) return '请选择业务类型'
  if (!Array.isArray(payload.nodes) || payload.nodes.length === 0) return '请至少添加一个审批节点'

  const invalidNodeIndex = payload.nodes.findIndex((node) => !node.nodeName)
  if (invalidNodeIndex >= 0) return `第 ${invalidNodeIndex + 1} 个审批节点缺少名称`

  const missingApproverIndex = payload.nodes.findIndex((node) =>
    !Array.isArray(node.approverIds) || node.approverIds.length === 0
  )
  if (missingApproverIndex >= 0) return `第 ${missingApproverIndex + 1} 个审批节点需要选择系统角色`

  return ''
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await workflowApi.getTemplates({ page: page.value, pageSize: pageSize.value })
    const data = res.data || res
    tableData.value = data.list || []
    total.value = data.total || 0
  } catch {
    ElMessage.error('加载工作流模板失败')
  } finally {
    loading.value = false
  }
}



const addNode = () => {
  form.value.nodes.push({
    nodeName: '',
    nodeType: 'approval',
    approverType: 'role',
    multiApproveType: 'any',
    allowSelfApproval: false,
    sequence: form.value.nodes.length,
    approverRoleCodes: []
  })
}

const loadRoles = async () => {
  try {
    const res = await systemApi.getRolesList()
    const payload = res.data || res || []
    const list = Array.isArray(payload) ? payload : payload.list || payload.records || []
    roleOptions.value = list.filter((role) => role?.code)
  } catch {
    roleOptions.value = []
  }
}

const openTemplateForm = async (row) => {
  if (row) {
    try {
      const res = await workflowApi.getTemplateById(row.id)
      const data = res.data || res
      form.value = { ...data, nodes: (data.nodes || []).map(toEditableNode) }
    } catch {
      form.value = { ...row, nodes: (row.nodes || []).map(toEditableNode) }
    }
  } else {
    form.value = { code: '', name: '', businessType: '', isActive: 1, description: '', nodes: [] }
    addNode()
  }
  formVis.value = true
}

const saveTemplate = async () => {
  const payload = {
    ...form.value,
    code: String(form.value.code || '').trim(),
    name: String(form.value.name || '').trim(),
    nodes: (form.value.nodes || []).map(toPayloadNode)
  }
  const error = validateForm(payload)
  if (error) {
    ElMessage.warning(error)
    return
  }

  saving.value = true
  try {
    if (payload.id) await workflowApi.updateTemplate(payload.id, payload)
    else await workflowApi.createTemplate(payload)
    ElMessage.success('保存成功')
    formVis.value = false
    fetchData()
  } catch (error) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const viewTemplate = async (row) => {
  try {
    const res = await workflowApi.getTemplateById(row.id)
    detail.value = res.data || res
    detailVis.value = true
  } catch {
    ElMessage.error('获取详情失败')
  }
}

const delTemplate = async (id) => {
  try {
    await workflowApi.deleteTemplate(id)
    ElMessage.success('已删除')
    fetchData()
  } catch {
    ElMessage.error('删除失败')
  }
}

onMounted(async () => {
  await loadRoles()
  await fetchData()
})
</script>

<style scoped>
.workflow-node-row {
  margin-bottom: 8px;
}

.node-index {
  display: inline-block;
  line-height: 32px;
}

.node-hint,
.node-meta {
  color: var(--color-text-secondary);
  font-size: 12px;
}
</style>
