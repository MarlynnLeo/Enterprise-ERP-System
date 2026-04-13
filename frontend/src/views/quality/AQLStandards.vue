<template>
  <div class="aql-standards-container">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>AQL 抽样标准库</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>新增标准
          </el-button>
        </div>
      </template>

      <!-- Search & Filter -->
      <div class="search-container">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-input 
              v-model="searchKeyword"
              placeholder="搜索标准号/名称"
              clearable
              @clear="fetchData"
              @keyup.enter="fetchData" >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </el-col>
          <el-col :span="4">
            <el-select  v-model="searchStatus" placeholder="状态" clearable @change="fetchData">
              <el-option label="生效中" value="active" />
              <el-option label="已停用" value="inactive" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-button type="primary" @click="fetchData">搜索</el-button>
          </el-col>
        </el-row>
      </div>

      <!-- Table Area -->
      <el-table
        v-loading="loading"
        :data="tableData"
        border
        style="width: 100%; margin-top: 20px"
      >
        <el-table-column prop="code" label="标准编号" width="150" />
        <el-table-column prop="name" label="标准名称" width="200" show-overflow-tooltip />
        <el-table-column prop="aql_level" label="AQL 级别" width="100">
          <template #default="scope">
            <el-tag type="info" effect="plain">{{ scope.row.aql_level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="批量范围" width="180">
          <template #default="scope">
            {{ scope.row.batch_min }} ~ {{ scope.row.batch_max }}
          </template>
        </el-table-column>
        <el-table-column prop="sample_size" label="抽样数 (n)" width="120" />
        <el-table-column prop="accept_limit" label="允收数 (Ac)" width="120">
          <template #default="scope">
            <span style="color: #67C23A; font-weight: bold">{{ scope.row.accept_limit }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="reject_limit" label="拒收数 (Re)" width="120">
          <template #default="scope">
            <span style="color: #F56C6C; font-weight: bold">{{ scope.row.reject_limit }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === 'active' ? 'success' : 'danger'">
              {{ scope.row.status === 'active' ? '生效中' : '已停用' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="updated_at" label="最后更新" width="160">
          <template #default="scope">
            {{ formatDate(scope.row.updated_at) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" fixed="right" min-width="150">
          <template #default="scope">
            <el-button size="small" type="primary" link @click="handleEdit(scope.row)">编辑</el-button>
            <el-button v-permission="'quality:aqlstandards:delete'" size="small" type="danger" link @click="handleDelete(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑 AQL 标准' : '新增 AQL 标准'"
      width="600px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item label="标准编号" prop="code">
          <el-input v-model="form.code" placeholder="如 GB/T 2828" :disabled="isEdit" />
        </el-form-item>
        <el-form-item label="标准名称" prop="name">
          <el-input v-model="form.name" placeholder="标准规范的名称描述" />
        </el-form-item>
        
        <el-divider>抽样字码基准</el-divider>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="AQL 级别" prop="aql_level">
              <el-input-number v-model="form.aql_level" :precision="2" :step="0.1" :min="0.01" style="width: 100%" placeholder="如 0.65" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="抽样数 (n)" prop="sample_size">
              <el-input-number v-model="form.sample_size" :min="1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="适用批量范围" required>
          <el-col :span="11">
            <el-form-item prop="batch_min">
              <el-input-number v-model="form.batch_min" :min="1" style="width: 100%" placeholder="最小批量" />
            </el-form-item>
          </el-col>
          <el-col class="text-center" :span="2" style="text-align: center; line-height: 32px;">
            <span class="text-gray-500">-</span>
          </el-col>
          <el-col :span="11">
            <el-form-item prop="batch_max">
              <el-input-number v-model="form.batch_max" :min="form.batch_min" style="width: 100%" placeholder="最大批量" />
            </el-form-item>
          </el-col>
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="允收数 (Ac)" prop="accept_limit">
              <el-input-number v-model="form.accept_limit" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="拒收数 (Re)" prop="reject_limit">
              <el-input-number v-model="form.reject_limit" :min="form.accept_limit + 1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="状态" prop="status">
          <el-switch
            v-model="form.status"
            active-value="active"
            inactive-value="inactive"
            active-text="生效"
            inactive-text="停用"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSubmit" :loading="submitting">
            确认
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import request from '@/utils/request';
import dayjs from 'dayjs';

// ---- State ----
const loading = ref(false);
const submitting = ref(false);
const tableData = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const searchKeyword = ref('');
const searchStatus = ref('');

const dialogVisible = ref(false);
const isEdit = ref(false);
const formRef = ref(null);

const form = ref({
  id: null,
  code: '',
  name: '',
  aql_level: null,
  batch_min: 1,
  batch_max: 100,
  sample_size: 1,
  accept_limit: 0,
  reject_limit: 1,
  status: 'active'
});

const rules = {
  code: [{ required: true, message: '请输入标准编号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入标准名称', trigger: 'blur' }],
  aql_level: [{ required: true, message: '请输入 AQL 级别', trigger: 'blur' }],
  batch_min: [{ required: true, message: '请输入最小批量', trigger: 'blur' }],
  batch_max: [{ required: true, message: '请输入最大批量', trigger: 'blur' }],
  sample_size: [{ required: true, message: '请输入抽样数', trigger: 'blur' }],
  accept_limit: [{ required: true, message: '请输入允收数', trigger: 'blur' }],
  reject_limit: [{ required: true, message: '请输入拒收数', trigger: 'blur' }]
};

// ---- Methods ----
const fetchData = async () => {
  loading.value = true;
  try {
    const res = await request.get('/quality/aql-standards', {
      params: {
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: searchKeyword.value,
        status: searchStatus.value
      }
    });
    const responseData = res.data || res;
    tableData.value = responseData.items || [];
    total.value = responseData.total || 0;
  } catch (error) {
    console.error('Failed to fetch AQL standards:', error);
    ElMessage.error('获取列表失败');
  } finally {
    loading.value = false;
  }
};

const handleAdd = () => {
  isEdit.value = false;
  resetForm();
  dialogVisible.value = true;
};

const handleEdit = (row) => {
  isEdit.value = true;
  form.value = { ...row };
  // 转换部分数字以防组件报错
  form.value.aql_level = Number(row.aql_level);
  dialogVisible.value = true;
};

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定要删除标准 ${row.code} 吗？`, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await request.delete(`/quality/aql-standards/${row.id}`);
      ElMessage.success('删除成功');
      fetchData();
    } catch (error) {
      console.error('Delete failed:', error);
      ElMessage.error('删除失败');
    }
  }).catch(() => {});
};

const handleSubmit = () => {
  if (!formRef.value) return;
  
  formRef.value.validate(async (valid) => {
    if (!valid) return;
    
    submitting.value = true;
    try {
      if (isEdit.value) {
        await request.put(`/quality/aql-standards/${form.value.id}`, form.value);
        ElMessage.success('更新成功');
      } else {
        await request.post('/quality/aql-standards', form.value);
        ElMessage.success('创建成功');
      }
      dialogVisible.value = false;
      fetchData();
    } catch (error) {
      console.error('Submit failed:', error);
      ElMessage.error(error.message || '操作失败');
    } finally {
      submitting.value = false;
    }
  });
};

const resetForm = () => {
  form.value = {
    id: null,
    code: '',
    name: '',
    aql_level: null,
    batch_min: 1,
    batch_max: 100,
    sample_size: 1,
    accept_limit: 0,
    reject_limit: 1,
    status: 'active'
  };
  if (formRef.value) {
    formRef.value.clearValidate();
  }
};

const handleSizeChange = (val) => {
  pageSize.value = val;
  fetchData();
};

const handleCurrentChange = (val) => {
  currentPage.value = val;
  fetchData();
};

// formatDate 已统一引用公共实现;

// 日期格式化
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
};

// ---- Lifecycle ----
onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.aql-standards-container {
  padding: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.search-container {
  margin-bottom: 20px;
}
.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
