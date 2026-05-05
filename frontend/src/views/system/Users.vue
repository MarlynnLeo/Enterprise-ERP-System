<!--
/**
 * Users.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="users-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>用户管理</h2>
          <p class="subtitle">管理系统用户与账号</p>
        </div>
        <el-button type="primary" :icon="Plus" v-permission="'system:users:create'" @click="showAddDialog">新增用户</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="用户名">
          <el-input  v-model="searchForm.username" placeholder="输入用户名" clearable ></el-input>
        </el-form-item>
        <el-form-item label="姓名">
          <el-input  v-model="searchForm.name" placeholder="输入姓名" clearable ></el-input>
        </el-form-item>
        <el-form-item label="部门">
          <el-select v-model="searchForm.department_id" placeholder="选择部门" clearable>
            <el-option
              v-for="dept in departmentOptions"
              :key="dept.id"
              :label="dept.name"
              :value="dept.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="选择状态" clearable>
            <el-option label="启用" :value="1"></el-option>
            <el-option label="禁用" :value="0"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchUsers" :loading="loading">查询</el-button>
          <el-button @click="resetSearch" :loading="loading">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="userList"
        style="width: 100%"
        border
        v-loading="loading"
      >
        <template #empty>
          <el-empty description="暂无用户数据" />
        </template>
        <el-table-column prop="username" label="用户名" width="130" fixed="left"></el-table-column>
        <el-table-column prop="real_name" label="姓名" width="120"></el-table-column>
        <el-table-column prop="email" label="邮箱" min-width="200"></el-table-column>
        <el-table-column prop="phone" label="手机号" width="130"></el-table-column>
        <el-table-column prop="departmentName" label="所属部门" width="120"></el-table-column>
        <el-table-column prop="roleNames" label="角色" min-width="150"></el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" width="180"></el-table-column>
        <el-table-column label="操作" min-width="280" fixed="right">
          <template #default="scope">
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
              <el-popconfirm
                v-if="String(scope.row.status) !== '1'"
                title="确定要启用该用户吗？"
                @confirm="handleToggleStatus(scope.row)"
              >
                <template #reference>
                  <el-button size="small" type="success" v-permission="'system:users:update'">
                    <el-icon><Check /></el-icon> 启用
                  </el-button>
                </template>
              </el-popconfirm>

              <el-popconfirm
                v-if="String(scope.row.status) === '1'"
                title="确定要禁用该用户吗？"
                @confirm="handleToggleStatus(scope.row)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button size="small" type="warning" v-permission="'system:users:update'">
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
                v-permission="'system:users:update'"
                @click="handleEdit(scope.row)"
              ><el-icon><Edit /></el-icon> 编辑</el-button>

              <el-button type="info" size="small" v-permission="'system:users:update'" @click="handleResetPassword(scope.row)">
                <el-icon><Key /></el-icon> 重置密码
              </el-button>
            </div>
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
    
    <!-- 添加/编辑/查看对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="600px"
    >
      <template v-if="isViewMode">
        <el-descriptions :column="2" border style="margin-bottom: 20px;">
          <el-descriptions-item label="用户名">{{ userForm.username || '-' }}</el-descriptions-item>
          <el-descriptions-item label="姓名">{{ userForm.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ userForm.email || '-' }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ userForm.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="所属部门">
             {{ departmentOptions.find(d => d.id === userForm.department_id)?.name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(userForm.status)">
              {{ getStatusText(userForm.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="角色" :span="2">
             <div v-if="userForm.roleIds?.length">
                <el-tag v-for="rid in userForm.roleIds" :key="rid" style="margin-right: 5px;">
                  {{ roleOptions.find(r => r.id === rid)?.name || `未知角色(${rid})` }}
                </el-tag>
             </div>
             <span v-else>-</span>
          </el-descriptions-item>
        </el-descriptions>
      </template>

      <el-form v-else :model="userForm" :rules="userRules" ref="userFormRef" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="userForm.username" placeholder="请输入用户名" :disabled="userForm.id"></el-input>
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="userForm.name" placeholder="请输入姓名"></el-input>
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="userForm.email" placeholder="请输入邮箱"></el-input>
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="userForm.phone" placeholder="请输入手机号"></el-input>
        </el-form-item>
        <el-form-item v-if="!userForm.id" label="密码" prop="password">
          <el-input v-model="userForm.password" placeholder="请输入密码" type="password"></el-input>
        </el-form-item>
        <el-form-item label="部门" prop="department_id">
          <el-select v-model="userForm.department_id" placeholder="请选择部门" style="width: 100%">
            <el-option
              v-for="dept in departmentOptions"
              :key="dept.id"
              :label="dept.name"
              :value="dept.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="角色" prop="roleIds">
          <el-select v-model="userForm.roleIds" placeholder="请选择角色" multiple style="width: 100%">
            <el-option
              v-for="role in roleOptions"
              :key="role.id"
              :label="role.name"
              :value="role.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="userForm.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">{{ isViewMode ? '关闭' : '取消' }}</el-button>
          <el-button v-if="!isViewMode" type="primary" @click="saveUser" :loading="saveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Check, Close, View, Edit, Key } from '@element-plus/icons-vue';
import { api } from '../../services/api';
import { getUserStatusText, getUserStatusColor } from '@/constants/systemConstants';
// 权限计算属性
// 数据加载状态
const loading = ref(false);

// 状态转换函数
const getStatusText = (status) => {
  const numStatus = status === '1' || status === 1 ? 1 : 0;
  return numStatus === 1 ? getUserStatusText('active') : getUserStatusText('disabled');
};

const getStatusType = (status) => {
  const numStatus = status === '1' || status === 1 ? 1 : 0;
  return numStatus === 1 ? getUserStatusColor('active') : getUserStatusColor('disabled');
};
const saveLoading = ref(false);

// 分页相关
const total = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);

// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('新增用户');
const isViewMode = ref(false);
const userFormRef = ref(null);

// 数据列表
const userList = ref([]);
const departmentOptions = ref([]);
const roleOptions = ref([]);

// 搜索表单
const searchForm = reactive({
  username: '',
  name: '',
  department_id: '',
  status: ''
});

// 用户表单
const userForm = reactive({
  id: null,
  username: '',
  name: '',
  password: '',
  email: '',
  phone: '',
  department_id: null,
  roleIds: [],
  status: 1
});

// 表单验证规则
const userRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '长度在3到20个字符', trigger: 'blur' }
  ],
  name: [
    { required: true, message: '请输入姓名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '长度在6到20个字符', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  phone: [
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号格式', trigger: 'blur' }
  ],
  department_id: [
    { required: true, message: '请选择部门', trigger: 'change' }
  ],
  roleIds: [
    { required: true, message: '请选择角色', trigger: 'change' }
  ]
};

// 加载用户列表
const loadUsers = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      username: searchForm.username,
      name: searchForm.name,
      department_id: searchForm.department_id,
      status: searchForm.status
    };

    const response = await api.get(`/api/system/users`, { params });
    // axios 拦截器已自动解包，response.data 直接是分页数据对象
    const responseData = response.data;
    // 提取用户列表数据，适配不同格式
    const usersData = responseData.data || responseData.list || responseData.rows || (Array.isArray(responseData) ? responseData : []);
    // 确保状态值是数字类型，并处理部门名称显示
    userList.value = usersData.map(user => {
      // 查找对应的部门名称
      let departmentName = user.departmentName || '';
      if (!departmentName && user.department_id) {
        const dept = departmentOptions.value.find(d => d.id === Number(user.department_id));
        if (dept) {
          departmentName = dept.name;
        }
      }

      return {
        ...user,
        departmentName,
        status: Number(user.status) === 1 ? 1 : 0
      };
    });
    total.value = Number(responseData.total || responseData.count || usersData.length);
  } catch (error) {
    console.error('加载用户列表失败:', error);
    ElMessage.error('加载用户列表失败');
  } finally {
    loading.value = false;
  }
};

// 加载部门选项
const loadDepartmentOptions = async () => {
  try {
    const response = await api.get(`/api/system/departments/list`);
    // 拦截器已解包，response.data 就是业务数据
    let deptsData = [];

    if (response.data && Array.isArray(response.data)) {
      deptsData = response.data;
    } else if (response.data && Array.isArray(response.data.list)) {
      deptsData = response.data.list;
    } else if (response.data && typeof response.data === 'object') {
      // 尝试提取对象中的数组
      const possibleArrays = Object.values(response.data).filter(val => Array.isArray(val));
      if (possibleArrays.length > 0) {
        // 使用第一个找到的数组
        deptsData = possibleArrays[0];
      }
    }

    // 确保每个部门对象都有id和name
    departmentOptions.value = deptsData.map(dept => ({
      id: Number(dept.id),
      name: dept.name || dept.departmentName || '未命名部门',
      code: dept.code || '',
      description: dept.description || ''
    }));
    
    } catch (error) {
    console.error('加载部门列表失败:', error);
    departmentOptions.value = []; // 确保出错时也是空数组
    if (error.response) {
      console.error('服务器响应:', error.response.data);
      ElMessage.error(`加载部门列表失败: ${error.response.status} - ${error.response.data?.message || error.message}`);
    } else if (error.request) {
      ElMessage.error('服务器无响应，请检查网络连接');
    } else {
      ElMessage.error('加载部门列表失败: ' + error.message);
    }
  }
};

// 加载角色选项
const loadRoleOptions = async () => {
  try {
    const response = await api.get(`/api/system/roles/list`);
    // 拦截器已解包，response.data 就是业务数据
    let rolesData = [];

    if (response.data && Array.isArray(response.data)) {
      rolesData = response.data;
    } else if (response.data && Array.isArray(response.data.list)) {
      rolesData = response.data.list;
    } else if (response.data && typeof response.data === 'object') {
      // 尝试提取对象中的数组
      const possibleArrays = Object.values(response.data).filter(val => Array.isArray(val));
      if (possibleArrays.length > 0) {
        // 使用第一个找到的数组
        rolesData = possibleArrays[0];
      }
    }

    // 确保每个角色对象都有id和name
    roleOptions.value = rolesData.map(role => ({
      id: Number(role.id),
      name: role.name || role.roleName || '未命名角色',
      code: role.code || '',
      description: role.description || ''
    }));
    
    // 仅在开发环境下显示角色信息
    if (process.env.NODE_ENV === 'development') {
      }
  } catch (error) {
    console.error('加载角色列表失败:', error);
    roleOptions.value = []; // 确保出错时也是空数组
    if (error.response) {
      console.error('服务器响应:', error.response.data);
      ElMessage.error(`加载角色列表失败: ${error.response.status} - ${error.response.data?.message || error.message}`);
    } else if (error.request) {
      ElMessage.error('服务器无响应，请检查网络连接');
    } else {
      ElMessage.error('加载角色列表失败: ' + error.message);
    }
  }
};

// 搜索用户
const searchUsers = () => {
  currentPage.value = 1;
  loadUsers();
};

// 重置搜索条件
const resetSearch = () => {
  searchForm.username = '';
  searchForm.name = '';
  searchForm.department_id = '';
  searchForm.status = '';
  searchUsers();
};

// 新增用户
const showAddDialog = () => {
  dialogTitle.value = '新增用户';
  isViewMode.value = false;
  resetUserForm();
  dialogVisible.value = true;
};

// 查看用户
const handleView = async (row) => {
  isViewMode.value = true;
  await loadUserDataForDialog(row, '查看用户');
};

// 编辑用户
const handleEdit = async (row) => {
  isViewMode.value = false;
  await loadUserDataForDialog(row, '编辑用户');
};

const loadUserDataForDialog = async (row, displayTitle) => {
  dialogTitle.value = displayTitle;
  resetUserForm();
  
  try {
    const response = await api.get(`/api/system/users/${row.id}`);
    // 拦截器已解包，response.data 就是业务数据
    const user = response.data;

    if (!user) {
      throw new Error('无法获取用户数据');
    }
    
    // 填充表单数据
    userForm.id = user.id;
    userForm.username = user.username;
    userForm.name = user.real_name || '';
    userForm.email = user.email || '';
    userForm.phone = user.phone || '';
    // 确保部门ID是数字类型
    userForm.department_id = user.department_id ? Number(user.department_id) : null;
    // 处理角色数据
    if (user.roles && Array.isArray(user.roles)) {
      userForm.roleIds = user.roles.map(role => Number(role.id || role));
    } else {
      userForm.roleIds = [];
    }
    
    userForm.status = user.status === undefined ? 1 : Number(user.status);
    
    dialogVisible.value = true;
  } catch (error) {
    console.error('获取用户详情失败:', error);
    if (error.response) {
      console.error('服务器响应:', error.response.data);
      ElMessage.error(`获取用户详情失败: ${error.response.status} - ${error.response.data?.message || error.message}`);
    } else {
      ElMessage.error('获取用户详情失败: ' + (error.message || '未知错误'));
    }
  }
};

// 切换用户状态
const handleToggleStatus = (row) => {
  // 确保状态是数字类型，并处理可能的字符串类型
  const currentStatus = Number(row.status) === 1 ? 1 : 0
  const statusText = currentStatus === 1 ? '禁用' : '启用'
  const newStatus = currentStatus === 1 ? 0 : 1

  ElMessageBox.confirm(
    `确认要${statusText}该用户吗？`,
    '提示',
    {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await api.put(`/api/system/users/${row.id}/status`, { status: newStatus })
      ElMessage.success(`${statusText}成功`)
      // 直接更新本地状态，不重新加载列表
      row.status = newStatus
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

// 重置密码
const handleResetPassword = (row) => {
  ElMessageBox.prompt(
    '请输入新密码',
    '重置密码',
    {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputType: 'password',
      inputValidator: (value) => {
        if (!value) {
          return '密码不能为空'
        }
        if (value.length < 6) {
          return '密码长度不能小于6位'
        }
        return true
      }
    }
  ).then(async ({ value }) => {
    try {
      await api.put(`/api/system/users/${row.id}/password/reset`, { password: value })
      ElMessage.success('密码重置成功')
    } catch (error) {
      console.error('密码重置失败:', error)

      // 提取后端返回的错误信息
      const errorMsg = error.response?.data?.error ||
                       error.response?.data?.message ||
                       error.message ||
                       '密码重置失败'

      ElMessage.error(errorMsg)
    }
  }).catch(() => {})
}

// 重置表单
const resetUserForm = () => {
  userForm.id = null;
  userForm.username = '';
  userForm.name = '';
  userForm.password = '';
  userForm.email = '';
  userForm.phone = '';
  userForm.department_id = null;
  userForm.roleIds = [];
  userForm.status = 1;
};

// 保存用户
const saveUser = async () => {
  if (!userFormRef.value) return;

  // 🔒 防止重复提交：在验证之前就检查 loading 状态
  if (saveLoading.value) {
    ElMessage.warning('正在保存中，请勿重复操作')
    return
  }

  try {
    // 表单验证
    const valid = await userFormRef.value.validate()
    if (!valid) return

    // 🔒 立即设置 loading 状态，防止重复提交
    saveLoading.value = true

    // 准备用户数据，处理格式
    const userData = {
      ...userForm,
      // 确保角色ID为数字类型
      roleIds: userForm.roleIds.map(id => Number(id)),
      // 确保状态为数字
      status: Number(userForm.status),
      // 确保部门ID为数字
      department_id: userForm.department_id ? Number(userForm.department_id) : null
    }

    if (userData.id) {
      // 更新用户
      await api.put(`/api/system/users/${userData.id}`, userData)
      ElMessage.success('更新成功')
    } else {
      // 新增用户
      await api.post(`/api/system/users`, userData)
      ElMessage.success('添加成功')
    }

    dialogVisible.value = false
    loadUsers()
  } catch (error) {
    // 表单验证失败
    if (error && typeof error === 'object' && !error.response) {
      return
    }

    console.error('保存用户失败:', error)

    // 提取后端返回的错误信息
    const errorMsg = error.response?.data?.error ||
                     error.response?.data?.message ||
                     error.message ||
                     '保存用户失败'

    // 如果是重复提交错误（409状态码），显示警告
    if (error.response?.status === 409) {
      ElMessage.warning(errorMsg)
    } else if (error.response?.status >= 500) {
      ElMessage.error(`服务器错误: ${errorMsg}`)
    } else if (!error.response) {
      ElMessage.error('网络错误，请检查连接')
    } else {
      ElMessage.error(errorMsg)
    }
  } finally {
    saveLoading.value = false
  }
};

// 处理分页
const handleSizeChange = (newSize) => {
  pageSize.value = newSize;
  loadUsers();
};

const handleCurrentChange = (newPage) => {
  currentPage.value = newPage;
  loadUsers();
};

// 页面加载时执行
onMounted(async () => {
  await loadDepartmentOptions();
  await loadRoleOptions();
  loadUsers();
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

/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>