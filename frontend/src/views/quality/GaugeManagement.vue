<template>
  <div class="gauge-management-container">
    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-number">{{ stats.total }}</div>
            <div class="stat-label">量具总数</div>
          </div>
          <el-icon class="stat-icon" style="color: var(--color-primary)"><Odometer /></el-icon>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-number" style="color: #67C23A">{{ stats.inUse }}</div>
            <div class="stat-label">使用中</div>
          </div>
          <el-icon class="stat-icon" style="color: #67C23A"><CircleCheck /></el-icon>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-number" style="color: #E6A23C">{{ stats.dueSoon }}</div>
            <div class="stat-label">即将到期</div>
          </div>
          <el-icon class="stat-icon" style="color: #E6A23C"><Warning /></el-icon>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-number" style="color: #F56C6C">{{ stats.overdue }}</div>
            <div class="stat-label">已逾期</div>
          </div>
          <el-icon class="stat-icon" style="color: #F56C6C"><CircleClose /></el-icon>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>量具台账</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>新增量具
          </el-button>
        </div>
      </template>

      <!-- 搜索 -->
      <div class="search-container">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-input  v-model="searchKeyword" placeholder="搜索编号/名称/型号" clearable @clear="fetchData" @keyup.enter="fetchData" >
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
          </el-col>
          <el-col :span="4">
            <el-select  v-model="searchStatus" placeholder="使用状态" clearable @change="fetchData">
              <el-option label="使用中" value="in_use" />
              <el-option label="校准中" value="calibrating" />
              <el-option label="维修中" value="repaired" />
              <el-option label="闲置" value="idle" />
              <el-option label="已报废" value="scrapped" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-checkbox v-model="onlyOverdue" @change="fetchData">仅显示逾期</el-checkbox>
          </el-col>
          <el-col :span="4">
            <el-button type="primary" @click="fetchData">搜索</el-button>
          </el-col>
        </el-row>
      </div>

      <!-- 表格 -->
      <el-table v-loading="loading" :data="tableData" border style="width: 100%; margin-top: 20px" @row-click="handleRowClick">
        <el-table-column prop="gauge_no" label="量具编号" width="130" />
        <el-table-column prop="gauge_name" label="量具名称" width="150" show-overflow-tooltip />
        <el-table-column prop="gauge_type" label="类型" width="100" />
        <el-table-column prop="model" label="型号" width="120" show-overflow-tooltip />
        <el-table-column prop="measurement_range" label="测量范围" width="120" />
        <el-table-column prop="accuracy" label="精度" width="80" />
        <el-table-column prop="custodian" label="保管人" width="80" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="scope">
            <el-tag :type="statusType(scope.row.status)">{{ statusLabel(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下次校准" width="120">
          <template #default="scope">
            <span :style="{ color: scope.row.days_until_due < 0 ? '#F56C6C' : scope.row.days_until_due <= 30 ? '#E6A23C' : '' }">
              {{ scope.row.next_calibration_date ? formatDate(scope.row.next_calibration_date) : '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="剩余天数" width="100">
          <template #default="scope">
            <el-tag v-if="scope.row.days_until_due != null"
              :type="scope.row.days_until_due < 0 ? 'danger' : scope.row.days_until_due <= 30 ? 'warning' : 'success'" size="small">
              {{ scope.row.days_until_due < 0 ? `逾期${Math.abs(scope.row.days_until_due)}天` : `${scope.row.days_until_due}天` }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" min-width="200">
          <template #default="scope">
            <el-button size="small" type="primary" link @click.stop="handleCalibrate(scope.row)">校准</el-button>
            <el-button size="small" type="warning" link @click.stop="handleEdit(scope.row)"
              v-permission="'quality:settings'">编辑</el-button>
            <el-button v-permission="'quality:settings:delete'" size="small" type="danger" link @click.stop="handleDelete(scope.row)">删除</el-button>
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
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑量具' : '新增量具'" width="650px" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="量具编号" prop="gauge_no">
              <el-input v-model="form.gauge_no" :disabled="isEdit" placeholder="如 GG-001" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="量具名称" prop="gauge_name">
              <el-input v-model="form.gauge_name" placeholder="如 游标卡尺" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="类型">
              <el-select  v-model="form.gauge_type" placeholder="选择类型" clearable>
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
              <el-input v-model="form.measurement_range" placeholder="如 0-150mm" />
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
              <el-input-number v-model="form.calibration_cycle_days" :min="1" :max="3650" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="上次校准日期">
              <el-date-picker v-model="form.last_calibration_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
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
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确认</el-button>
      </template>
    </el-dialog>

    <!-- 校准对话框 -->
    <el-dialog v-model="calDialogVisible" title="录入校准记录" width="550px">
      <el-form ref="calFormRef" :model="calForm" :rules="calRules" label-width="120px">
        <el-form-item label="量具">
          <el-input :value="calForm._gauge_name" disabled />
        </el-form-item>
        <el-form-item label="校准日期" prop="calibration_date">
          <el-date-picker v-model="calForm.calibration_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="校准类型">
          <el-radio-group v-model="calForm.calibration_type">
            <el-radio value="internal">内部校准</el-radio>
            <el-radio value="external">外部校准</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="校准结果" prop="result">
          <el-select v-model="calForm.result" style="width:100%">
            <el-option label="合格" value="qualified" />
            <el-option label="不合格" value="unqualified" />
            <el-option label="限用" value="limited" />
          </el-select>
        </el-form-item>
        <el-form-item label="校准人/机构">
          <el-input v-model="calForm.calibrated_by" placeholder="校准人或机构" />
        </el-form-item>
        <el-form-item label="证书编号">
          <el-input v-model="calForm.certificate_no" />
        </el-form-item>
        <el-form-item label="偏差值">
          <el-input-number v-model="calForm.deviation" :precision="6" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="calForm.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="calDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:settings:create'" type="primary" @click="handleCalSubmit" :loading="submitting">提交校准记录</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'

import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Odometer, CircleCheck, Warning, CircleClose } from '@element-plus/icons-vue';
import { qualityApi } from '@/api/quality';
import dayjs from 'dayjs';
import { formatDate } from '@/utils/helpers/dateUtils'

const loading = ref(false);
const submitting = ref(false);
const tableData = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const searchKeyword = ref('');
const searchStatus = ref('');
const onlyOverdue = ref(false);

const dialogVisible = ref(false);
const isEdit = ref(false);
const formRef = ref(null);

const calDialogVisible = ref(false);
const calFormRef = ref(null);

const stats = reactive({ total: 0, inUse: 0, dueSoon: 0, overdue: 0 });

const form = ref({
  gauge_no: '', gauge_name: '', gauge_type: '', model: '',
  measurement_range: '', accuracy: '', custodian: '', location: '',
  calibration_cycle_days: 365, last_calibration_date: null, status: 'idle', note: ''
});

const calForm = ref({
  gauge_id: null, _gauge_name: '', calibration_date: dayjs().format('YYYY-MM-DD'),
  calibration_type: 'internal', result: 'qualified', calibrated_by: '',
  certificate_no: '', deviation: null, note: ''
});

const rules = {
  gauge_no: [{ required: true, message: '请输入量具编号', trigger: 'blur' }],
  gauge_name: [{ required: true, message: '请输入量具名称', trigger: 'blur' }]
};

const calRules = {
  calibration_date: [{ required: true, message: '请选择校准日期', trigger: 'change' }],
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
    stats.overdue = tableData.value.filter(r => r.days_until_due != null && r.days_until_due < 0).length;
    stats.dueSoon = tableData.value.filter(r => r.days_until_due != null && r.days_until_due >= 0 && r.days_until_due <= 30).length;
  } catch {
    ElMessage.error('获取量具列表失败');
  } finally {
    loading.value = false;
  }
};

const handleAdd = () => { isEdit.value = false; resetForm(); dialogVisible.value = true; };
const handleEdit = (row) => { isEdit.value = true; form.value = { ...row }; dialogVisible.value = true; };
const handleRowClick = (row) => { handleEdit(row); };

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定要删除量具 ${row.gauge_no} 吗？`, '警告', { type: 'warning' })
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
    gauge_id: row.id, _gauge_name: `${row.gauge_no} - ${row.gauge_name}`,
    calibration_date: dayjs().format('YYYY-MM-DD'), calibration_type: 'internal',
    result: 'qualified', calibrated_by: '', certificate_no: '', deviation: null, note: ''
  };
  calDialogVisible.value = true;
};

const handleCalSubmit = () => {
  calFormRef.value?.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      const { _gauge_name, ...submitData } = calForm.value;
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
  form.value = { gauge_no: '', gauge_name: '', gauge_type: '', model: '', measurement_range: '', accuracy: '', custodian: '', location: '', calibration_cycle_days: 365, last_calibration_date: null, status: 'idle', note: '' };
  formRef.value?.clearValidate();
};

onMounted(fetchData);
</script>

<style scoped>
.gauge-management-container { padding: 20px; }
.stats-row { margin-bottom: 16px; }
.stat-card { cursor: pointer; }
.stat-card .el-card__body { display: flex; justify-content: space-between; align-items: center; }
.stat-content { text-align: left; }
.stat-number { font-size: 28px; font-weight: 700; color: var(--color-text-primary); }
.stat-label { font-size: 13px; color: var(--color-text-secondary); margin-top: 4px; }
.stat-icon { font-size: 40px; opacity: 0.6; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.search-container { margin-bottom: 20px; }
.pagination-container { margin-top: 20px; display: flex; justify-content: flex-end; }
</style>
