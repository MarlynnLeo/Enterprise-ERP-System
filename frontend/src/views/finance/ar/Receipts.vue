<!--
/**
 * Receipts.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="receipts-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>收款记录管理</h2>
          <p class="subtitle">管理客户收款记录</p>
        </div>
        <el-button v-permission="'finance:ar:receive'" type="primary" :icon="Plus" @click="showAddDialog">新增收款</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="收款编号">
          <el-input  v-model="searchForm.receiptNumber" placeholder="输入收款编号" clearable ></el-input>
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input  v-model="searchForm.customerName" placeholder="输入客户名称" clearable ></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchReceipts">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
          <el-button class="advanced-search-btn" @click="showAdvancedSearch = !showAdvancedSearch">
            {{ showAdvancedSearch ? '收起筛选' : '高级搜索' }}
            <el-icon style="margin-left: 4px;"><ArrowUp v-if="showAdvancedSearch" /><ArrowDown v-else /></el-icon>
          </el-button>
        </el-form-item>
      </el-form>
      <!-- 高级搜索区域 -->
      <el-form :inline="true" :model="searchForm" class="search-form" v-show="showAdvancedSearch" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #dcdfe6;">
        <el-form-item label="收款日期">
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
        <el-form-item label="收款方式">
          <el-select v-model="searchForm.paymentMethod" placeholder="选择收款方式" clearable>
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
    
    <!-- 过滤提示条 - 当通过发票跳转时显示 -->
    <el-alert
      v-if="isFilteredByInvoice"
      :title="`当前只显示发票 ${currentInvoiceFilter} 的收款记录`"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 20px;"
    >
      <template #default>
        <el-button type="primary" size="small" @click="clearInvoiceFilter" style="margin-left: 10px;">
          查看全部收款记录
        </el-button>
      </template>
    </el-alert>
    
    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="receiptList"
        style="width: 100%"
        border
        v-loading="loading"
      >
        <el-table-column prop="receipt_number" label="收款编号" width="200"></el-table-column>
        <el-table-column prop="customer_name" label="客户名称" width="200"></el-table-column>
        <el-table-column prop="receipt_date" label="收款日期" width="110"></el-table-column>
        <el-table-column prop="invoice_number" label="对应发票" width="180">
          <template #default="scope">
            <el-link v-if="scope.row.invoice_number" type="primary" @click="jumpToInvoice(scope.row)">
              {{ scope.row.invoice_number }}
            </el-link>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="total_amount" label="收款金额" width="130" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.total_amount) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)" size="small">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="payment_method" label="收款方式" width="100">
          <template #default="scope">
            {{ scope.row.payment_method }}
          </template>
        </el-table-column>
        <el-table-column prop="notes" label="备注" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column label="操作" min-width="230" fixed="right">
          <template #default="scope">
            <el-button type="info" size="small" @click="handleViewDetail(scope.row)">详情</el-button>
            <el-button v-permission="'finance:ar:update'" 
              v-if="scope.row.status === 'normal'" 
              type="warning" 
              size="small" 
              @click="handleVoid(scope.row)"
            >作废</el-button>
            <el-button v-permission="'finance:ar:view'" type="success" size="small" @click="handlePrint(scope.row)">打印</el-button>
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
      <el-form :model="receiptForm" :rules="receiptRules" ref="receiptFormRef" label-width="100px">
        <el-form-item label="收款编号" prop="receiptNumber">
          <el-input v-model="receiptForm.receiptNumber" placeholder="请输入收款编号"></el-input>
        </el-form-item>
        <el-form-item label="关联发票" prop="invoiceId">
          <el-select 
            v-model="receiptForm.invoiceId" 
            placeholder="请选择关联发票" 
            filterable 
            style="width: 100%"
            @change="handleInvoiceChange"
          >
            <el-option
              v-for="invoice in invoiceOptions"
              :key="invoice.id"
              :label="`${invoice.invoiceNumber} - ${invoice.customerName} - ${formatCurrency(invoice.balance)}`"
              :value="invoice.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="客户" prop="customerName">
          <el-input v-model="receiptForm.customerName" disabled></el-input>
        </el-form-item>
        <el-form-item label="收款日期" prop="receiptDate">
          <el-date-picker
            v-model="receiptForm.receiptDate"
            type="date"
            placeholder="选择收款日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="发票金额">
          <el-input v-model="receiptForm.invoiceAmount" disabled></el-input>
        </el-form-item>
        <el-form-item label="已付金额">
          <el-input v-model="receiptForm.paidAmount" disabled></el-input>
        </el-form-item>
        <el-form-item label="剩余金额">
          <el-input v-model="receiptForm.balance" disabled></el-input>
        </el-form-item>
        <el-form-item label="收款金额" prop="amount">
          <el-input-number v-model="receiptForm.amount" :precision="2" :min="0" :max="receiptForm.balanceValue" style="width: 100%"></el-input-number>
        </el-form-item>
        <el-form-item label="收款方式" prop="paymentMethod">
          <el-select v-model="receiptForm.paymentMethod" placeholder="请选择收款方式" style="width: 100%" @change="handlePaymentMethodChange">
            <el-option label="现金" value="cash"></el-option>
            <el-option label="银行转账" value="bank_transfer"></el-option>
            <el-option label="支票" value="check"></el-option>
            <el-option label="信用卡" value="credit_card"></el-option>
            <el-option label="其他" value="other"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="收款账户" prop="bankAccountId" v-if="showBankAccountField">
          <el-select v-model="receiptForm.bankAccountId" placeholder="选择收款账户" filterable style="width: 100%">
            <el-option 
              v-for="account in bankAccounts"
              :key="account.id"
              :label="`${account.accountName} (${account.accountNumber})`"
              :value="account.id"
            ></el-option>
          </el-select>
          <div class="form-tip"><el-icon style="vertical-align: middle; color: var(--color-primary);"><InfoFilled /></el-icon> 选择后将自动创建银行交易记录并更新账户余额</div>
        </el-form-item>
        <el-form-item label="备注" prop="notes">
          <el-input
            v-model="receiptForm.notes"
            type="textarea"
            :rows="3"
            placeholder="请输入备注信息"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveReceipt" :loading="saveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog
      title="收款记录详情"
      v-model="detailDialogVisible"
      width="650px"
    >
      <el-descriptions :column="2" border>
        <el-descriptions-item label="收款编号">{{ detailData.receipt_number }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(detailData.status)">{{ getStatusText(detailData.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="客户名称">{{ detailData.customer_name }}</el-descriptions-item>
        <el-descriptions-item label="收款日期">{{ detailData.receipt_date }}</el-descriptions-item>
        <el-descriptions-item label="对应发票">
          <el-link v-if="detailData.invoice_number" type="primary" @click="jumpToInvoiceFromDetail">
            {{ detailData.invoice_number }}
          </el-link>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="收款金额">{{ formatCurrency(detailData.total_amount) }}</el-descriptions-item>
        <el-descriptions-item label="收款方式">{{ detailData.payment_method }}</el-descriptions-item>
        <el-descriptions-item label="银行账户">{{ detailData.bank_account_name || '-' }}</el-descriptions-item>
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
      title="作废收款记录"
      v-model="voidDialogVisible"
      width="500px"
    >
      <el-alert
        type="warning"
        :closable="false"
        style="margin-bottom: 20px;"
      >
        <template #title>
          <div style="font-weight: bold;">确认作废该收款记录？</div>
        </template>
        <div style="margin-top: 10px; line-height: 1.6;">
          作废后将执行以下操作：<br>
          ✓ 恢复发票的应收余额<br>
          ✓ 冲销相关的银行交易记录<br>
          ✓ 记录将保留但无法再编辑
        </div>
      </el-alert>
      
      <el-form :model="voidForm" :rules="voidRules" ref="voidFormRef" label-width="100px">
        <el-form-item label="收款编号">
          <el-input v-model="voidForm.receiptNumber" disabled></el-input>
        </el-form-item>
        <el-form-item label="收款金额">
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
          <el-button v-permission="'finance:ar:update'" type="danger" @click="confirmVoid" :loading="voidLoading">确认作废</el-button>
        </span>
      </template>
    </el-dialog>

    <PrintDialog
      v-model="printDialogVisible"
      title="打印收款凭证"
      template-type="ar_receipt"
      :data="printData"
    />
  </div>
</template>

<script setup>
import { DateFormatter, NumberFormatter } from '@/utils/commonHelpers'
import { formatCurrency } from '@/utils/format'

import PrintDialog from '@/components/common/PrintDialog.vue';

import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, ArrowUp, ArrowDown } from '@element-plus/icons-vue';
import { api } from '@/services/api';
import { parsePaginatedData, parseListData } from '@/utils/responseParser';
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

// 发票过滤状态
const currentInvoiceFilter = ref('')
const isFilteredByInvoice = computed(() => !!currentInvoiceFilter.value)

// 清除发票过滤，显示全部收款记录
const clearInvoiceFilter = () => {
  currentInvoiceFilter.value = '';
  // 清除URL参数并重新加载
  router.replace({ path: '/finance/ar/receipts' });
  loadReceipts();
};

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
const dialogTitle = ref('新增收款记录');
const receiptFormRef = ref(null);

// 数据列表
const receiptList = ref([]);
const invoiceOptions = ref([]);
const bankAccounts = ref([]);

// 是否显示银行账户字段
const showBankAccountField = computed(() => {
  return ['bank_transfer', 'credit_card'].includes(receiptForm.paymentMethod);
});

// 搜索表单
const searchForm = reactive({
  receiptNumber: '',
  customerName: '',
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
  receiptNumber: '',
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

// 收款表单
const receiptForm = reactive({
  id: null,
  receiptNumber: '',
  invoiceId: null,
  invoiceNumber: '',
  customerName: '',
  invoiceAmount: '',
  paidAmount: '',
  balance: '',
  balanceValue: 0,
  receiptDate: new Date().toISOString().slice(0, 10),
  amount: 0,
  paymentMethod: 'bank_transfer',
  bankAccountId: null,  // 新增：银行账户ID
  notes: ''
});

// 表单验证规则
const receiptRules = {
  receiptNumber: [
    { required: true, message: '请输入收款编号', trigger: 'blur' }
  ],
  invoiceId: [
    { required: true, message: '请选择关联发票', trigger: 'change' }
  ],
  receiptDate: [
    { required: true, message: '请选择收款日期', trigger: 'change' }
  ],
  amount: [
    { required: true, message: '请输入收款金额', trigger: 'blur' }
  ],
  paymentMethod: [
    { required: true, message: '请选择收款方式', trigger: 'change' }
  ]
};

// 获取收款方式文本
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

// 加载收款记录列表
const loadReceipts = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      receiptNumber: searchForm.receiptNumber,
      customerName: searchForm.customerName,
      startDate: searchForm.dateRange?.[0] || '',
      endDate: searchForm.dateRange?.[1] || '',
      paymentMethod: searchForm.paymentMethod,
      status: searchForm.status, // 添加状态筛选
      invoiceNumber: currentInvoiceFilter.value || ''  // 使用状态变量，支持清除过滤
    };

    const response = await api.get('/finance/ar/receipts', { params });
    // 使用统一的响应解析工具
    const { list, total: totalCount } = parsePaginatedData(response, { enableLog: false });
    receiptList.value = list;
    total.value = totalCount;
  } catch (error) {
    console.error('加载收款记录失败:', error);
    ElMessage.error('加载收款记录失败');
    receiptList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

// 加载银行账户列表
const loadBankAccounts = async () => {
  try {
    const response = await api.get('/finance/baseData/bankAccounts');
    const accounts = parseListData(response, { enableLog: false });
    bankAccounts.value = accounts.map(acc => ({
      id: acc.id,
      accountName: acc.accountName || acc.account_name,
      accountNumber: acc.accountNumber || acc.account_number,
      currentBalance: acc.currentBalance || acc.current_balance
    }));
  } catch (error) {
    console.error('加载银行账户失败:', error);
    ElMessage.warning('加载银行账户失败，部分功能可能受限');
    bankAccounts.value = [];
  }
};

// 加载未付清的发票选项
const loadInvoiceOptions = async () => {
  try {
    // 获取所有发票，然后筛选出未付清的
    const response = await api.get('/finance/ar/invoices', {
      params: {
        page: 1,
        limit: 100, // 获取更多发票以供选择
        status: 'confirmed' // 只获取已确认的发票
      }
    });

    // 使用统一的列表解析工具
    const invoiceList = parseListData(response, { enableLog: false });
    // 筛选出未付清的发票（余额大于0的发票）
    invoiceOptions.value = invoiceList.filter(invoice => {
      const balance = (invoice.amount || 0) - (invoice.paidAmount || 0);
      return balance > 0;
    }).map(invoice => ({
      ...invoice,
      balance: (invoice.amount || 0) - (invoice.paidAmount || 0)
    }));
  } catch (error) {
    console.error('加载发票列表失败:', error);
    ElMessage.error('加载发票列表失败');
    invoiceOptions.value = [];
  }
};

// 处理发票选择变化
const handleInvoiceChange = async () => {
  if (!receiptForm.invoiceId) {
    receiptForm.customerName = '';
    receiptForm.invoiceAmount = '';
    receiptForm.paidAmount = '';
    receiptForm.balance = '';
    receiptForm.balanceValue = 0;
    receiptForm.amount = 0;
    return;
  }
  
  try {
    const response = await api.get(`/finance/ar/invoices/${receiptForm.invoiceId}`);
    const invoice = response.data;
    
    const balance = invoice.amount - invoice.paidAmount;
    
    receiptForm.invoiceNumber = invoice.invoiceNumber;
    receiptForm.customerName = invoice.customerName;
    receiptForm.invoiceAmount = formatCurrency(invoice.amount);
    receiptForm.paidAmount = formatCurrency(invoice.paidAmount);
    receiptForm.balance = formatCurrency(balance);
    receiptForm.balanceValue = balance;
    receiptForm.amount = balance; // 默认填充剩余金额
  } catch (error) {
    console.error('获取发票详情失败:', error);
    ElMessage.error('获取发票详情失败');
  }
};

// 搜索收款记录
const searchReceipts = () => {
  currentPage.value = 1;
  loadReceipts();
};

// 重置搜索条件
const resetSearch = () => {
  searchForm.receiptNumber = '';
  searchForm.customerName = '';
  searchForm.dateRange = [];
  searchForm.paymentMethod = '';
  searchForm.status = ''; // 重置状态筛选
  searchReceipts();
};

// 支付方式变更处理
const handlePaymentMethodChange = () => {
  // 如果切换到非银行类支付方式，清空银行账户选择
  if (!showBankAccountField.value) {
    receiptForm.bankAccountId = null;
  }
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
    const response = await api.get(`/finance/ar/receipts/${row.id}`);
    detailData.value = response.data;
    detailDialogVisible.value = true;
  } catch (error) {
    console.error('获取收款记录详情失败:', error);
    ElMessage.error('获取收款记录详情失败');
  }
};

// 作废收款记录
const handleVoid = (row) => {
  // 重置作废表单
  voidForm.id = row.id;
  voidForm.receiptNumber = row.receipt_number;
  voidForm.amount = formatCurrency(row.total_amount);
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
        await api.post(`/finance/ar/receipts/${voidForm.id}/void`, {
          void_reason: voidForm.voidReason
        });
        
        ElMessage.success('收款记录已成功作废');
        voidDialogVisible.value = false;
        loadReceipts(); // 刷新列表
      } catch (error) {
        console.error('作废收款记录失败:', error);
        ElMessage.error(error.response?.data?.message || '作废收款记录失败');
      } finally {
        voidLoading.value = false;
      }
    }
  });
};

// 跳转到发票详情
const jumpToInvoice = (row) => {
  if (row.invoice_number) {
    router.push({
      path: '/finance/ar/invoices',
      query: { invoiceNumber: row.invoice_number }
    });
  }
};

// 从详情对话框跳转到发票
const jumpToInvoiceFromDetail = () => {
  if (detailData.value.invoice_number) {
    detailDialogVisible.value = false;
    router.push({
      path: '/finance/ar/invoices',
      query: { invoiceNumber: detailData.value.invoice_number }
    });
  }
};

// 新增收款记录
const showAddDialog = async () => {
  dialogTitle.value = '新增收款记录';
  resetReceiptForm();
  
  // 自动生成收款编号
  try {
    const response = await api.get('/finance/ar/receipts/generate-number');
    receiptForm.receiptNumber = response.data.receiptNumber;
  } catch (error) {
    console.error('生成收款编号失败:', error);
    ElMessage.warning('生成收款编号失败，请手动输入');
  }
  
  loadInvoiceOptions();
  loadBankAccounts();  // 加载银行账户
  dialogVisible.value = true;
};

/*
// 编辑收款记录 - 已移除编辑功能，改用作废+重新创建的方式
const handleEdit = async (row) => {
  dialogTitle.value = '编辑收款记录';
  
  try {
    const response = await api.get(`/finance/ar/receipts/${row.id}`);
    const receipt = response.data;
    
    resetReceiptForm();
    await loadInvoiceOptions();
    
    // 填充表单数据
    receiptForm.id = receipt.id;
    receiptForm.receiptNumber = receipt.receiptNumber;
    receiptForm.invoiceId = receipt.invoiceId;
    receiptForm.receiptDate = receipt.receiptDate;
    receiptForm.amount = receipt.amount;
    receiptForm.paymentMethod = receipt.paymentMethod;
    receiptForm.notes = receipt.notes;
    
    // 加载发票信息
    await handleInvoiceChange();
    
    dialogVisible.value = true;
  } catch (error) {
    console.error('获取收款记录详情失败:', error);
    ElMessage.error('获取收款记录详情失败');
  }
};

// 删除收款记录 - 已移除删除功能，改用作废的方式
const handleDelete = (row) => {
  ElMessageBox.confirm('确认要删除该收款记录吗？此操作将影响关联发票的收款状态。', '警告', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await api.delete(`/finance/ar/receipts/${row.id}`);
      ElMessage.success('删除成功');
      loadReceipts();
    } catch (error) {
      console.error('删除收款记录失败:', error);
      ElMessage.error('删除收款记录失败');
    }
  }).catch(() => {});
};
*/

// 打印相关
const printDialogVisible = ref(false);
const printData = ref({});

// 打印收款记录
const handlePrint = async (row) => {
  try {
    // 获取完整详情以包含银行账户等信息
    const response = await api.get(`/finance/ar/receipts/${row.id}`);
    const data = response.data;
    
    // 准备打印数据
    printData.value = {
      receipt_number: data.receipt_number,
      receipt_date: data.receipt_date,
      customer_name: data.customer_name,
      payment_method: data.payment_method,
      bank_account_name: data.bank_account_name || '-',
      bank_account_number: data.bank_account_number || '',
      adjust_amount: data.total_amount, // 用于计算大写，保持原始数值
      amount: NumberFormatter.toThousands(data.total_amount),
      amount_upper: NumberFormatter.digitUppercase(data.total_amount),
      invoice_number: data.invoice_number || '-',
      notes: data.notes || '',
      operator: authStore.user?.name || '管理员',
      print_time: DateFormatter.toDateTime(new Date())
    };
    
    printDialogVisible.value = true;
  } catch (error) {
    console.error('准备打印数据失败:', error);
    ElMessage.error('准备打印数据失败');
  }
};

// 保存收款记录
const saveReceipt = async () => {
  if (!receiptFormRef.value) return;
  
  await receiptFormRef.value.validate(async (valid) => {
    if (valid) {
      saveLoading.value = true;
      try {
        // 准备提交的数据
        const data = {
          id: receiptForm.id,
          receiptNumber: receiptForm.receiptNumber,
          invoiceId: receiptForm.invoiceId,
          receiptDate: receiptForm.receiptDate,
          amount: receiptForm.amount,
          paymentMethod: receiptForm.paymentMethod,
          bankAccountId: receiptForm.bankAccountId,  // 新增：银行账户ID
          notes: receiptForm.notes
        };
        
        if (receiptForm.id) {
          // 更新
          await api.put(`/finance/ar/receipts/${receiptForm.id}`, data);
          ElMessage.success('更新成功');
        } else {
          // 新增
          await api.post('/finance/ar/receipts', data);
          ElMessage.success('添加成功');
        }
        dialogVisible.value = false;
        loadReceipts();
      } catch (error) {
        console.error('保存收款记录失败:', error);
        ElMessage.error('保存收款记录失败');
      } finally {
        saveLoading.value = false;
      }
    }
  });
};

// 重置收款表单
const resetReceiptForm = () => {
  receiptForm.id = null;
  receiptForm.receiptNumber = '';
  receiptForm.invoiceId = null;
  receiptForm.invoiceNumber = '';
  receiptForm.customerName = '';
  receiptForm.invoiceAmount = '';
  receiptForm.paidAmount = '';
  receiptForm.balance = '';
  receiptForm.balanceValue = 0;
  receiptForm.receiptDate = new Date().toISOString().slice(0, 10);
  receiptForm.amount = 0;
  receiptForm.paymentMethod = 'bank_transfer';
  receiptForm.bankAccountId = null;  // 新增：重置银行账户
  receiptForm.notes = '';
  
  // 清除校验
  if (receiptFormRef.value) {
    receiptFormRef.value.resetFields();
  }
};

// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = size;
  loadReceipts();
};

const handleCurrentChange = (page) => {
  currentPage.value = page;
  loadReceipts();
};

// 页面加载时执行
onMounted(() => {
  loadBankAccounts();  // 预加载银行账户列表
  // 检查URL参数是否有发票编号过滤
  const invoiceNumber = route.query.invoiceNumber;
  if (invoiceNumber) {
    currentInvoiceFilter.value = invoiceNumber;  // 设置过滤状态，显示提示条
    searchForm.receiptNumber = ''; // 清空其他搜索条件
    searchForm.customerName = '';
    searchForm.dateRange = [];
    searchForm.paymentMethod = '';
  }
  loadReceipts();
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