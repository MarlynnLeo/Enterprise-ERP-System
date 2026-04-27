<!--
/**
 * Transactions.vue
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
          <h2>银行交易管理</h2>
          <p class="subtitle">管理银行收支记录</p>
        </div>
        <div class="action-buttons">
          <el-button v-permission="'finance:transactions:create'" type="primary" :icon="Plus" @click="showAddDialog">新增交易</el-button>
          <el-button v-permission="'finance:transactions:export'" type="success" @click="exportTransactions">导出数据</el-button>
          <el-button v-permission="'finance:transactions:import'" type="warning" @click="showImportDialog">导入数据</el-button>
          <el-button v-permission="'finance:transactions:print'" type="primary" plain @click="printBankStatement">打印</el-button>
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
            <el-option
              v-for="type in bankConfig.transactionTypes"
              :key="type.value"
              :label="type.label"
              :value="type.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="交易账户">
          <el-select v-model="searchForm.accountId" placeholder="选择账户" clearable>
            <el-option
              v-for="item in accountOptions"
              :key="item.id"
              :label="item.accountName"
              :value="item.id"
            ></el-option>
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="searchTransactions" :loading="loading">查询</el-button>
          <el-button @click="resetSearch" :loading="loading">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 交易统计信息 -->
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
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(transactionStats.avgAmount) }}</div>
        <div class="stat-label">平均金额</div>
      </el-card>
    </div>
    
    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="transactionList"
        style="width: 100%"
        border
        v-loading="loading"
        show-overflow-tooltip
      >
        <template #empty>
          <el-empty description="暂无交易数据" />
        </template>
        <el-table-column prop="transactionDate" label="交易日期" width="110">
          <template #default="scope">
            {{ formatDate(scope.row.transactionDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="accountName" label="交易账户" min-width="120"></el-table-column>
        <el-table-column label="交易类型" width="90">
          <template #default="scope">
            <el-tag 
              :type="scope.row.type === 'income' ? 'success' : (scope.row.type === 'expense' ? 'danger' : 'info')"
              size="small"
            >
              {{ getTransactionTypeText(scope.row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="交易金额" width="120" align="right">
          <template #default="scope">
            <span :class="[scope.row.type === 'income' ? 'positive-value' : (scope.row.type === 'expense' ? 'negative-value' : '')]">
              {{ formatCurrency(scope.row.amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="related_party" label="交易对方" min-width="150"></el-table-column>
        <el-table-column label="关联发票" min-width="120">
          <template #default="scope">
            <el-link 
              v-if="scope.row.related_invoice_id"
              type="primary" 
              @click="jumpToInvoice(scope.row)"
              underline="never"
            >
              {{ scope.row.related_invoice_number || scope.row.reference_number || '查看发票' }}
            </el-link>
            <span v-else class="text-gray">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="交易描述" min-width="200"></el-table-column>
        <el-table-column label="交易分类" width="90">
          <template #default="scope">
            {{ getCategoryDisplayText(scope.row.category || 'sales') }}
          </template>
        </el-table-column>
        <el-table-column label="支付方式" width="90">
          <template #default="scope">
            {{ getPaymentMethodDisplayText(scope.row.paymentMethod) }}
          </template>
        </el-table-column>
        <el-table-column label="对账状态" width="100" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.isReconciled ? 'success' : 'info'" size="small">
              {{ scope.row.isReconciled ? '已对账' : '未对账' }}
            </el-tag>
          </template>
        </el-table-column>
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
                @click="handleEdit(scope.row)"
              >编辑</el-button>

              <!-- 提交按钮：仅草稿状态且未对账显示 -->
              <el-button
                v-if="(scope.row.status === 'draft' || !scope.row.status) && !scope.row.isReconciled"
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

              <!-- 删除按钮：仅草稿状态且未对账显示 -->
              <el-popconfirm
                v-if="(scope.row.status === 'draft' || !scope.row.status) && !scope.row.isReconciled"
                title="确定要删除该交易记录吗？此操作不可恢复！"
                @confirm="handleDelete(scope.row)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button v-permission="'finance:transactions:delete'" type="danger" size="small">删除</el-button>
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
    
    <!-- 添加/编辑交易对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="600px"
    >
      <el-form :model="transactionForm" :rules="transactionRules" ref="transactionFormRef" label-width="100px">
        <el-form-item label="交易类型" prop="type">
          <el-radio-group v-model="transactionForm.type" @change="handleTypeChange">
            <el-radio 
              v-for="type in bankConfig.transactionTypes"
              :key="type.value"
              :value="type.value"
            >{{ type.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item label="交易日期" prop="transactionDate">
          <el-date-picker
            v-model="transactionForm.transactionDate"
            type="date"
            placeholder="选择交易日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          ></el-date-picker>
        </el-form-item>
        
        <el-form-item :label="transactionForm.type === 'transfer' ? '源账户' : '交易账户'" prop="accountId">
          <el-select v-model="transactionForm.accountId" placeholder="请选择账户" style="width: 100%">
            <el-option
              v-for="item in accountOptions"
              :key="item.id"
              :label="item.accountName"
              :value="item.id"
            ></el-option>
          </el-select>
        </el-form-item>
        
        <el-form-item v-if="transactionForm.type === 'transfer'" label="目标账户" prop="targetAccountId">
          <el-select v-model="transactionForm.targetAccountId" placeholder="请选择目标账户" style="width: 100%">
            <el-option
              v-for="item in accountOptions.filter(acc => acc.id !== transactionForm.accountId)"
              :key="item.id"
              :label="item.accountName"
              :value="item.id"
            ></el-option>
          </el-select>
        </el-form-item>
        
        <el-form-item label="交易金额" prop="amount">
          <el-input-number 
            v-model="transactionForm.amount" 
            :precision="2" 
            :step="100"
            style="width: 100%"
          ></el-input-number>
        </el-form-item>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="交易分类" prop="category">
              <el-select v-model="transactionForm.category" placeholder="请选择分类" style="width: 100%">
                <el-option-group v-if="transactionForm.type === 'income'" label="收入类别">
                  <el-option 
                    v-for="cat in bankConfig.transactionCategories?.income || []" 
                    :key="cat.value" 
                    :label="cat.label" 
                    :value="cat.value"
                  />
                </el-option-group>
                <el-option-group v-if="transactionForm.type === 'expense'" label="支出类别">
                  <el-option 
                    v-for="cat in bankConfig.transactionCategories?.expense || []" 
                    :key="cat.value" 
                    :label="cat.label" 
                    :value="cat.value"
                  />
                </el-option-group>
                <el-option-group v-if="transactionForm.type === 'transfer'" label="转账类别">
                  <el-option 
                    v-for="cat in bankConfig.transactionCategories?.transfer || []" 
                    :key="cat.value" 
                    :label="cat.label" 
                    :value="cat.value"
                  />
                </el-option-group>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="支付方式" prop="paymentMethod">
              <el-select v-model="transactionForm.paymentMethod" placeholder="请选择支付方式" style="width: 100%">
                <el-option
                  v-for="method in bankConfig.paymentMethods"
                  :key="method.value"
                  :label="method.label"
                  :value="method.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item label="交易对方" prop="counterparty">
          <el-input v-model="transactionForm.counterparty" placeholder="请输入交易对方名称"></el-input>
        </el-form-item>
        
        <el-form-item label="交易描述" prop="description">
          <el-input
            v-model="transactionForm.description"
            type="textarea"
            :rows="2"
            placeholder="请输入交易描述"
          ></el-input>
        </el-form-item>
        
        <el-form-item label="参考号" prop="referenceNumber">
          <el-input v-model="transactionForm.referenceNumber" placeholder="请输入参考号/单据号"></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveTransaction" :loading="saveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 导入数据对话框 -->
    <el-dialog
      title="导入交易数据"
      v-model="importDialogVisible"
      width="600px"
    >
      <div class="import-content">
        <el-alert
          title="导入说明"
          type="info"
          :closable="false"
          show-icon
        >
          <template #default>
            <p>1. 请先下载模板文件，按照模板格式填写数据</p>
            <p>2. 支持Excel(.xlsx)和CSV(.csv)格式文件</p>
            <p>3. 文件大小不超过10MB</p>
            <p>4. 必填字段：交易日期、账户名称、交易类型、交易金额</p>
          </template>
        </el-alert>

        <div class="upload-area" style="margin-top: 20px;">
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
            :limit="1"
            :file-list="importFileList"
            accept=".xlsx,.xls,.csv"
            drag
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">
              将文件拖到此处，或<em>点击上传</em>
            </div>
            <template #tip>
              <div class="el-upload__tip">
                只能上传xlsx/xls/csv文件，且不超过10MB
              </div>
            </template>
          </el-upload>
        </div>

        <div v-if="importResult" class="import-result" style="margin-top: 20px;">
          <el-alert
            :title="importResult.message"
            :type="importResult.success ? 'success' : 'error'"
            :closable="false"
            show-icon
          >
            <template #default>
              <div v-if="importResult.data">
                <p>总记录数: {{ importResult.data.summary?.totalRecords || 0 }}</p>
                <p>成功导入: {{ importResult.data.summary?.successCount || 0 }}</p>
                <p>失败记录: {{ importResult.data.summary?.errorCount || 0 }}</p>
                <div v-if="importResult.data.errors && importResult.data.errors.length > 0">
                  <p style="margin-top: 10px; font-weight: bold;">错误详情:</p>
                  <ul style="margin: 5px 0; padding-left: 20px;">
                    <li v-for="error in importResult.data.errors" :key="error">{{ error }}</li>
                  </ul>
                </div>
              </div>
            </template>
          </el-alert>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button type="info" @click="downloadTemplate">下载模板</el-button>
          <el-button @click="importDialogVisible = false">取消</el-button>
          <el-button
            type="success"
            @click="handleImport"
            :loading="importLoading"
            :disabled="importFileList.length === 0"
          >
            开始导入
          </el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 查看交易详情对话框 -->
    <el-dialog
      title="交易详情"
      v-model="viewDialogVisible"
      width="700px"
    >
      <div class="transaction-detail-header">
        <div class="detail-item">
          <span class="label">交易日期：</span>
          <span class="value">{{ formatDate(currentTransaction.transactionDate) }}</span>
        </div>
        <div class="detail-item">
          <span class="label">交易账户：</span>
          <span class="value">{{ currentTransaction.accountName || '-' }}</span>
        </div>
        <div class="detail-item">
          <span class="label">交易类型：</span>
          <el-tag :type="currentTransaction.type === 'income' ? 'success' : (currentTransaction.type === 'expense' ? 'danger' : 'info')" size="small">
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
          <span :class="currentTransaction.type === 'income' ? 'positive-value' : (currentTransaction.type === 'expense' ? 'negative-value' : '')">
            {{ formatCurrency(currentTransaction.amount) }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="交易对方">{{ currentTransaction.related_party || currentTransaction.counterparty || '-' }}</el-descriptions-item>
        <el-descriptions-item label="交易分类">{{ getCategoryDisplayText(currentTransaction.category) }}</el-descriptions-item>
        <el-descriptions-item label="支付方式">{{ getPaymentMethodDisplayText(currentTransaction.paymentMethod) }}</el-descriptions-item>
        <el-descriptions-item label="参考号">{{ currentTransaction.referenceNumber || '-' }}</el-descriptions-item>
        <el-descriptions-item label="关联发票">{{ currentTransaction.related_invoice_number || '-' }}</el-descriptions-item>
        <el-descriptions-item label="对账状态">
          <el-tag :type="currentTransaction.isReconciled ? 'success' : 'info'" size="small">
            {{ currentTransaction.isReconciled ? '已对账' : '未对账' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="交易描述" :span="2">{{ currentTransaction.description || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>

import apiAdapter from '@/utils/apiAdapter';
import { parsePaginatedData, parseListData, parseDataObject } from '@/utils/responseParser';

import { ref, reactive, computed, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue'

import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { useFinanceStore } from '@/stores/finance';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';

// 权限store
const authStore = useAuthStore()
const financeStore = useFinanceStore()
const { bankConfig } = storeToRefs(financeStore)

// 权限计算属性
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
const accountOptions = ref([]);

// 交易统计
const transactionStats = reactive({
  totalCount: 0,
  totalIncome: 0,
  totalExpense: 0,
  netAmount: 0,
  avgAmount: 0
});

// 搜索表单
const searchForm = reactive({
  dateRange: null,
  type: '',
  accountId: ''
});

// 交易表单
const transactionForm = reactive({
  id: null,
  type: 'income',
  transactionDate: new Date().toISOString().slice(0, 10),
  accountId: null,
  targetAccountId: null,
  amount: 0,
  category: '',
  paymentMethod: 'bank_transfer',
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
  accountId: [
    { required: true, message: '请选择账户', trigger: 'change' }
  ],
  targetAccountId: [
    { required: true, message: '请选择目标账户', trigger: 'change' }
  ],
  amount: [
    { required: true, message: '请输入交易金额', trigger: 'blur' },
    { type: 'number', min: 0.01, message: '金额必须大于0', trigger: 'blur' }
  ],
  category: [
    { required: true, message: '请选择交易分类', trigger: 'change' }
  ],
  paymentMethod: [
    { required: true, message: '请选择支付方式', trigger: 'change' }
  ],
  counterparty: [
    { required: true, message: '请输入交易对方', trigger: 'blur' }
  ]
};

// 监听交易类型变化，重置相关字段
watch(() => transactionForm.type, (newType) => {
  transactionForm.category = '';
  if (newType === 'transfer') {
    transactionForm.targetAccountId = null;
  } else {
    transactionForm.targetAccountId = undefined;
  }
});

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

// 获取分类显示文本
const getCategoryDisplayText = (category) => {
  const categoryMap = {
    'sales_income': '销售收入',
    'investment_income': '投资收益',
    'interest_income': '利息收入',
    'other_income': '其他收入',
    'purchase_expense': '采购支出',
    'salary_expense': '工资支出',
    'rent_expense': '租金支出',
    'utility_expense': '水电费',
    'office_expense': '办公费用',
    'other_expense': '其他支出',
    'internal_transfer': '内部转账',
    'fund_allocation': '资金调拨'
  };
  return categoryMap[category] || category || '';
};

// 获取支付方式显示文本
const getPaymentMethodDisplayText = (method) => {
  const methodMap = {
    'cash': '现金',
    'bank_transfer': '银行转账',
    'check': '支票',
    'credit_card': '信用卡',
    'electronic_payment': '电子支付'
  };
  return methodMap[method] || method || '';
};

// 格式化日期，只显示年月日
// formatDate 已统一引用公共实现

// 日期格式化
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
};

// 加载交易列表
const loadTransactions = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      accountId: searchForm.accountId,
      transactionType: searchForm.type
    };

    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }

    const response = await api.get('/finance/bank-transactions', { params });
    // 使用统一的响应解析工具
    const { list, total: totalCount } = parsePaginatedData(response, { enableLog: false });
    transactionList.value = list.map(item => {
      // 格式化交易日期，去除时间部分
      let formattedDate = item.transaction_date;
      if (formattedDate && typeof formattedDate === 'string' && formattedDate.includes('T')) {
        formattedDate = formattedDate.split('T')[0];
      }

      // 将后端数据映射到前端格式
      const result = {
        id: item.id,
        transactionDate: formattedDate,
        accountName: item.account_name,
        accountId: item.bank_account_id,
        type: mapTransactionTypeToFrontend(item.transaction_type),
        amount: parseFloat(item.amount),
        counterparty: item.related_party || '',
        related_party: item.related_party || '', // 添加这个字段确保表格显示
        description: item.description || '',
        category: item.transaction_category || 'sales_income', // 直接使用后端返回的分类
        paymentMethod: getPaymentMethodFromDescription(item.description || '') || 'bank_transfer',
        referenceNumber: item.reference_number || '',
        isReconciled: item.is_reconciled || false, // 对账状态
        // 新增：关联发票信息
        relatedInvoiceId: item.related_invoice_id,
        related_invoice_id: item.related_invoice_id, // 确保字段存在
        relatedInvoiceType: item.related_invoice_type,
        related_invoice_type: item.related_invoice_type, // 确保字段存在
        relatedInvoiceNumber: item.related_invoice_number || null,
        related_invoice_number: item.related_invoice_number || null, // 确保字段存在
        status: item.status || item.audit_status || 'draft' // 添加审核状态映射,默认为draft
      };

      return result;
    });

    total.value = totalCount;

    // 加载交易统计
    await loadTransactionsStats();
  } catch (error) {
    console.error('加载交易列表失败:', error);
    ElMessage.error('加载交易列表失败');
    transactionList.value = [];
    total.value = 0;

    // 如果加载交易失败，仍然尝试加载统计数据
    try {
      await loadTransactionsStats();
    } catch (statsError) {
      console.error('加载统计数据失败:', statsError);
      resetTransactionStats();
    }
  } finally {
    loading.value = false;
  }
};

// 加载账户选项
const loadAccountOptions = async () => {
  try {
    const response = await api.get('/finance/bank-accounts');
    // 使用统一的响应解析工具
    accountOptions.value = parseListData(response, { enableLog: false });
  } catch (error) {
    console.error('加载账户列表失败:', error);
    ElMessage.error('加载账户列表失败');
    accountOptions.value = [];
  }
};

// 加载交易统计
const loadTransactionsStats = async () => {
  try {
    const params = {};

    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }

    if (searchForm.accountId) {
      params.accountId = searchForm.accountId;
    }

    if (searchForm.type) {
      params.transactionType = searchForm.type;
    }

    const response = await api.get('/finance/statistics/cash-flow', { params });
    // 使用统一的响应解析工具
    const stats = parseDataObject(response, { enableLog: false });
    if (stats && stats.summary) {
      // 更新统计数据，确保所有值都是有效数字
      transactionStats.totalCount = stats.summary.totalCount || 0;
      transactionStats.totalIncome = typeof stats.summary.totalIncome === 'number' ? stats.summary.totalIncome : 0;
      transactionStats.totalExpense = typeof stats.summary.totalExpense === 'number' ? stats.summary.totalExpense : 0;
      transactionStats.netAmount = typeof stats.summary.netAmount === 'number' ? stats.summary.netAmount : 0;
      transactionStats.avgAmount = transactionStats.totalCount > 0 ?
        (Math.abs(transactionStats.totalIncome) + Math.abs(transactionStats.totalExpense)) / transactionStats.totalCount : 0;
    } else {
      // 后端未返回摘要数据，重置为0
      resetTransactionStats();
    }
  } catch (error) {
    console.error('加载交易统计失败:', error);
    // 请求失败，重置统计
    resetTransactionStats();
  }
};

// 重置统计数据
const resetTransactionStats = () => {
  transactionStats.totalCount = 0;
  transactionStats.totalIncome = 0;
  transactionStats.totalExpense = 0;
  transactionStats.netAmount = 0;
  transactionStats.avgAmount = 0;
};

onMounted(() => {
  loadTransactions();
  loadAccountOptions();
  financeStore.loadSettings();
});

// 搜索交易
const searchTransactions = () => {
  currentPage.value = 1;
  loadTransactions();
};

// 重置搜索条件
const resetSearch = () => {
  searchForm.dateRange = null;
  searchForm.type = '';
  searchForm.accountId = '';
  searchTransactions();
};

// 新增交易
const showAddDialog = () => {
  dialogTitle.value = '新增交易';
  resetTransactionForm();
  dialogVisible.value = true;
};

// 查看交易详情
const handleView = (row) => {
  currentTransaction.value = row;
  viewDialogVisible.value = true;
};

// 编辑交易
const handleEdit = (row) => {
  dialogTitle.value = '编辑交易';
  resetTransactionForm();

  // 获取交易详情
  api.get(`/finance/bank-transactions/${row.id}`)
    .then(response => {
      // 使用统一的响应解析工具
      const transaction = parseDataObject(response, { enableLog: false });
      if (transaction) {
        // 填充表单数据
        transactionForm.id = row.id;
        transactionForm.type = row.type;
        transactionForm.transactionDate = row.transactionDate;
        transactionForm.accountId = row.accountId;
        transactionForm.amount = row.amount;
        transactionForm.category = row.category;
        transactionForm.paymentMethod = row.paymentMethod;
        transactionForm.counterparty = row.counterparty;
        transactionForm.description = row.description;
        transactionForm.referenceNumber = row.referenceNumber;
        // 保存交易编号，用于更新操作
        transactionForm.transactionNumber = transaction.transaction_number;

        dialogVisible.value = true;
      } else {
        ElMessage.warning('获取交易详情失败');
      }
    })
    .catch(error => {
      console.error('获取交易详情失败:', error);
      
      // 如果API不存在，仍然使用行数据填充表单
      if (error.response && error.response.status === 404) {
        // 填充表单数据
        transactionForm.id = row.id;
        transactionForm.type = row.type;
        transactionForm.transactionDate = row.transactionDate;
        transactionForm.accountId = row.accountId;
        transactionForm.amount = row.amount;
        transactionForm.category = row.category;
        transactionForm.paymentMethod = row.paymentMethod;
        transactionForm.counterparty = row.counterparty;
        transactionForm.description = row.description;
        transactionForm.referenceNumber = row.referenceNumber;
        // 生成一个假的交易编号
        transactionForm.transactionNumber = `EDIT-${Date.now()}`;
        
        dialogVisible.value = true;
      } else {
        ElMessage.error('获取交易详情失败');
      }
    });
};

// 重置交易表单
const resetTransactionForm = () => {
  transactionForm.id = null;
  transactionForm.type = 'income';
  transactionForm.transactionDate = new Date().toISOString().slice(0, 10);
  transactionForm.accountId = null;
  transactionForm.targetAccountId = null;
  transactionForm.amount = 0;
  transactionForm.category = '';
  transactionForm.paymentMethod = 'bank_transfer';
  transactionForm.counterparty = '';
  transactionForm.description = '';
  transactionForm.referenceNumber = '';
  transactionForm.transactionNumber = '';
  
  // 清除校验
  if (transactionFormRef.value) {
    transactionFormRef.value.resetFields();
  }
};

// 处理类型变化
const handleTypeChange = () => {
  // 重置与交易类型相关的字段
  transactionForm.category = '';
};

// 删除交易
const handleDelete = (row) => {
  ElMessageBox.confirm('确认要删除该交易记录吗？此操作不可恢复！', '警告', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await api.delete(`/finance/bank-transactions/${row.id}`);
      ElMessage.success('删除成功');
      loadTransactions();
    } catch (error) {
      console.error('删除交易失败:', error);
      ElMessage.error('删除交易失败');
    }
  }).catch(() => {});
};

// 保存交易
const saveTransaction = async () => {
  if (!transactionFormRef.value) return;
  
  await transactionFormRef.value.validate(async (valid) => {
    if (valid) {
      saveLoading.value = true;
      try {
        // 生成交易编号（仅用于新交易）
        let transactionNumber = '';
        if (!transactionForm.id) {
          const now = new Date();
          transactionNumber = `TX${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        }
        
        // 获取分类和支付方式的显示文本
        const categoryText = getCategoryDisplayText(transactionForm.category);
        const paymentMethodText = getPaymentMethodDisplayText(transactionForm.paymentMethod);
        
        // 在描述中包含分类和支付方式信息，便于后续解析
        let enhancedDescription = transactionForm.description || '';
        if (categoryText && !enhancedDescription.includes(categoryText)) {
          enhancedDescription = `${categoryText} - ${enhancedDescription}`;
        }
        if (paymentMethodText && !enhancedDescription.includes(paymentMethodText)) {
          enhancedDescription = `${enhancedDescription} (${paymentMethodText})`;
        }
        
        // 确保日期格式正确 (YYYY-MM-DD)
        let formattedDate = transactionForm.transactionDate;
        if (typeof formattedDate === 'object' && formattedDate instanceof Date) {
          formattedDate = formattedDate.toISOString().split('T')[0];
        } else if (typeof formattedDate === 'string' && formattedDate.includes('T')) {
          formattedDate = formattedDate.split('T')[0];
        }
        
        // 准备提交的数据
        const data = {
          bank_account_id: transactionForm.accountId,
          transaction_date: formattedDate,
          transaction_type: mapTransactionType(transactionForm.type),
          amount: parseFloat(transactionForm.amount),
          description: enhancedDescription.trim(),
          reference_number: transactionForm.referenceNumber || '',
          related_party: transactionForm.counterparty || '',
          is_reconciled: false,  // 新增交易默认未对账
          reconciliation_date: null,
          // 添加额外的分类和支付方式，虽然后端API可能不直接使用，但可能对以后的扩展有用
          category: transactionForm.category,
          payment_method: transactionForm.paymentMethod
        };
        
        // 对于编辑操作，保留原交易编号
        if (transactionForm.id) {
          // 对于更新操作，我们需要保留原始的交易编号
          try {
            const response = await api.put(`/finance/bank-transactions/${transactionForm.id}`, {
              ...data,
              transaction_number: transactionForm.transactionNumber || `UPDATE-${Date.now()}`
            });
            ElMessage.success('更新成功');
            dialogVisible.value = false;
            loadTransactions();
          } catch (updateError) {
            console.error('更新交易失败:', updateError);
            
            // 如果是404错误（API不存在），提供更友好的错误提示
            if (updateError.response && updateError.response.status === 404) {
              ElMessage.error({
                message: '更新交易失败：后台API尚未实现，请联系开发人员',
                duration: 5000
              });
              // 提示用户可以删除并重新创建
              ElMessageBox.confirm(
                '更新交易API尚未实现。您可以删除此交易并创建新交易来替代它。要继续吗？',
                '操作提示',
                {
                  confirmButtonText: '删除并重新创建',
                  cancelButtonText: '取消',
                  type: 'warning'
                }
              ).then(() => {
                // 用户确认，执行删除后创建新交易
                handleDeleteAndRecreate(transactionForm);
              }).catch(() => {
                // 用户取消，不做任何操作
              });
            } else {
              // 其他错误
              ElMessage.error(`更新交易失败: ${updateError.response?.data?.message || updateError.message}`);
            }
          }
        } else {
          // 新增交易
          try {
            // 确保日期格式正确 (YYYY-MM-DD)
            const formattedDate = transactionForm.transactionDate;
            if (typeof formattedDate === 'object' && formattedDate instanceof Date) {
              data.transaction_date = formattedDate.toISOString().split('T')[0];
            } else if (typeof formattedDate === 'string' && formattedDate.includes('T')) {
              data.transaction_date = formattedDate.split('T')[0];
            }
            
            const response = await api.post('/finance/bank-transactions', {
              ...data,
              transaction_number: transactionNumber
            });
            // 显示成功信息，包括新的余额
            const responseData = parseDataObject(response, { enableLog: false });
            if (responseData && responseData.newBalance !== undefined) {
              const accountName = accountOptions.value.find(acc => acc.id === transactionForm.accountId)?.accountName || '';
              ElMessage.success(`添加成功！${accountName}账户新余额: ${formatCurrency(responseData.newBalance)}`);
            } else {
              ElMessage.success('添加成功');
            }
            dialogVisible.value = false;
            loadTransactions();
          } catch (createError) {
            console.error('创建交易失败:', createError);
            ElMessage.error(`创建交易失败: ${createError.response?.data?.message || createError.message}`);
          }
        }
      } catch (error) {
        console.error('保存交易失败:', error);
        console.error('错误详情:', error.response?.data || error.message);
        ElMessage.error(`保存交易失败: ${error.response?.data?.message || error.message}`);
      } finally {
        saveLoading.value = false;
      }
    }
  });
};

// 删除并重新创建交易
const handleDeleteAndRecreate = async (transaction) => {
  try {
    // 删除交易
    await api.delete(`/finance/bank-transactions/${transaction.id}`);
    
    // 生成新交易编号
    const now = new Date();
    const transactionNumber = `TX${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    
    // 获取分类和支付方式的显示文本
    const categoryText = getCategoryDisplayText(transaction.category);
    const paymentMethodText = getPaymentMethodDisplayText(transaction.paymentMethod);
    
    // 在描述中包含分类和支付方式信息
    let enhancedDescription = transaction.description || '';
    if (categoryText && !enhancedDescription.includes(categoryText)) {
      enhancedDescription = `${categoryText} - ${enhancedDescription}`;
    }
    if (paymentMethodText && !enhancedDescription.includes(paymentMethodText)) {
      enhancedDescription = `${enhancedDescription} (${paymentMethodText})`;
    }
    
    // 确保日期格式正确 (YYYY-MM-DD)
    let formattedDate = transaction.transactionDate;
    if (typeof formattedDate === 'object' && formattedDate instanceof Date) {
      formattedDate = formattedDate.toISOString().split('T')[0];
    } else if (typeof formattedDate === 'string' && formattedDate.includes('T')) {
      formattedDate = formattedDate.split('T')[0];
    }
    
    // 创建新交易
    const response = await api.post('/finance/bank-transactions', {
      bank_account_id: transaction.accountId,
      transaction_date: formattedDate,
      transaction_type: mapTransactionType(transaction.type),
      amount: parseFloat(transaction.amount),
      description: enhancedDescription.trim(),
      reference_number: transaction.referenceNumber || '',
      related_party: transaction.counterparty || '',
      transaction_number: transactionNumber,
      is_reconciled: false,
      reconciliation_date: null,
      category: transaction.category,
      payment_method: transaction.paymentMethod
    });
    
    ElMessage.success('交易已重新创建');
    dialogVisible.value = false;
    loadTransactions();
  } catch (error) {
    console.error('删除并重新创建交易失败:', error);
    ElMessage.error(`操作失败: ${error.response?.data?.message || error.message}`);
  }
};

// 映射交易类型到后端支持的类型
const mapTransactionType = (type) => {
  const typeMap = {
    'income': '存款',
    'expense': '取款',
    'transfer': '转账'
  };
  return typeMap[type] || type;
};

// 映射后端交易类型到前端类型
const mapTransactionTypeToFrontend = (backendType) => {
  const typeMap = {
    // 中文类型映射
    '存款': 'income',
    '转入': 'income',
    '利息': 'income',
    '收入': 'income',
    '取款': 'expense',
    '转出': 'expense',
    '费用': 'expense',
    '支出': 'expense',
    // 英文类型保持不变
    'income': 'income',
    'expense': 'expense',
    'transfer': 'transfer',
    'transfer_in': 'income',
    'transfer_out': 'expense',
    'deposit': 'income',
    'withdrawal': 'expense',
    'interest': 'income',
    'fee': 'expense'
  };
  
  return typeMap[backendType] || 'income'; // 默认为收入类型
};

// 从描述中提取交易分类
const getCategoryFromDescription = (description) => {
  // 分类映射
  const categoryPatterns = [
    { pattern: /(销售收入|sales income)/i, category: 'sales_income' },
    { pattern: /(投资收益|investment income)/i, category: 'investment_income' },
    { pattern: /(利息收入|interest income)/i, category: 'interest_income' },
    { pattern: /(其他收入|other income)/i, category: 'other_income' },
    { pattern: /(采购支出|purchase expense)/i, category: 'purchase_expense' },
    { pattern: /(工资支出|salary expense)/i, category: 'salary_expense' },
    { pattern: /(租金支出|rent expense)/i, category: 'rent_expense' },
    { pattern: /(水电费|utility expense)/i, category: 'utility_expense' },
    { pattern: /(办公费用|office expense)/i, category: 'office_expense' },
    { pattern: /(其他支出|other expense)/i, category: 'other_expense' },
    { pattern: /(内部转账|internal transfer)/i, category: 'internal_transfer' },
    { pattern: /(资金调拨|fund allocation)/i, category: 'fund_allocation' }
  ];
  
  // 查找匹配的分类
  for (const { pattern, category } of categoryPatterns) {
    if (pattern.test(description)) {
      return category;
    }
  }
  
  // 根据描述的其他特征猜测分类
  if (/工资|薪资|salary|wage/i.test(description)) {
    return 'salary_expense';
  } else if (/销售|sales/i.test(description)) {
    return 'sales_income';
  } else if (/采购|purchase/i.test(description)) {
    return 'purchase_expense';
  } else if (/租金|rent/i.test(description)) {
    return 'rent_expense';
  } else if (/利息|interest/i.test(description)) {
    return 'interest_income';
  } else if (/办公|office/i.test(description)) {
    return 'office_expense';
  }
  
  // 默认分类
  return '';
};

// 从描述中提取支付方式
const getPaymentMethodFromDescription = (description) => {
  // 支付方式映射
  const methodPatterns = [
    { pattern: /(现金|cash)/i, method: 'cash' },
    { pattern: /(银行转账|bank transfer)/i, method: 'bank_transfer' },
    { pattern: /(支票|check)/i, method: 'check' },
    { pattern: /(信用卡|credit card)/i, method: 'credit_card' },
    { pattern: /(电子支付|electronic payment|支付宝|微信|alipay|wechat)/i, method: 'electronic_payment' }
  ];
  
  // 查找匹配的支付方式
  for (const { pattern, method } of methodPatterns) {
    if (pattern.test(description)) {
      return method;
    }
  }
  
  // 默认为银行转账
  return 'bank_transfer';
};

// 标记交易为已对账
const markReconciled = async (row) => {
  try {
    await api.patch(`/finance/bank-transactions/${row.id}/reconcile`, {
      is_reconciled: true,
      reconciliation_date: new Date().toISOString().split('T')[0]
    });
    ElMessage.success('已标记为已对账');
    loadTransactions();
  } catch (error) {
    console.error('标记对账失败:', error);
    ElMessage.error('标记对账失败');
  }
};

// 取消交易对账
const cancelReconciled = async (row) => {
  try {
    await ElMessageBox.confirm('确定要取消该交易的对账状态吗?', '提示', {
      type: 'warning'
    });
    await api.patch(`/finance/bank-transactions/${row.id}/reconcile`, {
      is_reconciled: false,
      reconciliation_date: null
    });
    ElMessage.success('已取消对账');
    loadTransactions();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('取消对账失败:', error);
      ElMessage.error('取消对账失败');
    }
  }
};

// 审核权限

// 获取审核状态样式
const getAuditStatusType = (status) => {
  const map = {
    draft: 'info',
    pending: 'warning',
    reviewed: 'primary',
    approved: 'success',
    rejected: 'danger'
  };
  return map[status] || 'info';
};

// 获取审核状态文本
const getAuditStatusText = (status) => {
  const map = {
    draft: '草稿',
    pending: '待审核',
    reviewed: '已初审',
    approved: '已批准',
    rejected: '已驳回'
  };
  return map[status] || '草稿';
};

// 提交审核
const submitForAudit = async (row) => {
  try {
    await ElMessageBox.confirm('确定要提交该交易进行审核吗?', '提交审核', {
      type: 'info'
    });
    await api.post(`/finance/bank-transactions/${row.id}/submit`, {
      userId: authStore.user?.id || 0
    });
    
    ElMessage.success('提交审核成功');
    loadTransactions();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('提交审核失败:', error);
      ElMessage.error('提交审核失败');
    }
  }
};


// 审核操作
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
      const status = action === 'confirm' ? 'approved' : 'rejected';
      
      try {
        instance.confirmButtonLoading = true;
        instance.cancelButtonLoading = true;
        
        await api.post(`/finance/bank-transactions/${row.id}/audit`, {
          status,
          remark,
          auditorId: authStore.user?.id || 0
        });
        
        ElMessage.success(status === 'rejected' ? '已驳回' : '审核通过');
        loadTransactions();
        done();
      } catch (error) {
        console.error('审核失败:', error);
        ElMessage.error('审核操作失败');
      } finally {
        instance.confirmButtonLoading = false;
        instance.cancelButtonLoading = false;
      }
    }
  }).catch(action => {
    // 驳回逻辑在beforeClose中处理了，这里只需捕获取消
    if (action === 'cancel') {
      // 驳回按钮点击也会触发cancel，但已经在beforeClose处理
    }
  });
};

// 导出交易数据
const exportTransactions = () => {
  // 使用环境变量配置的API基础URL，默认为相对路径
  const baseURL = import.meta.env.VITE_API_URL || '';
  let url = `${baseURL}/api/finance/bank-transactions/export`;
  
  const params = [];
  if (searchForm.dateRange && searchForm.dateRange.length === 2) {
    params.push(`startDate=${searchForm.dateRange[0]}`);
    params.push(`endDate=${searchForm.dateRange[1]}`);
  }
  
  if (searchForm.accountId) {
    params.push(`accountId=${searchForm.accountId}`);
  }
  
  if (searchForm.type) {
    params.push(`transactionType=${searchForm.type}`);
  }
  
  if (params.length > 0) {
    url += `?${params.join('&')}`;
  }
  
  window.open(url);
};

// 显示导入对话框
const showImportDialog = () => {
  importDialogVisible.value = true;
  importFileList.value = [];
  importResult.value = null;
};

// 处理文件选择
const handleFileChange = (file, fileList) => {
  importFileList.value = fileList;
  importResult.value = null;
};

// 处理文件移除
const handleFileRemove = (file, fileList) => {
  importFileList.value = fileList;
  importResult.value = null;
};

// 执行导入
const handleImport = async () => {
  if (importFileList.value.length === 0) {
    ElMessage.warning('请先选择要导入的文件');
    return;
  }

  importLoading.value = true;
  importResult.value = null;

  try {
    const formData = new FormData();
    formData.append('file', importFileList.value[0].raw);

    const response = await api.post('/finance/bank-transactions/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    // 拦截器已解包，response.data 就是业务数据
    // 如果业务失败，拦截器会抛出错误
    importResult.value = response.data;
    ElMessage.success(response._message || '导入成功');
    // 刷新交易列表
    loadTransactions();

  } catch (error) {
    console.error('导入失败:', error);
    importResult.value = {
      success: false,
      message: error.message || '导入失败',
      data: null
    };
    ElMessage.error(error.message || '导入失败');
  } finally {
    importLoading.value = false;
  }
};

// 下载模板
const downloadTemplate = () => {
  // 创建模板数据
  const templateData = [
    {
      '交易日期': '2025-01-01',
      '账户名称': '工商银行基本户',
      '交易类型': '存款',
      '交易金额': 10000.00,
      '交易对方': '客户A',
      '交易描述': '销售收入',
      '参考号': 'REF001'
    },
    {
      '交易日期': '2025-01-02',
      '账户名称': '工商银行基本户',
      '交易类型': '取款',
      '交易金额': 5000.00,
      '交易对方': '供应商B',
      '交易描述': '采购付款',
      '参考号': 'REF002'
    }
  ];

  // 使用动态导入 ExcelJS 库
  import('exceljs').then(async ({ default: ExcelJS }) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('银行交易模板');

    // 设置列
    worksheet.columns = [
      { header: '交易日期', key: 'date', width: 12 },
      { header: '账户名称', key: 'account', width: 20 },
      { header: '交易类型', key: 'type', width: 10 },
      { header: '交易金额', key: 'amount', width: 15 },
      { header: '交易对方', key: 'counterparty', width: 20 },
      { header: '交易描述', key: 'description', width: 30 },
      { header: '参考号', key: 'reference', width: 15 }
    ];

    // 添加模板数据
    templateData.forEach(row => {
      worksheet.addRow(row);
    });

    // 生成并下载文件
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '银行交易导入模板.xlsx';
    link.click();
    window.URL.revokeObjectURL(url);
  }).catch(error => {
    console.error('下载模板失败:', error);
    ElMessage.error('下载模板失败');
  });
};

// 打印银行存款日记账
const printBankStatement = async () => {
  try {

    // 获取当前筛选条件下的所有交易数据
    const params = {
      accountId: searchForm.accountId,
      transactionType: searchForm.type,
      page: 1,
      limit: 1000 // 获取大量数据用于打印
    };

    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }

    const response = await api.get('/finance/bank-transactions', { params });
    // 使用统一的响应解析工具
    const { list: printData } = parsePaginatedData(response, { enableLog: false });

    // 获取账户信息
    const selectedAccount = accountOptions.value.find(acc => acc.id === searchForm.accountId);
    const accountName = selectedAccount ? selectedAccount.accountName : '全部账户';
    const accountNumber = selectedAccount ? selectedAccount.accountNumber : '';

    // 尝试获取打印模板
    try {
      const templateResponse = await api.get('/print/templates/public/default', {
        params: {
          module: 'finance',
          template_type: 'bank_statement'
        }
      });

      // 使用统一的响应解析工具
      const template = parseDataObject(templateResponse, { enableLog: false });
      if (template) {

        // 使用模板进行打印
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          ElMessage.error('无法打开打印窗口，请检查浏览器是否阻止弹出窗口');
          return;
        }

        // 替换模板中的变量
        let printContent = template.content;

        // 替换基本信息
        printContent = printContent.replace(/{{accountName}}/g, accountName);
        printContent = printContent.replace(/{{accountNumber}}/g, accountNumber);
        printContent = printContent.replace(/{{companyName}}/g, '浙江开控电气有限公司');
        printContent = printContent.replace(/{{printDate}}/g, new Date().toLocaleDateString('zh-CN'));

        // 生成交易记录表格
        let tableRows = '';
        let runningBalance = 0;

        // 按日期排序
        const sortedData = printData.sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

        sortedData.forEach((item, index) => {
          const amount = parseFloat(item.amount);
          // 修复交易类型判断 - 使用中文交易类型
          const isIncome = item.transaction_type === '存款' || item.transaction_type === '转入' || item.transaction_type === 'deposit' || item.transaction_type === 'income';

          if (isIncome) {
            runningBalance += amount;
          } else {
            runningBalance -= amount;
          }

          tableRows += `
            <tr>
              <td style="border: 1px solid #000; padding: 4px; text-align: center;">${item.transaction_date}</td>
              <td style="border: 1px solid #000; padding: 4px; text-align: center;">${item.related_party || ''}</td>
              <td style="border: 1px solid #000; padding: 4px; text-align: center;">${item.reference_number || ''}</td>
              <td style="border: 1px solid #000; padding: 4px;">${item.description || ''}</td>
              <td style="border: 1px solid #000; padding: 4px; text-align: right;">${isIncome ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '-'}</td>
              <td style="border: 1px solid #000; padding: 4px; text-align: right;">${!isIncome ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '-'}</td>
              <td style="border: 1px solid #000; padding: 4px; text-align: right;">${runningBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</td>
            </tr>
          `;
        });

        printContent = printContent.replace(/{{transactionRows}}/g, tableRows);

        // 计算合计 - 修复交易类型判断
        const totalIncome = sortedData.filter(item =>
          item.transaction_type === '存款' || item.transaction_type === '转入' ||
          item.transaction_type === 'deposit' || item.transaction_type === 'income'
        ).reduce((sum, item) => sum + parseFloat(item.amount), 0);

        const totalExpense = sortedData.filter(item =>
          item.transaction_type === '取款' || item.transaction_type === '转出' ||
          item.transaction_type === 'withdrawal' || item.transaction_type === 'expense'
        ).reduce((sum, item) => sum + parseFloat(item.amount), 0);

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
        ElMessage.error('未找到银行存款日记账打印模板，请联系管理员配置模板');
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

// 跳转到关联发票
const jumpToInvoice = (row) => {
  if (!row.relatedInvoiceType || !row.relatedInvoiceId) {
    ElMessage.warning('未找到关联发票信息');
    return;
  }
  
  const router = useRouter();
  if (row.relatedInvoiceType === 'AR') {
    // 跳转到应收发票页面
    router.push({
      path: '/finance/ar/invoices',
      query: { invoiceId: row.relatedInvoiceId }
    });
  } else if (row.relatedInvoiceType === 'AP') {
    // 跳转到应付发票页面
    router.push({
      path: '/finance/ap/invoices',
      query: { invoiceId: row.relatedInvoiceId }
    });
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

// 页面加载时执行
onMounted(() => {
  loadAccountOptions();
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

.negative-value {
  color: var(--color-danger);
}

.positive-value {
  color: var(--color-success);
}
/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}

/* 详情对话框长文本处理 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 操作按钮容器 */
.operation-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* 交易详情头部 */
.transaction-detail-header {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.transaction-detail-header .detail-item {
  margin-right: 30px;
  margin-bottom: 10px;
}

.transaction-detail-header .label {
  font-weight: bold;
  margin-right: 8px;
  color: var(--color-text-regular);
}

.transaction-detail-header .value {
  color: var(--color-text-primary);
}
</style>