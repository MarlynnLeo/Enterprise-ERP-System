<template>
  <div class="actual-cost-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>实际成本查询</h2>
          <p class="subtitle">查询生产订单实际成本</p>
        </div>
      </div>
    </el-card>

    <!-- 搜索表单 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="生产订单号">
          <el-input v-model="searchForm.orderNumber" placeholder="请输入订单号" clearable></el-input>
        </el-form-item>
        <el-form-item label="产品名称">
          <el-input v-model="searchForm.productName" placeholder="请输入产品名称" clearable></el-input>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"

          ></el-date-picker>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadActualCosts">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="costList" border v-loading="loading" style="width: 100%">
        <el-table-column prop="order_number" label="生产订单号" width="150"></el-table-column>
        <el-table-column prop="product_code" label="产品编码" width="150"></el-table-column>
        <el-table-column prop="product_name" label="产品名称" width="260"></el-table-column>
        <el-table-column prop="quantity" label="生产数量" width="110" align="right"></el-table-column>
        <el-table-column label="材料成本" width="130" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.material_cost) }}
          </template>
        </el-table-column>
        <el-table-column label="人工成本" width="120" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.labor_cost) }}
          </template>
        </el-table-column>
        <el-table-column label="制造费用" width="130" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.overhead_cost) }}
          </template>
        </el-table-column>
        <el-table-column label="总成本" width="140" align="right">
          <template #default="scope">
            <span style="font-weight: bold; color: #409eff;">
              {{ formatCurrency(scope.row.total_cost) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="单位成本" width="140" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.unit_cost) }}
          </template>
        </el-table-column>
        <el-table-column prop="completion_date" label="完工日期" width="110"></el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="scope">
            <el-button type="primary" size="small" @click="viewDetail(scope.row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadActualCosts"
          @current-change="loadActualCosts"
        />
      </div>
    </el-card>

    <!-- 成本详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="实际成本详情" width="900px">
      <div v-if="currentDetail">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="生产订单号">{{ currentDetail.order_number }}</el-descriptions-item>
          <el-descriptions-item label="产品编码">{{ currentDetail.product_code }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ currentDetail.product_name }}</el-descriptions-item>
          <el-descriptions-item label="生产数量">{{ currentDetail.quantity }}</el-descriptions-item>
          <el-descriptions-item label="完工日期">{{ currentDetail.completion_date }}</el-descriptions-item>
          <el-descriptions-item label="成本核算方法">{{ getCostingMethodText(currentDetail.costing_method) }}</el-descriptions-item>
          <el-descriptions-item label="材料成本">{{ formatCurrency(currentDetail.material_cost) }}</el-descriptions-item>
          <el-descriptions-item label="人工成本">{{ formatCurrency(currentDetail.labor_cost) }}</el-descriptions-item>
          <el-descriptions-item label="制造费用">{{ formatCurrency(currentDetail.overhead_cost) }}</el-descriptions-item>
          <el-descriptions-item label="总成本" :span="2">
            <span style="font-size: 18px; font-weight: bold; color: #409eff;">
              {{ formatCurrency(currentDetail.total_cost) }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="单位成本">{{ formatCurrency(currentDetail.unit_cost) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider>成本明细</el-divider>
        
        <el-tabs v-model="activeTab">
          <el-tab-pane label="材料消耗明细" name="material">
            <el-table :data="currentDetail.material_details" border size="small" max-height="300">
              <el-table-column prop="material_code" label="物料编码" width="100"></el-table-column>
              <el-table-column prop="material_name" label="物料名称" width="170"></el-table-column>
              <el-table-column prop="quantity" label="消耗数量" width="100" align="right"></el-table-column>
              <el-table-column prop="unit_cost" label="单位成本" width="100" align="right"></el-table-column>
              <el-table-column prop="total_cost" label="总成本" width="100" align="right"></el-table-column>
              <el-table-column prop="batch_number" label="批次号" width="138"></el-table-column>
              <el-table-column prop="issue_date" label="领用日期" width="110"></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="人工工时明细" name="labor">
            <el-table :data="currentDetail.labor_details" border size="small" max-height="300">
              <el-table-column prop="workstation" label="工作中心" width="200"></el-table-column>
              <el-table-column prop="operator" label="操作员" width="120"></el-table-column>
              <el-table-column prop="work_hours" label="工时(小时)" width="125" align="right"></el-table-column>
              <el-table-column prop="hourly_rate" label="小时费率" width="120" align="right"></el-table-column>
              <el-table-column prop="total_cost" label="总成本" width="120" align="right"></el-table-column>
              <el-table-column prop="work_date" label="工作日期" width="130"></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="制造费用明细" name="overhead">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="分摊基础">{{ currentDetail.overhead_details?.allocation_base }}</el-descriptions-item>
              <el-descriptions-item label="分摊率">{{ currentDetail.overhead_details?.rate }}</el-descriptions-item>
              <el-descriptions-item label="基础成本">{{ formatCurrency(currentDetail.overhead_details?.base_cost) }}</el-descriptions-item>
              <el-descriptions-item label="计算费用">{{ formatCurrency(currentDetail.overhead_details?.calculated_cost) }}</el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>

          <el-tab-pane label="财务凭证" name="vouchers">
            <el-table :data="currentDetail.related_vouchers" border size="small" max-height="300" empty-text="暂无关联凭证">
              <el-table-column prop="document_number" label="凭证号" width="120"></el-table-column>
              <el-table-column prop="entry_date" label="会计日期" width="108">
                 <template #default="scope">
                    {{ scope.row.entry_date ? scope.row.entry_date.substring(0, 10) : '' }}
                 </template>
              </el-table-column>
              <el-table-column prop="description" label="摘要" min-width="200"></el-table-column>
              <el-table-column prop="transaction_type" label="业务类型" width="120">
                  <template #default="scope">
                    <el-tag size="small" :type="getTransactionTypeColor(scope.row.transaction_type)">
                      {{ getTransactionTypeText(scope.row.transaction_type) }}
                    </el-tag>
                  </template>
              </el-table-column>
              <el-table-column prop="total_amount" label="金额" width="100" align="right">
                 <template #default="scope">
                    {{ formatCurrency(scope.row.total_amount) }}
                 </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="90">
                <template #default="scope">
                  <el-tag size="small" :type="scope.row.status === 'approved' ? 'success' : (scope.row.status === 'draft' ? 'info' : 'warning')">
                    {{ scope.row.status === 'approved' ? '已审核' : (scope.row.status === 'draft' ? '草稿' : scope.row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
               <el-table-column prop="is_posted" label="过账" width="80" align="center">
                <template #default="scope">
                  <el-icon v-if="scope.row.is_posted" color="#67C23A"><Check /></el-icon>
                  <el-icon v-else color="#909399"><Minus /></el-icon>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Check, Minus } from '@element-plus/icons-vue';
import api from '@/services/api';
import { getCostingMethodText, getGLTransactionTypeText, getGLTransactionTypeColor } from '@/constants/systemConstants';
import { formatCurrency } from '@/utils/helpers/formatters';

const loading = ref(false);
const detailDialogVisible = ref(false);
const activeTab = ref('material');

// 搜索表单
const searchForm = reactive({
  orderNumber: '',
  productName: '',
  dateRange: []
});

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
});

// 数据列表
const costList = ref([]);
const currentDetail = ref(null);

// 使用统一映射（别名保持模板兼容）
const getTransactionTypeText = getGLTransactionTypeText;
const getTransactionTypeColor = getGLTransactionTypeColor;

// 加载实际成本列表
const loadActualCosts = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize
    };
    if (searchForm.orderNumber) params.orderNumber = searchForm.orderNumber;
    if (searchForm.productName) params.productName = searchForm.productName;
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }
    
    const res = await api.get('/finance-enhancement/cost/actual', { params });
    // axios拦截器已解包，res.data即为{ list, total }
    if (res.data && res.data.list) {
      costList.value = res.data.list;
      pagination.total = Number(res.data.total) || 0;
    } else if (res.data && res.data.data) {
      // 兼容未解包的情况
      costList.value = res.data.data.list || [];
      pagination.total = Number(res.data.data.total) || 0;
    } else {
      costList.value = [];
      pagination.total = 0;
    }
  } catch (error) {
    console.error('加载实际成本失败:', error);
    ElMessage.error('加载实际成本失败');
    costList.value = [];
  } finally {
    loading.value = false;
  }
};

// 查看详情
const viewDetail = async (row) => {
  try {
    // 从order_number中提取taskId，或者使用id
    const taskId = row.id;
    const res = await api.get(`/finance-enhancement/cost/actual/${taskId}`);
    // axios拦截器已解包
    if (res.data) {
      currentDetail.value = res.data.data || res.data;
    } else {
      currentDetail.value = row;
    }
  } catch (error) {
    console.error('获取详情失败:', error);
    // 降级使用行数据
    currentDetail.value = {
      ...row,
      material_details: [],
      labor_details: [],
      overhead_details: {}
    };
  }
  detailDialogVisible.value = true;
};

// 重置搜索
const resetSearch = () => {
  searchForm.orderNumber = '';
  searchForm.productName = '';
  searchForm.dateRange = [];
  loadActualCosts();
};

// 页面加载时初始化
onMounted(() => {
  loadActualCosts();
});
</script>

<style scoped>
.actual-cost-container {
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
  margin: 0;
  font-size: 24px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 5px 0 0 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.search-card {
  margin-bottom: 20px;
}

.search-form {
  margin-bottom: 0;
}

.data-card {
  margin-bottom: 20px;
}

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>

