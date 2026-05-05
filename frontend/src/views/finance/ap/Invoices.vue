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
          <h2>采购发票管理</h2>
          <p class="subtitle">管理采购发票与核销</p>
        </div>
        <el-button
          type="primary"
          :icon="Plus"
          @click="showAddDialog"
          v-permission="'finance:ap:create'">
          新增发票
        </el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="发票编号">
          <el-input v-model="searchForm.invoiceNumber" placeholder="系统编号"></el-input>
        </el-form-item>
        <el-form-item label="供应商发票号">
          <el-input v-model="searchForm.supplierInvoiceNumber" placeholder="供应商发票号"></el-input>
        </el-form-item>
        <el-form-item label="供应商">
          <el-input  v-model="searchForm.supplierName" placeholder="输入供应商名称" clearable ></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchInvoices" :loading="loading">查询</el-button>
          <el-button @click="resetSearch" :loading="loading">重置</el-button>
          <el-button class="advanced-search-btn" @click="showAdvancedSearch = !showAdvancedSearch">
            {{ showAdvancedSearch ? '收起筛选' : '高级搜索' }}
            <el-icon style="margin-left: 4px;"><ArrowUp v-if="showAdvancedSearch" /><ArrowDown v-else /></el-icon>
          </el-button>
        </el-form-item>
      </el-form>
      <!-- 高级搜索区域 -->
      <el-form :inline="true" :model="searchForm" class="search-form" v-show="showAdvancedSearch" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #dcdfe6;">
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
      </el-form>
    </el-card>
    
    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="invoiceList"
        style="width: 100%"
        border
        v-loading="loading"
      >
        <template #empty>
          <el-empty description="暂无发票数据" />
        </template>
        <el-table-column prop="invoiceNumber" label="系统编号" width="140" fixed="left"></el-table-column>
        <el-table-column prop="supplierInvoiceNumber" label="供应商发票号" width="200"></el-table-column>
        <el-table-column prop="supplierName" label="供应商" min-width="180"></el-table-column>
        <el-table-column prop="invoiceDate" label="开票日期" width="110"></el-table-column>
        <el-table-column prop="dueDate" label="到期日期" width="110"></el-table-column>
        <el-table-column prop="amount" label="金额" width="130" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="paidAmount" label="已付金额" width="130" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.paidAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="balance" label="剩余金额" width="130" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.amount - scope.row.paidAmount) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row)">
              {{ getStatusText(scope.row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="230" fixed="right">
          <template #default="scope">
            <el-button 
              v-if="scope.row.status !== '已付款'"
              type="primary" 
              size="small" 
              @click="handleEdit(scope.row)"
              v-permission="'finance:ap:update'">
              编辑
            </el-button>
            <el-button 
              v-if="(scope.row.status === '已确认' || scope.row.status === '部分付款') && (scope.row.amount - scope.row.paidAmount) > 0"
              v-permission="'finance:ap:payments'"
              type="success" 
              size="small" 
              @click="handleRecordPayment(scope.row)">
              付款
            </el-button>
            <el-button type="info" size="small" @click="handleViewDetails(scope.row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="pagination?.pageSizeOptions || [10, 20, 50, 100]"
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
          <!-- 第一行：系统编号 + 供应商发票号 -->
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="系统编号" prop="invoiceNumber">
                <el-input v-model="invoiceForm.invoiceNumber" placeholder="系统自动生成" disabled />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="供应商发票号" prop="supplierInvoiceNumber">
                <el-input v-model="invoiceForm.supplierInvoiceNumber" placeholder="请输入供应商发票号" />
              </el-form-item>
            </el-col>
          </el-row>
          
          <!-- 第二行：供应商 -->
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="供应商" prop="supplierId">
              <el-select v-model="invoiceForm.supplierId" placeholder="请选择供应商" filterable style="width: 100%">
                <el-option
                  v-for="supplier in supplierOptions"
                  :key="supplier.id"
                  :label="supplier.name"
                  :value="supplier.id"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <!-- 第三行：开票日期 + 到期日期 -->
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
                @change="handleInvoiceDateChange"
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
        <!-- 第四行：付款期限 + 发票状态 -->
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="付款期限">
              <el-select v-model="paymentTerms" placeholder="选择付款期限" style="width: 100%" @change="handlePaymentTermsChange">
                <el-option
                  v-for="term in paymentTermOptions"
                  :key="term"
                  :label="term === 0 ? '即时付款' : `${term}天`"
                  :value="term"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="发票状态">
              <el-select v-model="invoiceForm.status" placeholder="选择状态" style="width: 100%">
                <el-option label="草稿" value="draft"></el-option>
                <el-option label="待审核" value="pending"></el-option>
                <el-option label="已审核" value="approved"></el-option>
                <el-option label="已付款" value="paid"></el-option>
          </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <!-- 发票明细项 -->
        <div class="invoice-items">
          <h3 style="margin-bottom: 12px; font-size: 14px;">发票明细</h3>
          <div class="details-table-container">
            <el-table :data="invoiceForm.items" border size="small" style="width: 100%">
              <el-table-column label="物料/服务" width="140">
                <template #default="scope">
                  <el-select 
                    v-model="scope.row.materialId" 
                    placeholder="请输入物料名称/编码搜索" 
                    filterable 
                    remote
                    :remote-method="debouncedSearchMaterials"
                    :loading="loadingMaterials"
                    size="small" 
                    style="width: 100%" 
                    @change="() => handleMaterialChange(scope.row)"
                  >
                    <el-option
                      v-for="material in materialOptions"
                      :key="material.id"
                      :label="material.name"
                      :value="material.id"
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
              <el-table-column label="单价" width="100">
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
                    v-permission="'finance:ap:update'"
                    style="padding: 4px 0;">
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="add-item" style="margin-top: 10px;">
            <el-button v-permission="'finance:ar:create'" type="primary" size="small" @click="addInvoiceItem">添加明细项</el-button>
          </div>
        </div>
        
        <!-- 税率和总计 -->
        <div class="invoice-total" style="margin-top: 16px; padding: 12px; background: var(--color-bg-hover); border-radius: 4px;">
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
                <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; color: var(--color-primary); margin-top: 4px;">
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
    
    <!-- 记录付款对话框 -->
    <el-dialog
      title="记录付款"
      v-model="paymentDialogVisible"
      width="600px"
    >
      <el-form :model="paymentForm" :rules="paymentRules" ref="paymentFormRef" label-width="100px">
        <el-form-item label="发票编号">
          <el-input v-model="paymentForm.invoiceNumber" disabled></el-input>
        </el-form-item>
        <el-form-item label="供应商名称">
          <el-input v-model="paymentForm.supplierName" disabled></el-input>
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
        <el-form-item label="银行账户" prop="bankAccountId" v-if="paymentForm.paymentMethod === 'bank_transfer'">
          <el-select 
            v-model="paymentForm.bankAccountId" 
            placeholder="请选择银行账户" 
            style="width: 100%" 
            filterable
            :loading="bankAccountsLoading"
          >
            <el-option 
              v-for="account in bankAccounts" 
              :key="account.id" 
              :label="`${account.bankName} - ${account.accountName}`" 
              :value="account.id"
            >
              <div style="display: flex; justify-content: space-between; align-items: center">
                <span>{{ account.bankName }} - {{ account.accountName }}</span>
                <span style="color: var(--color-text-muted); font-size: 13px">{{ formatCurrency(account.balance) }}</span>
              </div>
            </el-option>
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
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="paymentDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="savePayment" :loading="savePaymentLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 发票明细查看对话框 -->
    <el-dialog
      title="发票详情查看"
      v-model="detailsDialogVisible"
      width="800px"
    >
      <div v-loading="detailsLoading">
        <!-- 基本信息 -->
        <el-descriptions :column="2" border>
          <el-descriptions-item label="系统编号">{{ invoiceDetail.invoiceNumber }}</el-descriptions-item>
          <el-descriptions-item label="供应商发票号">{{ invoiceDetail.supplierInvoiceNumber }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{ invoiceDetail.supplierName }}</el-descriptions-item>
          <el-descriptions-item label="开票日期">{{ invoiceDetail.invoiceDate }}</el-descriptions-item>
          <el-descriptions-item label="到期日期">{{ invoiceDetail.dueDate }}</el-descriptions-item>
          <el-descriptions-item label="总金额">{{ formatCurrency(invoiceDetail.amount) }}</el-descriptions-item>
          <el-descriptions-item label="已付金额">{{ formatCurrency(invoiceDetail.paidAmount) }}</el-descriptions-item>
          <el-descriptions-item label="剩余金额">{{ formatCurrency(invoiceDetail.balance) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(invoiceDetail)">{{ getStatusText(invoiceDetail) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ invoiceDetail.createdAt }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ invoiceDetail.notes || '无' }}</el-descriptions-item>
        </el-descriptions>
        
        <!-- 明细项 -->
        <div class="detail-title">
          <h3>发票明细项</h3>
        </div>
        <el-table :data="invoiceDetail.items || []" border style="width: 100%">
          <el-table-column prop="materialName" label="物料/服务" min-width="150"></el-table-column>
          <el-table-column prop="description" label="描述" min-width="200"></el-table-column>
          <el-table-column prop="quantity" label="数量" width="100" align="right"></el-table-column>
          <el-table-column prop="unitPrice" label="单价" width="120" align="right">
            <template #default="scope">
              {{ formatCurrency(scope.row.unitPrice) }}
            </template>
          </el-table-column>
          <el-table-column prop="amount" label="金额" width="120" align="right">
            <template #default="scope">
              {{ formatCurrency(scope.row.amount) }}
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="detailsDialogVisible = false">关闭</el-button>
          <el-button type="primary" @click="handleRecordPayment(invoiceDetail)" v-if="invoiceDetail.balance > 0"
              v-permission="'finance:ap:payments'">记录付款</el-button>
          <el-button v-permission="'finance:ar:view'" type="primary" @click="printInvoiceDetail">打印</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>
<script setup>
import { parsePaginatedData, parseListData } from '@/utils/responseParser';
import { searchMaterials, mapMaterialData, SEARCH_CONFIG } from '@/utils/searchConfig';
import { formatCurrency } from '@/utils/format'
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus'
import { Plus, ArrowUp, ArrowDown } from '@element-plus/icons-vue';
import api from '@/services/api';
import { useFinanceStore } from '@/stores/finance'
import { storeToRefs } from 'pinia'
import '@/utils/request' // Import request utility
import { writeSafeHtmlDocument } from '@/utils/htmlSecurity'
const financeStore = useFinanceStore()
const { vatRateOptions, defaultVATRate, paymentTermOptions, defaultPaymentTermDays, pagination } = storeToRefs(financeStore)
// 高级搜索展开状态
const showAdvancedSearch = ref(false);
// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);
const savePaymentLoading = ref(false);
const detailsLoading = ref(false);
const bankAccountsLoading = ref(false);
// 分页相关
const total = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);
const loadingMaterials = ref(false);
let searchTimeout = null;
let currentSearchId = 0;
// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('新增采购发票');
const invoiceFormRef = ref(null);
const paymentDialogVisible = ref(false);
const paymentFormRef = ref(null);
const detailsDialogVisible = ref(false);
// 数据列表
const invoiceList = ref([]);
const supplierOptions = ref([]);
const materialOptions = ref([]);
const bankAccounts = ref([]);
const invoiceDetail = ref({});
// 搜索表单
const searchForm = reactive({
  invoiceNumber: '',
  supplierInvoiceNumber: '',
  supplierName: '',
  dateRange: [],
  status: ''
});
// 发票表单
const invoiceForm = reactive({
  id: null,
  invoiceNumber: '',
  supplierInvoiceNumber: '',
  supplierId: null,
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: '',
  items: [],
  notes: '',
  taxRate: defaultVATRate.value, // 使用动态配置的默认税率
  status: 'draft' // 默认状态为草稿
});
// 付款期限
const paymentTerms = ref(defaultPaymentTermDays.value || 30); // 默认付款期限
// 付款表单
const paymentForm = reactive({
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
  bankAccountId: null,
  notes: ''
});
// 表单验证规则
const invoiceRules = {
  invoiceNumber: [
    { required: false, message: '系统自动生成', trigger: 'blur' }
  ],
  supplierInvoiceNumber: [
    { required: true, message: '请输入供应商发票号', trigger: 'blur' }
  ],
  supplierId: [
    { required: true, message: '请选择供应商', trigger: 'change' }
  ],
  invoiceDate: [
    { required: true, message: '请选择开票日期', trigger: 'change' }
  ],
  dueDate: [
    { required: true, message: '请选择到期日期', trigger: 'change' }
  ]
};
const paymentRules = {
  paymentDate: [
    { required: true, message: '请选择付款日期', trigger: 'change' }
  ],
  amount: [
    { required: true, message: '请输入付款金额', trigger: 'blur' }
  ],
  paymentMethod: [
    { required: true, message: '请选择付款方式', trigger: 'change' }
  ],
  bankAccountId: [
    { 
      required: true, 
      message: '请选择银行账户', 
      trigger: 'change',
      validator: (rule, value, callback) => {
        if (paymentForm.paymentMethod === 'bank_transfer' && !value) {
          callback(new Error('请选择银行账户'));
        } else {
          callback();
        }
      }
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
// 处理物料选择变化
const handleMaterialChange = (item) => {
  // 根据选择的物料自动填充描述和单价
  const selectedMaterial = materialOptions.value.find(m => m.id === item.materialId);
  if (selectedMaterial) {
    item.description = selectedMaterial.name;
    item.unitPrice = selectedMaterial.price || 0;
    calculateItemAmount(item);
  }
};
// 计算单项金额（整数化精度控制，避免浮点误差）
const calculateItemAmount = (item) => {
  const quantity = parseFloat(item.quantity) || 0;
  const unitPrice = parseFloat(item.unitPrice) || 0;
  item.amount = Math.round(quantity * unitPrice * 100) / 100;
};
// 计算小计（整数化累加，避免多行累计误差放大）
const calculateSubtotal = () => {
  const totalCents = invoiceForm.items.reduce((sum, item) => sum + Math.round((item.amount || 0) * 100), 0);
  return totalCents / 100;
};
// 计算税额
const calculateTax = () => {
  return Math.round(calculateSubtotal() * invoiceForm.taxRate * 100) / 100;
};
// 计算总计
const calculateTotal = () => {
  return Math.round((calculateSubtotal() + calculateTax()) * 100) / 100;
};
// 处理开票日期变化
const handleInvoiceDateChange = (date) => {
  if (date && paymentTerms.value) {
    const invoiceDate = new Date(date);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + paymentTerms.value);
    invoiceForm.dueDate = dueDate.toISOString().slice(0, 10);
  }
};
// 处理付款期限变化
const handlePaymentTermsChange = (days) => {
  if (invoiceForm.invoiceDate && days !== null) {
    const invoiceDate = new Date(invoiceForm.invoiceDate);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + days);
    invoiceForm.dueDate = dueDate.toISOString().slice(0, 10);
  }
};
// 自动生成发票编号;
// 添加发票明细项
const addInvoiceItem = () => {
  invoiceForm.items.push({
    materialId: null,
    description: '',
    quantity: 1,
    unitPrice: 0,
    amount: 0
  });
};
// 移除发票明细项
const removeInvoiceItem = (index) => {
  invoiceForm.items.splice(index, 1);
};
// 加载发票列表
const loadInvoices = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      invoiceNumber: searchForm.invoiceNumber,
      supplierName: searchForm.supplierName,
      startDate: searchForm.dateRange?.[0] || '',
      endDate: searchForm.dateRange?.[1] || '',
      status: searchForm.status
    };
    
    const response = await api.get('/finance/ap/invoices', { params });
    const { list, total: totalCount } = parsePaginatedData(response);
    invoiceList.value = list;
    total.value = totalCount;
  } catch {
    ElMessage.error('加载发票列表失败');
    
    // 出错时使用空数据
    invoiceList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};
// 加载供应商选项
const loadSupplierOptions = async () => {
  try {
    const response = await api.get('/baseData/suppliers', { params: { pageSize: 1000 } });
    const suppliers = parseListData(response, { enableLog: false });
    if (suppliers.length > 0) {
      supplierOptions.value = suppliers.map(supplier => ({
        id: parseInt(supplier.id),
        name: supplier.name || supplier.supplierName || supplier.supplier_name || '未命名供应商'
      }));
    } else {
      supplierOptions.value = [];
    }
  } catch (error) {
    console.error('加载供应商选项失败:', error);
    ElMessage.error('加载供应商选项失败');
    supplierOptions.value = [];
  }
};
// 加载物料选项 (只加载初始展示的选项)
const loadMaterialOptions = async () => {
  debouncedSearchMaterials('');
};
// 异步搜索物料
const debouncedSearchMaterials = (query) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  const searchId = ++currentSearchId;
  
  searchTimeout = setTimeout(async () => {
    loadingMaterials.value = true;
    try {
      const results = await searchMaterials(api, query, {
        pageSize: 50 // Invoices 通常也只需要前50项来展示
      });
      
      if (searchId === currentSearchId) {
        materialOptions.value = mapMaterialData(results);
      }
    } catch (error) {
      console.error('获取物料数据失败:', error);
      if (searchId === currentSearchId) {
        materialOptions.value = [];
      }
    } finally {
      if (searchId === currentSearchId) {
        loadingMaterials.value = false;
      }
    }
  }, SEARCH_CONFIG.debounceTime);
};
// 加载银行账户选项
const loadBankAccounts = async () => {
  bankAccountsLoading.value = true;
  try {
    const response = await api.get('/finance/baseData/bankAccounts');
    // 使用统一解析器
    if (response.data) {
      const data = parseListData(response, { enableLog: false });
      bankAccounts.value = data.map(account => ({
        id: account.id,
        accountName: account.accountName || account.account_name,
        accountNumber: account.accountNumber || account.account_number,
        bankName: account.bankName || account.bank_name,
        balance: parseFloat(account.balance || account.current_balance || 0)
      }));
    } else {
      bankAccounts.value = [];
    }
  } catch {
    bankAccounts.value = [];
  } finally {
    bankAccountsLoading.value = false;
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
  searchForm.supplierName = '';
  searchForm.dateRange = [];
  searchForm.status = '';
  searchInvoices();
};
// 新增发票
const showAddDialog = () => {
  dialogTitle.value = '新增采购发票';
  resetInvoiceForm();
  // 添加默认一个明细项
  addInvoiceItem();
  dialogVisible.value = true;
};
// 编辑发票
const handleEdit = async (row) => {
  dialogTitle.value = '编辑采购发票';
  
  try {
    // 确保供应商选项已加载（编辑前必须加载，否则 el-select 无法匹配显示名称）
    if (supplierOptions.value.length === 0) {
      await loadSupplierOptions();
    }
    
    const response = await api.get(`/finance/ap/invoices/${row.id}`);
    const invoice = response.data;
    
    resetInvoiceForm();
    
    // 填充表单数据
    invoiceForm.id = invoice.id;
    invoiceForm.invoiceNumber = invoice.invoiceNumber;
    invoiceForm.supplierInvoiceNumber = invoice.supplierInvoiceNumber;
    // 确保 supplierId 类型与 supplierOptions 中的 id 类型一致（统一为整数）
    invoiceForm.supplierId = invoice.supplierId != null ? parseInt(invoice.supplierId) : null;
    invoiceForm.invoiceDate = invoice.invoiceDate;
    invoiceForm.dueDate = invoice.dueDate;
    invoiceForm.notes = invoice.notes;
    // 填充明细项
    invoiceForm.items = invoice.items || [];
    
    if (invoice.taxRate !== undefined) {
      invoiceForm.taxRate = invoice.taxRate;
    } else if (invoice.amount !== undefined && invoiceForm.items.length > 0) {
      // 尝试推导原单据的税率（后端未存储/返回税率，但返回了总金额和明细）
      const subtotal = invoiceForm.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
      if (subtotal > 0 && invoice.amount >= subtotal) {
        // 推导出的税率保留两位小数，如 0.13
        const impliedTaxRate = (parseFloat(invoice.amount) - subtotal) / subtotal;
        invoiceForm.taxRate = Math.round(impliedTaxRate * 100) / 100;
      } else {
        invoiceForm.taxRate = defaultVATRate.value;
      }
    } else {
      invoiceForm.taxRate = defaultVATRate.value;
    }
    
    dialogVisible.value = true;
  } catch {
    ElMessage.error('获取发票详情失败');
  }
};
// 查看明细
const handleViewDetails = async (row) => {
  detailsLoading.value = true;
  try {
    const response = await api.get(`/finance/ap/invoices/${row.id}`);
    // 拦截器已解包，response.data 就是业务数据
    const invoice = response.data;
    invoiceDetail.value = invoice;
    // 加载相关付款记录
    try {
      const paymentsResponse = await api.get(`/finance/ap/invoices/${row.id}/payments`);
      // 拦截器已解包，response.data 可能是 {data: [...]} 格式，也可能是直接的数组
      invoiceDetail.value.paymentRecords = paymentsResponse.data || paymentsResponse.list || (Array.isArray(paymentsResponse) ? paymentsResponse : []);
    } catch {
      invoiceDetail.value.paymentRecords = [];
    }
    detailsDialogVisible.value = true;
  } catch {
    ElMessage.error('获取发票详情失败');
  } finally {
    detailsLoading.value = false;
  }
};
// 打印发票详情 - 使用打印模板系统
const printInvoiceDetail = async () => {
  try {
    // 获取打印模板
    let templateContent = '';
    try {
      const response = await api.get('/print/templates', {
        params: {
          template_type: 'ap_invoice',
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
      ElMessage.warning('未找到采购发票打印模板，请在系统管理-打印管理中配置 ap_invoice 类型模板');
      return;
    }
    
    // 替换模板变量
    const printData = {
      invoice_number: invoiceDetail.value.invoiceNumber || '-',
      supplier_name: invoiceDetail.value.supplierName || '-',
      invoice_date: invoiceDetail.value.invoiceDate || '-',
      due_date: invoiceDetail.value.dueDate || '-',
      status: getStatusText(invoiceDetail.value),
      amount: formatCurrency(invoiceDetail.value.amount),
      paid_amount: formatCurrency(invoiceDetail.value.paidAmount),
      balance: formatCurrency(invoiceDetail.value.balance),
      notes: invoiceDetail.value.notes || '无',
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
        
        (invoiceDetail.value.items || []).forEach((item, index) => {
          let itemHtml = itemTemplate;
          itemHtml = itemHtml.replace(/{{index}}/g, (index + 1).toString());
          itemHtml = itemHtml.replace(/{{material_name}}/g, item.materialName || '');
          itemHtml = itemHtml.replace(/{{description}}/g, item.description || '');
          itemHtml = itemHtml.replace(/{{quantity}}/g, item.quantity?.toString() || '0');
          itemHtml = itemHtml.replace(/{{unit_price}}/g, formatCurrency(item.unitPrice));
          itemHtml = itemHtml.replace(/{{amount}}/g, formatCurrency(item.amount));
          itemsHtml += itemHtml;
        });
        
        templateContent = templateContent.substring(0, itemStart) + itemsHtml + templateContent.substring(itemEnd + '{{/each}}'.length);
      }
    }
    
    // 创建打印窗口
    const printWindow = window.open('', '_blank');
    writeSafeHtmlDocument(printWindow, templateContent);
    
    // 等待样式加载完成后打印
    printWindow.onload = function() {
      printWindow.print();
    };
  } catch (error) {
    console.error('打印失败:', error);
    ElMessage.error('打印失败');
  }
};
// 记录付款
const handleRecordPayment = (row) => {
  // 直接使用服务端已计算的余额字段，避免前端浮点减法与DB值不一致
  const balance = parseFloat(row.balance) || parseFloat(row.balance_amount) || 0;
  
  // 填充付款表单
  paymentForm.invoiceId = row.id;
  paymentForm.invoiceNumber = row.invoiceNumber;
  paymentForm.supplierName = row.supplierName;
  paymentForm.invoiceAmount = formatCurrency(row.amount);
  paymentForm.paidAmount = formatCurrency(row.paidAmount);
  paymentForm.balance = formatCurrency(balance);
  paymentForm.balanceValue = balance;
  paymentForm.amount = balance; // 默认填充剩余金额
  paymentForm.paymentMethod = 'bank_transfer'; // 默认为银行转账
  paymentForm.bankAccountId = null; // 清空银行账户选择
  
  // 确保有银行账户选项可选
  if (bankAccounts.value.length === 0) {
    loadBankAccounts();
  }
  
  paymentDialogVisible.value = true;
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
    if (!item.materialId || item.quantity <= 0 || item.unitPrice <= 0) {
      ElMessage.warning('请确保所有明细项的物料、数量和单价都已填写完整');
      return;
    }
  }
  
  await invoiceFormRef.value.validate(async (valid) => {
    if (valid) {
      saveLoading.value = true;
      try {
        // 准备提交的数据
        const data = {
          ...invoiceForm,
          amount: calculateTotal() // 设置总金额
        };
        
        if (invoiceForm.id) {
          // 更新
          await api.put(`/finance/ap/invoices/${invoiceForm.id}`, data);
          ElMessage.success('更新成功');
        } else {
          // 新增
          await api.post('/finance/ap/invoices', data);
          ElMessage.success('添加成功');
        }
        
        dialogVisible.value = false;
        loadInvoices();
      } catch (error) {
        ElMessage.error('保存发票失败: ' + (error.response?.data?.details || error.message));
      } finally {
        saveLoading.value = false;
      }
    }
  });
};
// 保存付款记录
const savePayment = async () => {
  if (!paymentFormRef.value) return;
  
  // 银行转账必须关联银行账户
  if (paymentForm.paymentMethod === 'bank_transfer' && !paymentForm.bankAccountId) {
    ElMessage.warning('请选择银行账户');
    return;
  }
  
  await paymentFormRef.value.validate(async (valid) => {
    if (valid) {
      savePaymentLoading.value = true;
      try {
        // 准备提交的数据
        const data = {
          invoiceId: paymentForm.invoiceId,
          paymentDate: paymentForm.paymentDate,
          amount: paymentForm.amount,
          paymentMethod: paymentForm.paymentMethod,
          bankAccountId: paymentForm.bankAccountId,
          notes: paymentForm.notes
        };
        
        const response = await api.post('/finance/ap/payments', data);
        ElMessage.success('付款记录已保存');
        
        // 拦截器已解包，response.data 就是业务数据
        if (response.data?.details) {
          ElMessage({
            message: `付款单号: ${response.data.details.paymentNumber}, 金额: ${formatCurrency(response.data.details.amount)}`,
            type: 'success',
            duration: 3000
          });
        }
        
        paymentDialogVisible.value = false;
        loadInvoices();
        
        // 如果是从详情对话框发起的付款，刷新详情
        if (detailsDialogVisible.value && invoiceDetail.value.id === paymentForm.invoiceId) {
          handleViewDetails({ id: invoiceDetail.value.id });
        }
      } catch (error) {
        ElMessage.error('保存付款记录失败: ' + (error.response?.data?.error || error.message));
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
  invoiceForm.supplierId = null;
  invoiceForm.invoiceDate = new Date().toISOString().slice(0, 10);
  invoiceForm.dueDate = '';
  invoiceForm.items = [];
  invoiceForm.notes = '';
  invoiceForm.taxRate = defaultVATRate.value;
  invoiceForm.status = 'draft';
  paymentTerms.value = defaultPaymentTermDays.value || 30;
  // 自动计算到期日期
  handlePaymentTermsChange(paymentTerms.value);
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
  loadSupplierOptions();
  loadMaterialOptions();
  loadBankAccounts();
  financeStore.loadSettings(); // 加载税率配置
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
.invoice-items {
  margin-bottom: var(--spacing-lg);
}
.invoice-items h3 {
  margin-bottom: 10px;
}
.details-table-container {
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
.detail-title {
  margin-top: var(--spacing-lg);
  margin-bottom: 10px;
}
.detail-title h3 {
  font-size: 16px;
  font-weight: bold;
  color: var(--color-primary);
  position: relative;
  padding-left: 12px;
}
.detail-title h3:before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 16px;
  background-color: var(--color-primary);
  border-radius: 2px;
}
:deep(.el-descriptions) {
  margin-bottom: var(--spacing-lg);
}
:deep(.el-descriptions__label) {
  font-weight: bold;
}
.empty-data {
  text-align: center;
  padding: 30px 0;
  color: var(--color-text-secondary);
}
/* 发票明细表格样式 */
.invoice-items .details-table-container {
  width: 100%;
  overflow-x: auto;
}
.invoice-items .el-table {
  min-width: 550px;
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
