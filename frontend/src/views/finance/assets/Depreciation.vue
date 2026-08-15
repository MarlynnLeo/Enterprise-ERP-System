<!--
/**
 * Depreciation.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page depreciation-container">
    <PageHeader title="折旧管理" subtitle="计算与记录资产折旧">
      <template #actions>
<el-button type="primary" @click="calculateDepreciation" :loading="loading" v-permission="'finance:assets:execute'">计算折旧</el-button>
          <el-button type="success" @click="confirmBatchDepreciation" :disabled="!hasDepreciation || savingDepreciation || selectedAssets.length === 0" v-permission="'finance:assets:execute'">
            批量计提{{ selectedAssets.length > 0 ? `(${selectedAssets.length})` : '' }}
            <el-icon v-if="savingDepreciation"><Loading /></el-icon>
          </el-button>
          <el-button v-permission="'finance:assets:export'" type="warning" @click="exportData" :disabled="!hasDepreciation">导出数据</el-button>
      </template>
    </PageHeader>

    <!-- 搜索表单 -->
    <FinanceQueryCard
      :model="searchForm"
      :expanded="showAdvancedSearch"
      :loading="loading"
      @update:expanded="showAdvancedSearch = $event"
      @search="calculateDepreciation"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="计提年月" prop="depreciationDate" required>
          <el-date-picker
            v-model="searchForm.depreciationDate"
            type="month"
            placeholder="选择计提年月"
            format="YYYY-MM"
            value-format="YYYY-MM"
          ></el-date-picker>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="资产类别">
          <el-select v-model="searchForm.categoryId" placeholder="选择资产类别" clearable>
            <el-option
              v-for="(item, index) in categoryOptions"
              :key="item.id || 'cat-' + index"
              :label="item.name || '未命名类别'"
              :value="item.id || ''"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="使用部门">
          <el-select v-model="searchForm.department" placeholder="选择使用部门" clearable>
            <el-option
              v-for="(item, index) in departmentOptions"
              :key="item.id || 'dept-' + index"
              :label="item.name || '未命名部门'"
              :value="item.name || ''"
            ></el-option>
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <div class="statistics-row" v-if="hasDepreciation">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ depreciationSummary.assetsCount }}</div>
        <div class="stat-label">计提资产数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(depreciationSummary.totalOriginalValue) }}</div>
        <div class="stat-label">资产原值合计</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(depreciationSummary.totalNetValueBefore) }}</div>
        <div class="stat-label">计提前净值</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(depreciationSummary.totalDepreciationAmount) }}</div>
        <div class="stat-label">折旧额合计</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(depreciationSummary.totalNetValueAfter) }}</div>
        <div class="stat-label">计提后净值</div>
      </el-card>
    </div>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <template #header>
        <div class="card-header">
          <span>折旧计提明细</span>
          <el-checkbox v-model="onlyShowDepreciatingAssets" @change="filterAssets">
            只显示需计提折旧资产
          </el-checkbox>
        </div>
      </template>

      <div v-if="!hasDepreciation" class="empty-container">
        <EmptyState description='请选择计提年月并点击"计算折旧"按钮' />
      </div>

      <el-table
        v-else
        ref="depTableRef"
        :data="filteredAssetsList"
        class="w-full"
        border
        stripe
        v-loading="loading"
        :summary-method="getSummaries"
        show-summary
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="45" :selectable="row => row.depreciationAmount> 0 && !row.submitted"></el-table-column>
        <el-table-column type="expand" width="55">
          <template #default="scope">
            <div class="asset-details">
              <el-descriptions :column="3" border size="small">
                <el-descriptions-item label="预计使用年限">{{ scope.row.usefulLife }}年</el-descriptions-item>
                <el-descriptions-item label="残值率">{{ scope.row.salvageRate }}%</el-descriptions-item>
                <el-descriptions-item label="折旧方法">{{ getDepreciationMethodText(scope.row.depreciationMethod) }}</el-descriptions-item>
                <el-descriptions-item label="已使用月数">{{ scope.row.usedMonths }}个月</el-descriptions-item>
                <el-descriptions-item label="存放地点">{{ scope.row.location }}</el-descriptions-item>
              </el-descriptions>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="assetCode" label="资产编号" width="180" show-overflow-tooltip></el-table-column>
        <el-table-column prop="assetName" label="资产名称" width="150" show-overflow-tooltip></el-table-column>
        <el-table-column prop="categoryName" label="资产类别" width="110">
          <template #default="scope">
            <span v-if="scope.row.categoryName">{{ scope.row.categoryName }}</span>
            <span v-else-if="scope.row.categoryId || scope.row.categoryId" class="text-muted">ID: {{ scope.row.categoryId || scope.row.categoryId }}</span>
            <span v-else class="text-muted">未分类</span>
          </template>
        </el-table-column>
        <el-table-column prop="department" label="使用部门" width="110" show-overflow-tooltip></el-table-column>
        <el-table-column prop="purchaseDate" label="购入日期" width="100"></el-table-column>
        <el-table-column prop="originalValue" label="原值" width="110">
          <template #default="scope">
            {{ formatCurrency(scope.row.originalValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="netValueBefore" label="计提前净值" width="110">
          <template #default="scope">
            {{ formatCurrency(scope.row.netValueBefore) }}
          </template>
        </el-table-column>
        <el-table-column prop="depreciationAmount" label="折旧额" width="120">
          <template #default="scope">
            <span :class="{ 'zero-value': scope.row.depreciationAmount <= 0 }">
              {{ formatCurrency(scope.row.depreciationAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="netValueAfter" label="计提后净值" width="120">
          <template #default="scope">
            {{ formatCurrency(scope.row.netValueAfter) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="折旧状态" width="120">
          <template #default="scope">
            <el-tag
              v-if="scope.row.submitted"
              type="success"
              effect="dark"
            >
              已计提
            </el-tag>
            <el-tag
              v-else
              :type="scope.row.depreciationAmount > 0 ? 'warning' : 'info'"
              :effect="scope.row.depreciationAmount > 0 ? 'dark' : 'plain'"
            >
              {{ scope.row.depreciationAmount > 0 ? '需计提' : '无需计提' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="120" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <div class="table-actions">
            <el-button
              v-if="scope.row.depreciationAmount > 0 && !scope.row.submitted"
              size="small"
              type="success"
              @click="submitSingleDepreciation(scope.row)"
              :loading="scope.row.submitting"
            >
              <el-icon><Coin /></el-icon> 计提
            </el-button>
            <el-tag v-else-if="scope.row.submitted" type="success" size="small" effect="dark">已计提</el-tag>
            <span v-else class="text-muted">—</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 确认对话框 -->
    <AppDialog
      v-model="confirmDialogVisible"
      title="确认折旧计提"
      mode="form"
      width="500px"
    >
      <div class="confirm-content">
        <p>您确定要为 <strong>{{ searchForm.depreciationDate }}</strong> 执行折旧计提操作吗？</p>
        <p>此操作将影响 <strong>{{ pendingSubmitAssets.length }}</strong> 个资产的净值，折旧总额为 <strong>{{ formatCurrency(pendingSubmitTotal) }}</strong>。</p>
        <p>折旧计提操作将自动生成相应的会计凭证。</p>
        <div class="warning-message">注意：此操作执行后不可撤销！</div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="confirmDialogVisible = false">取消</el-button>
          <el-button v-permission="'finance:assets:execute'" type="primary" @click="submitDepreciation" :loading="savingDepreciation">确认计提</el-button>
        </span>
      </template>
        </AppDialog>
  </div>
</template>
<script setup>
import { parseListData, parseResponseData } from '@/utils/responseParser';
import { formatCurrency, formatLocalMonth } from '@/utils/format'
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Coin } from '@element-plus/icons-vue';
import { financeApi } from '@/api/finance';
import { buildApiUrl } from '@/config/app';
import { loadDepartmentOptions as loadCachedDepartmentOptions } from '@/utils/optionLoaders';
// 数据加载状态
const loading = ref(false);
const showAdvancedSearch = ref(false);
const savingDepreciation = ref(false);
// 对话框状态
const confirmDialogVisible = ref(false);
// 数据列表
const assetsList = ref([]);
const filteredAssetsList = ref([]);
const categoryOptions = ref([]);
const departmentOptions = ref([]);
const onlyShowDepreciatingAssets = ref(false);
const depreciationSubmitted = ref(false);
const selectedAssets = ref([]);
const depTableRef = ref(null);
const pendingSubmitAssets = ref([]);
const getDefaultDepreciationMonth = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return formatLocalMonth(date);
};

// 搜索表单
const searchForm = reactive({
  // 默认设置为上个月而不是当前月，避免使用未来日期
  depreciationDate: getDefaultDepreciationMonth(),
  categoryId: '',
  department: ''
});
// 折旧汇总数据
const depreciationSummary = reactive({
  assetsCount: 0,
  totalOriginalValue: 0,
  totalNetValueBefore: 0,
  totalDepreciationAmount: 0,
  totalNetValueAfter: 0
});
// 计算属性
const hasDepreciation = computed(() => assetsList.value.length > 0);
;
const pendingSubmitTotal = computed(() =>
  pendingSubmitAssets.value.reduce((sum, a) => sum + a.depreciationAmount, 0)
);

const resetSearch = () => {
  searchForm.depreciationDate = getDefaultDepreciationMonth();
  searchForm.categoryId = '';
  searchForm.department = '';
  assetsList.value = [];
  filteredAssetsList.value = [];
  selectedAssets.value = [];
};
import { getAssetStatusText, getAssetStatusColor } from '@/constants/systemConstants'
// 获取状态类型
const getStatusType = (status) => {
  return getAssetStatusColor(status);
};
// 获取状态文本
const getStatusText = (status) => {
  return getAssetStatusText(status);
};
// 获取折旧方法文本
const getDepreciationMethodText = (method) => {
  const methodMap = {
    straight_line: '直线法',
    double_declining: '双倍余额递减法',
    sum_of_years: '年数总和法',
    no_depreciation: '不计提折旧'
  };
  return methodMap[method] || method;
};
// 计算折旧
const calculateDepreciation = async () => {
  // 验证表单
  if (!searchForm.depreciationDate) {
    ElMessage.warning('请选择计提年月');
    return;
  }

  // 验证日期格式是否正确 (YYYY-MM)
  const datePattern = /^\d{4}-\d{2}$/;
  if (!datePattern.test(searchForm.depreciationDate)) {
    ElMessage.warning('计提年月格式不正确，应为YYYY-MM格式');
    return;
  }

  // 验证计提年月是否在合理范围内
  const [year, _month] = searchForm.depreciationDate.split('-').map(Number);
  const currentYear = new Date().getFullYear();
  if (year < 2000 || year > currentYear + 10) {
    ElMessage.warning(`计提年月超出合理范围，年份应在2000至${currentYear + 10}之间`);
    return;
  }

  loading.value = true;
  assetsList.value = [];
  filteredAssetsList.value = [];
  depreciationSubmitted.value = false;

  try {
    ElMessage.info('正在由服务端试算折旧...');
    const response = await financeApi.calculateAssetDepreciation({
      depreciationDate: searchForm.depreciationDate,
      categoryId: searchForm.categoryId || '',
      department: searchForm.department || ''
    });
    const calculatedAssets = parseResponseData(response, []);
    if (!Array.isArray(calculatedAssets) || calculatedAssets.length === 0) {
      ElMessage.warning('没有找到符合条件的资产');
      loading.value = false;
      return;
    }

    // 先检查该月份是否已经计提过（在渲染表格前完成，避免视觉闪烁）
    try {
      const depCheckRes = await financeApi.getAssetDepreciationRecords({ depreciationDate: searchForm.depreciationDate });
      const records = parseResponseData(depCheckRes, []);
      if (Array.isArray(records) && records.length > 0) {
        depreciationSubmitted.value = true;
      }
    } catch (error) {
      console.error('检查折旧记录失败:', error)
    }

    // 更新列表（此时 depreciationSubmitted 已经是正确的值）
    assetsList.value = calculatedAssets;
    filterAssets();
    calculateSummary();

    ElMessage.success(`成功计算${calculatedAssets.length}个资产的折旧`);
  } catch (error) {
    console.error('计算折旧失败:', error);

    // 更详细的错误日志
    if (error.response) {
      const { status, data } = error.response;
      console.error(`服务器返回状态码 ${status}:`, data);
      ElMessage.error(`获取资产数据失败: ${data?.message || '服务器错误'}`);
    } else if (error.request) {
      console.error('未收到服务器响应:', error.request);
      ElMessage.error('服务器未响应，请检查网络连接');
    } else {
      console.error('请求配置错误:', error.message);
      ElMessage.error(`请求错误: ${error.message}`);
    }
  } finally {
    loading.value = false;
  }
};
// 过滤资产列表
const filterAssets = () => {
  if (onlyShowDepreciatingAssets.value) {
    filteredAssetsList.value = assetsList.value.filter(asset => asset.depreciationAmount > 0);
  } else {
    filteredAssetsList.value = assetsList.value;
  }
};
// 计算汇总数据
const calculateSummary = () => {
  depreciationSummary.assetsCount = assetsList.value.length;
  depreciationSummary.totalOriginalValue = assetsList.value.reduce((sum, asset) => sum + asset.originalValue, 0);
  depreciationSummary.totalNetValueBefore = assetsList.value.reduce((sum, asset) => sum + asset.netValueBefore, 0);
  depreciationSummary.totalDepreciationAmount = assetsList.value.reduce((sum, asset) => sum + asset.depreciationAmount, 0);
  depreciationSummary.totalNetValueAfter = assetsList.value.reduce((sum, asset) => sum + asset.netValueAfter, 0);
};
// 处理表格选择变化
const handleSelectionChange = (selection) => {
  selectedAssets.value = selection.filter(a => a.depreciationAmount > 0 && !a.submitted);
};
// 批量确认折旧计提
const confirmBatchDepreciation = () => {
  if (selectedAssets.value.length === 0) {
    ElMessage.warning('请先勾选需要计提折旧的资产');
    return;
  }
  pendingSubmitAssets.value = [...selectedAssets.value];
  confirmDialogVisible.value = true;
};
// 单个资产计提
const submitSingleDepreciation = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要为 ${row.assetName} 计提折旧 ${formatCurrency(row.depreciationAmount)} 吗？`,
      '确认单个计提',
      { type: 'warning' }
    );
  } catch {
    return; // 用户取消
  }

  row.submitting = true;
  try {
    const data = {
      depreciationDate: searchForm.depreciationDate,
      assets: [{
        id: row.id,
        depreciationAmount: row.depreciationAmount,
        netValueAfter: row.netValueAfter
      }]
    };

    await financeApi.submitAssetDepreciation(data);

    row.submitted = true;
    ElMessage.success(`${row.assetName} 折旧计提成功`);
  } catch (error) {
    console.error('单个折旧计提失败:', error);
    ElMessage.error(`${row.assetName} 折旧计提失败`);
  } finally {
    row.submitting = false;
  }
};
// 提交折旧计提（批量）
const submitDepreciation = async () => {
  savingDepreciation.value = true;
  try {
    const data = {
      depreciationDate: searchForm.depreciationDate,
      assets: pendingSubmitAssets.value.map(asset => ({
        id: asset.id,
        depreciationAmount: asset.depreciationAmount,
        netValueAfter: asset.netValueAfter
      }))
    };

    await financeApi.submitAssetDepreciation(data);

    // 标记已提交的资产
    pendingSubmitAssets.value.forEach(asset => {
      asset.submitted = true;
    });

    ElMessage.success(`成功计提 ${pendingSubmitAssets.value.length} 个资产的折旧`);
    confirmDialogVisible.value = false;

    // 清除选择
    selectedAssets.value = [];
    if (depTableRef.value) {
      depTableRef.value.clearSelection();
    }

    // 检查是否全部已计提
    const allSubmitted = assetsList.value.filter(a => a.depreciationAmount > 0).every(a => a.submitted);
    if (allSubmitted) {
      depreciationSubmitted.value = true;
    }
  } catch (error) {
    console.error('提交折旧计提失败:', error);
    ElMessage.error('提交折旧计提失败');
  } finally {
    savingDepreciation.value = false;
  }
};
// 导出数据
const exportData = () => {
  if (!hasDepreciation.value) {
    ElMessage.warning('请先计算折旧');
    return;
  }

  // 使用环境变量配置的API基础URL，默认为相对路径
  const params = new URLSearchParams({
    depreciationDate: searchForm.depreciationDate,
    categoryId: searchForm.categoryId || '',
    department: searchForm.department || ''
  });
  window.open(buildApiUrl(`/finance/assets/depreciation/export?${params.toString()}`));
};
// 表格合计行
const getSummaries = (param) => {
  const { columns } = param;
  const sums = [];

  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = '合计';
      return;
    }

    if (['originalValue', 'netValueBefore', 'depreciationAmount', 'netValueAfter'].includes(column.property)) {
      const values = filteredAssetsList.value.map(item => {
        return Number(item[column.property]);
      });

      const sum = values.reduce((prev, curr) => {
        return prev + (isNaN(curr) ? 0 : curr);
      }, 0);

      sums[index] = formatCurrency(sum);
    } else {
      sums[index] = '';
    }
  });

  return sums;
};
// 加载资产类别选项
const loadCategoryOptions = async () => {
  try {
    const response = await financeApi.getAssetCategories();
    categoryOptions.value = parseListData(response, { enableLog: false }).filter(item => item);
  } catch (error) {
    console.error('加载资产类别列表失败:', error);
    ElMessage.error('加载资产类别列表失败');
    categoryOptions.value = [];
  }
};
// 加载部门选项
const loadDepartmentOptions = async () => {
  try {
    departmentOptions.value = (await loadCachedDepartmentOptions()).filter(item => item);
  } catch (error) {
    console.error('加载部门列表失败:', error);
    ElMessage.error('加载部门列表失败');
    departmentOptions.value = [];
  }
};
// 页面加载时执行
onMounted(() => {
  loadCategoryOptions();
  loadDepartmentOptions();
  // 不自动计算折旧，等用户主动点击按钮
});
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
.action-buttons {
  display: flex;
  gap: 10px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.empty-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 0;
}
.zero-value {
  color: var(--color-text-secondary);
}
.text-muted {
  color: var(--color-text-secondary);
  font-style: italic;
}
.asset-details {
  padding: 5px 20px;
  background-color: var(--color-bg-section);
}
.confirm-content {
  padding: 10px 0;
}
.warning-message {
  margin-top: 15px;
  padding: 10px;
  background-color: var(--color-danger-light);
  color: var(--color-danger);
  border-radius: var(--radius-sm);
  font-weight: bold;
}
:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
