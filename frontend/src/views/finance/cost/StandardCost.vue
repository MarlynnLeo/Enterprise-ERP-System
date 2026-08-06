<template>
  <div class="module-page standard-cost-container">
    <!-- 页面标题 -->
    <PageHeader title="标准成本" subtitle="设置和查询产品标准成本">
      <template #actions>
<el-button v-permission="'finance:cost:execute'" type="primary" @click="showCalculateDialog">计算标准成本</el-button>
      </template>
    </PageHeader>

    <!-- 搜索表单 -->
    <FinanceQueryCard
      :model="searchForm"
      @search="loadStandardCosts"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="产品名称">
          <el-input v-model="searchForm.productName" placeholder="请输入产品名称" clearable></el-input>
        </el-form-item>
        <el-form-item label="产品编码">
          <el-input v-model="searchForm.productCode" placeholder="请输入产品编码" clearable></el-input>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="costList" border v-loading="loading" class="w-full">
        <el-table-column prop="productCode" label="产品编码" width="140"></el-table-column>
        <el-table-column prop="productName" label="产品名称" width="350"></el-table-column>
        <el-table-column label="材料成本" width="130">
          <template #default="scope">
            {{ formatCurrency(scope.row.materialCost) }}
          </template>
        </el-table-column>
        <el-table-column label="人工成本" width="130">
          <template #default="scope">
            {{ formatCurrency(scope.row.laborCost) }}
          </template>
        </el-table-column>
        <el-table-column label="制造费用" width="130">
          <template #default="scope">
            {{ formatCurrency(scope.row.overheadCost) }}
          </template>
        </el-table-column>
        <el-table-column label="总成本" width="130">
          <template #default="scope">
            <span class="text-primary font-weight-700">
              {{ formatCurrency(scope.row.totalCost) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="单位成本" width="120">
          <template #default="scope">
            {{ formatCurrency(scope.row.unitCost) }}
          </template>
        </el-table-column>
        <el-table-column prop="effectiveDate" label="生效日期" width="120"></el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.isActive ? 'success' : 'info'">
              {{ scope.row.isActive ? '有效' : '失效' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button v-permission="'finance:cost:update'" type="info" size="small" @click="openOverheadConfig(scope.row)">配置专费</el-button>
            <el-button class="btn-op-view" type="primary" size="small" @click="viewDetail(scope.row)">详情</el-button>
            <el-button v-permission="'finance:cost:execute'" type="warning" size="small" @click="recalculate(scope.row)">重算</el-button>
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
          @size-change="loadStandardCosts"
          @current-change="loadStandardCosts"
        />
      </div>
    </el-card>

    <!-- 计算标准成本对话框 -->
    <AppDialog
      v-model="calculateDialogVisible"
      title="计算标准成本"
      mode="form"
      width="600px"
    >
      <el-form :model="calculateForm" label-width="100px">
        <el-form-item label="选择产品" required>
          <el-select v-model="calculateForm.productId" placeholder="请选择产品" filterable class="w-full">
            <el-option
              v-for="product in productOptions"
              :key="product.id"
              :label="product.code ? `${product.code} - ${product.name}` : product.name"
              :value="product.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="计算数量" required>
          <el-input-number v-model="calculateForm.quantity" :min="1" :max="10000" class="w-full"></el-input-number>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="calculateDialogVisible = false">取消</el-button>
        <el-button v-permission="'finance:cost:execute'" type="primary" @click="calculateStandardCost" :loading="calculating">计算</el-button>
      </template>
        </AppDialog>

    <!-- 成本详情对话框 -->
    <AppDialog
      v-model="detailDialogVisible"
      title="标准成本详情"
      mode="view"
      content-width="wide"
    >
      <div v-if="currentDetail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="产品编码">{{ currentDetail.productCode }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ currentDetail.productName }}</el-descriptions-item>
          <el-descriptions-item label="材料成本">{{ formatCurrency(currentDetail.material_cost) }}</el-descriptions-item>
          <el-descriptions-item label="人工成本">{{ formatCurrency(currentDetail.labor_cost) }}</el-descriptions-item>
          <el-descriptions-item label="制造费用">{{ formatCurrency(currentDetail.overhead_cost) }}</el-descriptions-item>
          <el-descriptions-item label="总成本">{{ formatCurrency(currentDetail.total_cost) }}</el-descriptions-item>
          <el-descriptions-item label="单位成本">{{ formatCurrency(currentDetail.unit_cost) }}</el-descriptions-item>
          <el-descriptions-item label="生效日期">{{ currentDetail.effective_date }}</el-descriptions-item>
        </el-descriptions>

        <el-divider>成本明细</el-divider>

        <el-tabs v-model="activeTab">
          <el-tab-pane label="材料明细" name="material">
            <el-table v-if="currentDetail.material_details?.length > 0" :data="currentDetail.material_details" border size="small">
              <el-table-column prop="materialCode" label="物料编码" width="120"></el-table-column>
              <el-table-column prop="materialName" label="物料名称"></el-table-column>
              <el-table-column prop="quantity" label="用量" width="100">
                <template #default="{row}">{{ Number(row.quantity).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="unitCost" label="单价" width="100">
                <template #default="{row}">{{ formatCurrency(row.unitCost) }}</template>
              </el-table-column>
              <el-table-column prop="totalCost" label="小计" width="120">
                <template #default="{row}">{{ formatCurrency(row.totalCost) }}</template>
              </el-table-column>
            </el-table>
            <EmptyState v-else description="暂无BOM材料数据，请先为该产品配置BOM" ::image-size="60" />
          </el-tab-pane>
          <el-tab-pane label="人工明细" name="labor">
            <el-table v-if="currentDetail.labor_details?.length > 0" :data="currentDetail.labor_details" border size="small">
              <el-table-column prop="stepName" label="工序名称"></el-table-column>
              <el-table-column prop="department" label="部门" width="100"></el-table-column>
              <el-table-column prop="standardHours" label="标准工时(小时)" width="130">
                <template #default="{row}">{{ Number(row.standardHours).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="hourlyRate" label="费率(元/时)" width="110">
                <template #default="{row}">{{ formatCurrency(row.hourlyRate) }}</template>
              </el-table-column>
              <el-table-column prop="totalCost" label="小计" width="120">
                <template #default="{row}">{{ formatCurrency(row.totalCost) }}</template>
              </el-table-column>
            </el-table>
            <EmptyState v-else description="暂无工艺模板数据，请先为该产品配置工艺模板" ::image-size="60" />
          </el-tab-pane>
          <el-tab-pane label="制造费用" name="overhead">
            <template v-if="currentDetail.overhead_details?.rules?.length > 0">
              <el-table :data="currentDetail.overhead_details.rules" border size="small">
                <el-table-column prop="name" label="制费规则名称"></el-table-column>
                <el-table-column label="分摊基础" width="140">
                  <template #default="{row}">{{ getAllocationBaseLabel(row.allocationBase || 'labor_cost') }}</template>
                </el-table-column>
                <el-table-column prop="base" label="基数数值" width="130">
                  <template #default="{row}">{{ Number(row.base).toFixed(2) }}</template>
                </el-table-column>
                <el-table-column prop="rate" label="计算费率" width="120">
                  <template #default="{row}">{{ Number(row.rate || 0).toFixed(4) }}</template>
                </el-table-column>
                <el-table-column prop="cost" label="分摊金额" width="130">
                  <template #default="{row}">
                    <span class="text-danger font-weight-700">{{ formatCurrency(row.cost) }}</span>
                  </template>
                </el-table-column>
              </el-table>
              <div class="detail-total-row">
                <span class="detail-total-label">制造费用总计:</span>
                <span class="detail-total-amount">{{ formatCurrency(currentDetail.overhead_cost) }}</span>
              </div>
            </template>
            <EmptyState v-else description="暂无制造费用明细" ::image-size="60" />
            <div class="help-text-mt">
              <p>* 制造费用 = 各专属规则与全局通用规则的累加之和。</p>
              <p>* 单项费用 = 基数数值 × 计算费率。</p>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </AppDialog>

    <!-- 专属制造费用配置对话框 -->
    <AppDialog
      v-model="overheadDialogVisible"
      title="单品专属制费配置"
      mode="form"
      width="750px"
    >
      <div v-if="currentSelectedProduct" class="mb-md">
        <el-alert :title="`正在为产品 ${currentSelectedProduct.productCode} - ${currentSelectedProduct.productName} 配置专属制造费用`" type="info" :closable="false" show-icon></el-alert>
      </div>

      <div class="flex-between-mb">
        <span class="section-title-line">已配置专属规则</span>
        <el-button type="primary" size="small" @click="openAddOverheadForm" v-permission="'finance:cost:create'">新增专属费率</el-button>
      </div>

      <el-table :data="productOverheads" border v-loading="loadingOverheads" size="small">
        <el-table-column prop="name" label="规则名称" />
        <el-table-column label="分摊基础">
          <template #default="scope">{{ getAllocationBaseLabel(scope.row.allocationBase) }}</template>
        </el-table-column>
        <el-table-column prop="rate" label="单品费率">
          <template #default="scope">
            <span class="text-danger font-weight-700">{{ Number(scope.row.rate).toFixed(4) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="effectiveDate" label="生效日期" width="100">
          <template #default="scope">
            {{ scope.row.effectiveDate ? scope.row.effectiveDate.substring(0, 10) : '' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="90" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button size="small" link type="danger" @click="deleteProductOverhead(scope.row)" v-permission="'finance:cost:delete'">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState description="暂无专属费率，将使用全局默认费率" ::image-size="60" />
        </template>
      </el-table>

    </AppDialog>

    <!-- 新增专属制费（并列 AppDialog，避免嵌套壳） -->
    <AppDialog
      v-model="addOverheadFormVisible"
      title="新增单品费率"
      mode="form"
      width="500px"
    >
      <el-form :model="overheadForm" label-width="120px">
        <el-form-item label="引用全局模板" required>
          <el-select v-model="overheadForm.templateId" @change="handleTemplateChange" placeholder="选择全局规则模板（如：模具费）" class="w-full">
            <el-option v-for="tpl in globalOverheadTemplates" :key="tpl.id" :label="tpl.name" :value="tpl.id"></el-option>
          </el-select>
          <div class="help-text-sm">引用模板会自动继承规则名称和分摊标准，并赋予该价格最高优先级。</div>
        </el-form-item>
        <el-form-item label="单品专属价格" required>
          <el-input-number v-model="overheadForm.rate" :precision="4" :step="1" class="w-full"></el-input-number>
        </el-form-item>
        <el-form-item label="生效日期" required>
          <el-date-picker v-model="overheadForm.effective_date" type="date" value-format="YYYY-MM-DD" class="w-full"></el-date-picker>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addOverheadFormVisible = false">取消</el-button>
        <el-button v-permission="'finance:cost:create'" type="primary" @click="saveProductOverhead" :loading="savingOverhead">保存</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { formatLocalDate } from '@/utils/format';
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { financeApi, salesApi } from '@/api';
import { formatCurrency } from '@/utils/helpers/formatters';
import { parseResponseData } from '@/utils/responseParser'

const loading = ref(false);
const calculating = ref(false);
const calculateDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const activeTab = ref('material');

// 搜索表单
const searchForm = reactive({
  productName: '',
  productCode: ''
});

// 计算表单
const calculateForm = reactive({
  productId: null,
  quantity: 1
});

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
});

// 数据列表
const costList = ref([]);
const productOptions = ref([]);
const currentDetail = ref(null);

// 专属费率弹窗状态
const overheadDialogVisible = ref(false);
const addOverheadFormVisible = ref(false);
const loadingOverheads = ref(false);
const savingOverhead = ref(false);
const currentSelectedProduct = ref(null);
const productOverheads = ref([]);
const globalOverheadTemplates = ref([]);

const overheadForm = reactive({
  templateId: null,
  rate: 0,
  effective_date: formatLocalDate(new Date())
});

const allocationBases = [
  { value: 'labor_cost', label: '人工成本比例' },
  { value: 'labor_hours', label: '工时费率' },
  { value: 'machine_hours', label: '机时费率' },
  { value: 'quantity', label: '产量费率' },
  { value: 'material_cost', label: '材料成本比例' }
];

const getAllocationBaseLabel = (val) => {
  const hit = allocationBases.find(b => b.value === val);
  return hit ? hit.label : val;
};

// 加载标准成本列表
const loadStandardCosts = async () => {
  loading.value = true;
  try {
    const response = await financeApi.cost.getStandardCostList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      productName: searchForm.productName || undefined,
      productCode: searchForm.productCode || undefined
    });

    const data = response.data;
    costList.value = data.items || [];
    pagination.total = Number(data.total) || 0;

    // 如果列表为空，显示提示
    if (costList.value.length === 0) {
    }
  } catch (error) {
    console.error('加载标准成本失败:', error);
    ElMessage.error('加载标准成本失败');
  } finally {
    loading.value = false;
  }
};

// 加载产品选项
const loadProductOptions = async () => {
  try {
    // 使用销售模块的产品列表API
    const response = await salesApi.getProductsList();
    productOptions.value = response.data?.items || response.data || [];
  } catch (error) {
    console.error('加载产品列表失败:', error);
  }
};

// 显示计算对话框
const showCalculateDialog = () => {
  calculateForm.productId = null;
  calculateForm.quantity = 1;
  calculateDialogVisible.value = true;
  loadProductOptions();
};

const calculateAndPersistStandardCost = async (productId, quantity = 1) => {
  return financeApi.cost.calculateStandardCost(productId, {
    quantity,
  });
};

// 计算标准成本
const calculateStandardCost = async () => {
  if (!calculateForm.productId) {
    ElMessage.warning('请选择产品');
    return;
  }

  calculating.value = true;
  try {
    await calculateAndPersistStandardCost(calculateForm.productId, calculateForm.quantity);
    ElMessage.success('标准成本计算完成');
    calculateDialogVisible.value = false;
    loadStandardCosts();
  } catch (error) {
    console.error('计算标准成本失败:', error);
    ElMessage.error(error.response?.data?.message || '计算标准成本失败');
  } finally {
    calculating.value = false;
  }
};

// 查看详情
const viewDetail = async (row) => {
  try {
    // 如果有product_id，尝试获取真实的成本明细
    if (row.productId) {
      const response = await financeApi.cost.getStandardCost(row.productId);
      // ResponseHandler包装的数据统一由 parser 解包
      const result = parseResponseData(response);

      currentDetail.value = {
        ...row,
        // 从API返回的details中获取真实数据
        material_details: result?.details?.materials || [],
        labor_details: result?.details?.labor || [],
        overhead_details: result?.details?.overhead || null
      };
    } else {
      // 没有API数据时，显示空列表
      currentDetail.value = {
        ...row,
        material_details: [],
        labor_details: [],
        overhead_details: null
      };
    }
    detailDialogVisible.value = true;
  } catch (error) {
    console.error('获取成本明细失败:', error);
    // 出错时显示当前行数据，明细为空
    currentDetail.value = {
      ...row,
      material_details: [],
      labor_details: [],
      overhead_details: null
    };
    detailDialogVisible.value = true;
  }
};

// 重新计算
const recalculate = async (row) => {
  try {
    await ElMessageBox.confirm('确定要重新计算该产品的标准成本吗?', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });

    await calculateAndPersistStandardCost(row.productId);
    ElMessage.success('重新计算成功');
    loadStandardCosts();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('重新计算失败:', error);
      ElMessage.error(error.response?.data?.message || '重新计算失败');
    }
  }
};

// 重置搜索
const resetSearch = () => {
  searchForm.productName = '';
  searchForm.productCode = '';
  loadStandardCosts();
};

// ==================== 专属制费功能 ====================

// 获取全局模板
const fetchGlobalOverheadTemplates = async () => {
  try {
    const res = await financeApi.cost.getAllocationRulesByParams({ is_global: 1 });
    globalOverheadTemplates.value = parseResponseData(res, []);
  } catch (error) {
    console.error('获取全局制费模板失败:', error);
  }
};

// 获取单品专属规则
const loadProductOverheads = async (productId) => {
  loadingOverheads.value = true;
  try {
    const res = await financeApi.cost.getAllocationRulesByParams({ product_id: productId });
    productOverheads.value = parseResponseData(res, []);
  } catch (error) {
    console.error('获取单品专属记录失败', error);
    ElMessage.error('获取专属记录失败');
  } finally {
    loadingOverheads.value = false;
  }
};

// 打开专属配置弹窗
const openOverheadConfig = async (row) => {
  currentSelectedProduct.value = row;
  overheadDialogVisible.value = true;
  await loadProductOverheads(row.productId);
};

// 打开增加规则子弹窗
const openAddOverheadForm = async () => {
  await fetchGlobalOverheadTemplates();
  overheadForm.templateId = null;
  overheadForm.rate = 0;
  overheadForm.effective_date = formatLocalDate(new Date());
  addOverheadFormVisible.value = true;
};

// 监听模板改变，自动填入费率
const handleTemplateChange = (val) => {
  const tpl = globalOverheadTemplates.value.find(t => t.id === val);
  if (tpl) {
    // 默认回填模板原本的费率供参考修改
    overheadForm.rate = Number(tpl.rate);
  }
};

// 保存单品专属费率
const saveProductOverhead = async () => {
  if (!overheadForm.templateId) {
    ElMessage.warning('请选择要引用的全局规则模板');
    return;
  }

  const template = globalOverheadTemplates.value.find(t => t.id === overheadForm.templateId);
  if (!template) return;

  savingOverhead.value = true;
  try {
    const payload = {
      name: template.name,
      allocation_base: template.allocation_base,
      rate: overheadForm.rate,
      product_id: currentSelectedProduct.value.productId,
      product_category: null,
      cost_center_id: template.costCenterId || null,
      priority: 99, // 最高优先级
      effective_date: overheadForm.effective_date,
      is_active: true
    };

    await financeApi.cost.saveAllocationRule(payload);
    ElMessage.success('配置单品专属费率成功');
    addOverheadFormVisible.value = false;
    await loadProductOverheads(currentSelectedProduct.value.productId);

    await calculateAndPersistStandardCost(currentSelectedProduct.value.productId);
    await loadStandardCosts();
  } catch {
    ElMessage.error('保存单品专属费率失败');
  } finally {
    savingOverhead.value = false;
  }
};

// 删除单品专属费率
const deleteProductOverhead = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除此专属费率吗？删除后将回退使用全局规则。', '提示', {
      type: 'warning'
    });
    await financeApi.cost.deleteAllocationRule(row.id);
    ElMessage.success('删除成功');
    await loadProductOverheads(currentSelectedProduct.value.productId);
    await calculateAndPersistStandardCost(currentSelectedProduct.value.productId);
    await loadStandardCosts();
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败');
    }
  }
};

// 页面加载时初始化
onMounted(() => {
  loadStandardCosts();
});
</script>

<style scoped>
.standard-cost-container {
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
