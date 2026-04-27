<!--
/**
 * Units.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="purchase-requisitions-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>产品单位管理</h2>
          <p class="subtitle">管理计量单位配置</p>
        </div>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleAdd">新增单位</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="单位名称">
          <el-input  v-model="searchForm.name" placeholder="请输入单位名称" clearable ></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-select  v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option :value="1" label="启用"></el-option>
            <el-option :value="0" label="禁用"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> 重置
          </el-button>
          <el-button type="success" @click="handleExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

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
        style="width: 100%"
      >
        <template #empty>
          <el-empty description="暂无单位数据" />
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
        <el-table-column label="操作" min-width="280" fixed="right">
          <template #default="scope">
            <el-popconfirm
              v-if="canUpdate && String(scope.row.status) !== '1'"
              title="确定要启用该单位吗？"
              @confirm="handleToggleStatus(scope.row)"
            >
              <template #reference>
                <el-button size="small" type="success">
                  <el-icon><Switch /></el-icon> 启用
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
                  <el-icon><Switch /></el-icon> 禁用
                </el-button>
              </template>
            </el-popconfirm>
            <template v-if="String(scope.row.status) === '0'">
              <el-button
                v-if="canUpdate"
                size="small"
                type="primary"
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
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="500px"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
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
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { parsePaginatedData } from '@/utils/responseParser';

import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus'
import { baseDataApi } from '@/api/baseData';
import { Plus, Edit, Delete, Search, Refresh, Download, Switch } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

// 权限store
const authStore = useAuthStore();
const canCreate = computed(() => authStore.hasPermission('basedata:units:create'));
const canUpdate = computed(() => authStore.hasPermission('basedata:units:update'));
const canDelete = computed(() => authStore.hasPermission('basedata:units:delete'));

// 权限计算属性

// ==================== 通用工具函数 ====================

// 使用统一响应解析器，保持向后兼容的返回格式
const parseResponseData = (response) => {
  const { list, total } = parsePaginatedData(response);
  return { data: list, total };
};

// ==================== 响应式数据 ====================

// 数据加载状态
const loading = ref(false);

// 表格数据
const tableData = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);

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
const isEdit = ref(false);

// 初始化
onMounted(() => {
  fetchStats(); // 获取全量统计数据
  fetchData();
});

// 导出数据
const handleExport = async () => {
  try {
    const response = await baseDataApi.exportUnits({
      name: searchForm.name,
      status: searchForm.status
    });
    // 处理文件下载
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '单位列表.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    ElMessage.success('导出成功');
  } catch (error) {
    ElMessage.error('导出失败');
  }
};

// 计算统计数据
const calculateStats = (data) => {
  const items = Array.isArray(data) ? data : [];
  stats.total = items.length;
  stats.active = items.filter(item => String(item.status) === '1').length;
  stats.inactive = items.filter(item => String(item.status) === '0').length;
};

// 获取全量统计数据
const fetchStats = async () => {
  try {
    const response = await baseDataApi.getUnits({ page: 1, pageSize: 100000 });
    const { data } = parseResponseData(response);
    calculateStats(data);
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
    
    // 移除空值参数
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });
    
    const response = await baseDataApi.getUnits(params);
    const { data, total: totalCount } = parseResponseData(response);
    
    tableData.value = data;
    total.value = totalCount || data.length;
    
    // 注意：统计数据由 fetchStats() 独立获取全量数据计算，不再使用当前页数据
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
  resetForm();
  dialogVisible.value = true;
};

// 编辑单位
const handleEdit = (row) => {
  dialogTitle.value = '编辑单位';
  isEdit.value = true;
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
        // 创建提交数据对象，移除不需要的字段
        const submitData = { ...form };
        delete submitData.created_at;
        delete submitData.updated_at;
        
        if (isEdit.value) {
          // 编辑
          await baseDataApi.updateUnit(form.id, submitData);
          ElMessage.success('编辑成功');
        } else {
          // 新增
          await baseDataApi.createUnit(submitData);
          ElMessage.success('新增成功');
        }
        dialogVisible.value = false;
        fetchData();
      } catch (error) {
        console.error('保存单位失败:', error);
        ElMessage.error(error.response?.data?.message || '保存单位失败');
      }
    }
  });
};
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

.search-form {
  display: flex;
  flex-wrap: wrap;
}

/* 操作列样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}
</style>