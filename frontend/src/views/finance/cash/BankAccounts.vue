<!--
/**
 * BankAccounts.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="bank-accounts-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>银行账户管理</h2>
          <p class="subtitle">管理银行账户信息</p>
        </div>
        <el-button v-permission="'finance:cash:create'" type="primary" :icon="Plus" @click="showAddDialog">新增账户</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="账户名称">
          <el-input  v-model="searchForm.accountName" placeholder="输入账户名称" clearable ></el-input>
        </el-form-item>
        <el-form-item label="开户银行">
          <el-input  v-model="searchForm.bankName" placeholder="输入开户银行" clearable ></el-input>
        </el-form-item>
        <el-form-item label="账户状态">
          <el-select  v-model="searchForm.status" placeholder="选择状态" clearable>
            <el-option label="正常" value="active"></el-option>
            <el-option label="冻结" value="frozen"></el-option>
            <el-option label="已注销" value="closed"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchAccounts">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 账户统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ accountStats.totalAccounts }}</div>
        <div class="stat-label">账户总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ accountStats.activeAccounts }}</div>
        <div class="stat-label">正常账户</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(accountStats.totalBalance) }}</div>
        <div class="stat-label">账户总余额</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(accountStats.totalInLastMonth) }}</div>
        <div class="stat-label">本月收入</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(accountStats.totalOutLastMonth) }}</div>
        <div class="stat-label">本月支出</div>
      </el-card>
    </div>
    
    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="accountList"
        style="width: 100%"
        border
        v-loading="loading"
      >
        <el-table-column prop="accountName" label="账户名称" min-width="110" show-overflow-tooltip></el-table-column>
        <el-table-column prop="accountNumber" label="账号" min-width="180" show-overflow-tooltip></el-table-column>
        <el-table-column prop="bankName" label="开户银行" min-width="180" show-overflow-tooltip></el-table-column>
        <el-table-column prop="branchName" label="开户网点" min-width="190" show-overflow-tooltip></el-table-column>
        <el-table-column prop="currency" label="币种" width="80">
          <template #default="scope">
            {{ getCurrencyText(scope.row.currency) }}
          </template>
        </el-table-column>
        <el-table-column prop="balance" label="当前余额" width="150" align="right">
          <template #default="scope">
            <span :class="{ 'negative-value': scope.row.balance < 0 }">
              {{ formatCurrency(scope.row.balance) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="openDate" label="开户日期" width="100"></el-table-column>
        <el-table-column label="账户状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastTransactionDate" label="最后交易日期" width="120"></el-table-column>
        <el-table-column label="操作" min-width="220" fixed="right">
          <template #default="scope">
            <el-button v-if="scope.row.status === 'frozen'" type="primary" size="small" @click="handleEdit(scope.row)"
              v-permission="'finance:cash:accounts'">编辑</el-button>
            <el-button type="success" size="small" @click="showTransactions(scope.row)">交易明细</el-button>
            <el-button 
              :type="scope.row.status === 'active' ? 'warning' : 'success'"
              size="small" 
              @click="toggleAccountStatus(scope.row)"
            >
              {{ scope.row.status === 'active' ? '冻结' : '激活' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          :current-page="currentPage"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>
    
    <!-- 添加/编辑账户对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="600px"
    >
      <el-form :model="accountForm" :rules="accountRules" ref="accountFormRef" label-width="100px">
        <el-form-item label="账户名称" prop="accountName">
          <el-input v-model="accountForm.accountName" placeholder="请输入账户名称"></el-input>
        </el-form-item>
        <el-form-item label="账号" prop="accountNumber">
          <el-input v-model="accountForm.accountNumber" placeholder="请输入银行账号"></el-input>
        </el-form-item>
        <el-form-item label="开户银行" prop="bankName">
          <el-input v-model="accountForm.bankName" placeholder="请输入开户银行名称"></el-input>
        </el-form-item>
        <el-form-item label="开户网点" prop="branchName">
          <el-input v-model="accountForm.branchName" placeholder="请输入开户网点名称"></el-input>
        </el-form-item>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="币种" prop="currency">
              <el-select v-model="accountForm.currency" placeholder="请选择币种" style="width: 100%">
                <el-option label="人民币" value="CNY"></el-option>
                <el-option label="美元" value="USD"></el-option>
                <el-option label="欧元" value="EUR"></el-option>
                <el-option label="日元" value="JPY"></el-option>
                <el-option label="英镑" value="GBP"></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="初始余额" prop="initialBalance">
              <el-input-number 
                v-model="accountForm.initialBalance" 
                :precision="2" 
                :step="1000"
                style="width: 100%"
                :disabled="!isNewAccount"
              ></el-input-number>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="开户日期" prop="openDate">
              <el-date-picker
                v-model="accountForm.openDate"
                type="date"
                placeholder="选择开户日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="账户状态" prop="status">
              <el-select v-model="accountForm.status" placeholder="请选择状态" style="width: 100%">
                <el-option label="正常" value="active"></el-option>
                <el-option label="冻结" value="frozen"></el-option>
                <el-option label="已注销" value="closed"></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item label="账户用途" prop="purpose">
          <el-input
            v-model="accountForm.purpose"
            type="textarea"
            :rows="2"
            placeholder="请输入账户用途说明"
          ></el-input>
        </el-form-item>
        
        <el-form-item label="备注" prop="notes">
          <el-input
            v-model="accountForm.notes"
            type="textarea"
            :rows="2"
            placeholder="请输入备注信息"
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
    
    <!-- 交易明细对话框 -->
    <el-dialog
      :title="`${selectedAccount.accountName} - 交易明细`"
      v-model="transactionsDialogVisible"
      width="900px"
    >
      <div class="transaction-filters">
        <el-form :inline="true" class="search-form" :model="transactionSearchForm">
          <el-form-item label="日期范围">
            <el-date-picker
              v-model="transactionSearchForm.dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
            ></el-date-picker>
          </el-form-item>
          <el-form-item label="交易类型">
            <el-select  v-model="transactionSearchForm.type" placeholder="全部" clearable>
              <el-option label="存款" value="存款"></el-option>
              <el-option label="取款" value="取款"></el-option>
              <el-option label="转入" value="转入"></el-option>
              <el-option label="转出" value="转出"></el-option>
              <el-option label="利息" value="利息"></el-option>
              <el-option label="费用" value="费用"></el-option>
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="searchTransactions">查询</el-button>
            <el-button v-permission="'finance:cash:export'" type="success" @click="exportTransactions">导出</el-button>
            <el-button type="warning" @click="goToReconciliation">去对账</el-button>
            <el-button @click="goToTransactions">交易管理</el-button>
          </el-form-item>
        </el-form>
      </div>
      
      <el-table
        :data="transactionsList"
        style="width: 100%"
        border
        v-loading="transactionsLoading"
        :max-height="450"
        show-overflow-tooltip
      >
        <el-table-column prop="transaction_date" label="交易日期" width="100"></el-table-column>
        <el-table-column label="交易类型" width="90">
          <template #default="scope">
            <el-tag 
              :type="getTransactionTagType(scope.row.transaction_type)"
            >
              {{ scope.row.transaction_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="交易金额" width="130" align="right">
          <template #default="scope">
            <span :class="[getAmountClass(scope.row.transaction_type, scope.row.amount)]">
              {{ formatCurrency(scope.row.amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="交易描述" min-width="200" show-overflow-tooltip></el-table-column>
        <el-table-column prop="reference_number" label="参考号" width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="is_reconciled" label="对账状态" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.is_reconciled ? 'success' : 'info'">
              {{ scope.row.is_reconciled ? '已对账' : '未对账' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="transactionsTotal"
          :current-page="transactionsCurrentPage"
          :page-size="transactionsPageSize"
          @current-change="handleTransactionsPageChange"
        >
        </el-pagination>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { parsePaginatedData, parseDataObject } from '@/utils/responseParser'
import { formatCurrency } from '@/utils/format'

import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { api } from '@/services/api';

const loading = ref(false);
const accountList = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);

const searchForm = reactive({ accountName: '', bankName: '', status: '' });

const dialogTitle = ref('新增银行账户');
const dialogVisible = ref(false);
const isNewAccount = ref(true);
const saveLoading = ref(false);
const accountFormRef = ref(null);

const accountForm = reactive({
  id: null, accountName: '', accountNumber: '', bankName: '', branchName: '',
  currency: 'CNY', initialBalance: 0, balance: 0,
  openDate: new Date().toISOString().slice(0, 10),
  status: 'active', purpose: '', notes: '', lastTransactionDate: ''
});

const accountRules = {
  accountName: [{ required: true, message: '请输入账户名称', trigger: 'blur' }],
  accountNumber: [{ required: true, message: '请输入银行账号', trigger: 'blur' }],
  bankName: [{ required: true, message: '请输入开户银行', trigger: 'blur' }],
  currency: [{ required: true, message: '请选择币种', trigger: 'change' }],
  openDate: [{ required: true, message: '请选择开户日期', trigger: 'change' }]
};

const selectedAccount = ref({});
const transactionsDialogVisible = ref(false);
const transactionsLoading = ref(false);
const transactionsList = ref([]);
const transactionsTotal = ref(0);
const transactionsCurrentPage = ref(1);
const transactionsPageSize = ref(20);
const transactionSearchForm = reactive({ dateRange: null, type: '' });

const accountStats = reactive({
  totalAccounts: 0, activeAccounts: 0, totalBalance: 0,
  totalInLastMonth: 0, totalOutLastMonth: 0
});

const getTransactionTagType = (type) => {
  const typeMap = { '存款': 'success', '转入': 'success', '利息': 'success', '取款': 'danger', '转出': 'danger', '费用': 'warning' };
  return typeMap[type] || 'info';
};

// 获取金额的样式类
const getAmountClass = (type, amount) => {
  if (['存款', '转入', '利息'].includes(type)) {
    return 'positive-value';
  } else if (['取款', '转出', '费用'].includes(type)) {
    return 'negative-value';
  }
  return '';
};

// 获取币种文本
const getCurrencyText = (currency) => {
  const currencyMap = {
    CNY: '人民币',
    USD: '美元',
    EUR: '欧元',
    JPY: '日元',
    GBP: '英镑'
  };
  return currencyMap[currency] || currency;
};

// 获取状态类型
const getStatusType = (status) => {
  const statusMap = {
    active: 'success',
    frozen: 'warning',
    closed: 'info'
  };
  return statusMap[status] || 'info';
};

// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    active: '正常',
    frozen: '冻结',
    closed: '已注销'
  };
  return statusMap[status] || status;
};

// 加载账户列表
const loadAccounts = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      accountName: searchForm.accountName,
      bankName: searchForm.bankName,
      status: searchForm.status
    };

    const response = await api.get('/finance/bank-accounts', { params });
    // 使用统一的响应解析工具
    const { list, total: totalCount } = parsePaginatedData(response, { enableLog: false });
    accountList.value = list.map(account => ({
      id: account.id,
      accountName: account.accountName || '',
      accountNumber: account.accountNumber || '',
      bankName: account.bankName || '',
      branchName: account.branchName || '',
      currency: account.currency || 'CNY',
      balance: account.balance || 0,
      initialBalance: account.initialBalance || 0,
      openDate: account.openDate || '',
      status: account.status || 'active',
      purpose: account.purpose || '',
      notes: account.notes || '',
      lastTransactionDate: account.lastTransactionDate || ''
    }));

    total.value = totalCount;

    // 加载账户统计
    loadAccountsStats();
  } catch (error) {
    console.error('加载银行账户列表失败:', error);
    ElMessage.error('加载银行账户列表失败');
    accountList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

// 加载账户统计信息
const loadAccountsStats = async () => {
  try {
    const response = await api.get('/finance/bank-accounts/stats');
    // 使用统一的响应解析工具
    const stats = parseDataObject(response, { enableLog: false }) || {};
    Object.assign(accountStats, {
      totalAccounts: stats.totalAccounts || 0,
      activeAccounts: stats.activeAccounts || 0,
      totalBalance: stats.totalBalance || 0,
      totalInLastMonth: stats.totalInLastMonth || 0,
      totalOutLastMonth: stats.totalOutLastMonth || 0
    });
  } catch (error) {
    console.error('加载账户统计信息失败:', error);
  }
};

// 搜索账户
const searchAccounts = () => {
  currentPage.value = 1;
  loadAccounts();
};

// 重置搜索条件
const resetSearch = () => {
  searchForm.accountName = '';
  searchForm.bankName = '';
  searchForm.status = '';
  searchAccounts();
};

// 新增账户
const showAddDialog = () => {
  dialogTitle.value = '新增银行账户';
  resetAccountForm();
  isNewAccount.value = true;
  dialogVisible.value = true;
};

// 编辑账户
const handleEdit = (row) => {
  dialogTitle.value = '编辑银行账户';
  resetAccountForm();
  
  // 填充表单数据
  Object.assign(accountForm, row);
  isNewAccount.value = false;
  
  dialogVisible.value = true;
};

// 切换账户状态
const toggleAccountStatus = (row) => {
  const action = row.status === 'active' ? '冻结' : '激活';
  const newStatus = row.status === 'active' ? 'frozen' : 'active';
  
  ElMessageBox.confirm(`确认要${action}该银行账户吗？`, '提示', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await api.patch(`/finance/bank-accounts/${row.id}/status`, {
        status: newStatus
      });
      
      ElMessage.success(`账户${action}成功`);
      loadAccounts();
    } catch (error) {
      console.error(`${action}账户失败:`, error);
      ElMessage.error(`${action}账户失败`);
    }
  }).catch(() => {});
};

// 保存账户
const saveAccount = async () => {
  if (!accountFormRef.value) return;
  
  await accountFormRef.value.validate(async (valid) => {
    if (valid) {
      saveLoading.value = true;
      try {
        // 准备提交的数据，将前端字段名转换为后端所需字段名
        const data = {
          account_name: accountForm.accountName,
          account_number: accountForm.accountNumber,
          bank_name: accountForm.bankName,
          branch_name: accountForm.branchName,
          currency_code: accountForm.currency,
          initial_balance: accountForm.initialBalance,
          current_balance: isNewAccount.value ? accountForm.initialBalance : accountForm.balance,
          account_type: accountForm.purpose || '活期',
          is_active: accountForm.status === 'active',
          notes: accountForm.notes
        };
        
        if (accountForm.id) {
          // 更新
          await api.put(`/finance/bank-accounts/${accountForm.id}`, data);
          ElMessage.success('更新成功');
        } else {
          // 新增
          await api.post('/finance/bank-accounts', data);
          ElMessage.success('添加成功');
        }
        dialogVisible.value = false;
        loadAccounts();
      } catch (error) {
        console.error('保存银行账户失败:', error);
        ElMessage.error('保存银行账户失败');
      } finally {
        saveLoading.value = false;
      }
    }
  });
};

// 查看交易明细
const showTransactions = (row) => {
  selectedAccount.value = row;
  transactionSearchForm.dateRange = null;
  transactionSearchForm.type = '';
  transactionsCurrentPage.value = 1;
  transactionsDialogVisible.value = true;
  loadTransactions();
};

// 加载交易明细
const loadTransactions = async () => {
  if (!selectedAccount.value.id) return;
  
  transactionsLoading.value = true;
  try {
    const params = {
      accountId: selectedAccount.value.id,
      page: transactionsCurrentPage.value,
      limit: transactionsPageSize.value
    };
    
    if (transactionSearchForm.dateRange && transactionSearchForm.dateRange.length === 2) {
      params.startDate = transactionSearchForm.dateRange[0];
      params.endDate = transactionSearchForm.dateRange[1];
    }
    
    if (transactionSearchForm.type) {
      params.transactionType = transactionSearchForm.type;
    }

    const response = await api.get('/finance/bank-transactions', { params });
    // 使用统一的响应解析工具
    const { list, total: totalCount } = parsePaginatedData(response, { enableLog: false });
    transactionsList.value = list;
    transactionsTotal.value = totalCount;
  } catch (error) {
    console.error('加载交易明细失败:', error);
    ElMessage.error('加载交易明细失败');
    transactionsList.value = [];
    transactionsTotal.value = 0;
  } finally {
    transactionsLoading.value = false;
  }
};

// 搜索交易明细
const searchTransactions = () => {
  transactionsCurrentPage.value = 1;
  loadTransactions();
};

// 导出交易明细
const exportTransactions = () => {
  if (!selectedAccount.value.id) return;
  
  // 使用环境变量配置的API基础URL，默认为相对路径
  const baseURL = import.meta.env.VITE_API_URL || '';
  let url = `${baseURL}/api/finance/bank-transactions/export?accountId=${selectedAccount.value.id}`;
  
  if (transactionSearchForm.dateRange && transactionSearchForm.dateRange.length === 2) {
    url += `&startDate=${transactionSearchForm.dateRange[0]}&endDate=${transactionSearchForm.dateRange[1]}`;
  }
  
  if (transactionSearchForm.type) {
    url += `&type=${transactionSearchForm.type}`;
  }
  
  window.open(url);
};

// 重置账户表单
const resetAccountForm = () => {
  accountForm.id = null;
  accountForm.accountName = '';
  accountForm.accountNumber = '';
  accountForm.bankName = '';
  accountForm.branchName = '';
  accountForm.currency = 'CNY';
  accountForm.initialBalance = 0;
  accountForm.balance = 0;
  accountForm.openDate = new Date().toISOString().slice(0, 10);
  accountForm.status = 'active';
  accountForm.purpose = '';
  accountForm.notes = '';
  accountForm.lastTransactionDate = '';
  
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

const handleTransactionsPageChange = (page) => {
  transactionsCurrentPage.value = page;
  loadTransactions();
};

// 页面跳转
const router = useRouter();

const goToReconciliation = () => {
  transactionsDialogVisible.value = false;
  router.push({
    path: '/finance/cash/reconciliation',
    query: { accountId: selectedAccount.value.id }
  });
};

const goToTransactions = () => {
  transactionsDialogVisible.value = false;
  router.push({
    path: '/finance/cash/transactions',
    query: { accountId: selectedAccount.value.id }
  });
};

// 页面加载时执行
onMounted(() => {
  loadAccounts();
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

.negative-value {
  color: var(--color-danger);
}

.positive-value {
  color: var(--color-success);
}

.transaction-filters {
  margin-bottom: 15px;
}



/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}




</style> 