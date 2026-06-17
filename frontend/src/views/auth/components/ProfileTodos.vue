<template>
  <el-card class="profile-card profile-todos-card" shadow="hover">
    <template #header>
      <div class="todo-header">
        <div class="todo-heading">
          <span class="todo-heading-icon">
            <el-icon><Tickets /></el-icon>
          </span>
          <div>
            <h3>待办事项</h3>
            <p>管理当前账号的待办、已办和临期任务</p>
          </div>
        </div>
        <div class="todo-actions">
          <el-button :loading="loading" @click="loadTodos">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
          <el-button type="primary" @click="openCreateDialog">
            <el-icon><Plus /></el-icon>
            新建待办
          </el-button>
        </div>
      </div>
    </template>

    <div class="todo-summary-grid">
      <div class="summary-card">
        <span class="summary-icon summary-icon--primary">
          <el-icon><Tickets /></el-icon>
        </span>
        <div>
          <strong>{{ todoStats.active }}</strong>
          <span>待处理</span>
        </div>
      </div>
      <div class="summary-card">
        <span class="summary-icon summary-icon--success">
          <el-icon><CircleCheck /></el-icon>
        </span>
        <div>
          <strong>{{ todoStats.completed }}</strong>
          <span>已完成</span>
        </div>
      </div>
      <div class="summary-card">
        <span class="summary-icon summary-icon--warning">
          <el-icon><Timer /></el-icon>
        </span>
        <div>
          <strong>{{ todoStats.today }}</strong>
          <span>今日到期</span>
        </div>
      </div>
      <div class="summary-card">
        <span class="summary-icon summary-icon--danger">
          <el-icon><WarningFilled /></el-icon>
        </span>
        <div>
          <strong>{{ todoStats.overdue }}</strong>
          <span>已逾期</span>
        </div>
      </div>
    </div>

    <div class="todo-toolbar">
      <el-radio-group v-model="filters.status" class="status-tabs">
        <el-radio-button value="active">待办</el-radio-button>
        <el-radio-button value="completed">已完成</el-radio-button>
        <el-radio-button value="overdue">逾期</el-radio-button>
        <el-radio-button value="today">今日</el-radio-button>
        <el-radio-button value="all">全部</el-radio-button>
      </el-radio-group>

      <div class="todo-filter-controls">
        <el-select v-model="filters.priority" placeholder="优先级" class="priority-filter">
          <el-option label="全部优先级" value="all" />
          <el-option label="高优先级" :value="3" />
          <el-option label="中优先级" :value="2" />
          <el-option label="低优先级" :value="1" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          clearable
          class="todo-search"
          placeholder="搜索待办标题"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
    </div>

    <el-table
      v-loading="loading"
      :data="filteredTodos"
      class="todo-table"
      :row-class-name="getTodoRowClassName"
      empty-text="暂无待办事项"
    >
      <el-table-column label="事项" min-width="220">
        <template #default="{ row }">
          <div class="todo-title-cell">
            <div class="todo-title-line">
              <span class="todo-title" :class="{ completed: row.completed }">{{ row.title }}</span>
              <el-tag
                v-if="row.isShared"
                size="small"
                effect="plain"
                type="info"
              >
                协同
              </el-tag>
            </div>
            <span v-if="row.description" class="todo-description">{{ row.description }}</span>
            <div v-if="getParticipantNames(row).length" class="todo-meta-line">
              <el-icon><UserFilled /></el-icon>
              <span>协同：{{ getParticipantNames(row).join('、') }}</span>
            </div>
            <div v-else-if="row.parentTodoId && row.creator" class="todo-meta-line">
              <el-icon><UserFilled /></el-icon>
              <span>来自：{{ getUserDisplayName(row.creator) }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="优先级" width="104">
        <template #default="{ row }">
          <el-tag :type="getPriorityTagType(row.priority)" effect="light">
            {{ getPriorityText(row.priority) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="截止时间" width="170">
        <template #default="{ row }">
          <span :class="getDeadlineClass(row)">{{ formatDateTime(row.deadline) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="98">
        <template #default="{ row }">
          <el-tag :type="getStatusTagType(row)" effect="plain">
            {{ getStatusText(row) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button
              :type="row.completed ? 'info' : 'success'"
              size="small"
              @click="toggleTodo(row)"
            >
              {{ row.completed ? '恢复' : '完成' }}
            </el-button>
            <el-button size="small" @click="openEditDialog(row)">
              <el-icon><EditPen /></el-icon>
              编辑
            </el-button>
            <el-button type="danger" size="small" plain @click="removeTodo(row)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <div class="todo-empty">
          <el-icon><Tickets /></el-icon>
          <strong>暂无待办事项</strong>
          <span>可以新建一条待办，或切换筛选条件查看其他状态。</span>
          <el-button type="primary" @click="openCreateDialog">新建待办</el-button>
        </div>
      </template>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="editingTodo ? '编辑待办' : '新建待办'"
      width="560px"
      class="todo-dialog"
      append-to-body
      destroy-on-close
    >
      <el-form
        ref="todoFormRef"
        :model="todoForm"
        :rules="todoRules"
        label-width="86px"
      >
        <el-form-item label="标题" prop="title">
          <el-input v-model="todoForm.title" maxlength="100" show-word-limit placeholder="请输入待办标题" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="todoForm.description"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="补充待办说明"
          />
        </el-form-item>
        <el-form-item label="截止时间">
          <el-date-picker
            v-model="todoForm.deadline"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            placeholder="选择截止时间"
            class="todo-date-picker"
          />
        </el-form-item>
        <el-form-item label="优先级">
          <el-segmented v-model="todoForm.priority" :options="priorityOptions" />
        </el-form-item>
        <el-form-item v-if="canManageParticipants" label="协同人员">
          <el-select
            v-model="todoForm.participants"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            :loading="usersLoading"
            placeholder="选择完成后流转的人员"
            class="participant-select"
          >
            <el-option
              v-for="user in availableUsers"
              :key="user.id"
              :label="getUserDisplayName(user)"
              :value="user.id"
            >
              <div class="participant-option">
                <span>{{ getUserDisplayName(user) }}</span>
                <small>{{ user.email || user.username }}</small>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitTodo">
          {{ editingTodo ? '保存修改' : '创建待办' }}
        </el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Delete,
  EditPen,
  Plus,
  Refresh,
  Search,
  Tickets,
  Timer,
  UserFilled,
  WarningFilled
} from '@element-plus/icons-vue'
import { todoApi } from '@/api'
import { parseListData } from '@/utils/responseParser'

const props = defineProps({
  todoId: {
    type: [String, Number],
    default: ''
  }
})

const emit = defineEmits(['changed'])

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editingTodo = ref(null)
const todoFormRef = ref(null)
const todos = ref([])
const availableUsers = ref([])
const usersLoading = ref(false)

const filters = reactive({
  status: 'active',
  priority: 'all',
  keyword: ''
})

const todoForm = reactive({
  title: '',
  description: '',
  deadline: '',
  priority: 2,
  participants: []
})

const todoRules = {
  title: [
    { required: true, message: '请输入待办标题', trigger: 'blur' },
    { min: 1, max: 100, message: '标题长度不能超过 100 个字符', trigger: 'blur' }
  ]
}

const priorityOptions = [
  { label: '低', value: 1 },
  { label: '中', value: 2 },
  { label: '高', value: 3 }
]

const todoStats = computed(() => ({
  active: todos.value.filter(todo => !todo.completed).length,
  completed: todos.value.filter(todo => todo.completed).length,
  today: todos.value.filter(todo => !todo.completed && isToday(todo.deadline)).length,
  overdue: todos.value.filter(todo => isOverdue(todo)).length
}))

const canManageParticipants = computed(() => !editingTodo.value || !editingTodo.value.parentTodoId)

const filteredTodos = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()

  return todos.value
    .filter((todo) => {
      if (filters.status === 'active' && todo.completed) return false
      if (filters.status === 'completed' && !todo.completed) return false
      if (filters.status === 'overdue' && !isOverdue(todo)) return false
      if (filters.status === 'today' && !isToday(todo.deadline)) return false
      if (filters.priority !== 'all' && Number(todo.priority) !== Number(filters.priority)) return false
      if (!keyword) return true
      return `${todo.title || ''} ${todo.description || ''}`.toLowerCase().includes(keyword)
    })
    .sort(sortTodos)
})

watch(
  () => props.todoId,
  (todoId) => {
    if (todoId) {
      filters.status = 'all'
    }
  },
  { immediate: true }
)

onMounted(() => {
  loadTodos()
  loadAvailableUsers()
})

async function loadTodos() {
  loading.value = true
  try {
    const response = await todoApi.getAllTodos()
    todos.value = parseTodoList(response).map(normalizeTodo)
  } catch (error) {
    console.error('Load profile todos failed:', error)
    todos.value = []
    ElMessage.error('待办事项加载失败')
  } finally {
    loading.value = false
  }
}

function parseTodoList(response) {
  return parseListData(response, { enableLog: false })
}

function parseUserList(response) {
  return parseListData(response, { enableLog: false })
}

function normalizeTodo(todo) {
  const parentTodoId = todo.parentTodoId ?? todo.parent_todo_id ?? null

  return {
    ...todo,
    id: todo.id,
    title: todo.title || '',
    description: todo.description || '',
    priority: Number(todo.priority || 2),
    completed: todo.completed === true || todo.completed === 1,
    isShared: todo.isShared === true || todo.is_shared === true || todo.isShared === 1 || todo.is_shared === 1,
    parentTodoId,
    participants: Array.isArray(todo.participants) ? todo.participants : [],
    creator: todo.creator || null,
    deadline: todo.deadline || null,
    createdAt: todo.createdAt || todo.created_at || null,
    updatedAt: todo.updatedAt || todo.updated_at || null
  }
}

function normalizeUser(user) {
  return {
    ...user,
    id: Number(user.id)
  }
}

function sortTodos(a, b) {
  if (a.completed !== b.completed) return a.completed ? 1 : -1
  if (isOverdue(a) !== isOverdue(b)) return isOverdue(a) ? -1 : 1
  const aTime = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER
  const bTime = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER
  return aTime - bTime
}

function openCreateDialog() {
  editingTodo.value = null
  resetForm()
  loadAvailableUsers()
  dialogVisible.value = true
}

function openEditDialog(todo) {
  editingTodo.value = todo
  todoForm.title = todo.title
  todoForm.description = todo.description || ''
  todoForm.deadline = toPickerValue(todo.deadline)
  todoForm.priority = Number(todo.priority || 2)
  todoForm.participants = getParticipantIds(todo)
  loadAvailableUsers()
  dialogVisible.value = true
}

function resetForm() {
  todoForm.title = ''
  todoForm.description = ''
  todoForm.deadline = ''
  todoForm.priority = 2
  todoForm.participants = []
  todoFormRef.value?.clearValidate?.()
}

async function loadAvailableUsers() {
  usersLoading.value = true
  try {
    const response = await todoApi.getAvailableUsers()
    availableUsers.value = parseUserList(response)
      .map(normalizeUser)
      .filter(user => Number.isInteger(user.id) && user.id > 0)
  } catch (error) {
    console.error('Load todo collaborators failed:', error)
    availableUsers.value = []
  } finally {
    usersLoading.value = false
  }
}

async function submitTodo() {
  const valid = await todoFormRef.value?.validate?.().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const payload = {
      title: todoForm.title.trim(),
      description: todoForm.description.trim(),
      deadline: todoForm.deadline || null,
      priority: Number(todoForm.priority)
    }

    if (canManageParticipants.value) {
      payload.participants = [...todoForm.participants]
    }

    if (editingTodo.value) {
      await todoApi.updateTodo(editingTodo.value.id, {
        ...payload,
        completed: editingTodo.value.completed
      })
      ElMessage.success('待办事项已更新')
    } else {
      await todoApi.createTodo(payload)
      ElMessage.success('待办事项已创建')
    }

    dialogVisible.value = false
    await loadTodos()
    emit('changed')
  } catch (error) {
    console.error('Save profile todo failed:', error)
    ElMessage.error(error.response?.data?.message || '待办事项保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleTodo(todo) {
  try {
    await todoApi.toggleTodoStatus(todo.id)
    ElMessage.success(todo.completed ? '待办事项已恢复' : '待办事项已完成')
    await loadTodos()
    emit('changed')
  } catch (error) {
    console.error('Toggle profile todo failed:', error)
    ElMessage.error('待办状态更新失败')
  }
}

async function removeTodo(todo) {
  try {
    await ElMessageBox.confirm(`确认删除「${todo.title}」吗？`, '删除待办', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    })
    await todoApi.deleteTodo(todo.id)
    ElMessage.success('待办事项已删除')
    await loadTodos()
    emit('changed')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      console.error('Delete profile todo failed:', error)
      ElMessage.error('待办事项删除失败')
    }
  }
}

function getParticipantRecords(todo) {
  if (!Array.isArray(todo.participants)) return []
  return todo.participants.filter(participant => participant.role === 'participant')
}

function getParticipantIds(todo) {
  return getParticipantRecords(todo)
    .map(participant => Number(participant.userId ?? participant.user_id ?? participant.user?.id))
    .filter(id => Number.isInteger(id) && id > 0)
}

function getParticipantNames(todo) {
  return getParticipantRecords(todo)
    .map((participant) => {
      const name = getUserDisplayName(participant.user)
      const userId = participant.userId ?? participant.user_id
      return name || (userId ? `用户 ${userId}` : '')
    })
    .filter(Boolean)
}

function getUserDisplayName(user) {
  if (!user) return ''
  return user.real_name || user.realName || user.username || user.email || (user.id ? `用户 ${user.id}` : '')
}

function getPriorityText(priority) {
  const priorityMap = {
    1: '低',
    2: '中',
    3: '高'
  }
  return priorityMap[Number(priority)] || '中'
}

function getPriorityTagType(priority) {
  const typeMap = {
    1: 'info',
    2: 'warning',
    3: 'danger'
  }
  return typeMap[Number(priority)] || 'warning'
}

function getStatusText(todo) {
  if (todo.completed) return '已完成'
  if (isOverdue(todo)) return '已逾期'
  if (isToday(todo.deadline)) return '今日到期'
  return '待处理'
}

function getStatusTagType(todo) {
  if (todo.completed) return 'success'
  if (isOverdue(todo)) return 'danger'
  if (isToday(todo.deadline)) return 'warning'
  return 'primary'
}

function getDeadlineClass(todo) {
  return {
    'deadline-text': true,
    'deadline-text--overdue': isOverdue(todo),
    'deadline-text--today': !isOverdue(todo) && isToday(todo.deadline)
  }
}

function getTodoRowClassName({ row }) {
  return String(row.id) === String(props.todoId) ? 'is-current-todo' : ''
}

function isOverdue(todo) {
  if (!todo.deadline || todo.completed) return false
  return new Date(todo.deadline).getTime() < Date.now()
}

function isToday(value) {
  if (!value) return false
  const target = new Date(value)
  const now = new Date()
  return target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate()
}

function formatDateTime(value) {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未设置'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function toPickerValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
</script>

<style scoped>
.profile-todos-card {
  border-radius: 10px;
}

.profile-todos-card :deep(.el-card__header) {
  padding: 16px 18px;
}

.profile-todos-card :deep(.el-card__body) {
  padding: 18px;
}

.todo-header,
.todo-actions,
.todo-heading,
.todo-toolbar,
.todo-filter-controls,
.todo-title-line,
.row-actions {
  display: flex;
  align-items: center;
}

.todo-header {
  justify-content: space-between;
  gap: 14px;
}

.todo-heading {
  min-width: 0;
  gap: 12px;
}

.todo-heading h3 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 800;
}

.todo-heading p {
  margin: 3px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.todo-heading-icon,
.summary-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.todo-heading-icon {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  color: var(--el-color-white);
  background: var(--el-color-primary);
  font-size: 20px;
}

.todo-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.todo-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-extra-light);
}

.summary-card strong {
  display: block;
  color: var(--el-text-color-primary);
  font-size: 22px;
  line-height: 1.1;
}

.summary-card span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.summary-icon {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  font-size: 20px;
}

.summary-icon--primary {
  color: var(--el-color-white);
  background: var(--el-color-primary);
}

.summary-icon--success {
  color: var(--el-color-white);
  background: var(--el-color-success);
}

.summary-icon--warning {
  color: var(--el-color-white);
  background: var(--el-color-warning);
}

.summary-icon--danger {
  color: var(--el-color-white);
  background: var(--el-color-danger);
}

.todo-toolbar {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.status-tabs {
  flex: 0 0 auto;
}

.todo-filter-controls {
  min-width: 0;
  justify-content: flex-end;
  gap: 10px;
  flex: 1;
}

.priority-filter {
  width: 132px;
}

.todo-search {
  width: 240px;
}

.todo-table {
  width: 100%;
}

.todo-table :deep(.is-current-todo) {
  --el-table-tr-bg-color: var(--el-color-primary-light-9);
}

.todo-title-cell {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.todo-title-line {
  min-width: 0;
  gap: 8px;
}

.todo-meta-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.todo-meta-line span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-title {
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-title.completed {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
}

.todo-description {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deadline-text {
  color: var(--el-text-color-regular);
  font-size: 13px;
  white-space: nowrap;
}

.deadline-text--overdue {
  color: var(--el-color-danger);
  font-weight: 700;
}

.deadline-text--today {
  color: var(--el-color-warning);
  font-weight: 700;
}

.row-actions {
  flex-wrap: wrap;
  gap: 8px;
}

.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.todo-empty {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
}

.todo-empty .el-icon {
  color: var(--el-color-primary);
  font-size: 34px;
}

.todo-empty strong {
  color: var(--el-text-color-primary);
  font-size: 15px;
}

.todo-date-picker {
  width: 100%;
}

.participant-select {
  width: 100%;
}

.participant-option {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.participant-option small {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1200px) {
  .todo-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .todo-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .todo-filter-controls {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .profile-todos-card :deep(.el-card__body) {
    padding: 14px;
  }

  .todo-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .todo-actions,
  .todo-actions .el-button {
    width: 100%;
  }

  .todo-summary-grid {
    grid-template-columns: 1fr;
  }

  .status-tabs,
  .todo-filter-controls,
  .priority-filter,
  .todo-search {
    width: 100%;
  }

  .todo-filter-controls {
    flex-direction: column;
  }
}
</style>
