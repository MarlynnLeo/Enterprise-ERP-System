<template>
  <div class="module-page page-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>通知规则</h2>
          <p class="subtitle">配置业务事件的自动通知推送规则</p>
        </div>
        <div class="operation-btns">
          <el-button v-permission="'system:notification-rules'" type="primary" @click="openForm()">新建规则</el-button>
        </div>
      </div>
    </el-card>

    <el-card class="data-card">
      <div class="filter-bar" style="margin-bottom: 16px">
        <el-row :gutter="12">
          <el-col :span="6">
            <el-input v-model="filters.keyword" placeholder="搜索规则名称" clearable @clear="fetchData" @keyup.enter="fetchData">
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
          </el-col>
          <el-col :span="5">
            <el-select v-model="filters.event_type" placeholder="事件类型" clearable @change="fetchData" style="width:100%">
              <el-option v-for="evt in supportedEvents" :key="evt.event_type" :label="evt.label" :value="evt.event_type" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-select v-model="filters.is_active" placeholder="状态" clearable @change="fetchData" style="width:100%">
              <el-option label="启用" :value="1" />
              <el-option label="禁用" :value="0" />
            </el-select>
          </el-col>
          <el-col :span="2">
            <el-button @click="fetchData">查询</el-button>
          </el-col>
        </el-row>
      </div>

      <el-table :data="tableData" v-loading="loading" border stripe>
        <el-table-column prop="name" label="规则名称" min-width="160" />
        <el-table-column prop="event_type" label="事件类型" width="200">
          <template #default="{ row }">{{ eventLabel(row.event_type) }}</template>
        </el-table-column>
        <el-table-column prop="recipient_type" label="接收人类型" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="recipientTagType(row.recipient_type)">{{ recipientLabel[row.recipient_type] || row.recipient_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title_template" label="标题模板" min-width="180" show-overflow-tooltip />
        <el-table-column prop="priority" label="优先级" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="priorityTag(row.priority)" size="small">{{ priorityLabel[row.priority] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="is_active" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="!!row.is_active"
              @change="(val) => toggleActive(row.id, val)"
              size="small"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-button link type="primary" @click="openForm(row)">编辑</el-button>
            <el-popconfirm title="确定删除此规则？" @confirm="deleteRule(row.id)">
              <template #reference>
                <el-button link type="danger">删除</el-button>
              </template>
            </el-popconfirm>
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

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="formVis" :title="form.id ? '编辑通知规则' : '新建通知规则'" width="720px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="规则名称" required>
              <el-input v-model="form.name" placeholder="例如：生产完工通知生产主管" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="事件类型" required>
              <el-select v-model="form.event_type" style="width:100%" @change="onEventChange">
                <el-option-group v-for="group in groupedEvents" :key="group.label" :label="group.label">
                  <el-option v-for="evt in group.items" :key="evt.event_type" :label="evt.label" :value="evt.event_type" />
                </el-option-group>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="接收人类型" required>
              <el-select v-model="form.recipient_type" style="width:100%">
                <el-option label="按权限" value="permission" />
                <el-option label="按角色" value="role" />
                <el-option label="按部门" value="department" />
                <el-option label="指定用户" value="user" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="优先级">
              <el-select v-model="form.priority" style="width:100%">
                <el-option label="低" :value="0" />
                <el-option label="中" :value="1" />
                <el-option label="高" :value="2" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="接收人配置" required>
          <el-input v-model="form.recipient_config_text" :placeholder="recipientPlaceholder" />
          <div class="form-hint">
            <template v-if="form.recipient_type === 'permission'">填写权限码，多个用英文逗号分隔，如：production:plans,production:tasks</template>
            <template v-else-if="form.recipient_type === 'role'">填写角色ID，多个用英文逗号分隔，如：7,8</template>
            <template v-else-if="form.recipient_type === 'department'">填写部门ID，多个用英文逗号分隔，如：1,2,3</template>
            <template v-else>填写用户ID，多个用英文逗号分隔，如：1,5,10</template>
          </div>
        </el-form-item>

        <el-divider content-position="left">通知模板</el-divider>

        <el-form-item label="标题模板" required>
          <el-input v-model="form.title_template" placeholder="例如：生产任务完工" />
        </el-form-item>
        <el-form-item label="内容模板" required>
          <el-input v-model="form.content_template" type="textarea" :rows="3" placeholder="支持 ${变量} 占位符，如：任务 ${taskCode} 已完工" />
          <div class="form-hint" v-if="currentEventVars.length > 0">
            可用变量：<el-tag v-for="v in currentEventVars" :key="v" size="small" type="info" style="margin: 2px">{{ '${' + v + '}' }}</el-tag>
          </div>
        </el-form-item>
        <el-form-item label="跳转链接">
          <el-input v-model="form.link_template" placeholder="前端页面路径，如：/production/task" />
        </el-form-item>

        <el-form-item label="启用">
          <el-switch v-model="form.is_active" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="formVis = false">取消</el-button>
        <el-button type="primary" @click="saveRule" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { notificationRuleApi } from '@/api/notificationRule'

const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const tableData = ref([])
const formVis = ref(false)
const supportedEvents = ref([])

const filters = ref({
  keyword: '',
  event_type: '',
  is_active: '',
})

const form = ref({
  name: '',
  event_type: '',
  recipient_type: 'permission',
  recipient_config_text: '',
  title_template: '',
  content_template: '',
  link_template: '',
  priority: 1,
  is_active: 1,
})

const recipientLabel = {
  permission: '按权限',
  role: '按角色',
  department: '按部门',
  user: '指定用户',
}

const recipientTagType = (type) => {
  const map = { permission: 'primary', role: 'warning', department: 'success', user: 'info' }
  return map[type] || 'info'
}

const priorityLabel = { 0: '低', 1: '中', 2: '高' }
const priorityTag = (p) => {
  const map = { 0: 'info', 1: 'primary', 2: 'danger' }
  return map[p] || 'info'
}

const recipientPlaceholder = computed(() => {
  const map = {
    permission: '权限码，如：production:plans,production:tasks',
    role: '角色ID，如：7,8',
    department: '部门ID，如：1,2',
    user: '用户ID，如：1,5,10',
  }
  return map[form.value.recipient_type] || ''
})

const eventLabel = (eventType) => {
  const evt = supportedEvents.value.find(e => e.event_type === eventType)
  return evt ? evt.label : eventType
}

const groupedEvents = computed(() => {
  const groups = {}
  for (const evt of supportedEvents.value) {
    const cat = evt.category || '其他'
    if (!groups[cat]) groups[cat] = { label: cat, items: [] }
    groups[cat].items.push(evt)
  }
  return Object.values(groups)
})

const currentEventVars = computed(() => {
  const evt = supportedEvents.value.find(e => e.event_type === form.value.event_type)
  return evt?.variables || []
})

const onEventChange = () => {
  // 选择事件后自动填充默认模板（仅在新建时且为空时）
}

// ---- API 调用 ----

const fetchData = async () => {
  loading.value = true
  try {
    const res = await notificationRuleApi.getRules({
      page: page.value,
      pageSize: pageSize.value,
      ...filters.value,
    })
    const data = res.data || res
    tableData.value = data.list || []
    total.value = data.total || 0
  } catch {
    ElMessage.error('加载通知规则失败')
  } finally {
    loading.value = false
  }
}

const fetchEvents = async () => {
  try {
    const res = await notificationRuleApi.getSupportedEvents()
    supportedEvents.value = res.data || res || []
  } catch {
    // 静默处理
  }
}

const openForm = (row) => {
  if (row) {
    const configArr = Array.isArray(row.recipient_config) ? row.recipient_config : []
    form.value = {
      ...row,
      recipient_config_text: configArr.join(','),
    }
  } else {
    form.value = {
      name: '',
      event_type: '',
      recipient_type: 'permission',
      recipient_config_text: '',
      title_template: '',
      content_template: '',
      link_template: '',
      priority: 1,
      is_active: 1,
    }
  }
  formVis.value = true
}

const parseConfigText = (text, type) => {
  const parts = String(text || '').split(',').map(s => s.trim()).filter(Boolean)
  if (type === 'permission') return parts
  return parts.map(Number).filter(n => Number.isInteger(n) && n > 0)
}

const saveRule = async () => {
  const payload = {
    ...form.value,
    recipient_config: parseConfigText(form.value.recipient_config_text, form.value.recipient_type),
  }
  delete payload.recipient_config_text

  if (!payload.name?.trim()) return ElMessage.warning('请填写规则名称')
  if (!payload.event_type) return ElMessage.warning('请选择事件类型')
  if (!payload.recipient_config || payload.recipient_config.length === 0) return ElMessage.warning('请配置接收人')
  if (!payload.title_template?.trim()) return ElMessage.warning('请填写标题模板')
  if (!payload.content_template?.trim()) return ElMessage.warning('请填写内容模板')

  saving.value = true
  try {
    if (payload.id) {
      await notificationRuleApi.updateRule(payload.id, payload)
    } else {
      await notificationRuleApi.createRule(payload)
    }
    ElMessage.success('保存成功')
    formVis.value = false
    fetchData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const deleteRule = async (id) => {
  try {
    await notificationRuleApi.deleteRule(id)
    ElMessage.success('已删除')
    fetchData()
  } catch {
    ElMessage.error('删除失败')
  }
}

const toggleActive = async (id, val) => {
  try {
    await notificationRuleApi.toggleActive(id, val)
    ElMessage.success(val ? '已启用' : '已禁用')
    fetchData()
  } catch {
    ElMessage.error('操作失败')
  }
}

onMounted(() => {
  fetchData()
  fetchEvents()
})
</script>

<style scoped>
.form-hint {
  color: var(--color-text-secondary, #909399);
  font-size: 12px;
  line-height: 1.6;
  margin-top: 4px;
}
</style>
