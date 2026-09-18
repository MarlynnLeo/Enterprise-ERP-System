<template>
  <div class="module-page tax-returns-container">
    <PageHeader title="纳税申报" subtitle="增值税与所得税等纳税申报管理" />

    <FinanceQueryCard
      :model="searchForm"
      :expanded="showAdvancedSearch"
      :loading="loading"
      @update:expanded="showAdvancedSearch = $event"
      @search="handleSearch"
      @reset="handleReset"
    >
      <template #basic>
        <el-form-item label="申报类型">
          <el-select v-model="searchForm.returnType" placeholder="请选择" clearable>
            <el-option label="增值税" value="增值税" />
            <el-option label="企业所得税" value="企业所得税" />
            <el-option label="个人所得税" value="个人所得税" />
          </el-select>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="申报状态">
          <el-select v-model="searchForm.status" placeholder="请选择" clearable>
            <el-option label="草稿" value="草稿" />
            <el-option label="已申报" value="已申报" />
            <el-option label="已缴纳" value="已缴纳" />
            <el-option label="已作废" value="已作废" />
          </el-select>
        </el-form-item>

        <el-form-item label="申报年份">
          <el-date-picker
            v-model="searchForm.year"
            type="year"
            placeholder="请选择年份"
            value-format="YYYY"

          />
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <el-card class="data-card table-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>纳税申报列表</span>
          <el-button v-permission="'finance:tax:create'" type="primary" @click="handleCreate" :icon="Plus">新增申报</el-button>
        </div>
      </template>
      <el-table
        :data="tableData"
        v-loading="loading"
        border
        stripe
        class="table-row-click w-full"
        :height="tableHeight"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))">
        <el-table-column type="index" label="序号" width="60" />
        <el-table-column prop="returnPeriod" label="申报期间" width="120" />
        <el-table-column prop="returnType" label="申报类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getReturnTypeColor(row.returnType)">
              {{ row.returnType }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 增值税相关列 -->
        <el-table-column v-if="searchForm.returnType === '增值税' || !searchForm.returnType" prop="salesAmount" label="销售额" width="120">
          <template #default="{ row }">
            {{ row.returnType === '增值税' ? formatAmount(row.salesAmount) : '-' }}
          </template>
        </el-table-column>
        <el-table-column v-if="searchForm.returnType === '增值税' || !searchForm.returnType" prop="salesOutputTax" label="销项税额" width="120">
          <template #default="{ row }">
            {{ row.returnType === '增值税' ? formatAmount(row.salesOutputTax) : '-' }}
          </template>
        </el-table-column>
        <el-table-column v-if="searchForm.returnType === '增值税' || !searchForm.returnType" prop="purchaseInputTax" label="进项税额" width="120">
          <template #default="{ row }">
            {{ row.returnType === '增值税' ? formatAmount(row.purchaseInputTax) : '-' }}
          </template>
        </el-table-column>

        <!-- 企业所得税相关列 -->
        <el-table-column v-if="searchForm.returnType === '企业所得税' || !searchForm.returnType" prop="totalRevenue" label="营业收入" width="120">
          <template #default="{ row }">
            {{ row.returnType === '企业所得税' ? formatAmount(row.totalRevenue) : '-' }}
          </template>
        </el-table-column>
        <el-table-column v-if="searchForm.returnType === '企业所得税' || !searchForm.returnType" prop="taxableIncome" label="应纳税所得额" width="140">
          <template #default="{ row }">
            {{ row.returnType === '企业所得税' ? formatAmount(row.taxableIncome) : '-' }}
          </template>
        </el-table-column>

        <!-- 通用列 -->
        <el-table-column prop="taxPayable" label="应纳税额" width="120">
          <template #default="{ row }">
            <span class="text-danger font-weight-700">
              {{ formatAmount(row.returnType === '增值税' ? row.taxPayable : row.incomeTaxPayable) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="declarationDate" label="申报日期" width="120" />
        <el-table-column prop="paymentDate" label="缴纳日期" width="120" />
        <el-table-column prop="creatorName" label="创建人" width="100" />

        <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="{ row }">
            

            <!-- 提交申报按钮：只在草稿状态显示 -->
            <el-button
              v-if="row.status === '草稿'"
              type="success"
              size="small"
              @click="handleSubmit(row)"
              v-permission="'finance:tax:update'"
              :icon="Check"

              >提交申报</el-button>

            <el-button v-if="row.status === '已申报' && Number(row.taxPaid || 0) === 0" v-permission="'finance:tax:update'" size="small" @click="handleReopen(row)">撤回申报</el-button>
            <!-- 缴纳税款按钮：只在已申报状态显示 -->
            <el-button
              v-if="row.status === '已申报'"
              type="warning"
              size="small"
              @click="handlePay(row)"
              v-permission="'finance:tax:pay'"
              :icon="Money"
            >缴纳税款</el-button>

            <el-button
              v-if="row.status === '已缴纳'"
              type="danger"
              size="small"
              @click="handleVoidPayment(row)"
              v-permission="'finance:tax:pay'"
            >作废缴纳</el-button>

            <!-- 删除按钮：只在草稿状态显示 -->
            <el-button
              v-if="row.status === '草稿'"
              type="danger"
              size="small"
              @click="handleDelete(row)"
              :icon="Delete"

              v-permission="'finance:tax:delete'">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[20, 50, 100, 200]"
        :total="pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
        class="pagination-bar"
      />
    </el-card>

    <!-- 新增申报对话框 -->
    <AppDialog
      v-model="createDialogVisible"
      title="新增纳税申报"
      mode="form"
      width="650px"
    >
      <el-form :model="createForm" :rules="createRules" ref="createFormRef" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="申报类型" prop="returnType">
              <el-select v-model="createForm.returnType" placeholder="请选择" class="w-full" @change="handleTypeChange">
                <el-option label="增值税" value="增值税" />
                <el-option label="企业所得税" value="企业所得税" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="申报期间" prop="returnPeriod">
              <el-date-picker v-model="createForm.returnPeriod" type="month" placeholder="选择期间" value-format="YYYY-MM" class="w-full" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 增值税表单 -->
        <template v-if="createForm.returnType === '增值税'">
          <el-divider content-position="left">增值税数据</el-divider>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="销售额">
                <el-input-number v-model="createForm.salesAmount" :precision="2" :min="0" class="w-full" @change="calcVATPayable" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="销项税额">
                <el-input-number v-model="createForm.salesOutputTax" :precision="2" :min="0" class="w-full" @change="calcVATPayable" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="采购额">
                <el-input-number v-model="createForm.purchaseAmount" :precision="2" :min="0" class="w-full" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="进项税额">
                <el-input-number v-model="createForm.purchaseInputTax" :precision="2" :min="0" class="w-full" @change="calcVATPayable" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="进项税转出">
                <el-input-number v-model="createForm.inputTaxDeduction" :precision="2" :min="0" class="w-full" @change="calcVATPayable" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="应纳税额">
                <el-input-number v-model="createForm.taxPayable" :precision="2" class="w-full" disabled />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- 企业所得税表单 -->
        <template v-if="createForm.returnType === '企业所得税'">
          <el-divider content-position="left">企业所得税数据</el-divider>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="营业收入">
                <el-input-number v-model="createForm.totalRevenue" :precision="2" :min="0" class="w-full" @change="calcIncomeTax" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="营业成本">
                <el-input-number v-model="createForm.totalCost" :precision="2" :min="0" class="w-full" @change="calcIncomeTax" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="期间费用">
                <el-input-number v-model="createForm.totalExpense" :precision="2" :min="0" class="w-full" @change="calcIncomeTax" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="应纳税所得额">
                <el-input-number v-model="createForm.taxableIncome" :precision="2" class="w-full" disabled />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="税率(%)">
                <el-input-number v-model="createForm.incomeTaxRate" :precision="1" :min="0" :max="100" class="w-full" @change="calcIncomeTax" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="应纳所得税额">
                <el-input-number v-model="createForm.incomeTaxPayable" :precision="2" class="w-full" disabled />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <el-form-item label="备注">
          <el-input v-model="createForm.remark" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button v-permission="'finance:tax:create'" type="primary" @click="submitCreate" :loading="createLoading">确认创建</el-button>
      </template>
        </AppDialog>

    <!-- 缴纳税款对话框 -->
    <AppDialog
      v-model="payDialogVisible"
      title="缴纳税款"
      mode="form"
      width="520px"
    >
      <el-form :model="payForm" label-width="110px">
        <el-form-item label="申报期间">
          <span>{{ currentPayRow?.returnPeriod || '-' }}</span>
        </el-form-item>
        <el-form-item label="申报类型">
          <span>{{ currentPayRow?.returnType || '-' }}</span>
        </el-form-item>
        <el-form-item label="缴纳金额">
          <strong>{{ formatAmount(payAmount) }}</strong>
        </el-form-item>
        <el-form-item v-if="payAmount !== null && payAmount > 0" label="付款账户" required>
          <el-select v-model="payForm.bankAccountId" placeholder="请选择银行账户" filterable class="w-full">
            <el-option
              v-for="account in bankAccounts"
              :key="account.id"
              :label="`${account.accountName}（余额 ${formatAmount(account.balance)}）`"
              :value="account.id"
              :disabled="numericAmount(account.balance) === null || numericAmount(payAmount) === null || numericAmount(account.balance) < numericAmount(payAmount)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="缴纳日期" required>
          <el-date-picker v-model="payForm.paymentDate" type="date" value-format="YYYY-MM-DD" class="w-full" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payDialogVisible = false">取消</el-button>
        <el-button v-permission="'finance:tax:pay'" type="primary" @click="confirmPay" :loading="payLoading">确认缴纳</el-button>
      </template>
        </AppDialog>

    <!-- 查看详情对话框 -->
    <AppDialog
      v-model="viewDialogVisible"
      title="纳税申报详情"
      mode="view"
      content-width="wide"
    >
      <el-descriptions :column="2" border>
        <el-descriptions-item label="申报期间">{{ viewData.returnPeriod }}</el-descriptions-item>
        <el-descriptions-item label="申报类型">
          <el-tag :type="getReturnTypeColor(viewData.returnType)">{{ viewData.returnType }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(viewData.status)">{{ viewData.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建人">{{ viewData.creatorName || '-' }}</el-descriptions-item>
      </el-descriptions>

      <!-- 增值税详情 -->
      <template v-if="viewData.returnType === '增值税'">
        <el-divider content-position="left">增值税数据</el-divider>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="销售额">{{ formatAmount(viewData.salesAmount) }}</el-descriptions-item>
          <el-descriptions-item label="销项税额">{{ formatAmount(viewData.salesOutputTax) }}</el-descriptions-item>
          <el-descriptions-item label="采购额">{{ formatAmount(viewData.purchaseAmount) }}</el-descriptions-item>
          <el-descriptions-item label="进项税额">{{ formatAmount(viewData.purchaseInputTax) }}</el-descriptions-item>
          <el-descriptions-item label="进项税转出">{{ formatAmount(viewData.inputTaxDeduction) }}</el-descriptions-item>
          <el-descriptions-item label="应纳税额">
            <span class="text-danger font-weight-700">{{ formatAmount(viewData.taxPayable) }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </template>

      <!-- 企业所得税详情 -->
      <template v-if="viewData.returnType === '企业所得税'">
        <el-divider content-position="left">企业所得税数据</el-divider>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="营业收入">{{ formatAmount(viewData.totalRevenue) }}</el-descriptions-item>
          <el-descriptions-item label="营业成本">{{ formatAmount(viewData.totalCost) }}</el-descriptions-item>
          <el-descriptions-item label="期间费用">{{ formatAmount(viewData.totalExpense) }}</el-descriptions-item>
          <el-descriptions-item label="应纳税所得额">{{ formatAmount(viewData.taxableIncome) }}</el-descriptions-item>
          <el-descriptions-item label="税率">{{ formatTaxRate(viewData.incomeTaxRate) }}</el-descriptions-item>
          <el-descriptions-item label="应纳所得税额">
            <span class="text-danger font-weight-700">{{ formatAmount(viewData.incomeTaxPayable) }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </template>

      <el-divider content-position="left">申报流程</el-divider>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="申报日期">{{ viewData.declarationDate || '未申报' }}</el-descriptions-item>
        <el-descriptions-item label="缴纳日期">{{ viewData.paymentDate || '未缴纳' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间" :span="2">{{ viewData.createdAt || '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ viewData.remark || '无' }}</el-descriptions-item>
      </el-descriptions>

      <template #footer>
        <el-button @click="viewDialogVisible = false">关闭</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, reactive, onMounted, computed, nextTick } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { formatAmount, formatLocalDate } from '@/utils/format'
import { Plus, Check, Money, Delete } from '@element-plus/icons-vue';
import { financeApi } from '@/api';
import { useFinanceStore } from '@/stores/finance';

const financeStore = useFinanceStore();
// 企业所得税率（百分比整数，如 25.0 = 25%），从 financeConfig.tax.incomeTaxRate 转换
const defaultIncomeTaxRatePercent = computed(() => financeStore.isLoaded
  ? (financeStore.taxConfig.incomeTaxRate ?? 0.25) * 100
  : 25.0
);
// 搜索表单
const searchForm = reactive({
  returnType: '',
  status: '',
  year: ''
});

const loading = ref(false);
const showAdvancedSearch = ref(false);
const createLoading = ref(false);
const tableData = ref([]);

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 50,
  total: 0
});

// 新增申报相关
const createDialogVisible = ref(false);
const createFormRef = ref(null);
const createForm = reactive({
  returnType: '增值税',
  returnPeriod: '',
  // 增值税字段
  salesAmount: 0,
  salesOutputTax: 0,
  purchaseAmount: 0,
  purchaseInputTax: 0,
  inputTaxDeduction: 0,
  taxPayable: 0,
  // 企业所得税字段
  totalRevenue: 0,
  totalCost: 0,
  totalExpense: 0,
  taxableIncome: 0,
  incomeTaxRate: defaultIncomeTaxRatePercent.value,
  incomeTaxPayable: 0,
  remark: ''
});

const createRules = {
  returnType: [{ required: true, message: '请选择申报类型', trigger: 'change' }],
  returnPeriod: [{ required: true, message: '请选择申报期间', trigger: 'change' }]
};

// 查看详情相关
const viewDialogVisible = ref(false);
const viewData = reactive({});

// 缴税相关
const payDialogVisible = ref(false);
const payLoading = ref(false);
const currentPayRow = ref(null);
const bankAccounts = ref([]);
const payForm = reactive({
  bank_account_id: null,
  paymentDate: ''
});
const payAmount = computed(() => {
  if (!currentPayRow.value) return null;
  return numericAmount(
    currentPayRow.value.returnType === '增值税'
      ? currentPayRow.value.taxPayable
      : currentPayRow.value.incomeTaxPayable
  );
});

// 表格高度
const tableHeight = computed(() => window.innerHeight - 320);

// 格式化金额 - 已统一使用 @/utils/format 导入
const isBlankAmount = (value) => value === null || value === undefined || value === '';
const numericAmount = (value) => {
  if (isBlankAmount(value)) return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
};
const formatTaxRate = (value) => {
  const number = numericAmount(value);
  return number === null ? '-' : `${number}%`;
};

// 获取申报类型颜色
const getReturnTypeColor = (type) => {
  const colorMap = {
    '增值税': 'success',
    '企业所得税': 'warning',
    '个人所得税': 'info'
  };
  return colorMap[type] || 'info';
};

// 获取状态类型
const getStatusType = (status) => {
  const typeMap = {
    '草稿': 'info',
    '已申报': 'warning',
    '已缴纳': 'success',
    '已作废': 'danger'
  };
  return typeMap[status] || 'info';
};

// 计算增值税应纳税额
const calcVATPayable = () => {
  createForm.taxPayable = Math.max(0,
    (createForm.salesOutputTax || 0) - (createForm.purchaseInputTax || 0) + (createForm.inputTaxDeduction || 0)
  );
};

// 计算企业所得税
const calcIncomeTax = () => {
  createForm.taxableIncome = Math.max(0,
    (createForm.totalRevenue || 0) - (createForm.totalCost || 0) - (createForm.totalExpense || 0)
  );
  createForm.incomeTaxPayable = createForm.taxableIncome * (createForm.incomeTaxRate / 100);
};

// 申报类型切换时重置金额
const handleTypeChange = () => {
  createForm.salesAmount = 0;
  createForm.salesOutputTax = 0;
  createForm.purchaseAmount = 0;
  createForm.purchaseInputTax = 0;
  createForm.inputTaxDeduction = 0;
  createForm.taxPayable = 0;
  createForm.totalRevenue = 0;
  createForm.totalCost = 0;
  createForm.totalExpense = 0;
  createForm.taxableIncome = 0;
  createForm.incomeTaxRate = defaultIncomeTaxRatePercent.value;
  createForm.incomeTaxPayable = 0;
};

// 加载数据
const loadData = async () => {
  await financeStore.loadSettings(); // 确保税率配置已加载
  loading.value = true;

  try {
    const params = {
      returnType: searchForm.returnType,
      status: searchForm.status,
      year: searchForm.year,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    };

    // 移除空参数
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });

    const response = await financeApi.tax.getReturns(params);

    // axiosInstance 已经解包了 ResponseHandler 响应
    const data = response.data;

    if (Array.isArray(data)) {
      tableData.value = data;
      pagination.total = data.length;
    } else if (data && Array.isArray(data.list)) {
      tableData.value = data.list;
      pagination.total = data.total ?? data.list.length;
    } else {
      tableData.value = [];
      pagination.total = 0;
    }
  } catch (error) {
    console.error('加载纳税申报列表失败:', error);
    ElMessage.error(error.response?.data?.message || error.message || '加载数据失败');
  } finally {
    loading.value = false;
  }
};

// 搜索
const handleSearch = () => {
  pagination.page = 1;
  loadData();
};

// 重置
const handleReset = () => {
  searchForm.returnType = '';
  searchForm.status = '';
  searchForm.year = '';
  pagination.page = 1;
  loadData();
};

// 新增申报
const handleCreate = async () => {
  // 重置表单
  handleTypeChange();
  createForm.returnType = '增值税';
  createForm.returnPeriod = '';
  createForm.remark = '';
  createDialogVisible.value = true;
  await nextTick();
  createFormRef.value?.clearValidate();
};

// 提交创建
const submitCreate = async () => {
  if (createLoading.value || !createFormRef.value) return;

  await createFormRef.value.validate(async (valid) => {
    if (!valid) return;

    createLoading.value = true;
    try {
      await financeApi.tax.createReturn({ ...createForm });
      ElMessage.success('纳税申报创建成功');
      createDialogVisible.value = false;
      loadData();
    } catch (error) {
      console.error('创建申报失败:', error);
      ElMessage.error(error.response?.data?.message || error.message || '创建失败');
    } finally {
      createLoading.value = false;
    }
  });
};

// 查看详情
const handleView = async (row) => {
  try {
    const response = await financeApi.tax.getReturn(row.id);
    const data = response.data;
    // 将数据复制到viewData
    Object.keys(data).forEach(key => {
      viewData[key] = data[key];
    });
    viewDialogVisible.value = true;
  } catch (error) {
    console.error('获取申报详情失败:', error);
    ElMessage.error(error.response?.data?.message || error.message || '获取详情失败');
  }
};

// 提交申报
const handleReopen = async (row) => {
  try {
    const { value } = await ElMessageBox.prompt('撤回后可重新提交，系统会按已认证及已抵扣税票重算税额。请填写原因。', '撤回申报', { inputValidator: value => Boolean(value?.trim()) || '请填写撤回原因' });
    await financeApi.tax.reopenReturn(row.id, { reason: value });
    ElMessage.success('申报已撤回');
    await loadData();
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error.response?.data?.message || error.message || '撤回失败'); }
};
const handleSubmit = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认提交 ${row.returnPeriod} 的${row.returnType}申报吗？`,
      '确认提交',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await financeApi.tax.submitReturn(row.id, {
      declarationDate: formatLocalDate(new Date())
    });

    ElMessage.success('申报提交成功');
    loadData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('提交申报失败:', error);
      ElMessage.error(error.response?.data?.message || error.message || '提交失败');
    }
  }
};

const loadBankAccounts = async () => {
  const response = await financeApi.getBankAccounts();
  const data = response.data;
  bankAccounts.value = Array.isArray(data) ? data : (data?.list || data?.data || []);
};

// 缴纳税款
const handlePay = async (row) => {
  try {
    currentPayRow.value = row;
    payForm.paymentDate = formatLocalDate(new Date());
    payForm.bankAccountId = null;

    if (bankAccounts.value.length === 0) {
      await loadBankAccounts();
    }

    if (payAmount.value === null) {
      ElMessage.warning('当前用户无权查看税额，无法执行缴税');
      return;
    }

    const availableAccount = bankAccounts.value.find(account => {
      const balance = numericAmount(account.balance);
      return balance !== null && balance >= payAmount.value;
    });
    payForm.bankAccountId = availableAccount?.id || null;
    payDialogVisible.value = true;
  } catch (error) {
    console.error('打开缴税窗口失败:', error);
    ElMessage.error(error.response?.data?.message || error.message || '打开缴税窗口失败');
  }
};

const confirmPay = async () => {
  if (!currentPayRow.value) return;
  if (payAmount.value === null) {
    ElMessage.warning('当前用户无权查看税额，无法执行缴税');
    return;
  }
  if (payAmount.value > 0 && !payForm.bankAccountId) {
    ElMessage.warning('请选择付款账户');
    return;
  }
  if (!payForm.paymentDate) {
    ElMessage.warning('请选择缴纳日期');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认缴纳 ${currentPayRow.value.returnPeriod} 的${currentPayRow.value.returnType} ${formatAmount(payAmount.value)} 元吗？`,
      '确认缴纳',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    payLoading.value = true;
    const response = await financeApi.tax.payReturn(currentPayRow.value.id, {
      paymentDate: payForm.paymentDate,
      bank_account_id: payForm.bankAccountId
    });

    ElMessage.success(response?._message || '税款缴纳成功');
    payDialogVisible.value = false;
    await Promise.all([loadData(), loadBankAccounts()]);
  } catch (error) {
    if (error !== 'cancel') {
      console.error('缴纳税款失败:', error);
      ElMessage.error(error.response?.data?.message || error.message || '缴纳失败');
    }
  } finally {
    payLoading.value = false;
  }
};

const handleVoidPayment = async (row) => {
  try {
    const { value } = await ElMessageBox.prompt(
      `确定作废 ${row.returnPeriod} ${row.returnType} 的缴税记录吗？将冲销银行流水与会计凭证。`,
      '作废税款缴纳',
      {
        confirmButtonText: '确认作废',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '请填写作废原因',
        type: 'warning',
      }
    );
    await financeApi.tax.voidReturnPayment(row.id, { void_reason: value });
    ElMessage.success('税款缴纳已作废');
    await loadData();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || error.message || '作废失败');
    }
  }
};

// 删除申报
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认删除 ${row.returnPeriod} 的${row.returnType}申报吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'error'
      }
    );

    await financeApi.tax.deleteReturn(row.id);
    ElMessage.success('删除成功');
    loadData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除申报失败:', error);
      ElMessage.error(error.response?.data?.message || error.message || '删除失败');
    }
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
</script>

<style scoped>
.tax-returns-container {
  padding: 20px;
}

.search-card {
  margin-bottom: 20px;
}

.search-form {
  display: flex;
  flex-wrap: wrap;
}

.table-card {
  background: var(--color-bg-base);
}
</style>
