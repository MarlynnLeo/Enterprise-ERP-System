<template>
  <div class="standard-cost-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>标准成本管理</h2>
          <p class="subtitle">设置和查询产品标准成本</p>
        </div>
        <el-button type="primary" @click="showCalculateDialog">计算标准成本</el-button>
      </div>
    </el-card>

    <!-- 搜索表单 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="产品名称">
          <el-input v-model="searchForm.productName" placeholder="请输入产品名称" clearable></el-input>
        </el-form-item>
        <el-form-item label="产品编码">
          <el-input v-model="searchForm.productCode" placeholder="请输入产品编码" clearable></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadStandardCosts">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="costList" border v-loading="loading" style="width: 100%">
        <el-table-column prop="product_code" label="产品编码" width="140"></el-table-column>
        <el-table-column prop="product_name" label="产品名称" width="350"></el-table-column>
        <el-table-column label="材料成本" width="130" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.material_cost) }}
          </template>
        </el-table-column>
        <el-table-column label="人工成本" width="130" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.labor_cost) }}
          </template>
        </el-table-column>
        <el-table-column label="制造费用" width="130" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.overhead_cost) }}
          </template>
        </el-table-column>
        <el-table-column label="总成本" width="130" align="right">
          <template #default="scope">
            <span style="font-weight: bold; color: var(--color-primary);">
              {{ formatCurrency(scope.row.total_cost) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="单位成本" width="120" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.unit_cost) }}
          </template>
        </el-table-column>
        <el-table-column prop="effective_date" label="生效日期" width="120"></el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.is_active ? 'success' : 'info'">
              {{ scope.row.is_active ? '有效' : '失效' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="scope">
            <el-button type="info" size="small" @click="openOverheadConfig(scope.row)">配置专费</el-button>
            <el-button type="primary" size="small" @click="viewDetail(scope.row)">详情</el-button>
            <el-button type="warning" size="small" @click="recalculate(scope.row)">重算</el-button>
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
    <el-dialog v-model="calculateDialogVisible" title="计算标准成本" width="600px">
      <el-form :model="calculateForm" label-width="100px">
        <el-form-item label="选择产品" required>
          <el-select v-model="calculateForm.productId" placeholder="请选择产品" filterable style="width: 100%">
            <el-option
              v-for="product in productOptions"
              :key="product.id"
              :label="product.code ? `${product.code} - ${product.name}` : product.name"
              :value="product.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="计算数量" required>
          <el-input-number v-model="calculateForm.quantity" :min="1" :max="10000" style="width: 100%"></el-input-number>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="calculateDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="calculateStandardCost" :loading="calculating">计算</el-button>
      </template>
    </el-dialog>

    <!-- 成本详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="标准成本详情" width="800px">
      <div v-if="currentDetail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="产品编码">{{ currentDetail.product_code }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ currentDetail.product_name }}</el-descriptions-item>
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
              <el-table-column prop="quantity" label="用量" width="100" align="right">
                <template #default="{row}">{{ Number(row.quantity).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="unitCost" label="单价" width="100" align="right">
                <template #default="{row}">¥{{ Number(row.unitCost).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="totalCost" label="小计" width="120" align="right">
                <template #default="{row}">¥{{ Number(row.totalCost).toFixed(2) }}</template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无BOM材料数据，请先为该产品配置BOM" :image-size="60"></el-empty>
          </el-tab-pane>
          <el-tab-pane label="人工明细" name="labor">
            <el-table v-if="currentDetail.labor_details?.length > 0" :data="currentDetail.labor_details" border size="small">
              <el-table-column prop="stepName" label="工序名称"></el-table-column>
              <el-table-column prop="department" label="部门" width="100"></el-table-column>
              <el-table-column prop="standardHours" label="标准工时(小时)" width="130" align="right">
                <template #default="{row}">{{ Number(row.standardHours).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="hourlyRate" label="费率(元/时)" width="110" align="right">
                <template #default="{row}">¥{{ Number(row.hourlyRate).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="totalCost" label="小计" width="120" align="right">
                <template #default="{row}">¥{{ Number(row.totalCost).toFixed(2) }}</template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无工艺模板数据，请先为该产品配置工艺模板" :image-size="60"></el-empty>
          </el-tab-pane>
          <el-tab-pane label="制造费用" name="overhead">
            <template v-if="currentDetail.overhead_details?.rules?.length > 0">
              <el-table :data="currentDetail.overhead_details.rules" border size="small">
                <el-table-column prop="name" label="制费规则名称"></el-table-column>
                <el-table-column label="分摊基础" width="140">
                  <template #default="{row}">{{ getAllocationBaseLabel(row.allocation_base || 'labor_cost') }}</template>
                </el-table-column>
                <el-table-column prop="base" label="基数数值" width="130" align="right">
                  <template #default="{row}">{{ Number(row.base).toFixed(2) }}</template>
                </el-table-column>
                <el-table-column prop="rate" label="计算费率" width="120" align="right">
                  <template #default="{row}">{{ Number(row.rate || 0).toFixed(4) }}</template>
                </el-table-column>
                <el-table-column prop="cost" label="分摊金额" width="130" align="right">
                  <template #default="{row}">
                    <span style="color:#f56c6c; font-weight:bold;">¥{{ (Number(row.cost) || 0).toFixed(2) }}</span>
                  </template>
                </el-table-column>
              </el-table>
              <div style="margin-top: 16px; text-align: right; font-size: 15px;">
                <span style="font-weight: bold; color: var(--color-text-primary); margin-right: 12px;">制造费用总计:</span>
                <span style="font-size: 18px; font-weight: bold; color: var(--color-danger);">¥{{ formatCurrency(currentDetail.overhead_cost) }}</span>
              </div>
            </template>
            <el-empty v-else description="暂无制造费用明细" :image-size="60"></el-empty>
            <div style="margin-top: 16px; color: var(--color-text-secondary); font-size: 13px;">
              <p>* 制造费用 = 各专属规则与全局通用规则的累加之和。</p>
              <p>* 单项费用 = 基数数值 × 计算费率。</p>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-dialog>

    <!-- 专属制造费用配置对话框 -->
    <el-dialog v-model="overheadDialogVisible" title="单品专属制费配置" width="750px">
      <div v-if="currentSelectedProduct" style="margin-bottom: 16px;">
        <el-alert :title="`正在为产品 ${currentSelectedProduct.product_code} - ${currentSelectedProduct.product_name} 配置专属制造费用`" type="info" :closable="false" show-icon></el-alert>
      </div>
      
      <div style="margin-bottom: 16px; display:flex; justify-content: space-between;">
        <span style="line-height:32px; font-weight:bold;">已配置专属规则</span>
        <el-button type="primary" size="small" @click="openAddOverheadForm" v-permission="'finance:cost:standard'">新增专属费率</el-button>
      </div>

      <el-table :data="productOverheads" border v-loading="loadingOverheads" size="small">
        <el-table-column prop="name" label="规则名称" />
        <el-table-column label="分摊基础">
          <template #default="scope">{{ getAllocationBaseLabel(scope.row.allocation_base) }}</template>
        </el-table-column>
        <el-table-column prop="rate" label="单品费率" align="right">
          <template #default="scope">
            <span style="color:#f56c6c; font-weight:bold">{{ Number(scope.row.rate).toFixed(4) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="effective_date" label="生效日期" width="100">
          <template #default="scope">
            {{ scope.row.effective_date ? scope.row.effective_date.substring(0, 10) : '' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="scope">
            <el-button size="small" link type="danger" @click="deleteProductOverhead(scope.row)" v-permission="'finance:cost:standard'">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无专属费率，将使用全局默认费率" :image-size="60"></el-empty>
        </template>
      </el-table>
      
      <!-- 内部：新增专属制费弹窗 -->
      <el-dialog v-model="addOverheadFormVisible" title="新增单品费率" width="500px" append-to-body>
        <el-form :model="overheadForm" label-width="120px">
          <el-form-item label="引用全局模板" required>
             <el-select v-model="overheadForm.templateId" @change="handleTemplateChange" placeholder="选择全局规则模板（如：模具费）" style="width:100%">
               <el-option v-for="tpl in globalOverheadTemplates" :key="tpl.id" :label="tpl.name" :value="tpl.id"></el-option>
             </el-select>
             <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">引用模板会自动继承规则名称和分摊标准，并赋予该价格最高优先级。</div>
          </el-form-item>
          <el-form-item label="单品专属价格" required>
            <el-input-number v-model="overheadForm.rate" :precision="4" :step="1" style="width:100%"></el-input-number>
          </el-form-item>
          <el-form-item label="生效日期" required>
            <el-date-picker v-model="overheadForm.effective_date" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="addOverheadFormVisible = false">取消</el-button>
          <el-button type="primary" @click="saveProductOverhead" :loading="savingOverhead">保存</el-button>
        </template>
      </el-dialog>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '@/services/api';
import { formatCurrency } from '@/utils/helpers/formatters';

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
  effective_date: new Date().toISOString().split('T')[0]
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
    const response = await api.get('/finance-enhancement/cost/standard-list', {
      params: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        productName: searchForm.productName || undefined,
        productCode: searchForm.productCode || undefined
      }
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
    const response = await api.get('/sales/products-list');
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

// 计算标准成本
const calculateStandardCost = async () => {
  if (!calculateForm.productId) {
    ElMessage.warning('请选择产品');
    return;
  }

  calculating.value = true;
  try {
    const response = await api.get(`/finance-enhancement/cost/standard/${calculateForm.productId}`, {
      params: { quantity: calculateForm.quantity }
    });

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
    if (row.product_id) {
      const response = await api.get(`/finance-enhancement/cost/standard/${row.product_id}`);
      // ResponseHandler包装的数据在response.data.data中
      const result = response.data?.data || response.data;
      
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

    // 调用API重新计算
    await api.get(`/finance-enhancement/cost/standard/${row.product_id}`);
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
    const res = await api.get('/finance-enhancement/cost/overhead-allocation', {
      params: { is_global: 1 }
    });
    globalOverheadTemplates.value = res.data?.data || res.data || [];
  } catch (error) {
    console.error('获取全局制费模板失败:', error);
  }
};

// 获取单品专属规则
const loadProductOverheads = async (productId) => {
  loadingOverheads.value = true;
  try {
    const res = await api.get('/finance-enhancement/cost/overhead-allocation', {
      params: { product_id: productId }
    });
    productOverheads.value = res.data?.data || res.data || [];
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
  await loadProductOverheads(row.product_id);
};

// 打开增加规则子弹窗
const openAddOverheadForm = async () => {
  await fetchGlobalOverheadTemplates();
  overheadForm.templateId = null;
  overheadForm.rate = 0;
  overheadForm.effective_date = new Date().toISOString().split('T')[0];
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
      product_id: currentSelectedProduct.value.product_id,
      product_category: null,
      cost_center_id: template.cost_center_id || null,
      priority: 99, // 最高优先级
      effective_date: overheadForm.effective_date,
      is_active: true
    };
    
    await api.post('/finance-enhancement/cost/overhead-allocation', payload);
    ElMessage.success('配置单品专属费率成功');
    addOverheadFormVisible.value = false;
    await loadProductOverheads(currentSelectedProduct.value.product_id);
    
    // 自动触发重算以立即生效
    recalculate(currentSelectedProduct.value);
  } catch (error) {
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
    await api.delete(`/finance-enhancement/cost/overhead-allocation/${row.id}`);
    ElMessage.success('删除成功');
    await loadProductOverheads(currentSelectedProduct.value.product_id);
    recalculate(currentSelectedProduct.value);
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

