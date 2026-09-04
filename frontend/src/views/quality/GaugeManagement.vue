<template>
  <div class="module-page gauge-management-container">
    <PageHeader title="量具台账" subtitle="量具台账、校准与状态管理">
      <template #actions>
        <el-button v-permission="'quality:gauges:create'" type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>新增量具
          </el-button>
      </template>
    </PageHeader>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-number">{{ stats.total }}</div>
            <div class="stat-label">量具总数</div>
          </div>
          <el-icon class="stat-icon primary"><Odometer /></el-icon>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-number text-success">{{ stats.inUse }}</div>
            <div class="stat-label">使用中</div>
          </div>
          <el-icon class="stat-icon success"><CircleCheck /></el-icon>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-number text-warning">{{ stats.dueSoon }}</div>
            <div class="stat-label">即将到期</div>
          </div>
          <el-icon class="stat-icon warning"><Warning /></el-icon>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-number text-danger">{{ stats.overdue }}</div>
            <div class="stat-label">已逾期</div>
          </div>
          <el-icon class="stat-icon danger"><CircleClose /></el-icon>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="data-card">


      <!-- 搜索 -->
      <FinanceQueryCard :model="searchForm" @search="handleSearch" @reset="handleReset">
        <template #basic>
          <el-form-item label="关键词">
            <el-input v-model="searchKeyword" placeholder="搜索编号/名称/型号" clearable @keyup.enter="handleSearch" />
          </el-form-item>
          <el-form-item label="使用状态">
            <el-select v-model="searchStatus" placeholder="使用状态" clearable>
              <el-option label="使用中" value="in_use" />
              <el-option label="校准中" value="calibrating" />
              <el-option label="维修中" value="repaired" />
              <el-option label="闲置" value="idle" />
              <el-option label="已报废" value="scrapped" />
            </el-select>
          </el-form-item>
        </template>
        <template #advanced>
          <el-form-item>
            <el-checkbox v-model="onlyOverdue">仅显示逾期</el-checkbox>
          </el-form-item>
        </template>
      </FinanceQueryCard>

      <!-- 表格 -->
      <el-table v-loading="loading" :data="tableData" border class="w-full mt-md">
        <el-table-column prop="gaugeNo" label="量具编号" width="130" />
        <el-table-column prop="gaugeName" label="量具名称" width="150" show-overflow-tooltip />
        <el-table-column prop="gaugeType" label="类型" width="100" />
        <el-table-column prop="model" label="型号" width="120" show-overflow-tooltip />
        <el-table-column prop="measurementRange" label="测量范围" width="120" />
        <el-table-column prop="accuracy" label="精度" width="80" />
        <el-table-column prop="custodian" label="保管人" width="80" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="scope">
            <el-tag :type="statusType(scope.row.status)">{{ statusLabel(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下次校准" width="120">
          <template #default="scope">
            <span :class="scope.row.daysUntilDue < 0 ? 'text-danger' : scope.row.daysUntilDue <= 30 ? 'text-warning' : ''">
              {{ scope.row.nextCalibrationDate ? formatDate(scope.row.nextCalibrationDate) : '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="剩余天数" width="100">
          <template #default="scope">
            <el-tag v-if="scope.row.daysUntilDue != null"
              :type="scope.row.daysUntilDue < 0 ? 'danger' : scope.row.daysUntilDue <= 30 ? 'warning' : 'success'" size="small">
              {{ scope.row.daysUntilDue < 0 ? `逾期${Math.abs(scope.row.daysUntilDue)}天` : `${scope.row.daysUntilDue}天` }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" min-width="300" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <div class="table-actions">
              <el-button v-permission="'quality:gauges:create'" size="small" type="primary" @click.stop="handleCalibrate(scope.row)">
                <el-icon><Odometer /></el-icon> 校准
              </el-button>
              <el-button size="small" type="warning" @click.stop="handleEdit(scope.row)" v-permission="'quality:gauges:update'">
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-button v-permission="'quality:gauges:delete'" size="small" type="danger" @click.stop="handleDelete(scope.row)">
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]" :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchData" @current-change="fetchData" />
      </div>
    </el-card>

    <!-- 量具新增/编辑对话框 -->
    <AppDialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑量具' : '新增量具'"
      mode="form"
      width="650px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="量具编号" prop="gaugeNo">
              <el-input v-model="form.gaugeNo" :disabled="isEdit" placeholder="如 GG-001" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="量具名称" prop="gaugeName">
              <el-input v-model="form.gaugeName" placeholder="如 游标卡尺" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="类型">
              <el-select  v-model="form.gaugeType" placeholder="选择类型" clearable>
                <el-option label="游标卡尺" value="游标卡尺" />
                <el-option label="千分尺" value="千分尺" />
                <el-option label="量块" value="量块" />
                <el-option label="三坐标CMM" value="CMM" />
                <el-option label="投影仪" value="投影仪" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="型号">
              <el-input v-model="form.model" placeholder="型号规格" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="测量范围">
              <el-input v-model="form.measurementRange" placeholder="如 0-150mm" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="精度">
              <el-input v-model="form.accuracy" placeholder="如 ±0.02mm" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="保管人">
              <el-input v-model="form.custodian" placeholder="保管人姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="存放位置">
              <el-input v-model="form.location" placeholder="如 品管室A区" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="校准周期(天)">
              <el-input-number v-model="form.calibrationCycleDays" :min="1" :max="3650" class="w-full" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="上次校准日期">
              <el-date-picker v-model="form.lastCalibrationDate" type="date" value-format="YYYY-MM-DD" class="w-full" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="状态">
          <el-select v-model="form.status">
            <el-option label="使用中" value="in_use" />
            <el-option label="校准中" value="calibrating" />
            <el-option label="闲置" value="idle" />
            <el-option label="已报废" value="scrapped" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-permission="isEdit ? 'quality:gauges:update' : 'quality:gauges:create'" type="primary" @click="handleSubmit" :loading="submitting">确认</el-button>
      </template>
        </AppDialog>

    <!-- 校准对话框 -->
    <AppDialog
      v-model="calDialogVisible"
      title="录入校准记录"
      mode="form"
      width="550px"
    >
      <el-form ref="calFormRef" :model="calForm" :rules="calRules" label-width="120px">
        <el-form-item label="量具">
          <el-input :value="calForm._gaugeName" disabled />
        </el-form-item>
        <el-form-item label="校准日期" prop="calibrationDate">
          <el-date-picker v-model="calForm.calibrationDate" type="date" value-format="YYYY-MM-DD" class="w-full" />
        </el-form-item>
        <el-form-item label="校准类型">
          <el-radio-group v-model="calForm.calibrationType">
            <el-radio value="internal">内部校准</el-radio>
            <el-radio value="external">外部校准</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="校准结果" prop="result">
          <el-select v-model="calForm.result" class="w-full">
            <el-option label="合格" value="qualified" />
            <el-option label="不合格" value="unqualified" />
            <el-option label="限用" value="limited" />
          </el-select>
        </el-form-item>
        <el-form-item label="校准人/机构">
          <el-input v-model="calForm.calibratedBy" placeholder="校准人或机构" />
        </el-form-item>
        <el-form-item label="证书编号">
          <el-input v-model="calForm.certificateNo" />
        </el-form-item>
        <el-form-item label="偏差值">
          <el-input-number v-model="calForm.deviation" :precision="6" class="w-full" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="calForm.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="calDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:gauges:create'" type="primary" @click="handleCalSubmit" :loading="submitting">提交校准记录</el-button>
      </template>
        </AppDialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'

import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { Plus, Odometer, CircleCheck, Warning, CircleClose, Edit, Delete } from '@element-plus/icons-vue';
import { qualityApi } from '@/api/quality';
import dayjs from 'dayjs';
import { formatDate } from '@/utils/helpers/dateUtils'
import FinanceQueryCard from '@/components/common/FinanceQueryCard.vue'

const loading = ref(false);
const submitting = ref(false);
const tableData = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const searchKeyword = ref('');
const searchStatus = ref('');
const onlyOverdue = ref(false);
const searchForm = computed(() => ({ keyword: searchKeyword.value, status: searchStatus.value, overdue: onlyOverdue.value }));
const handleSearch = () => { currentPage.value = 1; fetchData() }
const handleReset = () => { searchKeyword.value = ''; searchStatus.value = ''; onlyOverdue.value = false; currentPage.value = 1; fetchData() }

const dialogVisible = ref(false);
const isEdit = ref(false);
const formRef = ref(null);

const calDialogVisible = ref(false);
const calFormRef = ref(null);

const stats = reactive({ total: 0, inUse: 0, dueSoon: 0, overdue: 0 });

const form = ref({
  gaugeNo: '', gaugeName: '', gaugeType: '', model: '',
  measurementRange: '', accuracy: '', custodian: '', location: '',
  calibrationCycleDays: 365, lastCalibrationDate: null, status: 'idle', note: ''
});

const calForm = ref({
  gaugeId: null, _gaugeName: '', calibrationDate: dayjs().format('YYYY-MM-DD'),
  calibrationType: 'internal', result: 'qualified', calibratedBy: '',
  certificateNo: '', deviation: null, note: ''
});

const rules = {
  gaugeNo: [{ required: true, message: '请输入量具编号', trigger: 'blur' }],
  gaugeName: [{ required: true, message: '请输入量具名称', trigger: 'blur' }]
};

const calRules = {
  calibrationDate: [{ required: true, message: '请选择校准日期', trigger: 'change' }],
  result: [{ required: true, message: '请选择校准结果', trigger: 'change' }]
};

const statusType = (s) => ({ in_use: 'success', calibrating: 'warning', repaired: 'info', scrapped: 'danger', idle: '' }[s] || '');
const statusLabel = (s) => ({ in_use: '使用中', calibrating: '校准中', repaired: '维修中', scrapped: '已报废', idle: '闲置' }[s] || s);
const fetchData = async () => {
  loading.value = true;
  try {
    const res = await qualityApi.getGauges({ page: currentPage.value, pageSize: pageSize.value, keyword: searchKeyword.value, status: searchStatus.value, overdue: onlyOverdue.value });
    const data = res.data || res;
    tableData.value = data.list || [];
    total.value = data.total || 0;

    // 计算统计
    stats.total = data.total || tableData.value.length;
    stats.inUse = tableData.value.filter(r => r.status === 'in_use').length;
    stats.overdue = tableData.value.filter(r => r.daysUntilDue != null && r.daysUntilDue < 0).length;
    stats.dueSoon = tableData.value.filter(r => r.daysUntilDue != null && r.daysUntilDue >= 0 && r.daysUntilDue <= 30).length;
  } catch {
    ElMessage.error('获取量具列表失败');
  } finally {
    loading.value = false;
  }
};

const handleAdd = () => { isEdit.value = false; resetForm(); dialogVisible.value = true; };
const handleEdit = (row) => { isEdit.value = true; form.value = { ...row }; dialogVisible.value = true; };

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定要删除量具 ${row.gaugeNo} 吗？`, '警告', { type: 'warning' })
    .then(async () => {
      await qualityApi.deleteGauge(row.id);
      ElMessage.success('删除成功');
      fetchData();
    }).catch(() => {});
};

const handleSubmit = () => {
  formRef.value?.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      if (isEdit.value) {
        await qualityApi.updateGauge(form.value.id, form.value);
        ElMessage.success('更新成功');
      } else {
        await qualityApi.createGauge(form.value);
        ElMessage.success('创建成功');
      }
      dialogVisible.value = false;
      fetchData();
    } catch (error) {
      ElMessage.error(error.message || '操作失败');
    } finally { submitting.value = false; }
  });
};

const handleCalibrate = (row) => {
  calForm.value = {
    gaugeId: row.id, _gaugeName: `${row.gaugeNo} - ${row.gaugeName}`,
    calibrationDate: dayjs().format('YYYY-MM-DD'), calibrationType: 'internal',
    result: 'qualified', calibratedBy: '', certificateNo: '', deviation: null, note: ''
  };
  calDialogVisible.value = true;
};

const handleCalSubmit = () => {
  calFormRef.value?.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      const { _gaugeName, ...submitData } = calForm.value;
      await qualityApi.createCalibrationRecord(submitData);
      ElMessage.success('校准记录已提交');
      calDialogVisible.value = false;
      fetchData();
    } catch (error) {
      ElMessage.error(error.message || '校准记录提交失败');
    } finally { submitting.value = false; }
  });
};

const resetForm = () => {
  form.value = {
    gaugeNo: '', gaugeName: '', gaugeType: '', model: '',
    measurementRange: '', accuracy: '', custodian: '', location: '',
    calibrationCycleDays: 365, lastCalibrationDate: null, status: 'idle', note: ''
  };
  formRef.value?.clearValidate();
};

onMounted(fetchData);
</script>

<style scoped>
.gauge-management-container { padding: 20px; }
.stats-row { margin-bottom: 16px; }
.stat-card {
  cursor: pointer;
  border: 1px solid var(--color-border-lighter);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.2s ease, background-color 0.2s ease;
}
.stat-card:hover {
  border-color: var(--color-border-light);
  background: var(--color-bg-section);
  box-shadow: var(--shadow-sm) !important;
  transform: none !important;
}
.stat-card .el-card__body { display: flex; justify-content: space-between; align-items: center; }
.stat-content { text-align: left; }
.stat-number { font-size: 28px; font-weight: 700; color: var(--color-text-primary); }
.stat-label { font-size: 13px; color: var(--color-text-secondary); margin-top: 4px; }
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 48px;
  font-size: 22px;
  color: var(--color-on-primary);
  opacity: 1;
}
.stat-icon.primary { background: var(--color-primary); }
.stat-icon.success { background: var(--color-success); }
.stat-icon.warning { background: var(--color-warning); }
.stat-icon.danger { background: var(--color-danger); }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.search-container { margin-bottom: 20px; }
.pagination-container { margin-top: 20px; display: flex; justify-content: flex-end; }
</style>
