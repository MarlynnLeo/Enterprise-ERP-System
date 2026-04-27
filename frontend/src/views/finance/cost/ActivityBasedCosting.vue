<template>
  <div class="abc-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>作业成本法(ABC)</h2>
          <p class="subtitle">作业定义管理 / 成本动因配置 / ABC成本分配</p>
        </div>
        <div class="actions">
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon> 新增作业
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 主内容区 -->
    <el-card class="data-card">
      <el-tabs v-model="activeTab">
        <!-- 作业管理 -->
        <el-tab-pane label="作业管理" name="activities">
          <el-table :data="activityList" border v-loading="loading" stripe>
            <el-table-column prop="code" label="作业编码" width="120" />
            <el-table-column prop="name" label="作业名称" width="150" />
            <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
            <el-table-column label="成本池" width="130" align="right">
              <template #default="{ row }">
                {{ formatCurrency(row.cost_pool) }}
              </template>
            </el-table-column>
            <el-table-column label="成本动因" width="100" align="center">
              <template #default="{ row }">
                <el-tag size="small">{{ getDriverTypeLabel(row.cost_driver_type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="分配率" width="100" align="right">
              <template #default="{ row }">
                {{ row.driver_rate }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="String(row.status) === '1' ? 'success' : 'info'" size="small">
                  {{ String(row.status) === '1' ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="editActivity(row)" v-permission="'finance:cost:settings'">编辑</el-button>
                <el-button v-permission="'finance:cost:delete'" type="danger" size="small" @click="deleteActivity(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ABC汇总报表 -->
        <el-tab-pane label="ABC汇总报表" name="summary">
          <el-table :data="summaryList" border v-loading="summaryLoading" stripe>
            <el-table-column prop="code" label="作业编码" width="120" />
            <el-table-column prop="name" label="作业名称" width="150" />
            <el-table-column label="成本池" width="130" align="right">
              <template #default="{ row }">
                {{ formatCurrency(row.cost_pool) }}
              </template>
            </el-table-column>
            <el-table-column label="成本动因" width="100" align="center">
              <template #default="{ row }">
                {{ getDriverTypeLabel(row.cost_driver_type) }}
              </template>
            </el-table-column>
            <el-table-column label="动因总量" width="100" align="right">
              <template #default="{ row }">
                {{ row.total_driver_quantity }}
              </template>
            </el-table-column>
            <el-table-column label="已分配成本" width="130" align="right">
              <template #default="{ row }">
                <span class="allocated-cost">{{ formatCurrency(row.total_allocated_cost) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="product_count" label="关联产品" width="90" align="center" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑作业' : '新增作业'"
      width="500px"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="作业编码" prop="code">
          <el-input v-model="form.code" placeholder="如 ACT001" />
        </el-form-item>
        <el-form-item label="作业名称" prop="name">
          <el-input v-model="form.name" placeholder="如 机器加工" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="成本池" prop="cost_pool">
          <el-input-number v-model="form.cost_pool" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="成本动因" prop="cost_driver_type">
          <el-select v-model="form.cost_driver_type" style="width: 100%">
            <el-option
              v-for="item in driverTypes"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分配率" prop="driver_rate">
          <el-input-number v-model="form.driver_rate" :min="0" :precision="4" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { api } from '@/services/api'
import { formatCurrency } from '@/utils/helpers/formatters'

// 数据
const activeTab = ref('activities')
const activityList = ref([])
const summaryList = ref([])
const loading = ref(false)
const summaryLoading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)

const driverTypes = ref([
  { value: 'machine_hours', label: '机器工时' },
  { value: 'labor_hours', label: '人工工时' },
  { value: 'units', label: '生产数量' },
  { value: 'transactions', label: '作业次数' },
  { value: 'area', label: '占用面积' }
])

const form = ref({
  id: null,
  code: '',
  name: '',
  description: '',
  cost_pool: 0,
  cost_driver_type: 'labor_hours',
  driver_rate: 0,
  status: 1
})

const rules = {
  code: [{ required: true, message: '请输入作业编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入作业名称', trigger: 'blur' }],
  cost_driver_type: [{ required: true, message: '请选择成本动因', trigger: 'change' }]
}

// 获取动因类型标签
const getDriverTypeLabel = (type) => {
  const item = driverTypes.value.find(d => d.value === type)
  return item ? item.label : type
}

// 加载作业列表
const loadActivities = async () => {
  loading.value = true
  try {
    const res = await api.get('/finance/activity-cost/activities')
    activityList.value = res.data?.data || res.data || []
  } catch (error) {
    console.error('加载作业列表失败:', error)
    ElMessage.error('加载作业列表失败')
  } finally {
    loading.value = false
  }
}

// 加载汇总报表
const loadSummary = async () => {
  summaryLoading.value = true
  try {
    const res = await api.get('/finance/activity-cost/summary')
    summaryList.value = res.data?.data || res.data || []
  } catch (error) {
    console.error('加载汇总报表失败:', error)
  } finally {
    summaryLoading.value = false
  }
}

// 显示新增对话框
const showAddDialog = () => {
  isEdit.value = false
  form.value = {
    id: null,
    code: '',
    name: '',
    description: '',
    cost_pool: 0,
    cost_driver_type: 'labor_hours',
    driver_rate: 0,
    status: 1
  }
  dialogVisible.value = true
}

// 编辑作业
const editActivity = (row) => {
  isEdit.value = true
  // 将后端返回的字符串类型数值转换为 Number（避免 ElInputNumber 类型警告）
  form.value = {
    ...row,
    cost_pool: parseFloat(row.cost_pool) || 0,
    driver_rate: parseFloat(row.driver_rate) || 0
  }
  dialogVisible.value = true
}

// 删除作业
const deleteActivity = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除作业"${row.name}"吗？`, '提示', {
      type: 'warning'
    })
    await api.delete(`/finance/activity-cost/activities/${row.id}`)
    ElMessage.success('删除成功')
    loadActivities()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || '删除失败')
    }
  }
}

// 提交表单
const submitForm = async () => {
  try {
    await formRef.value.validate()
    if (isEdit.value) {
      await api.put(`/finance/activity-cost/activities/${form.value.id}`, form.value)
      ElMessage.success('更新成功')
    } else {
      await api.post('/finance/activity-cost/activities', form.value)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadActivities()
    loadSummary()
  } catch (error) {
    if (error !== false) {
      ElMessage.error(error.response?.data?.message || '操作失败')
    }
  }
}

// 初始化
onMounted(() => {
  loadActivities()
  loadSummary()
})
</script>

<style scoped>
.abc-container {
  padding: 20px;
}

.header-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section h2 {
  margin: 0;
  font-size: 22px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 5px 0 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.data-card {
  margin-bottom: 20px;
}

.allocated-cost {
  color: var(--color-success);
  font-weight: bold;
}
</style>
