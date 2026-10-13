<!--
/**
 * Users.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page users-container">
    <PageHeader title="用户管理" subtitle="管理系统用户与账号">
      <template #actions>
<el-button type="primary" :icon="Plus" v-permission="'system:users:create'" @click="showAddDialog">新增用户</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="searchUsers"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="姓名">
          <el-input  v-model="searchForm.name" placeholder="输入姓名" clearable ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="用户名">
          <el-input  v-model="searchForm.username" placeholder="输入用户名" clearable ></el-input>
        </el-form-item>
        <el-form-item label="部门">
          <el-select v-model="searchForm.departmentId" placeholder="选择部门" clearable>
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
      </template>
    </FinanceQueryCard>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="userList"
        class="table-row-click w-full"
        border
        v-loading="loading"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))">
        <template #empty>
          <EmptyState description="暂无用户数据" />
        </template>
        <el-table-column label="用户名" width="170" fixed="left">
          <template #default="scope">
            <div class="account-cell">
              <span>{{ scope.row.username }}</span>
              <el-tag v-if="scope.row.loginLocked" size="small" type="danger">已锁定</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="realName" label="姓名" width="120"></el-table-column>
        <el-table-column prop="email" label="邮箱" min-width="200"></el-table-column>
        <el-table-column prop="phone" label="手机号" width="130"></el-table-column>
        <el-table-column prop="departmentName" label="所属部门" width="120"></el-table-column>
        <el-table-column prop="roleNames" label="角色" min-width="180"></el-table-column>
        <el-table-column label="电子签名" width="140" align="center">
          <template #default="scope">
            <div v-if="scope.row.signatureCode" class="table-signature-cell">
              <span class="table-signature-render">{{ scope.row.signatureCode }}</span>
              <span class="table-signature-code">({{ scope.row.signatureCode }})</span>
            </div>
            <span v-else class="table-signature-empty">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" width="180"></el-table-column>
        <el-table-column label="操作" min-width="410" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="scope">
            <div class="table-actions">
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
                v-if="String(scope.row.status) !== '1'"
                type="primary"
                size="small"
                v-permission="'system:users:update'"
                @click="handleEdit(scope.row)"
              ><el-icon><Edit /></el-icon> 编辑</el-button>

              <el-button type="info" size="small" v-permission="'system:users:update'" @click="handleResetPassword(scope.row)">
                <el-icon><Key /></el-icon> 重置密码
              </el-button>

              <el-button
                v-if="scope.row.loginLocked"
                type="danger"
                plain
                size="small"
                v-permission="'system:users:update'"
                @click="handleUnlockLogin(scope.row)"
              >
                <el-icon><Unlock /></el-icon> 解除锁定
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
    <AppDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :mode="isViewMode ? 'view' : 'form'"
      width="640px"
      content-width="wide"
    >
      <template v-if="isViewMode">
        <el-descriptions :column="2" border class="mb-20">
          <el-descriptions-item label="用户名">{{ userForm.username || '-' }}</el-descriptions-item>
          <el-descriptions-item label="姓名">{{ userForm.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ userForm.email || '-' }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ userForm.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="所属部门">
             {{ departmentOptions.find(d => d.id === userForm.departmentId)?.name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="电子签名代号">
            <el-tag v-if="userForm.signatureCode" size="small" type="primary">{{ userForm.signatureCode }}</el-tag>
            <span v-else class="text-placeholder">未设置</span>
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

        <!-- 电子签名只读展示卡片（只查看，不可编辑） -->
        <div class="signature-section">
          <div class="signature-section-header">
            <span class="section-title">
              <el-icon><EditPen /></el-icon> 电子签名手写体展示 (SPPLMFONT 字体)
            </span>
            <el-tag v-if="userForm.signatureCode" size="small" type="success" effect="plain">已配置签名</el-tag>
            <el-tag v-else size="small" type="info" effect="plain">未配置</el-tag>
          </div>

          <div class="signature-display-card">
            <template v-if="userForm.signatureCode">
              <div class="signature-canvas">
                <span class="signature-render-text">
                  {{ userForm.signatureCode }}
                </span>
              </div>
              <div class="signature-info-bar">
                <span v-if="resolvePersonBySignatureCode(userForm.signatureCode)" class="match-tip match-success">
                  <el-icon><CircleCheck /></el-icon> 匹配签名人：<strong>{{ resolvePersonBySignatureCode(userForm.signatureCode) }}</strong>（代号：{{ userForm.signatureCode }}）
                </span>
                <span v-else class="match-tip">
                  已绑定签名代号：{{ userForm.signatureCode }}
                </span>
                <span class="read-only-tip">
                  <el-icon><CircleCheck /></el-icon> 审批与检验打印时将自动使用此签名
                </span>
              </div>
            </template>
            <template v-else>
              <div class="signature-empty-container">
                <div class="empty-tip-title">暂未配置电子签名</div>
                <div class="empty-tip-desc">如需配置，请先在列表中【禁用】该用户，然后点击【编辑】进行设置并保存。</div>
              </div>
            </template>
          </div>
        </div>
      </template>

      <el-form v-else :model="userForm" :rules="userRules" ref="userFormRef" label-width="110px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="userForm.username" placeholder="请输入用户名" :disabled="userForm.id"></el-input>
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="userForm.name" placeholder="请输入姓名"></el-input>
        </el-form-item>
        <el-form-item label="电子签名代号" prop="signatureCode">
          <div class="signature-edit-box">
            <el-input
              v-model="userForm.signatureCode"
              placeholder="请输入签名代号（例如：O 对应王晓敏，A 对应陈挺，C 对应陈贤萍）"
              clearable
              maxlength="1"
            />
            <div class="signature-preset-actions" role="group" aria-label="电子签名预设">
              <el-button
                v-for="opt in PRESET_SIGNATURE_OPTIONS"
                :key="opt.code"
                size="small"
                @click="userForm.signatureCode = opt.code"
              >填入 {{ opt.code }} ({{ opt.name }})</el-button>
            </div>

            <!-- 输入时实时预览 -->
            <div class="form-signature-preview-box">
              <div class="preview-canvas-mini">
                <span v-if="userForm.signatureCode" class="signature-render-text-mini">
                  {{ userForm.signatureCode }}
                </span>
                <span v-else class="preview-empty-text">
                  输入签名代号后在此实时预览手写效果（例：输入 O、A、C）
                </span>
              </div>
              <div v-if="userForm.signatureCode" class="preview-match-row">
                <span v-if="resolvePersonBySignatureCode(userForm.signatureCode)" class="match-tip match-success">
                  <el-icon><CircleCheck /></el-icon> 实时匹配：<strong>{{ resolvePersonBySignatureCode(userForm.signatureCode) }}</strong>
                </span>
                <span v-else class="match-tip">
                  字体字形效果：{{ userForm.signatureCode }}
                </span>
              </div>
            </div>
          </div>
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
        <el-form-item label="部门" prop="departmentId">
          <el-select v-model="userForm.departmentId" placeholder="请选择部门" class="w-full">
            <el-option
              v-for="dept in departmentOptions"
              :key="dept.id"
              :label="dept.name"
              :value="dept.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="角色" prop="roleIds">
          <el-select v-model="userForm.roleIds" placeholder="请选择角色（权限管理中已配置的角色）" multiple class="w-full">
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
          <el-button v-if="!isViewMode" v-permission="userForm.id ? 'system:users:update' : 'system:users:create'" type="primary" @click="saveUser" :loading="saveLoading">确认</el-button>
        </span>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { Plus, Check, Close, Edit, Key, Unlock, EditPen, CircleCheck } from '@element-plus/icons-vue';
import { systemApi } from '@/api';
import { getUserStatusText, getUserStatusColor } from '@/constants/systemConstants';
import { resolvePersonBySignatureCode, resolveSignatureCode, PRESET_SIGNATURE_OPTIONS } from '@/constants/signatureConstants';
import { getApiErrorMessage } from '@/utils/errorHandler'
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
  departmentId: '',
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
  departmentId: null,
  roleIds: [],
  signatureCode: '',
  status: 1
});

const passwordRuleText = '请设置登录密码';
const validatePasswordStrength = (value) => {
  const password = String(value || '');
  if (!password) return '密码不能为空';
  return true;
};

// 表单验证规则
const userRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '长度在2到20个字符', trigger: 'blur' }
  ],
  name: [
    { required: true, message: '请输入姓名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        const result = validatePasswordStrength(value);
        if (result === true) callback();
        else callback(new Error(result));
      },
      trigger: 'blur'
    }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  phone: [
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号格式', trigger: 'blur' }
  ],
  departmentId: [
    { required: true, message: '请选择部门', trigger: 'change' }
  ],
  roleIds: [
    { required: true, message: '请选择角色', trigger: 'change' }
  ],
  signatureCode: [
    { pattern: /^[A-Za-z]?$/, message: '签名代号只能是一个英文字母', trigger: 'blur' }
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
      departmentId: searchForm.departmentId,
      status: searchForm.status
    };

    const response = await systemApi.getUsers(params);
    // axios 拦截器已自动解包，response.data 直接是分页数据对象
    const responseData = response.data;
    // 提取用户列表数据，适配不同格式
    const usersData = responseData.data || responseData.list || responseData.rows || (Array.isArray(responseData) ? responseData : []);
    // 确保状态值是数字类型，并处理部门名称显示
    userList.value = usersData.map(user => {
      // 查找对应的部门名称
      let departmentName = user.departmentName || '';
      if (!departmentName && user.departmentId) {
        const dept = departmentOptions.value.find(d => d.id === Number(user.departmentId));
        if (dept) {
          departmentName = dept.name;
        }
      }

      return {
        ...user,
        departmentName,
        signatureCode: user.signatureCode || '',
        status: Number(user.status) === 1 ? 1 : 0,
        loginLocked: user.loginLocked === true || Number(user.loginLocked) === 1
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
    const response = await systemApi.getDepartmentsList();
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
      ElMessage.error(`加载部门列表失败: ${getApiErrorMessage(error, '请稍后重试')}`);
  }
};

// 加载角色选项
const loadRoleOptions = async () => {
  try {
    const response = await systemApi.getRolesList();
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

  } catch (error) {
    console.error('加载角色列表失败:', error);
    roleOptions.value = []; // 确保出错时也是空数组
    ElMessage.error(`加载角色列表失败: ${getApiErrorMessage(error, '请稍后重试')}`);
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
  searchForm.departmentId = '';
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
    const response = await systemApi.getUser(row.id);
    // 拦截器已解包，response.data 就是业务数据
    const user = response.data;

    if (!user) {
      throw new Error('无法获取用户数据');
    }

    // 填充表单数据
    userForm.id = user.id;
    userForm.username = user.username;
    userForm.name = user.realName || '';
    userForm.email = user.email || '';
    userForm.phone = user.phone || '';
    // 确保部门ID是数字类型
    userForm.departmentId = user.departmentId ? Number(user.departmentId) : null;
    // 处理角色数据
    if (user.roles && Array.isArray(user.roles)) {
      userForm.roleIds = user.roles.map(role => Number(role.id || role));
    } else {
      userForm.roleIds = [];
    }

    userForm.signatureCode = user.signatureCode || '';

    userForm.status = user.status === undefined ? 1 : Number(user.status);

    dialogVisible.value = true;
  } catch (error) {
    console.error('获取用户详情失败:', error);
    ElMessage.error(`获取用户详情失败: ${getApiErrorMessage(error, '请稍后重试')}`);
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
      await systemApi.updateUserStatus(row.id, { status: newStatus })
      ElMessage.success(`${statusText}成功`)
      // 直接更新本地状态，不重新加载列表
      row.status = newStatus
    } catch (error) {
      console.error(`${statusText}失败:`, error)

      // 提取后端返回的错误信息
      const errorMsg = getApiErrorMessage(error, `${statusText}失败`)

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
      inputPlaceholder: passwordRuleText,
      inputValidator: (value) => {
        return validatePasswordStrength(value)
      }
    }
  ).then(async ({ value }) => {
    try {
      await systemApi.resetUserPassword(row.id, { password: value })
      ElMessage.success('密码重置成功')
    } catch (error) {
      console.error('密码重置失败:', error)

      // 提取后端返回的错误信息
      const errorMsg = getApiErrorMessage(error, '密码重置失败')

      ElMessage.error(errorMsg)
    }
  }).catch(() => {})
}

// 解除连续输错密码造成的登录锁定
const handleUnlockLogin = (row) => {
  ElMessageBox.confirm(
    `确认解除账号“${row.username}”的登录限制吗？解除后失败次数会清零。`,
    '解除登录锁定',
    {
      confirmButtonText: '确认解除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await systemApi.unlockUserLogin(row.id)
      row.loginLocked = false
      row.failedLoginAttempts = 0
      row.lockedUntil = null
      ElMessage.success('登录限制已解除')
    } catch (error) {
      console.error('解除登录限制失败:', error)
      ElMessage.error(
        getApiErrorMessage(error, '解除登录限制失败')
      )
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
  userForm.departmentId = null;
  userForm.roleIds = [];
  userForm.signatureCode = '';
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
      departmentId: userForm.departmentId ? Number(userForm.departmentId) : null,
      signatureCode: resolveSignatureCode(userForm.signatureCode) || null
    }

    if (userData.id) {
      // 更新用户
      await systemApi.updateUser(userData.id, userData)
      ElMessage.success('更新成功')
    } else {
      // 新增用户
      await systemApi.createUser(userData)
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
    const errorMsg = getApiErrorMessage(error, '保存用户失败')

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


:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* 电子签名样式 */
.table-signature-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.table-signature-render {
  font-family: 'SPPLMFONT', sans-serif !important;
  font-size: 24px;
  line-height: 1;
  color: var(--color-text-primary);
  display: inline-block;
  vertical-align: middle;
  text-transform: uppercase;
}

.table-signature-code {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.table-signature-empty {
  color: var(--color-text-placeholder, #9ca3af);
}

.signature-section {
  margin-top: 16px;
  border-top: 1px dashed var(--color-border-base, #e5e7eb);
  padding-top: 16px;
}

.signature-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.signature-section-header .section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #1f2937);
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 查看模式：只读卡片 */
.signature-display-card {
  background: var(--color-bg-base, #f9fafb);
  border: 1px solid var(--color-border-light, #e5e7eb);
  border-radius: 8px;
  padding: 16px 20px;
}

.signature-canvas {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px dashed var(--color-border-base, #cbd5e1);
  border-radius: 6px;
  padding: 10px;
}

.signature-render-text {
  font-family: 'SPPLMFONT', sans-serif !important;
  font-size: 44px;
  line-height: 1;
  color: #111827;
  letter-spacing: 2px;
  user-select: none;
  text-transform: uppercase;
}

.signature-info-bar {
  margin-top: 12px;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.signature-empty-container {
  padding: 24px 16px;
  text-align: center;
  background: var(--color-bg-section);
  border: 1px dashed var(--color-border-base);
  border-radius: 6px;
}

.empty-tip-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 6px;
}

.empty-tip-desc {
  font-size: 12px;
  color: var(--color-text-placeholder, #9ca3af);
  margin-top: 4px;
}

.read-only-tip {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
  display: flex;
  align-items: center;
  gap: 4px;
}

.match-tip.match-success {
  color: color-mix(in srgb, var(--color-success-dark) 40%, var(--color-text-primary));
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}

/* 编辑模式：输入与实时预览 */
.signature-edit-box {
  width: 100%;
}

.signature-preset-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.signature-preset-actions :deep(.el-button) {
  margin: 0;
}

.form-signature-preview-box {
  margin-top: 10px;
  background: var(--color-bg-base, #f9fafb);
  border: 1px solid var(--color-border-light, #e5e7eb);
  border-radius: 6px;
  padding: 10px 14px;
}

.preview-canvas-mini {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px dashed var(--color-border-base, #cbd5e1);
  border-radius: 4px;
}

.signature-render-text-mini {
  font-family: 'SPPLMFONT', sans-serif !important;
  font-size: 34px;
  line-height: 1;
  color: #111827;
  letter-spacing: 2px;
  user-select: none;
  text-transform: uppercase;
}

.preview-empty-text {
  font-size: 12px;
  /* 白纸预览使用固定墨色，避免暗色主题的浅色提示在白底上失去对比。 */
  color: #6B7280;
}

.preview-match-row {
  margin-top: 8px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
