<template>
  <div class="module-page expense-categories-container">
    <PageHeader title="费用类别" subtitle="维护费用分类、子类型和启停状态">
      <template #actions>
<el-button v-permission="'finance:expenses:create'" type="primary" @click="handleAdd(null)">
            <el-icon><Plus /></el-icon>
            新增一级类型
          </el-button>
      </template>
    </PageHeader>

    <el-card class="data-card">
      <el-table
        v-loading="loading"
        :data="categoryList"
        class="w-full"
        row-key="id"
        :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
        border
      >
        <template #empty>
          <el-empty description="暂无费用类型数据">
            <el-button v-permission="'system:settings:update'" type="primary" @click="handleInit">
              初始化预设类型
            </el-button>
          </el-empty>
        </template>
        <el-table-column prop="name" label="类型名称" min-width="200">
          <template #default="{ row }">
            <span :class="{ 'parent-category': !row.parent_id }">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="类型编码" width="150" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="sort_order" label="排序" width="80" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-switch
              v-model="row.status"
              :active-value="1"
              :inactive-value="0"
              @change="handleToggleStatus(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-button
              v-permission="'finance:expenses:update'"
              type="primary"
              size="small"
              link
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="!row.parent_id"
              v-permission="'finance:expenses:create'"
              type="success"
              size="small"
              link
              @click="handleAdd(row.id)"
            >
              添加子类
            </el-button>
            <el-button
              v-permission="'finance:expenses:delete'"
              type="danger"
              size="small"
              link
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'add' ? '新增费用类型' : '编辑费用类型'"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form ref="categoryFormRef" :model="categoryForm" :rules="categoryRules" label-width="100px">
        <el-form-item label="类型编码" prop="code">
          <el-input v-model="categoryForm.code" placeholder="如 CERT_ISO" :disabled="dialogMode === 'edit'" />
        </el-form-item>
        <el-form-item label="类型名称" prop="name">
          <el-input v-model="categoryForm.name" placeholder="请输入类型名称" />
        </el-form-item>
        <el-form-item label="上级类型">
          <el-select v-model="categoryForm.parent_id" placeholder="无（一级类型）" clearable class="w-full">
            <el-option
              v-for="cat in parentCategories"
              :key="cat.id"
              :label="cat.name"
              :value="cat.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="categoryForm.description" type="textarea" :rows="2" placeholder="类型描述" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="categoryForm.sort_order" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="categoryForm.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          v-permission="dialogMode === 'edit' ? 'finance:expenses:update' : 'finance:expenses:create'"
          type="primary"
          :loading="saving"
          @click="handleSave"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { financeApi } from '@/api'
import { parseListData } from '@/utils/responseParser'

const loading = ref(false)
const saving = ref(false)
const categoryList = ref([])

const dialogVisible = ref(false)
const dialogMode = ref('add')
const categoryFormRef = ref(null)
const categoryForm = reactive({
  id: null,
  code: '',
  name: '',
  parent_id: null,
  description: '',
  sort_order: 0,
  status: 1
})

const categoryRules = {
  code: [
    { required: true, message: '请输入类型编码', trigger: 'blur' },
    {
      pattern: /^[A-Z][A-Z0-9_]*$/,
      message: '编码需以大写字母开头，仅支持大写字母、数字和下划线',
      trigger: 'blur'
    }
  ],
  name: [{ required: true, message: '请输入类型名称', trigger: 'blur' }]
}

const parentCategories = computed(() => categoryList.value.filter(cat => !cat.parent_id))

const resetForm = (parentId = null) => {
  Object.assign(categoryForm, {
    id: null,
    code: '',
    name: '',
    parent_id: parentId,
    description: '',
    sort_order: 0,
    status: 1
  })
}

const fetchCategories = async () => {
  loading.value = true
  try {
    const res = await financeApi.getExpenseCategories({ tree: 'true' })
    categoryList.value = parseListData(res, { enableLog: false })
  } catch (error) {
    console.error('获取费用类型失败:', error)
    ElMessage.error(error.message || '获取费用类型失败')
  } finally {
    loading.value = false
  }
}

const handleInit = async () => {
  try {
    await ElMessageBox.confirm('将初始化预设费用类型数据，确定继续吗？', '初始化确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info'
    })

    loading.value = true
    await financeApi.initExpenseCategories()
    ElMessage.success('初始化成功')
    await fetchCategories()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('初始化失败: ' + (error.message || '未知错误'))
    }
  } finally {
    loading.value = false
  }
}

const handleAdd = (parentId = null) => {
  dialogMode.value = 'add'
  resetForm(parentId)
  dialogVisible.value = true
}

const handleEdit = (row) => {
  dialogMode.value = 'edit'
  Object.assign(categoryForm, {
    id: row.id,
    code: row.code,
    name: row.name,
    parent_id: row.parent_id,
    description: row.description || '',
    sort_order: row.sort_order || 0,
    status: Number(row.status ?? 1)
  })
  dialogVisible.value = true
}

const buildPayload = () => ({
  code: categoryForm.code,
  name: categoryForm.name,
  parent_id: categoryForm.parent_id,
  description: categoryForm.description,
  sort_order: categoryForm.sort_order,
  status: categoryForm.status
})

const handleSave = async () => {
  try {
    await categoryFormRef.value.validate()
    saving.value = true

    if (dialogMode.value === 'add') {
      await financeApi.createExpenseCategory(buildPayload())
    } else {
      await financeApi.updateExpenseCategory(categoryForm.id, buildPayload())
    }

    ElMessage.success(dialogMode.value === 'add' ? '创建成功' : '更新成功')
    dialogVisible.value = false
    await fetchCategories()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('保存失败: ' + (error.message || '未知错误'))
    }
  } finally {
    saving.value = false
  }
}

const handleToggleStatus = async (row) => {
  const previousStatus = row.status === 1 ? 0 : 1
  try {
    await financeApi.updateExpenseCategory(row.id, { status: row.status })
    ElMessage.success(row.status === 1 ? '已启用' : '已禁用')
  } catch (error) {
    row.status = previousStatus
    ElMessage.error('操作失败: ' + (error.message || '未知错误'))
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除费用类型 "${row.name}" 吗？${row.children?.length ? ' 子类型也会被删除。' : ''}`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await financeApi.deleteExpenseCategory(row.id)
    ElMessage.success('删除成功')
    await fetchCategories()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败: ' + (error.message || '未知错误'))
    }
  }
}

onMounted(() => {
  fetchCategories()
})
</script>

<style scoped>
.expense-categories-container {
  padding: 20px;
}

.header-card {
  margin-bottom: 20px;
}

.title-section h2 {
  margin: 0;
  font-size: 20px;
  color: var(--el-text-color-primary);
}

.subtitle {
  margin: 5px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.data-card {
  --el-card-padding: 20px;
}

.parent-category {
  font-weight: 600;
  color: var(--el-color-primary);
}
</style>
