<template>
  <div class="cost-version-manage">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>标准成本版本工作台</h2>
          <p class="subtitle">管理企业多周期的标准成本（审批、发布、智能测算）</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建成本周期版本</el-button>
      </div>
    </el-card>

    <el-card class="data-card">
      <div class="table-toolbar">
        <el-radio-group v-model="filterStatus" @change="fetchVersions" size="small">
          <el-radio-button value="">全部状态</el-radio-button>
          <el-radio-button value="draft">草稿</el-radio-button>
          <el-radio-button value="pending">待审批</el-radio-button>
          <el-radio-button value="active">当前生效</el-radio-button>
          <el-radio-button value="archived">已归档</el-radio-button>
        </el-radio-group>
        <el-button size="small" :icon="Refresh" @click="fetchVersions">刷新列表</el-button>
      </div>

      <el-table :data="versionList" v-loading="loading" border style="width: 100%">
        <el-table-column prop="version_no" label="版本编码" width="160" />
        <el-table-column prop="version_name" label="版本说明" min-width="200" />
        <el-table-column prop="effective_date" label="计划生效日期" width="140">
          <template #default="scope">
            {{ formatDate(scope.row.effective_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="created_by" label="发起人" width="100" />
        <el-table-column prop="status" label="状态" width="120" align="center">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)" effect="dark">
              {{ getStatusLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="scope">
            <!-- 仅草稿状态允许操作智取底价和提交审批 -->
            <template v-if="scope.row.status === 'draft'">
              <el-button size="small" type="warning" @click="handleGenerate(scope.row)" :loading="operatingId === scope.row.id">智能采价</el-button>
              <el-button size="small" type="primary" @click="handleSubmit(scope.row)" :loading="operatingId === scope.row.id">提审</el-button>
            </template>

            <!-- 仅审批状态允许执行审批 -->
            <template v-if="scope.row.status === 'pending'">
               <el-button size="small" type="success" @click="handleApprove(scope.row)" :loading="operatingId === scope.row.id">审核生效</el-button>
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

    <!-- 新建对话框 -->
    <el-dialog v-model="dialogVisible" title="新建标准成本版本" width="500px">
      <el-alert title="注意：新建版本初始化为【草稿】状态，不影响当前线上业务测算。您可以在该草稿版本中进行成本采价核算，核对无误后进行提审。" type="info" show-icon style="margin-bottom: 20px" :closable="false" />
      <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
        <el-form-item label="版本编码" prop="version_no">
          <el-input v-model="form.version_no" placeholder="留空时由后端按编码规则生成" />
        </el-form-item>
        <el-form-item label="版本说明" prop="version_name">
          <el-input v-model="form.version_name" placeholder="如: 2026年第二季度标准成本核算表" />
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
        <el-button type="primary" @click="saveVersion" :loading="saving">确认创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import api from '@/services/api';
import { formatDate } from '@/utils/helpers/dateUtils'

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
    'draft': 'info',
    'pending': 'warning',
    'active': 'success',
    'archived': ''
  };
  return map[status] || 'info';
};

const getStatusLabel = (status) => {
  const map = {
    'draft': '草稿',
    'pending': '审批中',
    'active': '已生效',
    'archived': '老底案'
  };
  return map[status] || status;
};

// formatDate 已统一引用公共实现;

const fetchVersions = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: filterStatus.value || undefined
    };
    const res = await api.get('/finance-enhancement/cost-versions', { params });
    const data = res.data?.data || res.data;
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
  form.effective_date = new Date().toISOString().split('T')[0];
  form.remark = '';
  dialogVisible.value = true;
};

const saveVersion = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (valid) {
      saving.value = true;
      try {
        await api.post('/finance-enhancement/cost-versions', form);
        ElMessage.success('版本创建成功');
        dialogVisible.value = false;
        fetchVersions();
      } catch (error) {
        ElMessage.error(error.response?.data?.message || '创建失败');
      } finally {
        saving.value = false;
      }
    }
  });
};

const handleGenerate = async (row) => {
  try {
    await ElMessageBox.confirm('系统将抽取全量物料近3个月的加权采购均价，生成或覆盖此草稿版基础标准成本明细，是否继续？', '智能采价', {
      type: 'warning'
    });
    operatingId.value = row.id;
    const res = await api.post(`/finance-enhancement/cost-versions/${row.id}/generate`);
    ElMessage.success((res.data?.data?.message) || '测算成功');
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '测算异常');
  } finally {
    operatingId.value = null;
  }
};

const handleSubmit = async (row) => {
  try {
    await ElMessageBox.confirm('确认已完成各项价格核算并提报审批？', '提审说明', { type: 'info' });
    operatingId.value = row.id;
    await api.put(`/finance-enhancement/cost-versions/${row.id}/submit`);
    ElMessage.success('提审成功');
    fetchVersions();
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('提审失败');
  } finally {
    operatingId.value = null;
  }
};

const handleApprove = async (row) => {
  try {
    await ElMessageBox.confirm(
      `危险操作！审核通过【${row.version_name}】后，当前活跃版本的标准成本将被立即归档。新的定价将主导明天的出库核算单。强烈建议与业务部门完成双重核对，继续？`,
      '红线确认',
      { type: 'error', confirmButtonText: '坚决执行', cancelButtonText: '再想想' }
    );
    operatingId.value = row.id;
    await api.put(`/finance-enhancement/cost-versions/${row.id}/approve`);
    ElMessage.success('新版本重锤生效！');
    fetchVersions();
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '审批失败');
  } finally {
    operatingId.value = null;
  }
};

onMounted(() => {
  fetchVersions();
});
</script>

<style scoped>
.cost-version-manage { padding: 20px; }
.header-card { margin-bottom: 20px; }
.header-content { display: flex; justify-content: space-between; align-items: center; }
.title-section h2 { margin: 0; font-size: 24px; color: var(--color-text-primary); }
.subtitle { margin: 5px 0 0 0; color: var(--color-text-secondary); font-size: 14px; }
.table-toolbar { display: flex; justify-content: space-between; margin-bottom: 16px; }
.pagination-container { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
