<!--
/**
 * Receipts.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page receipts-container">
    <PageHeader title="收款管理" subtitle="从应收发票发起收款，手工录入仅用于例外收款">
      <template #actions>
<el-button v-permission="'finance:ar:receive'" type="info" plain :icon="Plus" @click="showAddDialog">例外收款录入</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :expanded="showAdvancedSearch"
      @update:expanded="showAdvancedSearch = $event"
      @search="searchReceipts"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="收款编号">
          <el-input  v-model="searchForm.receiptNumber" placeholder="输入收款编号" clearable ></el-input>
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input  v-model="searchForm.customerName" placeholder="输入客户名称" clearable ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
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
      </template>
    </FinanceQueryCard>

    <!-- 过滤提示条 - 当通过发票跳转时显示 -->
    <el-alert
      v-if="isFilteredByInvoice"
      :title="`当前只显示发票 ${currentInvoiceFilter} 的收款记录`"
      type="info"
      show-icon
      :closable="false"
      class="mb-20"
    >
      <template #default>
        <el-button type="primary" size="small" @click="clearInvoiceFilter" class="ml-sm">
          查看全部收款记录
        </el-button>
      </template>
    </el-alert>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="receiptList"
        class="table-row-click w-full"
        border
        v-loading="loading"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleViewDetail(row))">
        <el-table-column prop="receiptNumber" label="收款编号" width="200"></el-table-column>
        <el-table-column prop="customerName" label="客户名称" width="200"></el-table-column>
        <el-table-column prop="receiptDate" label="收款日期" width="110"></el-table-column>
        <el-table-column prop="invoiceNumber" label="对应发票" width="180">
          <template #default="scope">
            <el-link v-if="scope.row.invoiceNumber" type="primary" @click="jumpToInvoice(scope.row)">
              {{ scope.row.invoiceNumber }}
            </el-link>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="totalAmount" label="收款金额" width="130">
          <template #default="scope">
            {{ formatCurrency(scope.row.totalAmount) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)" size="small">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="paymentMethod" label="收款方式" width="100">
          <template #default="scope">
            {{ scope.row.paymentMethod }}
          </template>
        </el-table-column>
        <el-table-column prop="notes" label="备注" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column label="操作" min-width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="scope">
            
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
    <AppDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      mode="form"
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
            class="w-full"
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
            class="w-full"
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
          <el-input-number v-model="receiptForm.amount" :precision="2" :min="0" :max="receiptForm.balanceValue" class="w-full"></el-input-number>
        </el-form-item>
        <el-form-item label="收款方式" prop="paymentMethod">
          <el-select v-model="receiptForm.paymentMethod" placeholder="请选择收款方式" class="w-full" @change="handlePaymentMethodChange">
            <el-option label="现金" value="cash"></el-option>
            <el-option label="银行转账" value="bank_transfer"></el-option>
            <el-option label="支票" value="check"></el-option>
            <el-option label="信用卡" value="credit_card"></el-option>
            <el-option label="其他" value="other"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="收款账户" prop="bankAccountId" v-if="showBankAccountField">
          <el-select v-model="receiptForm.bankAccountId" placeholder="选择收款账户" filterable class="w-full">
            <el-option
              v-for="account in bankAccounts"
              :key="account.id"
              :label="`${account.accountName} (${account.accountNumber})`"
              :value="account.id"
            ></el-option>
          </el-select>
          <div class="form-tip"><el-icon class="icon-inline text-primary"><InfoFilled /></el-icon> 选择后将自动创建银行交易记录并更新账户余额</div>
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
          <el-button v-permission="'finance:ar:receive'" type="primary" @click="saveReceipt" :loading="saveLoading">确认</el-button>
        </span>
      </template>
        </AppDialog>

    <!-- 详情对话框 -->
    <AppDialog
      v-model="detailDialogVisible"
      title="收款记录详情"
      mode="view"
      content-width="wide"
      :detail-navigation="receiptViewNavigation"
    >
      <el-descriptions :column="2" border>
        <el-descriptions-item label="收款编号">{{ detailData.receiptNumber }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(detailData.status)">{{ getStatusText(detailData.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="客户名称">{{ detailData.customerName }}</el-descriptions-item>
        <el-descriptions-item label="收款日期">{{ detailData.receiptDate }}</el-descriptions-item>
        <el-descriptions-item label="对应发票">
          <el-link v-if="detailData.invoiceNumber" type="primary" @click="jumpToInvoiceFromDetail">
            {{ detailData.invoiceNumber }}
          </el-link>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="收款金额">{{ formatCurrency(detailData.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="收款方式">{{ detailData.paymentMethod }}</el-descriptions-item>
        <el-descriptions-item label="银行账户">{{ detailData.bankAccountName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detailData.notes || '-' }}</el-descriptions-item>

        <!-- 如果已作废，显示作废信息 -->
        <template v-if="detailData.status === 'void'">
          <el-descriptions-item label="作废时间">{{ detailData.voidedAt }}</el-descriptions-item>
          <el-descriptions-item label="作废人">{{ detailData.voidedByName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="作废原因" :span="2">{{ detailData.voidReason }}</el-descriptions-item>
        </template>
      </el-descriptions>
    </AppDialog>

    <!-- 作废对话框 -->
    <AppDialog
      v-model="voidDialogVisible"
      title="作废收款记录"
      mode="form"
      width="500px"
    >
      <el-alert
        type="warning"
        :closable="false"
        class="mb-20"
      >
        <template #title>
          <div class="font-weight-700">确认作废该收款记录？</div>
        </template>
        <div class="mt-10 line-height-tight">
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
        </AppDialog>

    <PrintDialog
      v-model="printDialogVisible"
      title="打印收款凭证"
      template-type="ar_receipt"
      :data="printData"
    />
  </div>
</template>

<script setup>
import { getCommonStatusText, getCommonStatusColor } from '@/constants/systemConstants'
import { handleTableRowView } from '@/utils/tableRowView'
import { DateFormatter, NumberFormatter } from '@/utils/commonHelpers'
import { formatCurrency, formatLocalDate } from '@/utils/format'

import PrintDialog from '@/components/common/PrintDialog.vue';

import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { financeApi } from '@/api/finance';
import { parsePaginatedData, parseListData } from '@/utils/responseParser';
import { useListDetailNavigation } from '@/composables/useListDetailNavigation';
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
const dialogTitle = ref('例外收款录入');
const receiptFormRef = ref(null);

// 数据列表
const receiptList = ref([]);
const {
  previousItem: previousViewReceipt,
  nextItem: nextViewReceipt,
  hasPrevious: hasPreviousViewReceipt,
  hasNext: hasNextViewReceipt,
  setCurrentItem: setCurrentViewReceipt
} = useListDetailNavigation(receiptList);
const invoiceOptions = ref([]);
const bankAccounts = ref([]);

// 是否显示银行账户字段
const showBankAccountField = computed(() => {
  return ['bank_transfer', 'credit_card', 'check'].includes(receiptForm.paymentMethod);
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
const detailLoading = ref(false);

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
  receiptDate: formatLocalDate(new Date()),
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
  ],
  bankAccountId: [
    {
      validator: (rule, value, callback) => {
        if (['bank_transfer', 'credit_card', 'check'].includes(receiptForm.paymentMethod) && !value) {
          callback(new Error('请选择收款账户'));
        } else {
          callback();
        }
      },
      trigger: 'change'
    }
  ]
};

// 获取收款方式文本
;

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

    const response = await financeApi.getReceipts(params);
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
    const response = await financeApi.getBankAccounts();
    const accounts = parseListData(response, { enableLog: false });
    bankAccounts.value = accounts.map(acc => ({
      id: acc.id,
      accountName: acc.accountName,
      accountNumber: acc.accountNumber,
      currentBalance: acc.currentBalance
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
    const response = await financeApi.getUnpaidReceiptInvoices();

    // 使用统一的列表解析工具
    const invoiceList = parseListData(response, { enableLog: false });
    invoiceOptions.value = invoiceList.map(invoice => {
      const amount = parseFloat(invoice.amount ?? invoice.totalAmount ?? 0);
      const paidAmount = parseFloat(invoice.paidAmount ?? 0);
      const balance = parseFloat(invoice.balanceAmount ?? invoice.balance ?? (amount - paidAmount));
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        customerId: invoice.customerId,
        amount,
        paidAmount,
        balance,
      };
    });
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
    const response = await financeApi.getARInvoice(receiptForm.invoiceId);
    const invoice = response.data;

    const amount = parseFloat(invoice.amount ?? invoice.totalAmount ?? 0);
    const paidAmount = parseFloat(invoice.paidAmount ?? 0);
    const balance = parseFloat(invoice.balanceAmount ?? invoice.balance ?? (amount - paidAmount));

    receiptForm.invoiceNumber = invoice.invoiceNumber;
    receiptForm.customerName = invoice.customerName;
    receiptForm.invoiceAmount = formatCurrency(amount);
    receiptForm.paidAmount = formatCurrency(paidAmount);
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
const getStatusType = (status) => getCommonStatusColor(status) || 'info';

// 获取状态文本
const getStatusText = (status) => getCommonStatusText(status) || status;

// 查看详情
const handleViewDetail = async (row) => {
  if (detailLoading.value) return;

  detailLoading.value = true;
  try {
    const response = await financeApi.getReceipt(row.id);
    detailData.value = response.data;
    setCurrentViewReceipt(row);
    detailDialogVisible.value = true;
  } catch (error) {
    console.error('获取收款记录详情失败:', error);
    ElMessage.error('获取收款记录详情失败');
  } finally {
    detailLoading.value = false;
  }
};

const handleViewPrevious = () => {
  if (previousViewReceipt.value) handleViewDetail(previousViewReceipt.value);
};

const handleViewNext = () => {
  if (nextViewReceipt.value) handleViewDetail(nextViewReceipt.value);
};

const receiptViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewReceipt.value,
  hasNext: hasNextViewReceipt.value,
  loading: detailLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext
}));

// 作废收款记录
const handleVoid = (row) => {
  // 重置作废表单
  voidForm.id = row.id;
  voidForm.receiptNumber = row.receiptNumber;
  voidForm.amount = formatCurrency(row.totalAmount);
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
        await financeApi.voidReceipt(voidForm.id, {
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
  if (row.invoiceNumber) {
    router.push({
      path: '/finance/ar/invoices',
      query: { invoiceNumber: row.invoiceNumber }
    });
  }
};

// 从详情对话框跳转到发票
const jumpToInvoiceFromDetail = () => {
  if (detailData.value.invoiceNumber) {
    detailDialogVisible.value = false;
    router.push({
      path: '/finance/ar/invoices',
      query: { invoiceNumber: detailData.value.invoiceNumber }
    });
  }
};

// 新增收款记录
const showAddDialog = async () => {
  dialogTitle.value = '例外收款录入';
  resetReceiptForm();

  // 自动生成收款编号
  try {
    const response = await financeApi.generateReceiptNumber();
    receiptForm.receiptNumber = response.data.receiptNumber;
  } catch (error) {
    console.error('生成收款编号失败:', error);
    ElMessage.warning('生成收款编号失败，请手动输入');
  }

  loadInvoiceOptions();
  loadBankAccounts();  // 加载银行账户
  dialogVisible.value = true;
};

// 打印相关
const printDialogVisible = ref(false);
const printData = ref({});

// 打印收款记录
const handlePrint = async (row) => {
  try {
    // 获取完整详情以包含银行账户等信息
    const response = await financeApi.getReceipt(row.id);
    const data = response.data;

    const operatorName =
      authStore.realName ||
      authStore.user?.realName ||
      authStore.user?.realName ||
      authStore.user?.name ||
      authStore.user?.username ||
      '-';

    // 准备打印数据（camel；printService 会 normalize）
    printData.value = {
      receiptNumber: data.receiptNumber,
      receiptDate: data.receiptDate,
      customerName: data.customerName,
      paymentMethod: data.paymentMethod,
      bankAccountName: data.bankAccountName || '-',
      bankAccountNumber: data.bankAccountNumber || '',
      adjustAmount: data.totalAmount,
      amount: NumberFormatter.toThousands(data.totalAmount),
      amountUpper: NumberFormatter.digitUppercase(data.totalAmount),
      invoiceNumber: data.invoiceNumber || '-',
      notes: data.notes || '',
      operator: operatorName,
      printTime: DateFormatter.toDateTime(new Date())
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

        await financeApi.createReceipt(data);
        ElMessage.success('添加成功');
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
  receiptForm.receiptDate = formatLocalDate(new Date());
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
