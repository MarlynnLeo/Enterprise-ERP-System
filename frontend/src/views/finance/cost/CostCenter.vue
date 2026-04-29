<template>
  <div class="cost-center-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>成本中心管理</h2>
          <p class="subtitle">管理企业成本中心及成本归集</p>
        </div>
        <div class="action-section">
          <el-button type="primary" @click="showCreateDialog">
            <el-icon><Plus /></el-icon> 新增成本中心
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 标签页 -->
    <el-card class="data-card">
      <el-tabs v-model="activeTab">
        <!-- 成本中心列表 -->
        <el-tab-pane label="成本中心" name="centers">
          <el-table :data="costCenters" border v-loading="loading" row-key="id">
            <el-table-column prop="code" label="编码" width="150"></el-table-column>
            <el-table-column prop="name" label="名称" width="180"></el-table-column>
            <el-table-column prop="department_name" label="关联部门" width="180">
              <template #default="scope">
                <span v-if="scope.row.department_name">
                  <el-icon><OfficeBuilding /></el-icon>
                  {{ scope.row.department_name }}
                </span>
                <span v-else style="color: var(--color-text-secondary);">-</span>
              </template>
            </el-table-column>
            <el-table-column prop="type" label="类型" width="100">
              <template #default="scope">
                <el-tag :type="getTypeColor(scope.row.type)" size="small">{{ getTypeName(scope.row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="manager" label="负责人" width="120"></el-table-column>
            <el-table-column prop="task_count" label="关联任务" width="100" align="center"></el-table-column>
            <el-table-column prop="is_active" label="状态" width="80" align="center">
              <template #default="scope">
                <el-tag :type="scope.row.is_active ? 'success' : 'info'" size="small">
                  {{ scope.row.is_active ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="200" fixed="right">
              <template #default="scope">
                <el-button type="primary" size="small" @click="editCenter(scope.row)" v-permission="'finance:cost:settings'">编辑</el-button>
                <el-button type="info" size="small" @click="viewReport(scope.row)">成本报表</el-button>
                <el-button v-permission="'finance:cost:delete'" type="danger" size="small" @click="deleteCenter(scope.row)" :disabled="scope.row.task_count > 0">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>



        <!-- 成本归集报表 -->
        <el-tab-pane label="成本归集报表" name="report">
          <div class="report-toolbar">
            <el-date-picker v-model="reportDateRange" type="daterange" range-separator="至"
                            start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD"
                            style="width: 280px; margin-right: 10px;"></el-date-picker>
            <el-button type="primary" @click="loadCostReport">查询</el-button>
          </div>
          <el-table :data="costReport" border v-loading="reportLoading" show-summary>
            <el-table-column prop="code" label="成本中心编码" width="250"></el-table-column>
            <el-table-column prop="name" label="成本中心名称" width="250"></el-table-column>
            <el-table-column prop="type" label="类型" width="100">
              <template #default="scope">
                <el-tag size="small" :type="getTypeColor(scope.row.type)">{{ getTypeName(scope.row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="material_cost" label="材料成本" width="200" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.material_cost) }}</template>
            </el-table-column>
            <el-table-column prop="labor_cost" label="人工成本" width="200" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.labor_cost) }}</template>
            </el-table-column>
            <el-table-column prop="overhead_cost" label="制造费用" width="200" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.overhead_cost) }}</template>
            </el-table-column>
            <el-table-column prop="total_cost" label="总成本" width="200" align="right">
              <template #default="scope">
                <span style="font-weight: bold; color: var(--color-primary);">{{ formatCurrency(scope.row.total_cost) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="task_count" label="任务数" width="145" align="center"></el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 成本中心编辑对话框 -->
    <el-dialog v-model="centerDialogVisible" :title="isEdit ? '编辑成本中心' : '新增成本中心'" width="500px">
      <el-form :model="centerForm" :rules="centerRules" ref="centerFormRef" label-width="100px">
        <el-form-item label="编码" prop="code">
          <el-input v-model="centerForm.code" :disabled="isEdit" placeholder="如: CC-PRD-01"></el-input>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="centerForm.name" placeholder="成本中心名称"></el-input>
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="centerForm.type" style="width: 100%;">
            <el-option label="生产部门" value="production"></el-option>
            <el-option label="服务部门" value="service"></el-option>
            <el-option label="管理部门" value="administration"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="上级中心">
          <el-select v-model="centerForm.parent_id" clearable style="width: 100%;">
            <el-option v-for="c in centerOptions" :key="c.id" :label="`${c.code} - ${c.name}`" :value="c.id"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="centerForm.manager" placeholder="负责人姓名"></el-input>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="centerForm.description" type="textarea" :rows="3" placeholder="成本中心描述"></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="centerForm.is_active" active-text="启用" inactive-text="停用"></el-switch>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="centerDialogVisible = false">取消</el-button>
        <el-button v-permission="'finance:cost:update'" type="primary" @click="saveCenter" :loading="saving">保存</el-button>
      </template>
    </el-dialog>


  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, OfficeBuilding } from '@element-plus/icons-vue';
import api from '@/services/api';
import { formatCurrency } from '@/utils/helpers/formatters';

const activeTab = ref('centers');
const loading = ref(false);
const reportLoading = ref(false);
const saving = ref(false);

// 成本中心数据
const costCenters = ref([]);
const centerOptions = ref([]);
const centerDialogVisible = ref(false);
const isEdit = ref(false);
const centerFormRef = ref(null);
const centerForm = reactive({
  id: null,
  code: '',
  name: '',
  type: 'production',
  parent_id: null,
  manager: '',
  description: '',
  is_active: true
});
const centerRules = {
  code: [{ required: true, message: '请输入编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }]
};



// 成本报表数据
const costReport = ref([]);
const reportDateRange = ref([]);

// 加载成本中心列表
const loadCostCenters = async () => {
  loading.value = true;
  try {
    const res = await api.get('/finance/cost-centers');
    costCenters.value = res.data?.data || res.data || [];
  } catch (error) {
    console.error('加载成本中心失败:', error);
    ElMessage.error('加载成本中心失败');
  } finally {
    loading.value = false;
  }
};

// 加载成本中心选项
const loadCenterOptions = async () => {
  try {
    const res = await api.get('/finance/cost-centers/options');
    centerOptions.value = res.data?.data || res.data || [];
  } catch (error) {
    console.error('加载成本中心选项失败:', error);
  }
};



// 加载成本报表
const loadCostReport = async () => {
  reportLoading.value = true;
  try {
    const params = {};
    if (reportDateRange.value && reportDateRange.value.length === 2) {
      params.startDate = reportDateRange.value[0];
      params.endDate = reportDateRange.value[1];
    }
    const res = await api.get('/finance/cost-centers/report', { params });
    costReport.value = res.data?.data || res.data || [];
  } catch (error) {
    console.error('加载成本报表失败:', error);
    ElMessage.error('加载成本报表失败');
  } finally {
    reportLoading.value = false;
  }
};

// 显示新增成本中心对话框
const showCreateDialog = () => {
  isEdit.value = false;
  Object.assign(centerForm, { id: null, code: '', name: '', type: 'production', parent_id: null, manager: '', description: '', is_active: true });
  centerDialogVisible.value = true;
};

// 编辑成本中心
const editCenter = (row) => {
  isEdit.value = true;
  Object.assign(centerForm, { ...row, is_active: !!row.is_active });
  centerDialogVisible.value = true;
};

// 保存成本中心
const saveCenter = async () => {
  try {
    await centerFormRef.value.validate();
    saving.value = true;
    if (isEdit.value) {
      await api.put(`/finance/cost-centers/${centerForm.id}`, centerForm);
      ElMessage.success('更新成功');
    } else {
      await api.post('/finance/cost-centers', centerForm);
      ElMessage.success('创建成功');
    }
    centerDialogVisible.value = false;
    loadCostCenters();
    loadCenterOptions();
  } catch (error) {
    console.error('保存失败:', error);
    ElMessage.error(error.response?.data?.message || '保存失败');
  } finally {
    saving.value = false;
  }
};

// 删除成本中心
const deleteCenter = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除成本中心 "${row.name}" 吗？`, '确认删除', { type: 'warning' });
    await api.delete(`/finance/cost-centers/${row.id}`);
    ElMessage.success('删除成功');
    loadCostCenters();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || '删除失败');
    }
  }
};

// 查看成本报表
const viewReport = (row) => {
  activeTab.value = 'report';
  loadCostReport();
};

// 工具函数
const getTypeName = (type) => ({ production: '生产', service: '服务', administration: '管理' }[type] || type);
const getTypeColor = (type) => ({ production: 'success', service: 'primary', administration: 'warning' }[type] || 'info');

// 初始化
onMounted(() => {
  loadCostCenters();
  loadCenterOptions();
});
</script>

<style scoped>
.cost-center-container { padding: 20px; }
.header-card { margin-bottom: 20px; }
.header-content { display: flex; justify-content: space-between; align-items: center; }
.title-section h2 { margin: 0; font-size: 24px; color: var(--color-text-primary); }
.subtitle { margin: 5px 0 0 0; color: var(--color-text-secondary); font-size: 14px; }
.data-card { margin-bottom: 20px; }
.report-toolbar { margin-bottom: 15px; }
</style>
