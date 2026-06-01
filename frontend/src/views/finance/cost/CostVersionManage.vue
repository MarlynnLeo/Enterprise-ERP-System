<template>
  <div class="module-page cost-version-manage">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>标准成本版本工作台</h2>
          <p class="subtitle">按周期管理标准成本的测算、提交、审核和发布</p>
        </div>
        <el-button v-permission="'finance:cost:execute'" type="primary" :icon="Plus" @click="openCreateDialog">
          新建成本周期版本
        </el-button>
      </div>
    </el-card>

    <el-card class="data-card">
      <div class="table-toolbar">
        <el-radio-group v-model="filterStatus" @change="fetchVersions" size="small">
          <el-radio-button value="">全部状态</el-radio-button>
          <el-radio-button value="draft">草稿</el-radio-button>
          <el-radio-button value="pending">待审核</el-radio-button>
          <el-radio-button value="active">当前生效</el-radio-button>
          <el-radio-button value="archived">已归档</el-radio-button>
        </el-radio-group>
        <el-button size="small" :icon="Refresh" @click="fetchVersions">刷新列表</el-button>
      </div>

      <el-alert
        type="info"
        show-icon
        :closable="false"
        class="version-alert"
        title="草稿版本不影响线上核算；审核生效后会成为标准成本、差异分析和后续出库核算的成本基准。"
      />

      <el-table :data="versionList" v-loading="loading" border style="width: 100%">
        <el-table-column prop="version_no" label="版本编码" width="160" />
        <el-table-column prop="version_name" label="版本说明" min-width="200" />
        <el-table-column prop="effective_date" label="计划生效日期" width="140">
          <template #default="scope">
            {{ formatDate(scope.row.effective_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="created_by" label="发起人" width="110" />
        <el-table-column prop="status" label="状态" width="120">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)" effect="dark">
              {{ getStatusLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <template v-if="scope.row.status === 'draft'">
              <el-button v-permission="'finance:cost:execute'" size="small" type="warning" @click="handleGenerate(scope.row)" :loading="operatingId === scope.row.id">智能取价</el-button>
              <el-button v-permission="'finance:cost:update'" size="small" type="primary" @click="handleSubmit(scope.row)" :loading="operatingId === scope.row.id">提交审核</el-button>
            </template>

            <template v-if="scope.row.status === 'pending'">
              <el-button v-permission="'finance:cost:execute'" size="small" type="success" @click="handleApprove(scope.row)" :loading="operatingId === scope.row.id">审核生效</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="fetchVersions"
          @current-change="fetchVersions"
        />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" title="新建标准成本版本" width="500px">
      <el-alert
        title="新版本会以草稿状态创建，不影响当前线上业务核算。完成测算和核对后，再提交审核并发布生效。"
        type="info"
        show-icon
        style="margin-bottom: 20px"
        :closable="false"
      />
      <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
        <el-form-item label="版本编码" prop="version_no">
          <el-input v-model="form.version_no" placeholder="留空时由后端按编码规则生成" />
        </el-form-item>
        <el-form-item label="版本说明" prop="version_name">
          <el-input v-model="form.version_name" placeholder="如：2026年第二季度标准成本核算表" />
        </el-form-item>
        <el-form-item label="计划生效日期" prop="effective_date">
          <el-date-picker v-model="form.effective_date" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注说明">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-permission="'finance:cost:execute'" type="primary" @click="saveVersion" :loading="saving">确认创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { formatLocalDate } from '@/utils/format';
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { financeApi } from '@/api';
import { formatDate } from '@/utils/helpers/dateUtils';
import { parseResponseData } from '@/utils/responseParser';

const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const formRef = ref(null);
const operatingId = ref(null);

const filterStatus = ref('');
const versionList = ref([]);
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
});

const form = reactive({
  version_no: '',
  version_name: '',
  effective_date: '',
  remark: ''
});

const rules = {
  version_name: [{ required: true, message: '请输入版本说明', trigger: 'blur' }],
  effective_date: [{ required: true, message: '请选择生效日期', trigger: 'change' }]
};

const getStatusType = (status) => {
  const map = {
    draft: 'info',
    pending: 'warning',
    active: 'success',
    archived: ''
  };
  return map[status] || 'info';
};

const getStatusLabel = (status) => {
  const map = {
    draft: '草稿',
    pending: '审核中',
    active: '已生效',
    archived: '已归档'
  };
  return map[status] || status;
};

const fetchVersions = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: filterStatus.value || undefined
    };
    const res = await financeApi.cost.getCostVersions(params);
    const data = parseResponseData(res);
    versionList.value = data.list || [];
    pagination.total = Number(data.total) || 0;
  } catch {
    ElMessage.error('加载版本列表失败');
  } finally {
    loading.value = false;
  }
};

const openCreateDialog = () => {
  if (formRef.value) formRef.value.resetFields();
  form.version_no = '';
  form.version_name = '';
  form.effective_date = formatLocalDate(new Date());
  form.remark = '';
  dialogVisible.value = true;
};

const saveVersion = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    saving.value = true;
    try {
      await financeApi.cost.createCostVersion(form);
      ElMessage.success('版本创建成功');
      dialogVisible.value = false;
      fetchVersions();
    } catch (error) {
      ElMessage.error(error.response?.data?.message || '创建失败');
    } finally {
      saving.value = false;
    }
  });
};

const handleGenerate = async (row) => {
  try {
    await ElMessageBox.confirm(
      '系统将抽取全量物料近3个月的加权采购均价，生成或覆盖此草稿版本的基础标准成本明细，是否继续？',
      '智能取价',
      { type: 'warning' }
    );
    operatingId.value = row.id;
    const res = await financeApi.cost.generateCostVersion(row.id);
    ElMessage.success(parseResponseData(res, {})?.message || '测算成功');
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '测算异常');
  } finally {
    operatingId.value = null;
  }
};

const handleSubmit = async (row) => {
  try {
    await ElMessageBox.confirm('确认已完成各项价格核算并提交审核？', '提交审核', { type: 'info' });
    operatingId.value = row.id;
    await financeApi.cost.submitCostVersion(row.id);
    ElMessage.success('提交审核成功');
    fetchVersions();
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('提交审核失败');
  } finally {
    operatingId.value = null;
  }
};

const handleApprove = async (row) => {
  try {
    await ElMessageBox.confirm(
      `审核通过“${row.version_name}”后，当前生效版本会被归档，新版本将主导后续出库核算、标准成本和差异分析。是否继续？`,
      '发布确认',
      { type: 'error', confirmButtonText: '确认生效', cancelButtonText: '取消' }
    );
    operatingId.value = row.id;
    await financeApi.cost.approveCostVersion(row.id);
    ElMessage.success('新版本已生效');
    fetchVersions();
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '审核失败');
  } finally {
    operatingId.value = null;
  }
};

onMounted(() => {
  fetchVersions();
});
</script>

<style scoped>
.cost-version-manage {
  padding: 20px;
}

.header-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.title-section h2 {
  margin: 0;
  font-size: 24px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 5px 0 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.table-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.version-alert {
  margin-bottom: 16px;
}

.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .header-content,
  .table-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
