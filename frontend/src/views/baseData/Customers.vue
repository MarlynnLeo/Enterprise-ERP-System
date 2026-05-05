<!--
/**
 * Customers.vue
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
          <h2>{{ $t('page.baseData.customers.title') }}</h2>
          <p class="subtitle">管理客户基础信息</p>
        </div>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleAdd">{{ $t('page.baseData.customers.add') }}</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item :label="$t('page.baseData.customers.customerCode')">
          <el-input  v-model="searchForm.code" :placeholder="$t('page.baseData.customers.customerCodePlaceholder')" clearable ></el-input>
        </el-form-item>
        <el-form-item :label="$t('page.baseData.customers.customerName')">
          <el-input  v-model="searchForm.name" :placeholder="$t('page.baseData.customers.customerNamePlaceholder')" clearable ></el-input>
        </el-form-item>
        <el-form-item label="客户类型">
          <el-select v-model="searchForm.customer_type" placeholder="全部类型" clearable>
            <el-option value="direct" label="直销客户"></el-option>
            <el-option value="distributor" label="经销商"></el-option>
            <el-option value="retail" label="零售客户"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('common.status')">
          <el-select  v-model="searchForm.status" :placeholder="$t('page.baseData.materials.statusPlaceholder')" clearable>
            <el-option :value="'active'" :label="$t('page.baseData.materials.enabled')"></el-option>
            <el-option :value="'inactive'" :label="$t('page.baseData.materials.disabled')"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> {{ $t('common.search') }}
          </el-button>
          <el-button @click="resetSearch" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> {{ $t('common.reset') }}
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
        <div class="stat-label">{{ $t('page.baseData.customers.totalCustomers') }}</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.active || 0 }}</div>
        <div class="stat-label">{{ $t('page.baseData.customers.activeCustomers') }}</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.inactive || 0 }}</div>
        <div class="stat-label">{{ $t('page.baseData.customers.inactiveCustomers') }}</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.totalCredit || 0 }} {{ $t('common.currency') }}</div>
        <div class="stat-label">{{ $t('page.baseData.customers.creditLimit') }}</div>
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
          <el-empty description="暂无客户数据" />
        </template>
        <el-table-column prop="code" :label="$t('page.baseData.customers.customerCode')" width="100">
          <template #default="scope">
            <span>{{ scope.row.code || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" :label="$t('page.baseData.customers.customerName')" min-width="250">
          <template #default="scope">
            <el-tooltip :content="scope.row.name" placement="top" :show-after="500">
              <span class="ellipsis-cell">{{ scope.row.name }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="customer_type" label="类型" width="110">
          <template #default="scope">
            <el-tag :type="scope.row.customer_type === 'distributor' ? 'warning' : (scope.row.customer_type === 'retail' ? 'success' : 'info')">
              {{ scope.row.customer_type === 'distributor' ? '经销商' : (scope.row.customer_type === 'retail' ? '零售客户' : '直销客户') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="contact_person" :label="$t('page.baseData.customers.contact')" width="90"></el-table-column>
        <el-table-column prop="contact_phone" :label="$t('page.baseData.customers.phone')" width="120"></el-table-column>
        <el-table-column prop="email" :label="$t('user.email')" min-width="160">
          <template #default="scope">
            <el-tooltip :content="scope.row.email" placement="top" :show-after="500">
              <span class="ellipsis-cell">{{ scope.row.email }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="$t('common.status')" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.status === 'active' ? 'success' : 'danger'">
              {{ scope.row.status === 'active' ? $t('page.baseData.materials.enabled') : $t('page.baseData.materials.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="credit_limit" :label="$t('page.baseData.customers.creditLimit')" width="90"></el-table-column>
        <el-table-column prop="address" :label="$t('page.baseData.customers.address')" min-width="200">
          <template #default="scope">
            <el-tooltip :content="scope.row.address" placement="top" :show-after="500">
              <span class="ellipsis-cell">{{ scope.row.address }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="150">
          <template #default="scope">
            <el-tooltip :content="scope.row.remark" placement="top" :show-after="500">
              <span class="ellipsis-cell">{{ scope.row.remark }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="230" fixed="right">
          <template #default="scope">
            <el-popconfirm
              v-if="canUpdate"
              :title="scope.row.status === 'active' ? '确定要禁用该客户吗？' : '确定要启用该客户吗？'"
              @confirm="handleToggleStatus(scope.row)"
              :confirm-button-type="scope.row.status === 'active' ? 'warning' : 'success'"
            >
              <template #reference>
                <el-button
                  size="small"
                  :type="scope.row.status === 'active' ? 'warning' : 'success'">
                  <el-icon><Switch /></el-icon> {{ scope.row.status === 'active' ? '禁用' : '启用' }}
                </el-button>
              </template>
            </el-popconfirm>
            <template v-if="scope.row.status !== 'active'">
              <el-button
                v-if="canUpdate"
                size="small"
                type="primary"
                @click="handleEdit(scope.row)">
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-popconfirm
                v-if="canDelete"
                title="确定要删除该客户吗？此操作无法恢复。"
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
          :total="Math.max(parseInt(total) || 0, 1)"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <CustomerFormDialog
      v-model="dialogVisible"
      :editData="currentEditData"
      :title="dialogTitle"
      @success="fetchData"
    />
  </div>
</template>

<script setup>
import { parsePaginatedData } from '@/utils/responseParser'
import CustomerFormDialog from './components/CustomerFormDialog.vue';

import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus'
import { baseDataApi } from '@/api/baseData';
import { Plus, Edit, Delete, Search, Refresh, Download, Switch } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

// 权限store
const authStore = useAuthStore();
const canCreate = computed(() => authStore.hasPermission('basedata:customers:create'));
const canUpdate = computed(() => authStore.hasPermission('basedata:customers:update'));
const canDelete = computed(() => authStore.hasPermission('basedata:customers:delete'));
const canExport = computed(() => authStore.hasPermission('basedata:customers:export'));

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
  inactive: 0,
  totalCredit: 0
});

// 搜索表单
const searchForm = reactive({
  code: '',
  name: '',
  customer_type: '',
  status: ''
});

// 对话框控制
const dialogVisible = ref(false);
const dialogTitle = ref('新增客户');
const currentEditData = ref(null);

// 初始化
onMounted(() => {
  // 初始化时加载第一页数据
  currentPage.value = 1;
  pageSize.value = 10;
  fetchStats(); // 获取全量统计数据
  fetchData();
});

// 导出数据
const handleExport = async () => {
  try {
    const response = await baseDataApi.exportCustomers({
      code: searchForm.code,
      name: searchForm.name,
      status: searchForm.status
    });
    // 处理文件下载
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '客户列表.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    ElMessage.success('导出成功');
  } catch {
    ElMessage.error('导出失败');
  }
};

// 获取统计数据（调用后端聚合接口，避免全量加载）
const fetchStats = async () => {
  try {
    const response = await baseDataApi.getCustomerStats();
    const data = response.data?.data || response.data || {};
    stats.total = data.total || 0;
    stats.active = data.active || 0;
    stats.inactive = data.inactive || 0;
    stats.totalCredit = parseFloat(data.totalCredit || 0).toFixed(2);
  } catch (error) {
    console.error('获取客户统计数据失败:', error);
  }
};

// 获取客户列表
const fetchData = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      ...searchForm
    };

    // 移除空值参数
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });

    const response = await baseDataApi.getCustomers(params);

    // 使用统一解析器
    const { list, total: totalCount } = parsePaginatedData(response, { enableLog: false });
    tableData.value = list;
    total.value = totalCount;

    // 确保total不为0，以显示分页
    if (total.value === 0 && tableData.value.length > 0) {
      total.value = tableData.value.length;
    }

    // 注意：统计数据由 fetchStats() 独立获取全量数据计算，不再使用当前页数据
  } catch (error) {
    console.error('获取客户列表失败:', error);
    ElMessage.error('获取客户列表失败');
    tableData.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

// 搜索
const handleSearch = () => {
  currentPage.value = 1;
  fetchData();
};

// 重置搜索
const resetSearch = () => {
  Object.keys(searchForm).forEach(key => {
    searchForm[key] = '';
  });
  currentPage.value = 1;
  fetchData();
};

// 分页相关
const handleSizeChange = (val) => {
  pageSize.value = val;
  currentPage.value = 1; // 重置到第一页
  fetchData();
};

const handleCurrentChange = (val) => {
  currentPage.value = val;
  // 强制执行数据获取，不使用缓存
  fetchData();
};

// 新增客户
const handleAdd = () => {
  dialogTitle.value = '新增客户';
  currentEditData.value = null;
  dialogVisible.value = true;
};

// 编辑客户
const handleEdit = (row) => {
  dialogTitle.value = '编辑客户';
  currentEditData.value = { ...row };
  dialogVisible.value = true;
};

// 删除客户
const handleDelete = async (row) => {
  try {
    await baseDataApi.deleteCustomer(row.id);
    ElMessage.success('删除成功');
    fetchData();
  } catch (error) {
    console.error('删除客户失败:', error);
    
    // 提取更详细的错误信息
    let errorMessage = '删除客户失败';
    
    if (error.response) {
      if (error.response.data && error.response.data.message) {
        errorMessage = `删除失败: ${error.response.data.message}`;
      } else if (error.response.status === 500) {
        errorMessage = '服务器内部错误，该客户可能已被其他数据引用，无法删除';
      } else if (error.response.status === 404) {
        errorMessage = '客户不存在或已被删除';
      } else if (error.response.status === 403) {
        errorMessage = '您没有权限删除此客户';
      }
    } else if (error.request) {
      errorMessage = '服务器无响应，请检查网络连接';
    }
    
    ElMessage.error(errorMessage);
  }
};

// 切换启用/禁用状态
const handleToggleStatus = async (row) => {
  const currentStatus = row.status;
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  const action = newStatus === 'active' ? '启用' : '禁用';

  try {
    await baseDataApi.updateCustomer(row.id, { status: newStatus });
    ElMessage.success(`${action}成功`);
    fetchData();
  } catch (error) {
    console.error(`${action}客户失败:`, error);
    ElMessage.error(error.response?.data?.message || `${action}客户失败`);
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