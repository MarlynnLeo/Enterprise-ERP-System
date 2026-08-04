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
    <PageHeader title="应收发票" subtitle="管理销售发票与核销">
      <template #actions>
<el-button
          type="primary"
          :icon="Plus"
          @click="showAddDialog"
          v-permission="'finance:ar:create'">
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
          <el-input  v-model="searchForm.invoiceNumber" placeholder="输入发票编号" clearable ></el-input>
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input  v-model="searchForm.customerName" placeholder="输入客户名称" clearable ></el-input>
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
            <el-option label="部分付款" value="部分付款"></el-option>
            <el-option label="已付款" value="已付款"></el-option>
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
          class="table-full-width"
          border
          v-loading="loading"
        >
          <template #empty>
            <el-empty description="暂无发票数据" />
          </template>
          <el-table-column prop="invoiceNumber" label="发票编号" width="180" />
          <el-table-column prop="customerName" label="客户名称" min-width="160" />
          <el-table-column prop="invoiceDate" label="开票日期" width="110" />
          <el-table-column prop="dueDate" label="到期日期" width="110" />
          <el-table-column prop="totalAmount" label="价税合计" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.totalAmount) }}
            </template>
          </el-table-column>
          <el-table-column prop="amountExcludingTax" label="未税" width="110">
            <template #default="scope">
              {{ formatCurrency(scope.row.amountExcludingTax) }}
            </template>
          </el-table-column>
          <el-table-column prop="taxAmount" label="税额" width="100">
            <template #default="scope">
              {{ formatCurrency(scope.row.taxAmount) }}
            </template>
          </el-table-column>
          <el-table-column prop="paidAmount" label="已收金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.paidAmount) }}
            </template>
          </el-table-column>
          <el-table-column prop="balanceAmount" label="剩余金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.balanceAmount) }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="scope">
              <el-tag :type="getStatusType(scope.row)">
                {{ getStatusText(scope.row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="340" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="scope">
              <el-button
                v-if="scope.row.status === '草稿'"
                type="primary"
                size="small"
                @click="handleEdit(scope.row)"
                v-permission="'finance:ar:update'">
                编辑
              </el-button>
              <el-button
                v-if="scope.row.status === '草稿'"
                type="success"
                size="small"
                @click="handleStatusChange(scope.row, '已确认')"
                v-permission="'finance:ar:update'">
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
                @click="handleStatusChange(scope.row, '已取消')"
                v-permission="'finance:ar:update'">
                取消
              </el-button>
              <el-button
                v-if="['已确认', '部分付款', '已逾期'].includes(scope.row.status) && scope.row.balanceAmount > 0"
                type="success"
                size="small"
                @click="handleRecordPayment(scope.row)"
                v-permission="'finance:ar:receive'">
                收款
              </el-button>
              <el-button class="btn-op-view" type="primary" size="small" @click="handleViewDetails(scope.row)">查看</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

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
    <InvoiceFormDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :form="invoiceForm"
      :customer-options="customerOptions"
      :product-options="productOptions"
      :save-loading="saveLoading"
      ref="invoiceFormDialogRef"
      @save="saveInvoice"
    />

    <!-- 记录收款对话框 -->
    <PaymentDialog
      v-model="paymentDialogVisible"
      :form="paymentForm"
      :bank-accounts="bankAccounts"
      :save-loading="savePaymentLoading"
      @save="savePayment"
    />

    <!-- 发票详情对话框 -->
    <InvoiceDetailDialog
      v-model="detailsDialogVisible"
      :invoice="invoiceDetails"
      :get-status-type="getStatusType"
      :get-status-text="getStatusText"
      @print="handlePrint"
    />
  </div>
</template>
<script setup>
import { formatCurrency, formatLocalDate } from '@/utils/format'
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue';
import { baseDataApi } from '@/api';
import { financeApi } from '@/api/finance';
import { salesApi } from '@/api/sales';
import { parseListData, parsePaginatedData } from '@/utils/responseParser'
import logger from '@/utils/logger'
import { useFinanceStore } from '@/stores/finance'
import { storeToRefs } from 'pinia'
import printService from '@/services/printService'
import InvoiceFormDialog from './components/InvoiceFormDialog.vue'
import PaymentDialog from './components/PaymentDialog.vue'
import InvoiceDetailDialog from './components/InvoiceDetailDialog.vue'
const financeStore = useFinanceStore()
const { defaultVATRate } = storeToRefs(financeStore)
const _router = useRouter()
// 权限计算属性
// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);
const savePaymentLoading = ref(false);
// 分页相关
const total = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);
const showAdvancedSearch = ref(false);
// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('新增销售发票');
const invoiceFormRef = ref(null);
const invoiceFormDialogRef = ref(null);
const paymentDialogVisible = ref(false);
const paymentFormRef = ref(null);
const bankAccounts = ref([]);

const detailsDialogVisible = ref(false);
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
  createdAt: '',
  notes: '',
  items: [],
  payments: []
});
// 数据列表
const invoiceList = ref([]);
const customerOptions = ref([]);
const productOptions = ref([]);
// 搜索表单
const searchForm = reactive({
  invoiceNumber: '',
  customerName: '',
  dateRange: [],
  status: ''
});
// 发票表单（API camelCase 契约）
const invoiceForm = reactive({
  id: null,
  invoiceNumber: '',
  customerId: null,
  invoiceDate: formatLocalDate(new Date()),
  dueDate: '',
  items: [],
  notes: '',
  taxRate: defaultVATRate.value
});
// 收款表单
const paymentForm = reactive({
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
  notes: ''
});

// 获取状态类型
const getStatusType = (invoice) => {
  const statusMap = {
    '草稿': 'info',
    '已确认': 'primary',
    '部分付款': 'warning',
    '已付款': 'success',
    '已逾期': 'danger',
    '已取消': 'info'
  };
  return statusMap[invoice.status] || 'info';
};
// 获取状态文本
const getStatusText = (invoice) => {
  // 直接使用数据库状态字段
  return invoice.status || '草稿';
};
// 添加发票明细项（用于编辑时的默认项）
const addInvoiceItem = () => {
  invoiceForm.items.push({
    productId: null,
    description: '',
    quantity: 1,
    unitPrice: 0,
    amount: 0
  });
};
// 自动生成发票编号
;
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
      status: searchForm.status
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
    ElMessage.error('加载发票列表失败：' + (error.message || '未知错误'));
    invoiceList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};
// 加载客户选项
const loadCustomerOptions = async () => {
  try {
    // 首先尝试使用baseData API
    try {
      const response = await baseDataApi.getCustomers({ pageSize: 50 });
      const customers = parseListData(response, { enableLog: false });
      if (customers.length > 0) {
        customerOptions.value = customers;
        return;
      }
    } catch {
      // baseData API失败，尝试销售API
    }
    // 如果baseData API失败，尝试销售API
    const salesResponse = await salesApi.getCustomersList();
    customerOptions.value = salesResponse.data || [];
  } catch (error) {
    logger.error('加载客户列表失败:', error);
    ElMessage.error('加载客户列表失败');
    customerOptions.value = [];
  }
};
// 加载产品选项
const loadProductOptions = async () => {
  try {
    // 使用物料API加载产品数据
    const response = await baseDataApi.getMaterials({
      pageSize: 50,
      type: 'finished'
    });
    productOptions.value = parseListData(response, { enableLog: false });
  } catch (error) {
    logger.error('加载产品列表失败:', error);
    ElMessage.error('加载产品列表失败');
    productOptions.value = [];
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
  dialogTitle.value = '新增销售发票';
  resetInvoiceForm();
  // 添加默认一个明细项
  addInvoiceItem();
  dialogVisible.value = true;
};
const handleStatusChange = async (row, status) => {
  const actionText = status === '已确认' ? '确认' : '取消';
  const isCancelConfirmed =
    status === '已取消' && ['已确认', '已逾期'].includes(row.status);
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
    loadInvoices();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error.response?.data?.message || error.message || '状态更新失败');
  }
};
// 编辑发票
const handleEdit = async (row) => {
  dialogTitle.value = '编辑销售发票';

  try {
    // 获取发票基本信息
    const response = await financeApi.getARInvoice(row.id);
    const invoice = response.data;

    resetInvoiceForm();

    invoiceForm.id = invoice.id;
    invoiceForm.invoiceNumber = invoice.invoiceNumber;
    invoiceForm.customerId = invoice.customerId != null ? parseInt(invoice.customerId, 10) : null;
    invoiceForm.invoiceDate = invoice.invoiceDate;
    invoiceForm.dueDate = invoice.dueDate;
    invoiceForm.notes = invoice.notes || '';
    invoiceForm.taxRate = invoice.taxRate != null ? invoice.taxRate : defaultVATRate.value;

    if (invoice.items && Array.isArray(invoice.items)) {
      invoiceForm.items = invoice.items.map((item) => ({
        id: item.id,
        productId: item.productId != null ? parseInt(item.productId, 10) : null,
        description: item.description || '',
        quantity: parseFloat(item.quantity) || 0,
        unitPrice: parseFloat(item.unitPrice) || 0,
        amount: parseFloat(item.amount) || 0
      }));
      if (invoiceForm.items.length === 0) addInvoiceItem();
    } else {
      addInvoiceItem();
    }

    dialogVisible.value = true;
  } catch (error) {
    logger.error('获取发票详情失败:', error);
    ElMessage.error('获取发票详情失败: ' + (error.message || '未知错误'));
    resetInvoiceForm();
    if (row) {
      invoiceForm.id = row.id;
      invoiceForm.invoiceNumber = row.invoiceNumber;
      invoiceForm.customerId = row.customerId;
      invoiceForm.invoiceDate = row.invoiceDate;
      invoiceForm.dueDate = row.dueDate;
    }
    addInvoiceItem();
    dialogVisible.value = true;
  }
};
// 查看明细
const handleViewDetails = async (row) => {
  try {
    // 清空上次的数据
    Object.keys(invoiceDetails).forEach(key => {
      if (Array.isArray(invoiceDetails[key])) {
        invoiceDetails[key] = [];
      } else if (typeof invoiceDetails[key] === 'number') {
        invoiceDetails[key] = 0;
      } else {
        invoiceDetails[key] = '';
      }
    });

    try {
      // 尝试从API获取详细数据
      const response = await financeApi.getARInvoice(row.id);
      const invoice = response.data;

      invoiceDetails.id = invoice.id;
      invoiceDetails.invoiceNumber = invoice.invoiceNumber;
      invoiceDetails.customerName = invoice.customerName;
      invoiceDetails.customerId = invoice.customerId;
      invoiceDetails.invoiceDate = invoice.invoiceDate;
      invoiceDetails.dueDate = invoice.dueDate;
      invoiceDetails.totalAmount = invoice.totalAmount;
      invoiceDetails.amountExcludingTax = invoice.amountExcludingTax;
      invoiceDetails.taxAmount = invoice.taxAmount;
      invoiceDetails.paidAmount = invoice.paidAmount;
      invoiceDetails.balanceAmount = invoice.balanceAmount;
      invoiceDetails.status = invoice.status;
      invoiceDetails.createdAt = invoice.createdAt;
      invoiceDetails.notes = invoice.notes;

      // 限制明细项数量
      if (invoice.items && Array.isArray(invoice.items)) {
        // 只保留最多20个明细项
        invoiceDetails.items = invoice.items.slice(0, 20);
      }

      // 获取收款记录
      try {
        const paymentsResponse = await financeApi.getARInvoicePayments(row.id);
        if (paymentsResponse.data && Array.isArray(paymentsResponse.data)) {
          // 只保留最多10个收款记录
          invoiceDetails.payments = paymentsResponse.data.slice(0, 10);
        }
      } catch {
        invoiceDetails.payments = [];
      }
    } catch (apiError) {
      logger.error('获取发票详情API失败:', apiError);
      ElMessage.error('获取发票详情失败：' + (apiError.message || '未知错误'));
      return;
    }

    // 显示对话框
    detailsDialogVisible.value = true;
  } catch (error) {
    logger.error('获取发票详情失败:', error);
    ElMessage.error('获取发票详情失败: ' + (error.message || '未知错误'));
  }
};
// 加载银行账户列表
const loadBankAccounts = async () => {
  try {
    const response = await financeApi.getBankAccounts();
    if (response.data?.list) {
      bankAccounts.value = response.data.list;
    } else if (Array.isArray(response.data)) {
      bankAccounts.value = response.data;
    } else {
      bankAccounts.value = [];
    }
  } catch (error) {
    logger.error('加载银行账户失败:', error);
    bankAccounts.value = [];
  }
};

// 记录收款
const handleRecordPayment = async (row) => {
  const balance = parseFloat(row.balanceAmount) || 0;

  paymentForm.invoiceId = row.id;
  paymentForm.invoiceNumber = row.invoiceNumber;
  paymentForm.customerName = row.customerName;
  paymentForm.totalAmount = formatCurrency(row.totalAmount);
  paymentForm.paidAmount = formatCurrency(row.paidAmount);
  paymentForm.balanceAmount = formatCurrency(balance);
  paymentForm.balanceValue = balance;
  paymentForm.amount = balance;
  paymentForm.bankAccountId = null;

  // 加载银行账户列表
  await loadBankAccounts();

  paymentDialogVisible.value = true;
};
// 查看发票关联的收款记录
;
// 保存发票
const saveInvoice = async () => {
  if (!invoiceFormRef.value) return;

  // 至少有一个明细项
  if (invoiceForm.items.length === 0) {
    ElMessage.warning('请至少添加一个发票明细项');
    return;
  }

  // 每个明细项都需要填写完整
  for (const item of invoiceForm.items) {
    if (!item.productId || item.quantity <= 0 || item.unitPrice <= 0) {
      ElMessage.warning('请确保所有明细项的产品、数量和单价都已填写完整');
      return;
    }
  }

  await invoiceFormRef.value.validate(async (valid) => {
    if (valid) {
      saveLoading.value = true;
      try {
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
          totalAmount: invoiceFormDialogRef.value?.calculateTotal() || 0,
          items: invoiceForm.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            description: item.description,
            quantity: parseFloat(item.quantity),
            unitPrice: parseFloat(item.unitPrice),
            amount: parseFloat(item.amount)
          }))
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
        ElMessage.error('保存发票失败: ' + (error.response?.data?.error || error.message || '未知错误'));
      } finally {
        saveLoading.value = false;
      }
    }
  });
};
// 保存收款记录
const savePayment = async () => {
  if (!paymentFormRef.value) return;

  await paymentFormRef.value.validate(async (valid) => {
    if (valid) {
      savePaymentLoading.value = true;
      try {
        // 准备提交的数据
        const _data = {
          invoiceId: paymentForm.invoiceId,
          receiptDate: paymentForm.paymentDate,  // 后端期望 receiptDate
          amount: paymentForm.amount,
          paymentMethod: paymentForm.paymentMethod,
          bankAccountId: paymentForm.bankAccountId || null,  // 添加银行账户ID
          notes: paymentForm.notes
        };

        // 发送请求
        await financeApi.createReceipt(_data);

        ElMessage.success('收款记录已保存');

        paymentDialogVisible.value = false;
        loadInvoices();
      } catch (error) {
        logger.error('保存收款记录失败:', error);
        logger.error('错误详情:', error.response?.data);
        const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || '未知错误';
        ElMessage.error('保存收款记录失败: ' + errorMsg);
      } finally {
        savePaymentLoading.value = false;
      }
    }
  });
};
// 重置发票表单
const resetInvoiceForm = () => {
  invoiceForm.id = null;
  invoiceForm.invoiceNumber = '';
  invoiceForm.customerId = null;
  invoiceForm.invoiceDate = formatLocalDate(new Date());
  invoiceForm.dueDate = '';
  invoiceForm.items = [];
  invoiceForm.notes = '';
  invoiceForm.taxRate = defaultVATRate.value;

  // 清除校验
  if (invoiceFormRef.value) {
    invoiceFormRef.value.resetFields();
  }
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
onMounted(() => {
  loadInvoices();
  loadCustomerOptions();
  loadProductOptions();
  financeStore.loadSettings(); // 加载税率配置
});
// 格式化货币
// 格式化货币 - 已统一使用 @/utils/format 导入
// 获取支付方式文本
;
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
        amount: amount === null || Number.isNaN(amount) ? '-' : amount.toFixed(2)
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
      items
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
.el-table {
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
.invoice-details {
  padding: 20px;
}
.details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border-lighter);
  padding-bottom: 15px;
}
.details-header h3 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 18px;
}
.detail-item {
  margin-bottom: 15px;
  display: flex;
  align-items: baseline;
}
.label {
  font-weight: bold;
  color: var(--color-text-regular);
  width: 100px;
  text-align: right;
  margin-right: 10px;
}
.value {
  color: var(--color-text-primary);
  flex: 1;
}
.details-section {
  margin-top: 25px;
  margin-bottom: 25px;
}
.details-section h3 {
  margin-bottom: 15px;
  font-size: 16px;
  color: var(--color-text-primary);
  border-left: 3px solid var(--color-primary);
  padding-left: 10px;
}
.notes-content {
  white-space: pre-wrap;
  background: var(--color-bg-section);
  padding: 10px;
  border-radius: var(--radius-sm);
  color: var(--color-text-regular);
}
.no-data {
  text-align: center;
  color: var(--color-text-secondary);
  padding: 20px;
  background: var(--color-bg-section);
  border-radius: var(--radius-sm);
}
.invoice-items .details-table-container,
.details-table-container {
  width: 100%;
  overflow-x: auto;
}
.invoice-items .el-table {
  min-width: 550px;
}
.details-section .el-table {
  width: 100%;
  min-width: 600px;
}
/* 对话框自适应高度 */

/* 移除操作列右侧空白 */
.invoice-items :deep(.el-table__body-wrapper .el-table__cell:last-child) {
  padding-right: 8px;
}
.invoice-items :deep(.el-table__header-wrapper .el-table__cell:last-child) {
  padding-right: 8px;
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
/* 内联样式提取 */
.table-full-width {
  width: 100%;
}
</style>
