<!--
/**
 * Depreciation.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="depreciation-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>资产折旧计提</h2>
          <p class="subtitle">计算与记录资产折旧</p>
        </div>
        <div class="action-buttons">
          <el-button type="primary" @click="calculateDepreciation" :loading="loading" v-permission="'finance:assets:depreciation'">计算折旧</el-button>
          <el-button type="success" @click="confirmBatchDepreciation" :disabled="!hasDepreciation || savingDepreciation || selectedAssets.length === 0" v-permission="'finance:assets:depreciation'">
            批量计提{{ selectedAssets.length > 0 ? `(${selectedAssets.length})` : '' }}
            <el-icon v-if="savingDepreciation"><Loading /></el-icon>
          </el-button>
          <el-button v-permission="'finance:assets:export'" type="warning" @click="exportData" :disabled="!hasDepreciation">导出数据</el-button>
        </div>
      </div>
    </el-card>
    
    <!-- 搜索表单 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" ref="searchFormRef" class="search-form">
        <el-form-item label="计提年月" prop="depreciationDate" required>
          <el-date-picker
            v-model="searchForm.depreciationDate"
            type="month"
            placeholder="选择计提年月"
            format="YYYY-MM"
            value-format="YYYY-MM"
          ></el-date-picker>
        </el-form-item>
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
      </el-form>
    </el-card>
    
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
        <el-empty description='请选择计提年月并点击"计算折旧"按钮'></el-empty>
      </div>
      
      <el-table
        v-else
        ref="depTableRef"
        :data="filteredAssetsList"
        style="width: 100%"
        border
        stripe
        v-loading="loading"
        :summary-method="getSummaries"
        show-summary
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="45" :selectable="row => row.depreciationAmount > 0 && !row.submitted"></el-table-column>
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
            <span v-else-if="scope.row.categoryId || scope.row.category_id" class="text-muted">ID: {{ scope.row.categoryId || scope.row.category_id }}</span>
            <span v-else class="text-muted">未分类</span>
          </template>
        </el-table-column>
        <el-table-column prop="department" label="使用部门" width="110" show-overflow-tooltip></el-table-column>
        <el-table-column prop="purchaseDate" label="购入日期" width="100"></el-table-column>
        <el-table-column prop="originalValue" label="原值" width="110" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.originalValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="netValueBefore" label="计提前净值" width="110" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.netValueBefore) }}
          </template>
        </el-table-column>
        <el-table-column prop="depreciationAmount" label="折旧额" width="120" align="right">
          <template #default="scope">
            <span :class="{ 'zero-value': scope.row.depreciationAmount <= 0 }">
              {{ formatCurrency(scope.row.depreciationAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="netValueAfter" label="计提后净值" width="120" align="right">
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
        <el-table-column label="操作" width="90" fixed="right" align="center">
          <template #default="scope">
            <el-button
              v-if="scope.row.depreciationAmount > 0 && !scope.row.submitted"
              size="small"
              type="success"
              @click="submitSingleDepreciation(scope.row)"
              :loading="scope.row.submitting"
            >计提</el-button>
            <el-tag v-else-if="scope.row.submitted" type="success" size="small" effect="dark">已计提</el-tag>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    
    <!-- 确认对话框 -->
    <el-dialog
      title="确认折旧计提"
      v-model="confirmDialogVisible"
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
          <el-button type="primary" @click="submitDepreciation" :loading="savingDepreciation">确认计提</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { parseListData } from '@/utils/responseParser';
import { formatCurrency } from '@/utils/format'

import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../../services/api';

// 数据加载状态
const loading = ref(false);
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

// 搜索表单
const searchForm = reactive({
  // 默认设置为上个月而不是当前月，避免使用未来日期
  depreciationDate: (() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1); // 上个月
    return date.toISOString().slice(0, 7); // 格式为YYYY-MM
  })(),
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
const depreciatingAssetsCount = computed(() => 
  assetsList.value.filter(asset => asset.depreciationAmount > 0).length
);
const pendingSubmitTotal = computed(() => 
  pendingSubmitAssets.value.reduce((sum, a) => sum + a.depreciationAmount, 0)
);

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
  const [year, month] = searchForm.depreciationDate.split('-').map(Number);
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
    ElMessage.info('正在获取资产数据并计算折旧...');

    // 获取在用资产列表
    const response = await api.get('/finance/assets', {
      params: {
        categoryId: searchForm.categoryId || '',
        department: searchForm.department || '',
        status: '在用', // 只获取在用的资产
        pageSize: 1000 // 获取足够多的资产
      }
    });

    // 使用统一响应解析器
    const assets = parseListData(response, { enableLog: false });

    if (assets.length === 0) {
      ElMessage.warning('没有找到符合条件的资产');
      loading.value = false;
      return;
    }
    
    // 前端计算折旧逻辑
    // 映射字段名称以适应后端返回的不同字段格式
    const fieldMapping = {
      id: ['id', 'asset_id'],
      assetCode: ['assetCode', 'asset_code', 'code'],
      assetName: ['assetName', 'asset_name', 'name'],
      originalValue: ['originalValue', 'acquisition_cost', 'acquisitionCost', 'original_value'],
      netValue: ['netValue', 'current_value', 'currentValue', 'net_value'],
      accumulatedDepreciation: ['accumulatedDepreciation', 'accumulated_depreciation'],
      depreciationMethod: ['depreciationMethod', 'depreciation_method', 'method'],
      salvageRate: ['salvageRate', 'salvage_rate'],
      salvageValue: ['salvageValue', 'salvage_value'],
      usefulLife: ['usefulLife', 'useful_life'],
      department: ['department', 'department_name', 'departmentName'],
      location: ['location', 'location_name', 'locationName'],
      purchaseDate: ['purchaseDate', 'acquisition_date', 'acquisitionDate', 'purchase_date'],
      status: ['status']
    };
    
    // 获取资产的字段值，适应不同的字段名称
    const getFieldValue = (asset, fieldNames) => {
      for (const name of fieldNames) {
        if (asset[name] !== undefined) {
          return asset[name];
        }
      }
      return undefined;
    };
    
    // 为每个资产计算折旧
    const calculatedAssets = assets.map(asset => {
      try {
        const id = getFieldValue(asset, fieldMapping.id);
        const assetCode = getFieldValue(asset, fieldMapping.assetCode);
        const assetName = getFieldValue(asset, fieldMapping.assetName);
        let originalValue = parseFloat(getFieldValue(asset, fieldMapping.originalValue) || 0);
        const currentValue = parseFloat(getFieldValue(asset, fieldMapping.netValue) || 0);
        const accumulatedDepreciation = parseFloat(getFieldValue(asset, fieldMapping.accumulatedDepreciation) || 0);
        let depreciationMethod = getFieldValue(asset, fieldMapping.depreciationMethod);
        const salvageValue = parseFloat(getFieldValue(asset, fieldMapping.salvageValue) || 0);
        const salvageRate = parseFloat(getFieldValue(asset, fieldMapping.salvageRate) || 0);
        let usefulLife = parseInt(getFieldValue(asset, fieldMapping.usefulLife) || 0);
        const department = getFieldValue(asset, fieldMapping.department);
        const location = getFieldValue(asset, fieldMapping.location);
        const status = getFieldValue(asset, fieldMapping.status);
        const purchaseDate = getFieldValue(asset, fieldMapping.purchaseDate);
        
        // 尝试获取资产类别信息
        let categoryName = asset.categoryName || asset.category_name || '';
        const categoryId = asset.categoryId || asset.category_id;
        
        // 如果有类别ID但没有类别名称，从分类列表中查找
        let category = null;
        if (categoryId && categoryOptions.value.length > 0) {
          category = categoryOptions.value.find(c => c.id == categoryId);
          if (category && !categoryName) {
            categoryName = category.name;
          }
        }
        
        // 尝试从类别获取缺失的属性
        if (category) {
          // 如果资产没有使用年限，使用类别的默认使用年限
          if (!usefulLife && category.default_useful_life) {
            usefulLife = parseInt(category.default_useful_life);
            }
          
          // 如果资产没有折旧方法，使用类别的默认折旧方法
          if (!depreciationMethod && category.default_depreciation_method) {
            depreciationMethod = category.default_depreciation_method;
            }
        }
        
        // 为缺失的关键值设置默认值
        if (!usefulLife) {
          usefulLife = 5; // 默认5年
          }
        
        if (!depreciationMethod) {
          depreciationMethod = 'straight_line'; // 默认直线法
          }
        
        // 检查净值和原值
        if (originalValue <= 0 && currentValue > 0) {
          originalValue = currentValue;
        }
        
        // 如果原值为0，标记为无需计提折旧
        if (originalValue <= 0) {
          return {
            id,
            assetCode,
            assetName,
            originalValue: 0,
            netValueBefore: 0,
            depreciationAmount: 0,
            netValueAfter: 0,
            usedMonths: 0,
            usefulLife,
            salvageRate: salvageRate || (salvageValue > 0 ? (salvageValue / originalValue * 100) : 5), // 默认5%
            depreciationMethod,
            department,
            location,
            status,
            purchaseDate,
            categoryName
          };
        }
        
        // 计算已使用月份数
        let usedMonths = 0;
        if (purchaseDate) {
          const purchaseDateObj = new Date(purchaseDate);
          if (!isNaN(purchaseDateObj.getTime())) {
            const depreciationDate = new Date(`${searchForm.depreciationDate}-01`);
            usedMonths = (depreciationDate.getFullYear() - purchaseDateObj.getFullYear()) * 12 + 
                        (depreciationDate.getMonth() - purchaseDateObj.getMonth());
          } else {
            console.warn(`资产 ${assetCode || id} 购买日期格式无效: ${purchaseDate}`);
          }
        } else {
          console.warn(`资产 ${assetCode || id} 无购买日期，假设已使用12个月`);
          usedMonths = 12; // 假设已使用1年
        }
        
        // 使用资产当前净值，如果当前净值不存在，则用原值减去累计折旧
        const netValueBefore = currentValue > 0 ? currentValue : (originalValue - accumulatedDepreciation);
        
        // 计算折旧额
        let depreciationAmount = 0;
        let netValueAfter = netValueBefore;
        
        // 如果净值为0或者负数，或者已经超过使用年限，不计提折旧
        if (netValueBefore <= 0 || usedMonths >= usefulLife * 12) {
          depreciationAmount = 0;
          } else if (depreciationMethod === 'no_depreciation' || depreciationMethod === '不计提') {
          // 不计提折旧
          depreciationAmount = 0;
          } else {
          // 根据折旧方法计算
          try {
            const effectiveSalvageRate = salvageValue > 0 ? 
              (salvageValue / originalValue) : 
              (salvageRate > 0 ? salvageRate / 100 : 0.05); // 默认5%残值率
            const residualValue = originalValue * effectiveSalvageRate; // 残值
            
            if (depreciationMethod === '直线法' || depreciationMethod === 'straight_line' || depreciationMethod.includes('线性')) {
              // 直线法：(原值 - 残值) / 使用年限 / 12
              const monthlyDepreciation = (originalValue - residualValue) / (usefulLife * 12);
              depreciationAmount = Math.round(monthlyDepreciation * 100) / 100;
            } else if (depreciationMethod === '双倍余额递减法' || depreciationMethod === 'double_declining' || depreciationMethod.includes('递减')) {
              const totalMonths = usefulLife * 12;
              const remainingMonths = totalMonths - usedMonths;
              if (remainingMonths <= 24) {
                // 最后两年改用直线法：(净值 - 残值) / 剩余月数
                const monthlyDepreciation = Math.max(0, (netValueBefore - residualValue)) / remainingMonths;
                depreciationAmount = Math.round(monthlyDepreciation * 100) / 100;
              } else {
                // 双倍余额递减法：净值 * 2 / 使用年限 / 12
                const monthlyDepreciation = netValueBefore * 2 / totalMonths;
                depreciationAmount = Math.round(monthlyDepreciation * 100) / 100;
              }
            } else if (depreciationMethod === '年数总和法' || depreciationMethod === 'sum_of_years') {
              // 年数总和法
              const totalYears = usefulLife;
              const currentYear = Math.floor(usedMonths / 12) + 1;
              const sumOfYears = totalYears * (totalYears + 1) / 2;
              const remainingYears = totalYears - currentYear + 1;
              const yearlyDepreciation = (originalValue - residualValue) * remainingYears / sumOfYears;
              depreciationAmount = Math.round((yearlyDepreciation / 12) * 100) / 100;
            } else {
              // 默认按直线法（安全兜底）
              console.warn(`资产 ${assetCode || id} 折旧方法"${depreciationMethod}"未识别，使用直线法`);
              const monthlyDepreciation = (originalValue - residualValue) / (usefulLife * 12);
              depreciationAmount = Math.round(monthlyDepreciation * 100) / 100;
            }
            
            // 确保折旧后净值不低于残值
            if (netValueBefore - depreciationAmount < residualValue) {
              depreciationAmount = Math.max(0, Math.round((netValueBefore - residualValue) * 100) / 100);
            }
            
            // 计算计提后净值
            netValueAfter = Math.max(residualValue, netValueBefore - depreciationAmount);
          } catch (error) {
            console.error(`计算资产 ${assetCode || id} 折旧时出错:`, error);
            depreciationAmount = 0;
          }
        }
        
        return {
          id,
          assetCode,
          assetName,
          originalValue,
          netValueBefore,
          depreciationAmount,
          netValueAfter,
          usedMonths,
          usefulLife,
          salvageRate: salvageRate || (salvageValue > 0 ? (salvageValue / originalValue * 100) : 5), // 默认5%
          depreciationMethod,
          department,
          location,
          status,
          purchaseDate,
          categoryName
        };
      } catch (calcError) {
        console.error(`计算资产折旧出错 (${asset.assetCode || asset.asset_code || asset.id}):`, calcError);
        return {
          ...asset,
          id: asset.id,
          assetCode: asset.assetCode || asset.asset_code,
          assetName: asset.assetName || asset.asset_name,
          originalValue: parseFloat(asset.originalValue || asset.acquisition_cost || 0),
          netValueBefore: parseFloat(asset.netValue || asset.current_value || 0),
          depreciationAmount: 0,
          netValueAfter: parseFloat(asset.netValue || asset.current_value || 0)
        };
      }
    });
    
    // 先检查该月份是否已经计提过（在渲染表格前完成，避免视觉闪烁）
    try {
      const depCheckRes = await api.get(`/finance/assets/depreciation/records`, {
        params: { depreciationDate: searchForm.depreciationDate }
      });
      const records = depCheckRes.data?.data || depCheckRes.data || [];
      if (Array.isArray(records) && records.length > 0) {
        depreciationSubmitted.value = true;
      }
    } catch (checkErr) {
      console.warn('检查已计提状态失败:', checkErr?.response?.status);
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
    
    await api.post('/finance/assets/depreciation/submit', data);
    
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
    
    await api.post('/finance/assets/depreciation/submit', data);
    
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
  const baseURL = import.meta.env.VITE_API_URL || '';
  window.open(`${baseURL}/api/finance/assets/depreciation/export?depreciationDate=${searchForm.depreciationDate}&categoryId=${searchForm.categoryId || ''}&department=${searchForm.department || ''}`);
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
    const response = await api.get(`/finance/assets/categories`);
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
    const response = await api.get(`/system/departments/list`);
    departmentOptions.value = parseListData(response, { enableLog: false }).filter(item => item);
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
  background-color: #f8f8f8;
}

.confirm-content {
  padding: 10px 0;
}

.warning-message {
  margin-top: 15px;
  padding: 10px;
  background-color: #fef0f0;
  color: var(--color-danger);
  border-radius: var(--radius-sm);
  font-weight: bold;
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