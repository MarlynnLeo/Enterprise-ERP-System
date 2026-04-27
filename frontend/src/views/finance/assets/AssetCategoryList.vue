<!--
/**
 * AssetCategoryList.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="category-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>资产类别管理</h2>
          <p class="subtitle">管理资产分类与属性</p>
        </div>
        <el-button v-permission="'finance:assets:create'" type="primary" :icon="Plus" @click="showAddDialog">新增类别</el-button>
      </div>
    </el-card>

    <!-- 搜索与表格 -->
    <el-card class="data-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="类别名称">
          <el-input v-model="searchKeyword" placeholder="搜索名称/编码" clearable @clear="loadCategories" @keyup.enter="loadCategories"></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadCategories">查询</el-button>
          <el-button @click="searchKeyword = ''; loadCategories()">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table
        :data="filteredCategoryList"
        style="width: 100%"
        border
        v-loading="loading"
      >
        <el-table-column prop="code" label="类别编码" width="130" show-overflow-tooltip></el-table-column>
        <el-table-column prop="name" label="类别名称" width="180" show-overflow-tooltip></el-table-column>
        <el-table-column label="折旧年限" width="100" align="center">
          <template #default="scope">
            {{ scope.row.default_useful_life }} 年
          </template>
        </el-table-column>
        <el-table-column label="折旧方法" width="140">
          <template #default="scope">
            {{ getDepreciationMethodText(scope.row.default_depreciation_method) }}
          </template>
        </el-table-column>
        <el-table-column label="残值率" width="100" align="center">
          <template #default="scope">
            {{ scope.row.default_salvage_rate }}%
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip></el-table-column>
        <el-table-column prop="asset_count" label="资产数量" width="100" align="center">
          <template #default="scope">
            <el-tag v-if="scope.row.asset_count > 0" type="success" size="small">{{ scope.row.asset_count }}</el-tag>
            <span v-else style="color: #909399">0</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="scope">
            <el-button size="small" type="primary" @click="handleEdit(scope.row)"
              v-permission="'finance:assets:categories'">编辑</el-button>
            <el-popconfirm
              title="确定删除此类别吗？"
              @confirm="handleDelete(scope.row.id)"
            >
              <template #reference>
                <el-button v-permission="'finance:assets:delete'" size="small" type="danger" :disabled="scope.row.asset_count > 0" :title="scope.row.asset_count > 0 ? '该类别下有资产，不可删除' : ''">删除</el-button>
              </template>
            </el-popconfirm>
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
    
    <!-- 添加/编辑对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="500px"
    >
      <el-form :model="categoryForm" :rules="categoryRules" ref="categoryFormRef" label-width="100px">
        <el-form-item label="类别名称" prop="name">
          <el-input v-model="categoryForm.name" placeholder="请输入类别名称"></el-input>
        </el-form-item>
        <el-form-item label="类别编码" prop="code">
          <el-input v-model="categoryForm.code" placeholder="请输入类别编码"></el-input>
        </el-form-item>
        <el-form-item label="折旧年限" prop="default_useful_life">
          <el-input-number v-model="categoryForm.default_useful_life" :min="1" :max="50" style="width: 100%"></el-input-number>
        </el-form-item>
        <el-form-item label="折旧方法" prop="default_depreciation_method">
          <el-select v-model="categoryForm.default_depreciation_method" placeholder="请选择折旧方法" style="width: 100%">
            <el-option label="直线法" value="straight_line"></el-option>
            <el-option label="双倍余额递减法" value="double_declining"></el-option>
            <el-option label="年数总和法" value="sum_of_years"></el-option>
            <el-option label="不计提折旧" value="no_depreciation"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="默认残值率" prop="default_salvage_rate">
          <el-input-number 
            v-model="categoryForm.default_salvage_rate" 
            :precision="2" 
            :min="0" 
            :max="30"
            :step="0.5"
            style="width: 100%"
          ></el-input-number>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="categoryForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入描述信息"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveCategory" :loading="saveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { api } from '@/services/api';
import { ensureInteger, normalizePaginationData } from '@/utils/helpers/typeUtils';

// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);

// 分页相关
const total = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);

// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('新增资产类别');
const categoryFormRef = ref(null);

// 数据列表
const categoryList = ref([]);
const searchKeyword = ref('');

// 搜索过滤
const filteredCategoryList = computed(() => {
  if (!searchKeyword.value) return categoryList.value;
  const keyword = searchKeyword.value.toLowerCase();
  return categoryList.value.filter(item =>
    (item.name && item.name.toLowerCase().includes(keyword)) ||
    (item.code && item.code.toLowerCase().includes(keyword))
  );
});

// 类别表单
const categoryForm = reactive({
  id: null,
  name: '',
  code: '',
  default_useful_life: 5,
  default_depreciation_method: 'straight_line',
  default_salvage_rate: 5.0,
  description: ''
});

// 表单验证规则
const categoryRules = {
  name: [
    { required: true, message: '请输入类别名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
  ],
  code: [
    { required: true, message: '请输入类别编码', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_-]{2,20}$/, message: '编码只能包含字母、数字、下划线和短横线', trigger: 'blur' }
  ],
  default_useful_life: [
    { required: true, message: '请输入默认折旧年限', trigger: 'blur' }
  ],
  default_depreciation_method: [
    { required: true, message: '请选择默认折旧方法', trigger: 'change' }
  ]
};

// 获取折旧方法文本
const getDepreciationMethodText = (method) => {
  const methodMap = {
    straight_line: '直线法',
    double_declining: '双倍余额递减法',
    sum_of_years: '年数总和法',
    no_depreciation: '不计提折旧'
  };
  return methodMap[method] || method;
};

// 加载资产类别列表
const loadCategories = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value
    };
    
    const response = await api.get('/finance/assets/categories', { params });
    
    // 使用类型安全工具处理分页数据
    const paginationData = normalizePaginationData(response);
    categoryList.value = paginationData.items;
    total.value = paginationData.total;
  } catch (error) {
    console.error('加载资产类别列表失败:', error);
    ElMessage.error('加载资产类别列表失败');
    categoryList.value = []; // 错误时也确保是空数组
    total.value = 0; // 确保是数字类型
  } finally {
    loading.value = false;
  }
};

// 新增类别
const showAddDialog = () => {
  dialogTitle.value = '新增资产类别';
  resetCategoryForm();
  dialogVisible.value = true;
};

// 编辑类别
const handleEdit = async (row) => {
  dialogTitle.value = '编辑资产类别';
  
  resetCategoryForm();
  
  // 填充表单数据
  Object.assign(categoryForm, row);
  
  dialogVisible.value = true;
};

// 删除类别
const handleDelete = async (id) => {
  try {
    await api.delete(`/finance/assets/categories/${id}`);
    ElMessage.success('删除成功');
    loadCategories();
  } catch (error) {
    console.error('删除资产类别失败:', error);
    if (error.response && error.response.data && error.response.data.message) {
      ElMessage.error(error.response.data.message);
    } else {
      ElMessage.error('删除资产类别失败');
    }
  }
};

// 保存类别
const saveCategory = async () => {
  if (!categoryFormRef.value) return;
  
  await categoryFormRef.value.validate(async (valid) => {
    if (valid) {
      saveLoading.value = true;
      try {
        // 准备提交的数据
        const data = { ...categoryForm };
        
        if (categoryForm.id) {
          // 更新
          await api.put(`/finance/assets/categories/${categoryForm.id}`, data);
          ElMessage.success('更新成功');
        } else {
          // 新增
          await api.post('/finance/assets/categories', data);
          ElMessage.success('添加成功');
        }
        dialogVisible.value = false;
        loadCategories();
      } catch (error) {
        console.error('保存资产类别失败:', error);
        if (error.response && error.response.data && error.response.data.message) {
          ElMessage.error(error.response.data.message);
        } else {
          ElMessage.error('保存资产类别失败');
        }
      } finally {
        saveLoading.value = false;
      }
    }
  });
};

// 重置类别表单
const resetCategoryForm = () => {
  categoryForm.id = null;
  categoryForm.name = '';
  categoryForm.code = '';
  categoryForm.default_useful_life = 5;
  categoryForm.default_depreciation_method = 'straight_line';
  categoryForm.default_salvage_rate = 5.0;
  categoryForm.description = '';
  
  // 清除校验
  if (categoryFormRef.value) {
    categoryFormRef.value.resetFields();
  }
};

// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = ensureInteger(size, 10);
  loadCategories();
};

const handleCurrentChange = (page) => {
  currentPage.value = ensureInteger(page, 1);
  loadCategories();
};

// 页面加载时执行
onMounted(() => {
  loadCategories();
});
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
  margin-bottom: 16px;
}

.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>