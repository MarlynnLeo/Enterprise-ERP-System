<template>
  <div class="module-page actual-cost-container">
    <!-- 页面标题 -->
    <PageHeader title="实际成本" subtitle="查询生产订单实际成本" />

    <!-- 搜索表单 -->
    <FinanceQueryCard
      :model="searchForm"
      :expanded="showAdvancedSearch"
      :loading="loading"
      @update:expanded="showAdvancedSearch = $event"
      @search="loadActualCosts"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="生产订单号">
          <el-input v-model="searchForm.orderNumber" placeholder="请输入订单号" clearable></el-input>
        </el-form-item>
        <el-form-item label="产品名称">
          <el-input v-model="searchForm.productName" placeholder="请输入产品名称" clearable></el-input>
        </el-form-item>
      </template>
      <template #advanced>
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
      </template>
    </FinanceQueryCard>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="costList" border v-loading="loading" class="w-full">
        <el-table-column prop="orderNumber" label="生产订单号" width="150"></el-table-column>
        <el-table-column prop="productCode" label="产品编码" width="150"></el-table-column>
        <el-table-column prop="productName" label="产品名称" width="260"></el-table-column>
        <el-table-column prop="quantity" label="生产数量" width="110"></el-table-column>
        <el-table-column label="材料成本" width="130">
          <template #default="scope">
            {{ formatCurrency(scope.row.materialCost) }}
          </template>
        </el-table-column>
        <el-table-column label="人工成本" width="120">
          <template #default="scope">
            {{ formatCurrency(scope.row.laborCost) }}
          </template>
        </el-table-column>
        <el-table-column label="制造费用" width="130">
          <template #default="scope">
            {{ formatCurrency(scope.row.overheadCost) }}
          </template>
        </el-table-column>
        <el-table-column label="总成本" width="140">
          <template #default="scope">
            <span class="text-primary font-weight-700">
              {{ formatCurrency(scope.row.totalCost) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="单位成本" width="140">
          <template #default="scope">
            {{ formatCurrency(scope.row.unitCost) }}
          </template>
        </el-table-column>
        <el-table-column prop="completionDate" label="完工日期" width="110"></el-table-column>
        <el-table-column label="操作" min-width="100" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button class="btn-op-view" type="primary" size="small" @click="viewDetail(scope.row)">详情</el-button>
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
    <AppDialog
      v-model="detailDialogVisible"
      title="实际成本详情"
      mode="view"
      content-width="wide"
    >
      <div v-if="currentDetail">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="生产订单号">{{ currentDetail.orderNumber }}</el-descriptions-item>
          <el-descriptions-item label="产品编码">{{ currentDetail.productCode }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ currentDetail.productName }}</el-descriptions-item>
          <el-descriptions-item label="生产数量">{{ currentDetail.quantity }}</el-descriptions-item>
          <el-descriptions-item label="完工日期">{{ currentDetail.completion_date }}</el-descriptions-item>
          <el-descriptions-item label="成本核算方法">{{ getCostingMethodText(currentDetail.costing_method) }}</el-descriptions-item>
          <el-descriptions-item label="材料成本">{{ formatCurrency(currentDetail.material_cost) }}</el-descriptions-item>
          <el-descriptions-item label="人工成本">{{ formatCurrency(currentDetail.labor_cost) }}</el-descriptions-item>
          <el-descriptions-item label="制造费用">{{ formatCurrency(currentDetail.overhead_cost) }}</el-descriptions-item>
          <el-descriptions-item label="总成本" :span="2">
            <span style="font-size: 18px; font-weight: bold; color: var(--color-primary);">
              {{ formatCurrency(currentDetail.total_cost) }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="单位成本">{{ formatCurrency(currentDetail.unit_cost) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider>成本明细</el-divider>

        <el-tabs v-model="activeTab">
          <el-tab-pane label="材料消耗明细" name="material">
            <el-table :data="currentDetail.material_details" border size="small" max-height="300">
              <el-table-column prop="materialCode" label="物料编码" width="100"></el-table-column>
              <el-table-column prop="materialName" label="物料名称" width="170"></el-table-column>
              <el-table-column prop="quantity" label="消耗数量" width="100"></el-table-column>
              <el-table-column prop="unitCost" label="单位成本" width="100"></el-table-column>
              <el-table-column prop="totalCost" label="总成本" width="100"></el-table-column>
              <el-table-column prop="issueType" label="类型" width="96"></el-table-column>
              <el-table-column prop="batchNumber" label="批次号" width="138"></el-table-column>
              <el-table-column prop="issueDate" label="领用日期" width="110"></el-table-column>
              <el-table-column prop="documentNumbers" label="来源单据" min-width="180"></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="人工工时明细" name="labor">
            <el-table :data="currentDetail.labor_details" border size="small" max-height="300">
              <el-table-column prop="workstation" label="工作中心" width="200"></el-table-column>
              <el-table-column prop="operator" label="操作员" width="120"></el-table-column>
              <el-table-column prop="workHours" label="工时(小时)" width="125"></el-table-column>
              <el-table-column prop="hourlyRate" label="小时费率" width="120"></el-table-column>
              <el-table-column prop="totalCost" label="总成本" width="120"></el-table-column>
              <el-table-column prop="workDate" label="工作日期" width="130"></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="制造费用明细" name="overhead">
            <el-table :data="currentDetail.overhead_details || []" border size="small" max-height="300" empty-text="暂无制造费用分摊明细">
              <el-table-column prop="ruleName" label="分摊规则" min-width="180"></el-table-column>
              <el-table-column prop="allocationBase" label="分摊基础" width="120"></el-table-column>
              <el-table-column prop="rate" label="分摊率" width="100"></el-table-column>
              <el-table-column label="基础成本" width="130">
                <template #default="scope">
                  {{ formatCurrency(scope.row.baseCost) }}
                </template>
              </el-table-column>
              <el-table-column label="计算费用" width="130">
                <template #default="scope">
                  {{ formatCurrency(scope.row.calculatedCost) }}
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="财务凭证" name="vouchers">
            <el-table :data="currentDetail.related_vouchers" border size="small" max-height="300" empty-text="暂无关联凭证">
              <el-table-column prop="documentNumber" label="凭证号" width="120"></el-table-column>
              <el-table-column prop="entryDate" label="会计日期" width="108">
                 <template #default="scope">
                    {{ scope.row.entryDate ? scope.row.entryDate.substring(0, 10) : '' }}
                 </template>
              </el-table-column>
              <el-table-column prop="description" label="摘要" min-width="200"></el-table-column>
              <el-table-column prop="transactionType" label="业务类型" width="120">
                  <template #default="scope">
                    <el-tag size="small" :type="getTransactionTypeColor(scope.row.transactionType)">
                      {{ getTransactionTypeText(scope.row.transactionType) }}
                    </el-tag>
                  </template>
              </el-table-column>
              <el-table-column prop="totalAmount" label="金额" width="100">
                 <template #default="scope">
                    {{ formatCurrency(scope.row.totalAmount) }}
                 </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="90">
                <template #default="scope">
                  <el-tag size="small" :type="scope.row.status === 'approved' ? 'success' : (scope.row.status === 'draft' ? 'info' : 'warning')">
                    {{ scope.row.status === 'approved' ? '已审核' : (scope.row.status === 'draft' ? '草稿' : scope.row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
               <el-table-column prop="isPosted" label="过账" width="80">
                <template #default="scope">
                  <el-icon v-if="scope.row.isPosted" color="var(--color-success)"><Check /></el-icon>
                  <el-icon v-else color="var(--color-text-secondary)"><Minus /></el-icon>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Check, Minus } from '@element-plus/icons-vue';
import { financeApi } from '@/api';
import { getCostingMethodText, getGLTransactionTypeText, getGLTransactionTypeColor } from '@/constants/systemConstants';
import { formatCurrency } from '@/utils/helpers/formatters';
import { parsePaginatedData, parseResponseData } from '@/utils/responseParser'

const loading = ref(false);
const showAdvancedSearch = ref(false);
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

    const res = await financeApi.cost.getActualCost(params);
    const { list, total } = parsePaginatedData(res, { enableLog: false });
    costList.value = list;
    pagination.total = Number(total) || 0;
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
    const res = await financeApi.cost.getActualCostDetail(taskId);
    // axios拦截器已解包
    if (res.data) {
      currentDetail.value = parseResponseData(res);
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
      overhead_details: [],
      related_vouchers: []
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

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
