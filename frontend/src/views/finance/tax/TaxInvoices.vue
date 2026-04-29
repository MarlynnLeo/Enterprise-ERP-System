<template>
  <div class="tax-invoices-container">
    <!-- 页面标题头 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>税务发票管理</h2>
          <p class="subtitle">管理进项和销项发票，支持认证与抵扣操作</p>
        </div>
        <div class="header-actions">
          <el-button v-permission="'finance:tax:create'" type="primary" @click="handleCreate" :icon="Plus">新增发票</el-button>
        </div>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="发票类型">
          <el-select v-model="searchForm.invoice_type" placeholder="请选择" clearable>
            <el-option label="进项" value="进项" />
            <el-option label="销项" value="销项" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="发票状态">
          <el-select v-model="searchForm.status" placeholder="请选择" clearable>
            <el-option label="未认证" value="未认证" />
            <el-option label="已认证" value="已认证" />
            <el-option label="已抵扣" value="已抵扣" />
            <el-option label="已作废" value="已作废" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="开票日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"

          />
        </el-form-item>
        
        <el-form-item label="发票号码">
          <el-input v-model="searchForm.invoice_number" placeholder="请输入发票号码" clearable />
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :icon="Search">查询</el-button>
          <el-button @click="handleReset" :icon="Refresh">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-label">发票总数</div>
              <div class="stat-value">{{ stats.total }}</div>
            </div>
            <el-icon class="stat-icon total"><Document /></el-icon>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-label">待认证</div>
              <div class="stat-value pending">{{ stats.pending }}</div>
            </div>
            <el-icon class="stat-icon pending"><Clock /></el-icon>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-label">进项税额</div>
              <div class="stat-value success">¥{{ formatAmount(stats.inputTax) }}</div>
            </div>
            <el-icon class="stat-icon success"><Download /></el-icon>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-label">销项税额</div>
              <div class="stat-value warning">¥{{ formatAmount(stats.outputTax) }}</div>
            </div>
            <el-icon class="stat-icon warning"><Upload /></el-icon>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="tableData"
        v-loading="loading"
        border
        stripe
        style="width: 100%"
      >
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="invoice_type" label="类型" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.invoice_type === '进项' ? 'success' : 'warning'" size="small">
              {{ row.invoice_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="invoice_number" label="发票号码" width="190">
          <template #default="{ row }">
            <template v-if="row.invoice_number && row.invoice_number.startsWith('待补录-')">
              <span style="color: var(--color-text-disabled); font-style: italic; font-size: 12px;">
                <el-icon style="vertical-align: middle; margin-right: 2px"><Clock /></el-icon>
                {{ row.invoice_number }}
              </span>
            </template>
            <span v-else>{{ row.invoice_number }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="invoice_date" label="开票日期" width="110" align="center" />
        <el-table-column prop="supplier_or_customer_name" label="供应商/客户" min-width="160" show-overflow-tooltip />
        <el-table-column prop="amount_excluding_tax" label="不含税金额" width="120" align="right">
          <template #default="{ row }">
            {{ formatAmount(row.amount_excluding_tax) }}
          </template>
        </el-table-column>
        <el-table-column prop="tax_rate" label="税率" width="90" align="center">
          <template #default="{ row }">
            {{ row.tax_rate }}%
          </template>
        </el-table-column>
        <el-table-column prop="tax_amount" label="税额" width="100" align="right">
          <template #default="{ row }">
            {{ formatAmount(row.tax_amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="total_amount" label="价税合计" width="120" align="right">
          <template #default="{ row }">
            <span class="amount-highlight">{{ formatAmount(row.total_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="关联单据" width="220" align="center">
          <template #default="{ row }">
            <template v-if="row.linked_document_number">
              <el-tag :type="getDocTypeTagType(row.related_document_type)" size="small" effect="plain">
                {{ getDocTypeLabel(row.related_document_type) }}: {{ row.linked_document_number }}
              </el-tag>
            </template>
            <span v-else-if="row.related_document_type" style="color: var(--color-text-secondary); font-size: 12px">{{ row.related_document_type }}</span>
            <span v-else style="color: var(--color-text-disabled); font-size: 12px">未关联</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-dropdown trigger="click" @command="(cmd) => handleCommand(cmd, row)">
              <el-button type="primary" size="small" link>
                操作 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="view" :icon="View">查看详情</el-dropdown-item>
                  <el-dropdown-item 
                    v-if="row.status === '未认证'" 
                    command="certify" 
                    :icon="Check"
                  >认证发票</el-dropdown-item>
                  <el-dropdown-item 
                    v-if="row.status === '已认证' && row.invoice_type === '进项'" 
                    command="deduct" 
                    :icon="Discount"
                  >抵扣发票</el-dropdown-item>
                  <el-dropdown-item 
                    v-if="row.status === '未认证'" 
                    command="void" 
                    :icon="Delete"
                    divided
                  >作废发票</el-dropdown-item>
                  <el-dropdown-item 
                    v-if="row.status !== '已作废'" 
                    command="editNumber" 
                    :icon="EditPen"
                    divided
                  >编辑发票号</el-dropdown-item>
                  <el-dropdown-item 
                    v-if="!row.linked_document_number" 
                    command="link" 
                    :icon="Link"
                  >关联AP/AR单据</el-dropdown-item>
                  <el-dropdown-item 
                    v-if="row.linked_document_number" 
                    command="unlink" 
                    :icon="Unlink"
                  >取消关联</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[10, 20, 100, 200]"
        :total="pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
        style="margin-top: 20px; justify-content: flex-end"
      />
    </el-card>

    <!-- 查看详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="发票详情"
      width="700px"
      destroy-on-close
    >
      <el-descriptions :column="2" border v-if="currentInvoice">
        <el-descriptions-item label="发票类型">
          <el-tag :type="currentInvoice.invoice_type === '销项' ? 'warning' : 'success'">
            {{ currentInvoice.invoice_type }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="发票状态">
          <el-tag :type="getStatusType(currentInvoice.status)">
            {{ currentInvoice.status }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="发票号码">{{ currentInvoice.invoice_number }}</el-descriptions-item>
        <el-descriptions-item label="发票代码">{{ currentInvoice.invoice_code || '-' }}</el-descriptions-item>
        <el-descriptions-item label="开票日期">{{ currentInvoice.invoice_date }}</el-descriptions-item>
        <el-descriptions-item label="税率">{{ currentInvoice.tax_rate }}%</el-descriptions-item>
        <el-descriptions-item label="供应商/客户" :span="2">{{ currentInvoice.supplier_or_customer_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="税号">{{ currentInvoice.supplier_tax_number || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建人">{{ currentInvoice.creator_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="不含税金额">
          <span class="detail-amount primary">¥ {{ formatAmount(currentInvoice.amount_excluding_tax) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="税额">
          <span class="detail-amount warning">¥ {{ formatAmount(currentInvoice.tax_amount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="价税合计" :span="2">
          <span class="detail-amount danger large">¥ {{ formatAmount(currentInvoice.total_amount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="认证日期" v-if="currentInvoice.certification_date">{{ currentInvoice.certification_date }}</el-descriptions-item>
        <el-descriptions-item label="抵扣日期" v-if="currentInvoice.deduction_date">{{ currentInvoice.deduction_date }}</el-descriptions-item>
        <el-descriptions-item label="关联单据" :span="2" v-if="currentInvoice.linked_document_number">
          <el-tag :type="getDocTypeTagType(currentInvoice.related_document_type)" size="small" effect="plain" style="margin-right: 8px">
            {{ getDocTypeLabel(currentInvoice.related_document_type) }}
          </el-tag>
          <span style="font-weight: 600">{{ currentInvoice.linked_document_number }}</span>
          <span v-if="currentInvoice.linked_document_amount" style="margin-left: 12px; color: #409eff">
            ¥{{ formatAmount(currentInvoice.linked_document_amount) }}
          </span>
          <el-tag v-if="currentInvoice.linked_document_status" size="small" style="margin-left: 8px">
            {{ currentInvoice.linked_document_status }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="关联单据" :span="2" v-else-if="currentInvoice.related_document_type">
          {{ currentInvoice.related_document_type }} - {{ currentInvoice.related_document_id }}
        </el-descriptions-item>
        <el-descriptions-item label="会计分录ID" v-if="currentInvoice.gl_entry_id">{{ currentInvoice.gl_entry_id }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2" v-if="currentInvoice.remark">{{ currentInvoice.remark }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ currentInvoice.created_at }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ currentInvoice.updated_at }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 新增发票对话框 -->
    <el-dialog
      v-model="createDialogVisible"
      title="新增发票"
      width="650px"
      destroy-on-close
    >
      <el-form :model="createForm" :rules="createRules" ref="createFormRef" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="发票类型" prop="invoice_type">
              <el-select v-model="createForm.invoice_type" placeholder="请选择" style="width: 100%">
                <el-option label="进项" value="进项" />
                <el-option label="销项" value="销项" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="开票日期" prop="invoice_date">
              <el-date-picker
                v-model="createForm.invoice_date"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="发票号码" prop="invoice_number">
              <el-input v-model="createForm.invoice_number" placeholder="请输入发票号码" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="发票代码">
              <el-input v-model="createForm.invoice_code" placeholder="请输入发票代码" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="供应商/客户" prop="supplier_or_customer_name">
          <el-input v-model="createForm.supplier_or_customer_name" placeholder="请输入供应商或客户名称" />
        </el-form-item>
        <el-form-item label="税号">
          <el-input v-model="createForm.supplier_tax_number" placeholder="请输入税号" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="不含税金额" prop="amount_excluding_tax">
              <el-input-number 
                v-model="createForm.amount_excluding_tax" 
                :precision="2" 
                :min="0"
                :controls="false"
                style="width: 100%"
                @change="calculateTax"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="税率(%)" prop="tax_rate">
              <el-select v-model="createForm.tax_rate" style="width: 100%" @change="calculateTax">
                <el-option label="0%" :value="0" />
                <el-option label="1%" :value="1" />
                <el-option label="3%" :value="3" />
                <el-option label="6%" :value="6" />
                <el-option label="9%" :value="9" />
                <el-option label="13%" :value="13" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="税额">
              <el-input-number 
                v-model="createForm.tax_amount" 
                :precision="2"
                :controls="false"
                disabled
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="价税合计">
          <el-input-number 
            v-model="createForm.total_amount" 
            :precision="2"
            :controls="false"
            disabled
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="createForm.remark" type="textarea" :rows="2" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate" :loading="submitting">确认</el-button>
      </template>
    </el-dialog>

    <!-- 关联 AP/AR 单据对话框 -->
    <el-dialog
      v-model="linkDialogVisible"
      title="关联 AP/AR 单据"
      width="600px"
      destroy-on-close
    >
      <el-form :model="linkForm" label-width="100px">
        <el-form-item label="单据类型">
          <el-radio-group v-model="linkForm.document_type" @change="handleLinkTypeChange">
            <el-radio value="ap_invoice">应付发票 (AP)</el-radio>
            <el-radio value="ar_invoice">应收发票 (AR)</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="搜索单据">
          <el-input 
            v-model="linkForm.keyword" 
            placeholder="输入发票号或供应商/客户名搜索" 
            clearable
            @input="debounceSearchDocuments"
            style="margin-bottom: 12px"
          />
          <el-table 
            :data="availableDocuments" 
            v-loading="linkLoading" 
            border 
            stripe
            max-height="300"
            @row-click="selectLinkDocument"
            highlight-current-row
            style="cursor: pointer"
          >
            <el-table-column prop="invoice_number" label="发票号" width="160" />
            <el-table-column :prop="linkForm.document_type === 'ap_invoice' ? 'supplier_name' : 'customer_name'" :label="linkForm.document_type === 'ap_invoice' ? '供应商' : '客户'" min-width="150" show-overflow-tooltip />
            <el-table-column prop="total_amount" label="金额" width="120" align="right">
              <template #default="{ row }">
                ¥{{ formatAmount(row.total_amount) }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="linkForm.selected_id" style="margin-top: 12px; padding: 8px 12px; background: var(--color-success-light); border-radius: 4px; color: #67c23a">
            已选择: {{ linkForm.selected_number }}
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="linkDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitLink" :loading="linkSubmitting" :disabled="!linkForm.selected_id">确认关联</el-button>
      </template>
    </el-dialog>

    <!-- 编辑发票号对话框 -->
    <el-dialog v-model="editNumberDialogVisible" title="编辑发票号码" width="480px" destroy-on-close>
      <el-alert 
        title="请输入供应商/客户提供的真实增值税发票号码" 
        type="info" 
        :closable="false" 
        show-icon 
        style="margin-bottom: 16px"
      />
      <el-form label-width="80px">
        <el-form-item label="发票号码">
          <el-input  
            v-model="editNumberForm.invoice_number" 
            placeholder="请输入真实发票号码"
            clearable
            maxlength="100"
            @keyup.enter="submitEditInvoiceNumber" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editNumberDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEditInvoiceNumber" :loading="editNumberSubmitting">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatAmount } from '@/utils/format'
import { Search, Refresh, Plus, View, Check, Discount, Delete, ArrowDown, Document, Clock, Download, Upload, Link, CircleClose as Unlink, EditPen } from '@element-plus/icons-vue';
import { api } from '@/services/axiosInstance';

// 搜索表单
const searchForm = reactive({
  invoice_type: '',
  status: '',
  invoice_number: ''
});

const dateRange = ref([]);
const loading = ref(false);
const tableData = ref([]);

// 统计数据
const stats = reactive({
  total: 0,
  pending: 0,
  inputTax: 0,
  outputTax: 0
});

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
});

// 查看详情对话框
const detailDialogVisible = ref(false);
const currentInvoice = ref(null);

// 新增发票对话框
const createDialogVisible = ref(false);
const createFormRef = ref(null);
const submitting = ref(false);
const createForm = reactive({
  invoice_type: '进项',
  invoice_date: new Date().toISOString().slice(0, 10),
  invoice_number: '',
  invoice_code: '',
  supplier_or_customer_name: '',
  supplier_tax_number: '',
  amount_excluding_tax: 0,
  tax_rate: 13,
  tax_amount: 0,
  total_amount: 0,
  remark: ''
});

const createRules = {
  invoice_type: [{ required: true, message: '请选择发票类型', trigger: 'change' }],
  invoice_date: [{ required: true, message: '请选择开票日期', trigger: 'change' }],
  invoice_number: [{ required: true, message: '请输入发票号码', trigger: 'blur' }],
  supplier_or_customer_name: [{ required: true, message: '请输入供应商/客户名称', trigger: 'blur' }],
  amount_excluding_tax: [{ required: true, message: '请输入金额', trigger: 'blur' }],
  tax_rate: [{ required: true, message: '请选择税率', trigger: 'change' }]
};

// 计算税额
// 注意：税务发票模块的 tax_rate 使用百分比整数制（13 表示 13%）
// 与采购/销售模块的小数制（0.13 表示 13%）不同，跨模块传值时需转换
const calculateTax = () => {
  const amount = createForm.amount_excluding_tax || 0;
  const rate = createForm.tax_rate || 0;
  // 整数化精度控制：先转分再转元，避免浮点数累积误差
  createForm.tax_amount = Math.round(amount * rate) / 100;
  createForm.total_amount = parseFloat((amount + createForm.tax_amount).toFixed(2));
};

// 格式化金额 - 已统一使用 @/utils/format 导入

// 获取状态类型
const getStatusType = (status) => {
  const typeMap = {
    '未认证': 'info',
    '已认证': 'success',
    '已抵扣': 'warning',
    '已作废': 'danger'
  };
  return typeMap[status] || 'info';
};

// 获取关联单据类型标签
const getDocTypeLabel = (type) => {
  const labelMap = {
    'ap_invoice': '应付发票',
    'ar_invoice': '应收发票',
    '采购入库单': '采购入库',
    '销售出库单': '销售出库'
  };
  return labelMap[type] || type || '未知';
};

// 获取关联单据类型 Tag 颜色（与发票类型颜色一致：进项=绿色，销项=黄色）
const getDocTypeTagType = (type) => {
  const typeMap = {
    'ap_invoice': 'warning',
    'ar_invoice': 'success',
    '采购入库单': 'success',
    '销售出库单': 'warning'
  };
  return typeMap[type] || 'info';
};

// 加载数据
const loadData = async () => {
  loading.value = true;

  try {
    const params = {
      invoice_type: searchForm.invoice_type,
      status: searchForm.status,
      invoice_number: searchForm.invoice_number,
      start_date: dateRange.value?.[0],
      end_date: dateRange.value?.[1],
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    };

    // 移除空参数
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });

    const response = await api.get('/finance/tax/invoices', { params });
    const data = response.data;
    
    if (Array.isArray(data)) {
      tableData.value = data;
      pagination.total = data.length;
    } else if (data && Array.isArray(data.list)) {
      tableData.value = data.list;
      pagination.total = data.total || data.list.length;
    } else {
      tableData.value = [];
      pagination.total = 0;
    }

    // 计算统计数据
    calculateStats();
  } catch (error) {
    console.error('加载税务发票列表失败:', error);
    ElMessage.error(error.message || '加载数据失败');
  } finally {
    loading.value = false;
  }
};

// 计算统计数据
const calculateStats = () => {
  stats.total = tableData.value.length;
  stats.pending = tableData.value.filter(item => item.status === '未认证').length;
  stats.inputTax = tableData.value
    .filter(item => item.invoice_type === '进项' && item.status !== '已作废')
    .reduce((sum, item) => sum + parseFloat(item.tax_amount || 0), 0);
  stats.outputTax = tableData.value
    .filter(item => item.invoice_type === '销项' && item.status !== '已作废')
    .reduce((sum, item) => sum + parseFloat(item.tax_amount || 0), 0);
};

// 搜索
const handleSearch = () => {
  pagination.page = 1;
  loadData();
};

// 重置
const handleReset = () => {
  searchForm.invoice_type = '';
  searchForm.status = '';
  searchForm.invoice_number = '';
  dateRange.value = [];
  pagination.page = 1;
  loadData();
};

// 新增发票
const handleCreate = () => {
  // 重置表单
  Object.assign(createForm, {
    invoice_type: '进项',
    invoice_date: new Date().toISOString().slice(0, 10),
    invoice_number: '',
    invoice_code: '',
    supplier_or_customer_name: '',
    supplier_tax_number: '',
    amount_excluding_tax: 0,
    tax_rate: 13,
    tax_amount: 0,
    total_amount: 0,
    remark: ''
  });
  createDialogVisible.value = true;
};

// 提交新增
const submitCreate = async () => {
  try {
    await createFormRef.value.validate();
    submitting.value = true;
    
    await api.post('/finance/tax/invoices', createForm);
    
    ElMessage.success('发票创建成功');
    createDialogVisible.value = false;
    loadData();
  } catch (error) {
    if (error !== 'cancel' && error !== false) {
      console.error('创建发票失败:', error);
      ElMessage.error(error.message || '创建失败');
    }
  } finally {
    submitting.value = false;
  }
};

// 处理下拉菜单命令
const handleCommand = (command, row) => {
  switch (command) {
    case 'view':
      handleView(row);
      break;
    case 'certify':
      handleCertify(row);
      break;
    case 'deduct':
      handleDeduct(row);
      break;
    case 'void':
      handleVoid(row);
      break;
    case 'link':
      handleLink(row);
      break;
    case 'unlink':
      handleUnlink(row);
      break;
    case 'editNumber':
      handleEditInvoiceNumber(row);
      break;
  }
};

// 查看详情
const handleView = (row) => {
  currentInvoice.value = row;
  detailDialogVisible.value = true;
};

// 认证发票
const handleCertify = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认认证发票 ${row.invoice_number} 吗？认证后将自动生成会计分录。`,
      '确认认证',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await api.post(`/finance/tax/invoices/${row.id}/certify`, {
      certification_date: new Date().toISOString().split('T')[0]
    });

    ElMessage.success('发票认证成功，会计分录已自动生成');
    loadData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('认证发票失败:', error);
      ElMessage.error(error.message || '认证失败');
    }
  }
};

// 抵扣发票
const handleDeduct = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认抵扣发票 ${row.invoice_number} 吗？`,
      '确认抵扣',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await api.post(`/finance/tax/invoices/${row.id}/deduct`, {
      deduction_date: new Date().toISOString().split('T')[0]
    });

    ElMessage.success('发票抵扣成功');
    loadData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('抵扣发票失败:', error);
      ElMessage.error(error.message || '抵扣失败');
    }
  }
};

// 作废发票
const handleVoid = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认作废发票 ${row.invoice_number} 吗？此操作不可恢复。`,
      '确认作废',
      {
        confirmButtonText: '确认作废',
        cancelButtonText: '取消',
        type: 'error'
      }
    );

    await api.post(`/finance/tax/invoices/${row.id}/void`);

    ElMessage.success('发票已作废');
    loadData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('作废发票失败:', error);
      ElMessage.error(error.message || '作废失败');
    }
  }
};

// 编辑发票号
const editNumberDialogVisible = ref(false);
const editNumberForm = reactive({ id: null, invoice_number: '' });
const editNumberSubmitting = ref(false);

const handleEditInvoiceNumber = (row) => {
  editNumberForm.id = row.id;
  editNumberForm.invoice_number = row.invoice_number?.startsWith('待补录-') ? '' : (row.invoice_number || '');
  editNumberDialogVisible.value = true;
};

const submitEditInvoiceNumber = async () => {
  if (!editNumberForm.invoice_number.trim()) {
    ElMessage.warning('请输入发票号码');
    return;
  }
  try {
    editNumberSubmitting.value = true;
    await api.put(`/finance/tax/invoices/${editNumberForm.id}/invoice-number`, {
      invoice_number: editNumberForm.invoice_number.trim()
    });
    ElMessage.success('发票号码更新成功');
    editNumberDialogVisible.value = false;
    loadData();
  } catch (error) {
    console.error('更新发票号码失败:', error);
    ElMessage.error(error.message || '更新失败');
  } finally {
    editNumberSubmitting.value = false;
  }
};

// 分页变化
const handleSizeChange = (size) => {
  pagination.pageSize = size;
  pagination.page = 1;
  loadData();
};

const handlePageChange = (page) => {
  pagination.page = page;
  loadData();
};

// 初始化
onMounted(() => {
  loadData();
});

// ==================== 关联 AP/AR 单据 ====================

const linkDialogVisible = ref(false);
const linkLoading = ref(false);
const linkSubmitting = ref(false);
const availableDocuments = ref([]);
const linkingInvoiceId = ref(null);
const linkForm = reactive({
  document_type: 'ap_invoice',
  keyword: '',
  selected_id: null,
  selected_number: ''
});

// 防抖搜索
let searchTimer = null;
const debounceSearchDocuments = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchAvailableDocuments(), 300);
};

// 搜索可关联单据
const searchAvailableDocuments = async () => {
  linkLoading.value = true;
  try {
    const type = linkForm.document_type === 'ap_invoice' ? 'ap' : 'ar';
    const response = await api.get('/finance/tax/available-documents', {
      params: { type, keyword: linkForm.keyword }
    });
    availableDocuments.value = response.data || [];
  } catch (error) {
    console.error('搜索单据失败:', error);
    availableDocuments.value = [];
  } finally {
    linkLoading.value = false;
  }
};

// 切换单据类型
const handleLinkTypeChange = () => {
  linkForm.selected_id = null;
  linkForm.selected_number = '';
  availableDocuments.value = [];
  searchAvailableDocuments();
};

// 选择单据
const selectLinkDocument = (row) => {
  linkForm.selected_id = row.id;
  linkForm.selected_number = row.invoice_number;
};

// 打开关联对话框
const handleLink = (row) => {
  linkingInvoiceId.value = row.id;
  // 根据发票类型预选单据类型：进项→AP，销项→AR
  linkForm.document_type = row.invoice_type === '进项' ? 'ap_invoice' : 'ar_invoice';
  linkForm.keyword = '';
  linkForm.selected_id = null;
  linkForm.selected_number = '';
  availableDocuments.value = [];
  linkDialogVisible.value = true;
  searchAvailableDocuments();
};

// 提交关联
const submitLink = async () => {
  if (!linkForm.selected_id) return;
  linkSubmitting.value = true;
  try {
    await api.post(`/finance/tax/invoices/${linkingInvoiceId.value}/link`, {
      document_type: linkForm.document_type,
      document_id: linkForm.selected_id
    });
    ElMessage.success('关联成功');
    linkDialogVisible.value = false;
    loadData();
  } catch (error) {
    console.error('关联失败:', error);
    ElMessage.error(error.message || '关联失败');
  } finally {
    linkSubmitting.value = false;
  }
};

// 取消关联
const handleUnlink = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认取消发票 ${row.invoice_number} 与 ${row.linked_document_number} 的关联吗？`,
      '取消关联',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
    );
    await api.post(`/finance/tax/invoices/${row.id}/unlink`);
    ElMessage.success('已取消关联');
    loadData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('取消关联失败:', error);
      ElMessage.error(error.message || '操作失败');
    }
  }
};
</script>

<style scoped>
.tax-invoices-container {
  padding: 20px;
}

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

.search-card {
  margin-bottom: 16px;
}

.search-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.stats-row {
  margin-bottom: 16px;
}

.stat-card {
  border-radius: 8px;
}

.stat-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-info {
  flex: 1;
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.stat-value.pending {
  color: var(--color-warning);
}

.stat-value.success {
  color: var(--color-success);
}

.stat-value.warning {
  color: var(--color-warning);
}

.stat-icon {
  font-size: 40px;
  opacity: 0.6;
}

.stat-icon.total {
  color: var(--color-primary);
}

.stat-icon.pending {
  color: var(--color-warning);
}

.stat-icon.success {
  color: var(--color-success);
}

.stat-icon.warning {
  color: var(--color-warning);
}

.data-card {
  background: var(--color-bg-base);
}

.amount-highlight {
  font-weight: 600;
  color: var(--color-primary);
}

.detail-amount {
  font-weight: bold;
}

.detail-amount.primary {
  color: var(--color-primary);
}

.detail-amount.warning {
  color: var(--color-warning);
}

.detail-amount.danger {
  color: var(--color-danger);
}

.detail-amount.large {
  font-size: 18px;
}
</style>
