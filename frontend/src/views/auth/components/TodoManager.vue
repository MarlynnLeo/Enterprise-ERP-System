<template>
  <div>
    <!-- 待办统计卡片 -->
    <el-row :gutter="15" class="todo-stats">
      <el-col :span="6">
        <el-card class="stat-mini-card" shadow="hover">
          <div class="mini-stat">
            <el-icon class="mini-icon" color="#409eff">
              <Document />
            </el-icon>
            <div class="mini-content">
              <div class="mini-value">{{ todos.length }}</div>
              <div class="mini-label">全部待办</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-mini-card" shadow="hover">
          <div class="mini-stat">
            <el-icon class="mini-icon" color="#67c23a">
              <CircleCheck />
            </el-icon>
            <div class="mini-content">
              <div class="mini-value">{{ completedCount }}</div>
              <div class="mini-label">已完成</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-mini-card" shadow="hover">
          <div class="mini-stat">
            <el-icon class="mini-icon" color="#e6a23c">
              <Clock />
            </el-icon>
            <div class="mini-content">
              <div class="mini-value">{{ upcomingCount }}</div>
              <div class="mini-label">即将到期</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-mini-card" shadow="hover">
          <div class="mini-stat">
            <el-icon class="mini-icon" color="#f56c6c">
              <WarningFilled />
            </el-icon>
            <div class="mini-content">
              <div class="mini-value">{{ overdueCount }}</div>
              <div class="mini-label">已逾期</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 待办列表卡片 -->
    <el-card class="glass-card todo-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-icon class="header-icon" color="#67c23a">
              <List />
            </el-icon>
            <span class="header-title">我的待办 ({{ filteredTodos.length }})</span>
          </div>
          <el-button type="primary" size="small" @click="openDialog">
            <el-icon><Plus /></el-icon> 添加
          </el-button>
        </div>
      </template>

      <!-- 筛选工具栏 -->
      <div class="todo-toolbar">
        <el-input
          v-model="searchQuery"
          placeholder="搜索待办..."
          prefix-icon="Search"
          clearable
          style="flex: 1; max-width: 300px"
        />
        <el-select v-model="filterStatus" placeholder="状态">
          <el-option label="全部" value="all" />
          <el-option label="未完成" value="active" />
          <el-option label="已完成" value="completed" />
          <el-option label="即将到期" value="upcoming" />
          <el-option label="已逾期" value="overdue" />
        </el-select>
        <el-select v-model="sortBy" placeholder="排序">
          <el-option label="截止日期" value="deadline" />
          <el-option label="优先级" value="priority" />
          <el-option label="创建日期" value="created" />
        </el-select>
        
        <el-button-group class="ml-auto">
          <el-button @click="handleExport" title="导出">
            <el-icon><Download /></el-icon>
          </el-button>
          <el-button @click="triggerFileInput" title="导入">
            <el-icon><Upload /></el-icon>
          </el-button>
        </el-button-group>
        <input 
          type="file" 
          ref="fileInputRef" 
          accept=".json" 
          style="display: none" 
          @change="handleImport" 
        />
      </div>

      <!-- 待办列表 -->
      <div class="todo-list">
        <el-empty v-if="filteredTodos.length === 0" description="暂无待办事项" />

        <transition-group name="list" tag="div">
          <div
            v-for="(todo) in filteredTodos"
            :key="todo.id"
            class="todo-item"
            :class="{
              'todo-completed': todo.completed,
              'todo-overdue': isOverdue(todo) && !todo.completed,
              'todo-upcoming': isUpcoming(todo) && !todo.completed
            }"
          >
            <el-checkbox
              v-model="todo.completed"
              @change="toggleStatus(todo)"
              size="large"
            />

            <div class="todo-content">
              <div class="todo-header">
                <span class="todo-title" :class="{ completed: todo.completed }">
                  {{ todo.title }}
                </span>
                <el-tag
                  v-if="isOverdue(todo) && !todo.completed"
                  type="danger"
                  size="small"
                  effect="dark"
                >已逾期</el-tag>
                <el-tag
                  v-else-if="isUpcoming(todo) && !todo.completed"
                  type="warning"
                  size="small"
                  effect="dark"
                >即将到期</el-tag>
              </div>

              <div class="todo-meta">
                <span class="todo-date">
                  <el-icon><Calendar /></el-icon>
                  {{ formatDate(todo.deadline) }}
                  <span v-if="!todo.completed" class="countdown">
                    · {{ formatCountdown(todo.deadline) }}
                  </span>
                </span>
                <el-tag
                  :type="getPriorityType(todo.priority)"
                  size="small"
                >
                  {{ getPriorityText(todo.priority) }}
                </el-tag>
              </div>

              <div v-if="todo.description" class="todo-desc">
                {{ todo.description }}
              </div>
            </div>

            <div class="todo-actions">
              <el-button text circle @click="editTodo(todo)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button text circle type="danger" @click="deleteTodo(todo.id)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </transition-group>
      </div>
    </el-card>

    <!-- 弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑待办' : '新建待办'"
      width="500px"
      destroy-on-close
    >
      <el-form :model="form" ref="formRef" :rules="rules" label-width="80px">
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" placeholder="待办事项标题" />
        </el-form-item>
        <el-form-item label="截止时间" prop="deadline">
          <el-date-picker
            v-model="form.deadline"
            type="datetime"
            placeholder="选择截止时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="form.priority">
            <el-radio :value="3">高</el-radio>
            <el-radio :value="2">中</el-radio>
            <el-radio :value="1">低</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="详细描述（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSubmit">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import {
  Document, CircleCheck, Clock, WarningFilled, List, Plus, Search,
  Download, Upload, Calendar, Edit, Delete
} from '@element-plus/icons-vue'
import { dayjs } from 'element-plus'

const props = defineProps({
  todos: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:todos', 'save', 'delete', 'toggle', 'import', 'export'])

// 状态
const searchQuery = ref('')
const filterStatus = ref('all')
const sortBy = ref('deadline')
const dialogVisible = ref(false)
const editingId = ref(null)
const fileInputRef = ref(null)

const form = reactive({
  title: '',
  deadline: new Date(),
  priority: 2,
  description: '',
  completed: false
})

const formRef = ref(null)
const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  deadline: [{ required: true, message: '请选择截止时间', trigger: 'change' }]
}

// 统计
const completedCount = computed(() => props.todos.filter(t => t.completed).length)
const upcomingCount = computed(() => props.todos.filter(t => !t.completed && isUpcoming(t)).length)
const overdueCount = computed(() => props.todos.filter(t => !t.completed && isOverdue(t)).length)

// 过滤和排序
const filteredTodos = computed(() => {
  let result = [...props.todos]

  // 搜索
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(t => t.title.toLowerCase().includes(q))
  }

  // 过滤
  if (filterStatus.value !== 'all') {
    const now = new Date()
    switch (filterStatus.value) {
      case 'active':
        result = result.filter(t => !t.completed)
        break
      case 'completed':
        result = result.filter(t => t.completed)
        break
      case 'upcoming':
        result = result.filter(t => !t.completed && isUpcoming(t))
        break
      case 'overdue':
        result = result.filter(t => !t.completed && isOverdue(t))
        break
    }
  }

  // 排序
  result.sort((a, b) => {
    if (sortBy.value === 'priority') return b.priority - a.priority
    if (sortBy.value === 'created') return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    return new Date(a.deadline) - new Date(b.deadline)
  })

  return result
})

// 辅助函数
const isOverdue = (todo) => new Date(todo.deadline) < new Date()
const isUpcoming = (todo) => {
  const diff = new Date(todo.deadline) - new Date()
  return diff > 0 && diff < 86400000 * 3 // 3天内
}

// formatDate 已统一引用公共实现

// 日期格式化
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
};

const getPriorityText = (p) => ({ 3: '高', 2: '中', 1: '低' }[p])
const getPriorityType = (p) => ({ 3: 'danger', 2: 'warning', 1: 'info' }[p])

// 操作
const openDialog = () => {
  editingId.value = null
  Object.assign(form, {
    title: '',
    deadline: new Date(Date.now() + 86400000),
    priority: 2,
    description: '',
    completed: false
  })
  dialogVisible.value = true
}

const editTodo = (todo) => {
  editingId.value = todo.id
  Object.assign(form, { ...todo, deadline: new Date(todo.deadline) })
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate((valid) => {
    if (valid) {
      emit('save', { ...form, id: editingId.value })
      dialogVisible.value = false
    }
  })
}

const deleteTodo = (id) => emit('delete', id)
const toggleStatus = (todo) => emit('toggle', todo)
const handleExport = () => emit('export')
const triggerFileInput = () => fileInputRef.value.click()
const handleImport = (e) => emit('import', e.target.files[0])
</script>

<style scoped>
.todo-stats {
  margin-bottom: 24px;
}

.stat-mini-card {
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s;
}

.stat-mini-card:hover {
  transform: translateY(-4px);
}

.mini-stat {
  display: flex;
  align-items: center;
  gap: 16px;
}

.mini-icon {
  font-size: 32px;
  background: var(--el-fill-color-light);
  padding: 8px;
  border-radius: 12px;
}

.mini-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.mini-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.glass-card {
  border-radius: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  font-weight: 600;
}

.todo-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.ml-auto {
  margin-left: auto;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  border-radius: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-left: 4px solid var(--el-color-primary);
  transition: all 0.2s;
}

.todo-item:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transform: translateX(4px);
}

.todo-completed {
  opacity: 0.6;
  border-left-color: var(--el-color-success);
  background: var(--el-fill-color-lighter);
}

.todo-overdue {
  border-left-color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.todo-upcoming {
  border-left-color: var(--el-color-warning);
}

.todo-content {
  flex: 1;
  min-width: 0;
}

.todo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.todo-title {
  font-weight: 500;
  font-size: 15px;
}

.todo-title.completed {
  text-decoration: line-through;
  color: var(--el-text-color-secondary);
}

.todo-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.todo-date {
  display: flex;
  align-items: center;
  gap: 4px;
}

.countdown {
  color: var(--el-color-primary);
  font-weight: 500;
}

.todo-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.todo-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.todo-item:hover .todo-actions {
  opacity: 1;
}

/* 列表动画 */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
