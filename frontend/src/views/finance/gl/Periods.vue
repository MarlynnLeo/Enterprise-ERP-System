<!--
/**
 * Periods.vue
 * @description 会计期间 - 支持批量生成年度月度期间和单个创建
 * @date 2025-08-27
 * @version 2.0.0
 */
-->
<template>
  <div class="module-page periods-container">
    <PageHeader title="会计期间" subtitle="管理会计期间与结转">
      <template #actions>
<el-button v-permission="'finance:periods:create'" type="primary" :icon="Plus" @click="showBatchDialog">批量生成年度期间</el-button>
          <el-button v-permission="'finance:periods:create'" @click="showAddDialog">新增单个期间</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :expanded="showAdvancedSearch"
      :loading="loading"
      @update:expanded="showAdvancedSearch = $event"
      @search="searchPeriods"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="财政年度">
          <el-select v-model="searchForm.fiscalYear" placeholder="选择财政年度" clearable>
            <el-option
              v-for="year in fiscalYears"
              :key="year"
              :label="year"
              :value="year"
            ></el-option>
          </el-select>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="状态">
          <el-select v-model="searchForm.isClosed" placeholder="选择状态" clearable>
            <el-option label="已关闭" :value="true"></el-option>
            <el-option label="未关闭" :value="false"></el-option>
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="periodList"
        class="w-full"
        row-key="id"
        border
        v-loading="loading"
      >
        <el-table-column prop="periodName" label="期间名称" width="300"></el-table-column>
        <el-table-column prop="fiscalYear" label="财政年度" width="180"></el-table-column>
        <el-table-column label="开始日期" width="200">
          <template #default="scope">
            {{ formatDate(scope.row.startDate) }}
          </template>
        </el-table-column>
        <el-table-column label="结束日期" width="200">
          <template #default="scope">
            {{ formatDate(scope.row.endDate) }}
          </template>
        </el-table-column>
        <el-table-column label="期间类型" width="200">
          <template #default="scope">
            <el-tag type="info" v-if="scope.row.isAdjusting">调整期</el-tag>
            <span v-else>普通期间</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="180">
          <template #default="scope">
            <el-tag :type="scope.row.isClosed ? 'danger' : 'success'">
              {{ scope.row.isClosed ? '已关闭' : '未关闭' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button
              v-if="!scope.row.isClosed"
              type="primary"
              size="small"
              @click="handleEdit(scope.row)"

              v-permission="'finance:periods:update'">编辑</el-button>
            <el-button
              v-if="!scope.row.isClosed"
              type="warning"
              size="small"
              @click="handleClose(scope.row)"
              v-permission="'finance:closing:execute'"
            >关闭期间</el-button>
            <el-button
              v-if="scope.row.isClosed"
              type="success"
              size="small"
              @click="handleReopen(scope.row)"
              v-permission="'finance:closing:execute'"
            >重新开启</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          :current-page="currentPage"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 批量生成年度期间对话框 -->
    <el-dialog
      title="批量生成年度期间"
      v-model="batchDialogVisible"
      width="420px"
    >
      <el-form :model="batchForm" ref="batchFormRef" label-width="100px" class="period-form">
        <el-form-item label="财政年度" prop="fiscalYear" :rules="[{ required: true, message: '请选择财政年度', trigger: 'change' }]">
          <el-input-number v-model="batchForm.fiscalYear" :min="2000" :max="2100" class="w-full"></el-input-number>
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="mb-md"
        >
          <template #default>
            将自动生成 <strong>{{ batchForm.fiscalYear }}年1月 ~ {{ batchForm.fiscalYear }}年12月</strong> 共 12 个月度会计期间。已存在的月份将自动跳过。
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="batchDialogVisible = false">取消</el-button>
          <el-button v-permission="'finance:periods:create'" type="primary" @click="batchCreatePeriods" :loading="saveLoading">生成</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 新增/编辑单个期间对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="500px"
    >
      <el-form :model="periodForm" :rules="periodRules" ref="periodFormRef" label-width="100px" class="period-form">
        <el-form-item label="期间名称" prop="periodName">
          <el-input v-model="periodForm.periodName" placeholder="请输入期间名称，如：2026年01月"></el-input>
        </el-form-item>
        <el-form-item label="财政年度" prop="fiscalYear">
          <el-input-number v-model="periodForm.fiscalYear" :min="2000" :max="2100" class="w-full"></el-input-number>
        </el-form-item>
        <el-form-item label="开始日期" prop="startDate">
          <el-date-picker
            v-model="periodForm.startDate"
            type="date"
            placeholder="选择开始日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            class="w-full"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="结束日期" prop="endDate">
          <el-date-picker
            v-model="periodForm.endDate"
            type="date"
            placeholder="选择结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            class="w-full"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="期间类型" prop="isAdjusting">
          <el-radio-group v-model="periodForm.isAdjusting">
            <el-radio :value="false">普通期间</el-radio>
            <el-radio :value="true">调整期</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button v-permission="periodForm.id ? 'finance:periods:update' : 'finance:periods:create'" type="primary" @click="savePeriod" :loading="saveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { formatDate } from '@/utils/helpers/dateUtils'

import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { financeApi } from '@/api';
// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);
const showAdvancedSearch = ref(false);
const router = useRouter();

// 分页相关
const total = ref(0);
const pageSize = ref(20);
const currentPage = ref(1);

// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('新增会计期间');
const periodFormRef = ref(null);
const batchDialogVisible = ref(false);
const batchFormRef = ref(null);

// 会计期间列表
const periodList = ref([]);

// 搜索表单
const searchForm = reactive({
  fiscalYear: '',
  isClosed: ''
});

// 会计期间表单（单个创建/编辑）
const periodForm = reactive({
  id: null,
  periodName: '',
  fiscalYear: new Date().getFullYear(),
  startDate: '',
  endDate: '',
  isAdjusting: false,
  isClosed: false
});

// 批量创建表单
const batchForm = reactive({
  fiscalYear: new Date().getFullYear(),
});

// 可选财政年度
const fiscalYears = computed(() => {
  const years = new Set();
  const currentYear = new Date().getFullYear();

  // 添加当前年度和前后两年
  years.add(currentYear - 2);
  years.add(currentYear - 1);
  years.add(currentYear);
  years.add(currentYear + 1);

  // 添加期间列表中的年度
  if (periodList.value && Array.isArray(periodList.value)) {
    periodList.value.forEach(period => {
      if (period && period.fiscalYear) {
        years.add(period.fiscalYear);
      }
    });
  }

  return Array.from(years).sort((a, b) => b - a); // 降序排列
});

// 表单验证规则
const periodRules = {
  periodName: [
    { required: true, message: '请输入期间名称', trigger: 'blur' },
    { min: 1, max: 50, message: '长度在1到50个字符', trigger: 'blur' }
  ],
  fiscalYear: [
    { required: true, message: '请输入财政年度', trigger: 'blur' }
  ],
  startDate: [
    { required: true, message: '请选择开始日期', trigger: 'change' }
  ],
  endDate: [
    { required: true, message: '请选择结束日期', trigger: 'change' },
    {
      validator: (rule, value, callback) => {
        if (value && periodForm.startDate && new Date(value) < new Date(periodForm.startDate)) {
          callback(new Error('结束日期不能早于开始日期'));
        } else {
          callback();
        }
      },
      trigger: 'change'
    }
  ]
};

const getErrorMessage = (error, fallback) => {
  return error?.response?.data?.message || error?.message || fallback;
};

// 加载会计期间列表
const loadPeriods = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      fiscalYear: searchForm.fiscalYear,
      isClosed: searchForm.isClosed
    };
    const response = await financeApi.periods.getList(params);

    // 拦截器已解包，response.data 就是业务数据
    if (response.data?.periods) {
      // 转换后端字段名为前端使用的驼峰命名法
      periodList.value = response.data.periods.map(period => ({
        id: period.id,
        periodName: period.period_name,
        fiscalYear: period.fiscal_year,
        startDate: period.start_date,
        endDate: period.end_date,
        isClosed: period.is_closed,
        isAdjusting: period.is_adjusting
      }));
      total.value = response.data.total ?? response.data.periods.length;
    } else if (Array.isArray(response.data)) {
      // 如果直接返回数组
      periodList.value = response.data.map(period => ({
        id: period.id,
        periodName: period.period_name,
        fiscalYear: period.fiscal_year,
        startDate: period.start_date,
        endDate: period.end_date,
        isClosed: period.is_closed,
        isAdjusting: period.is_adjusting
      }));
      total.value = response.data.length;
    } else {
      periodList.value = [];
      total.value = 0;
    }
  } catch (error) {
    console.error('加载会计期间失败:', error);
    ElMessage.error(getErrorMessage(error, '加载会计期间失败'));
    periodList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

// 搜索会计期间
const searchPeriods = () => {
  currentPage.value = 1;
  loadPeriods();
};

// 重置搜索条件
const resetSearch = () => {
  searchForm.fiscalYear = '';
  searchForm.isClosed = '';
  searchPeriods();
};

// 打开批量生成对话框
const showBatchDialog = () => {
  batchForm.fiscalYear = new Date().getFullYear();
  batchDialogVisible.value = true;
};

// 批量生成年度期间
const batchCreatePeriods = async () => {
  if (!batchFormRef.value) return;

  await batchFormRef.value.validate(async (valid) => {
    if (!valid) return;

    saveLoading.value = true;
    try {
      const year = batchForm.fiscalYear;
      const response = await financeApi.periods.create({
        start_date: `${year}-01-01`,
        end_date: `${year}-12-31`,
        fiscal_year: year,
      });

      const resData = response?.data || response;
      const msg = resData?.message || `成功生成 ${year} 年度会计期间`;
      ElMessage.success(msg);

      if (resData?.skipped?.length > 0) {
        ElMessage.warning({
          message: `以下期间因已存在而跳过：${resData.skipped.join('、')}`,
          duration: 5000,
          showClose: true
        });
      }

      batchDialogVisible.value = false;
      loadPeriods();
    } catch (error) {
      console.error('批量生成会计期间失败:', error);
      ElMessage.error(getErrorMessage(error, '批量生成会计期间失败'));
    } finally {
      saveLoading.value = false;
    }
  });
};

// 新增单个会计期间
const showAddDialog = () => {
  dialogTitle.value = '新增会计期间';
  resetPeriodForm();
  dialogVisible.value = true;
};

// 编辑会计期间
const handleEdit = (row) => {
  dialogTitle.value = '编辑会计期间';
  Object.keys(periodForm).forEach(key => {
    periodForm[key] = row[key];
  });
  dialogVisible.value = true;
};

const handleClose = (row) => {
  router.push({
    name: 'gl-period-closing',
    query: { periodId: row.id }
  });
};

  // 重新开启会计期间
const handleReopen = (row) => {
  ElMessageBox.confirm(
    '重新开启会计期间会先检查后续期间是否已关闭，然后清理本期损益结转凭证和期末余额快照。确认要重新开启此期间吗？',
    '警告',
    {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      const response = await financeApi.periods.reopen(row.id);
      ElMessage.success(response.data?.message || response._message || '会计期间已重新开启');
      loadPeriods();
    } catch (error) {
      console.error('重新开启会计期间失败:', error);
      ElMessage.error(getErrorMessage(error, '重新开启会计期间失败'));
    }
  }).catch(() => {});
};

// 保存会计期间（单个创建/编辑）
const savePeriod = async () => {
  if (!periodFormRef.value) return;

  await periodFormRef.value.validate(async (valid) => {
    if (valid) {
      saveLoading.value = true;
      try {
        // 转换字段名以匹配后端API期望的格式
        const periodData = {
          period_name: periodForm.periodName,
          start_date: periodForm.startDate,
          end_date: periodForm.endDate,
          is_adjusting: periodForm.isAdjusting,
          fiscal_year: periodForm.fiscalYear
        };

        if (periodForm.id) {
          // 更新
          await financeApi.periods.update(periodForm.id, periodData);
          ElMessage.success('更新成功');
        } else {
          // 新增
          await financeApi.periods.create(periodData);
          ElMessage.success('添加成功');
        }
        dialogVisible.value = false;
        loadPeriods();
      } catch (error) {
        console.error('保存会计期间失败:', error);
        ElMessage.error(getErrorMessage(error, '保存会计期间失败'));
      } finally {
        saveLoading.value = false;
      }
    }
  });
};

// 重置表单
const resetPeriodForm = () => {
  periodForm.id = null;
  periodForm.periodName = '';
  periodForm.fiscalYear = new Date().getFullYear();
  periodForm.startDate = '';
  periodForm.endDate = '';
  periodForm.isAdjusting = false;
  periodForm.isClosed = false;

  // 清除校验
  if (periodFormRef.value) {
    periodFormRef.value.resetFields();
  }
};

// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = size;
  loadPeriods();
};

const handleCurrentChange = (page) => {
  currentPage.value = page;
  loadPeriods();
};

// 页面加载时执行
onMounted(() => {
  loadPeriods();
});
</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
}

.header-actions {
  display: flex;
  gap: 8px;
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

.period-form {
  width: 100%;
}

.period-form :deep(.el-form-item__content) {
  width: calc(100% - 100px);
}

.period-form :deep(.el-input),
.period-form :deep(.el-input-number),
.period-form :deep(.el-date-picker) {
  width: 100%;
}
</style>
