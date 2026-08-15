<template>
  <div class="module-page cost-center-container">
    <!-- 页面标题 -->
    <PageHeader title="成本中心" subtitle="管理企业成本中心及成本归集">
      <template #actions>
<el-button v-permission="'finance:cost:create'" type="primary" @click="showCreateDialog">
            <el-icon><Plus /></el-icon> 新增成本中心
          </el-button>
      </template>
    </PageHeader>
    <!-- 标签页 -->
    <el-card class="data-card">
      <el-tabs v-model="activeTab">
        <!-- 成本中心列表 -->
        <el-tab-pane label="成本中心" name="centers">
          <el-table :data="costCenters" border v-loading="loading" row-key="id">
            <el-table-column prop="code" label="编码" width="150"></el-table-column>
            <el-table-column prop="name" label="名称" width="180"></el-table-column>
            <el-table-column prop="departmentName" label="关联部门" width="180">
              <template #default="scope">
                <span v-if="scope.row.departmentName">
                  <el-icon><OfficeBuilding /></el-icon>
                  {{ scope.row.departmentName }}
                </span>
                <span v-else class="text-muted">-</span>
              </template>
            </el-table-column>
            <el-table-column prop="type" label="类型" width="100">
              <template #default="scope">
                <el-tag :type="getTypeColor(scope.row.type)" size="small">{{ getTypeName(scope.row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="manager" label="负责人" width="120"></el-table-column>
            <el-table-column prop="taskCount" label="关联任务" width="100"></el-table-column>
            <el-table-column prop="isActive" label="状态" width="80">
              <template #default="scope">
                <el-tag :type="scope.row.isActive ? 'success' : 'info'" size="small">
                  {{ scope.row.isActive ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
              <template #default="scope">
                <div class="table-actions">
                  <el-button size="small" @click="editCenter(scope.row)" v-permission="'finance:cost:update'">
                    <el-icon><Edit /></el-icon> 编辑
                  </el-button>
                  <el-button type="info" size="small" @click="viewReport(scope.row)">
                    <el-icon><DataAnalysis /></el-icon> 成本报表
                  </el-button>
                  <el-button v-permission="'finance:cost:delete'" type="danger" size="small" @click="deleteCenter(scope.row)" :disabled="scope.row.taskCount > 0">
                    <el-icon><Delete /></el-icon> 删除
                  </el-button>
                </div>
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
            <el-table-column prop="materialCost" label="材料成本" width="200">
              <template #default="scope">{{ formatCurrency(scope.row.materialCost) }}</template>
            </el-table-column>
            <el-table-column prop="laborCost" label="人工成本" width="200">
              <template #default="scope">{{ formatCurrency(scope.row.laborCost) }}</template>
            </el-table-column>
            <el-table-column prop="overheadCost" label="制造费用" width="200">
              <template #default="scope">{{ formatCurrency(scope.row.overheadCost) }}</template>
            </el-table-column>
            <el-table-column prop="totalCost" label="总成本" width="200">
              <template #default="scope">
                <span class="text-primary font-weight-700">{{ formatCurrency(scope.row.totalCost) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="taskCount" label="任务数" width="145"></el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>
    <!-- 成本中心编辑对话框 -->
    <AppDialog
      v-model="centerDialogVisible"
      :title="isEdit ? '编辑成本中心' : '新增成本中心'"
      mode="form"
      width="500px"
    >
      <el-form :model="centerForm" :rules="centerRules" ref="centerFormRef" label-width="100px">
        <el-form-item label="编码" prop="code">
          <el-input v-model="centerForm.code" :disabled="isEdit" placeholder="如: CC-PRD-01" maxlength="20" show-word-limit></el-input>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="centerForm.name" placeholder="成本中心名称" maxlength="100" show-word-limit></el-input>
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="centerForm.type" class="w-full">
            <el-option label="生产部门" value="production"></el-option>
            <el-option label="服务部门" value="service"></el-option>
            <el-option label="管理部门" value="administration"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="上级中心">
          <el-select v-model="centerForm.parentId" clearable class="w-full">
            <el-option v-for="c in centerOptions" :key="c.id" :label="`${c.code} - ${c.name}`" :value="c.id"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="centerForm.manager" placeholder="负责人姓名" maxlength="50" show-word-limit></el-input>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="centerForm.description" type="textarea" :rows="3" placeholder="成本中心描述"></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="centerForm.isActive" active-text="启用" inactive-text="停用"></el-switch>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="centerDialogVisible = false">取消</el-button>
        <el-button v-permission="isEdit ? 'finance:cost:update' : 'finance:cost:create'" type="primary" @click="saveCenter" :loading="saving">保存</el-button>
      </template>
        </AppDialog>
  </div>
</template>
<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, OfficeBuilding, Edit, DataAnalysis, Delete } from '@element-plus/icons-vue';
import { financeApi } from '@/api';
import { formatCurrency } from '@/utils/helpers/formatters';
import { parseListData, parseResponseData } from '@/utils/responseParser'
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
  parentId: null,
  manager: '',
  description: '',
  isActive: true
});
const centerRules = {
  code: [
    { required: true, message: '请输入编码', trigger: 'blur' },
    { max: 20, message: '编码长度不能超过20个字符', trigger: 'blur' }
  ],
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { max: 100, message: '名称长度不能超过100个字符', trigger: 'blur' }
  ],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }]
};
// 成本报表数据
const costReport = ref([]);
const reportDateRange = ref([]);
// 加载成本中心列表
const loadCostCenters = async () => {
  loading.value = true;
  try {
    const res = await financeApi.cost.getCostCenters();
    costCenters.value = parseListData(res, { enableLog: false });
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
    const res = await financeApi.cost.getCostCenterOptions();
    centerOptions.value = parseResponseData(res, []);
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
    const res = await financeApi.cost.getCostCenterReport(params);
    costReport.value = parseResponseData(res, []);
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
  Object.assign(centerForm, { ...row, is_active: !!row.isActive });
  centerDialogVisible.value = true;
};
// 保存成本中心
const saveCenter = async () => {
  try {
    await centerFormRef.value.validate();
    saving.value = true;
    if (isEdit.value) {
      await financeApi.cost.updateCostCenter(centerForm.id, centerForm);
      ElMessage.success('更新成功');
    } else {
      await financeApi.cost.createCostCenter(centerForm);
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
    await financeApi.cost.deleteCostCenter(row.id);
    ElMessage.success('删除成功');
    loadCostCenters();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || '删除失败');
    }
  }
};
// 查看成本报表
const viewReport = (_row) => {
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
.title-section h2 { margin: 0; font-size: 24px; color: var(--color-text-primary); }
.subtitle { margin: 5px 0 0 0; color: var(--color-text-secondary); font-size: 14px; }
.report-toolbar { margin-bottom: 15px; }
</style>
