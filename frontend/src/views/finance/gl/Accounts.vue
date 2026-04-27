<!--
/**
 * Accounts.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="accounts-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>会计科目管理</h2>
          <p class="subtitle">管理会计科目与账户</p>
        </div>
        <el-button
          type="primary"
          :icon="Plus"
          @click="showAddDialog"
          v-permission="'finance:accounts:create'">
          新增科目
        </el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="科目编码">
          <el-input  v-model="searchForm.account_code" placeholder="输入科目编码" clearable ></el-input>
        </el-form-item>
        <el-form-item label="科目名称">
          <el-input  v-model="searchForm.account_name" placeholder="输入科目名称" clearable ></el-input>
        </el-form-item>
        <el-form-item label="科目类型">
          <el-select v-model="searchForm.account_type" placeholder="选择科目类型" clearable>
            <el-option label="资产" value="资产"></el-option>
            <el-option label="负债" value="负债"></el-option>
            <el-option label="所有者权益" value="所有者权益"></el-option>
            <el-option label="收入" value="收入"></el-option>
            <el-option label="成本" value="成本"></el-option>
            <el-option label="费用" value="费用"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchAccounts" :loading="loading">查询</el-button>
          <el-button @click="resetSearch" :loading="loading">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="accountList"
        style="width: 100%"
        row-key="id"
        border
        :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
        v-loading="loading"
      >
        <template #empty>
          <el-empty description="暂无会计科目数据" />
        </template>
        <el-table-column prop="account_code" label="科目编码" width="120"></el-table-column>
        <el-table-column prop="account_name" label="科目名称" width="180"></el-table-column>
        <el-table-column prop="account_type" label="科目类型" width="140"></el-table-column>
        <el-table-column label="借/贷方向" width="100">
          <template #default="scope">
            {{ scope.row.is_debit ? '借' : '贷' }}
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" width="300" show-overflow-tooltip></el-table-column>
        <el-table-column label="辅助核算" width="200">
          <template #default="scope">
            <el-tag v-if="scope.row.has_customer" size="small" type="warning" class="mr-1">客户</el-tag>
            <el-tag v-if="scope.row.has_supplier" size="small" type="info" class="mr-1">供应商</el-tag>
            <el-tag v-if="scope.row.has_employee" size="small" type="success" class="mr-1">员工</el-tag>
            <el-tag v-if="scope.row.has_department" size="small" type="primary" class="mr-1">部门</el-tag>
            <el-tag v-if="scope.row.has_project" size="small" type="danger" class="mr-1">项目</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="scope">
            <el-tag :type="scope.row.is_active ? 'success' : 'info'">
              {{ scope.row.is_active ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="220" fixed="right">
          <template #default="scope">
            <div class="operation-buttons">
              <el-button
                v-if="!scope.row.is_active && canUpdate"
                type="primary"
                size="small"
                @click="handleEdit(scope.row)">
                编辑
              </el-button>
              <el-popconfirm
                v-if="canUpdate"
                :title="scope.row.is_active ? '确定要禁用该会计科目吗？' : '确定要启用该会计科目吗？'"
                @confirm="handleToggleStatus(scope.row)"
                :confirm-button-type="scope.row.is_active ? 'danger' : 'success'"
              >
                <template #reference>
                  <el-button
                    :type="scope.row.is_active ? 'danger' : 'success'"
                    size="small">
                    {{ scope.row.is_active ? '禁用' : '启用' }}
                  </el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                v-if="!scope.row.is_active && canDelete"
                title="确定要删除该会计科目吗？此操作不可逆。"
                @confirm="handleDelete(scope.row)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button
                    type="danger"
                    size="small">
                    删除
                  </el-button>
                </template>
              </el-popconfirm>
              <el-button v-if="canCreate" size="small" @click="addChild(scope.row)">添加子科目</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(parseInt(total) || 0, 1)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>

    </el-card>
    
    <!-- 添加/编辑对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="600px"
    >
      <el-form :model="accountForm" :rules="accountRules" ref="accountFormRef" label-width="100px">
        <el-form-item label="科目编码" prop="account_code">
          <el-input v-model="accountForm.account_code" placeholder="请输入科目编码"></el-input>
        </el-form-item>
        <el-form-item label="科目名称" prop="account_name">
          <el-input v-model="accountForm.account_name" placeholder="请输入科目名称"></el-input>
        </el-form-item>
        <el-form-item label="科目类型" prop="account_type">
          <el-select v-model="accountForm.account_type" placeholder="请选择科目类型" style="width: 100%">
            <el-option label="资产" value="资产"></el-option>
            <el-option label="负债" value="负债"></el-option>
            <el-option label="所有者权益" value="所有者权益"></el-option>
            <el-option label="收入" value="收入"></el-option>
            <el-option label="成本" value="成本"></el-option>
            <el-option label="费用" value="费用"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="借/贷方向" prop="is_debit">
          <el-radio-group v-model="accountForm.is_debit">
            <el-radio :value="true">借</el-radio>
            <el-radio :value="false">贷</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="父科目" prop="parent_id" v-if="isAdding">
          <el-cascader
            v-model="accountForm.parent_id"
            :options="accountOptions"
            :props="{ 
              checkStrictly: true,
              value: 'id',
              label: 'fullName',
              emitPath: false
            }"
            placeholder="请选择父科目"
            clearable
            style="width: 100%"
          >
          </el-cascader>
        </el-form-item>
        <el-form-item label="辅助核算">
          <div style="display: flex; gap: 15px; flex-wrap: wrap;">
            <el-checkbox v-model="accountForm.has_customer" :true-value="1" :false-value="0">客户核算</el-checkbox>
            <el-checkbox v-model="accountForm.has_supplier" :true-value="1" :false-value="0">供应商核算</el-checkbox>
            <el-checkbox v-model="accountForm.has_employee" :true-value="1" :false-value="0">员工核算</el-checkbox>
            <el-checkbox v-model="accountForm.has_department" :true-value="1" :false-value="0">部门核算</el-checkbox>
            <el-checkbox v-model="accountForm.has_project" :true-value="1" :false-value="0">项目核算</el-checkbox>
          </div>
        </el-form-item>
        <el-form-item label="状态" prop="is_active">
          <el-switch v-model="accountForm.is_active" active-text="启用" inactive-text="禁用"></el-switch>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="accountForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入描述"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveAccount" :loading="saveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { parsePaginatedData, parseListData } from '@/utils/responseParser';

import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

// 权限计算属性（修复：之前未定义导致 TypeError: Cannot convert object to primitive value）
const canCreate = computed(() => authStore.hasPermission('finance:gl:accounts:create'));
const canUpdate = computed(() => authStore.hasPermission('finance:gl:accounts:update'));
const canDelete = computed(() => authStore.hasPermission('finance:gl:accounts:delete'));

// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);

// 分页相关
const total = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);

// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('新增会计科目');
const isAdding = ref(true);
const accountFormRef = ref(null);

// 会计科目列表
const accountList = ref([]);
const accountOptions = ref([]);

// 搜索表单
const searchForm = reactive({
  account_code: '',
  account_name: '',
  account_type: ''
});

// 会计科目表单
const accountForm = reactive({
  id: null,
  account_code: '',
  account_name: '',
  account_type: '资产',
  parent_id: null,
  is_debit: true,
  is_active: true,
  description: '',
  has_customer: 0,
  has_supplier: 0,
  has_employee: 0,
  has_department: 0,
  has_project: 0
});

// 表单验证规则
const accountRules = {
  account_code: [
    { required: true, message: '请输入科目编码', trigger: 'blur' },
    { min: 1, max: 20, message: '长度在1到20个字符', trigger: 'blur' }
  ],
  account_name: [
    { required: true, message: '请输入科目名称', trigger: 'blur' },
    { min: 1, max: 100, message: '长度在1到100个字符', trigger: 'blur' }
  ],
  account_type: [
    { required: true, message: '请选择科目类型', trigger: 'change' }
  ]
};

// 加载会计科目列表
const loadAccounts = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value
    };

    // 添加搜索条件
    if (searchForm.account_code) {
      params.account_code = searchForm.account_code;
    }
    if (searchForm.account_name) {
      params.account_name = searchForm.account_name;
    }
    if (searchForm.account_type) {
      params.account_type = searchForm.account_type;
    }

    const response = await api.get('/finance/accounts', { params });

    // 使用统一的响应解析工具
    const { list, total: totalCount } = parsePaginatedData(response, {
      logPrefix: '📋 会计科目列表: ',
      enableLog: false
    });

    accountList.value = list;
    total.value = totalCount;
  } catch (error) {
    console.error('加载会计科目失败:', error);
    ElMessage.error('加载会计科目失败');
    accountList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

// 加载会计科目选项（用于级联选择器）
const loadAccountOptions = async () => {
  try {
    const response = await api.get('/finance/accounts/options');
    // 使用统一的列表数据解析工具
    const accounts = parseListData(response, { enableLog: false });
    accountOptions.value = accounts.map(item => ({
      ...item,
      fullName: `${item.account_code} - ${item.account_name}`
    }));
  } catch (error) {
    console.error('加载会计科目选项失败:', error);
    ElMessage.error('加载会计科目选项失败');
    accountOptions.value = [];
  }
};

// 搜索会计科目
const searchAccounts = () => {
  currentPage.value = 1;
  loadAccounts();
};

// 重置搜索条件
const resetSearch = () => {
  Object.keys(searchForm).forEach(key => {
    searchForm[key] = '';
  });
  searchAccounts();
};

// 新增会计科目
const showAddDialog = () => {
  dialogTitle.value = '新增会计科目';
  isAdding.value = true;
  resetAccountForm();
  dialogVisible.value = true;
};

// 编辑会计科目
const handleEdit = (row) => {
  dialogTitle.value = '编辑会计科目';
  isAdding.value = false;
  Object.keys(accountForm).forEach(key => {
    accountForm[key] = row[key];
  });
  dialogVisible.value = true;
};

// 添加子科目
const addChild = (row) => {
  dialogTitle.value = '添加子科目';
  isAdding.value = true;
  resetAccountForm();
  accountForm.parent_id = row.id;
  dialogVisible.value = true;
};

// 删除会计科目
const handleDelete = (row) => {
  ElMessageBox.confirm('确认要删除该会计科目吗？此操作不可逆。', '警告', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await api.delete(`/finance/accounts/${row.id}`);
      ElMessage.success('删除成功');
      loadAccounts();
    } catch (error) {
      console.error('删除会计科目失败:', error);
      ElMessage.error('删除会计科目失败');
    }
  }).catch(() => {});
};

// 切换会计科目状态
const handleToggleStatus = (row) => {
  const statusText = row.is_active ? '禁用' : '启用';
  const newStatus = !row.is_active;

  ElMessageBox.confirm(`确认要${statusText}该会计科目吗？`, '提示', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await api.patch(`/finance/accounts/${row.id}/status`, { is_active: newStatus });
      ElMessage.success(`${statusText}成功`);
      loadAccounts();
    } catch (error) {
      console.error(`${statusText}失败:`, error);
      ElMessage.error(`${statusText}失败`);
    }
  }).catch(() => {});
};

// 保存会计科目
const saveAccount = async () => {
  if (!accountFormRef.value) return;
  
  await accountFormRef.value.validate(async (valid) => {
    if (valid) {
      saveLoading.value = true;
      try {
        if (accountForm.id) {
          // 更新
          await api.put(`/finance/accounts/${accountForm.id}`, accountForm);
          ElMessage.success('更新成功');
        } else {
          // 新增
          await api.post('/finance/accounts', accountForm);
          ElMessage.success('添加成功');
        }
        dialogVisible.value = false;
        loadAccounts();
        loadAccountOptions();
      } catch (error) {
        console.error('保存会计科目失败:', error);
        ElMessage.error('保存会计科目失败');
      } finally {
        saveLoading.value = false;
      }
    }
  });
};

// 重置表单
const resetAccountForm = () => {
  Object.keys(accountForm).forEach(key => {
    if (key === 'is_debit') {
      accountForm[key] = true;
    } else if (key === 'is_active') {
      accountForm[key] = true;
    } else if (key === 'account_type') {
      accountForm[key] = '资产';
    } else if (['has_customer', 'has_supplier', 'has_employee', 'has_department', 'has_project'].includes(key)) {
      accountForm[key] = 0;
    } else {
      accountForm[key] = null;
    }
  });
  // 清除校验
  if (accountFormRef.value) {
    accountFormRef.value.resetFields();
  }
};

// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = size;
  loadAccounts();
};

const handleCurrentChange = (page) => {
  currentPage.value = page;
  loadAccounts();
};

// 页面加载时执行
onMounted(() => {
  loadAccounts();
  loadAccountOptions();
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

/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}
</style>