<!--
/**
 * Payments.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="payments-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>付款记录管理</h2>
          <p class="subtitle">管理供应商付款记录</p>
        </div>
        <el-button v-permission="'finance:ap:pay'" type="primary" :icon="Plus" @click="showAddDialog">新增付款</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="付款编号">
          <el-input  v-model="searchForm.paymentNumber" placeholder="输入付款编号" clearable ></el-input>
        </el-form-item>
        <el-form-item label="供应商">
          <el-input  v-model="searchForm.supplierName" placeholder="输入供应商名称" clearable ></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchPayments">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
          <el-button class="advanced-search-btn" @click="showAdvancedSearch = !showAdvancedSearch">
            {{ showAdvancedSearch ? '收起筛选' : '高级搜索' }}
            <el-icon style="margin-left: 4px;"><ArrowUp v-if="showAdvancedSearch" /><ArrowDown v-else /></el-icon>
          </el-button>
        </el-form-item>
      </el-form>
      <!-- 高级搜索区域 -->
      <el-form :inline="true" :model="searchForm" class="search-form" v-show="showAdvancedSearch" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #dcdfe6;">
        <el-form-item label="付款日期">
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
        <el-form-item label="付款方式">
          <el-select v-model="searchForm.paymentMethod" placeholder="选择付款方式" clearable>
            <el-option label="现金" value="cash"></el-option>
            <el-option label="银行转账" value="bank_transfer"></el-option>
            <el-option label="支票" value="check"></el-option>
            <el-option label="信用卡" value="credit_card"></el-option>
            <el-option label="其他" value="other"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="选择状态" clearable>
            <el-option label="正常" value="normal"></el-option>
            <el-option label="已作废" value="void"></el-option>
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="paymentList"
        style="width: 100%"
        border
        v-loading="loading"
      >
        <el-table-column prop="paymentNumber" label="付款编号" width="160"></el-table-column>
        <el-table-column prop="supplierName" label="供应商" width="250"></el-table-column>
        <el-table-column prop="paymentDate" label="付款日期" width="100"></el-table-column>
        <el-table-column prop="invoiceNumber" label="发票编号" width="130"></el-table-column>
        <el-table-column prop="amount" label="金额" width="200" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="paymentMethod" label="付款方式" width="90">
          <template #default="scope">
            {{ getPaymentMethodText(scope.row.paymentMethod) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)" size="small">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="notes" label="备注" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column label="操作" min-width="230" fixed="right">
          <template #default="scope">
            <el-button type="info" size="small" @click="handleViewDetail(scope.row)">详情</el-button>
            <el-button v-permission="'finance:ap:update'" 
              v-if="scope.row.status === 'normal'" 
              type="warning" 
              size="small" 
              @click="handleVoid(scope.row)"
            >作废</el-button>
            <el-button v-permission="'finance:ap:view'" type="success" size="small" @click="handlePrint(scope.row)">打印</el-button>
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
      <el-form :model="paymentForm" :rules="paymentRules" ref="paymentFormRef" label-width="100px">
        <el-form-item label="付款编号" prop="paymentNumber">
          <el-input v-model="paymentForm.paymentNumber" placeholder="请输入付款编号"></el-input>
        </el-form-item>
        <el-form-item label="关联发票" prop="invoiceId">
          <el-select 
            v-model="paymentForm.invoiceId" 
            placeholder="请选择关联发票" 
            filterable 
            style="width: 100%"
            @change="handleInvoiceChange"
          >
            <el-option
              v-for="invoice in invoiceOptions"
              :key="invoice.id"
              :label="`${invoice.invoiceNumber} - ${invoice.supplierName} - ${formatCurrency(invoice.balance)}`"
              :value="invoice.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="供应商" prop="supplierName">
          <el-input v-model="paymentForm.supplierName" disabled></el-input>
        </el-form-item>
        <el-form-item label="付款日期" prop="paymentDate">
          <el-date-picker
            v-model="paymentForm.paymentDate"
            type="date"
            placeholder="选择付款日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="发票金额">
          <el-input v-model="paymentForm.invoiceAmount" disabled></el-input>
        </el-form-item>
        <el-form-item label="已付金额">
          <el-input v-model="paymentForm.paidAmount" disabled></el-input>
        </el-form-item>
        <el-form-item label="剩余金额">
          <el-input v-model="paymentForm.balance" disabled></el-input>
        </el-form-item>
        <el-form-item label="付款金额" prop="amount">
          <el-input-number v-model="paymentForm.amount" :precision="2" :min="0" :max="paymentForm.balanceValue" style="width: 100%"></el-input-number>
        </el-form-item>
        <el-form-item label="付款方式" prop="paymentMethod">
          <el-select v-model="paymentForm.paymentMethod" placeholder="请选择付款方式" style="width: 100%">
            <el-option label="现金" value="cash"></el-option>
            <el-option label="银行转账" value="bank_transfer"></el-option>
            <el-option label="支票" value="check"></el-option>
            <el-option label="信用卡" value="credit_card"></el-option>
            <el-option label="其他" value="other"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="备注" prop="notes">
          <el-input
            v-model="paymentForm.notes"
            type="textarea"
            :rows="3"
            placeholder="请输入备注信息"
          ></el-input>
        </el-form-item>
        
        <!-- 自动生成会计凭证选项 -->
        <el-form-item label="会计凭证">
          <el-switch
            v-model="paymentForm.createLedgerEntry"
            inline-prompt
            active-text="自动生成"
            inactive-text="不生成"
            :active-value="true"
            :inactive-value="false"
          ></el-switch>
          <div class="tip-text" v-if="paymentForm.createLedgerEntry">
            将自动生成应付账款付款会计凭证
          </div>
        </el-form-item>
        
        <!-- 银行账户选择，当付款方式为银行转账或信用卡时显示 -->
        <el-form-item label="付款账户" prop="bankAccountId" v-if="['bank_transfer', 'credit_card'].includes(paymentForm.paymentMethod)">
          <el-select 
            v-model="paymentForm.bankAccountId" 
            placeholder="选择付款账户" 
            filterable 
            style="width: 100%"
          >
            <el-option
              v-for="account in bankAccountOptions"
              :key="account.id"
              :label="`${account.bankName || account.accountName} (${account.accountNumber || '***'})`"
              :value="account.id"
            ></el-option>
          </el-select>
          <div class="form-tip"><el-icon style="vertical-align: middle; color: var(--color-primary);"><InfoFilled /></el-icon> 选择后将自动创建银行交易记录并更新账户余额</div>
        </el-form-item>
        
        <el-form-item label="参考号" prop="referenceNumber" v-if="paymentForm.paymentMethod !== 'cash'">
          <el-input v-model="paymentForm.referenceNumber" placeholder="请输入付款参考号/交易号"></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="savePayment" :loading="saveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog
      title="付款记录详情"
      v-model="detailDialogVisible"
      width="650px"
    >
      <el-descriptions :column="2" border>
        <el-descriptions-item label="付款编号">{{ detailData.paymentNumber }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(detailData.status)">{{ getStatusText(detailData.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="供应商">{{ detailData.supplierName }}</el-descriptions-item>
        <el-descriptions-item label="付款日期">{{ detailData.paymentDate }}</el-descriptions-item>
        <el-descriptions-item label="付款金额">{{ formatCurrency(detailData.amount) }}</el-descriptions-item>
        <el-descriptions-item label="付款方式">{{ getPaymentMethodText(detailData.paymentMethod) }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detailData.notes || '-' }}</el-descriptions-item>
        
        <!-- 如果已作废，显示作废信息 -->
        <template v-if="detailData.status === 'void'">
          <el-descriptions-item label="作废时间">{{ detailData.voided_at }}</el-descriptions-item>
          <el-descriptions-item label="作废人">{{ detailData.voided_by_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="作废原因" :span="2">{{ detailData.void_reason }}</el-descriptions-item>
        </template>
      </el-descriptions>
    </el-dialog>

    <!-- 作废对话框 -->
    <el-dialog
      title="作废付款记录"
      v-model="voidDialogVisible"
      width="500px"
    >
      <el-alert
        type="warning"
        :closable="false"
        style="margin-bottom: 20px;"
      >
        <template #title>
          <div style="font-weight: bold;">确认作废该付款记录？</div>
        </template>
        <div style="margin-top: 10px; line-height: 1.6;">
          作废后将执行以下操作：<br>
          ✓ 恢复发票的应付余额<br>
          ✓ 冲销相关的银行交易记录<br>
          ✓ 记录将保留但无法再编辑
        </div>
      </el-alert>
      
      <el-form :model="voidForm" :rules="voidRules" ref="voidFormRef" label-width="100px">
        <el-form-item label="付款编号">
          <el-input v-model="voidForm.paymentNumber" disabled></el-input>
        </el-form-item>
        <el-form-item label="付款金额">
          <el-input v-model="voidForm.amount" disabled></el-input>
        </el-form-item>
        <el-form-item label="作废原因" prop="voidReason">
          <el-input
            v-model="voidForm.voidReason"
            type="textarea"
            :rows="4"
            placeholder="请输入作废原因，至少10个字符"
            maxlength="500"
            show-word-limit
          ></el-input>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="voidDialogVisible = false">取消</el-button>
          <el-button v-permission="'finance:ap:update'" type="danger" @click="confirmVoid" :loading="voidLoading">确认作废</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 打印预览对话框 -->
    <PrintDialog
      v-model="printDialogVisible"
      title="付款凭证预览"
      template-type="ap_payment"
      module="finance"
      :data="printData"
    />
  </div>
</template>

<script setup>
import { NumberFormatter } from '@/utils/commonHelpers'
import { formatCurrency } from '@/utils/format'

import PrintDialog from '@/components/common/PrintDialog.vue';
import { parsePaginatedData, parseListData, parseDataObject } from '@/utils/responseParser';

import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, ArrowUp, ArrowDown } from '@element-plus/icons-vue';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

// 权限计算属性

// 高级搜索展开状态
const showAdvancedSearch = ref(false);

// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);

// 分页相关
const total = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);

// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('新增付款记录');
const paymentFormRef = ref(null);

// 数据列表
const paymentList = ref([]);
const invoiceOptions = ref([]);
const bankAccountOptions = ref([]);

// 搜索表单
const searchForm = reactive({
  paymentNumber: '',
  supplierName: '',
  dateRange: [],
  paymentMethod: '',
  status: '' // 添加状态筛选
});

// 详情对话框
const detailDialogVisible = ref(false);
const detailData = ref({});

// 作废对话框
const voidDialogVisible = ref(false);
const voidLoading = ref(false);
const voidFormRef = ref(null);
const voidForm = reactive({
  id: null,
  paymentNumber: '',
  amount: '',
  voidReason: ''
});

// 作废表单验证规则
const voidRules = {
  voidReason: [
    { required: true, message: '请输入作废原因', trigger: 'blur' },
    { min: 10, message: '作废原因至少需要10个字符', trigger: 'blur' }
  ]
};

// 付款表单
const paymentForm = reactive({
  id: null,
  paymentNumber: '',
  invoiceId: null,
  invoiceNumber: '',
  supplierName: '',
  invoiceAmount: '',
  paidAmount: '',
  balance: '',
  balanceValue: 0,
  paymentDate: new Date().toISOString().slice(0, 10),
  amount: 0,
  paymentMethod: 'bank_transfer',
  notes: '',
  createLedgerEntry: false,
  bankAccountId: null,
  referenceNumber: ''
});

// 表单验证规则
const paymentRules = {
  paymentNumber: [
    { required: true, message: '请输入付款编号', trigger: 'blur' }
  ],
  invoiceId: [
    { required: true, message: '请选择关联发票', trigger: 'change' }
  ],
  paymentDate: [
    { required: true, message: '请选择付款日期', trigger: 'change' }
  ],
  amount: [
    { required: true, message: '请输入付款金额', trigger: 'blur' }
  ],
  paymentMethod: [
    { required: true, message: '请选择付款方式', trigger: 'change' }
  ]
};

// 获取付款方式文本
const getPaymentMethodText = (method) => {
  const methodMap = {
    cash: '现金',
    bank_transfer: '银行转账',
    check: '支票',
    credit_card: '信用卡',
    other: '其他'
  };
  return methodMap[method] || method;
};

// 加载付款记录列表
const loadPayments = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      paymentNumber: searchForm.paymentNumber,
      supplierName: searchForm.supplierName,
      startDate: searchForm.dateRange?.[0] || '',
      endDate: searchForm.dateRange?.[1] || '',
      paymentMethod: searchForm.paymentMethod,
      status: searchForm.status // 添加状态筛选
    };

    const response = await api.get('/finance/ap/payments', { params });

    // 使用统一的响应解析工具
    const { list, total: totalCount } = parsePaginatedData(response, { enableLog: false });
    paymentList.value = list;
    total.value = totalCount;

    // 如果付款记录缺少发票信息，尝试获取
    for (const payment of paymentList.value) {
      if (payment.invoiceId && !payment.invoiceNumber) {
        try {
          const invoiceResponse = await api.get(`/finance/ap/invoices/${payment.invoiceId}`);
          const invoiceData = parseDataObject(invoiceResponse, { enableLog: false });
          if (invoiceData) {
            payment.invoiceNumber = invoiceData.invoiceNumber;
          }
        } catch (error) {
          console.error(`获取发票 ${payment.invoiceId} 详情失败:`, error);
        }
      }
    }
  } catch (error) {
    console.error('加载付款记录失败:', error);
    ElMessage.error(`加载付款记录失败: ${error.message || '未知错误'}`);
    paymentList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

// 加载未付清的发票选项
const loadInvoiceOptions = async () => {
  try {
    const response = await api.get('/finance/ap/invoices/unpaid');
    // 使用统一的列表解析工具
    invoiceOptions.value = parseListData(response, { enableLog: false });
  } catch (error) {
    console.error('加载发票列表失败:', error);
    ElMessage.error('加载发票列表失败');
    invoiceOptions.value = [];
  }
};

// 加载银行账户选项
const loadBankAccountOptions = async () => {
  try {
    const response = await api.get('/finance/bank-accounts');
    // 使用统一的列表解析工具
    bankAccountOptions.value = parseListData(response, { enableLog: false });
  } catch (error) {
    console.error('加载银行账户列表失败:', error);
    ElMessage.error('加载银行账户列表失败');
  }
};

// 处理发票选择变化
const handleInvoiceChange = async () => {
  if (!paymentForm.invoiceId) {
    paymentForm.supplierName = '';
    paymentForm.invoiceAmount = '';
    paymentForm.paidAmount = '';
    paymentForm.balance = '';
    paymentForm.balanceValue = 0;
    paymentForm.amount = 0;
    return;
  }
  
  try {
    const response = await api.get(`/finance/ap/invoices/${paymentForm.invoiceId}`);
    const invoice = response.data;
    
    const balance = invoice.amount - invoice.paidAmount;
    
    paymentForm.invoiceNumber = invoice.invoiceNumber;
    paymentForm.supplierName = invoice.supplierName;
    paymentForm.invoiceAmount = formatCurrency(invoice.amount);
    paymentForm.paidAmount = formatCurrency(invoice.paidAmount);
    paymentForm.balance = formatCurrency(balance);
    paymentForm.balanceValue = balance;
    paymentForm.amount = balance; // 默认填充剩余金额
  } catch (error) {
    console.error('获取发票详情失败:', error);
    ElMessage.error('获取发票详情失败');
  }
};

// 搜索付款记录
const searchPayments = () => {
  currentPage.value = 1;
  loadPayments();
};

// 重置搜索条件
const resetSearch = () => {
  searchForm.paymentNumber = '';
  searchForm.supplierName = '';
  searchForm.dateRange = [];
  searchForm.paymentMethod = '';
  searchForm.status = ''; // 重置状态筛选
  searchPayments();
};

// 获取状态类型（用于tag颜色）
const getStatusType = (status) => {
  const typeMap = {
    'normal': 'success',
    'void': 'danger'
  };
  return typeMap[status] || 'info';
};

// 获取状态文本
const getStatusText = (status) => {
  const textMap = {
    'normal': '正常',
    'void': '已作废'
  };
  return textMap[status] || status;
};

// 查看详情
const handleViewDetail = async (row) => {
  try {
    const response = await api.get(`/finance/ap/payments/${row.id}`);
    detailData.value = response.data;
    detailDialogVisible.value = true;
  } catch (error) {
    console.error('获取付款记录详情失败:', error);
    ElMessage.error('获取付款记录详情失败');
  }
};

// 作废付款记录
const handleVoid = (row) => {
  // 重置作废表单
  voidForm.id = row.id;
  voidForm.paymentNumber = row.paymentNumber;
  voidForm.amount = formatCurrency(row.amount);
  voidForm.voidReason = '';
  
  // 清除校验
  if (voidFormRef.value) {
    voidFormRef.value.resetFields();
  }
  
  voidDialogVisible.value = true;
};

// 确认作废
const confirmVoid = async () => {
  if (!voidFormRef.value) return;
  
  await voidFormRef.value.validate(async (valid) => {
    if (valid) {
      voidLoading.value = true;
      try {
        await api.post(`/finance/ap/payments/${voidForm.id}/void`, {
          void_reason: voidForm.voidReason
        });
        
        ElMessage.success('付款记录已成功作废');
        voidDialogVisible.value = false;
        loadPayments(); // 刷新列表
      } catch (error) {
        console.error('作废付款记录失败:', error);
        ElMessage.error(error.response?.data?.message || '作废付款记录失败');
      } finally {
        voidLoading.value = false;
      }
    }
  });
};

// 新增付款记录
const showAddDialog = () => {
  dialogTitle.value = '新增付款记录';
  resetPaymentForm();
  loadInvoiceOptions();
  loadBankAccountOptions();
  dialogVisible.value = true;
};

// 编辑付款记录
const handleEdit = async (row) => {
  dialogTitle.value = '编辑付款记录';
  
  try {
    const response = await api.get(`/finance/ap/payments/${row.id}`);
    const payment = response.data;
    
    resetPaymentForm();
    await loadInvoiceOptions();
    await loadBankAccountOptions();
    
    // 填充表单数据
    paymentForm.id = payment.id;
    paymentForm.paymentNumber = payment.paymentNumber;
    paymentForm.invoiceId = payment.invoiceId;
    paymentForm.paymentDate = payment.paymentDate;
    paymentForm.amount = payment.amount;
    paymentForm.paymentMethod = payment.paymentMethod;
    paymentForm.notes = payment.notes;
    
    // 加载发票信息
    await handleInvoiceChange();
    
    dialogVisible.value = true;
  } catch (error) {
    console.error('获取付款记录详情失败:', error);
    ElMessage.error('获取付款记录详情失败');
  }
};

// 删除付款记录
const handleDelete = (row) => {
  ElMessageBox.confirm('确认要删除该付款记录吗？此操作将影响关联发票的付款状态。', '警告', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await api.delete(`/finance/ap/payments/${row.id}`);
      ElMessage.success('删除成功');
      loadPayments();
    } catch (error) {
      console.error('删除付款记录失败:', error);
      ElMessage.error('删除付款记录失败');
    }
  }).catch(() => {});
};

// 打印相关状态
const printDialogVisible = ref(false);
const printData = ref({});

// 打印付款记录
const handlePrint = async (row) => {
  try {
    // 获取完整的付款详情以确保数据准确（如关联发票号）
    const response = await api.get(`/finance/ap/payments/${row.id}`);
    const payment = response.data;

    // 准备打印数据
    printData.value = {
      payment_number: payment.paymentNumber,
      payment_date: payment.paymentDate,
      supplier_name: payment.supplierName,
      payment_method: getPaymentMethodText(payment.paymentMethod),
      // 如果没有具体的银行账户信息，显示"-"
      bank_account_name: payment.bankAccountName || '-', 
      bank_account_number: payment.bankAccountNumber || '',
      amount: payment.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      amount_upper: NumberFormatter.digitUppercase(payment.amount), // 使用工具类转换金额大写
      invoice_number: payment.invoiceNumber || '-',
      notes: payment.notes || '',
      operator: '管理员', // 暂时硬编码或从 authStore 获取当前用户名
      print_time: new Date().toLocaleString()
    };
    
    // 如果后端没有返回 bankAccountName（因为列表接口可能不包含），尝试从 options 查找或再次获取
    // 这里简单处理，假设详情接口返回了，或者如果没返回就不显示
    
    // 尝试添加当前操作员名称
    if (authStore.user && authStore.user.name) {
      printData.value.operator = authStore.user.name;
    }

    printDialogVisible.value = true;
  } catch (error) {
    console.error('准备打印数据失败:', error);
    ElMessage.error('准备打印数据失败');
  }
};

// 保存付款记录
const savePayment = async () => {
  if (!paymentFormRef.value) return;
  
  await paymentFormRef.value.validate(async (valid) => {
    if (valid) {
      saveLoading.value = true;
      try {
        // 准备提交的数据
        const data = {
          id: paymentForm.id,
          paymentNumber: paymentForm.paymentNumber,
          invoiceId: paymentForm.invoiceId,
          paymentDate: paymentForm.paymentDate,
          amount: paymentForm.amount,
          paymentMethod: paymentForm.paymentMethod,
          notes: paymentForm.notes,
          createLedgerEntry: paymentForm.createLedgerEntry,
          bankAccountId: paymentForm.bankAccountId,
          referenceNumber: paymentForm.referenceNumber
        };
        
        if (paymentForm.id) {
          // 更新
          await api.put(`/finance/ap/payments/${paymentForm.id}`, data);
          ElMessage.success('更新成功');
        } else {
          // 新增
          await api.post('/finance/ap/payments', data);
          ElMessage.success('添加成功');
        }
        dialogVisible.value = false;
        loadPayments();
      } catch (error) {
        console.error('保存付款记录失败:', error);
        ElMessage.error('保存付款记录失败');
      } finally {
        saveLoading.value = false;
      }
    }
  });
};

// 重置付款表单
const resetPaymentForm = () => {
  paymentForm.id = null;
  paymentForm.paymentNumber = '';
  paymentForm.invoiceId = null;
  paymentForm.invoiceNumber = '';
  paymentForm.supplierName = '';
  paymentForm.invoiceAmount = '';
  paymentForm.paidAmount = '';
  paymentForm.balance = '';
  paymentForm.balanceValue = 0;
  paymentForm.paymentDate = new Date().toISOString().slice(0, 10);
  paymentForm.amount = 0;
  paymentForm.paymentMethod = 'bank_transfer';
  paymentForm.notes = '';
  paymentForm.createLedgerEntry = false;
  paymentForm.bankAccountId = null;
  paymentForm.referenceNumber = '';
  
  // 清除校验
  if (paymentFormRef.value) {
    paymentFormRef.value.resetFields();
  }
};

// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = size;
  loadPayments();
};

const handleCurrentChange = (page) => {
  currentPage.value = page;
  loadPayments();
};

// 页面加载时执行
onMounted(() => {
  loadPayments();
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

.search-form-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}

.search-form-inputs {
  display: flex;
  flex-wrap: wrap;
  flex: 1;
}

.search-form-buttons {
  display: flex;
  align-items: flex-end;
}







.tip-text {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 5px;
  line-height: 1.2;
  padding-left: 5px;
}



/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}





@media (max-width: 768px) {
  .search-form-container {
    flex-direction: column;
  }

  .search-form-buttons {
    align-self: flex-end;
  }
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

.form-tip {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
  line-height: 1.4;
}
</style> 