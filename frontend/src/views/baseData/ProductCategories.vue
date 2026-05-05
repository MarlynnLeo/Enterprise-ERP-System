<!--
/**
 * ProductCategories.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="product-categories-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>物料类型管理</h2>
          <p class="subtitle">管理物料类型、物料来源与检验方式</p>
        </div>
        <el-dropdown v-if="canCreate" @command="handleDropdownCommand" trigger="click">
          <el-button type="primary">
            <el-icon><Plus /></el-icon> 新增
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="category">
                <el-icon><Plus /></el-icon> 新增物料类型
              </el-dropdown-item>
              <el-dropdown-item command="source">
                <el-icon><Plus /></el-icon> 新增物料来源
              </el-dropdown-item>
              <el-dropdown-item command="inspection">
                <el-icon><Plus /></el-icon> 新增检验方式
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="类型名称">
          <el-input  v-model="searchForm.name" placeholder="请输入类型名称" clearable ></el-input>
        </el-form-item>
        <el-form-item label="类型编码">
          <el-input  v-model="searchForm.code" placeholder="请输入类型编码" clearable ></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-select  v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option :value="1" label="启用"></el-option>
            <el-option :value="0" label="禁用"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.total || 0 }}</div>
        <div class="stat-label">类型总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.parentCategories || 0 }}</div>
        <div class="stat-label">父类型</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.childCategories || 0 }}</div>
        <div class="stat-label">子类型</div>
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
      <template #header>
        <div class="card-header">
          <span>数据管理</span>
          <el-radio-group v-model="viewType" size="small">
            <el-radio-button value="categories">物料类型</el-radio-button>
            <el-radio-button value="sources">物料来源</el-radio-button>
            <el-radio-button value="inspections">检验方式</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <!-- 物料类型表格 -->
      <div v-if="viewType === 'categories'">
        <el-table
          v-loading="loading"
          :data="tableData"
          row-key="id"
          border
          :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
          style="width: 100%"
        >
        <el-table-column prop="name" label="类型名称" :width="hasSearchFilters ? 200 : 220"></el-table-column>
        <el-table-column prop="code" label="类型编码" width="150"></el-table-column>
        <el-table-column v-if="hasSearchFilters" prop="parent_name" label="父类型" width="180">
          <template #default="scope">
            {{ scope.row.parent_name || '顶级类型' }}
          </template>
        </el-table-column>
        <el-table-column prop="level" label="层级" width="80"></el-table-column>
        <el-table-column prop="sort" label="排序" width="100"></el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="Number(scope.row.status) === 1 ? 'success' : 'danger'">
              {{ Number(scope.row.status) === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述"></el-table-column>
        <el-table-column label="操作" min-width="30" fixed="right">
          <template #default="scope">
            <el-button
              v-if="canCreate && Number(scope.row.status) !== 1"
              size="small"
              type="primary"
              link
              @click="handleAdd(scope.row)"
            >
              <el-icon><Plus /></el-icon> 添加子类
            </el-button>
            <el-button
              v-if="canUpdate && Number(scope.row.status) !== 1"
              size="small"
              type="primary"
              @click="handleEdit(scope.row)"
            >
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-button
              v-if="canUpdate"
              size="small"
              :type="Number(scope.row.status) === 1 ? 'warning' : 'success'"
              @click="handleToggleStatus(scope.row)"
            >
              {{ Number(scope.row.status) === 1 ? '禁用' : '启用' }}
            </el-button>
            <el-button
              v-if="canDelete && Number(scope.row.status) !== 1"
              size="small"
              type="danger"
              @click="handleDelete(scope.row)"
            >
              <el-icon><Delete /></el-icon> 删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 物料类型分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="categoryPagination.current"
          v-model:page-size="categoryPagination.size"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(parseInt(categoryPagination.total) || 0, 1)"
          @size-change="handleCategorySizeChange"
          @current-change="handleCategoryPageChange"
        />
      </div>
      </div>

      <!-- 物料来源表格 -->
      <div v-if="viewType === 'sources'">
        <el-table
          v-loading="sourceLoading"
          :data="sourceTableData"
          border
          style="width: 100%"
        >
          <el-table-column prop="name" label="来源名称" width="200"></el-table-column>
          <el-table-column prop="code" label="来源编码" width="150"></el-table-column>
          <el-table-column prop="type" label="来源类型" width="120">
            <template #default="scope">
              <el-tag :type="scope.row.type === 'internal' ? 'success' : 'warning'">
                {{ scope.row.type === 'internal' ? '内部' : '外部' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="sort" label="排序" width="100"></el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="scope">
              <el-tag :type="Number(scope.row.status) === 1 ? 'success' : 'danger'">
                {{ Number(scope.row.status) === 1 ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述"></el-table-column>
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="scope">
              <el-button
                v-if="canUpdate && Number(scope.row.status) !== 1"
                size="small"
                type="primary"
                link
                @click="handleEditSource(scope.row)"
              >
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-button
                v-if="canUpdate"
                size="small"
                :type="Number(scope.row.status) === 1 ? 'warning' : 'success'"
                link
                @click="handleToggleSourceStatus(scope.row)"
              >
                <el-icon><component :is="Number(scope.row.status) === 1 ? 'CircleClose' : 'CircleCheck'" /></el-icon>
                {{ Number(scope.row.status) === 1 ? '禁用' : '启用' }}
              </el-button>
              <el-button
                v-if="canDelete && Number(scope.row.status) !== 1"
                size="small"
                type="danger"
                link
                @click="handleDeleteSource(scope.row)"
              >
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="pagination-container">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next, jumper"
            v-model:current-page="sourcePagination.current"
            v-model:page-size="sourcePagination.size"
            :total="sourcePagination.total"
            :page-sizes="[10, 20, 50, 100]"
            @size-change="handleSourceSizeChange"
            @current-change="handleSourcePageChange"
          />
        </div>
      </div>

      <!-- 检验方式表格 -->
      <div v-if="viewType === 'inspections'">
        <el-table
          v-loading="inspectionLoading"
          :data="inspectionTableData"
          border
          style="width: 100%"
        >
          <el-table-column prop="name" label="方式名称" width="200"></el-table-column>
          <el-table-column prop="code" label="方式编码" width="150"></el-table-column>
          <el-table-column prop="sort" label="排序" width="100"></el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="scope">
              <el-tag :type="Number(scope.row.status) === 1 ? 'success' : 'danger'">
                {{ Number(scope.row.status) === 1 ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述"></el-table-column>
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="scope">
              <el-button
                v-if="canUpdate && Number(scope.row.status) !== 1"
                size="small"
                type="primary"
                link
                @click="handleEditInspection(scope.row)"
              >
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-button
                v-if="canUpdate"
                size="small"
                :type="Number(scope.row.status) === 1 ? 'warning' : 'success'"
                link
                @click="handleToggleInspectionStatus(scope.row)"
              >
                <el-icon><component :is="Number(scope.row.status) === 1 ? 'CircleClose' : 'CircleCheck'" /></el-icon>
                {{ Number(scope.row.status) === 1 ? '禁用' : '启用' }}
              </el-button>
              <el-button
                v-if="canDelete && Number(scope.row.status) !== 1"
                size="small"
                type="danger"
                link
                @click="handleDeleteInspection(scope.row)"
              >
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="pagination-container">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next, jumper"
            v-model:current-page="inspectionPagination.current"
            v-model:page-size="inspectionPagination.size"
            :total="inspectionPagination.total"
            :page-sizes="[10, 20, 50, 100]"
            @size-change="handleInspectionSizeChange"
            @current-change="handleInspectionPageChange"
          />
        </div>
      </div>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="600px"
      :before-close="handleDialogClose"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
      >
        <el-form-item label="父类型" prop="parent_id">
          <el-tree-select
            v-model="formData.parent_id"
            :data="categoryOptions"
            :props="{ value: 'id', label: 'name', children: 'children' }"
            placeholder="请选择父类型（不选则为顶级类型）"
            clearable
            filterable
            check-strictly
            :render-after-expand="true"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="类型名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入类型名称"></el-input>
        </el-form-item>
        <el-form-item label="类型编码" prop="code">
          <el-input v-model="formData.code" placeholder="请输入类型编码"></el-input>
        </el-form-item>
        <el-form-item label="排序" prop="sort">
          <el-input-number v-model="formData.sort" :min="0" style="width: 100%"></el-input-number>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="formData.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入描述"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleDialogClose">取消</el-button>
          <el-button type="primary" @click="handleSubmit" :loading="submitLoading">
            确定
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 物料来源新增/编辑对话框 -->
    <el-dialog
      :title="sourceDialogTitle"
      v-model="sourceDialogVisible"
      width="600px"
      :before-close="handleSourceDialogClose"
    >
      <el-form
        ref="sourceFormRef"
        :model="sourceFormData"
        :rules="sourceFormRules"
        label-width="100px"
      >
        <el-form-item label="来源名称" prop="name">
          <el-input v-model="sourceFormData.name" placeholder="请输入来源名称"></el-input>
        </el-form-item>
        <el-form-item label="来源编码" prop="code">
          <el-input v-model="sourceFormData.code" placeholder="请输入来源编码"></el-input>
        </el-form-item>
        <el-form-item label="来源类型" prop="type">
          <el-radio-group v-model="sourceFormData.type">
            <el-radio value="internal">内部</el-radio>
            <el-radio value="external">外部</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="排序" prop="sort">
          <el-input-number v-model="sourceFormData.sort" :min="0" style="width: 100%"></el-input-number>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="sourceFormData.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="sourceFormData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入描述"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleSourceDialogClose">取消</el-button>
          <el-button type="primary" @click="handleSourceSubmit" :loading="sourceSubmitLoading">
            确定
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>

    <!-- 检验方式新增/编辑对话框 -->
    <el-dialog
      :title="inspectionDialogTitle"
      v-model="inspectionDialogVisible"
      width="600px"
      :before-close="handleInspectionDialogClose"
    >
      <el-form
        ref="inspectionFormRef"
        :model="inspectionFormData"
        :rules="inspectionFormRules"
        label-width="100px"
      >
        <el-form-item label="方式名称" prop="name">
          <el-input v-model="inspectionFormData.name" placeholder="请输入检验方式名称"></el-input>
        </el-form-item>
        <el-form-item label="方式编码" prop="code">
          <el-input v-model="inspectionFormData.code" placeholder="请输入检验方式编码"></el-input>
        </el-form-item>
        <el-form-item label="排序" prop="sort">
          <el-input-number v-model="inspectionFormData.sort" :min="0" style="width: 100%"></el-input-number>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="inspectionFormData.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="inspectionFormData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入描述"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleInspectionDialogClose">取消</el-button>
          <el-button type="primary" @click="handleInspectionSubmit" :loading="inspectionSubmitLoading">
            确定
          </el-button>
        </span>
      </template>
    </el-dialog>
</template>

<script setup>
import { parsePaginatedData } from '@/utils/responseParser';

import { ref, reactive, onMounted, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Refresh, Edit, Delete, ArrowDown } from '@element-plus/icons-vue';
import { api } from '@/services/axiosInstance';
import { useAuthStore } from '@/stores/auth';
import { baseDataApi } from '@/api/baseData';

// 权限store
const authStore = useAuthStore()
const canCreate = computed(() => authStore.hasPermission('basedata:product-categories:create'))
const canUpdate = computed(() => authStore.hasPermission('basedata:product-categories:update'))
const canDelete = computed(() => authStore.hasPermission('basedata:product-categories:delete'))

// ==================== 通用工具函数 ====================

// 使用统一响应解析器，保持向后兼容的返回格式
const parseResponseData = (response) => {
  const { list, total } = parsePaginatedData(response);
  return { data: list, total };
};

// 通用对话框关闭函数
const closeDialog = (dialogRef, formRefValue) => {
  dialogRef.value = false;
  formRefValue.value?.resetFields();
};

// 通用分页处理函数
const createPaginationHandlers = (pagination, loadFn) => {
  return {
    handleSizeChange: (val) => {
      pagination.size = val;
      pagination.current = 1;
      loadFn();
    },
    handlePageChange: (val) => {
      pagination.current = val;
      loadFn();
    }
  };
};

// ==================== 响应式数据 ====================
const loading = ref(false);
const submitLoading = ref(false);
const tableData = ref([]);
const categoryOptions = ref([]);
const stats = ref({});
const viewType = ref('categories'); // 视图切换：categories 或 sources

// 搜索表单
const searchForm = reactive({
  name: '',
  code: '',
  status: undefined
});

// 对话框相关
const dialogVisible = ref(false);
const dialogTitle = ref('');
const isEdit = ref(false);
const currentId = ref(null);

// 物料来源对话框相关
const sourceDialogVisible = ref(false);
const sourceDialogTitle = ref('');
const sourceIsEdit = ref(false);
const sourceCurrentId = ref(null);
const sourceSubmitLoading = ref(false);

// 物料来源数据相关
const sourceLoading = ref(false);
const sourceTableData = ref([]);
const sourcePagination = reactive({
  current: 1,
  size: 20,
  total: 0
});

// 物料类型分页数据
const categoryPagination = reactive({
  current: 1,
  size: 10,
  total: 0
});

// 计算属性：是否有搜索过滤条件
const hasSearchFilters = computed(() => {
  return !!(searchForm.name || searchForm.code || searchForm.status !== undefined);
});

// 表单数据
const formData = reactive({
  parent_id: 0,
  name: '',
  code: '',
  sort: 0,
  status: 1,
  description: ''
});

// 表单引用
const formRef = ref(null);
const sourceFormRef = ref(null);

// 表单验证规则
const formRules = {
  name: [
    { required: true, message: '请输入类型名称', trigger: 'blur' },
    { min: 1, max: 100, message: '长度在 1 到 100 个字符', trigger: 'blur' }
  ],
  code: [
    { required: true, message: '请输入类型编码', trigger: 'blur' },
    { min: 1, max: 50, message: '长度在 1 到 50 个字符', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_-]+$/, message: '编码只能包含字母、数字、下划线和横线', trigger: 'blur' }
  ],
  sort: [
    { required: true, message: '请输入排序', trigger: 'blur' },
    { type: 'number', min: 0, message: '排序必须大于等于0', trigger: 'blur' }
  ]
};

// 物料来源表单数据
const sourceFormData = reactive({
  name: '',
  code: '',
  type: 'internal',
  sort: 0,
  status: 1,
  description: ''
});

// 物料来源表单验证规则
const sourceFormRules = {
  name: [
    { required: true, message: '请输入来源名称', trigger: 'blur' },
    { min: 1, max: 100, message: '长度在 1 到 100 个字符', trigger: 'blur' }
  ],
  code: [
    { required: true, message: '请输入来源编码', trigger: 'blur' },
    { min: 1, max: 50, message: '长度在 1 到 50 个字符', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_-]+$/, message: '编码只能包含字母、数字、下划线和横线', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择来源类型', trigger: 'change' }
  ],
  sort: [
    { required: true, message: '请输入排序', trigger: 'blur' },
    { type: 'number', min: 0, message: '排序必须大于等于0', trigger: 'blur' }
  ]
};


// 检验方式相关状态
const inspectionDialogVisible = ref(false);
const inspectionDialogTitle = ref('');
const inspectionIsEdit = ref(false);
const inspectionCurrentId = ref(null);
const inspectionSubmitLoading = ref(false);

const inspectionLoading = ref(false);
const inspectionTableData = ref([]);
const inspectionPagination = reactive({
  current: 1,
  size: 20,
  total: 0
});

const inspectionFormData = reactive({
  name: '',
  code: '',
  sort: 0,
  status: 1,
  description: ''
});

const inspectionFormRef = ref(null);

const inspectionFormRules = {
  name: [
    { required: true, message: '请输入方式名称', trigger: 'blur' },
    { min: 1, max: 100, message: '长度在 1 到 100 个字符', trigger: 'blur' }
  ],
  code: [
    { required: true, message: '请输入方式编码', trigger: 'blur' },
    { min: 1, max: 50, message: '长度在 1 到 50 个字符', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_-]+$/, message: '编码只能包含字母、数字、下划线和横线', trigger: 'blur' }
  ],
  sort: [
    { required: true, message: '请输入排序', trigger: 'blur' },
    { type: 'number', min: 0, message: '排序必须大于等于0', trigger: 'blur' }
  ]
};

// 生命周期
onMounted(() => {
  loadAllData();
});

const loadData = async () => {
  try {
    loading.value = true;

    // 检查是否有搜索条件
    const hasFilters = searchForm.name || searchForm.code || searchForm.status !== undefined;

    if (hasFilters) {
      // 有搜索条件时，使用分页查询，显示平铺结构
      const params = {
        name: searchForm.name || undefined,
        code: searchForm.code || undefined,
        status: searchForm.status,
        page: categoryPagination.current,
        pageSize: categoryPagination.size
      };

      const response = await api.get('/baseData/product-categories', { params });
      const { data, total } = parseResponseData(response);

      tableData.value = data;
      categoryPagination.total = total || data.length;
    } else {
      // 没有搜索条件时，加载所有数据并构建树形结构
      const params = {
        page: 1,
        pageSize: 10000 // 加载所有数据
      };

      const response = await api.get('/baseData/product-categories', { params });
      const { data } = parseResponseData(response);

      // 将平铺数据转换为树形结构
      const fullTree = buildTreeFromFlatData(data);
      
      // 更新分页总数为根节点数量
      categoryPagination.total = fullTree.length;
      
      // 执行前端树形结构分页截取
      const start = (categoryPagination.current - 1) * categoryPagination.size;
      const end = start + categoryPagination.size;
      tableData.value = fullTree.slice(start, end);
    }

    // 同时加载分类选项
    await loadCategoryOptions();
  } catch (error) {
    console.error('加载物料类型数据失败:', error);
    ElMessage.error('加载数据失败');
  } finally {
    loading.value = false;
  }
};

// 将平铺数据转换为树形结构
const buildTreeFromFlatData = (flatData) => {
  if (!flatData || flatData.length === 0) return [];

  const map = {};
  const tree = [];

  // 首先创建所有节点的映射
  flatData.forEach(item => {
    map[item.id] = { ...item, children: [] };
  });

  // 然后构建树形结构
  flatData.forEach(item => {
    const node = map[item.id];
    if (item.parent_id && map[item.parent_id]) {
      // 如果有父节点，添加到父节点的children中
      map[item.parent_id].children.push(node);
    } else {
      // 如果没有父节点，添加到根节点
      tree.push(node);
    }
  });

  // 清理空的children数组
  const cleanEmptyChildren = (nodes) => {
    nodes.forEach(node => {
      if (node.children && node.children.length === 0) {
        delete node.children;
      } else if (node.children && node.children.length > 0) {
        cleanEmptyChildren(node.children);
      }
    });
  };

  cleanEmptyChildren(tree);

  return tree;
};

const loadCategoryOptions = async () => {
  try {
    const response = await api.get('/baseData/product-categories/options');
    // 拦截器已解包，response.data 就是业务数据
    categoryOptions.value = buildTreeOptions(response.data || []);
  } catch (error) {
    console.error('加载分类选项失败:', error);
  }
};

const buildTreeOptions = (data, parentId = 0) => {
  const tree = [];
  for (const item of data) {
    if (item.parent_id === parentId) {
      const node = {
        id: item.id,
        name: item.name,
        children: buildTreeOptions(data, item.id)
      };
      tree.push(node);
    }
  }
  return tree;
};


// 加载检验方式数据
const loadInspectionData = async () => {
  try {
    inspectionLoading.value = true;
    const params = {
      name: searchForm.name || undefined,
      code: searchForm.code || undefined,
      status: searchForm.status,
      page: inspectionPagination.current,
      pageSize: inspectionPagination.size
    };
    
    // 我们需要在 frontend/src/api/baseData.js 中补充相关的检验方式 API
    const response = await baseDataApi.getInspectionMethods(params);
    const { data, total } = parseResponseData(response);
    
    inspectionTableData.value = data;
    inspectionPagination.total = total || data.length;
  } catch (error) {
    console.error('加载检验方式数据失败:', error);
    ElMessage.error('加载检验方式失败');
  } finally {
    inspectionLoading.value = false;
  }
};

// 统一加载所有数据
const loadAllData = async () => {
  try {
    loading.value = true;
    // 并行加载数据和统计信息，提高效率
    await Promise.all([
      loadData(),
      loadStatistics()
    ]);
  } catch (error) {
    console.error('加载数据失败:', error);
  } finally {
    loading.value = false;
  }
};

const loadStatistics = async () => {
  try {
    const response = await api.get('/baseData/product-categories/statistics');
    // 拦截器已解包，response.data 就是业务数据
    stats.value = response.data || {};
  } catch (error) {
    console.error('加载统计数据失败:', error);
    // 设置默认值，避免显示错误
    stats.value = {
      total: 0,
      parentCategories: 0,
      childCategories: 0,
      active: 0,
      inactive: 0
    };
  }
};

const handleSearch = () => {
  categoryPagination.current = 1;
  loadData();
};

const resetSearch = () => {
  Object.assign(searchForm, {
    name: '',
    code: '',
    status: undefined
  });
  categoryPagination.current = 1;
  loadData();
};

const handleAdd = (parentRow = null) => {
  isEdit.value = false;
  currentId.value = null;
  dialogTitle.value = '新增物料类型';
  
  Object.assign(formData, {
    parent_id: parentRow ? parentRow.id : 0,
    name: '',
    code: '',
    sort: 0,
    status: 1,
    description: ''
  });
  
  dialogVisible.value = true;
};

const handleEdit = (row) => {
  isEdit.value = true;
  currentId.value = row.id;
  dialogTitle.value = '编辑物料类型';
  
  Object.assign(formData, {
    parent_id: row.parent_id || 0,
    name: row.name,
    code: row.code,
    sort: row.sort,
    status: row.status,
    description: row.description || ''
  });
  
  dialogVisible.value = true;
};

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除物料类型"${row.name}"吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );
    
    await api.delete(`/baseData/product-categories/${row.id}`);
    ElMessage.success('删除成功');
    // 删除后重新加载所有数据
    loadAllData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error);
      ElMessage.error(error.response?.data?.message || '删除失败');
    }
  }
};

const handleSubmit = async () => {
  try {
    await formRef.value.validate();
    
    submitLoading.value = true;
    
    if (isEdit.value) {
      await api.put(`/baseData/product-categories/${currentId.value}`, formData);
      ElMessage.success('更新成功');
    } else {
      await api.post('/baseData/product-categories', formData);
      ElMessage.success('创建成功');
    }
    
    dialogVisible.value = false;
    // 操作成功后重新加载所有数据
    loadAllData();
  } catch (error) {
    console.error('提交失败:', error);
    ElMessage.error(error.response?.data?.message || '操作失败');
  } finally {
    submitLoading.value = false;
  }
};

const handleDialogClose = () => {
  closeDialog(dialogVisible, formRef);
};

// 切换物料类型状态
const handleToggleStatus = async (row) => {
  const newStatus = Number(row.status) === 1 ? 0 : 1;
  const statusText = newStatus === 1 ? '启用' : '禁用';

  try {
    await ElMessageBox.confirm(
      `确定要${statusText}物料类型"${row.name}"吗？`,
      '确认操作',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await api.put(`/baseData/product-categories/${row.id}`, {
      ...row,
      status: newStatus
    });
    ElMessage.success(`${statusText}成功`);
    loadAllData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('状态切换失败:', error);
      ElMessage.error(error.response?.data?.message || '操作失败');
    }
  }
};


// 检验方式操作方法
const handleInspectionSizeChange = (val) => {
  inspectionPagination.size = val;
  inspectionPagination.current = 1;
  loadInspectionData();
};
const handleInspectionPageChange = (val) => {
  inspectionPagination.current = val;
  loadInspectionData();
};

const handleAddInspection = () => {
  inspectionIsEdit.value = false;
  inspectionCurrentId.value = null;
  inspectionDialogTitle.value = '新增检验方式';
  Object.assign(inspectionFormData, { name: '', code: '', sort: 0, status: 1, description: '' });
  inspectionDialogVisible.value = true;
};

const handleEditInspection = (row) => {
  inspectionIsEdit.value = true;
  inspectionCurrentId.value = row.id;
  inspectionDialogTitle.value = '编辑检验方式';
  Object.assign(inspectionFormData, { name: row.name, code: row.code, sort: row.sort, status: row.status, description: row.description || '' });
  inspectionDialogVisible.value = true;
};

const handleToggleInspectionStatus = async (row) => {
  const newStatus = Number(row.status) === 1 ? 0 : 1;
  const statusText = newStatus === 1 ? '启用' : '禁用';
  try {
    await ElMessageBox.confirm(`确定要${statusText}检验方式"${row.name}"吗？`, '确认操作', { type: 'warning' });
    await baseDataApi.updateInspectionMethod(row.id, { ...row, status: newStatus });
    ElMessage.success(`${statusText}成功`);
    loadInspectionData();
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('操作失败');
  }
};

const handleDeleteInspection = async (row) => {
  try {
    await ElMessageBox.confirm(`确定要删除检验方式"${row.name}"吗？`, '确认删除', { type: 'warning' });
    await baseDataApi.deleteInspectionMethod(row.id);
    ElMessage.success('删除成功');
    loadInspectionData();
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '删除失败');
  }
};

const handleInspectionSubmit = async () => {
  try {
    await inspectionFormRef.value.validate();
    inspectionSubmitLoading.value = true;
    if (inspectionIsEdit.value) {
      await baseDataApi.updateInspectionMethod(inspectionCurrentId.value, inspectionFormData);
      ElMessage.success('更新成功');
    } else {
      await baseDataApi.createInspectionMethod(inspectionFormData);
      ElMessage.success('创建成功');
    }
    inspectionDialogVisible.value = false;
    loadInspectionData();
  } catch (error) {
    console.error('提交失败:', error);
  } finally {
    inspectionSubmitLoading.value = false;
  }
};

const handleInspectionDialogClose = () => {
  closeDialog(inspectionDialogVisible, inspectionFormRef);
};

// 下拉菜单处理
const handleDropdownCommand = (command) => {
  if (command === 'category') {
    handleAdd(); // 调用原有的新增物料类型方法
  } else if (command === 'source') {
    handleAddSource(); // 调用新增物料来源方法
  } else if (command === 'inspection') {
    handleAddInspection(); // 调用新增检验方式方法
  }
};

// 物料来源相关方法
const handleAddSource = () => {
  sourceIsEdit.value = false;
  sourceCurrentId.value = null;
  sourceDialogTitle.value = '新增物料来源';

  // 重置表单数据
  Object.assign(sourceFormData, {
    name: '',
    code: '',
    type: 'internal',
    sort: 0,
    status: 1,
    description: ''
  });

  sourceDialogVisible.value = true;
};

const handleSourceSubmit = async () => {
  try {
    await sourceFormRef.value.validate();

    sourceSubmitLoading.value = true;

    if (sourceIsEdit.value) {
      await api.put(`/baseData/material-sources/${sourceCurrentId.value}`, sourceFormData);
      ElMessage.success('更新物料来源成功');
    } else {
      await api.post('/baseData/material-sources', sourceFormData);
      ElMessage.success('创建物料来源成功');
    }

    sourceDialogVisible.value = false;
    loadSourceData(); // 重新加载数据
  } catch (error) {
    console.error('提交失败:', error);
    ElMessage.error(error.response?.data?.message || '操作失败');
  } finally {
    sourceSubmitLoading.value = false;
  }
};

const handleSourceDialogClose = () => {
  closeDialog(sourceDialogVisible, sourceFormRef);
};

// 物料来源数据加载
const loadSourceData = async () => {
  try {
    sourceLoading.value = true;
    const params = {
      page: sourcePagination.current,
      pageSize: sourcePagination.size
    };

    const response = await api.get('/baseData/material-sources', { params });
    const { data, total } = parseResponseData(response);
    
    sourceTableData.value = data;
    sourcePagination.total = total;
  } catch (error) {
    console.error('加载物料来源数据失败:', error);
    ElMessage.error('加载物料来源数据失败');
  } finally {
    sourceLoading.value = false;
  }
};

// 分页处理
const { handleSizeChange: handleSourceSizeChange, handlePageChange: handleSourcePageChange } = 
  createPaginationHandlers(sourcePagination, loadSourceData);

const { handleSizeChange: handleCategorySizeChange, handlePageChange: handleCategoryPageChange } = 
  createPaginationHandlers(categoryPagination, loadData);

// 物料来源编辑
const handleEditSource = (row) => {
  sourceIsEdit.value = true;
  sourceCurrentId.value = row.id;
  sourceDialogTitle.value = '编辑物料来源';

  Object.assign(sourceFormData, {
    name: row.name,
    code: row.code,
    type: row.type,
    sort: row.sort,
    status: row.status,
    description: row.description || ''
  });

  sourceDialogVisible.value = true;
};

// 物料来源删除
const handleDeleteSource = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除物料来源"${row.name}"吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await api.delete(`/baseData/material-sources/${row.id}`);
    ElMessage.success('删除成功');
    loadSourceData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error);
      ElMessage.error(error.response?.data?.message || '删除失败');
    }
  }
};

// 切换物料来源状态
const handleToggleSourceStatus = async (row) => {
  const newStatus = Number(row.status) === 1 ? 0 : 1;
  const statusText = newStatus === 1 ? '启用' : '禁用';

  try {
    await ElMessageBox.confirm(
      `确定要${statusText}物料来源"${row.name}"吗？`,
      '确认操作',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await api.put(`/baseData/material-sources/${row.id}`, {
      ...row,
      status: newStatus
    });
    ElMessage.success(`${statusText}成功`);
    loadSourceData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('状态切换失败:', error);
      ElMessage.error(error.response?.data?.message || '操作失败');
    }
  }
};

// 监听视图切换
watch(viewType, (newType) => {
  if (newType === 'sources') {
    loadSourceData();
  } else if (newType === 'inspections') {
    loadInspectionData();
  }
});
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

.dialog-footer {
  text-align: right;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sources-placeholder {
  padding: 40px 20px;
  text-align: center;
}

.sources-placeholder .el-empty__description p {
  margin: 5px 0;
  color: var(--color-text-regular);
}

.view-switch-card {
  margin-bottom: var(--spacing-lg);
}

.view-content {
  padding: 10px 0;
}

.view-description {
  margin: 0 0 15px 0;
  color: var(--color-text-regular);
  font-size: 14px;
}

.sources-summary {
  display: flex;
  gap: 30px;
  flex-wrap: wrap;
}

.source-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-label {
  font-weight: 500;
  color: var(--color-text-primary);
}

.source-count {
  color: var(--color-text-regular);
  font-size: 14px;
}
</style>
