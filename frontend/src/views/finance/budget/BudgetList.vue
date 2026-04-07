<template>
  <div class="budget-list-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>预算管理</span>
          <el-button v-permission="'finance:budgetlist:create'" type="primary" @click="handleCreate">新增预算</el-button>
        </div>
      </template>

      <!-- 搜索表单 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="预算年度">
          <el-date-picker
            v-model="searchForm.budget_year"
            type="year"
            placeholder="选择年度"
            value-format="YYYY"

          />
        </el-form-item>
        <el-form-item label="预算类型">
          <el-select v-model="searchForm.budget_type" placeholder="请选择" clearable>
            <el-option v-for="item in $dict.getOptions('budget_type')" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择" clearable>
            <el-option label="草稿" value="草稿" />
            <el-option label="待审批" value="待审批" />
            <el-option label="已审批" value="已审批" />
            <el-option label="执行中" value="执行中" />
            <el-option label="已完成" value="已完成" />
            <el-option label="已关闭" value="已关闭" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键字">
          <el-input v-model="searchForm.keyword" placeholder="预算编号/名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="loading">查询</el-button>
          <el-button @click="handleReset" :loading="loading">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 数据表格 -->
      <el-table :data="tableData" v-loading="loading" border stripe>
        <template #empty>
          <el-empty description="暂无预算数据" />
        </template>
        <el-table-column prop="budget_no" label="预算编号" width="140" />
        <el-table-column prop="budget_name" label="预算名称" min-width="180" />
        <el-table-column prop="budget_year" label="预算年度" width="100" align="center" />
        <el-table-column prop="budget_type" label="预算类型" width="100" align="center" />
        <el-table-column prop="department_name" label="部门" width="120" />
        <el-table-column prop="total_amount" label="预算总额" width="120" align="right">
          <template #default="{ row }">
            {{ formatAmount(row.total_amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="used_amount" label="已使用" width="120" align="right">
          <template #default="{ row }">
            {{ formatAmount(row.used_amount) }}
          </template>
        </el-table-column>
        <el-table-column label="执行率" width="100" align="center">
          <template #default="{ row }">
            <el-progress
              :percentage="Math.min(Math.max(calculateExecutionRate(row), 0), 100)"
              :color="getProgressColor(calculateExecutionRate(row))"
              :stroke-width="12"
              :format="() => `${calculateExecutionRate(row)}%`"
            />
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="creator_name" label="创建人" width="100" />
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="handleView(row)">查看</el-button>
            <el-button link type="primary" size="small" @click="handleEdit(row)" v-if="row.status === '草稿'">编辑</el-button>
            <el-popconfirm
              title="确定要提交审批吗？"
              @confirm="handleSubmit(row)"
              v-if="row.status === '草稿'"
            >
              <template #reference>
                <el-button v-permission="'finance:budgetlist:approve'" link type="primary" size="small">提交审批</el-button>
              </template>
            </el-popconfirm>
            <el-button v-permission="'finance:budgetlist:approve'" link type="success" size="small" @click="handleApprove(row)" v-if="row.status === '待审批'">审批</el-button>
            <el-popconfirm
              title="确定要启动预算执行吗？"
              @confirm="handleStart(row)"
              v-if="row.status === '已审批'"
            >
              <template #reference>
                <el-button link type="warning" size="small">启动执行</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              title="确定要关闭预算吗？"
              @confirm="handleClose(row)"
              v-if="row.status === '执行中'"
            >
              <template #reference>
                <el-button link type="info" size="small">关闭</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              title="确定要删除该预算吗？"
              @confirm="handleDelete(row)"
              confirm-button-type="danger"
              v-if="row.status === '草稿'"
            >
              <template #reference>
                <el-button v-permission="'finance:budgetlist:delete'" link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchData"
        @current-change="fetchData"
        style="margin-top: 20px; justify-content: flex-end"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRouter } from 'vue-router';
import { api } from '@/services/axiosInstance';

const router = useRouter();

// 搜索表单
const searchForm = reactive({
  budget_year: '',
  budget_type: '',
  status: '',
  keyword: ''
});

// 表格数据
const tableData = ref([]);
const loading = ref(false);

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
});

// 获取数据
const fetchData = async () => {
  loading.value = true;
  try {
    const response = await api.get('/finance/budgets', {
      params: {
        ...searchForm,
        page: pagination.page,
        pageSize: pagination.pageSize
      }
    });

    // unwrapResponse拦截器已解包，response.data 直接是 { list, total, ... }
    const result = response.data;
    tableData.value = result.list || result || [];
    pagination.total = result.total || 0;
  } catch (error) {
    console.error('获取预算列表失败:', error);
    ElMessage.error('获取预算列表失败');
  } finally {
    loading.value = false;
  }
};

// 搜索
const handleSearch = () => {
  pagination.page = 1;
  fetchData();
};

// 重置
const handleReset = () => {
  searchForm.budget_year = '';
  searchForm.budget_type = '';
  searchForm.status = '';
  searchForm.keyword = '';
  handleSearch();
};

// 新增
const handleCreate = () => {
  router.push('/finance/budget/edit');
};

// 查看
const handleView = (row) => {
  router.push(`/finance/budget/detail/${row.id}`);
};

// 编辑
const handleEdit = (row) => {
  router.push(`/finance/budget/edit/${row.id}`);
};

// 提交审批
const handleSubmit = async (row) => {
  try {
    await ElMessageBox.confirm('确定要提交审批吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });

    const response = await api.post(`/finance/budgets/${row.id}/submit`);
    ElMessage.success('提交成功');
    fetchData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('提交审批失败:', error);
      ElMessage.error(error.response?.data?.error || '提交审批失败');
    }
  }
};

// 审批
const handleApprove = async (row) => {
  try {
    const { value } = await ElMessageBox.confirm('请选择审批结果', '审批', {
      confirmButtonText: '通过',
      cancelButtonText: '驳回',
      distinguishCancelAndClose: true,
      type: 'warning'
    });

    const response = await api.post(`/finance/budgets/${row.id}/approve`, {
      approved: true
    });
    ElMessage.success('审批通过');
    fetchData();
  } catch (error) {
    if (error === 'cancel') {
      // 驳回
      try {
        const response = await api.post(`/finance/budgets/${row.id}/approve`, {
          approved: false
        });
        ElMessage.success('已驳回');
        fetchData();
      } catch (err) {
        console.error('审批失败:', err);
        ElMessage.error(err.response?.data?.error || '审批失败');
      }
    } else if (error !== 'close') {
      console.error('审批失败:', error);
      ElMessage.error(error.response?.data?.error || '审批失败');
    }
  }
};

// 启动执行
const handleStart = async (row) => {
  try {
    await ElMessageBox.confirm('确定要启动预算执行吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });

    const response = await api.post(`/finance/budgets/${row.id}/start`);
    ElMessage.success('启动成功');
    fetchData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('启动失败:', error);
      ElMessage.error(error.response?.data?.error || '启动失败');
    }
  }
};

// 关闭
const handleClose = async (row) => {
  try {
    await ElMessageBox.confirm('确定要关闭预算吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });

    const response = await api.post(`/finance/budgets/${row.id}/close`);
    ElMessage.success('关闭成功');
    fetchData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('关闭失败:', error);
      ElMessage.error(error.response?.data?.error || '关闭失败');
    }
  }
};

// 删除
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除该预算吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });

    const response = await api.delete(`/finance/budgets/${row.id}`);
    ElMessage.success('删除成功');
    fetchData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error);
      ElMessage.error(error.response?.data?.error || '删除失败');
    }
  }
};

// 格式化金额
const formatAmount = (amount) => {
  return parseFloat(amount || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// 计算执行率
const calculateExecutionRate = (row) => {
  if (!row.total_amount || Number(row.total_amount) === 0) return 0;
  const used = Number(row.used_amount) || 0;
  const total = Number(row.total_amount);
  const rate = Math.round((used / total) * 100);
  return isNaN(rate) ? 0 : rate;
};

// 获取进度条颜色
const getProgressColor = (percentage) => {
  if (percentage >= 100) return '#f56c6c';
  if (percentage >= 80) return '#e6a23c';
  return '#67c23a';
};

// 获取状态类型
const getStatusType = (status) => {
  const typeMap = {
    '草稿': 'info',
    '待审批': 'warning',
    '已审批': 'success',
    '执行中': 'primary',
    '已完成': 'success',
    '已关闭': 'info'
  };
  return typeMap[status] || 'info';
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.budget-list-container {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-form {
  margin-bottom: 20px;
}
</style>
