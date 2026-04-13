<template>
  <div class="asset-detail-container">
    <!-- 头部卡片 -->
    <el-card class="header-card" shadow="never">
      <div class="header-content">
        <div class="title-section">
          <el-button link :icon="Back" @click="goBack" class="back-btn">返回列表</el-button>
          <h2>{{ assetCode }} - {{ assetInfo.assetName }}</h2>
          <el-tag :type="getStatusType(assetInfo.status)" class="status-tag">
            {{ getStatusText(assetInfo.status) }}
          </el-tag>
        </div>
        <div class="action-section">
          <el-button type="danger" @click="openImpairmentDialog" v-if="assetInfo.status === 'in_use' || assetInfo.status === 'idle'">计提减值</el-button>
        </div>
      </div>
    </el-card>

    <div class="main-content">
      <!-- 左侧：基本信息与折旧属性 -->
      <div class="left-panel">
        <el-card class="info-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>基本信息</span>
            </div>
          </template>
          <el-descriptions :column="2" border class="asset-descriptions">
            <el-descriptions-item label="资产编号">{{ assetInfo.assetCode }}</el-descriptions-item>
            <el-descriptions-item label="资产名称">{{ assetInfo.assetName }}</el-descriptions-item>
            <el-descriptions-item label="资产类别">{{ getCategoryName(assetInfo.categoryId) }}</el-descriptions-item>
            <el-descriptions-item label="购入日期">{{ formatDate(assetInfo.purchaseDate) }}</el-descriptions-item>
            <el-descriptions-item label="原值"><span class="amount-text">{{ formatCurrency(assetInfo.originalValue) }}</span></el-descriptions-item>
            <el-descriptions-item label="净值"><span class="amount-text value-text">{{ formatCurrency(assetInfo.netValue) }}</span></el-descriptions-item>
            <el-descriptions-item label="使用部门">{{ assetInfo.department || '-' }}</el-descriptions-item>
            <el-descriptions-item label="责任人">{{ assetInfo.responsible || '-' }}</el-descriptions-item>
            <el-descriptions-item label="存放地点">{{ assetInfo.location || '-' }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ assetInfo.notes || '无' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card class="info-card mt-4" shadow="never">
          <template #header>
            <div class="card-header">
              <span>折旧属性</span>
            </div>
          </template>
          <el-descriptions :column="2" border class="asset-descriptions">
            <el-descriptions-item label="折旧方法">{{ getDepreciationMethodText(assetInfo.depreciationMethod) }}</el-descriptions-item>
            <el-descriptions-item label="预计使用年限">{{ assetInfo.usefulLife }} 年</el-descriptions-item>
            <el-descriptions-item label="残值率">{{ assetInfo.salvageRate }}%</el-descriptions-item>
            <el-descriptions-item label="减值准备">
              <span class="amount-text danger-text">{{ formatCurrency(assetInfo.impairment_amount || 0) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="累计折旧"><span class="amount-text warning-text">{{ formatCurrency((assetInfo.originalValue - assetInfo.netValue) - (assetInfo.impairment_amount || 0)) }}</span></el-descriptions-item>
          </el-descriptions>
        </el-card>
      </div>

      <!-- 右侧：时间线与记录 -->
      <div class="right-panel">
        <el-card class="timeline-card" shadow="never">
          <el-tabs v-model="activeTab" class="asset-tabs">
            <el-tab-pane label="变动记录" name="changelogs">
              <el-timeline v-loading="logsLoading">
                <el-timeline-item
                  v-for="(log, index) in changeLogs"
                  :key="index"
                  :timestamp="formatDateTime(log.change_date)"
                  :type="getLogType(log.change_type)"
                >
                  <div class="log-content">
                    <div class="log-title">
                      <strong>{{ log.change_type }}</strong>
                      <span class="log-user">由 {{ log.changed_by }} 操作</span>
                    </div>
                    <div class="log-details" v-if="log.field_name">
                      <span class="log-field">{{ log.field_name }}: </span>
                      <span class="log-old">{{ log.old_value || '-' }}</span>
                      <el-icon><Right /></el-icon>
                      <span class="log-new">{{ log.new_value || '-' }}</span>
                    </div>
                    <div class="log-remarks" v-if="log.remarks">{{ log.remarks }}</div>
                  </div>
                </el-timeline-item>
                <el-empty v-if="changeLogs.length === 0" description="暂无变动记录"></el-empty>
              </el-timeline>
            </el-tab-pane>
            
            <el-tab-pane label="折旧历史" name="depreciation">
              <el-table :data="depreciationHistory" v-loading="depHistoryLoading" style="width: 100%" size="small" border max-height="400">
                <el-table-column prop="depreciation_date" label="折旧日期" width="100">
                  <template #default="scope">{{ formatDate(scope.row.depreciation_date) }}</template>
                </el-table-column>
                <el-table-column prop="depreciation_amount" label="折旧金额" align="right">
                  <template #default="scope">
                    <span class="amount-text">{{ formatCurrency(scope.row.depreciation_amount) }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="book_value_after" label="折旧后净值" align="right">
                  <template #default="scope">{{ formatCurrency(scope.row.book_value_after) }}</template>
                </el-table-column>
                <el-table-column prop="voucher_no" label="总账凭证号" width="180">
                  <template #default="scope">
                    <el-tag v-if="scope.row.voucher_no" type="success" size="small">{{ scope.row.voucher_no }}</el-tag>
                    <span v-else style="color: #909399">-</span>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>
            <el-tab-pane label="减值记录" name="impairment">
              <el-table :data="impairmentHistory" v-loading="impLoading" style="width: 100%" size="small" border max-height="400">
                <el-table-column prop="impairment_date" label="减值日期" width="100">
                  <template #default="scope">{{ formatDate(scope.row.impairment_date) }}</template>
                </el-table-column>
                <el-table-column prop="impairment_amount" label="减值金额" align="right">
                  <template #default="scope">
                    <span class="amount-text danger-text">{{ formatCurrency(scope.row.impairment_amount) }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="reason" label="减值原因" show-overflow-tooltip></el-table-column>
                <el-table-column prop="handled_by" label="经办人" width="100"></el-table-column>
              </el-table>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </div>
    </div>

    <!-- 计提减值对话框 -->
    <el-dialog v-model="impairmentDialogVisible" title="计提资产减值" width="500px">
      <el-form :model="impairmentForm" :rules="impairmentRules" ref="impairmentFormRef" label-width="100px">
        <el-alert
          title="当前资产净值"
          :description="'¥ ' + formatCurrency(assetInfo.netValue)"
          type="warning"
          :closable="false"
          style="margin-bottom: 20px"
        />
        <el-form-item label="减值金额" prop="impairment_amount">
          <el-input-number v-model="impairmentForm.impairment_amount" :min="0.01" :max="assetInfo.netValue" :precision="2" :step="100" style="width: 100%" />
        </el-form-item>
        <el-form-item label="减值日期" prop="impairment_date">
          <el-date-picker v-model="impairmentForm.impairment_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="减值原因" prop="reason">
          <el-input v-model="impairmentForm.reason" type="textarea" :rows="3" placeholder="请输入发生减值的原因（如：损坏、技术淘汰等）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="impairmentDialogVisible = false">取消</el-button>
          <el-button type="danger" @click="submitImpairment" :loading="submitLoading">确认计提</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Back, Right } from '@element-plus/icons-vue';
import { api } from '@/services/api';
import { formatDate, formatDateTime, formatCurrency } from '@/utils/helpers/formatters';
import { getAssetStatusText, getAssetStatusColor } from '@/constants/systemConstants';
import { parseListData } from '@/utils/responseParser';

const route = useRoute();
const router = useRouter();
const assetId = route.params.id;
const assetCode = ref('');

const activeTab = ref('changelogs');

// 状态标识
const loading = ref(false);
const logsLoading = ref(false);
const depHistoryLoading = ref(false);

// 数据记录
const assetInfo = reactive({
  id: null,
  assetCode: '',
  assetName: '',
  categoryId: null,
  purchaseDate: '',
  originalValue: 0,
  netValue: 0,
  usefulLife: 5,
  salvageRate: 5.0,
  depreciationMethod: 'straight_line',
  location: '',
  department: '',
  responsible: '',
  status: 'in_use',
  notes: ''
});

const changeLogs = ref([]);
const depreciationHistory = ref([]);
const impairmentHistory = ref([]);
const categoryOptions = ref([]);

// 减值相关的状态
const impLoading = ref(false);
const impairmentDialogVisible = ref(false);
const submitLoading = ref(false);
const impairmentFormRef = ref(null);
const impairmentForm = reactive({
  impairment_amount: 0,
  impairment_date: '',
  reason: ''
});
const impairmentRules = {
  impairment_amount: [{ required: true, message: '请输入减值金额', trigger: 'blur' }],
  impairment_date: [{ required: true, message: '请选择减值日期', trigger: 'change' }],
  reason: [{ required: true, message: '请输入减值原因', trigger: 'blur' }]
};

// 状态处理
const getStatusType = (status) => getAssetStatusColor(status);
const getStatusText = (status) => getAssetStatusText(status);

const getDepreciationMethodText = (method) => {
  const map = {
    'straight_line': '直线法',
    'double_declining': '双倍余额递减法',
    'sum_of_years': '年数总和法',
    'no_depreciation': '不计提折旧'
  };
  return map[method] || method;
};

const getCategoryName = (id) => {
  const cat = categoryOptions.value.find(c => c.id === id);
  return cat ? cat.name : id;
};

const getLogType = (type) => {
  const map = {
    '创建': 'success',
    '编辑': 'primary',
    '折旧': 'warning',
    '调拨': 'info',
    '处置': 'danger',
    '状态变更': 'primary'
  };
  return map[type] || 'info';
};

const goBack = () => {
  router.push('/finance/assets/list');
};

const loadAssetData = async () => {
  if (!assetId) return;
  
  loading.value = true;
  try {
    const response = await api.get(`/finance/assets/${assetId}`);
    const data = response.data;
    Object.assign(assetInfo, data);
    assetCode.value = data.assetCode;
  } catch (error) {
    ElMessage.error('获取资产详情失败');
  } finally {
    loading.value = false;
  }
};

const loadChangeLogs = async () => {
  if (!assetId) return;
  
  logsLoading.value = true;
  try {
    const response = await api.get(`/finance/assets/${assetId}/change-logs`);
    changeLogs.value = response.data?.logs || [];
  } catch (error) {
    console.error('获取变动记录失败:', error);
  } finally {
    logsLoading.value = false;
  }
};

const loadDepreciationHistory = async () => {
  if (!assetId) return;
  
  depHistoryLoading.value = true;
  try {
    const response = await api.get(`/finance/assets/${assetId}/depreciation-history`);
    depreciationHistory.value = response.data || [];
  } catch (error) {
    console.error('获取折旧历史失败:', error);
  } finally {
    depHistoryLoading.value = false;
  }
};

const loadImpairmentHistory = async () => {
  if (!assetId) return;
  impLoading.value = true;
  try {
    const response = await api.get(`/finance/assets/${assetId}/impairments`);
    impairmentHistory.value = response.data || [];
  } catch (error) {
    console.error('获取减值记录失败:', error);
  } finally {
    impLoading.value = false;
  }
};

const openImpairmentDialog = () => {
  impairmentForm.impairment_amount = 0;
  impairmentForm.impairment_date = new Date().toISOString().split('T')[0];
  impairmentForm.reason = '';
  impairmentDialogVisible.value = true;
};

const submitImpairment = async () => {
  if (!impairmentFormRef.value) return;
  
  await impairmentFormRef.value.validate(async (valid) => {
    if (valid) {
      if (impairmentForm.impairment_amount > assetInfo.netValue) {
        ElMessage.error('减值金额不能大于当前净值');
        return;
      }
      
      submitLoading.value = true;
      try {
        await api.post(`/finance/assets/${assetId}/impairments`, impairmentForm);
        ElMessage.success('减值计提成功');
        impairmentDialogVisible.value = false;
        // 重新加载所有相关数据
        loadAssetData();
        loadChangeLogs();
        loadImpairmentHistory();
      } catch (error) {
        ElMessage.error(error.message || '减值计提失败');
      } finally {
        submitLoading.value = false;
      }
    }
  });
};

const loadCategoryOptions = async () => {
  try {
    const response = await api.get('/finance/assets/categories');
    categoryOptions.value = parseListData(response, { enableLog: false });
  } catch (error) {
    console.error('获取类别失败:', error);
  }
};

onMounted(() => {
  loadCategoryOptions().then(() => {
    loadAssetData();
  });
  loadChangeLogs();
  loadDepreciationHistory();
  loadImpairmentHistory();
});
</script>

<style scoped>
.asset-detail-container {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.header-card {
  margin-bottom: 20px;
  border-radius: 8px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section {
  display: flex;
  align-items: center;
  gap: 15px;
}

.title-section h2 {
  margin: 0;
  font-size: 22px;
  color: var(--color-text-primary);
}

.back-btn {
  margin-right: 10px;
  font-size: 14px;
}

.main-content {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.left-panel {
  flex: 5;
  display: flex;
  flex-direction: column;
}

.right-panel {
  flex: 4;
}

.info-card, .timeline-card {
  border-radius: 8px;
}

.mt-4 {
  margin-top: 20px;
}

.card-header {
  font-weight: bold;
  font-size: 16px;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
}

.card-header::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 16px;
  background-color: var(--el-color-primary);
  margin-right: 8px;
  border-radius: 2px;
}

/* 描述列表样式调整 */
.asset-descriptions {
  --el-descriptions-item-bordered-label-background: #f8f9fa;
}

:deep(.el-descriptions__label) {
  width: 120px;
  color: var(--color-text-regular);
}

:deep(.el-descriptions__content) {
  color: var(--color-text-primary);
  font-weight: 500;
}

.amount-text {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-weight: bold;
}

.value-text {
  color: var(--el-color-success);
}

.warning-text {
  color: var(--el-color-warning);
}

.danger-text {
  color: var(--el-color-danger);
}

/* 时间线样式 */
.timeline-card {
  max-height: calc(100vh - 200px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.timeline-card :deep(.el-card__body) {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.timeline-card :deep(.el-tabs) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.timeline-card :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.timeline-card :deep(.el-tab-pane) {
  max-height: calc(100vh - 320px);
  overflow-y: auto;
}

.log-content {
  background: #f8f9fa;
  padding: 12px 16px;
  border-radius: 6px;
  margin-top: 5px;
  border: 1px solid var(--color-border-lighter);
}

.log-title {
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.log-title strong {
  color: var(--color-text-primary);
  font-size: 14px;
}

.log-user {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.log-details {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}

.log-field {
  color: var(--color-text-regular);
}

.log-old {
  text-decoration: line-through;
  color: var(--color-text-secondary);
}

.log-new {
  color: var(--el-color-success);
  font-weight: 500;
}

.log-remarks {
  font-size: 13px;
  color: var(--color-text-regular);
  background: #fff;
  padding: 8px;
  border-radius: 4px;
  margin-top: 8px;
  border-left: 3px solid var(--color-border-base);
}
</style>
