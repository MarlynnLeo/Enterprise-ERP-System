<!--
/**
 * Categories.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="purchase-requisitions-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>产品大类管理</h2>
          <p class="subtitle">管理产品大类配置</p>
        </div>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleAdd">新增大类</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="大类名称">
          <el-input  v-model="searchForm.name" placeholder="请输入大类名称" clearable ></el-input>
        </el-form-item>
        <el-form-item label="大类编码">
          <el-input  v-model="searchForm.code" placeholder="请输入大类编码" clearable ></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-select  v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option :value="1" label="启用"></el-option>
            <el-option :value="0" label="禁用"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> 重置
          </el-button>
          <el-button type="success" @click="handleExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
          <el-button type="warning" @click="openImportDialog">
            <el-icon><Upload /></el-icon> 导入
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.total || 0 }}</div>
        <div class="stat-label">大类总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.parentCategories || 0 }}</div>
        <div class="stat-label">父大类</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.childCategories || 0 }}</div>
        <div class="stat-label">子大类</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.active || 0 }}</div>
        <div class="stat-label">启用状态</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.inactive || 0 }}</div>
        <div class="stat-label">禁用状态</div>
      </el-card>
    </div>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        v-loading="loading"
        :data="tableData"
        row-key="id"
        border
        :tree-props="{ children: 'children' }"
        style="width: 100%"
      >
        <template #empty>
          <el-empty description="暂无大类数据" />
        </template>
        <el-table-column prop="name" label="大类名称" width="220"></el-table-column>
        <el-table-column prop="code" label="大类编码" width="150"></el-table-column>
        <el-table-column prop="sort" label="排序" width="100"></el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="String(scope.row.status) === '1' ? 'success' : 'danger'">
              {{ String(scope.row.status) === '1' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注"></el-table-column>
        <el-table-column label="操作" min-width="360" fixed="right">
          <template #default="scope">
            <el-popconfirm
              v-if="canUpdate && String(scope.row.status) !== '1'"
              title="确定要启用该大类吗？"
              @confirm="handleToggleStatus(scope.row)"
            >
              <template #reference>
                <el-button size="small" type="success">
                  <el-icon><Switch /></el-icon> 启用
                </el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              v-if="canUpdate && String(scope.row.status) === '1'"
              title="确定要禁用该大类吗？"
              @confirm="handleToggleStatus(scope.row)"
              confirm-button-type="warning"
            >
              <template #reference>
                <el-button size="small" type="warning">
                  <el-icon><Switch /></el-icon> 禁用
                </el-button>
              </template>
            </el-popconfirm>
            <template v-if="String(scope.row.status) === '0'">
              <el-button v-if="canCreate" size="small" @click="handleAdd(scope.row)">
                <el-icon><Plus /></el-icon> 添加子大类
              </el-button>
              <el-button v-if="canUpdate" size="small" type="primary" @click="handleEdit(scope.row)">
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-popconfirm
                v-if="canDelete"
                title="确定要删除该大类吗？此操作无法恢复。"
                @confirm="handleDelete(scope.row)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button size="small" type="danger">
                    <el-icon><Delete /></el-icon> 删除
                  </el-button>
                </template>
              </el-popconfirm>
            </template>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="Math.max(parseInt(stats.total) || 0, 1)"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="500px"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="上级大类">
          <el-cascader
            v-model="form.parent_id"
            :options="categoryOptions"
            :props="{ 
              checkStrictly: true,
              value: 'id',
              label: 'name',
              emitPath: false
            }"
            clearable
            placeholder="请选择上级大类"
            style="width: 100%"
          ></el-cascader>
        </el-form-item>
        <el-form-item label="大类名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入大类名称"></el-input>
        </el-form-item>
        <el-form-item label="大类编码" prop="code">
          <el-input v-model="form.code" placeholder="请输入大类编码"></el-input>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999"></el-input-number>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="请输入备注"></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button v-permission="'basedata:categories:update'" type="primary" @click="submitForm" :loading="loading">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 导入对话框 -->
    <el-dialog
      title="导入大类"
      v-model="importDialogVisible"
      width="500px"
    >
      <el-tabs v-model="importMethod">
        <el-tab-pane label="文件导入" name="template">
          <div class="import-tips">
            <p>1. 请先 <el-link type="primary" @click="downloadTemplate">下载模板</el-link></p>
            <p>2. 按照模板格式填写数据</p>
            <p>3. 选择填好的文件并导入</p>
          </div>
          <el-upload
            ref="uploadRef"
            action=""
            :auto-upload="false"
            :limit="1"
            accept=".xlsx, .xls"
            :on-change="handleFileChange"
            style="margin-top: 15px;"
          >
            <template #trigger>
              <el-button type="primary">选择文件</el-button>
            </template>
            <template #tip>
              <div class="el-upload__tip">只支持 .xlsx, .xls 格式文件，不超过 10MB</div>
            </template>
          </el-upload>
        </el-tab-pane>
        <el-tab-pane label="JSON导入" name="json">
          <el-input
            v-model="importJsonData"
            type="textarea"
            :rows="10"
            placeholder="请输入JSON格式的大类数据"
          ></el-input>
        </el-tab-pane>
      </el-tabs>

      <div v-if="importResult" class="import-result">
        <h4>导入结果</h4>
        <el-alert
          :title="`成功：${importResult.success} 条，失败：${importResult.failed} 条`"
          :type="importResult.failed > 0 ? 'warning' : 'success'"
          :closable="false"
        />
        <div v-if="importResult.failed > 0 && importResult.errors" class="error-details">
          <h5>失败详情：</h5>
          <ul>
            <li v-for="(err, index) in importResult.errors" :key="index">
              第 {{ err.row || (index + 1) }} 行：{{ err.message }}
            </li>
          </ul>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeImportDialog">取消</el-button>
          <el-button v-permission="'basedata:categories:import'" type="primary" @click="submitImport" :loading="importing">导入</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { parseListData } from '@/utils/responseParser';

import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus'
import { baseDataApi } from '@/api/baseData';
import { Plus, Edit, Delete, Search, Refresh, Download, Upload, Switch } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

// 权限store
const authStore = useAuthStore();
const canCreate = computed(() => authStore.hasPermission('basedata:categories:create'));
const canUpdate = computed(() => authStore.hasPermission('basedata:categories:update'));
const canDelete = computed(() => authStore.hasPermission('basedata:categories:delete'));

// 权限计算属性

// 数据加载状态
const loading = ref(false);

// 表格数据
const tableData = ref([]);

// 统计数据
const stats = reactive({
  total: 0,
  active: 0,
  inactive: 0,
  parentCategories: 0,
  childCategories: 0
});

// 新增/编辑表单
const formRef = ref(null);
const form = reactive({
  id: '',
  parent_id: null,
  name: '',
  code: '',
  sort: 0,
  status: 1,
  remark: '',
  children: [], // 添加children字段以支持树形结构
});

// 搜索表单
const searchForm = reactive({
  name: '',
  code: '',
  status: ''
});

// 表单校验规则
const rules = {
  name: [{ required: true, message: '请输入大类名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入大类编码', trigger: 'blur' }]
};

// 对话框控制
const dialogVisible = ref(false);
const dialogTitle = ref('新增大类');
const isEdit = ref(false);

// 分类选项（用于级联选择器）
const categoryOptions = ref([]);

// 分页相关
const currentPage = ref(1);
const pageSize = ref(10);

// 导入相关
const importDialogVisible = ref(false);
const importMethod = ref('template');;
const importing = ref(false);
const importResult = ref(null);
const uploadRef = ref(null);
const importJsonData = ref('');
let importFile = null;

// 初始化
onMounted(() => {
  fetchData();
});

// 导出数据
const handleExport = async () => {
  try {
    const response = await baseDataApi.exportCategories({ 
      name: searchForm.name,
      code: searchForm.code,
      status: searchForm.status
    });
    // 处理文件下载
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '大类列表.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    ElMessage.success('导出成功');
  } catch {
    ElMessage.error('导出失败');
  }
};

// 计算统计数据
const calculateStats = () => {
  const allCategories = getAllCategories(tableData.value);
  const activeCount = allCategories.filter(item => String(item.status) === '1').length;
  const inactiveCount = allCategories.filter(item => String(item.status) === '0').length;
  
  // 计算父大类和子大类数量
  const parentCount = tableData.value.length;
  const childCount = allCategories.length - parentCount;
  
  stats.total = allCategories.length;
  stats.active = activeCount;
  stats.inactive = inactiveCount;
  stats.parentCategories = parentCount;
  stats.childCategories = childCount;
};

// 递归获取所有分类 (包括子大类)
const getAllCategories = (categories) => {
  let allCategories = [];
  
  categories.forEach(category => {
    allCategories.push(category);
    if (category.children && category.children.length > 0) {
      allCategories = allCategories.concat(getAllCategories(category.children));
    }
  });
  
  return allCategories;
};

// 搜索
const handleSearch = () => {
  fetchData();
};

// 重置搜索
const resetSearch = () => {
  searchForm.name = '';
  searchForm.code = '';
  searchForm.status = '';
  fetchData();
};

// 获取大类列表
const fetchData = async () => {
  loading.value = true;
  try {
    const params = {
      tree: 'true',
      name: searchForm.name,
      code: searchForm.code,
      status: searchForm.status,
      page: currentPage.value,
      pageSize: pageSize.value
    };

    const response = await baseDataApi.getCategories(params);
    const categoryData = parseListData(response, { enableLog: false });

    // 全局 responseParser 已统一将布尔 status 转为整数 0/1
    tableData.value = categoryData;

    // 处理分类选项，用于级联选择器
    const processOptions = (data) => {
      if (!Array.isArray(data)) {
        console.warn('processOptions 接收到非数组数据:', data);
        return [];
      }
      return data.map(item => {
        const option = {
          id: item.id,
          name: item.name,
          label: item.name,
          value: item.id  // 添加value字段，确保级联选择器正常工作
        };
        
        if (item.children && item.children.length > 0) {
          option.children = processOptions(item.children);
        }
        
        return option;
      });
    };
    
    categoryOptions.value = processOptions(tableData.value);
    
    // 计算统计数据
    calculateStats();
  } catch (error) {
    console.error('获取大类列表失败:', error);
    ElMessage.error(`获取大类列表失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
};

// 新增大类
const handleAdd = (row) => {
  dialogTitle.value = row ? '添加子大类' : '新增大类';
  isEdit.value = false;
  resetForm();
  
  if (row) {
    form.parent_id = row.id;
  }
  
  dialogVisible.value = true;
};

// 编辑分类
const handleEdit = (row) => {
  dialogTitle.value = '编辑分类';
  isEdit.value = true;
  resetForm();
  Object.assign(form, row);
  dialogVisible.value = true;
};

// 删除大类
const handleDelete = async (row) => {
  if (row.children && row.children.length > 0) {
    ElMessage.warning('该大类下有子大类，不能删除');
    return;
  }
  
  try {
    await baseDataApi.deleteCategory(row.id);
    ElMessage.success('删除成功');
    fetchData();
  } catch (error) {
    console.error('删除大类失败:', error);
    ElMessage.error(`删除大类失败: ${error.message}`);
  }
};

// 切换启用/禁用状态
const handleToggleStatus = async (row) => {
  const newStatus = String(row.status) === '1' ? 0 : 1;
  const action = newStatus === 1 ? '启用' : '禁用';

  try {
    await baseDataApi.updateCategory(row.id, { status: newStatus });
    ElMessage.success(`${action}成功`);
    fetchData();
  } catch (error) {
    console.error(`${action}分类失败:`, error);
    ElMessage.error(error.response?.data?.message || `${action}分类失败`);
  }
};

// 重置表单
const resetForm = () => {
  if (formRef.value) {
    formRef.value.resetFields();
  }
  
  form.id = '';
  form.parent_id = null;
  form.name = '';
  form.code = '';
  form.sort = 0;
  form.status = 1;
  form.remark = '';
};

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return;
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true;
      try {
        // 创建提交数据对象，移除不需要的字段
        const submitData = { ...form };
        delete submitData.children;
        delete submitData.created_at;
        delete submitData.updated_at;
        
        if (isEdit.value) {
          // 更新分类
          await baseDataApi.updateCategory(form.id, submitData);
          ElMessage.success('大类更新成功');
        } else {
          // 创建分类
          await baseDataApi.createCategory(submitData);
          ElMessage.success('大类创建成功');
        }
        dialogVisible.value = false;
        fetchData(); // 重新获取数据
      } catch (error) {
        console.error('保存分类失败:', error);
        ElMessage.error(error.response?.data?.message || '操作失败，请重试');
      } finally {
        loading.value = false;
      }
    }
  });
};

// 处理分页
const handleSizeChange = (newSize) => {
  pageSize.value = newSize;
  fetchData();
};

const handleCurrentChange = (newPage) => {
  currentPage.value = newPage;
  fetchData();
};

// 打开导入对话框
const openImportDialog = () => {
  importDialogVisible.value = true;
  importResult.value = null;
  importFile = null;
  importJsonData.value = '';
  if (uploadRef.value) {
    uploadRef.value.clearFiles();
  }
};

// 关闭导入对话框
const closeImportDialog = () => {
  importDialogVisible.value = false;
  importResult.value = null;
  importFile = null;
  if (uploadRef.value) {
    uploadRef.value.clearFiles();
  }
};

// 下载模板
const downloadTemplate = async () => {
  try {
    const response = await baseDataApi.downloadCategoryTemplate();

    // 检查响应是否为blob
    let blob;
    if (response instanceof Blob) {
      blob = response;
    } else if (response.data instanceof Blob) {
      blob = response.data;
    } else {
      // 如果不是blob，尝试创建blob
      blob = new Blob([response.data || response], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
    }

    // 创建下载链接
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '分类导入模板.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    ElMessage.success('模板下载成功');
  } catch (error) {
    ElMessage.error('下载模板失败: ' + (error.response?.data?.message || error.message));
  }
};

// 处理文件选择
const handleFileChange = (file) => {
  importFile = file.raw;

  // 检查文件大小（10MB限制）
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    ElMessage.error('文件大小不能超过10MB');
    uploadRef.value.clearFiles();
    importFile = null;
    return;
  }

  // 检查文件类型
  const allowedTypes = ['.xlsx', '.xls'];
  const fileName = file.name.toLowerCase();
  const isValidType = allowedTypes.some(type => fileName.endsWith(type));

  if (!isValidType) {
    ElMessage.error('只支持Excel文件格式(.xlsx, .xls)');
    uploadRef.value.clearFiles();
    importFile = null;
    return;
  }

  ElMessage.success('文件选择成功');
};

// 提交导入
const submitImport = async () => {
  if (importMethod.value === 'template') {
    if (!importFile) {
      ElMessage.error('请先选择要导入的文件');
      return;
    }
  } else {
    if (!importJsonData.value.trim()) {
      ElMessage.error('请输入要导入的JSON数据');
      return;
    }
  }

  importing.value = true;
  importResult.value = null;

  try {
    let response;

    if (importMethod.value === 'template') {
      // 文件导入
      const formData = new FormData();
      formData.append('file', importFile);
      response = await baseDataApi.importCategories(formData);
    } else {
      // JSON数据导入
      try {
        const jsonData = JSON.parse(importJsonData.value);
        if (!Array.isArray(jsonData)) {
          throw new Error('数据格式错误，请输入数组格式的JSON数据');
        }
        response = await baseDataApi.importCategoriesJson(jsonData);
      } catch (parseError) {
        ElMessage.error('JSON格式错误: ' + parseError.message);
        return;
      }
    }

    importResult.value = response.data;

    if (response.data.success > 0) {
      ElMessage.success(`成功导入 ${response.data.success} 条大类数据`);
      fetchData(); // 刷新列表
    }

    if (response.data.failed > 0) {
      ElMessage.warning(`${response.data.failed} 条大类数据导入失败，请查看详情`);
    }

  } catch (error) {
    console.error('导入大类失败:', error);
    ElMessage.error('导入大类失败: ' + (error.response?.data?.message || error.message || '未知错误'));
  } finally {
    importing.value = false;
  }
};

</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.search-form {
  display: flex;
  flex-wrap: wrap;
}

/* 操作列样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}

.import-tips {
  margin-top: 10px;
  padding: 10px;
  background-color: var(--color-primary-light-9);
  border: 1px solid #b3d8ff;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-text-regular);
}

.import-tips p {
  margin: 5px 0;
}

.import-result {
  margin-top: var(--spacing-lg);
  padding: 15px;
  background-color: var(--color-bg-hover);
  border-radius: var(--radius-sm);
}

.import-result h4 {
  margin: 0 0 10px 0;
  color: var(--color-text-primary);
}

.error-details {
  margin-top: 15px;
}

.error-details h5 {
  margin: 0 0 10px 0;
  color: var(--color-danger);
}

/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>