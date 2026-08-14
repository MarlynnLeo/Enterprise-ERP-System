<template>
  <div class="module-page page-container">
    <PageHeader title="通知规则" subtitle="通知策略与收件范围">
      <template #actions>
        <el-button
          v-permission="NOTIFICATION_PERMISSIONS.UPDATE"
          aria-label="责任组"
          @click="openResponsibilityDialog"
        >
          <el-icon><Setting /></el-icon>
          责任组
        </el-button>
        <el-button
          v-permission="NOTIFICATION_PERMISSIONS.CREATE"
          type="primary"
          @click="openForm()"
        >
          新建规则
        </el-button>
      </template>
    </PageHeader>

    <el-card class="data-card">
      <div class="filter-bar mb-md">
        <el-row :gutter="12">
          <el-col :span="6">
            <el-input
              v-model="filters.keyword"
              placeholder="搜索规则名称或事件"
              clearable
              @clear="fetchData"
              @keyup.enter="fetchData"
            >
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
          </el-col>
          <el-col :span="5">
            <el-select v-model="filters.eventType" placeholder="事件类型" clearable class="w-full" @change="fetchData">
              <el-option v-for="event in supportedEvents" :key="event.eventType" :label="event.label" :value="event.eventType" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-select v-model="filters.isActive" placeholder="状态" clearable class="w-full" @change="fetchData">
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
        <el-table-column prop="name" label="规则名称" min-width="170" />
        <el-table-column prop="eventType" label="事件类型" min-width="180">
          <template #default="{ row }">{{ eventLabel(row.eventType) }}</template>
        </el-table-column>
        <el-table-column prop="recipientType" label="收件方式" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="recipientTagType(row.recipientType)">
              {{ recipientLabel[row.recipientType] || row.recipientType }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="收件范围" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ recipientSummary(row) }}</template>
        </el-table-column>
        <el-table-column prop="titleTemplate" label="标题模板" min-width="180" show-overflow-tooltip />
        <el-table-column prop="priority" label="优先级" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="priorityTag(row.priority)" size="small">{{ priorityLabel[row.priority] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="isActive" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-switch
              v-permission="NOTIFICATION_PERMISSIONS.TOGGLE"
              :model-value="!!row.isActive"
              size="small"
              @change="(value) => toggleActive(row.id, value)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="280" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button size="small" v-permission="NOTIFICATION_PERMISSIONS.UPDATE" @click="openForm(row)">
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-button size="small" type="success" v-permission="NOTIFICATION_PERMISSIONS.TEST" @click="sendTest(row.id)">
                <el-icon><Promotion /></el-icon> 测试
              </el-button>
              <el-popconfirm title="删除后规则不再执行，确定删除吗？" @confirm="deleteRule(row.id)">
                <template #reference>
                  <el-button size="small" type="danger" v-permission="NOTIFICATION_PERMISSIONS.DELETE">
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
      v-model="formVisible"
      :title="form.id ? '编辑通知规则' : '新建通知规则'"
      mode="form"
      width="760px"
    >
      <el-form :model="form" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="规则名称" required>
              <el-input v-model="form.name" placeholder="例如：财务部应收发票逾期提醒" maxlength="100" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="业务事件" required>
              <el-select v-model="form.eventType" class="w-full" filterable @change="onEventChange">
                <el-option-group v-for="group in groupedEvents" :key="group.label" :label="group.label">
                  <el-option v-for="event in group.items" :key="event.eventType" :label="event.label" :value="event.eventType" />
                </el-option-group>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="收件方式" required>
              <el-select v-model="form.recipientType" class="w-full" @change="onRecipientTypeChange">
                <el-option v-for="item in RECIPIENT_TYPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="优先级">
              <el-select v-model="form.priority" class="w-full">
                <el-option label="低" :value="0" />
                <el-option label="中" :value="1" />
                <el-option label="高" :value="2" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="收件范围" required>
          <el-select
            v-model="form.recipientConfig"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            class="w-full"
            :placeholder="recipientPlaceholder"
            @change="previewRecipients"
          >
            <template v-if="form.recipientType === RECIPIENT_TYPES.PERMISSION">
              <el-option-group v-for="group in permissionGroups" :key="group.label" :label="group.label">
                <el-option v-for="item in group.items" :key="item.code" :label="`${item.name || item.code} (${item.code})`" :value="item.code" />
              </el-option-group>
            </template>
            <el-option v-else-if="form.recipientType === RECIPIENT_TYPES.ROLE" v-for="item in options.roles" :key="item.id" :label="`${item.name}（${item.activeUserCount}名启用用户）`" :value="item.id" />
            <el-option v-else-if="form.recipientType === RECIPIENT_TYPES.DEPARTMENT" v-for="item in options.departments" :key="item.id" :label="`${item.name}（${item.activeUserCount}名启用用户）`" :value="item.id" />
            <el-option v-else v-for="item in options.users" :key="item.id" :label="formatUser(item)" :value="item.id" />
          </el-select>
        </el-form-item>

        <el-alert
          v-if="preview"
          class="preview-alert"
          :type="preview.exceedsBroadcastThreshold ? 'error' : preview.warnings.length ? 'warning' : 'success'"
          :closable="false"
          show-icon
          :title="`预计发送给 ${preview.count} 人 / 当前启用用户 ${preview.totalActiveUsers} 人`"
        >
          <template #default>
            <div v-for="warning in preview.warnings" :key="warning">{{ warning }}</div>
            <div v-if="preview.recipients.length">{{ previewRecipientNames }}</div>
          </template>
        </el-alert>

        <el-divider content-position="left">通知模板</el-divider>
        <el-form-item label="标题模板" required>
          <el-input v-model="form.titleTemplate" placeholder="例如：应收发票逾期提醒" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="内容模板" required>
          <el-input v-model="form.contentTemplate" type="textarea" :rows="3" maxlength="2000" show-word-limit placeholder="支持 ${变量} 占位符" />
          <div v-if="currentEventVars.length" class="form-hint">
            可用变量：
            <el-tag v-for="variable in currentEventVars" :key="variable" size="small" type="info" class="chip-gap">{{ '${' + variable + '}' }}</el-tag>
          </div>
        </el-form-item>
        <el-form-item label="跳转链接">
          <el-input v-model="form.linkTemplate" placeholder="只能填写系统内部路径，例如 /finance/ar/invoices" maxlength="200" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isActive" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRule">保存</el-button>
      </template>
        </AppDialog>

    <AppDialog
      v-model="responsibilityVisible"
      title="通知责任组"
      mode="form"
      width="min(680px, calc(100vw - 24px))"
    >
      <el-form class="responsibility-form" :model="responsibilityForm" label-width="100px">
        <el-form-item label="责任组">
          <el-select v-model="responsibilityForm.code" class="w-full" @change="selectResponsibility">
            <el-option
              v-for="item in responsibilities"
              :key="item.code"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="收件方式" required>
          <el-segmented
            v-model="responsibilityForm.recipientType"
            :options="RECIPIENT_TYPE_OPTIONS"
            @change="clearResponsibilityRecipients"
          />
        </el-form-item>
        <el-form-item label="责任范围" required>
          <el-select
            v-model="responsibilityForm.recipientConfig"
            class="w-full"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            @change="previewResponsibility"
          >
            <template v-if="responsibilityForm.recipientType === RECIPIENT_TYPES.PERMISSION">
              <el-option-group v-for="group in permissionGroups" :key="group.label" :label="group.label">
                <el-option v-for="item in group.items" :key="item.code" :label="`${item.name || item.code} (${item.code})`" :value="item.code" />
              </el-option-group>
            </template>
            <el-option v-else-if="responsibilityForm.recipientType === RECIPIENT_TYPES.ROLE" v-for="item in options.roles" :key="item.id" :label="`${item.name}（${item.activeUserCount}名启用用户）`" :value="item.id" />
            <el-option v-else-if="responsibilityForm.recipientType === RECIPIENT_TYPES.DEPARTMENT" v-for="item in options.departments" :key="item.id" :label="`${item.name}（${item.activeUserCount}名启用用户）`" :value="item.id" />
            <el-option v-else v-for="item in options.users" :key="item.id" :label="formatUser(item)" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-alert
          v-if="responsibilityPreview"
          :closable="false"
          show-icon
          :type="responsibilityPreview.warnings.length ? 'warning' : 'success'"
          :title="`责任范围包含 ${responsibilityPreview.count} 名启用用户`"
        >
          <template #default>
            <div v-for="warning in responsibilityPreview.warnings" :key="warning">{{ warning }}</div>
            <div>{{ responsibilityPreview.recipients.slice(0, 12).map(formatUser).join('、') }}</div>
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="responsibilityVisible = false">取消</el-button>
        <el-button type="primary" :loading="responsibilitySaving" @click="saveResponsibility">保存</el-button>
      </template>
        </AppDialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Setting, Edit, Delete, Promotion } from '@element-plus/icons-vue'
import { notificationRuleApi } from '@/api/notificationRule'
import {
  NOTIFICATION_PERMISSIONS,
  RECIPIENT_TYPES,
  RECIPIENT_TYPE_OPTIONS,
} from '@/constants/notification'

const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const tableData = ref([])
const formVisible = ref(false)
const supportedEvents = ref([])
const preview = ref(null)
const responsibilities = ref([])
const responsibilityVisible = ref(false)
const responsibilitySaving = ref(false)
const responsibilityPreview = ref(null)
const responsibilityForm = ref({ code: '', name: '', recipientType: RECIPIENT_TYPES.PERMISSION, recipientConfig: [] })
const options = ref({ permissions: [], roles: [], departments: [], users: [] })

const filters = ref({ keyword: '', eventType: '', isActive: '' })
const form = ref(createEmptyForm())

function createEmptyForm() {
  return {
    name: '',
    eventType: '',
    recipientType: RECIPIENT_TYPES.PERMISSION,
    recipientConfig: [],
    titleTemplate: '',
    contentTemplate: '',
    linkTemplate: '',
    priority: 1,
    isActive: 1,
  }
}

const recipientLabel = Object.fromEntries(RECIPIENT_TYPE_OPTIONS.map((item) => [item.value, item.label]))
const priorityLabel = { 0: '低', 1: '中', 2: '高' }

const recipientTagType = (type) => ({ permission: 'primary', role: 'warning', department: 'success', user: 'info' }[type] || 'info')
const priorityTag = (priority) => ({ 0: 'info', 1: 'primary', 2: 'danger' }[priority] || 'info')
const eventLabel = (eventType) => supportedEvents.value.find((event) => event.eventType === eventType)?.label || eventType
const currentEvent = computed(() => supportedEvents.value.find((event) => event.eventType === form.value.eventType))
const currentEventVars = computed(() => currentEvent.value?.variables || [])
const groupedEvents = computed(() => groupBy(supportedEvents.value, (event) => event.category || '其他'))
const permissionGroups = computed(() => groupBy(options.value.permissions, (item) => item.module || '其他'))
const previewRecipientNames = computed(() => {
  if (!preview.value?.recipients?.length) return ''
  return preview.value.recipients.slice(0, 12).map(formatUser).join('、') + (preview.value.count > 12 ? ' 等' : '')
})
const recipientPlaceholder = computed(() => ({
  permission: '搜索权限名称或权限码',
  role: '搜索角色',
  department: '搜索部门',
  user: '搜索启用用户',
}[form.value.recipientType]))

function groupBy(items, keyGetter) {
  const grouped = new Map()
  items.forEach((item) => {
    const key = keyGetter(item)
    if (!grouped.has(key)) grouped.set(key, { label: key, items: [] })
    grouped.get(key).items.push(item)
  })
  return [...grouped.values()]
}

function formatUser(user) {
  return `${user.realName || user.username || `用户${user.id}`}（${user.departmentName || '未分配部门'}）`
}

function recipientSummary(row) {
  const config = Array.isArray(row.recipientConfig) ? row.recipientConfig : []
  if (row.recipientType === RECIPIENT_TYPES.PERMISSION) return config.join('、')
  const source = row.recipientType === RECIPIENT_TYPES.ROLE ? options.value.roles : row.recipientType === RECIPIENT_TYPES.DEPARTMENT ? options.value.departments : options.value.users
  return config.map((id) => {
    const item = source.find((candidate) => Number(candidate.id) === Number(id))
    return item ? (row.recipientType === RECIPIENT_TYPES.USER ? formatUser(item) : item.name) : `ID:${id}`
  }).join('、')
}

function normalizeResponse(response) {
  return response?.data ?? response ?? {}
}

async function fetchData() {
  loading.value = true
  try {
    const data = normalizeResponse(await notificationRuleApi.getRules({ page: page.value, pageSize: pageSize.value, ...filters.value }))
    tableData.value = data.list || []
    total.value = Number(data.total || 0)
  } catch {
    ElMessage.error('加载通知规则失败')
  } finally {
    loading.value = false
  }
}

async function loadMetadata() {
  try {
    const [eventsResponse, optionsResponse, responsibilitiesResponse] = await Promise.all([
      notificationRuleApi.getSupportedEvents(),
      notificationRuleApi.getRecipientOptions(),
      notificationRuleApi.getResponsibilities(),
    ])
    supportedEvents.value = normalizeResponse(eventsResponse)
    options.value = normalizeResponse(optionsResponse)
    responsibilities.value = normalizeResponse(responsibilitiesResponse)
  } catch {
    ElMessage.error('加载通知配置选项失败')
  }
}

function openResponsibilityDialog() {
  responsibilityVisible.value = true
  const first = responsibilities.value[0]
  if (first) selectResponsibility(first.code)
}

function selectResponsibility(code) {
  const selected = responsibilities.value.find((item) => item.code === code)
  if (!selected) return
  responsibilityForm.value = {
    code: selected.code,
    name: selected.name,
    recipientType: selected.recipientType,
    recipientConfig: [...(selected.recipientConfig || [])],
  }
  responsibilityPreview.value = selected.preview || null
}

function clearResponsibilityRecipients() {
  responsibilityForm.value.recipientConfig = []
  responsibilityPreview.value = null
}

async function previewResponsibility() {
  if (!responsibilityForm.value.recipientConfig.length) {
    responsibilityPreview.value = null
    return
  }
  try {
    responsibilityPreview.value = normalizeResponse(await notificationRuleApi.previewRecipients({
      recipientType: responsibilityForm.value.recipientType,
      recipientConfig: responsibilityForm.value.recipientConfig,
    }))
  } catch (error) {
    responsibilityPreview.value = null
    ElMessage.warning(error.response?.data?.message || '无法预览责任范围')
  }
}

async function saveResponsibility() {
  if (!responsibilityForm.value.code) return ElMessage.warning('请选择责任组')
  if (!responsibilityForm.value.recipientConfig.length) return ElMessage.warning('请选择责任范围')
  responsibilitySaving.value = true
  try {
    await notificationRuleApi.updateResponsibility(responsibilityForm.value.code, responsibilityForm.value)
    ElMessage.success('责任组已更新')
    responsibilityVisible.value = false
    await loadMetadata()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '责任组保存失败')
  } finally {
    responsibilitySaving.value = false
  }
}

function openForm(row) {
  preview.value = null
  form.value = row
    ? {
        ...createEmptyForm(),
        ...row,
        recipientConfig: Array.isArray(row.recipientConfig) ? [...row.recipientConfig] : [],
      }
    : createEmptyForm()
  formVisible.value = true
  if (form.value.recipientConfig.length) previewRecipients()
}

function onRecipientTypeChange() {
  form.value.recipientConfig = []
  preview.value = null
}

function onEventChange() {
  const event = currentEvent.value
  if (!event) return
  if (!form.value.titleTemplate) form.value.titleTemplate = event.defaultTitle || event.label
  if (!form.value.contentTemplate) form.value.contentTemplate = event.defaultContent || `${event.label}已触发。`
  if (!form.value.linkTemplate) form.value.linkTemplate = event.defaultLink || ''
}

async function previewRecipients() {
  if (!form.value.recipientConfig.length) {
    preview.value = null
    return
  }
  try {
    preview.value = normalizeResponse(await notificationRuleApi.previewRecipients({
      recipientType: form.value.recipientType,
      recipientConfig: form.value.recipientConfig,
    }))
  } catch (error) {
    preview.value = null
    ElMessage.warning(error.response?.data?.message || '无法预览当前收件范围')
  }
}

async function saveRule() {
  if (!form.value.name.trim()) return ElMessage.warning('请填写规则名称')
  if (!form.value.eventType) return ElMessage.warning('请选择业务事件')
  if (!form.value.recipientConfig.length) return ElMessage.warning('请选择收件范围')
  if (!form.value.titleTemplate.trim()) return ElMessage.warning('请填写标题模板')
  if (!form.value.contentTemplate.trim()) return ElMessage.warning('请填写内容模板')

  saving.value = true
  try {
    const payload = { ...form.value }
    if (payload.id) await notificationRuleApi.updateRule(payload.id, payload)
    else await notificationRuleApi.createRule(payload)
    ElMessage.success('保存成功')
    formVisible.value = false
    await fetchData()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function deleteRule(id) {
  try {
    await notificationRuleApi.deleteRule(id)
    ElMessage.success('规则已删除')
    await fetchData()
  } catch {
    ElMessage.error('删除失败')
  }
}

async function toggleActive(id, value) {
  try {
    await notificationRuleApi.toggleActive(id, value)
    ElMessage.success(value ? '规则已启用' : '规则已禁用')
    await fetchData()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '启停失败，规则可能未通过收件范围校验')
    await fetchData()
  }
}

async function sendTest(id) {
  try {
    await ElMessageBox.confirm('测试通知只会发送给当前登录用户，不会发送给实际收件人。', '发送测试通知', { type: 'info' })
    await notificationRuleApi.sendTest(id)
    ElMessage.success('测试通知已发送给当前用户')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.response?.data?.message || '测试发送失败')
  }
}

onMounted(async () => {
  await loadMetadata()
  await fetchData()
})
</script>

<style scoped>
.form-hint {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
  margin-top: 4px;
}

.preview-alert {
  margin: 4px 0 16px;
}

.chip-gap {
  margin: 0 4px 4px 0;
}

@media (max-width: 600px) {
  .responsibility-form :deep(.el-form-item) {
    display: block;
  }

  .responsibility-form :deep(.el-form-item__label) {
    display: block;
    width: auto !important;
    height: auto;
    margin-bottom: 6px;
    line-height: 1.4;
    text-align: left;
  }

  .responsibility-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }

  .responsibility-form :deep(.el-segmented) {
    width: 100%;
  }
}
</style>
