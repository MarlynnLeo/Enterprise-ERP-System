<!--
/**
 * ExpenseCategories.vue
 * @description 费用类型管理页面
 * @date 2026-01-17
 * @version 1.0.0
 */
-->
<template>
  <div class="expense-categories-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>费用类型管理</h2>
          <p class="subtitle">管理费用分类和子类型</p>
        </div>
        <div class="action-buttons">
          <el-button type="primary" @click="handleAdd(null)">
            <el-icon><Plus /></el-icon> 新增一级类型
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table 
        :data="categoryList" 
        style="width: 100%" 
        row-key="id"
        :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
        border 
        v-loading="loading"
      >
        <template #empty>
          <el-empty description="暂无费用类型数据">
            <el-button type="primary" @click="handleInit">初始化预设类型</el-button>
          </el-empty>
        </template>
        <el-table-column prop="name" label="类型名称" min-width="200">
          <template #default="{ row }">
            <span :class="{ 'parent-category': !row.parent_id }">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="类型编码" width="150" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="sort_order" label="排序" width="80" align="center" />
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-switch 
              v-model="row.status" 
              :active-value="1" 
              :inactive-value="0"
              @change="handleToggleStatus(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" link @click="handleEdit(row)"
              v-permission="'finance:expenses:categories'">编辑</el-button>
            <el-button v-permission="'finance:expenses:create'" 
              v-if="!row.parent_id"
              type="success" size="small" link 
              @click="handleAdd(row.id)"
            >添加子类</el-button>
            <el-button v-permission="'finance:expenses:delete'" type="danger" size="small" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      :title="dialogMode === 'add' ? '新增费用类型' : '编辑费用类型'"
      v-model="dialogVisible"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="categoryForm" :rules="categoryRules" ref="categoryFormRef" label-width="100px">
        <el-form-item label="类型编码" prop="code">
          <el-input v-model="categoryForm.code" placeholder="如: CERT_ISO" :disabled="dialogMode === 'edit'" />
        </el-form-item>
        <el-form-item label="类型名称" prop="name">
          <el-input v-model="categoryForm.name" placeholder="请输入类型名称" />
        </el-form-item>
        <el-form-item label="上级类型">
          <el-select v-model="categoryForm.parent_id" placeholder="无（一级类型）" clearable style="width: 100%">
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
        <el-button v-permission="'finance:expenses:update'" type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'

// 响应式数据
const loading = ref(false)
const saving = ref(false)
const categoryList = ref([])

// 对话框
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
    { pattern: /^[A-Z][A-Z0-9_]*$/, message: '编码需大写字母开头，只能包含大写字母、数字和下划线', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入类型名称', trigger: 'blur' }]
}

// 一级类型列表（用于选择上级）
const parentCategories = computed(() => {
  return categoryList.value.filter(cat => !cat.parent_id)
})

// 获取费用类型列表
const fetchCategories = async () => {
  loading.value = true
  try {
    const res = await request.get('/finance/expenses/categories', { params: { tree: 'true' } })
    if (res.success) {
      categoryList.value = res.data
    }
  } catch (error) {
    console.error('获取费用类型失败:', error)
  } finally {
    loading.value = false
  }
}

// 初始化预设类型
const handleInit = async () => {
  try {
    await ElMessageBox.confirm('将初始化预设的费用类型数据，确定继续吗？', '初始化确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info'
    })

    loading.value = true
    const res = await request.post('/finance/expenses/init')
    if (res.success) {
      ElMessage.success('初始化成功')
      fetchCategories()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('初始化失败: ' + (error.message || '未知错误'))
    }
  } finally {
    loading.value = false
  }
}

// 新增
const handleAdd = (parentId = null) => {
  dialogMode.value = 'add'
  Object.assign(categoryForm, {
    id: null,
    code: '',
    name: '',
    parent_id: parentId,
    description: '',
    sort_order: 0,
    status: 1
  })
  dialogVisible.value = true
}

// 编辑
const handleEdit = (row) => {
  dialogMode.value = 'edit'
  Object.assign(categoryForm, {
    id: row.id,
    code: row.code,
    name: row.name,
    parent_id: row.parent_id,
    description: row.description || '',
    sort_order: row.sort_order || 0,
    status: row.status
  })
  dialogVisible.value = true
}

// 保存
const handleSave = async () => {
  try {
    await categoryFormRef.value.validate()
    saving.value = true

    const data = {
      code: categoryForm.code,
      name: categoryForm.name,
      parent_id: categoryForm.parent_id,
      description: categoryForm.description,
      sort_order: categoryForm.sort_order,
      status: categoryForm.status
    }

    let res
    if (dialogMode.value === 'add') {
      res = await request.post('/finance/expenses/categories', data)
    } else {
      res = await request.put(`/finance/expenses/categories/${categoryForm.id}`, data)
    }

    if (res.success) {
      ElMessage.success(dialogMode.value === 'add' ? '创建成功' : '更新成功')
      dialogVisible.value = false
      fetchCategories()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('保存失败: ' + (error.message || '未知错误'))
    }
  } finally {
    saving.value = false
  }
}

// 切换状态
const handleToggleStatus = async (row) => {
  try {
    const res = await request.put(`/finance/expenses/categories/${row.id}`, {
      status: row.status
    })
    if (res.success) {
      ElMessage.success(String(row.status) === '1' ? '已启用' : '已禁用')
    }
  } catch (error) {
    // 恢复原状态
    row.status = String(row.status) === '1' ? 0 : 1
    ElMessage.error('操作失败: ' + (error.message || '未知错误'))
  }
}

// 删除
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除费用类型"${row.name}"吗？${row.children?.length ? '子类型也会被删除。' : ''}`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const res = await request.delete(`/finance/expenses/categories/${row.id}`)
    if (res.success) {
      ElMessage.success('删除成功')
      fetchCategories()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败: ' + (error.message || '未知错误'))
    }
  }
}

// 初始化
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

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
