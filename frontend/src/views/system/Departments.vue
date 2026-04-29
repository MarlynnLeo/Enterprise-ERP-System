<!--
/**
 * Departments.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="departments-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>部门管理</h2>
          <p class="subtitle">管理组织架构与部门</p>
        </div>
        <el-button type="primary" :icon="Plus" v-permission="'system:departments:create'" @click="showAddDialog">新增部门</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="部门名称">
          <el-input  v-model="searchForm.name" placeholder="输入部门名称" clearable ></el-input>
        </el-form-item>
        <el-form-item label="部门编码">
          <el-input  v-model="searchForm.code" placeholder="输入部门编码" clearable ></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="选择状态" clearable>
            <el-option label="启用" :value="1"></el-option>
            <el-option label="禁用" :value="0"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchDepartments" :loading="loading">查询</el-button>
          <el-button @click="resetSearch" :loading="loading">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="pagedDepartmentList"
        style="width: 100%"
        border
        row-key="id"
        :tree-props="{children: 'children', hasChildren: 'hasChildren'}"
        v-loading="loading"
        empty-text="暂无数据"
      >
        <template #empty>
          <el-empty description="暂无部门数据" />
        </template>
        <el-table-column prop="name" label="部门名称" width="200"></el-table-column>
        <el-table-column prop="code" label="部门编码" width="200"></el-table-column>
        <el-table-column prop="manager_name" label="部门负责人" width="150">
          <template #default="scope">
            {{ scope.row.manager_name || '无' }}
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="联系电话" width="220"></el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="String(scope.row.status) === '1' ? 'success' : 'danger'">
              {{ String(scope.row.status) === '1' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" min-width="200">
          <template #default="scope">
            {{ scope.row && scope.row.created_at ? new Date(scope.row.created_at).toLocaleString() : '' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="300" fixed="right">
          <template #default="scope">
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
              <el-popconfirm
                v-if="String(scope.row.status) !== '1'"
                title="确定要启用该部门吗？"
                @confirm="handleToggleStatus(scope.row)"
              >
                <template #reference>
                  <el-button size="small" type="success" v-permission="'system:departments:update'">
                    <el-icon><Check /></el-icon> 启用
                  </el-button>
                </template>
              </el-popconfirm>

              <el-popconfirm
                v-if="String(scope.row.status) === '1'"
                title="确定要禁用该部门吗？"
                @confirm="handleToggleStatus(scope.row)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button size="small" type="warning" v-permission="'system:departments:update'">
                    <el-icon><Close /></el-icon> 禁用
                  </el-button>
                </template>
              </el-popconfirm>

              <el-button
                v-if="String(scope.row.status) === '1'"
                type="primary"
                size="small"
                @click="handleView(scope.row)"
              ><el-icon><View /></el-icon> 查看</el-button>

              <el-button
                v-if="String(scope.row.status) !== '1'"
                type="primary"
                size="small"
                v-permission="'system:departments:update'"
                @click="handleEdit(scope.row)"
              ><el-icon><Edit /></el-icon> 编辑</el-button>

              <el-button
                type="success"
                size="small"
                v-permission="'system:departments:create'"
                @click="handleAddChild(scope.row)"
              >添加子部门</el-button>

              <el-popconfirm
                v-if="String(scope.row.status) !== '1'"
                title="确定要删除该部门吗？此操作不可恢复。"
                @confirm="handleDelete(scope.row)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button type="danger" size="small" v-permission="'system:departments:delete'">
                    <el-icon><Delete /></el-icon> 删除
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container" style="display: flex; justify-content: flex-end; margin-top: 20px;">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="totalDepartments"
          :page-size="pageSize"
          :current-page="currentPage"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>
    
    <!-- 添加/编辑/查看对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="600px"
    >
      <template v-if="isViewMode">
        <el-descriptions :column="2" border style="margin-bottom: 20px;">
          <el-descriptions-item label="上级部门" v-if="departmentForm.parent_id">{{ parentDepartmentName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="部门名称">{{ departmentForm.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="部门编码">{{ departmentForm.code || '-' }}</el-descriptions-item>
          <el-descriptions-item label="部门负责人">
             {{ userOptions.find(u => u.id === departmentForm.manager_id)?.real_name || userOptions.find(u => u.id === departmentForm.manager_id)?.username || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ departmentForm.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="部门状态">
            <el-tag :type="Number(departmentForm.status) === 1 ? 'success' : 'danger'">
              {{ Number(departmentForm.status) === 1 ? '启用' : '禁用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ departmentForm.remark || '-' }}</el-descriptions-item>
        </el-descriptions>
      </template>

      <el-form v-else :model="departmentForm" :rules="departmentRules" ref="departmentFormRef" label-width="100px">
        <el-form-item v-if="departmentForm.parent_id && dialogTitle === '添加子部门'" label="上级部门">
          <el-input v-model="parentDepartmentName" disabled></el-input>
        </el-form-item>
        <el-form-item label="部门名称" prop="name">
          <el-input v-model="departmentForm.name" placeholder="请输入部门名称"></el-input>
        </el-form-item>
        <el-form-item label="部门编码" prop="code">
          <el-input v-model="departmentForm.code" placeholder="请输入部门编码"></el-input>
        </el-form-item>
        <el-form-item label="部门负责人">
          <el-select 
            v-model="departmentForm.manager_id" 
            placeholder="请选择部门负责人" 
            filterable 
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="user in userOptions"
              :key="user.id"
              :label="user.real_name || user.username"
              :value="user.id"
            >
              <span style="float: left">{{ user.real_name || user.username }}</span>
              <span style="float: right; color: var(--color-text-muted); font-size: 13px">{{ user.department_name || '无部门' }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="departmentForm.phone" placeholder="请输入联系电话"></el-input>
        </el-form-item>
        <el-form-item label="部门状态">
          <el-radio-group v-model="departmentForm.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input 
            v-model="departmentForm.remark" 
            type="textarea" 
            :rows="3" 
            placeholder="请输入备注信息"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">{{ isViewMode ? '关闭' : '取消' }}</el-button>
          <el-button v-if="!isViewMode" type="primary" @click="saveDepartment" :loading="saveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Check, Close, View, Edit, Delete } from '@element-plus/icons-vue';
import { api } from '../../services/api';
// 权限计算属性
// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);

// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('新增部门');
const isViewMode = ref(false);
const departmentFormRef = ref(null);

// 数据列表
const departmentList = ref([]);
const departmentTree = ref([]);
const userOptions = ref([]);

// 分页相关
const totalDepartments = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);

const pagedDepartmentList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return departmentList.value.slice(start, end);
});

// 处理分页
const handleSizeChange = (newSize) => {
  pageSize.value = newSize;
};

const handleCurrentChange = (newPage) => {
  currentPage.value = newPage;
};

// 搜索表单
const searchForm = reactive({
  name: '',
  code: '',
  status: ''
});

// 部门表单
const departmentForm = reactive({
  id: null,
  parent_id: null,
  name: '',
  code: '',
  manager_id: null,
  phone: '',
  status: 1,
  remark: ''
});

// 表单验证规则
const departmentRules = {
  name: [
    { required: true, message: '请输入部门名称', trigger: 'blur' }
  ],
  code: [
    { required: true, message: '请输入部门编码', trigger: 'blur' }
  ]
};

// 将平铺的部门数据转换为树形结构
const buildDepartmentTree = (departments) => {
  // 创建一个映射表，方便查找
  const map = {};
  const tree = [];

  // 先创建所有节点的映射
  departments.forEach(dept => {
    map[dept.id] = { ...dept, children: [] };
  });

  // 构建树形结构
  departments.forEach(dept => {
    const node = map[dept.id];
    if (dept.parent_id === null || dept.parent_id === 0 || !map[dept.parent_id]) {
      // 一级部门（没有父部门或父部门不存在）
      tree.push(node);
    } else {
      // 子部门，添加到父部门的children中
      const parent = map[dept.parent_id];
      if (parent) {
        parent.children.push(node);
      }
    }
  });

  return tree;
};

// 加载部门树结构
const loadDepartments = async () => {
  loading.value = true;
  try {
    const params = {
      name: searchForm.name,
      code: searchForm.code,
      status: searchForm.status
    };

    const response = await api.get('/system/departments', { params });

    // 确保我们处理的是数组数据
    let responseData = response.data;
    let flatDepartments = [];

    // 处理不同的响应数据格式
    if (Array.isArray(responseData)) {
      flatDepartments = responseData;
    } else if (responseData && responseData.data && Array.isArray(responseData.data)) {
      // 如果数据在data字段中
      flatDepartments = responseData.data;
    } else if (responseData && responseData.list && Array.isArray(responseData.list)) {
      // 如果数据在list字段中
      flatDepartments = responseData.list;
    } else {
      console.error('Expected array but got:', typeof responseData, responseData);
      flatDepartments = []; // 确保是空数组而不是null或undefined
    }

    // 将平铺数据转换为树形结构
    departmentList.value = buildDepartmentTree(flatDepartments);

    // 更新分页总数
    totalDepartments.value = departmentList.value.length;
    // 如果当前页超过了最大页数，则重置为第一页
    if ((currentPage.value - 1) * pageSize.value >= totalDepartments.value) {
      currentPage.value = 1;
    }

    // 构建部门树，添加一个虚拟的根节点
    departmentTree.value = [
      {
        id: 0,
        name: '顶级部门',
        children: JSON.parse(JSON.stringify(departmentList.value))
      }
    ];

    } catch (error) {
    console.error('加载部门列表失败:', error);
    departmentList.value = []; // 确保错误时也是空数组
    totalDepartments.value = 0;
    departmentTree.value = [{ id: 0, name: '顶级部门', children: [] }];
    ElMessage.error(`加载部门列表失败: ${error.response?.data?.message || error.message}`);
  } finally {
    loading.value = false;
  }
};

// 加载用户列表用于选择部门负责人
const loadUserOptions = async () => {
  try {
    const response = await api.get('/api/system/users/list');
    let usersData = [];
    if (response.data && Array.isArray(response.data)) {
      usersData = response.data;
    } else if (response.data && Array.isArray(response.data.data)) {
      usersData = response.data.data;
    } else if (response.data && Array.isArray(response.data.list)) {
      usersData = response.data.list;
    }
    // 过滤掉已禁用的用户
    userOptions.value = usersData.filter(user => String(user.status) === '1' || String(user.status) === '1');
  } catch (error) {
    console.error('加载可选用用户列表失败:', error);
  }
};

// 搜索部门
const searchDepartments = () => {
  loadDepartments();
};

// 重置搜索条件
const resetSearch = () => {
  searchForm.name = '';
  searchForm.code = '';
  searchForm.status = '';
  searchDepartments();
};

// 新增部门
const showAddDialog = () => {
  dialogTitle.value = '新增部门';
  isViewMode.value = false;
  resetDepartmentForm();
  dialogVisible.value = true;
};

// 查看部门
const handleView = (row) => {
  dialogTitle.value = '查看部门';
  isViewMode.value = true;
  resetDepartmentForm();
  
  // 填充表单数据
  departmentForm.id = row.id;
  departmentForm.parent_id = row.parent_id;
  departmentForm.name = row.name;
  departmentForm.code = row.code;
  departmentForm.manager_id = row.manager_id;
  departmentForm.phone = row.phone;
  departmentForm.status = row.status;
  departmentForm.remark = row.remark;
  
  dialogVisible.value = true;
};

// 编辑部门
const handleEdit = (row) => {
  dialogTitle.value = '编辑部门';
  isViewMode.value = false;
  resetDepartmentForm();
  
  // 填充表单数据
  departmentForm.id = row.id;
  departmentForm.parent_id = row.parent_id;
  departmentForm.name = row.name;
  departmentForm.code = row.code;
  departmentForm.manager_id = row.manager_id;
  departmentForm.phone = row.phone;
  departmentForm.status = row.status;
  departmentForm.remark = row.remark;
  
  dialogVisible.value = true;
};

// 删除部门
const handleDelete = (row) => {
  ElMessageBox.confirm(
    `确认要删除部门"${row.name}"吗？此操作不可恢复。`,
    '提示',
    {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await api.delete(`/system/departments/${row.id}`)
      ElMessage.success('删除成功')
      loadDepartments()
    } catch (error) {
      console.error('删除部门失败:', error)

      // 提取后端返回的错误信息
      const errorMsg = error.response?.data?.error ||
                       error.response?.data?.message ||
                       error.message ||
                       '删除部门失败'

      ElMessage.error(errorMsg)
    }
  }).catch(() => {})
}

// 切换部门状态
const handleToggleStatus = (row) => {
  const statusText = String(row.status) === '1' ? '禁用' : '启用'
  const newStatus = String(row.status) === '1' ? 0 : 1

  ElMessageBox.confirm(
    `确认要${statusText}该部门吗？`,
    '提示',
    {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await api.put(`/system/departments/${row.id}/status`, { status: newStatus })
      ElMessage.success(`${statusText}成功`)
      loadDepartments()
    } catch (error) {
      console.error(`${statusText}失败:`, error)

      // 提取后端返回的错误信息
      const errorMsg = error.response?.data?.error ||
                       error.response?.data?.message ||
                       error.message ||
                       `${statusText}失败`

      ElMessage.error(errorMsg)
    }
  }).catch(() => {})
}

// 保存部门
const saveDepartment = async () => {
  if (!departmentFormRef.value) return

  // 🔒 防止重复提交：在验证之前就检查 loading 状态
  if (saveLoading.value) {
    ElMessage.warning('正在保存中，请勿重复操作')
    return
  }

  try {
    // 表单验证
    const valid = await departmentFormRef.value.validate()
    if (!valid) return

    // 🔒 立即设置 loading 状态，防止重复提交
    saveLoading.value = true

    const formData = {
      name: departmentForm.name,
      code: departmentForm.code,
      parent_id: departmentForm.parent_id,
      manager_id: departmentForm.manager_id,
      phone: departmentForm.phone,
      status: departmentForm.status,
      remark: departmentForm.remark
    }

    if (departmentForm.id) {
      // 更新
      await api.put(`/system/departments/${departmentForm.id}`, formData)
      ElMessage.success('更新成功')
    } else {
      // 新增
      await api.post('/system/departments', formData)
      ElMessage.success('添加成功')
    }

    dialogVisible.value = false
    loadDepartments()
  } catch (error) {
    // 表单验证失败
    if (error && typeof error === 'object' && !error.response) {
      return
    }

    console.error('保存部门失败:', error)

    // 提取后端返回的错误信息
    const errorMsg = error.response?.data?.error ||
                     error.response?.data?.message ||
                     error.message ||
                     '保存部门失败'

    // 如果是重复提交错误（409状态码），显示警告
    if (error.response?.status === 409) {
      ElMessage.warning(errorMsg)
    } else {
      ElMessage.error(errorMsg)
    }
  } finally {
    saveLoading.value = false
  }
}

// 重置部门表单
const resetDepartmentForm = () => {
  departmentForm.id = null;
  departmentForm.parent_id = null;
  departmentForm.name = '';
  departmentForm.code = '';
  departmentForm.manager_id = null;
  departmentForm.phone = '';
  departmentForm.status = 1;
  departmentForm.remark = '';
  parentDepartmentName.value = '';
  
  // 清除校验
  if (departmentFormRef.value) {
    departmentFormRef.value.resetFields();
  }
};

const parentDepartmentName = ref('');

// 添加子部门
const handleAddChild = (row) => {
  dialogTitle.value = '添加子部门';
  isViewMode.value = false;
  resetDepartmentForm();
  departmentForm.parent_id = row.id;
  parentDepartmentName.value = row.name;
  dialogVisible.value = true;
};



// 页面加载时执行
onMounted(() => {
  loadDepartments();
  loadUserOptions();
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
</style>