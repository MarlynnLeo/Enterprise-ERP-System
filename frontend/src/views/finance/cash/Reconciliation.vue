<!--
/**
 * Reconciliation.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="reconciliation-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>银行对账管理</h2>
          <p class="subtitle">银行账户对账与核销</p>
        </div>
        <div class="action-buttons">
          <el-button type="primary" @click="startReconciliation">开始对账</el-button>
          <el-button v-permission="'finance:reconciliation:import'" type="success" @click="importStatement" :disabled="!selectedAccount">导入对账单</el-button>
        </div>
      </div>
    </el-card>
    
    <!-- 账户选择 -->
    <el-card class="select-account-card">
      <div class="card-header">
        <span>选择对账账户</span>
      </div>
      <div class="account-selection">
        <el-form :inline="true" class="search-form" >
          <el-form-item label="选择账户">
            <el-select v-model="selectedAccount" placeholder="请选择银行账户" @change="handleAccountChange">
              <el-option
                v-for="item in accountOptions"
                :key="item.id"
                :label="item.accountName"
                :value="item.id"
              ></el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="对账期间">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              :disabled="!selectedAccount"
            ></el-date-picker>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="searchReconciliation" :disabled="!selectedAccount || !dateRange">查询</el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-card>
    
    <div v-if="isReconciling" class="reconciliation-content">
      <!-- 银行对账统计 -->
      <div class="statistics-row">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(reconciliationStats.bookBalance) }}</div>
          <div class="stat-label">账面余额</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(reconciliationStats.bankBalance) }}</div>
          <div class="stat-label">银行余额</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(reconciliationStats.difference) }}</div>
          <div class="stat-label">差异金额</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ reconciliationStats.unreconciledItems }}</div>
          <div class="stat-label">未对账项目</div>
        </el-card>
      </div>
      
      <!-- 对账状态 -->
      <el-card class="status-card" v-if="reconciliationStats.difference !== 0">
        <el-alert
          title="账目不平衡"
          type="warning"
          description="存在未核对明细，请检查以下数据。"
          show-icon
        ></el-alert>
      </el-card>
      
      <el-card class="status-card" v-else>
        <el-alert
          title="账目已平衡"
          type="success"
          description="所有交易记录已核对完毕。"
          show-icon
        ></el-alert>
      </el-card>
      
      <!-- 标签页 -->
      <el-tabs v-model="activeTab" class="reconciliation-tabs">
        <el-tab-pane label="账面未达账项" name="unreconciled">
          <div class="tab-toolbar">
            <el-button 
              type="success" 
              size="small" 
              :disabled="selectedUnreconciled.length === 0"
              @click="batchMarkReconciled"
            >
              <el-icon class="mr-1"><Check /></el-icon>
              批量对账 ({{ selectedUnreconciled.length }})
            </el-button>
            <span class="tab-info">共 {{ unreconciledItems.length }} 条未对账</span>
          </div>
          <el-table 
            :data="unreconciledItems" 
            border 
            style="width: 100%" 
            v-loading="loading"
            @selection-change="handleUnreconciledSelect"
          >
            <el-table-column type="selection" width="55"></el-table-column>
            <el-table-column prop="transactionDate" label="交易日期" width="110" show-overflow-tooltip></el-table-column>
            <el-table-column label="交易类型" width="90">
              <template #default="scope">
                <el-tag 
                  :type="getTypeStyle(scope.row.type)"
                  size="small"
                >
                  {{ scope.row.type }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="120" align="right">
              <template #default="scope">
                <span :class="getAmountClass(scope.row.type)">
                  {{ formatCurrency(scope.row.amount) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="counterparty" label="交易对方" min-width="120" show-overflow-tooltip></el-table-column>
            <el-table-column prop="description" label="交易描述" min-width="180" show-overflow-tooltip></el-table-column>
            <el-table-column prop="referenceNumber" label="参考号" width="110" show-overflow-tooltip></el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="scope">
                <el-button type="primary" size="small" @click="markAsReconciled(scope.row)">对账</el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <div class="pagination-container" v-if="unreconciledTotal > 0">
            <el-pagination
              v-model:current-page="unreconciledPage"
              v-model:page-size="unreconciledPageSize"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              :total="unreconciledTotal"
              @size-change="searchReconciliation"
              @current-change="searchReconciliation"
            />
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="银行对账单" name="bank_statement">
          <div v-if="importedStatement.length === 0" class="empty-statement">
            <el-empty description="尚未导入银行对账单"></el-empty>
            <el-upload
              class="upload-area"
              action="#"
              :auto-upload="false"
              :on-change="handleFileChange"
              :limit="1"
              :file-list="fileList"
            >
              <template #trigger>
                <el-button type="primary">选择文件</el-button>
              </template>
              <el-button style="margin-left: 10px;" type="success" @click="uploadFile" :loading="uploading">上传</el-button>
              <template #tip>
                <div class="el-upload__tip">支持.xlsx, .csv格式，请选择符合模板的银行对账单文件</div>
              </template>
            </el-upload>
          </div>
          
          <el-table v-else :data="importedStatement" border style="width: 100%">
            <el-table-column type="selection" width="55"></el-table-column>
            <el-table-column prop="transactionDate" label="交易日期" width="120"></el-table-column>
            <el-table-column label="交易类型" width="100">
              <template #default="scope">
                <el-tag 
                  :type="scope.row.type === 'income' ? 'success' : 'danger'"
                >
                  {{ getTransactionTypeText(scope.row.type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="120" align="right">
              <template #default="scope">
                <span :class="[scope.row.type === 'income' ? 'positive-value' : 'negative-value']">
                  {{ formatCurrency(scope.row.amount) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="summary" label="摘要" min-width="200"></el-table-column>
            <el-table-column prop="balance" label="余额" width="120" align="right">
              <template #default="scope">
                {{ formatCurrency(scope.row.balance) }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="scope">
                <el-tag :type="scope.row.status === 'matched' ? 'success' : 'info'">
                  {{ scope.row.status === 'matched' ? '已匹配' : '未匹配' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="180" fixed="right">
              <template #default="scope">
                <el-button 
                  :type="scope.row.status === 'matched' ? 'info' : 'primary'" 
                  size="small" 
                  @click="matchTransaction(scope.row)"
                >
                  {{ scope.row.status === 'matched' ? '查看匹配' : '手动匹配' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        
        <el-tab-pane label="已对账项目" name="reconciled">
          <el-table :data="reconciledItems" border style="width: 100%" v-loading="loading">
            <el-table-column prop="transactionDate" label="交易日期" width="120"></el-table-column>
            <el-table-column label="交易类型" width="100">
              <template #default="scope">
                <el-tag 
                  :type="scope.row.type === 'income' ? 'success' : (scope.row.type === 'expense' ? 'danger' : 'info')"
                >
                  {{ getTransactionTypeText(scope.row.type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="120" align="right">
              <template #default="scope">
                <span :class="[scope.row.type === 'income' ? 'positive-value' : 'negative-value']">
                  {{ formatCurrency(scope.row.amount) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="counterparty" label="交易对方" min-width="150"></el-table-column>
            <el-table-column prop="description" label="交易描述" min-width="200"></el-table-column>
            <el-table-column prop="reconciliationDate" label="对账日期" width="120"></el-table-column>
            <el-table-column label="操作" min-width="180" fixed="right">
              <template #default="scope">
                <el-button type="warning" size="small" @click="cancelReconciliation(scope.row)">取消对账</el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <div class="pagination-container" v-if="reconciledTotal > 0">
            <el-pagination
              v-model:current-page="reconciledPage"
              v-model:page-size="reconciledPageSize"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              :total="reconciledTotal"
              @size-change="searchReconciliation"
              @current-change="searchReconciliation"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
    
    <div v-if="!isReconciling && !loading" class="start-guide">
      <el-empty description="请选择账户和日期范围，然后点击查询开始对账"></el-empty>
    </div>
    
    <!-- 匹配交易对话框 -->
    <el-dialog
      title="匹配交易记录"
      v-model="matchDialogVisible"
      width="800px"
    >
      <div class="match-dialog-content">
        <div class="bank-transaction-info">
          <h4>银行交易信息</h4>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="交易日期">{{ selectedBankTransaction.transactionDate }}</el-descriptions-item>
            <el-descriptions-item label="交易类型">{{ getTransactionTypeText(selectedBankTransaction.type) }}</el-descriptions-item>
            <el-descriptions-item label="金额">{{ formatCurrency(selectedBankTransaction.amount) }}</el-descriptions-item>
            <el-descriptions-item label="摘要">{{ selectedBankTransaction.summary }}</el-descriptions-item>
          </el-descriptions>
        </div>
        
        <div class="matching-transactions">
          <h4>可匹配的账面交易</h4>
          <el-table :data="matchingTransactions" border style="width: 100%" @selection-change="handleSelectionChange">
            <el-table-column type="selection" width="55"></el-table-column>
            <el-table-column prop="transactionDate" label="交易日期" width="120"></el-table-column>
            <el-table-column label="交易类型" width="100">
              <template #default="scope">
                <el-tag 
                  :type="scope.row.type === 'income' ? 'success' : 'danger'"
                >
                  {{ getTransactionTypeText(scope.row.type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="120" align="right">
              <template #default="scope">
                <span :class="[scope.row.type === 'income' ? 'positive-value' : 'negative-value']">
                  {{ formatCurrency(scope.row.amount) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="counterparty" label="交易对方" min-width="150"></el-table-column>
            <el-table-column prop="description" label="交易描述" min-width="200"></el-table-column>
          </el-table>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="matchDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmMatch" :disabled="selectedTransactions.length === 0">确认匹配</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>

import apiAdapter from '@/utils/apiAdapter';

import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Check } from '@element-plus/icons-vue'

import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

// 权限计算属性

// 账户选择
const selectedAccount = ref(null);
const accountOptions = ref([]);
const dateRange = ref(null);

// 对账状态
const isReconciling = ref(false);
const loading = ref(false);
const uploading = ref(false);
const activeTab = ref('unreconciled');

// 分页状态
const unreconciledPage = ref(1);
const unreconciledPageSize = ref(10);
const unreconciledTotal = ref(0);

const reconciledPage = ref(1);
const reconciledPageSize = ref(10);
const reconciledTotal = ref(0);

// 导入对账单
const fileList = ref([]);
const importedStatement = ref([]);

// 对账数据
const unreconciledItems = ref([]);
const reconciledItems = ref([]);
const reconciliationStats = reactive({
  bookBalance: 0,
  bankBalance: 0,
  difference: 0,
  unreconciledItems: 0
});

// 批量选择
const selectedUnreconciled = ref([]);

// 匹配交易
const matchDialogVisible = ref(false);
const selectedBankTransaction = ref({});
const matchingTransactions = ref([]);
const selectedTransactions = ref([]);

// 格式化货币
// formatCurrency 已统一引用公共实现;

// 金额格式化
const formatCurrency = (value) => {
  if (value === null || value === undefined) return '¥0.00';
  const num = parseFloat(value);
  if (isNaN(num)) return '¥0.00';
  return num.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' });
};

// 获取交易类型文本
const getTransactionTypeText = (type) => {
  const typeMap = {
    income: '收入',
    expense: '支出',
    transfer: '转账'
  };
  return typeMap[type] || type;
};

// 获取交易类型标签样式
const getTypeStyle = (type) => {
  if (['存款', '转入', '利息', 'income'].includes(type)) return 'success';
  if (['取款', '转出', '费用', 'expense'].includes(type)) return 'danger';
  return 'info';
};

// 获取金额样式类
const getAmountClass = (type) => {
  if (['存款', '转入', '利息', 'income'].includes(type)) return 'positive-value';
  if (['取款', '转出', '费用', 'expense'].includes(type)) return 'negative-value';
  return '';
};

// 处理未对账项选择
const handleUnreconciledSelect = (selection) => {
  selectedUnreconciled.value = selection;
};

// 批量对账
const batchMarkReconciled = async () => {
  if (selectedUnreconciled.value.length === 0) return;
  
  try {
    await ElMessageBox.confirm(
      `确定要对 ${selectedUnreconciled.value.length} 条交易进行对账吗?`,
      '批量对账',
      { type: 'info' }
    );
    
    loading.value = true;
    const reconciliationDate = new Date().toISOString().split('T')[0];
    
    // 逐条对账
    for (const item of selectedUnreconciled.value) {
      await api.patch(`/finance/bank-transactions/${item.id}/reconcile`, {
        is_reconciled: true,
        reconciliation_date: reconciliationDate
      });
    }
    
    ElMessage.success(`成功对账 ${selectedUnreconciled.value.length} 条交易`);
    selectedUnreconciled.value = [];
    
    // 刷新数据
    searchReconciliation();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量对账失败:', error);
      ElMessage.error('批量对账失败');
    }
  } finally {
    loading.value = false;
  }
};

// 加载账户选项
const loadAccountOptions = async () => {
  try {
    const response = await api.get('/finance/bank-accounts', {
      params: { status: 'active' }
    });
    // 拦截器已解包，response.data 就是业务数据
    accountOptions.value = response.data?.list || [];
  } catch (error) {
    console.error('加载账户列表失败:', error);
    ElMessage.error('加载账户列表失败');
  }
};

// 处理账户变更
const handleAccountChange = () => {
  // 账户变更时重置对账状态
  isReconciling.value = false;
  importedStatement.value = [];
  unreconciledItems.value = [];
  reconciledItems.value = [];
  unreconciledPage.value = 1;
  reconciledPage.value = 1;
};

// 搜索对账
const searchReconciliation = async () => {
  if (!selectedAccount.value || !dateRange.value || dateRange.value.length !== 2) {
    ElMessage.warning('请选择账户和日期范围');
    return;
  }
  
  loading.value = true;
  try {
    const params = {
      accountId: selectedAccount.value,
      startDate: dateRange.value[0],
      endDate: dateRange.value[1]
    };
    
    // 加载未对账项目 - 使用bank-transactions API
    const unreconciledResponse = await api.get('/finance/bank-transactions', { 
      params: { 
        ...params, 
        isReconciled: false,
        page: unreconciledPage.value,
        limit: unreconciledPageSize.value
      }
    });
    const unreconciledData = unreconciledResponse.data?.list || unreconciledResponse.data?.transactions || unreconciledResponse.data || [];
    unreconciledTotal.value = unreconciledResponse.data?.pagination?.total || unreconciledResponse.data?.total || unreconciledData.length || 0;
    unreconciledItems.value = unreconciledData.map(item => ({
      id: item.id,
      transactionDate: item.transaction_date?.split('T')[0] || item.transaction_date,
      type: item.transaction_type,
      amount: parseFloat(item.amount),
      counterparty: item.related_party || '',
      description: item.description || '',
      referenceNumber: item.reference_number || ''
    }));

    // 加载已对账项目
    const reconciledResponse = await api.get('/finance/bank-transactions', { 
      params: { 
        ...params, 
        isReconciled: true,
        page: reconciledPage.value,
        limit: reconciledPageSize.value
      }
    });
    const reconciledData = reconciledResponse.data?.list || reconciledResponse.data?.transactions || reconciledResponse.data || [];
    reconciledTotal.value = reconciledResponse.data?.pagination?.total || reconciledResponse.data?.total || reconciledData.length || 0;
    reconciledItems.value = reconciledData.map(item => ({
      id: item.id,
      transactionDate: item.transaction_date?.split('T')[0] || item.transaction_date,
      type: item.transaction_type,
      amount: parseFloat(item.amount),
      counterparty: item.related_party || '',
      description: item.description || '',
      referenceNumber: item.reference_number || '',
      reconciliationDate: item.reconciliation_date?.split('T')[0] || ''
    }));

    // 计算对账统计 —— 基于真实交易数据动态计算
    const account = accountOptions.value.find(a => a.id === selectedAccount.value);
    // 分别计算未对账和已对账的交易净额（收入为正，支出为负）
    const calcNetAmount = (items) => items.reduce((sum, item) => {
      const amt = parseFloat(item.amount) || 0;
      const isIncome = ['存款', '转入', '利息', 'income'].includes(item.type);
      return sum + (isIncome ? amt : -amt);
    }, 0);

    const unreconciledNet = calcNetAmount(unreconciledItems.value);
    const reconciledNet = calcNetAmount(reconciledItems.value);
    const bookBalance = account?.balance || (unreconciledNet + reconciledNet);

    Object.assign(reconciliationStats, {
      bookBalance,
      bankBalance: bookBalance - unreconciledNet, // 银行余额 = 账面余额 - 未对账净额
      difference: unreconciledNet, // 差异 = 未对账交易净额
      unreconciledItems: unreconciledItems.value.length
    });
    
    isReconciling.value = true;
    activeTab.value = 'unreconciled';
  } catch (error) {
    console.error('加载对账数据失败:', error);
    ElMessage.error('加载对账数据失败');
  } finally {
    loading.value = false;
  }
};

// 开始对账
const startReconciliation = () => {
  if (!selectedAccount.value) {
    ElMessage.warning('请先选择账户');
    return;
  }
  
  // 默认设置日期范围为当前月
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  dateRange.value = [
    firstDay.toISOString().slice(0, 10),
    lastDay.toISOString().slice(0, 10)
  ];
  
  unreconciledPage.value = 1;
  reconciledPage.value = 1;
  
  searchReconciliation();
};

// 导入对账单
const importStatement = () => {
  activeTab.value = 'bank_statement';
};

// 处理文件选择
const handleFileChange = (file) => {
  fileList.value = [file];
};

// 上传文件
const uploadFile = async () => {
  if (fileList.value.length === 0) {
    ElMessage.warning('请选择要上传的文件');
    return;
  }
  
  uploading.value = true;
  try {
    const formData = new FormData();
    formData.append('file', fileList.value[0].raw);
    formData.append('accountId', selectedAccount.value);
    formData.append('startDate', dateRange.value[0]);
    formData.append('endDate', dateRange.value[1]);
    
    const response = await api.post('/finance/cash/reconciliation/import-statement', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    importedStatement.value = response.data || [];
    ElMessage.success('对账单导入成功');
    
    // 更新对账统计
    const statsResponse = await api.get('/finance/cash/reconciliation/stats', {
      params: {
        accountId: selectedAccount.value,
        startDate: dateRange.value[0],
        endDate: dateRange.value[1]
      }
    });
    Object.assign(reconciliationStats, statsResponse.data);
  } catch (error) {
    console.error('导入对账单失败:', error);
    ElMessage.error('导入对账单失败');
  } finally {
    uploading.value = false;
  }
};

// 标记为已对账
const markAsReconciled = async (transaction) => {
  try {
    await api.patch(`/finance/bank-transactions/${transaction.id}/reconcile`, {
      is_reconciled: true,
      reconciliation_date: new Date().toISOString().split('T')[0]
    });
    
    ElMessage.success('已标记为对账');
    
    // 刷新对账数据
    searchReconciliation();
  } catch (error) {
    console.error('标记对账失败:', error);
    ElMessage.error('标记对账失败');
  }
};

// 取消对账
const cancelReconciliation = async (transaction) => {
  try {
    await api.patch(`/finance/bank-transactions/${transaction.id}/reconcile`, {
      is_reconciled: false,
      reconciliation_date: null
    });
    
    ElMessage.success('已取消对账标记');
    
    // 刷新对账数据
    searchReconciliation();
  } catch (error) {
    console.error('取消对账失败:', error);
    ElMessage.error('取消对账失败');
  }
};

// 匹配交易
const matchTransaction = async (bankTransaction) => {
  selectedBankTransaction.value = bankTransaction;
  
  if (bankTransaction.status === 'matched') {
    // 查看已匹配的交易
    try {
      const response = await api.get('/finance/cash/reconciliation/matched-transaction', {
        params: {
          bankTransactionId: bankTransaction.id
        }
      });
      
      matchingTransactions.value = response.data || [];
      selectedTransactions.value = [...matchingTransactions.value];
    } catch (error) {
      console.error('获取匹配交易失败:', error);
      ElMessage.error('获取匹配交易失败');
    }
  } else {
    // 查找可能匹配的交易
    try {
      const response = await api.get('/finance/cash/reconciliation/possible-matches', {
        params: {
          bankTransactionId: bankTransaction.id,
          accountId: selectedAccount.value
        }
      });
      
      matchingTransactions.value = response.data || [];
      selectedTransactions.value = [];
    } catch (error) {
      console.error('获取可能匹配的交易失败:', error);
      ElMessage.error('获取可能匹配的交易失败');
    }
  }
  
  matchDialogVisible.value = true;
};

// 处理选择变更
const handleSelectionChange = (selection) => {
  selectedTransactions.value = selection;
};

// 确认匹配
const confirmMatch = async () => {
  if (selectedTransactions.value.length === 0) {
    ElMessage.warning('请选择要匹配的交易');
    return;
  }
  
  try {
    await api.post('/finance/cash/reconciliation/confirm-match', {
      bankTransactionId: selectedBankTransaction.value.id,
      transactionIds: selectedTransactions.value.map(t => t.id),
      accountId: selectedAccount.value
    });
    
    ElMessage.success('交易匹配成功');
    matchDialogVisible.value = false;
    
    // 刷新对账数据
    searchReconciliation();
  } catch (error) {
    console.error('确认匹配失败:', error);
    ElMessage.error('确认匹配失败');
  }
};

// 页面加载时执行
onMounted(() => {
  loadAccountOptions();
});
</script>

<style scoped>
.reconciliation-container {
  padding: 0;
}

.header-card {
  margin-bottom: 16px;
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

.action-buttons {
  display: flex;
  gap: 10px;
}

.select-account-card {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: bold;
  font-size: 15px;
  color: var(--color-text-primary);
}

.account-selection {
  padding-top: 8px;
}

/* 统计行 */
.statistics-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  text-align: center;
  padding: 16px 12px;
}

.stat-card :deep(.el-card__body) {
  padding: 16px 12px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 8px;
}

.stat-card:nth-child(1) .stat-value { color: var(--color-primary); }
.stat-card:nth-child(2) .stat-value { color: var(--color-success); }
.stat-card:nth-child(3) .stat-value { color: var(--color-warning); }
.stat-card:nth-child(4) .stat-value { color: var(--color-danger); }

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.status-card {
  margin-bottom: 16px;
}

.reconciliation-content {
  margin-top: 0;
}

.reconciliation-tabs {
  margin-bottom: 16px;
  background: #fff;
  padding: 16px;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.start-guide {
  margin: 60px 0;
  text-align: center;
}

.empty-statement {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0;
}

.upload-area {
  margin-top: 20px;
}

.match-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.negative-value {
  color: var(--color-danger);
}

.positive-value {
  color: var(--color-success);
}

/* 对话框高度 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}

/* 工具栏样式 */
.tab-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%);
  border-radius: 6px;
}

.tab-info {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* 表格样式优化 */
:deep(.el-table) {
  margin-top: 0;
}

:deep(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
  font-weight: 600;
}
</style> 