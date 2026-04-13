<!--
/**
 * Invoices.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="invoices-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>销售发票管理</h2>
          <p class="subtitle">管理销售发票与核销</p>
        </div>
        <el-button
          type="primary"
          :icon="Plus"
          @click="showAddDialog"
          v-permission="'finance:ar:invoices:create'">
          新增发票
        </el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="发票编号">
          <el-input  v-model="searchForm.invoiceNumber" placeholder="输入发票编号" clearable ></el-input>
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input  v-model="searchForm.customerName" placeholder="输入客户名称" clearable ></el-input>
        </el-form-item>
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
            <el-option label="逾期" value="逾期"></el-option>
            <el-option label="已取消" value="已取消"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchInvoices" :loading="loading">查询</el-button>
          <el-button @click="resetSearch" :loading="loading">重置</el-button>
          <el-button 
            type="success" 
            @click="showAddDialog"
            v-permission="'finance:ar:invoices:create'">
            新增
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 表格区域 -->
    <el-card class="data-card">
      <div class="table-container">
        <el-table
          :data="invoiceList"
          style="width: 100%"
          border
          v-loading="loading"
        >
          <template #empty>
            <el-empty description="暂无发票数据" />
          </template>
          <el-table-column prop="invoice_number" label="发票编号" width="220"></el-table-column>
          <el-table-column prop="customer_name" label="客户名称" width="220"></el-table-column>
          <el-table-column prop="invoice_date" label="开票日期" width="120"></el-table-column>
          <el-table-column prop="due_date" label="到期日期" width="120"></el-table-column>
          <el-table-column prop="total_amount" label="金额" width="160" align="right">
            <template #default="scope">
              {{ formatCurrency(scope.row.total_amount) }}
            </template>
          </el-table-column>
          <el-table-column prop="paid_amount" label="已付金额" width="160" align="right">
            <template #default="scope">
              {{ formatCurrency(scope.row.paid_amount) }}
            </template>
          </el-table-column>
          <el-table-column prop="balance_amount" label="剩余金额" width="160" align="right">
            <template #default="scope">
              {{ formatCurrency(scope.row.balance_amount) }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="scope">
              <el-tag :type="getStatusType(scope.row)">
                {{ getStatusText(scope.row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="240" fixed="right">
            <template #default="scope">
              <el-button 
                v-if="scope.row.balance_amount > 0"
                type="primary" 
                size="small" 
                @click="handleEdit(scope.row)"
                v-permission="'finance:ar:invoices:update'">
                编辑
              </el-button>
              <el-button 
                v-if="(scope.row.status === '已确认' || scope.row.status === '部分付款') && scope.row.balance_amount > 0"
                type="success" 
                size="small" 
                @click="handleRecordPayment(scope.row)">
                收款
              </el-button>
              <el-button type="info" size="small" @click="handleViewDetails(scope.row)">查看</el-button>
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
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="700px"
    >
      <el-form :model="invoiceForm" :rules="invoiceRules" ref="invoiceFormRef" label-width="110px">
        <!-- 第一行：发票编号 + 客户（这里客户用下拉，但因为很重要所以放第一行） -->
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="发票编号" prop="invoice_number">
              <el-input v-model="invoiceForm.invoice_number" placeholder="系统自动生成" disabled></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户" prop="customerId">
              <el-select v-model="invoiceForm.customerId" placeholder="请选择客户" filterable style="width: 100%">
                <el-option
                  v-for="customer in customerOptions"
                  :key="customer.id"
                  :label="customer.name"
                  :value="customer.id"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <!-- 第二行：开票日期 + 到期日期 -->
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="开票日期" prop="invoiceDate">
              <el-date-picker
                v-model="invoiceForm.invoiceDate"
                type="date"
                placeholder="选择开票日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="到期日期" prop="dueDate">
              <el-date-picker
                v-model="invoiceForm.dueDate"
                type="date"
                placeholder="选择到期日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              ></el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>
        
        <!-- 发票明细项 -->
        <div class="invoice-items">
          <h3 style="margin-bottom: 12px; font-size: 14px;">发票明细</h3>
          <div class="details-table-container">
            <el-table :data="invoiceForm.items" border size="small" style="width: 100%">
              <el-table-column label="商品/服务" width="140">
                <template #default="scope">
                  <el-select v-model="scope.row.productId" placeholder="选择" filterable size="small" style="width: 100%" @change="() => handleProductChange(scope.row)">
                    <el-option
                      v-for="product in productOptions"
                      :key="product.id"
                      :label="product.name"
                      :value="product.id"
                    ></el-option>
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="描述" width="120">
                <template #default="scope">
                  <el-input v-model="scope.row.description" placeholder="描述" size="small"></el-input>
                </template>
              </el-table-column>
              <el-table-column label="数量" width="80">
                <template #default="scope">
                  <el-input v-model="scope.row.quantity" placeholder="数量" size="small" @input="calculateItemAmount(scope.row)"></el-input>
                </template>
              </el-table-column>
              <el-table-column label="单价" width="90">
                <template #default="scope">
                  <el-input v-model="scope.row.unitPrice" placeholder="单价" size="small" @input="calculateItemAmount(scope.row)"></el-input>
                </template>
              </el-table-column>
              <el-table-column label="金额" width="100" align="right">
                <template #default="scope">
                  {{ formatCurrency(scope.row.amount) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="60" align="center" :resizable="false">
                <template #default="scope">
                  <el-button 
                    type="danger" 
                    size="small"
                    link
                    @click="removeInvoiceItem(scope.$index)"
                    v-permission="'finance:ar:invoices:delete'"
                    style="padding: 4px 0;">
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="add-item" style="margin-top: 10px;">
            <el-button v-permission="'finance:invoices:create'" type="primary" size="small" @click="addInvoiceItem">添加明细项</el-button>
          </div>
        </div>
        
        <!-- 税率和总计 -->
        <div class="invoice-total" style="margin-top: 16px; padding: 12px; background: #f5f7fa; border-radius: 4px;">
          <el-row :gutter="20">
            <el-col :span="8">
              <el-form-item label="税率" label-width="60px">
                <el-select v-model="invoiceForm.taxRate" placeholder="税率" size="small" style="width: 100%">
                  <el-option
                    v-for="rate in vatRateOptions"
                    :key="rate"
                    :label="financeStore.formatTaxRate(rate)"
                    :value="rate"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="16">
              <div style="display: flex; flex-direction: column; gap: 4px; padding-top: 4px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px;">
                  <span>小计：</span>
                  <span>{{ formatCurrency(calculateSubtotal()) }}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 13px;">
                  <span>税额：</span>
                  <span>{{ formatCurrency(calculateTax()) }}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; color: #409eff; margin-top: 4px;">
                  <span>总计：</span>
                  <span>{{ formatCurrency(calculateTotal()) }}</span>
                </div>
              </div>
            </el-col>
          </el-row>
        </div>
        
        <el-form-item label="备注" label-width="60px" style="margin-top: 16px;">
          <el-input
            v-model="invoiceForm.notes"
            type="textarea"
            :rows="2"
            placeholder="请输入备注信息"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveInvoice" :loading="saveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 记录收款对话框 -->
    <el-dialog
      title="记录收款"
      v-model="paymentDialogVisible"
      width="500px"
    >
      <el-form :model="paymentForm" :rules="paymentRules" ref="paymentFormRef" label-width="100px">
        <el-form-item label="发票编号">
          <el-input v-model="paymentForm.invoice_number" disabled></el-input>
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input v-model="paymentForm.customer_name" disabled></el-input>
        </el-form-item>
        <el-form-item label="发票金额">
          <el-input v-model="paymentForm.total_amount" disabled></el-input>
        </el-form-item>
        <el-form-item label="已付金额">
          <el-input v-model="paymentForm.paid_amount" disabled></el-input>
        </el-form-item>
        <el-form-item label="剩余金额">
          <el-input v-model="paymentForm.balance_amount" disabled></el-input>
        </el-form-item>
        <el-form-item label="收款日期" prop="paymentDate">
          <el-date-picker
            v-model="paymentForm.paymentDate"
            type="date"
            placeholder="选择收款日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="收款金额" prop="amount">
          <el-input-number v-model="paymentForm.amount" :precision="2" :min="0" :max="paymentForm.balanceValue" style="width: 100%"></el-input-number>
        </el-form-item>
        <el-form-item label="收款方式" prop="paymentMethod">
          <el-select v-model="paymentForm.paymentMethod" placeholder="请选择收款方式" style="width: 100%" @change="handlePaymentMethodChange">
            <el-option label="现金" value="cash"></el-option>
            <el-option label="银行转账" value="bank_transfer"></el-option>
            <el-option label="支票" value="check"></el-option>
            <el-option label="信用卡" value="credit_card"></el-option>
            <el-option label="其他" value="other"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="收款账户" prop="bankAccountId" v-if="showBankAccountField">
          <el-select v-model="paymentForm.bankAccountId" placeholder="选择收款账户" filterable style="width: 100%">
            <el-option 
              v-for="account in bankAccounts"
              :key="account.id"
              :label="`${account.account_name || account.accountName} (${account.account_number || account.accountNumber})`"
              :value="account.id"
            ></el-option>
          </el-select>
          <div class="form-tip">💡 选择后将自动创建银行交易记录并更新账户余额</div>
        </el-form-item>
        <el-form-item label="备注" prop="notes">
          <el-input
            v-model="paymentForm.notes"
            type="textarea"
            :rows="3"
            placeholder="请输入备注信息"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="paymentDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="savePayment" :loading="savePaymentLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 发票详情对话框 -->
    <el-dialog
      title="发票详情"
      v-model="detailsDialogVisible"
      width="800px"
    >
      <div class="invoice-details">
        <!-- 基本信息 -->
        <el-descriptions :column="2" border>
          <el-descriptions-item label="系统编号">{{ invoiceDetails.invoice_number }}</el-descriptions-item>
          <el-descriptions-item label="客户名称">{{ invoiceDetails.customer_name }}</el-descriptions-item>
          <el-descriptions-item label="开票日期">{{ invoiceDetails.invoice_date }}</el-descriptions-item>
          <el-descriptions-item label="到期日期">{{ invoiceDetails.due_date }}</el-descriptions-item>
          <el-descriptions-item label="总金额">{{ formatCurrency(invoiceDetails.total_amount) }}</el-descriptions-item>
          <el-descriptions-item label="已收金额">{{ formatCurrency(invoiceDetails.paid_amount) }}</el-descriptions-item>
          <el-descriptions-item label="剩余金额">{{ formatCurrency(invoiceDetails.balance_amount) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(invoiceDetails)">{{ getStatusText(invoiceDetails) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ invoiceDetails.createdAt || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ invoiceDetails.notes || '无' }}</el-descriptions-item>
        </el-descriptions>
        
        <!-- 明细项 -->
        <div class="details-section">
          <div class="detail-title" style="margin-top: 20px; margin-bottom: 15px;">
            <h3>发票明细项</h3>
          </div>
          <el-table :data="invoiceDetails.items || []" border style="width: 100%; min-width: 100%;">
            <el-table-column prop="productName" label="商品/服务名称" min-width="150">
              <template #default="scope">
                {{ scope.row.productName || scope.row.name || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="description" label="描述" min-width="200"></el-table-column>
            <el-table-column prop="quantity" label="数量" width="100" align="right"></el-table-column>
            <el-table-column prop="unitPrice" label="单价" width="110" align="right">
              <template #default="scope">
                {{ formatCurrency(scope.row.unitPrice) }}
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="110" align="right">
              <template #default="scope">
                {{ formatCurrency(scope.row.amount) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="detailsDialogVisible = false">关闭</el-button>

          <el-button v-permission="'finance:invoices:print'" type="success" @click="handlePrint">打印</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>

import apiAdapter from '@/utils/apiAdapter';

import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus'

import { Plus } from '@element-plus/icons-vue';
import axios from 'axios';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth'
import { useFinanceStore } from '@/stores/finance'
import { storeToRefs } from 'pinia'
import request from '@/utils/request' // Import request utility

// 权限store
const authStore = useAuthStore()
const financeStore = useFinanceStore()
const { vatRateOptions, defaultVATRate } = storeToRefs(financeStore)
const router = useRouter()

// 权限计算属性
// 添加请求拦截器，处理认证
axios.interceptors.request.use(config => {
  // 从localStorage获取token并添加到请求头
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
}, error => {
  console.error('请求错误:', error);
  return Promise.reject(error);
});

// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);
const savePaymentLoading = ref(false);

// 分页相关
const total = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);

// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('新增销售发票');
const invoiceFormRef = ref(null);
const paymentDialogVisible = ref(false);
const paymentFormRef = ref(null);
const bankAccounts = ref([]);

// 是否显示银行账户字段
const showBankAccountField = computed(() => {
  return ['bank_transfer', 'credit_card'].includes(paymentForm.paymentMethod);
});

const detailsDialogVisible = ref(false);
const invoiceDetails = reactive({
  id: null,
  invoice_number: '',
  customer_name: '',
  customerId: null,
  invoice_date: '',
  due_date: '',
  total_amount: 0,
  paid_amount: 0,
  balance_amount: 0,
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

// 发票表单
const invoiceForm = reactive({
  id: null,
  invoice_number: '',
  customerId: null,
  invoice_date: new Date().toISOString().slice(0, 10),
  due_date: '',
  items: [],
  notes: '',
  taxRate: defaultVATRate.value // 使用动态配置的默认税率
});

// 收款表单
const paymentForm = reactive({
  invoiceId: null,
  invoice_number: '',
  customer_name: '',
  total_amount: '',
  paid_amount: '',
  balance_amount: '',
  balanceValue: 0,
  paymentDate: new Date().toISOString().slice(0, 10),
  amount: 0,
  paymentMethod: 'bank_transfer',
  bankAccountId: null,  // 添加银行账户ID字段
  notes: ''
});

// 表单验证规则
const invoiceRules = {
  invoice_number: [
    { required: true, message: '请输入发票编号', trigger: 'blur' }
  ],
  customerId: [
    { required: true, message: '请选择客户', trigger: 'change' }
  ],
  invoice_date: [
    { required: true, message: '请选择开票日期', trigger: 'change' }
  ],
  due_date: [
    { required: true, message: '请选择到期日期', trigger: 'change' }
  ]
};

const paymentRules = {
  paymentDate: [
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
      required: computed(() => showBankAccountField.value),
      message: '请选择银行账户',
      trigger: 'change'
    }
  ]
};

// 获取状态类型
const getStatusType = (invoice) => {
  const statusMap = {
    '草稿': 'info',
    '已确认': 'primary',
    '部分付款': 'warning',
    '已付款': 'success',
    '逾期': 'danger',
    '已取消': 'info'
  };
  return statusMap[invoice.status] || 'info';
};

// 获取状态文本
const getStatusText = (invoice) => {
  // 直接使用数据库状态字段
  return invoice.status || '草稿';
};

// 计算单项金额
const calculateItemAmount = (item) => {
  // 确保数量和单价是数字
  const quantity = parseFloat(item.quantity) || 0;
  const unitPrice = parseFloat(item.unitPrice) || 0;
  item.amount = quantity * unitPrice;
};

// 计算小计
const calculateSubtotal = () => {
  return invoiceForm.items.reduce((sum, item) => sum + (item.amount || 0), 0);
};

// 计算税额
const calculateTax = () => {
  return calculateSubtotal() * invoiceForm.taxRate;
};

// 计算总计
const calculateTotal = () => {
  return calculateSubtotal() + calculateTax();
};

// 添加发票明细项
const addInvoiceItem = () => {
  invoiceForm.items.push({
    productId: null,
    description: '',
    quantity: 1,
    unitPrice: 0,
    amount: 0
  });
};

// 监听产品ID变化，自动填充单价
const handleProductChange = (item) => {
  if (item.productId) {
    const selectedProduct = productOptions.value.find(p => p.id === item.productId);
    if (selectedProduct) {
      item.unitPrice = selectedProduct.price || 0;
      item.description = selectedProduct.description || '';
      calculateItemAmount(item);
    }
  }
};

// 移除发票明细项
const removeInvoiceItem = (index) => {
  invoiceForm.items.splice(index, 1);
};

// 自动生成发票编号
const generateInvoiceNumber = async () => {
  try {
    const response = await api.get('/finance/ar/invoices/generate-number');
    // 拦截器已解包，response.data 就是业务数据
    invoiceForm.invoice_number = response.data.invoiceNumber;
    ElMessage.success('发票编号生成成功');
  } catch (error) {
    console.error('生成发票编号失败:', error);
    ElMessage.error('生成发票编号失败');
  }
};

// 加载发票列表
const loadInvoices = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      invoice_number: searchForm.invoiceNumber,
      customer_name: searchForm.customerName,
      startDate: searchForm.dateRange?.[0] || '',
      endDate: searchForm.dateRange?.[1] || '',
      status: searchForm.status
    };
    
    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时
    
    try {
      // 使用api对象发送请求，确保经过代理
      const response = await api.get('/finance/ar/invoices', { 
        params,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId); // 清除超时控制
      
      // 拦截器已解包，response.data 就是业务数据
      if (response.data) {
        const data = response.data;
        if (data.list && Array.isArray(data.list)) {
          invoiceList.value = data.list;
          total.value = data.total || data.list.length || 0;
        } else if (data.items && Array.isArray(data.items)) {
          invoiceList.value = data.items;
          total.value = data.total || data.items.length || 0;
        } else if (Array.isArray(data)) {
          invoiceList.value = data;
          total.value = data.length || 0;
        } else {
          invoiceList.value = [];
          total.value = 0;
          ElMessage.error('获取发票数据失败：未知数据格式');
        }

        if (invoiceList.value.length === 0) {
          ElMessage.info('未找到符合条件的发票数据');
        }
      } else {
        invoiceList.value = [];
        total.value = 0;
        ElMessage.error('获取发票数据失败：响应为空');
      }
    } catch (apiError) {
      clearTimeout(timeoutId); // 清除超时控制
      console.error('API调用失败:', apiError);
      ElMessage.error('获取发票数据失败：' + (apiError.message || '未知错误'));
      invoiceList.value = [];
      total.value = 0;
    }
  } catch (error) {
    console.error('加载发票列表失败:', error);
    ElMessage.error('加载发票列表失败');
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
      const response = await api.get('/baseData/customers');

      // 拦截器已解包，response.data 就是业务数据
      if (response.data?.list) {
        customerOptions.value = response.data.list;
        return;
      } else if (Array.isArray(response.data)) {
        customerOptions.value = response.data;
        return;
      }
    } catch (baseDataError) {
      // baseData API失败，尝试销售API
    }

    // 如果baseData API失败，尝试销售API
    const salesResponse = await api.get('/sales/customers-list');
    customerOptions.value = salesResponse.data || [];

  } catch (error) {
    console.error('加载客户列表失败:', error);
    ElMessage.error('加载客户列表失败');
    customerOptions.value = [];
  }
};

// 加载产品选项
const loadProductOptions = async () => {
  try {
    // 使用物料API加载产品数据
    const response = await api.get('/baseData/materials', {
      params: {
        pageSize: 100,
        type: 'finished'
      }
    });

    // 拦截器已解包，response.data 就是业务数据
    if (response.data?.list) {
      productOptions.value = response.data.list;
    } else if (Array.isArray(response.data)) {
      productOptions.value = response.data;
    } else {
      productOptions.value = [];
    }
  } catch (error) {
    console.error('加载产品列表失败:', error);
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

// 编辑发票
const handleEdit = async (row) => {
  dialogTitle.value = '编辑销售发票';
  
  try {
    // 获取发票基本信息
    const response = await api.get(`/finance/ar/invoices/${row.id}`);
    const invoice = response.data;
    
    resetInvoiceForm();
    
    // 填充表单数据，确保字段名称正确映射
    invoiceForm.id = invoice.id;
    invoiceForm.invoice_number = invoice.invoice_number;
    invoiceForm.customerId = invoice.customer_id;
    invoiceForm.invoice_date = invoice.invoice_date;
    invoiceForm.due_date = invoice.due_date;
    invoiceForm.notes = invoice.notes || '';
    invoiceForm.taxRate = invoice.taxRate !== undefined ? invoice.taxRate : defaultVATRate.value;
    
    // 从发票对象中直接获取明细项
    if (invoice.items && Array.isArray(invoice.items)) {
      // 确保明细项数据格式正确
      invoiceForm.items = invoice.items.map(item => ({
        id: item.id,
        productId: parseInt(item.productId) || parseInt(item.product_id) || null,
        description: item.description || '',
        quantity: parseFloat(item.quantity) || 0,
        unitPrice: parseFloat(item.unitPrice) || parseFloat(item.unit_price) || 0,
        amount: parseFloat(item.amount) || 0
      }));
      
      // 如果没有明细项，添加默认一个明细项
      if (invoiceForm.items.length === 0) {
        addInvoiceItem();
      }
    } else {
      // 如果没有明细项，添加默认一个明细项
      addInvoiceItem();
    }
    
    // 打印调试信息
    dialogVisible.value = true;
  } catch (error) {
    console.error('获取发票详情失败:', error);
    ElMessage.error('获取发票详情失败: ' + (error.message || '未知错误'));
    
    // 出错时也显示对话框，但添加一个默认明细项
    resetInvoiceForm();
    if (row) {
      // 使用列表中的基本信息
      invoiceForm.id = row.id;
      invoiceForm.invoice_number = row.invoice_number;
      invoiceForm.customerId = row.customer_id;
      invoiceForm.invoice_date = row.invoice_date;
      invoiceForm.due_date = row.due_date;
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
      const response = await api.get(`/finance/ar/invoices/${row.id}`);
      const invoice = response.data;
      
      // 限制数据量，只复制必要的字段
      invoiceDetails.id = invoice.id;
      invoiceDetails.invoice_number = invoice.invoice_number;
      invoiceDetails.customer_name = invoice.customer_name;
      invoiceDetails.customerId = invoice.customerId;
      invoiceDetails.invoice_date = invoice.invoice_date;
      invoiceDetails.due_date = invoice.due_date;
      invoiceDetails.total_amount = invoice.total_amount;
      invoiceDetails.paid_amount = invoice.paid_amount;
      invoiceDetails.balance_amount = invoice.balance_amount;
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
        const paymentsResponse = await api.get(`/finance/ar/invoices/${row.id}/payments`);
        if (paymentsResponse.data && Array.isArray(paymentsResponse.data)) {
          // 只保留最多10个收款记录
          invoiceDetails.payments = paymentsResponse.data.slice(0, 10);
        }
      } catch (paymentError) {
        console.warn('获取收款记录失败:', paymentError);
        invoiceDetails.payments = [];
      }
    } catch (apiError) {
      console.error('获取发票详情API失败:', apiError);
      ElMessage.error('获取发票详情失败：' + (apiError.message || '未知错误'));
      return;
    }
    
    // 显示对话框
    detailsDialogVisible.value = true;
  } catch (error) {
    console.error('获取发票详情失败:', error);
    ElMessage.error('获取发票详情失败: ' + (error.message || '未知错误'));
  }
};

// 加载银行账户列表
const loadBankAccounts = async () => {
  try {
    const response = await api.get('/finance/bank-accounts');
    if (response.data?.list) {
      bankAccounts.value = response.data.list;
    } else if (Array.isArray(response.data)) {
      bankAccounts.value = response.data;
    } else {
      bankAccounts.value = [];
    }
  } catch (error) {
    console.error('加载银行账户失败:', error);
    bankAccounts.value = [];
  }
};

// 收款方式变更处理
const handlePaymentMethodChange = () => {
  // 如果切换到非银行类支付方式，清空银行账户选择
  if (!showBankAccountField.value) {
    paymentForm.bankAccountId = null;
  }
};

// 记录收款
const handleRecordPayment = async (row) => {
  // 计算剩余金额
  const balance = row.total_amount - row.paid_amount;
  
  // 填充收款表单
  paymentForm.invoiceId = row.id;
  paymentForm.invoice_number = row.invoice_number;
  paymentForm.customer_name = row.customer_name;
  paymentForm.total_amount = formatCurrency(row.total_amount);
  paymentForm.paid_amount = formatCurrency(row.paid_amount);
  paymentForm.balance_amount = formatCurrency(balance);
  paymentForm.balanceValue = balance;
  paymentForm.amount = balance; // 默认填充剩余金额
  paymentForm.bankAccountId = null; // 重置银行账户选择
  
  // 加载银行账户列表
  await loadBankAccounts();
  
  paymentDialogVisible.value = true;
};

// 查看发票关联的收款记录
const handleViewPayments = (row) => {
  // 导航到收款记录页面，并通过URL参数传递发票编号
  router.push({
    path: '/finance/ar/receipts',
    query: { invoiceNumber: row.invoice_number }
  });
};

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
        const data = {
          id: invoiceForm.id,
          invoice_number: invoiceForm.invoice_number,
          customerId: invoiceForm.customerId,
          invoiceDate: invoiceForm.invoice_date,
          dueDate: invoiceForm.due_date,
          notes: invoiceForm.notes,
          total_amount: calculateTotal(),
          items: invoiceForm.items.map(item => ({
            id: item.id,
            product_id: item.productId,
            description: item.description,
            quantity: parseFloat(item.quantity),
            unit_price: parseFloat(item.unitPrice),
            amount: parseFloat(item.amount)
          }))
        };
        
        let response;
        
        if (invoiceForm.id) {
          // 更新
          response = await api.put(`/finance/ar/invoices/${invoiceForm.id}`, data);
          ElMessage.success('更新成功');
        } else {
          // 新增
          response = await api.post('/finance/ar/invoices', data);
          ElMessage.success('添加成功');
        }
        
        dialogVisible.value = false;
        loadInvoices();
      } catch (error) {
        console.error('保存发票失败:', error);
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
        const data = {
          invoiceId: paymentForm.invoiceId,
          receiptDate: paymentForm.paymentDate,  // 后端期望 receiptDate
          amount: paymentForm.amount,
          paymentMethod: paymentForm.paymentMethod,
          bankAccountId: paymentForm.bankAccountId || null,  // 添加银行账户ID
          notes: paymentForm.notes
        };
        
        // 发送请求
        const response = await api.post('/finance/ar/receipts', data);
        
        ElMessage.success('收款记录已保存');
        
        paymentDialogVisible.value = false;
        loadInvoices();
      } catch (error) {
        console.error('保存收款记录失败:', error);
        console.error('错误详情:', error.response?.data);
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
  invoiceForm.invoice_number = '';
  invoiceForm.customerId = null;
  invoiceForm.invoice_date = new Date().toISOString().slice(0, 10);
  invoiceForm.due_date = '';
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
// formatCurrency 已统一引用公共实现;

// 金额格式化
const formatCurrency = (value) => {
  if (value === null || value === undefined) return '¥0.00';
  const num = parseFloat(value);
  if (isNaN(num)) return '¥0.00';
  return num.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' });
};

// 获取支付方式文本
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

// 打印发票 - 使用打印模板系统
const handlePrint = async () => {
  if (!invoiceDetails.id) {
    ElMessage.warning('请先选择要打印的发票');
    return;
  }

  try {
    // 获取打印模板
    let templateContent = '';
    try {
      const response = await api.get('/print/templates', {
        params: {
          template_type: 'invoice',
          is_default: 1,
          status: 1
        }
      });
      
      const templates = response.data?.list || response.data?.data || response.data || [];
      const template = Array.isArray(templates) ? templates[0] : null;
      
      if (template && template.content) {
        templateContent = template.content;
      }
    } catch (templateError) {
      console.error('获取打印模板失败:', templateError);
    }
    
    // 如果没有找到模板，提示用户配置
    if (!templateContent) {
      ElMessage.warning('未找到发票打印模板，请在系统管理-打印管理中配置 invoice 类型模板');
      return;
    }
    
    {
      // 替换模板变量
      const printData = {
        invoice_number: invoiceDetails.invoice_number || '-',
        customer_name: invoiceDetails.customer_name || '-',
        invoice_date: invoiceDetails.invoice_date || '-',
        due_date: invoiceDetails.due_date || '-',
        status: getStatusText(invoiceDetails.status),
        total_amount: parseFloat(invoiceDetails.total_amount || 0).toFixed(2),
        paid_amount: parseFloat(invoiceDetails.paid_amount || 0).toFixed(2),
        balance_amount: parseFloat(invoiceDetails.balance_amount || 0).toFixed(2),
        notes: invoiceDetails.notes || '',
        print_date: new Date().toLocaleDateString(),
        print_time: new Date().toLocaleTimeString()
      };
      
      Object.keys(printData).forEach(key => {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        templateContent = templateContent.replace(regex, printData[key]);
      });
      
      // 处理明细项列表
      if (templateContent.includes('{{#each items}}')) {
        const itemStart = templateContent.indexOf('{{#each items}}');
        const itemEnd = templateContent.indexOf('{{/each}}', itemStart);
        
        if (itemStart !== -1 && itemEnd !== -1) {
          const itemTemplate = templateContent.substring(itemStart + '{{#each items}}'.length, itemEnd);
          let itemsHtml = '';
          
          (invoiceDetails.items || []).forEach((item, index) => {
            let itemHtml = itemTemplate;
            const qty = parseFloat(item.quantity || 0);
            const price = parseFloat(item.unit_price || 0);
            const amount = qty * price;
            itemHtml = itemHtml.replace(/{{index}}/g, (index + 1).toString());
            itemHtml = itemHtml.replace(/{{product_name}}/g, item.product_name || item.productName || '-');
            itemHtml = itemHtml.replace(/{{quantity}}/g, qty.toString());
            itemHtml = itemHtml.replace(/{{unit_price}}/g, price.toFixed(2));
            itemHtml = itemHtml.replace(/{{amount}}/g, amount.toFixed(2));
            itemsHtml += itemHtml;
          });
          
          templateContent = templateContent.substring(0, itemStart) + itemsHtml + templateContent.substring(itemEnd + '{{/each}}'.length);
        }
      }
    }

    // 创建打印窗口
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      ElMessage.error('无法打开打印窗口,请检查浏览器弹窗设置');
      return;
    }

    printWindow.document.write(templateContent);
    printWindow.document.close();

    // 等待内容加载后打印
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };

    ElMessage.success('打印预览已打开');
  } catch (error) {
    console.error('打印失败:', error);
    ElMessage.error('打印失败');
  }
};


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
  background: #f8f8f8;
  padding: 10px;
  border-radius: var(--radius-sm);
  color: var(--color-text-regular);
}

.no-data {
  text-align: center;
  color: var(--color-text-secondary);
  padding: 20px;
  background: #f8f8f8;
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
:deep(.el-dialog__body) {
  max-height: 70vh;
  overflow-y: auto;
  padding: 20px 24px;
}

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
</style> 