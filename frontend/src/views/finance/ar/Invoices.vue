<!--
/**
 * Invoices.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page invoices-container">
    <SettlementRecoveryDialog v-model="settlementRecoveryVisible" kind="receipt" :request="settlementRequest" @resolved="loadInvoices" />
    <PageHeader title="应收发票" subtitle="管理销售发票与核销">
      <template #actions>
        <el-button
          type="primary"
          :icon="Plus"
          @click="showAddDialog"
          v-permission="'finance:ar:create'"
        >
          新增发票
        </el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :expanded="showAdvancedSearch"
      :loading="loading"
      @update:expanded="showAdvancedSearch = $event"
      @search="searchInvoices"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="发票编号">
          <el-input
            v-model="searchForm.invoiceNumber"
            placeholder="输入发票编号"
            clearable
          ></el-input>
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input
            v-model="searchForm.customerName"
            placeholder="输入客户名称"
            clearable
          ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="开票日期">
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
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="选择状态" clearable>
            <el-option label="草稿" value="草稿"></el-option>
            <el-option label="已确认" value="已确认"></el-option>
            <el-option label="部分收款" value="部分付款"></el-option>
            <el-option label="已收款" value="已付款"></el-option>
            <el-option label="已逾期" value="已逾期"></el-option>
            <el-option label="已取消" value="已取消"></el-option>
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <div class="table-container">
        <el-table
          :data="invoiceList"
          class="table-row-click table-full-width"
          border
          v-loading="loading"
          @row-click="
            (row, column, event) =>
              handleTableRowView(row, column, event, () => handleViewDetails(row))
          "
        >
          <template #empty>
            <EmptyState description="暂无发票数据" />
          </template>
          <el-table-column prop="invoiceNumber" label="发票编号" width="180">
            <template #default="{ row }">
              <el-link
                v-if="row.relatedOrderId || row.relatedOrderNo"
                type="primary"
                :underline="false"
                @click="openRelatedSalesOrderDialog(row)"
                :title="
                  row.relatedOrderNo ? `查看销售订单 ${row.relatedOrderNo}` : '查看关联销售订单'
                "
              >
                {{ row.invoiceNumber }}
              </el-link>
              <span v-else>{{ row.invoiceNumber }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="customerName" label="客户名称" min-width="160" />
          <el-table-column prop="invoiceDate" label="开票日期" width="110" />
          <el-table-column prop="dueDate" label="到期日期" width="110" />
          <el-table-column prop="totalAmount" label="价税合计" width="120">
            <template #default="scope">
              {{ formatSettlementAmount(scope.row.totalAmount, scope.row) }}
            </template>
          </el-table-column>
          <el-table-column prop="amountExcludingTax" label="未税" width="110">
            <template #default="scope">
              {{ formatSettlementAmount(scope.row.amountExcludingTax, scope.row) }}
            </template>
          </el-table-column>
          <el-table-column prop="taxAmount" label="税额" width="100">
            <template #default="scope">
              {{ formatSettlementAmount(scope.row.taxAmount, scope.row) }}
            </template>
          </el-table-column>
          <el-table-column prop="paidAmount" label="已收金额" width="120">
            <template #default="scope">
              {{ formatSettlementAmount(scope.row.paidAmount, scope.row) }}
            </template>
          </el-table-column>
          <el-table-column prop="balanceAmount" label="剩余金额" width="120">
            <template #default="scope">
              {{ formatSettlementAmount(scope.row.balanceAmount, scope.row) }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="scope">
              <el-tag :type="getStatusType(scope.row)">
                {{ getStatusText(scope.row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            min-width="340"
            fixed="right"
            align="left"
            header-align="left"
            class-name="operation-column"
            header-class-name="operation-column-header"
          >
            <template #default="scope">
              <CreditNoteActions kind="ar" :invoice="scope.row" @changed="loadInvoices" />
              <el-button
                v-if="scope.row.status === '草稿'"
                type="primary"
                size="small"
                :loading="editLoading" @click="handleEdit(scope.row)"
                v-permission="'finance:ar:update'"
              >
                编辑
              </el-button>
              <el-button
                v-if="scope.row.status === '草稿'"
                type="success"
                size="small"
                :disabled="statusChanging" @click="handleStatusChange(scope.row, '已确认')"
                v-permission="'finance:ar:approve'"
              >
                确认
              </el-button>
              <el-button
                v-if="
                  scope.row.status === '草稿' ||
                  (['已确认', '已逾期'].includes(scope.row.status) &&
                    Math.abs(Number(scope.row.paidAmount || 0)) < 0.005)
                "
                type="warning"
                size="small"
                :disabled="statusChanging" @click="handleStatusChange(scope.row, '已取消')"
                v-permission="'finance:ar:approve'"
              >
                取消
              </el-button>
              <el-button
                v-if="
                  ['已确认', '部分付款', '已逾期'].includes(scope.row.status) &&
                  scope.row.balanceAmount > 0
                "
                type="success"
                size="small"
                @click="handleRecordPayment(scope.row)"
                v-permission="'finance:ar:receive'"
              >
                收款
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="PAGE_SIZE_OPTIONS"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(parseInt(total) || 0, 0)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 添加/编辑对话框 -->
    <InvoiceFormDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :form="invoiceForm"
      :customer-options="customerOptions"
      :product-options="productOptions"
      :customer-loading="customerOptionsLoading"
      :product-loading="productOptionsLoading"
      :save-loading="saveLoading"
      ref="invoiceFormDialogRef"
      @customer-search="loadCustomerOptions"
      @product-search="loadProductOptions"
      @save="saveInvoice"
    />

    <!-- 记录收款对话框 -->
    <PaymentDialog
      ref="paymentDialogRef"
      v-model="paymentDialogVisible"
      :form="paymentForm"
      :bank-accounts="bankAccounts"
      :bank-accounts-loading="bankAccountsLoading"
      :bank-accounts-error="bankAccountsError"
      @retry-bank-accounts="loadBankAccounts"
      :save-loading="savePaymentLoading"
      :retry-notice="settlementRetryNotice"
      @save="savePayment"
    />

    <!-- 发票详情对话框 -->
    <InvoiceDetailDialog
      v-model="detailsDialogVisible"
      :invoice="invoiceDetails"
      :history-loading="historyLoading"
      :history-error="historyError"
      :get-status-type="getStatusType"
      :get-status-text="getStatusText"
      @print="handlePrint"
      @retry-history="loadInvoiceHistory"
    />

    <!-- 关联销售订单预览（与发票详情同一 AppDialog 风格） -->
    <RelatedOrderDialog
      v-model="relatedOrderDialogVisible"
      kind="sales"
      :loading="relatedOrderLoading"
      :invoice-number="relatedOrderContext.invoiceNumber"
      :partner-name="relatedOrderContext.customerName"
      :related-order-id="relatedOrderContext.relatedOrderId"
      :related-order-no="relatedOrderContext.relatedOrderNo"
      :order="relatedOrderDetail"
      @jump="jumpToRelatedSalesOrder"
    />
  </div>
</template>
<script setup>
import { loadSettlementBankAccounts } from '../components/loadSettlementBankAccounts'
import { formatSettlementAmount, settlementCurrencyFields, settlementValidationError } from '../components/settlementCurrency'
import { PAGE_SIZE_OPTIONS } from '@/config/pagination'
import { getThemeDefaultPageSize } from '@/utils/themePageSize'
import { getCommonStatusText, getCommonStatusColor } from '@/constants/systemConstants';
import { handleTableRowView } from '@/utils/tableRowView';
import { formatCurrency, formatLocalDate } from '@/utils/format';
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { Plus } from '@element-plus/icons-vue';
import { financeApi } from '@/api/finance';
import { salesApi } from '@/api/sales';
import { parseListData, parsePaginatedData, parseResponseData } from '@/utils/responseParser';
import { searchCustomerPageOptions, searchMaterialPageOptions } from '@/utils/optionLoaders';
import logger from '@/utils/logger';
import { useFinanceStore } from '@/stores/finance';
import { storeToRefs } from 'pinia';
import printService from '@/services/printService';
import InvoiceFormDialog from './components/InvoiceFormDialog.vue';
import PaymentDialog from './components/PaymentDialog.vue';
import InvoiceDetailDialog from './components/InvoiceDetailDialog.vue';
import RelatedOrderDialog from '../components/RelatedOrderDialog.vue';
import CreditNoteActions from '../components/CreditNoteActions.vue';
import { useSettlementRequest } from '../components/useSettlementRequest';
import SettlementRecoveryDialog from '../components/SettlementRecoveryDialog.vue';
import { getApiErrorMessage } from '@/utils/errorHandler';
const financeStore = useFinanceStore();
const { defaultVATRate } = storeToRefs(financeStore);
const router = useRouter();
const route = useRoute();

const relatedOrderDialogVisible = ref(false);
const relatedOrderLoading = ref(false);
const relatedOrderDetail = ref(null);
const relatedOrderContext = reactive({
  invoiceNumber: '',
  customerName: '',
  relatedOrderId: null,
  relatedOrderNo: '',
});

/** 点击发票编号 → 弹窗展示关联销售订单 */
const openRelatedSalesOrderDialog = async (row) => {
  if (!row?.relatedOrderId && !row?.relatedOrderNo) {
    ElMessage.warning('该发票未关联销售订单');
    return;
  }
  relatedOrderContext.invoiceNumber = row.invoiceNumber || '';
  relatedOrderContext.customerName = row.customerName || '';
  relatedOrderContext.relatedOrderId = row.relatedOrderId || null;
  relatedOrderContext.relatedOrderNo = row.relatedOrderNo || '';
  relatedOrderDetail.value = null;
  relatedOrderDialogVisible.value = true;
  relatedOrderLoading.value = true;
  try {
    let orderId = row.relatedOrderId;
    if (!orderId && row.relatedOrderNo) {
      const listRes = await salesApi.getOrders({
        search: row.relatedOrderNo,
        page: 1,
        pageSize: 5,
      });
      const list = parseListData(listRes, { enableLog: false }) || [];
      const hit =
        list.find((o) => String(o.orderNo || '') === String(row.relatedOrderNo)) || list[0];
      orderId = hit?.id;
      if (hit?.orderNo) relatedOrderContext.relatedOrderNo = hit.orderNo;
      if (hit?.id) relatedOrderContext.relatedOrderId = hit.id;
    }
    if (!orderId) {
      ElMessage.warning('未找到对应销售订单详情');
      return;
    }
    const res = await salesApi.getOrder(orderId);
    relatedOrderDetail.value = parseResponseData(res, null) || res?.data || null;
    if (relatedOrderDetail.value?.id) {
      relatedOrderContext.relatedOrderId = relatedOrderDetail.value.id;
    }
    if (relatedOrderDetail.value?.orderNo) {
      relatedOrderContext.relatedOrderNo = relatedOrderDetail.value.orderNo;
    }
  } catch (error) {
    logger.error('加载关联销售订单失败:', error);
    ElMessage.error(getApiErrorMessage(error, '加载销售订单失败'));
  } finally {
    relatedOrderLoading.value = false;
  }
};

/** 对话框底部：跳转销售订单列表并筛选 */
const jumpToRelatedSalesOrder = () => {
  if (!relatedOrderContext.relatedOrderId && !relatedOrderContext.relatedOrderNo) {
    ElMessage.warning('无关联销售订单可跳转');
    return;
  }
  relatedOrderDialogVisible.value = false;
  router.push({
    path: '/sales/orders',
    query: {
      ...(relatedOrderContext.relatedOrderId
        ? { orderId: String(relatedOrderContext.relatedOrderId) }
        : {}),
      ...(relatedOrderContext.relatedOrderNo
        ? { orderNo: String(relatedOrderContext.relatedOrderNo) }
        : {}),
    },
  });
};
// 权限计算属性
// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);
const statusChanging = ref(false);
const editLoading = ref(false);
let editRequest = 0;
const savePaymentLoading = ref(false);
const settlementRequest = useSettlementRequest('receipt');
const settlementRecoveryVisible = ref(false);
const { retryNotice: settlementRetryNotice } = settlementRequest;
// 分页相关
const total = ref(0);
const pageSize = ref(getThemeDefaultPageSize(10));
const currentPage = ref(1);
const showAdvancedSearch = ref(false);
// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('新增销售发票');
const invoiceFormDialogRef = ref(null);
const paymentDialogVisible = ref(false);
const paymentDialogRef = ref(null);
const bankAccounts = ref([]);
const bankAccountsLoading = ref(false);
const bankAccountsError = ref('');

const detailsDialogVisible = ref(false);
const historyLoading = ref(false);
const historyError = ref('');
let detailRequest = 0;
let historyRequest = 0;
const invoiceDetails = reactive({
  id: null,
  invoiceNumber: '',
  customerName: '',
  customerId: null,
  invoiceDate: '',
  dueDate: '',
  totalAmount: 0,
  amountExcludingTax: 0,
  taxAmount: 0,
  paidAmount: 0,
  balanceAmount: 0,
  status: '',
  approvedBy: null,
  approvedByName: '',
  approvedAt: '',
  createdAt: '',
  notes: '',
  items: [],
  payments: [],
});
// 数据列表
const invoiceList = ref([]);
const customerOptions = ref([]);
const productOptions = ref([]);
const customerOptionsLoading = ref(false);
const productOptionsLoading = ref(false);
let customerSearchRequest = 0;
let productSearchRequest = 0;
// 搜索表单
const searchForm = reactive({
  invoiceNumber: '',
  customerName: '',
  dateRange: [],
  status: '',
});
// 发票表单（API camelCase 契约）
const invoiceForm = reactive({
  currencyCode: 'CNY',
  exchangeRate: 1,
  id: null,
  invoiceNumber: '',
  customerId: null,
  invoiceDate: formatLocalDate(new Date()),
  dueDate: '',
  items: [],
  notes: '',
  taxRate: defaultVATRate.value,
});
// 收款表单
const paymentForm = reactive({
  currencyCode: 'CNY',
  exchangeRate: 1,
  invoiceId: null,
  invoiceNumber: '',
  customerName: '',
  totalAmount: '',
  paidAmount: '',
  balanceAmount: '',
  balanceValue: 0,
  paymentDate: formatLocalDate(new Date()),
  amount: 0,
  paymentMethod: 'bank_transfer',
  bankAccountId: null,
  notes: '',
});

// 获取状态类型
const getStatusType = (invoice) =>
  getCommonStatusColor(typeof invoice === 'object' ? invoice?.status : invoice) || 'info';
// 获取状态文本
const getStatusText = (invoice) => {
  const status = typeof invoice === 'object' ? invoice?.status : invoice;
  return ({ '部分付款': '部分收款', '已付款': '已收款' })[status] || getCommonStatusText(status) || status || '草稿';
};
// 添加发票明细项（用于编辑时的默认项）
const addInvoiceItem = () => {
  invoiceForm.items.push({
    productId: null,
    description: '',
    quantity: 1,
    unitPrice: 0,
    amount: 0,
  });
};
// 自动生成发票编号
// 加载发票列表
const loadInvoices = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      invoiceNumber: searchForm.invoiceNumber,
      customerName: searchForm.customerName,
      startDate: searchForm.dateRange?.[0] || '',
      endDate: searchForm.dateRange?.[1] || '',
      status: searchForm.status,
    };

    const response = await financeApi.getARInvoices(params);
    const { list, total: totalCount } = parsePaginatedData(response, { enableLog: false });
    invoiceList.value = list;
    total.value = totalCount;

    if (list.length === 0) {
      ElMessage.info('未找到符合条件的发票数据');
    }
  } catch (error) {
    logger.error('加载发票列表失败:', error);
    ElMessage.error('加载发票列表失败：' + (getApiErrorMessage(error, '未知错误')));
    invoiceList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};
// 加载客户选项
const loadCustomerOptions = async (keyword = '') => {
  const requestId = ++customerSearchRequest;
  customerOptionsLoading.value = true;
  try {
    const customers = await searchCustomerPageOptions(keyword);
    if (requestId !== customerSearchRequest) return;
    const selected = customerOptions.value.filter(customer => customer.id === invoiceForm.customerId);
    customerOptions.value = [...selected, ...customers.filter(customer => !selected.some(item => item.id === customer.id))];
  } catch (error) {
    if (requestId !== customerSearchRequest) return;
    logger.error('加载客户列表失败:', error);
    ElMessage.error('加载客户列表失败');
  } finally {
    if (requestId === customerSearchRequest) customerOptionsLoading.value = false;
  }
};
// 加载产品选项
const loadProductOptions = async (keyword = '') => {
  const requestId = ++productSearchRequest;
  productOptionsLoading.value = true;
  try {
    const products = await searchMaterialPageOptions(keyword, { type: 'finished' });
    if (requestId !== productSearchRequest) return;
    const selectedIds = new Set(invoiceForm.items.map(item => item.productId));
    const selected = productOptions.value.filter(product => selectedIds.has(product.id));
    productOptions.value = [...selected, ...products.filter(product => !selected.some(item => item.id === product.id))];
  } catch (error) {
    if (requestId !== productSearchRequest) return;
    logger.error('加载产品列表失败:', error);
    ElMessage.error('加载产品列表失败');
  } finally {
    if (requestId === productSearchRequest) productOptionsLoading.value = false;
  }
};
// 搜索发票
const searchInvoices = () => {
  currentPage.value = 1;
  loadInvoices();
};
// 重置搜索条件
const resetSearch = () => {
  searchForm.invoiceNumber = '';
  searchForm.customerName = '';
  searchForm.dateRange = [];
  searchForm.status = '';
  searchInvoices();
};
// 新增发票
const showAddDialog = () => {
  if (saveLoading.value) return;
  editRequest += 1;
  editLoading.value = false;
  dialogTitle.value = '新增销售发票';
  resetInvoiceForm();
  // 添加默认一个明细项
  addInvoiceItem();
  dialogVisible.value = true;
};
const handleStatusChange = async (row, status) => {
  if (statusChanging.value) return;
  statusChanging.value = true;
  const actionText = status === '已确认' ? '确认' : '取消';
  const isCancelConfirmed = status === '已取消' && ['已确认', '已逾期'].includes(row.status);
  const invNo = row.invoiceNumber;
  const confirmMsg = isCancelConfirmed
    ? `确定取消已确认发票 ${invNo} 吗？将冲销关联会计凭证并释放来源单据，未收款发票才可取消。`
    : `确定要${actionText}发票 ${invNo} 吗？`;
  try {
    await ElMessageBox.confirm(confirmMsg, `${actionText}发票`, {
      type: status === '已确认' ? 'success' : 'warning',
    });
    await financeApi.updateARInvoiceStatus(row.id, { status });
    ElMessage.success(
      isCancelConfirmed
        ? '发票已取消，关联凭证已冲销'
        : `发票已${status === '已确认' ? '确认' : '取消'}`
    );
    await loadInvoices();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '状态更新失败'));
  } finally {
    statusChanging.value = false;
  }
};
// 编辑发票
const handleEdit = async (row) => {
  if (saveLoading.value) return;
  const request = ++editRequest;
  editLoading.value = true;
  dialogTitle.value = '编辑销售发票';

  try {
    // 获取发票基本信息
    const response = await financeApi.getARInvoice(row.id);
    if (request !== editRequest) return;
    const invoice = response.data;

    resetInvoiceForm();

    Object.assign(invoiceForm, settlementCurrencyFields(invoice), { status: invoice.status });
    invoiceForm.id = invoice.id;
    invoiceForm.invoiceNumber = invoice.invoiceNumber;
    invoiceForm.customerId = invoice.customerId != null ? parseInt(invoice.customerId, 10) : null;
    if (invoiceForm.customerId && !customerOptions.value.some(customer => customer.id === invoiceForm.customerId)) {
      customerOptions.value.push({ id: invoiceForm.customerId, name: invoice.customerName });
    }
    invoiceForm.invoiceDate = invoice.invoiceDate;
    invoiceForm.dueDate = invoice.dueDate;
    invoiceForm.notes = invoice.notes || '';
    invoiceForm.taxRate = invoice.taxRate != null ? invoice.taxRate : defaultVATRate.value;

    if (invoice.items && Array.isArray(invoice.items)) {
      for (const item of invoice.items) {
        const id = Number(item.productId);
        if (id && !productOptions.value.some(product => product.id === id)) {
          productOptions.value.push({ id, code: item.productCode, name: item.productName, price: item.unitPrice });
        }
      }
      invoiceForm.items = invoice.items.map((item) => ({
        id: item.id,
        productId: item.productId != null ? parseInt(item.productId, 10) : null,
        description: item.description || '',
        quantity: parseFloat(item.quantity) || 0,
        unitPrice: parseFloat(item.unitPrice) || 0,
        amount: parseFloat(item.amount) || 0,
      }));
      if (invoiceForm.items.length === 0) addInvoiceItem();
    } else {
      addInvoiceItem();
    }

    dialogVisible.value = true;
  } catch (error) {
    if (request !== editRequest) return;
    logger.error('获取发票详情失败:', error);
    ElMessage.error('获取发票详情失败，请重试：' + getApiErrorMessage(error, '未知错误'));
  } finally {
    if (request === editRequest) editLoading.value = false;
  }
};
// 查看明细
const handleViewDetails = async (row) => {
  const request = ++detailRequest;
  historyRequest++;
  try {
    const response = await financeApi.getARInvoice(row.id);
    if (request !== detailRequest) return;
    const invoice = response.data;
    Object.keys(invoiceDetails).forEach(key => { delete invoiceDetails[key]; });
    Object.assign(invoiceDetails, invoice, settlementCurrencyFields(invoice), {
      items: Array.isArray(invoice.items) ? invoice.items : [], payments: [],
    });
    detailsDialogVisible.value = true;
    await loadInvoiceHistory();
  } catch (error) {
    if (request !== detailRequest) return;
    logger.error('获取发票详情失败:', error);
    ElMessage.error('获取发票详情失败: ' + (getApiErrorMessage(error, '未知错误')));
  }
};
const loadInvoiceHistory = async () => {
  const invoiceId = invoiceDetails.id;
  if (!invoiceId) return;
  const request = ++historyRequest;
  historyLoading.value = true;
  historyError.value = '';
  try {
    const response = await financeApi.getARInvoicePayments(invoiceId);
    if (request !== historyRequest) return;
    invoiceDetails.payments = parseListData(response, { enableLog: false });
  } catch (error) {
    if (request !== historyRequest) return;
    historyError.value = getApiErrorMessage(error, '核销记录加载失败，请重试');
  } finally {
    if (request === historyRequest) historyLoading.value = false;
  }
};
watch(detailsDialogVisible, visible => {
  if (!visible) { detailRequest++; historyRequest++; historyLoading.value = false; }
});
// 加载银行账户列表
const loadBankAccounts = async () => {
  if (bankAccountsLoading.value) return;
  bankAccountsLoading.value = true;
  bankAccountsError.value = '';
  try {
    bankAccounts.value = await loadSettlementBankAccounts(financeApi);
  } catch (error) {
    logger.error('加载银行账户失败:', error);
    bankAccounts.value = [];
    bankAccounts.value = [];
    bankAccountsError.value = getApiErrorMessage(error, '银行账户加载失败，请重试');
  } finally {
    bankAccountsLoading.value = false;
  }
};

// 记录收款
const handleRecordPayment = async (row) => {
  if (savePaymentLoading.value) return;
  const retryPayload = settlementRequest.begin();
  if (retryPayload) {
    settlementRecoveryVisible.value = true;
    return;
  }
  const balance = parseFloat(row.balanceAmount) || 0;

  Object.assign(paymentForm, settlementCurrencyFields(row));
  paymentForm.invoiceId = row.id;
  paymentForm.invoiceNumber = row.invoiceNumber;
  paymentForm.customerName = row.customerName;
  paymentForm.totalAmount = formatSettlementAmount(row.totalAmount, row);
  paymentForm.paidAmount = formatSettlementAmount(row.paidAmount, row);
  paymentForm.balanceAmount = formatSettlementAmount(balance, paymentForm);
  paymentForm.balanceValue = balance;
  paymentForm.amount = balance;
  paymentForm.paymentMethod = 'bank_transfer';
  paymentForm.paymentDate = formatLocalDate(new Date());
  paymentForm.notes = '';
  paymentForm.bankAccountId = null;

  // 加载银行账户列表
  await loadBankAccounts();

  paymentDialogVisible.value = true;
};
// 查看发票关联的收款记录
// 保存发票
const saveInvoice = async () => {
  if (!invoiceFormDialogRef.value || saveLoading.value) return;

  // 至少有一个明细项
  if (invoiceForm.items.length === 0) {
    ElMessage.warning('请至少添加一个发票明细项');
    return;
  }

  // 每个明细项都需要填写完整
  for (const item of invoiceForm.items) {
    if (!item.productId || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 ||
      !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) <= 0) {
      ElMessage.warning('请确保所有明细项的产品、数量和单价都已填写完整');
      return;
    }
  }

  saveLoading.value = true;
  try {
    if (!(await invoiceFormDialogRef.value.validate().catch(() => false))) return;
        if (!invoiceForm.id && !invoiceForm.invoiceNumber) {
          const response = await financeApi.generateARInvoiceNumber();
          invoiceForm.invoiceNumber = parseResponseData(response, null)?.invoiceNumber || '';
          if (!invoiceForm.invoiceNumber) throw new Error('生成发票编号失败');
        }
        // 准备提交的数据
        // 对外契约：仅 camelCase（Controller fromInvoiceApi 入模）
        const data = {
          id: invoiceForm.id,
          invoiceNumber: invoiceForm.invoiceNumber,
          customerId: invoiceForm.customerId,
          invoiceDate: invoiceForm.invoiceDate,
          dueDate: invoiceForm.dueDate,
          notes: invoiceForm.notes,
          taxRate: invoiceForm.taxRate,
          currencyCode: invoiceForm.currencyCode,
          exchangeRate: invoiceForm.exchangeRate,
          totalAmount: invoiceFormDialogRef.value?.calculateTotal() || 0,
          items: invoiceForm.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            description: item.description,
            quantity: parseFloat(item.quantity),
            unitPrice: parseFloat(item.unitPrice),
            amount: parseFloat(item.amount),
          })),
        };

        if (invoiceForm.id) {
          // 更新
          await financeApi.updateARInvoice(invoiceForm.id, data);
          ElMessage.success('更新成功');
        } else {
          // 新增
          await financeApi.createARInvoice(data);
          ElMessage.success('添加成功');
        }

        dialogVisible.value = false;
        loadInvoices();
      } catch (error) {
        logger.error('保存发票失败:', error);
        ElMessage.error(
          `保存发票失败: ${getApiErrorMessage(error, '请稍后重试')}`
        );
  } finally {
    saveLoading.value = false;
  }
};
// 保存收款记录
const savePayment = async () => {
  if (!paymentDialogRef.value || savePaymentLoading.value) return;

  const settlementError = settlementValidationError(paymentForm, bankAccounts.value);
  if (settlementError) { ElMessage.warning(settlementError); return; }
  savePaymentLoading.value = true;
  try {
    if (!(await paymentDialogRef.value.validate().catch(() => false))) return;
        // 准备提交的数据
        const _data = {
          invoiceId: paymentForm.invoiceId,
          receiptDate: paymentForm.paymentDate, // 后端期望 receiptDate
          amount: paymentForm.amount,
          currencyCode: paymentForm.currencyCode,
          exchangeRate: paymentForm.exchangeRate,
          paymentMethod: paymentForm.paymentMethod,
          bankAccountId: paymentForm.bankAccountId || null, // 添加银行账户ID
          notes: paymentForm.notes,
        };

        // 发送请求
        await settlementRequest.submit(_data, financeApi.createReceipt, paymentForm, bankAccounts.value);

        ElMessage.success('收款记录已保存');

        paymentDialogVisible.value = false;
        loadInvoices();
      } catch (error) {
        logger.error('保存收款记录失败:', error);
        logger.error('错误详情:', error.response?.data);
        const errorMsg = getApiErrorMessage(error, '请稍后重试');
        ElMessage.error('保存收款记录失败: ' + errorMsg);
  } finally {
    savePaymentLoading.value = false;
  }
};
// 重置发票表单
const resetInvoiceForm = () => {
  Object.assign(invoiceForm, { currencyCode: 'CNY', exchangeRate: 1, status: '草稿' });
  invoiceForm.id = null;
  invoiceForm.invoiceNumber = '';
  invoiceForm.customerId = null;
  invoiceForm.invoiceDate = formatLocalDate(new Date());
  invoiceForm.dueDate = '';
  invoiceForm.items = [];
  invoiceForm.notes = '';
  invoiceForm.taxRate = defaultVATRate.value;

  // 清除校验
  invoiceFormDialogRef.value?.clearValidate();
};
// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = size;
  loadInvoices();
};
const handleCurrentChange = (page) => {
  currentPage.value = page;
  loadInvoices();
};
// 页面加载时执行
const openRouteInvoice = () => {
  const invoiceId = String(route.query.invoiceId || '');
  if (/^[1-9]\d*$/.test(invoiceId)) handleViewDetails({ id: Number(invoiceId) });
};
watch(() => route.query.invoiceId, openRouteInvoice);
onMounted(() => {
  try { settlementRecoveryVisible.value = Boolean(settlementRequest.restore()); }
  catch (error) { ElMessage.error(getApiErrorMessage(error, '读取待核对登记失败')); }
  loadInvoices();
  loadCustomerOptions();
  loadProductOptions();
  financeStore.loadSettings(); // 加载税率配置
  openRouteInvoice();
});
onBeforeUnmount(() => { editRequest++; detailRequest++; historyRequest++; });
// 格式化货币
// 格式化货币 - 已统一使用 @/utils/format 导入
// 获取支付方式文本
// 打印发票 - 使用打印模板系统
const handlePrint = async () => {
  if (!invoiceDetails.id) {
    ElMessage.warning('请先选择要打印的发票');
    return;
  }
  try {
    // 打印模板变量仍用 snake（模板引擎约定）；业务对象一律 camel
    const items = (invoiceDetails.items || []).map((item, index) => {
      const qty = Number(item.quantity || 0);
      const price = item.unitPrice != null && item.unitPrice !== '' ? Number(item.unitPrice) : null;
      const amount =
        item.amount != null && item.amount !== ''
          ? Number(item.amount)
          : price === null
            ? null
            : qty * price;

      return {
        index: index + 1,
        item_code: item.productCode || '',
        item_name: item.productName || '-',
        specification: item.specification || '',
        quantity: qty.toString(),
        unit_price: price === null || Number.isNaN(price) ? '-' : price.toFixed(2),
        tax_amount: '-',
        amount: amount === null || Number.isNaN(amount) ? '-' : amount.toFixed(2),
      };
    });
    const subtotal = items.every((item) => item.amount !== '-')
      ? items.reduce((sum, item) => sum + Number(String(item.amount).replace(/,/g, '')), 0)
      : null;
    const taxAmount = invoiceDetails.taxAmount;

    const html = await printService.generateByDefaultTemplate('finance', 'invoice', {
      invoice_number: invoiceDetails.invoiceNumber || '-',
      invoice_date: invoiceDetails.invoiceDate || '-',
      customer_name: invoiceDetails.customerName || '-',
      order_no: '',
      tax_rate: invoiceDetails.taxRate ?? '',
      status: getStatusText(invoiceDetails),
      subtotal: formatCurrency(subtotal),
      tax_amount: formatCurrency(taxAmount),
      total_amount: formatCurrency(invoiceDetails.totalAmount),
      paid_amount: formatCurrency(invoiceDetails.paidAmount),
      balance_amount: formatCurrency(invoiceDetails.balanceAmount),
      notes: invoiceDetails.notes || '',
      print_time: new Date().toLocaleString(),
      items,
    });

    printService.previewDocument(html);
    ElMessage.success('打印预览已打开');
  } catch (error) {
    logger.error('打印失败:', error);
    ElMessage.error('打印失败');
  }
};
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
.table-container {
  width: 100%;
  overflow-x: auto;
}
/* 仅主列表需要横向滚动，勿作用到弹窗内表格 */
.table-container > .el-table,
.table-container :deep(> .el-table) {
  min-width: 1400px;
}
.invoice-items {
  margin-bottom: var(--spacing-lg);
}
.invoice-items h3 {
  margin-bottom: 10px;
}
.invoice-items .details-table-container {
  width: 100%;
  overflow-x: auto;
}
.invoice-items .el-table {
  min-width: 650px;
}
.add-item {
  margin-top: 10px;
  display: flex;
  justify-content: center;
}
.invoice-total {
  margin: 20px 0;
}
.total-line {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  padding: 5px 20px;
}
.total-amount {
  font-weight: bold;
  font-size: 16px;
  border-top: 1px solid var(--color-border-lighter);
  padding-top: 10px;
}
/* 表单内明细表格 */
.invoice-items .details-table-container {
  width: 100%;
  overflow-x: auto;
}
/* 移除操作列右侧空白 */
.invoice-items :deep(.el-table__body-wrapper .el-table__cell:last-child) {
  padding-right: 8px;
}
.invoice-items :deep(.el-table__header-wrapper .el-table__cell:last-child) {
  padding-right: 8px;
}
/* 内联样式提取 */
.table-full-width {
  width: 100%;
}
</style>
