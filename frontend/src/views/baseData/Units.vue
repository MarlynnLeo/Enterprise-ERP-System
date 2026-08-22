<!--
/**
 * Units.vue
 * @description 前端界面组件文件
 * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page base-data-list-page">
    <PageHeader title="产品单位管理" subtitle="管理计量单位配置">
      <template #actions>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleAdd">新增单位</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="handleSearch"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="单位名称">
          <el-input v-model="searchForm.name" placeholder="请输入单位名称" clearable></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option :value="1" label="启用"></el-option>
            <el-option :value="0" label="禁用"></el-option>
          </el-select>
        </el-form-item>
      </template>
      <template #actions>
        <el-button type="success" @click="handleExport">
          <el-icon><Download /></el-icon> 导出
        </el-button>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.total || 0 }}</div>
        <div class="stat-label">单位总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.active || 0 }}</div>
        <div class="stat-label">启用状态</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.inactive || 0 }}</div>
        <div class="stat-label">禁用状态</div>
      </el-card>
    </div>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        v-loading="loading"
        :data="tableData"
        border
        class="table-row-click w-full"
        @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))"
      >
        <template #empty>
          <EmptyState description="暂无单位数据" />
        </template>
        <el-table-column prop="name" label="单位名称" width="150"></el-table-column>
        <el-table-column prop="code" label="单位编码" width="150"></el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="String(scope.row.status) === '1' ? 'success' : 'danger'">
              {{ String(scope.row.status) === '1' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注"></el-table-column>
        <el-table-column
          label="操作"
          min-width="72"
          fixed="right"
          align="left"
          header-align="left"
          class-name="operation-column"
          header-class-name="operation-column-header"
        >
          <template #default="scope">
            <div class="table-actions" @click.stop>
              <el-popconfirm
                v-if="canUpdate && String(scope.row.status) !== '1'"
                title="确定要启用该单位吗？"
                @confirm="handleToggleStatus(scope.row)"
              >
                <template #reference>
                  <el-button size="small" type="success">
                    <el-icon><Check /></el-icon> 启用
                  </el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                v-if="canUpdate && String(scope.row.status) === '1'"
                title="确定要禁用该单位吗？"
                @confirm="handleToggleStatus(scope.row)"
                confirm-button-type="warning"
              >
                <template #reference>
                  <el-button size="small" type="warning">
                    <el-icon><Close /></el-icon> 禁用
                  </el-button>
                </template>
              </el-popconfirm>

              <template v-if="String(scope.row.status) === '0'">
                <el-button
                  v-if="canUpdate"
                  size="small"
                  @click="handleEdit(scope.row)">
                  <el-icon><Edit /></el-icon> 编辑
                </el-button>
                <el-popconfirm
                  v-if="canDelete"
                  title="确定要删除该单位吗？此操作无法恢复。"
                  @confirm="handleDelete(scope.row)"
                  confirm-button-type="danger"
                >
                  <template #reference>
                    <el-button size="small" type="danger">
                      <el-icon><Delete /></el-icon> 删除
                    </el-button>
                  </template>
                </el-popconfirm>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <AppDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :mode="dialogReadonly ? 'view' : 'form'"
      width="500px"
      :detail-navigation="dialogReadonly ? unitViewNavigation : null"
    >
      <el-descriptions v-if="dialogReadonly" :column="2" border>
        <el-descriptions-item label="单位名称">{{ form.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="单位编码">{{ form.code || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="Number(form.status) === 1 ? 'success' : 'danger'">
            {{ Number(form.status) === 1 ? '启用' : '禁用' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ form.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-form v-else :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="单位名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入单位名称"></el-input>
        </el-form-item>
        <el-form-item label="单位编码" prop="code">
          <el-input v-model="form.code" placeholder="请输入单位编码"></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="请输入备注"></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">{{ dialogReadonly ? '关闭' : '取消' }}</el-button>
          <el-button v-if="!dialogReadonly" type="primary" @click="submitForm">确定</el-button>
        </span>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { parsePaginatedData, parseResponseData } from '@/utils/responseParser';
import { useListDetailNavigation } from '@/composables/useListDetailNavigation';
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus'
import { baseDataApi } from '@/api/baseData';
import { Plus, Edit, Delete, Download, Check, Close } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

// 权限store
const authStore = useAuthStore();
const canCreate = computed(() => authStore.hasPermission('basedata:units:create'));
const canUpdate = computed(() => authStore.hasPermission('basedata:units:update'));
const canDelete = computed(() => authStore.hasPermission('basedata:units:delete'));

// ==================== 通用工具函数 ====================
const parsePagedResponse = (response) => {
  const { list, total } = parsePaginatedData(response);
  return { data: list, total };
};

// ==================== 响应式数据 ====================
const loading = ref(false);
const tableData = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const {
  previousItem: previousViewUnit,
  nextItem: nextViewUnit,
  hasPrevious: hasPreviousViewUnit,
  hasNext: hasNextViewUnit,
  setCurrentItem: setCurrentViewUnit
} = useListDetailNavigation(tableData);

// 统计数据
const stats = reactive({
  total: 0,
  active: 0,
  inactive: 0
});

// 搜索表单
const searchForm = reactive({
  name: '',
  status: ''
});

// 新增/编辑表单
const formRef = ref(null);
const form = reactive({
  id: '',
  name: '',
  code: '',
  status: 1,
  remark: ''
});

// 表单校验规则
const rules = {
  name: [{ required: true, message: '请输入单位名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入单位编码', trigger: 'blur' }]
};

// 对话框控制
const dialogVisible = ref(false);
const dialogTitle = ref('新增单位');
const dialogReadonly = ref(false);
const isEdit = ref(false);

// 初始化
onMounted(() => {
  fetchStats();
  fetchData();
});

// 导出数据
const handleExport = async () => {
  try {
    const response = await baseDataApi.exportUnits({
      name: searchForm.name,
      status: searchForm.status
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '单位列表.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    ElMessage.success('导出成功');
  } catch {
    ElMessage.error('导出失败');
  }
};

// 获取全量统计数据
const fetchStats = async () => {
  try {
    const response = await baseDataApi.getUnitStats();
    const statsData = parseResponseData(response, {});
    stats.total = Number(statsData.total) || 0;
    stats.active = Number(statsData.active) || 0;
    stats.inactive = Number(statsData.inactive) || 0;
  } catch (error) {
    console.error('获取单位统计数据失败:', error);
  }
};

// 获取单位列表
const fetchData = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      unitName: searchForm.name,
      status: searchForm.status
    };

    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });

    const response = await baseDataApi.getUnits(params);
    const { data, total: totalCount } = parsePagedResponse(response);

    tableData.value = data;
    total.value = totalCount || data.length;
  } catch (error) {
    console.error('获取单位列表失败:', error);
    ElMessage.error('获取单位列表失败');
    tableData.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

// 搜索
const handleSearch = () => {
  currentPage.value = 1;
  fetchData();
};

// 重置搜索
const resetSearch = () => {
  Object.keys(searchForm).forEach(key => {
    searchForm[key] = '';
  });
  currentPage.value = 1;
  fetchData();
};

// 分页相关
const handleSizeChange = (val) => {
  pageSize.value = val;
  fetchData();
};

const handleCurrentChange = (val) => {
  currentPage.value = val;
  fetchData();
};

// 新增单位
const handleAdd = () => {
  dialogTitle.value = '新增单位';
  isEdit.value = false;
  dialogReadonly.value = false;
  resetForm();
  dialogVisible.value = true;
};

const handleView = (row) => {
  dialogTitle.value = '查看单位';
  isEdit.value = false;
  dialogReadonly.value = true;
  resetForm();
  Object.assign(form, row);
  setCurrentViewUnit(row);
  dialogVisible.value = true;
};

const handleViewPrevious = () => {
  if (previousViewUnit.value) handleView(previousViewUnit.value);
};

const handleViewNext = () => {
  if (nextViewUnit.value) handleView(nextViewUnit.value);
};

const unitViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewUnit.value,
  hasNext: hasNextViewUnit.value,
  loading: false,
  previous: handleViewPrevious,
  next: handleViewNext
}));

// 编辑单位
const handleEdit = (row) => {
  dialogTitle.value = '编辑单位';
  isEdit.value = true;
  dialogReadonly.value = false;
  resetForm();
  Object.assign(form, row);
  dialogVisible.value = true;
};

// 删除单位
const handleDelete = async (row) => {
  try {
    await baseDataApi.deleteUnit(row.id);
    ElMessage.success('删除成功');
    fetchData();
    fetchStats();
  } catch (error) {
    console.error('删除单位失败:', error);
    ElMessage.error(error.response?.data?.message || '删除单位失败');
  }
};

// 切换启用/禁用状态
const handleToggleStatus = async (row) => {
  const newStatus = String(row.status) === '1' ? 0 : 1;
  const action = newStatus === 1 ? '启用' : '禁用';

  try {
    await baseDataApi.updateUnit(row.id, { status: newStatus });
    ElMessage.success(`${action}成功`);
    fetchData();
    fetchStats();
  } catch (error) {
    console.error(`${action}单位失败:`, error);
    ElMessage.error(error.response?.data?.message || `${action}单位失败`);
  }
};

// 重置表单
const resetForm = () => {
  if (formRef.value) {
    formRef.value.resetFields();
  }

  form.id = '';
  form.name = '';
  form.code = '';
  form.status = 1;
  form.remark = '';
};

// 提交表单
const submitForm = () => {
  formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        const submitData = { ...form };
        delete submitData.createdAt;
        delete submitData.updatedAt;

        if (isEdit.value) {
          await baseDataApi.updateUnit(form.id, submitData);
          ElMessage.success('编辑成功');
        } else {
          await baseDataApi.createUnit(submitData);
          ElMessage.success('新增成功');
        }
        dialogVisible.value = false;
        fetchData();
        fetchStats();
      } catch (error) {
        console.error('保存单位失败:', error);
        ElMessage.error(error.response?.data?.message || '保存单位失败');
      }
    }
  });
};
</script>
