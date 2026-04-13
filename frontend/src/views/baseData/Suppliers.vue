<!--
/**
 * Suppliers.vue
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
          <h2>{{ $t('page.baseData.suppliers.title') }}</h2>
          <p class="subtitle">管理供应商基础信息</p>
        </div>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleAdd">{{ $t('page.baseData.suppliers.add') }}</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item :label="$t('page.baseData.suppliers.supplierCode')">
          <el-input  v-model="searchForm.code" :placeholder="$t('page.baseData.suppliers.supplierCodePlaceholder')" clearable ></el-input>
        </el-form-item>
        <el-form-item :label="$t('page.baseData.suppliers.supplierName')">
          <el-input  v-model="searchForm.name" :placeholder="$t('page.baseData.suppliers.supplierNamePlaceholder')" clearable ></el-input>
        </el-form-item>
        <el-form-item :label="$t('common.status')">
          <el-select  v-model="searchForm.status" :placeholder="$t('page.baseData.materials.statusPlaceholder')" clearable>
            <el-option :value="1" :label="$t('page.baseData.materials.enabled')"></el-option>
            <el-option :value="0" :label="$t('page.baseData.materials.disabled')"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> {{ $t('common.search') }}
          </el-button>
          <el-button @click="resetSearch" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> {{ $t('common.reset') }}
          </el-button>
          <el-button v-if="canImport" type="warning" @click="handleImport">
            <el-icon><Upload /></el-icon> 导入
          </el-button>
          <el-button v-if="canExport" type="success" @click="handleExport">
            <el-icon><Download /></el-icon> {{ $t('common.export') }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.total || 0 }}</div>
        <div class="stat-label">{{ $t('page.baseData.suppliers.totalSuppliers') }}</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.active || 0 }}</div>
        <div class="stat-label">{{ $t('page.baseData.suppliers.activeSuppliers') }}</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.inactive || 0 }}</div>
        <div class="stat-label">{{ $t('page.baseData.suppliers.inactiveSuppliers') }}</div>
      </el-card>
    </div>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        v-loading="loading"
        :data="tableData"
        border
        style="width: 100%"
      >
        <template #empty>
          <el-empty description="暂无供应商数据" />
        </template>
        <el-table-column prop="code" label="供应商编码" width="100">
          <template #default="scope">
            {{ scope.row.code || scope.row.supplier_code }}
          </template>
        </el-table-column>
        <el-table-column prop="name" label="供应商名称" min-width="250">
          <template #default="scope">
            <el-tooltip :content="scope.row.name || scope.row.supplier_name" placement="top" :show-after="500">
              <span class="ellipsis-cell">{{ scope.row.name || scope.row.supplier_name }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="contact_person" label="联系人" width="120">
          <template #default="scope">
            {{ scope.row.contact_person || scope.row.contact || scope.row.contactPerson || '无' }}
          </template>
        </el-table-column>
        <el-table-column prop="contact_phone" label="联系电话" width="120">
          <template #default="scope">
            {{ scope.row.contact_phone || scope.row.phone || scope.row.contactPhone || '无' }}
          </template>
        </el-table-column>
        <el-table-column prop="email" label="电子邮箱" min-width="180">
          <template #default="scope">
            <el-tooltip :content="scope.row.email || '无'" placement="top" :show-after="500">
              <span class="ellipsis-cell">{{ scope.row.email || '无' }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="scope">
            <el-tag :type="(scope.row.status || scope.row.is_active) === 1 ? 'success' : 'danger'">
              {{ (scope.row.status || scope.row.is_active) === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="address" label="地址" min-width="200">
          <template #default="scope">
            <el-tooltip :content="scope.row.address || '无'" placement="top" :show-after="500">
              <span class="ellipsis-cell">{{ scope.row.address || '无' }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="150">
          <template #default="scope">
            <el-tooltip :content="scope.row.remark || scope.row.remarks" placement="top" :show-after="500">
              <span class="ellipsis-cell">{{ scope.row.remark || scope.row.remarks }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="280" fixed="right">
          <template #default="scope">
            <div class="operation-buttons">
              <el-popconfirm
                v-if="canUpdate && (scope.row.status || scope.row.is_active) !== 1"
                title="确定要启用该供应商吗？"
                @confirm="handleToggleStatus(scope.row, 1)"
              >
                <template #reference>
                  <el-button size="small" type="success">
                    <el-icon><Switch /></el-icon> 启用
                  </el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                v-if="canUpdate && (scope.row.status || scope.row.is_active) === 1"
                title="确定要禁用该供应商吗？"
                @confirm="handleToggleStatus(scope.row, 0)"
                confirm-button-type="warning"
              >
                <template #reference>
                  <el-button size="small" type="warning">
                    <el-icon><Switch /></el-icon> 禁用
                  </el-button>
                </template>
              </el-popconfirm>
              <el-button
                v-if="canUpdate && (scope.row.status || scope.row.is_active) !== 1"
                size="small"
                type="primary"
                @click="handleEdit(scope.row)">
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-popconfirm
                v-if="canDelete && (scope.row.status || scope.row.is_active) !== 1"
                title="确定要删除该供应商吗？此操作无法恢复。"
                @confirm="handleDelete(scope.row)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button size="small" type="danger">
                    <el-icon><Delete /></el-icon> 删除
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
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
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <SupplierFormDialog
      v-model="dialogVisible"
      :editData="currentEditData"
      :title="dialogTitle"
      @success="fetchData"
    />

    <!-- 导入对话框 -->
    <el-dialog
      title="导入供应商"
      v-model="importDialogVisible"
      width="500px"
    >
      <div style="margin-bottom: 20px;">
        <el-button type="primary" @click="downloadTemplate">
          <el-icon><Download /></el-icon> 下载模板
        </el-button>
      </div>

      <el-upload
        ref="uploadRef"
        :auto-upload="false"
        :on-change="handleFileChange"
        :show-file-list="true"
        :limit="1"
        accept=".xlsx,.xls"
        drag
      >
        <el-icon class="el-icon--upload"><Upload /></el-icon>
        <div class="el-upload__text">
          将文件拖到此处，或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            只能上传 xlsx/xls 文件，且不超过 10MB
          </div>
        </template>
      </el-upload>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="importDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleUpload" :loading="uploading">
            {{ uploading ? '导入中...' : '确定导入' }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import apiAdapter from '@/utils/apiAdapter';
import { parsePaginatedData } from '@/utils/responseParser'
import SupplierFormDialog from './components/SupplierFormDialog.vue';

import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus'
import { supplierApi } from '@/api/supplier';
import { Plus, Edit, Delete, Search, Refresh, Download, Upload, Switch } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

// 权限store
const authStore = useAuthStore();
const canCreate = computed(() => authStore.hasPermission('basedata:suppliers:create'));
const canUpdate = computed(() => authStore.hasPermission('basedata:suppliers:update'));
const canDelete = computed(() => authStore.hasPermission('basedata:suppliers:delete'));
const canImport = computed(() => authStore.hasPermission('basedata:suppliers:import'));
const canExport = computed(() => authStore.hasPermission('basedata:suppliers:export'));

// 权限计算属性

// 数据加载状态
const loading = ref(false);

// 表格数据
const tableData = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);

// 统计数据
const stats = reactive({
  total: 0,
  active: 0,
  inactive: 0
});

// 搜索表单
const searchForm = reactive({
  code: '', // 对应后端的 supplierCode
  name: '', // 对应后端的 supplierName
  status: '' // 状态保持不变
});

// 对话框控制
const dialogVisible = ref(false);
const dialogTitle = ref('新增供应商');
const currentEditData = ref(null);

// 导入相关
const importDialogVisible = ref(false);
const uploading = ref(false);
const uploadRef = ref(null);
const selectedFile = ref(null);

// 初始化
onMounted(() => {
  fetchData();
});

// 导出数据
const handleExport = async () => {
  try {
    const response = await supplierApi.exportSuppliers({
      code: searchForm.code,
      name: searchForm.name,
      status: searchForm.status
    });
    // 处理文件下载
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '供应商列表.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    ElMessage.success('导出成功');
  } catch (error) {
    ElMessage.error('导出失败');
  }
};

// 获取供应商列表（服务端分页+搜索）
const fetchData = async () => {
  loading.value = true;
  try {
    // 构建请求参数，支持服务端分页和搜索
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value
    };

    // 添加搜索条件
    if (searchForm.code) params.code = searchForm.code;
    if (searchForm.name) params.name = searchForm.name;
    if (searchForm.status !== '') params.status = searchForm.status;

    const response = await supplierApi.getSuppliers(params);

    // 使用统一解析器
    const { list: sourceList, total: totalCount } = parsePaginatedData(response, { enableLog: false });
    total.value = totalCount;

    // 标准化数据字段
    tableData.value = sourceList.map(item => ({
      id: item.id,
      code: item.code || item.supplier_code || '',
      name: item.name || item.supplier_name || '',
      contact_person: item.contact_person || item.contact || '',
      contact_phone: item.contact_phone || item.phone || '',
      email: item.email || '',
      address: item.address || '',
      status: item.status !== undefined ? Number(item.status) : (item.is_active !== undefined ? Number(item.is_active) : 1),
      remark: item.remark || item.remarks || ''
    }));

    // 更新统计数据（从total中获取，精确统计可后端增加stats接口）
    stats.total = totalCount;
    // 简化统计：活跃/禁用基于当前页数据的比例估算，或直接显示总数
    stats.active = tableData.value.filter(item => Number(item.status) === 1).length;
    stats.inactive = tableData.value.filter(item => Number(item.status) === 0).length;
    
  } catch (error) {
    console.error('获取供应商列表失败:', error);
    if (error.response) {
      console.error('错误响应:', error.response.status, error.response.data);
    }
    ElMessage.error('获取供应商列表失败');
    tableData.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

// 搜索（服务端搜索）
const handleSearch = () => {
  currentPage.value = 1;
  fetchData();
};

// 重置搜索
const resetSearch = () => {
  searchForm.code = '';
  searchForm.name = '';
  searchForm.status = '';
  currentPage.value = 1;
  fetchData();
};

// 分页相关（服务端分页）
const handleSizeChange = (val) => {
  pageSize.value = val;
  currentPage.value = 1;
  fetchData();
};

const handleCurrentChange = (val) => {
  currentPage.value = val;
  fetchData();
};

// 新增供应商
const handleAdd = () => {
  dialogTitle.value = '新增供应商';
  currentEditData.value = null;
  dialogVisible.value = true;
};

// 编辑供应商
const handleEdit = (row) => {
  dialogTitle.value = '编辑供应商';
  currentEditData.value = { ...row };
  dialogVisible.value = true;
};

// 删除供应商
const handleDelete = async (row) => {
  try {
    await supplierApi.deleteSupplier(row.id);
    ElMessage.success('删除成功');
    fetchData();
  } catch (error) {
    console.error('删除供应商失败:', error);
    ElMessage.error('删除供应商失败');
  }
};

// 切换启用/禁用状态
const handleToggleStatus = async (row, newStatus) => {
  const action = newStatus === 1 ? '启用' : '禁用';
  try {
    await supplierApi.updateSupplier(row.id, { status: newStatus });
    ElMessage.success(`${action}成功`);
    fetchData();
  } catch (error) {
    console.error(`${action}供应商失败:`, error);
    ElMessage.error(error.response?.data?.message || `${action}供应商失败`);
  }
};

// 导入相关方法
const handleImport = () => {
  importDialogVisible.value = true;
};

const downloadTemplate = async () => {
  try {
    const response = await supplierApi.downloadSupplierTemplate();
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '供应商导入模板.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    ElMessage.success('模板下载成功');
  } catch (error) {
    console.error('下载模板失败:', error);
    ElMessage.error('下载模板失败');
  }
};

const handleFileChange = (file) => {
  selectedFile.value = file.raw;
};

const handleUpload = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请选择要导入的文件');
    return;
  }

  uploading.value = true;
  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);

    const response = await supplierApi.importSuppliers(formData);

    // 拦截器已解包，response.data 就是业务数据
    // 如果业务失败，拦截器会抛出错误
    ElMessage.success(`导入成功！成功导入 ${response.data.successCount || 0} 条记录`);
    if (response.data.errors && response.data.errors.length > 0) {
      console.warn('导入警告:', response.data.errors);
    }
    importDialogVisible.value = false;
    selectedFile.value = null;
    if (uploadRef.value) {
      uploadRef.value.clearFiles();
    }
    fetchData(); // 刷新数据
  } catch (error) {
    console.error('导入失败:', error);
    ElMessage.error('导入失败: ' + (error.response?.data?.message || error.message));
  } finally {
    uploading.value = false;
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

.ellipsis-cell {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 优化表格内容显示 */
:deep(.el-table .cell) {
  word-break: break-word;
  line-height: 1.5;
}

/* 操作列样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}
</style>