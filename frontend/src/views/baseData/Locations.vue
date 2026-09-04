<!--
/**
 * Locations.vue
 * @description 前端界面组件文件
 * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page base-data-list-page">
    <PageHeader title="库位管理" subtitle="管理仓库库位配置">
      <template #actions>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleAdd">新增库位</el-button>
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
        <el-form-item label="库位名称">
          <el-input v-model="searchForm.name" placeholder="请输入库位名称" clearable></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="库位编码">
          <el-input v-model="searchForm.code" placeholder="请输入库位编码" clearable></el-input>
        </el-form-item>
        <el-form-item label="库位类型">
          <el-select v-model="searchForm.type" placeholder="请选择库位类型" clearable>
            <el-option
              v-for="item in locationTypes"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            ></el-option>
          </el-select>
        </el-form-item>
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
          <EmptyState description="暂无库位数据" />
        </template>
        <el-table-column prop="name" label="库位名称" width="180"></el-table-column>
        <el-table-column prop="code" label="库位编码" width="150"></el-table-column>
        <el-table-column prop="type" label="库位类型" width="120">
          <template #default="scope">
            <el-tag>{{ getLocationTypeLabel(scope.row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="area" label="区域" width="120"></el-table-column>
        <el-table-column prop="address" label="地址"></el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="Number(scope.row.status) === 1 ? 'success' : 'danger'">
              {{ Number(scope.row.status) === 1 ? '启用' : '禁用' }}
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
              <el-button
                v-if="canUpdate && Number(scope.row.status) !== 1"
                size="small"
                type="success"
                @click="handleToggleStatus(scope.row)">
                <el-icon><Check /></el-icon> 启用
              </el-button>
              <el-button
                v-if="canUpdate && Number(scope.row.status) === 1"
                size="small"
                type="warning"
                @click="handleToggleStatus(scope.row)">
                <el-icon><Close /></el-icon> 禁用
              </el-button>

              <template v-if="Number(scope.row.status) === 0">
                <el-button
                  v-if="canUpdate"
                  size="small"
                  @click="handleEdit(scope.row)">
                  <el-icon><Edit /></el-icon> 编辑
                </el-button>
                <el-popconfirm
                  v-if="canDelete"
                  title="确定要删除该库位吗？此操作无法恢复。"
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
          v-model:current-page="pagination.current"
          v-model:page-size="pagination.size"
          :total="Math.max(parseInt(pagination.total) || 0, 1)"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <AppDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :mode="dialogReadonly ? 'view' : 'form'"
      width="500px"
      :detail-navigation="dialogReadonly ? locationViewNavigation : null"
    >
      <el-descriptions v-if="dialogReadonly" :column="2" border>
        <el-descriptions-item label="库位名称">{{ form.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="库位编码">{{ form.code || '-' }}</el-descriptions-item>
        <el-descriptions-item label="库位类型">{{ getWarehouseTypeText(form.type) || form.type || '-' }}</el-descriptions-item>
        <el-descriptions-item label="区域">{{ form.area || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="Number(form.status) === 1 ? 'success' : 'danger'">
            {{ Number(form.status) === 1 ? '启用' : '禁用' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="地址" :span="2">{{ form.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ form.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-form v-else :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="库位名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入库位名称"></el-input>
        </el-form-item>
        <el-form-item label="库位编码" prop="code">
          <el-input v-model="form.code" placeholder="请输入库位编码"></el-input>
        </el-form-item>
        <el-form-item label="库位类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择库位类型" class="w-full">
            <el-option
              v-for="item in locationTypes"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="form.area" placeholder="请输入区域"></el-input>
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="form.address" placeholder="请输入地址"></el-input>
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
import { parsePaginatedData } from '@/utils/responseParser';
import { useListDetailNavigation } from '@/composables/useListDetailNavigation';
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { baseDataApi } from '@/api/baseData';
import { Plus, Edit, Delete, Download, Check, Close } from '@element-plus/icons-vue';
import { WAREHOUSE_TYPES, getWarehouseTypeText } from '@/constants/systemConstants'
import { useAuthStore } from '@/stores/auth';

// 权限store
const authStore = useAuthStore();
const canCreate = computed(() => authStore.hasPermission('basedata:locations:create'));
const canUpdate = computed(() => authStore.hasPermission('basedata:locations:update'));
const canDelete = computed(() => authStore.hasPermission('basedata:locations:delete'));

// 数据加载状态
const loading = ref(false);

// 表格数据
const tableData = ref([]);
const pagination = reactive({
  current: 1,
  size: 10,
  total: 0
});
const {
  previousItem: previousViewLocation,
  nextItem: nextViewLocation,
  hasPrevious: hasPreviousViewLocation,
  hasNext: hasNextViewLocation,
  setCurrentItem: setCurrentViewLocation
} = useListDetailNavigation(tableData);

// 新增/编辑表单
const formRef = ref(null);
const form = reactive({
  id: '',
  name: '',
  code: '',
  type: '',
  area: '',
  address: '',
  status: 1,
  remark: ''
});

// 搜索表单
const searchForm = reactive({
  name: '',
  code: '',
  type: '',
  status: ''
});

// 表单校验规则
const rules = {
  name: [{ required: true, message: '请输入库位名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入库位编码', trigger: 'blur' }],
  type: [{ required: true, message: '请选择库位类型', trigger: 'change' }]
};

// 对话框控制
const dialogVisible = ref(false);
const dialogTitle = ref('新增库位');
const dialogReadonly = ref(false);
const isEdit = ref(false);

// 库位类型选项 - 从常量生成
const locationTypes = Object.keys(WAREHOUSE_TYPES).map(key => ({
  value: key,
  label: WAREHOUSE_TYPES[key]
}));

// 初始化
onMounted(() => {
  fetchData();
});

// 导出数据
const handleExport = async () => {
  try {
    const response = await baseDataApi.exportLocations({
      name: searchForm.name,
      code: searchForm.code,
      type: searchForm.type,
      status: searchForm.status
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '库位列表.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    ElMessage.success('导出成功');
  } catch {
    ElMessage.error('导出失败');
  }
};

// 搜索
const handleSearch = () => {
  pagination.current = 1;
  fetchData();
};

// 重置搜索
const resetSearch = () => {
  searchForm.name = '';
  searchForm.code = '';
  searchForm.type = '';
  searchForm.status = '';
  pagination.current = 1;
  fetchData();
};

// 获取库位列表
const fetchData = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.current,
      pageSize: pagination.size,
      name: searchForm.name,
      code: searchForm.code,
      type: searchForm.type,
      status: searchForm.status
    };

    const response = await baseDataApi.getLocations(params);
    const { list, total } = parsePaginatedData(response, { enableLog: false });

    tableData.value = list;
    pagination.total = total;
  } catch (error) {
    console.error('获取库位列表失败:', error);
    ElMessage.error(`获取库位列表失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
};

// 新增库位
const handleAdd = () => {
  dialogTitle.value = '新增库位';
  isEdit.value = false;
  dialogReadonly.value = false;
  resetForm();
  dialogVisible.value = true;
};

const handleView = (row) => {
  dialogTitle.value = '查看库位';
  isEdit.value = false;
  dialogReadonly.value = true;
  resetForm();
  const rowData = { ...row };
  rowData.status = Number(rowData.status);
  Object.assign(form, rowData);
  setCurrentViewLocation(row);
  dialogVisible.value = true;
};

const handleViewPrevious = () => {
  if (previousViewLocation.value) handleView(previousViewLocation.value);
};

const handleViewNext = () => {
  if (nextViewLocation.value) handleView(nextViewLocation.value);
};

const locationViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewLocation.value,
  hasNext: hasNextViewLocation.value,
  loading: false,
  previous: handleViewPrevious,
  next: handleViewNext
}));

// 编辑库位
const handleEdit = (row) => {
  dialogTitle.value = '编辑库位';
  isEdit.value = true;
  dialogReadonly.value = false;
  resetForm();

  const rowData = { ...row };
  rowData.status = Number(rowData.status);

  Object.assign(form, rowData);
  dialogVisible.value = true;
};

// 删除库位
const handleDelete = async (row) => {
  try {
    await baseDataApi.deleteLocation(row.id);
    ElMessage.success('删除成功');
    fetchData();
  } catch (error) {
    console.error('删除库位失败:', error);
    ElMessage.error(error.response?.data?.message || `删除库位失败: ${error.message}`);
  }
};

// 切换启用/禁用状态
const handleToggleStatus = (row) => {
  const currentStatus = Number(row.status);
  const newStatus = currentStatus === 1 ? 0 : 1;
  const action = newStatus === 1 ? '启用' : '禁用';

  ElMessageBox.confirm(`确定要${action}该库位吗？`, '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await baseDataApi.updateLocation(row.id, { status: newStatus });
      ElMessage.success(`${action}成功`);
      fetchData();
    } catch (error) {
      console.error(`${action}库位失败:`, error);
      ElMessage.error(error.response?.data?.message || `${action}库位失败`);
    }
  }).catch(() => {});
};

// 分页变化
const handlePageChange = (page) => {
  pagination.current = page;
  fetchData();
};

// 每页条数变化
const handleSizeChange = (size) => {
  pagination.size = size;
  pagination.current = 1;
  fetchData();
};

// 重置表单
const resetForm = () => {
  if (formRef.value) {
    formRef.value.resetFields();
  }

  form.id = '';
  form.name = '';
  form.code = '';
  form.type = '';
  form.area = '';
  form.address = '';
  form.status = 1;
  form.remark = '';
};

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return;

  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true;
      try {
        const submitData = { ...form };
        delete submitData.createdAt;
        delete submitData.updatedAt;
        submitData.status = Number(submitData.status);

        if (isEdit.value) {
          await baseDataApi.updateLocation(form.id, submitData);
          ElMessage.success('库位更新成功');
        } else {
          await baseDataApi.createLocation(submitData);
          ElMessage.success('库位创建成功');
        }
        dialogVisible.value = false;
        await fetchData();
      } catch (error) {
        console.error('保存库位失败:', error);
        const errorMsg = error.response?.data?.message ||
                         error.message ||
                         '操作失败，请重试';
        ElMessage.error(`保存库位失败: ${errorMsg}`);
      } finally {
        loading.value = false;
      }
    }
  });
};

const getLocationTypeLabel = (type) => {
  return getWarehouseTypeText(type);
};
</script>
