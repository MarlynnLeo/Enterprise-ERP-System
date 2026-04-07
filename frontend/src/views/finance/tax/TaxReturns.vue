<template>
  <div class="tax-returns-container">
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="申报类型">
          <el-select v-model="searchForm.return_type" placeholder="请选择" clearable>
            <el-option label="增值税" value="增值税" />
            <el-option label="企业所得税" value="企业所得税" />
            <el-option label="个人所得税" value="个人所得税" />
          </el-select>
        </el-form-item>
        
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
        
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :icon="Search">查询</el-button>
          <el-button @click="handleReset" :icon="Refresh">重置</el-button>
          <el-button v-permission="'finance:taxreturns:create'" type="success" @click="handleCreate" :icon="Plus">新增申报</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table
        :data="tableData"
        v-loading="loading"
        border
        stripe
        style="width: 100%"
        :height="tableHeight"
      >
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="return_period" label="申报期间" width="120" align="center" />
        <el-table-column prop="return_type" label="申报类型" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="getReturnTypeColor(row.return_type)">
              {{ row.return_type }}
            </el-tag>
          </template>
        </el-table-column>
        
        <!-- 增值税相关列 -->
        <el-table-column v-if="searchForm.return_type === '增值税' || !searchForm.return_type" 
          prop="sales_amount" label="销售额" width="120" align="right">
          <template #default="{ row }">
            {{ row.return_type === '增值税' ? formatAmount(row.sales_amount) : '-' }}
          </template>
        </el-table-column>
        <el-table-column v-if="searchForm.return_type === '增值税' || !searchForm.return_type" 
          prop="sales_output_tax" label="销项税额" width="120" align="right">
          <template #default="{ row }">
            {{ row.return_type === '增值税' ? formatAmount(row.sales_output_tax) : '-' }}
          </template>
        </el-table-column>
        <el-table-column v-if="searchForm.return_type === '增值税' || !searchForm.return_type" 
          prop="purchase_input_tax" label="进项税额" width="120" align="right">
          <template #default="{ row }">
            {{ row.return_type === '增值税' ? formatAmount(row.purchase_input_tax) : '-' }}
          </template>
        </el-table-column>
        
        <!-- 企业所得税相关列 -->
        <el-table-column v-if="searchForm.return_type === '企业所得税' || !searchForm.return_type" 
          prop="total_revenue" label="营业收入" width="120" align="right">
          <template #default="{ row }">
            {{ row.return_type === '企业所得税' ? formatAmount(row.total_revenue) : '-' }}
          </template>
        </el-table-column>
        <el-table-column v-if="searchForm.return_type === '企业所得税' || !searchForm.return_type" 
          prop="taxable_income" label="应纳税所得额" width="140" align="right">
          <template #default="{ row }">
            {{ row.return_type === '企业所得税' ? formatAmount(row.taxable_income) : '-' }}
          </template>
        </el-table-column>
        
        <!-- 通用列 -->
        <el-table-column prop="tax_payable" label="应纳税额" width="120" align="right">
          <template #default="{ row }">
            <span style="color: #f56c6c; font-weight: bold;">
              {{ formatAmount(row.return_type === '增值税' ? row.tax_payable : row.income_tax_payable) }}
            </span>
          </template>
        </el-table-column>
        
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column prop="declaration_date" label="申报日期" width="120" align="center" />
        <el-table-column prop="payment_date" label="缴纳日期" width="120" align="center" />
        <el-table-column prop="creator_name" label="创建人" width="100" align="center" />
        
        <el-table-column label="操作" width="280" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleView(row)" :icon="View">查看</el-button>
            
            <!-- 提交申报按钮：只在草稿状态显示 -->
            <el-button 
              v-if="row.status === '草稿'" 
              type="success" 
              size="small" 
              @click="handleSubmit(row)"
              :icon="Check"
            >提交申报</el-button>
            
            <!-- 缴纳税款按钮：只在已申报状态显示 -->
            <el-button 
              v-if="row.status === '已申报'" 
              type="warning" 
              size="small" 
              @click="handlePay(row)"
              :icon="Money"
            >缴纳税款</el-button>
            
            <!-- 删除按钮：只在草稿状态显示 -->
            <el-button 
              v-if="row.status === '草稿'" 
              type="danger" 
              size="small" 
              @click="handleDelete(row)"
              :icon="Delete"
            >删除</el-button>
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
        style="margin-top: 20px; justify-content: flex-end"
      />
    </el-card>

    <!-- 新增申报对话框 -->
    <el-dialog title="新增税务申报" v-model="createDialogVisible" width="650px" destroy-on-close>
      <el-form :model="createForm" :rules="createRules" ref="createFormRef" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="申报类型" prop="return_type">
              <el-select v-model="createForm.return_type" placeholder="请选择" style="width: 100%" @change="handleTypeChange">
                <el-option label="增值税" value="增值税" />
                <el-option label="企业所得税" value="企业所得税" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="申报期间" prop="return_period">
              <el-date-picker v-model="createForm.return_period" type="month" placeholder="选择期间" value-format="YYYY-MM" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 增值税表单 -->
        <template v-if="createForm.return_type === '增值税'">
          <el-divider content-position="left">增值税数据</el-divider>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="销售额">
                <el-input-number v-model="createForm.sales_amount" :precision="2" :min="0" style="width: 100%" @change="calcVATPayable" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="销项税额">
                <el-input-number v-model="createForm.sales_output_tax" :precision="2" :min="0" style="width: 100%" @change="calcVATPayable" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="采购额">
                <el-input-number v-model="createForm.purchase_amount" :precision="2" :min="0" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="进项税额">
                <el-input-number v-model="createForm.purchase_input_tax" :precision="2" :min="0" style="width: 100%" @change="calcVATPayable" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="进项税转出">
                <el-input-number v-model="createForm.input_tax_deduction" :precision="2" :min="0" style="width: 100%" @change="calcVATPayable" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="应纳税额">
                <el-input-number v-model="createForm.tax_payable" :precision="2" style="width: 100%" disabled />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- 企业所得税表单 -->
        <template v-if="createForm.return_type === '企业所得税'">
          <el-divider content-position="left">企业所得税数据</el-divider>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="营业收入">
                <el-input-number v-model="createForm.total_revenue" :precision="2" :min="0" style="width: 100%" @change="calcIncomeTax" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="营业成本">
                <el-input-number v-model="createForm.total_cost" :precision="2" :min="0" style="width: 100%" @change="calcIncomeTax" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="期间费用">
                <el-input-number v-model="createForm.total_expense" :precision="2" :min="0" style="width: 100%" @change="calcIncomeTax" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="应纳税所得额">
                <el-input-number v-model="createForm.taxable_income" :precision="2" style="width: 100%" disabled />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="税率(%)">
                <el-input-number v-model="createForm.income_tax_rate" :precision="1" :min="0" :max="100" style="width: 100%" @change="calcIncomeTax" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="应纳所得税额">
                <el-input-number v-model="createForm.income_tax_payable" :precision="2" style="width: 100%" disabled />
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
        <el-button type="primary" @click="submitCreate" :loading="createLoading">确认创建</el-button>
      </template>
    </el-dialog>

    <!-- 查看详情对话框 -->
    <el-dialog title="税务申报详情" v-model="viewDialogVisible" width="650px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="申报期间">{{ viewData.return_period }}</el-descriptions-item>
        <el-descriptions-item label="申报类型">
          <el-tag :type="getReturnTypeColor(viewData.return_type)">{{ viewData.return_type }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(viewData.status)">{{ viewData.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建人">{{ viewData.creator_name || '-' }}</el-descriptions-item>
      </el-descriptions>

      <!-- 增值税详情 -->
      <template v-if="viewData.return_type === '增值税'">
        <el-divider content-position="left">增值税数据</el-divider>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="销售额">{{ formatAmount(viewData.sales_amount) }}</el-descriptions-item>
          <el-descriptions-item label="销项税额">{{ formatAmount(viewData.sales_output_tax) }}</el-descriptions-item>
          <el-descriptions-item label="采购额">{{ formatAmount(viewData.purchase_amount) }}</el-descriptions-item>
          <el-descriptions-item label="进项税额">{{ formatAmount(viewData.purchase_input_tax) }}</el-descriptions-item>
          <el-descriptions-item label="进项税转出">{{ formatAmount(viewData.input_tax_deduction) }}</el-descriptions-item>
          <el-descriptions-item label="应纳税额">
            <span style="color: #f56c6c; font-weight: bold;">{{ formatAmount(viewData.tax_payable) }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </template>

      <!-- 企业所得税详情 -->
      <template v-if="viewData.return_type === '企业所得税'">
        <el-divider content-position="left">企业所得税数据</el-divider>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="营业收入">{{ formatAmount(viewData.total_revenue) }}</el-descriptions-item>
          <el-descriptions-item label="营业成本">{{ formatAmount(viewData.total_cost) }}</el-descriptions-item>
          <el-descriptions-item label="期间费用">{{ formatAmount(viewData.total_expense) }}</el-descriptions-item>
          <el-descriptions-item label="应纳税所得额">{{ formatAmount(viewData.taxable_income) }}</el-descriptions-item>
          <el-descriptions-item label="税率">{{ viewData.income_tax_rate }}%</el-descriptions-item>
          <el-descriptions-item label="应纳所得税额">
            <span style="color: #f56c6c; font-weight: bold;">{{ formatAmount(viewData.income_tax_payable) }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </template>

      <el-divider content-position="left">申报流程</el-divider>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="申报日期">{{ viewData.declaration_date || '未申报' }}</el-descriptions-item>
        <el-descriptions-item label="缴纳日期">{{ viewData.payment_date || '未缴纳' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间" :span="2">{{ viewData.created_at || '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ viewData.remark || '无' }}</el-descriptions-item>
      </el-descriptions>

      <template #footer>
        <el-button @click="viewDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Refresh, Plus, View, Check, Money, Delete } from '@element-plus/icons-vue';
import { api } from '@/services/axiosInstance';

// 搜索表单
const searchForm = reactive({
  return_type: '',
  status: '',
  year: ''
});

const loading = ref(false);
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
  return_type: '增值税',
  return_period: '',
  // 增值税字段
  sales_amount: 0,
  sales_output_tax: 0,
  purchase_amount: 0,
  purchase_input_tax: 0,
  input_tax_deduction: 0,
  tax_payable: 0,
  // 企业所得税字段
  total_revenue: 0,
  total_cost: 0,
  total_expense: 0,
  taxable_income: 0,
  income_tax_rate: 25.0,
  income_tax_payable: 0,
  remark: ''
});

const createRules = {
  return_type: [{ required: true, message: '请选择申报类型', trigger: 'change' }],
  return_period: [{ required: true, message: '请选择申报期间', trigger: 'change' }]
};

// 查看详情相关
const viewDialogVisible = ref(false);
const viewData = reactive({});

// 表格高度
const tableHeight = computed(() => window.innerHeight - 320);

// 格式化金额
const formatAmount = (amount) => {
  if (!amount) return '0.00';
  return parseFloat(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
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
  createForm.tax_payable = Math.max(0,
    (createForm.sales_output_tax || 0) - (createForm.purchase_input_tax || 0) + (createForm.input_tax_deduction || 0)
  );
};

// 计算企业所得税
const calcIncomeTax = () => {
  createForm.taxable_income = Math.max(0,
    (createForm.total_revenue || 0) - (createForm.total_cost || 0) - (createForm.total_expense || 0)
  );
  createForm.income_tax_payable = createForm.taxable_income * (createForm.income_tax_rate / 100);
};

// 申报类型切换时重置金额
const handleTypeChange = () => {
  createForm.sales_amount = 0;
  createForm.sales_output_tax = 0;
  createForm.purchase_amount = 0;
  createForm.purchase_input_tax = 0;
  createForm.input_tax_deduction = 0;
  createForm.tax_payable = 0;
  createForm.total_revenue = 0;
  createForm.total_cost = 0;
  createForm.total_expense = 0;
  createForm.taxable_income = 0;
  createForm.income_tax_rate = 25.0;
  createForm.income_tax_payable = 0;
};

// 加载数据
const loadData = async () => {
  loading.value = true;

  try {
    const params = {
      return_type: searchForm.return_type,
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

    const response = await api.get('/finance/tax/returns', { params });

    // axiosInstance 已经解包了 ResponseHandler 响应
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
  } catch (error) {
    console.error('加载税务申报列表失败:', error);
    ElMessage.error(error.message || '加载数据失败');
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
  searchForm.return_type = '';
  searchForm.status = '';
  searchForm.year = '';
  pagination.page = 1;
  loadData();
};

// 新增申报
const handleCreate = () => {
  // 重置表单
  handleTypeChange();
  createForm.return_type = '增值税';
  createForm.return_period = '';
  createForm.remark = '';
  createDialogVisible.value = true;
};

// 提交创建
const submitCreate = async () => {
  if (!createFormRef.value) return;
  
  await createFormRef.value.validate(async (valid) => {
    if (!valid) return;
    
    createLoading.value = true;
    try {
      await api.post('/finance/tax/returns', { ...createForm });
      ElMessage.success('税务申报创建成功');
      createDialogVisible.value = false;
      loadData();
    } catch (error) {
      console.error('创建申报失败:', error);
      ElMessage.error(error.message || '创建失败');
    } finally {
      createLoading.value = false;
    }
  });
};

// 查看详情
const handleView = async (row) => {
  try {
    const response = await api.get(`/finance/tax/returns/${row.id}`);
    const data = response.data;
    // 将数据复制到viewData
    Object.keys(data).forEach(key => {
      viewData[key] = data[key];
    });
    viewDialogVisible.value = true;
  } catch (error) {
    console.error('获取申报详情失败:', error);
    ElMessage.error(error.message || '获取详情失败');
  }
};

// 提交申报
const handleSubmit = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认提交 ${row.return_period} 的${row.return_type}申报吗？`,
      '确认提交',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await api.post(`/finance/tax/returns/${row.id}/submit`, {
      declaration_date: new Date().toISOString().split('T')[0]
    });

    ElMessage.success('申报提交成功');
    loadData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('提交申报失败:', error);
      ElMessage.error(error.message || '提交失败');
    }
  }
};

// 缴纳税款
const handlePay = async (row) => {
  const taxAmount = row.return_type === '增值税' ? row.tax_payable : row.income_tax_payable;

  try {
    await ElMessageBox.confirm(
      `确认缴纳 ${row.return_period} 的${row.return_type} ${formatAmount(taxAmount)} 元吗？缴纳后将自动生成会计分录。`,
      '确认缴纳',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await api.post(`/finance/tax/returns/${row.id}/pay`, {
      payment_date: new Date().toISOString().split('T')[0]
    });

    ElMessage.success('税款缴纳成功，会计分录已自动生成');
    loadData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('缴纳税款失败:', error);
      ElMessage.error(error.message || '缴纳失败');
    }
  }
};

// 删除申报
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认删除 ${row.return_period} 的${row.return_type}申报吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'error'
      }
    );

    await api.delete(`/finance/tax/returns/${row.id}`);
    ElMessage.success('删除成功');
    loadData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除申报失败:', error);
      ElMessage.error(error.message || '删除失败');
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
  background: #fff;
}
</style>

