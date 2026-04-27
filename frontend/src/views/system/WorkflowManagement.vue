<template>
  <div class="page-container">
    <!-- 页面头部卡片 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>审批工作流</h2>
          <p class="subtitle">配置审批流程模板，查看我发起的审批和待我处理的审批</p>
        </div>
        <div class="operation-btns">
          <el-radio-group v-model="activeTab" @change="onTabChange">
            <el-radio-button value="templates">流程模板</el-radio-button>
            <el-radio-button value="initiated">我发起的</el-radio-button>
            <el-radio-button value="pending">待我审批</el-radio-button>
          </el-radio-group>
          <el-button v-if="activeTab === 'templates'" type="primary" @click="openTemplateForm()">新建模板</el-button>
        </div>
      </div>
    </el-card>

    <!-- 流程模板列表 -->
    <el-card class="data-card">
    <template v-if="activeTab === 'templates'">
      <el-table :data="tableData" v-loading="loading" border stripe>
        <el-table-column prop="code" label="编码" width="210" />
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column prop="business_type" label="业务类型" width="140">
          <template #default="{ row }">{{ btLabel[row.business_type] || row.business_type }}</template>
        </el-table-column>
        <el-table-column prop="node_count" label="节点数" width="80" align="center" />
        <el-table-column prop="is_active" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'info'" size="small">{{ row.is_active ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewTemplate(row)">详情</el-button>
            <el-button link type="primary" @click="openTemplateForm(row)">编辑</el-button>
            <el-popconfirm title="确定删除？" @confirm="delTemplate(row.id)">
              <template #reference><el-button link type="danger">删除</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- 我发起的 / 待我审批 -->
    <template v-if="activeTab !== 'templates'">
      <el-table :data="tableData" v-loading="loading" border stripe>
        <el-table-column prop="title" label="审批标题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="business_type" label="业务类型" width="120">
          <template #default="{ row }">{{ btLabel[row.business_type] || row.business_type }}</template>
        </el-table-column>
        <el-table-column prop="business_code" label="单据编号" width="160" />
        <el-table-column v-if="activeTab === 'pending'" prop="initiator_name" label="发起人" width="100" />
        <el-table-column v-if="activeTab === 'pending'" prop="node_name" label="当前节点" width="120" />
        <el-table-column v-if="activeTab === 'initiated'" prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="sTag[row.status || row.instance_status] || 'info'" size="small">{{ sLabel[row.status || row.instance_status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewInstance(row)">详情</el-button>
            <template v-if="activeTab === 'pending'">
              <el-button type="success" size="small" @click="openApproval(row, 'approve')">通过</el-button>
              <el-button type="danger" size="small" @click="openApproval(row, 'reject')">拒绝</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <div class="pagination-container">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize"
        :total="total" layout="total, prev, pager, next" @change="fetchData" />
    </div>
    </el-card>

    <!-- 模板表单 -->
    <el-dialog v-model="formVis" :title="form.id ? '编辑模板' : '新建模板'" width="700px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="编码" required><el-input v-model="form.code" :disabled="!!form.id" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="业务类型" required>
              <el-select v-model="form.business_type" style="width:100%">
                <el-option v-for="(l, k) in btLabel" :key="k" :label="l" :value="k" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="启用"><el-switch v-model="form.is_active" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
        <el-divider content-position="left">审批节点</el-divider>
        <div v-for="(n, i) in form.nodes" :key="i" style="margin-bottom:8px">
          <el-row :gutter="8">
            <el-col :span="1"><span style="line-height:32px">{{ i+1 }}</span></el-col>
            <el-col :span="6"><el-input v-model="n.node_name" placeholder="节点名称" size="small" /></el-col>
            <el-col :span="5">
              <el-select v-model="n.approver_type" size="small" style="width:100%">
                <el-option label="部门主管" value="manager" /><el-option label="指定用户" value="user" />
                <el-option label="指定角色" value="role" /><el-option label="发起人" value="self" />
              </el-select>
            </el-col>
            <el-col :span="5">
              <el-select v-model="n.multi_approve_type" size="small" style="width:100%">
                <el-option label="任一通过" value="any" /><el-option label="全部通过" value="all" />
              </el-select>
            </el-col>
            <el-col :span="2"><el-button link type="danger" size="small" @click="form.nodes.splice(i,1)">删除</el-button></el-col>
          </el-row>
        </div>
        <el-button link type="primary" @click="form.nodes.push({node_name:'',node_type:'approval',approver_type:'manager',multi_approve_type:'any',sequence:form.nodes.length})">+ 添加节点</el-button>
      </el-form>
      <template #footer>
        <el-button @click="formVis = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 审批详情 -->
    <el-dialog v-model="detailVis" title="审批详情" width="650px" destroy-on-close>
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="标题">{{ detail.title }}</el-descriptions-item>
          <el-descriptions-item label="状态"><el-tag :type="sTag[detail.status] || 'info'">{{ sLabel[detail.status] || detail.status }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="发起人">{{ detail.initiator_name }}</el-descriptions-item>
          <el-descriptions-item label="单据编号">{{ detail.business_code }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="details-title">审批节点</h4>
        <el-timeline>
          <el-timeline-item v-for="nd in (detail.nodes||[])" :key="nd.id"
            :type="nd.status==='approved'?'success':nd.status==='rejected'?'danger':nd.status==='in_progress'?'primary':'info'"
            :hollow="nd.status==='pending'">
            <strong>{{ nd.node_name }}</strong>
            <el-tag :type="sTag[nd.status] || 'info'" size="small" style="margin-left:8px">{{ nLabel[nd.status] || '待配置' }}</el-tag>
            <div v-if="nd.approver_type_label" style="font-size:12px;color:var(--color-text-secondary)">审批人: {{ nd.approver_type_label }}</div>
            <div v-if="nd.approver_name" style="font-size:12px;color:var(--color-text-secondary)">{{ nd.approver_name }} {{ nd.acted_at || '' }}</div>
            <div v-if="nd.comment" style="font-size:12px;color:var(--color-text-placeholder)">{{ nd.comment }}</div>
          </el-timeline-item>
        </el-timeline>
      </template>
    </el-dialog>

    <!-- 审批操作 -->
    <el-dialog v-model="approvalVis" :title="approvalAct==='approve'?'审批通过':'审批拒绝'" width="400px">
      <el-input v-model="approvalComment" type="textarea" :rows="3" placeholder="审批意见" />
      <template #footer>
        <el-button @click="approvalVis = false">取消</el-button>
        <el-button :type="approvalAct==='approve'?'success':'danger'" @click="submitApproval" :loading="saving">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { workflowApi } from '@/api/workflow'

const activeTab = ref('templates')
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
const approvalVis = ref(false)
const approvalAct = ref('approve')
const approvalComment = ref('')
const approvalRow = ref(null)

const btLabel = { purchase_order:'采购订单', purchase_requisition:'采购请购', expense:'费用报销', scrap:'报废审批', leave:'请假', sales_order:'销售订单', contract:'合同', ecn:'工程变更', production_plan:'生产计划' }
const sLabel = { pending:'待审批', in_progress:'审批中', approved:'已通过', rejected:'已拒绝', cancelled:'已取消', withdrawn:'已撤回' }
const sTag = { pending:'info', in_progress:'warning', approved:'success', rejected:'danger', cancelled:'info', withdrawn:'info' }
const nLabel = { pending:'待审批', in_progress:'审批中', approved:'已通过', rejected:'已拒绝', skipped:'已跳过', timeout:'已超时' }

const fetchData = async () => {
  loading.value = true
  try {
    let res
    if (activeTab.value === 'templates') res = await workflowApi.getTemplates({ page: page.value, pageSize: pageSize.value })
    else if (activeTab.value === 'initiated') res = await workflowApi.getMyInitiated({ page: page.value, pageSize: pageSize.value })
    else res = await workflowApi.getMyPending({ page: page.value, pageSize: pageSize.value })
    const d = res.data || res
    tableData.value = d.list || []
    total.value = d.total || 0
  } catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

const onTabChange = () => { page.value = 1; fetchData() }
const openTemplateForm = async (row) => {
  if (row) {
    try {
      const r = await workflowApi.getTemplateById(row.id)
      const detail = r.data || r
      form.value = { ...detail, nodes: detail.nodes || [] }
    } catch { form.value = { ...row, nodes: row.nodes || [] } }
  } else {
    form.value = { code:'', name:'', business_type:'', is_active:1, description:'', nodes:[] }
  }
  formVis.value = true
}

const saveTemplate = async () => {
  saving.value = true
  try {
    form.value.nodes.forEach((n, i) => { n.sequence = i; n.node_type = n.node_type || 'approval' })
    if (form.value.id) await workflowApi.updateTemplate(form.value.id, form.value)
    else await workflowApi.createTemplate(form.value)
    ElMessage.success('保存成功'); formVis.value = false; fetchData()
  } catch (e) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

const viewTemplate = async (row) => {
  try {
    const r = await workflowApi.getTemplateById(row.id)
    const data = r.data || r
    // 模板节点没有 status 字段，根据 node_type 补充默认值以便正确显示
    if (data.nodes) {
      data.nodes = data.nodes.map(n => ({
        ...n,
        status: n.node_type === 'start' ? 'approved' : n.node_type === 'end' ? 'pending' : 'pending',
        approver_type_label: { manager: '部门主管', user: '指定用户', role: '指定角色', self: '发起人' }[n.approver_type] || n.approver_type,
      }))
    }
    detail.value = { ...data, title: row.name, status: 'info', initiator_name: '-', business_code: row.code || '-' }
    detailVis.value = true
  } catch { ElMessage.error('获取详情失败') }
}

const delTemplate = async (id) => {
  try { await workflowApi.deleteTemplate(id); ElMessage.success('已删除'); fetchData() }
  catch { ElMessage.error('删除失败') }
}

const viewInstance = async (row) => {
  try { const r = await workflowApi.getInstanceById(row.instance_id || row.id); detail.value = r.data || r; detailVis.value = true }
  catch { ElMessage.error('获取详情失败') }
}

const openApproval = (row, act) => { approvalRow.value = row; approvalAct.value = act; approvalComment.value = ''; approvalVis.value = true }

const submitApproval = async () => {
  saving.value = true
  try {
    await workflowApi.approveNode(approvalRow.value.instance_id, { node_id: approvalRow.value.id, action: approvalAct.value, comment: approvalComment.value })
    ElMessage.success(approvalAct.value === 'approve' ? '已通过' : '已拒绝')
    approvalVis.value = false; fetchData()
  } catch (e) { ElMessage.error(e.message || '操作失败') }
  finally { saving.value = false }
}

onMounted(fetchData)
</script>

<style scoped>
/* 页面专属样式已由 common-styles.css 统一提供 */
</style>
