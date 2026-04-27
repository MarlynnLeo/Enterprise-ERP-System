<!--
/**
 * CashTransactions.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="transactions-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>现金交易管理</h2>
          <p class="subtitle">管理现金收支记录</p>
        </div>
        <div class="action-buttons">
          <el-button v-permission="'finance:cashtransactions:create'" type="primary" :icon="Plus" @click="showAddDialog">新增交易</el-button>
          <el-button v-permission="'finance:cashtransactions:export'" type="success" @click="exportTransactions">导出数据</el-button>
          <el-button v-permission="'finance:cashtransactions:import'" type="warning" @click="showImportDialog">导入数据</el-button>
          <el-button v-permission="'finance:cashtransactions:print'" type="primary" plain @click="printCashStatement">打印</el-button>
        </div>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="交易日期">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="交易类型">
          <el-select v-model="searchForm.type" placeholder="选择类型" clearable>
            <el-option label="收入" value="income"></el-option>
            <el-option label="支出" value="expense"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="交易分类">
          <el-select v-model="searchForm.category" placeholder="选择分类" clearable>
            <el-option label="销售收入" value="sales"></el-option>
            <el-option label="其他收入" value="other_income"></el-option>
            <el-option label="办公费用" value="office"></el-option>
            <el-option label="差旅费" value="travel"></el-option>
            <el-option label="餐饮费" value="meal"></el-option>
            <el-option label="其他支出" value="other_expense"></el-option>
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="loadTransactions">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计卡片 - 使用全局样式，与bank-transactions一致 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(transactionStats.totalIncome) }}</div>
        <div class="stat-label">总收入</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(transactionStats.totalExpense) }}</div>
        <div class="stat-label">总支出</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(transactionStats.netAmount) }}</div>
        <div class="stat-label">净额</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ transactionStats.totalCount }}</div>
        <div class="stat-label">交易笔数</div>
      </el-card>
    </div>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="transactionList" 
        v-loading="loading"
        stripe
        border
        style="width: 100%"
        :default-sort="{ prop: 'transactionDate', order: 'descending' }"
      >
        <el-table-column prop="transactionDate" label="交易日期" width="120" sortable>
          <template #default="scope">
            {{ formatDate(scope.row.transactionDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="transactionNumber" label="交易号" width="200" />
        <el-table-column prop="type" label="类型" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.type === 'income' ? 'success' : 'danger'">
              {{ getTransactionTypeText(scope.row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="120">
          <template #default="scope">
            {{ getCategoryText(scope.row.category) }}
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="120" sortable>
          <template #default="scope">
            <span :class="scope.row.type === 'income' ? 'amount-income' : 'amount-expense'">
              {{ formatCurrency(scope.row.amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="counterparty" label="交易对方" width="150" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="referenceNumber" label="凭证号" width="120" />
        <el-table-column label="审核状态" width="100" align="center">
          <template #default="scope">
            <el-tag :type="getAuditStatusType(scope.row.status)" size="small">
              {{ getAuditStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="240" fixed="right">
          <template #default="scope">
            <div class="operation-buttons">
              <!-- 查看按钮：始终显示 -->
              <el-button
                type="primary"
                size="small"
                @click="handleView(scope.row)"
              >查看</el-button>

              <!-- 编辑按钮：仅草稿状态显示 -->
              <el-button 
                v-if="scope.row.status === 'draft' || !scope.row.status"
                type="warning"
                size="small"
                @click="editTransaction(scope.row)"
              >编辑</el-button>

              <!-- 提交按钮：仅草稿状态显示 -->
              <el-button
                v-if="scope.row.status === 'draft' || !scope.row.status"
                type="success"
                size="small"
                @click="submitForAudit(scope.row)"
              >提交</el-button>

              <!-- 审核按钮：待审核或已复核状态显示 -->
              <el-button 
                v-if="scope.row.status === 'pending' || scope.row.status === 'reviewed'"
                type="info"
                size="small"
                @click="handleAudit(scope.row)"
              >审核</el-button>

              <!-- 删除按钮：仅草稿状态显示 -->
              <el-popconfirm
                v-if="scope.row.status === 'draft' || !scope.row.status"
                title="确定要删除该交易记录吗？此操作不可恢复！"
                @confirm="deleteTransaction(scope.row)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button v-permission="'finance:cashtransactions:delete'" type="danger" size="small">删除</el-button>
                </template>
              </el-popconfirm>
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
          :total="Math.max(total, 1)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
    >
      <el-form
        ref="transactionFormRef"
        :model="transactionForm"
        :rules="transactionRules"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="交易类型" prop="type">
              <el-select v-model="transactionForm.type" placeholder="请选择">
                <el-option v-for="item in $dict.getOptions('cash_transaction_category')" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="交易日期" prop="transactionDate">
              <el-date-picker
                v-model="transactionForm.transactionDate"
                type="date"
                placeholder="选择日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="金额" prop="amount">
              <el-input-number
                v-model="transactionForm.amount"
                :min="0"
                :precision="2"
                placeholder="请输入金额"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="分类" prop="category">
              <el-select v-model="transactionForm.category" placeholder="请选择">
                <template v-if="transactionForm.type === 'income'">
                  <el-option label="销售收入" value="sales" />
                  <el-option label="其他收入" value="other_income" />
                </template>
                <template v-else>
                  <el-option label="办公费用" value="office" />
                  <el-option label="差旅费" value="travel" />
                  <el-option label="餐饮费" value="meal" />
                  <el-option label="其他支出" value="other_expense" />
                </template>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="交易对方" prop="counterparty">
          <el-input v-model="transactionForm.counterparty" placeholder="请输入交易对方" />
        </el-form-item>

        <el-form-item label="描述" prop="description">
          <el-input
            v-model="transactionForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入交易描述"
          />
        </el-form-item>

        <el-form-item label="凭证号" prop="referenceNumber">
          <el-input v-model="transactionForm.referenceNumber" placeholder="请输入凭证号" />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveTransaction" :loading="saveLoading">
            确定
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 导入对话框 -->
    <el-dialog
      v-model="importDialogVisible"
      title="导入现金交易数据"
      width="500px"
    >
      <el-upload
        ref="uploadRef"
        class="upload-demo"
        drag
        action="#"
        :auto-upload="false"
        :file-list="importFileList"
        :on-change="handleFileChange"
        :before-remove="handleFileRemove"
        accept=".xlsx,.xls,.csv"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">
          将文件拖到此处，或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            只能上传 xlsx/xls/csv 文件，且不超过 10MB
          </div>
        </template>
      </el-upload>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="importDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="importTransactions" :loading="importLoading">
            导入
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看交易详情对话框 -->
    <el-dialog
      title="交易详情"
      v-model="viewDialogVisible"
      width="600px"
    >
      <div class="transaction-detail-header">
        <div class="detail-item">
          <span class="label">交易日期：</span>
          <span class="value">{{ formatDate(currentTransaction.transactionDate) }}</span>
        </div>
        <div class="detail-item">
          <span class="label">交易号：</span>
          <span class="value">{{ currentTransaction.transactionNumber || '-' }}</span>
        </div>
        <div class="detail-item">
          <span class="label">交易类型：</span>
          <el-tag :type="currentTransaction.type === 'income' ? 'success' : 'danger'" size="small">
            {{ getTransactionTypeText(currentTransaction.type) }}
          </el-tag>
        </div>
        <div class="detail-item">
          <span class="label">审核状态：</span>
          <el-tag :type="getAuditStatusType(currentTransaction.status)" size="small">
            {{ getAuditStatusText(currentTransaction.status) }}
          </el-tag>
        </div>
      </div>
      
      <el-descriptions :column="2" border style="margin-top: 20px;">
        <el-descriptions-item label="交易金额">
          <span :class="currentTransaction.type === 'income' ? 'amount-income' : 'amount-expense'">
            {{ formatCurrency(currentTransaction.amount) }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="交易对方">{{ currentTransaction.counterparty || '-' }}</el-descriptions-item>
        <el-descriptions-item label="交易分类">{{ getCategoryText(currentTransaction.category) }}</el-descriptions-item>
        <el-descriptions-item label="凭证号">{{ currentTransaction.referenceNumber || '-' }}</el-descriptions-item>
        <el-descriptions-item label="交易描述" :span="2">{{ currentTransaction.description || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import apiAdapter from '@/utils/apiAdapter';
import { formatDate } from '@/utils/helpers/dateUtils'
import { formatCurrency } from '@/utils/format'

import { ref, reactive, computed, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { UploadFilled, Plus } from '@element-plus/icons-vue'
import { api } from '@/services/api';

// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);

// 分页相关
const total = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);

// 对话框状态
const dialogVisible = ref(false);
const dialogTitle = ref('新增交易');
const importDialogVisible = ref(false);
const viewDialogVisible = ref(false);
const currentTransaction = ref({});

// 表单相关
const transactionFormRef = ref(null);
const uploadRef = ref(null);

// 导入相关
const importLoading = ref(false);
const importFileList = ref([]);
const importResult = ref(null);

// 数据列表
const transactionList = ref([]);

// 交易统计
const transactionStats = reactive({
  totalCount: 0,
  totalIncome: 0,
  totalExpense: 0,
  netAmount: 0
});

// 搜索表单
const searchForm = reactive({
  dateRange: null,
  type: '',
  category: ''
});

// 交易表单
const transactionForm = reactive({
  id: null,
  type: 'income',
  transactionDate: new Date().toISOString().slice(0, 10),
  amount: 0,
  category: '',
  counterparty: '',
  description: '',
  referenceNumber: '',
  transactionNumber: ''
});

// 表单验证规则
const transactionRules = {
  type: [
    { required: true, message: '请选择交易类型', trigger: 'change' }
  ],
  transactionDate: [
    { required: true, message: '请选择交易日期', trigger: 'change' }
  ],
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    { type: 'number', min: 0.01, message: '金额必须大于0', trigger: 'blur' }
  ],
  category: [
    { required: true, message: '请选择分类', trigger: 'change' }
  ],
  description: [
    { required: true, message: '请输入交易描述', trigger: 'blur' }
  ]
};

// 监听交易类型变化，重置分类
watch(() => transactionForm.type, (newType) => {
  transactionForm.category = '';
});

// 格式化货币
// formatCurrency 已统一引用公共实现;

// 格式化日期
// formatDate 已统一引用公共实现;

// 获取交易类型文本
const getTransactionTypeText = (type) => {
  const typeMap = {
    income: '收入',
    expense: '支出'
  };
  return typeMap[type] || type;
};

// 获取分类文本
const getCategoryText = (category) => {
  const categoryMap = {
    sales: '销售收入',
    other_income: '其他收入',
    office: '办公费用',
    travel: '差旅费',
    meal: '餐饮费',
    other_expense: '其他支出'
  };
  return categoryMap[category] || category;
};

// 获取审核状态类型（用于标签颜色）
const getAuditStatusType = (status) => {
  const statusMap = {
    draft: 'info',
    pending: 'warning',
    reviewed: 'primary',
    approved: 'success',
    rejected: 'danger'
  };
  return statusMap[status] || 'info';
};

// 获取审核状态文本
const getAuditStatusText = (status) => {
  const statusMap = {
    draft: '草稿',
    pending: '待审核',
    reviewed: '已复核',
    approved: '已审核',
    rejected: '已驳回'
  };
  return statusMap[status] || '草稿';
};

// 重置搜索
const resetSearch = () => {
  searchForm.dateRange = null;
  searchForm.type = '';
  searchForm.category = '';
  loadTransactions();
};

// 显示新增对话框
const showAddDialog = () => {
  dialogTitle.value = '新增现金交易';
  resetTransactionForm();
  dialogVisible.value = true;
};

// 重置表单
const resetTransactionForm = () => {
  transactionForm.id = null;
  transactionForm.type = 'income';
  transactionForm.transactionDate = new Date().toISOString().slice(0, 10);
  transactionForm.amount = 0;
  transactionForm.category = '';
  transactionForm.counterparty = '';
  transactionForm.description = '';
  transactionForm.referenceNumber = '';
  transactionForm.transactionNumber = '';
};

// 编辑交易
const editTransaction = (row) => {
  dialogTitle.value = '编辑现金交易';
  Object.assign(transactionForm, {
    ...row,
    amount: parseFloat(row.amount) || 0  // 确保 amount 是数字类型
  });
  dialogVisible.value = true;
};

// 查看交易详情
const handleView = (row) => {
  currentTransaction.value = { ...row };
  viewDialogVisible.value = true;
};

// 提交审核
const submitForAudit = async (row) => {
  try {
    await ElMessageBox.confirm(
      '确定要提交该交易进行审核吗？',
      '提交审核',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );
    
    await api.put(`/finance/cash-transactions/${row.id}/submit`);
    ElMessage.success('已提交审核');
    loadTransactions();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('提交审核失败:', error);
      ElMessage.error('提交失败: ' + (error.response?.data?.message || error.message));
    }
  }
};

// 审核操作（与银行交易一致，使用 prompt 弹窗输入审核意见）
const handleAudit = (row) => {
  ElMessageBox.prompt('请输入审核意见(选填)', '审核', {
    confirmButtonText: '通过',
    cancelButtonText: '驳回',
    distinguishCancelAndClose: true,
    inputPlaceholder: '审核意见',
    beforeClose: async (action, instance, done) => {
      if (action === 'close') {
        done();
        return;
      }
      
      const remark = instance.inputValue;
      const isApprove = action === 'confirm';
      
      try {
        instance.confirmButtonLoading = true;
        instance.cancelButtonLoading = true;
        
        if (isApprove) {
          await api.put(`/finance/cash-transactions/${row.id}/approve`, { remark });
          ElMessage.success('审核通过');
        } else {
          await api.put(`/finance/cash-transactions/${row.id}/reject`, { remark });
          ElMessage.warning('已驳回');
        }
        
        loadTransactions();
        done();
      } catch (error) {
        console.error('审核失败:', error);
        ElMessage.error('审核操作失败: ' + (error.response?.data?.message || error.message));
      } finally {
        instance.confirmButtonLoading = false;
        instance.cancelButtonLoading = false;
      }
    }
  }).catch(() => {
    // 关闭弹窗，不做操作
  });
};

// 保存交易
const saveTransaction = async () => {
  if (!transactionFormRef.value) return;
  
  try {
    await transactionFormRef.value.validate();
    saveLoading.value = true;
    
    const data = { ...transactionForm };
    
    if (data.id) {
      await api.put(`/finance/cash-transactions/${data.id}`, data);
      ElMessage.success('交易更新成功');
    } else {
      await api.post('/finance/cash-transactions', data);
      ElMessage.success('交易创建成功');
    }
    
    dialogVisible.value = false;
    loadTransactions();
  } catch (error) {
    console.error('保存交易失败:', error);
    ElMessage.error(`保存失败: ${error.response?.data?.message || error.message}`);
  } finally {
    saveLoading.value = false;
  }
};

// 删除交易
const deleteTransaction = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除交易 "${row.description}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    
    await api.delete(`/finance/cash-transactions/${row.id}`);
    ElMessage.success('交易删除成功');
    loadTransactions();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除交易失败:', error);
      ElMessage.error(`删除失败: ${error.response?.data?.message || error.message}`);
    }
  }
};

// 加载交易列表
const loadTransactions = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      ...searchForm
    };
    
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }
    
    const response = await api.get('/finance/cash-transactions', { params });
    // axios拦截器已自动解包ResponseHandler格式
    transactionList.value = response.data.transactions || [];
    total.value = parseInt(response.data.total) || 0;
    
    // 加载统计数据
    await loadTransactionsStats();
  } catch (error) {
    console.error('加载交易列表失败:', error);
    ElMessage.error('加载交易列表失败');
  } finally {
    loading.value = false;
  }
};

// 加载统计数据
const loadTransactionsStats = async () => {
  try {
    const params = { ...searchForm };
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }
    
    const response = await api.get('/finance/cash-transactions/stats', { params });
    // axios拦截器已自动解包ResponseHandler格式
    Object.assign(transactionStats, response.data);
  } catch (error) {
    console.error('加载统计数据失败:', error);
  }
};

// 导出交易
const exportTransactions = async () => {
  try {
    const params = { ...searchForm };
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }
    
    const response = await api.get('/finance/cash-transactions/export', { 
      params,
      responseType: 'blob'
    });
    
    const blob = new Blob([response.data], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `现金交易记录_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
    
    ElMessage.success('导出成功');
  } catch (error) {
    console.error('导出失败:', error);
    ElMessage.error('导出失败');
  }
};

// 显示导入对话框
const showImportDialog = () => {
  importFileList.value = [];
  importDialogVisible.value = true;
};

// 处理文件变化
const handleFileChange = (file, fileList) => {
  importFileList.value = fileList;
};

// 处理文件移除
const handleFileRemove = (file, fileList) => {
  importFileList.value = fileList;
  return true;
};

// 导入交易
const importTransactions = async () => {
  if (importFileList.value.length === 0) {
    ElMessage.warning('请选择要导入的文件');
    return;
  }
  
  try {
    importLoading.value = true;
    const formData = new FormData();
    formData.append('file', importFileList.value[0].raw);
    
    const response = await api.post('/finance/cash-transactions/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    // axios拦截器已自动解包ResponseHandler格式
    ElMessage.success(`导入成功，共导入 ${response.data.count || 0} 条记录`);
    importDialogVisible.value = false;
    loadTransactions();
  } catch (error) {
    console.error('导入失败:', error);
    ElMessage.error(`导入失败: ${error.response?.data?.message || error.message}`);
  } finally {
    importLoading.value = false;
  }
};

// 打印现金日记账
const printCashStatement = async () => {
  try {

    // 获取当前筛选条件下的所有交易数据
    const params = {
      page: 1,
      pageSize: 1000 // 获取大量数据用于打印
    };

    // 只有当筛选条件不为空时才添加到参数中
    if (searchForm.type) {
      params.type = searchForm.type;
    }
    if (searchForm.category) {
      params.category = searchForm.category;
    }
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }

    const response = await api.get('/finance/cash-transactions', { params });
    // axios拦截器已自动解包ResponseHandler格式
    const printData = response.data.transactions || [];

    if (printData.length === 0) {
      ElMessage.warning('没有找到符合条件的交易数据，请检查筛选条件');
      return;
    }

    ElMessage.success(`准备打印 ${printData.length} 条交易记录`);

    // 尝试获取打印模板
    try {
      const templateResponse = await api.get('/print/templates/public/default', {
        params: {
          module: 'finance',
          template_type: 'cash_statement'
        }
      });

      // 拦截器已解包，response.data 就是业务数据
      if (templateResponse.data) {
        const template = templateResponse.data;

        // 使用模板进行打印
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          ElMessage.error('无法打开打印窗口，请检查浏览器是否阻止弹出窗口');
          return;
        }

        // 替换模板中的变量
        let printContent = template.content;

        // 替换基本信息
        printContent = printContent.replace(/{{companyName}}/g, '浙江开控电气有限公司');
        printContent = printContent.replace(/{{printDate}}/g, new Date().toLocaleDateString('zh-CN'));

        // 生成交易记录表格
        let tableRows = '';
        let runningBalance = 0;

        // 按日期排序
        const sortedData = printData.sort((a, b) => new Date(a.transactionDate) - new Date(b.transactionDate));

        sortedData.forEach((item) => {
          const amount = parseFloat(item.amount);
          const isIncome = item.type === 'income';

          if (isIncome) {
            runningBalance += amount;
          } else {
            runningBalance -= amount;
          }

          tableRows += `
            <tr>
              <td style="border: 1px solid #000; padding: 4px; text-align: center;">${item.transactionDate}</td>
              <td style="border: 1px solid #000; padding: 4px; text-align: center;">${item.referenceNumber || ''}</td>
              <td style="border: 1px solid #000; padding: 4px; text-align: center;">${item.counterparty || ''}</td>
              <td style="border: 1px solid #000; padding: 4px;">${item.description || ''}</td>
              <td style="border: 1px solid #000; padding: 4px; text-align: right;">${isIncome ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '-'}</td>
              <td style="border: 1px solid #000; padding: 4px; text-align: right;">${!isIncome ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '-'}</td>
              <td style="border: 1px solid #000; padding: 4px; text-align: right;">${runningBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</td>
            </tr>
          `;
        });

        printContent = printContent.replace(/{{transactionRows}}/g, tableRows);

        // 计算合计
        const totalIncome = sortedData.filter(item => item.type === 'income').reduce((sum, item) => sum + parseFloat(item.amount), 0);
        const totalExpense = sortedData.filter(item => item.type === 'expense').reduce((sum, item) => sum + parseFloat(item.amount), 0);

        printContent = printContent.replace(/{{totalIncome}}/g, totalIncome.toLocaleString('zh-CN', { minimumFractionDigits: 2 }));
        printContent = printContent.replace(/{{totalExpense}}/g, totalExpense.toLocaleString('zh-CN', { minimumFractionDigits: 2 }));
        printContent = printContent.replace(/{{finalBalance}}/g, runningBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2 }));

        printWindow.document.write(printContent);
        printWindow.document.close();

        // 等待内容加载完成后打印
        printWindow.onload = function() {
          setTimeout(() => {
            printWindow.print();
          }, 500);
        };

      } else {
        // 没有找到模板
        ElMessage.error('未找到现金日记账打印模板，请联系管理员配置模板');
        return;
      }

    } catch (templateError) {
      console.error('获取打印模板失败:', templateError);
      ElMessage.error('获取打印模板失败，请联系管理员检查模板配置');
      return;
    }

  } catch (error) {
    console.error('打印失败:', error);
    ElMessage.error('打印失败: ' + (error.message || '未知错误'));
  }
};

// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = size;
  loadTransactions();
};

const handleCurrentChange = (page) => {
  currentPage.value = page;
  loadTransactions();
};

// 组件挂载时加载数据
onMounted(() => {
  loadTransactions();
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

.action-buttons {
  display: flex;
  gap: 10px;
}

/* 使用全局common-styles.css中的.statistics-row和.stat-card样式 */
/* 统计卡片现在与bank-transactions完全一致，无图标，纵向居中布局 */

.table-section {
  background: var(--color-bg-base);
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.amount-income {
  color: var(--color-success);
  font-weight: var(--font-weight-bold);
}

.amount-expense {
  color: var(--color-danger);
  font-weight: var(--font-weight-bold);
}

.dialog-footer {
  text-align: right;
}

.upload-demo {
  text-align: center;
}

/* 操作按钮 */
.operation-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* 查看详情对话框样式 */
.transaction-detail-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 16px;
  background: var(--color-bg-hover);
  border-radius: 8px;
}

.transaction-detail-header .detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.transaction-detail-header .label {
  color: var(--color-text-secondary);
  font-size: 14px;
}

.transaction-detail-header .value {
  color: var(--color-text-primary);
  font-weight: 500;
}
</style>
