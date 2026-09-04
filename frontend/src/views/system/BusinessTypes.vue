<template>
  <div class="module-page business-types-container">
    <PageHeader title="系统字典管理" subtitle="管理业务类型、状态字典和通用选项">
      <template #actions>
<el-button v-permission="'system:business-types:create'" type="primary" :icon="Plus" @click="handleCreate">新增字典项</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="handleSearch"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="编码/名称/描述" clearable />
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="字典分组">
          <el-select v-model="searchForm.groupCode" placeholder="全部分组" clearable>
            <el-option
              v-for="group in businessTypeGroups"
              :key="group"
              :label="group"
              :value="group"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="业务分类">
          <el-select v-model="searchForm.category" placeholder="全部分类" clearable>
            <el-option
              v-for="option in BUSINESS_TYPE_CATEGORY_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable>
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table class="table-row-click" :data="tableData" v-loading="loading" border stripe
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))">
        <el-table-column prop="groupCode" label="字典分组" width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span style="font-weight: bold; color: var(--color-primary)">{{ row.groupCode || 'inventory_transaction' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="业务编码" width="180" show-overflow-tooltip />
        <el-table-column prop="name" label="业务名称" width="140" />
        <el-table-column label="业务分类" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.category" :type="getBusinessTypeCategoryColor(row.category)">
              {{ getBusinessTypeCategoryName(row.category) }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="标签颜色" width="100">
          <template #default="{ row }">
            <el-tag :type="row.tagType || 'info'">{{ row.tagType || '默认(info)' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="150" show-overflow-tooltip />
        <el-table-column label="图标" width="80">
          <template #default="{ row }">
            <el-icon v-if="row.icon" :style="{ color: row.color || 'var(--color-primary)' }">
              <component :is="getIconComponent(row.icon)" />
            </el-icon>
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="80" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.isSystem" type="info" size="small">系统内置</el-tag>
            <el-tag v-else type="success" size="small">自定义</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 || String(row.status) === '1' ? 'success' : 'danger'">
              {{ row.status === 1 || String(row.status) === '1' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="{ row }">
            <div class="table-actions">
              <el-popconfirm
                v-if="row.status !== 1 && String(row.status) !== '1'"
                title="确定要启用该类型吗？"
                @confirm="handleStatusChange(row, 1)"
              >
                <template #reference>
                  <el-button size="small" type="success" v-permission="'system:business-types:update'"><el-icon><Check /></el-icon> 启用</el-button>
                </template>
              </el-popconfirm>

              <el-popconfirm
                v-if="row.status === 1 || String(row.status) === '1'"
                title="确定要禁用该类型吗？"
                @confirm="handleStatusChange(row, 0)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button size="small" type="warning" v-permission="'system:business-types:update'"><el-icon><Close /></el-icon> 禁用</el-button>
                </template>
              </el-popconfirm>


              <el-button
                v-if="row.status !== 1 && String(row.status) !== '1'"
                size="small"
                @click="handleEdit(row)"

              v-permission="'system:business-types:update'"><el-icon><Edit /></el-icon> 编辑</el-button>

              <el-popconfirm
                v-if="row.status !== 1 && String(row.status) !== '1'"
                title="确定要删除该类型吗？此操作无法恢复。"
                @confirm="handleDelete(row)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button size="small" type="danger" v-permission="'system:business-types:delete'"><el-icon><Delete /></el-icon> 删除</el-button>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑/查看对话框 -->
    <AppDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :mode="dialogType === 'view' ? 'view' : 'form'"
      width="640px"
      content-width="wide"
    >
      <template v-if="dialogType === 'view'">
        <el-descriptions :column="1" border class="mb-20">
          <el-descriptions-item label="字典分组">{{ form.groupCode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="业务编码">{{ form.code || '-' }}</el-descriptions-item>
          <el-descriptions-item label="业务名称">{{ form.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="标签类型">
            <el-tag :type="form.tagType || 'info'">{{ tagOptions.find(t => t.value === form.tagType)?.label || '普通' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="顺序">{{ form.sortOrder ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="描述">{{ form.description || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="Number(form.status) === 1 ? 'success' : 'danger'">
              {{ Number(form.status) === 1 ? '启用' : '禁用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="系统内置">
            <el-tag :type="form.isSystem ? 'danger' : 'info'">{{ form.isSystem ? '是' : '否' }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </template>

      <el-form
        v-else
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="100px"
      >
        <el-form-item label="字典分组" prop="groupCode">
          <el-input
            v-model="form.groupCode"
            placeholder="如 warehouse_type"
          />
        </el-form-item>
        <el-form-item label="业务编码" prop="code">
          <el-input
            v-model="form.code"
            placeholder="请输入业务编码（英文）"
            :disabled="dialogType === 'edit' || dialogType === 'view'"
          />
        </el-form-item>
        <el-form-item label="业务名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入业务名称" />
        </el-form-item>
        <el-form-item label="标签类型" prop="tagType">
          <el-select
            v-model="form.tagType"
            placeholder="Element Plus 标签颜色类型"
            class="w-full"
          >
            <el-option label="默认 (Info)" value="info" />
            <el-option label="主色 (Primary)" value="primary" />
            <el-option label="成功 (Success)" value="success" />
            <el-option label="警告 (Warning)" value="warning" />
            <el-option label="危险 (Danger)" value="danger" />
          </el-select>
        </el-form-item>
        <el-form-item label="业务分类" prop="category">
          <el-select
            v-model="form.category"
            placeholder="主要用于出入库类型(可为空)"
            class="w-full"
            clearable
          >
            <el-option
              v-for="option in BUSINESS_TYPE_CATEGORY_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="请输入业务类型描述"
          />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="form.icon" placeholder="如: icon-download" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="form.color" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ dialogType === 'view' ? '关闭' : '取消' }}</el-button>
        <el-button v-if="dialogType !== 'view'" v-permission="dialogType === 'create' ? 'system:business-types:create' : 'system:business-types:update'" type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { Plus, Check, Close, Edit, Delete } from '@element-plus/icons-vue'
import { systemApi } from '@/api'
import { useDictionaryStore } from '@/stores/dictionary'
import {
  BUSINESS_TYPE_CATEGORY_OPTIONS,
  getBusinessTypeCategoryName,
  getBusinessTypeCategoryColor
} from '@/constants/systemConstants'

const dictionaryStore = useDictionaryStore()

// 搜索表单
const searchForm = reactive({
  groupCode: '',
  category: '',
  status: '',
  keyword: ''
})

// 分组选项
const businessTypeGroups = ref([])

// 获取字典分组
const loadBusinessGroups = async () => {
  try {
    const res = await systemApi.getBusinessTypeGroups()
    businessTypeGroups.value = res.data || []
  } catch(e) {
    console.error('加载分组失败:', e)
  }
}

// 表格数据
const tableData = ref([])
const loading = ref(false)

// 对话框
const dialogVisible = ref(false)
const dialogType = ref('create')
const dialogTitle = computed(() => {
  if (dialogType.value === 'create') return '新增字典项'
  if (dialogType.value === 'edit') return '编辑字典项'
  return '查看字典项'
})
const formRef = ref(null)
const submitting = ref(false)

// 表单数据初始值
const getInitialFormData = () => ({
  groupCode: 'inventory_transaction',
  code: '',
  name: '',
  category: '',
  tagType: 'info',
  description: '',
  icon: '',
  color: 'var(--color-primary)',
  sortOrder: 0,
  status: 1,
  isSystem: 0
})

// 表单数据
const form = reactive(getInitialFormData())

// 表单验证规则
const formRules = {
  groupCode: [
    { required: true, message: '请输入字典分组', trigger: 'blur' },
    { pattern: /^[a-z_]+$/, message: '分组只能包含小写字母和下划线', trigger: 'blur' }
  ],
  code: [
    { required: true, message: '请输入业务编码', trigger: 'blur' },
    { pattern: /^[a-z_A-Z0-9]+$/, message: '编码只能包含字母、数字和下划线', trigger: 'blur' }
  ],
  name: [
    { required: true, message: '请输入业务名称', trigger: 'blur' }
  ]
}

// 获取图标组件（简化处理）
const getIconComponent = () => {
  return 'Document'
}

// 加载数据
const loadTableData = async () => {
  loading.value = true
  try {
    const res = await systemApi.getBusinessTypes(searchForm)
    // axios拦截器已自动解包ResponseHandler格式
    const data = Array.isArray(res.data) ? res.data : []

    // 将布尔值转换为数字，避免触发状态变更
    tableData.value = data.map(item => ({
      ...item,
      status: item.status === true || String(item.status) === '1' ? 1 : 0
    }))
  } catch (error) {
    console.error('加载数据失败:', error)
    ElMessage.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

const refreshGlobalDictionary = async () => {
  try {
    await dictionaryStore.fetchDictionary(true)
  } catch (error) {
    console.error('刷新全局字典失败:', error)
  }
}

// 查询
const handleSearch = () => {
  loadTableData()
}

// 重置搜索
const resetSearch = () => {
  Object.assign(searchForm, {
    groupCode: '',
    category: '',
    status: '',
    keyword: ''
  })
  handleSearch()
}

// 新建
const handleCreate = () => {
  dialogType.value = 'create'
  Object.assign(form, getInitialFormData())
  dialogVisible.value = true
}

// 编辑
const handleEdit = (row) => {
  dialogType.value = 'edit'
  Object.assign(form, { ...row })
  dialogVisible.value = true
}

// 查看
const handleView = (row) => {
  dialogType.value = 'view'
  Object.assign(form, { ...row })
  dialogVisible.value = true
}

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    submitting.value = true
    try {
      if (dialogType.value === 'create') {
        await systemApi.createBusinessType(form)
        ElMessage.success('创建成功')
      } else {
        await systemApi.updateBusinessType(form.id, form)
        ElMessage.success('更新成功')
      }
      dialogVisible.value = false
      await refreshGlobalDictionary()
      loadBusinessGroups()
      loadTableData()
    } catch (error) {
      console.error('操作失败:', error)
      ElMessage.error(error.response?.data?.message || '操作失败')
    } finally {
      submitting.value = false
    }
  })
}

// 状态变更
const handleStatusChange = async (row, newStatus) => {
  // 如果状态没有变化，不执行任何操作
  if (row.status === newStatus) {
    return
  }

  const oldStatus = row.status
  row.status = newStatus // 先更新UI

  try {
    await systemApi.updateBusinessType(row.id, { status: newStatus })
    await refreshGlobalDictionary()
    // 不显示成功提示，避免频繁弹出
  } catch (error) {
    console.error('状态更新失败:', error)
    ElMessage.error(error.response?.data?.message || '状态更新失败')
    row.status = oldStatus // 回滚状态
  }
}

// 删除
const handleDelete = async (row) => {
  if (row.isSystem) {
    ElMessage.warning('系统内置业务类型不能删除')
    return
  }

  try {
    await ElMessageBox.confirm('确定要删除该业务类型吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    await systemApi.deleteBusinessType(row.id)
    ElMessage.success('删除成功')
    await refreshGlobalDictionary()
    loadBusinessGroups()
    loadTableData()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error(error.response?.data?.message || '删除失败')
    }
  }
}

// 初始化
onMounted(() => {
  loadBusinessGroups()
  loadTableData()
})
</script>

<style scoped>
.business-types-container {
  padding: 20px;
}

.header-card {
  margin-bottom: 20px;
}

.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.search-card {
  margin-bottom: 20px;
}

.search-form {
  margin-bottom: 0;
}

.data-card {
  min-height: 400px;
}
</style>
