<!--
/**
 * Users.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="users-page">
    <NavBar title="用户管理" left-arrow @click-left="$router.go(-1)">
      <template #right>
        <Icon name="plus" size="18" @click="createUser" />
      </template>
    </NavBar>
    
    <div class="content-container">
      <!-- 搜索和筛选 -->
      <div class="search-section">
        <Search 
          v-model="searchKeyword" 
          placeholder="搜索用户名、姓名、邮箱..."
          @search="handleSearch"
          @clear="handleClear"
        />
      </div>

      <!-- 横向滑动筛选标签 -->
      <div class="filter-scroll-wrapper">
        <div class="filter-scroll">
          <div 
            v-for="filter in statusFilters" 
            :key="filter.key"
            class="filter-chip"
            :class="{ active: activeFilter === filter.key }"
            @click="selectFilter(filter.key)"
          >
            <span class="chip-text">{{ filter.label }}</span>
            <Badge v-if="filter.count > 0" :content="filter.count" />
          </div>
        </div>
      </div>

      <!-- 用户统计 -->
      <div class="user-stats">
        <div class="stats-item">
          <div class="stats-number">{{ userStats.total }}</div>
          <div class="stats-label">总用户</div>
        </div>
        <div class="stats-item">
          <div class="stats-number active">{{ userStats.active }}</div>
          <div class="stats-label">活跃用户</div>
        </div>
        <div class="stats-item">
          <div class="stats-number online">{{ userStats.online }}</div>
          <div class="stats-label">在线用户</div>
        </div>
        <div class="stats-item">
          <div class="stats-number disabled">{{ userStats.disabled }}</div>
          <div class="stats-label">禁用用户</div>
        </div>
      </div>

      <!-- 用户列表 -->
      <div class="user-list">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <div 
              v-for="user in filteredUsers" 
              :key="user.id"
              class="user-item"
              @click="viewUser(user)"
            >
              <div class="user-avatar">
                <img v-if="user.avatar" :src="user.avatar" :alt="user.name" />
                <div v-else class="avatar-placeholder">
                  {{ user.name?.charAt(0) || 'U' }}
                </div>
                <div class="online-indicator" v-if="user.isOnline"></div>
              </div>
              
              <div class="user-info">
                <div class="user-header">
                  <div class="user-name">{{ user.name }}</div>
                  <div class="user-status">
                    <div class="status-badge" :class="user.status">
                      {{ getStatusText(user.status) }}
                    </div>
                  </div>
                </div>
                
                <div class="user-details">
                  <div class="detail-item">
                    <Icon name="contact" size="12" color="var(--text-disabled)" />
                    <span>{{ user.username }}</span>
                  </div>
                  <div class="detail-item" v-if="user.email">
                    <Icon name="envelop-o" size="12" color="var(--text-disabled)" />
                    <span>{{ user.email }}</span>
                  </div>
                  <div class="detail-item" v-if="user.department">
                    <Icon name="cluster-o" size="12" color="var(--text-disabled)" />
                    <span>{{ user.department }}</span>
                  </div>
                  <div class="detail-item" v-if="user.role">
                    <Icon name="shield-o" size="12" color="var(--text-disabled)" />
                    <span>{{ user.role }}</span>
                  </div>
                </div>
                
                <div class="user-meta">
                  <div class="meta-item">
                    <span class="meta-label">最后登录:</span>
                    <span class="meta-value">{{ formatTime(user.lastLogin) }}</span>
                  </div>
                  <div class="meta-item" v-if="user.loginCount">
                    <span class="meta-label">登录次数:</span>
                    <span class="meta-value">{{ user.loginCount }}</span>
                  </div>
                </div>
              </div>
              
              <div class="user-actions">
                <Icon name="more-o" size="16" @click.stop="showUserActions(user)" />
              </div>
            </div>
          </List>
        </PullRefresh>
      </div>

      <!-- 空状态 -->
      <div class="empty-users" v-if="filteredUsers.length === 0 && !loading">
        <Empty description="暂无用户数据">
          <Button type="primary" size="small" @click="createUser">
            创建用户
          </Button>
        </Empty>
      </div>
    </div>

    <!-- 用户操作弹窗 -->
    <ActionSheet
      v-model:show="showActions"
      :actions="userActions"
      cancel-text="取消"
      @select="handleUserAction"
    />

    <!-- 创建/编辑用户弹窗 -->
    <Popup v-model:show="showUserDialog" position="bottom" :style="{ height: '80%' }">
      <div class="user-dialog">
        <div class="dialog-header">
          <span>{{ editingUser ? '编辑用户' : '创建用户' }}</span>
          <Icon name="cross" @click="closeUserDialog" />
        </div>
        <div class="dialog-content">
          <Form @submit="saveUser">
            <Field
              v-model="userForm.username"
              name="username"
              label="用户名"
              placeholder="请输入用户名"
              :rules="[{ required: true, message: '请输入用户名' }]"
            />
            <Field
              v-model="userForm.name"
              name="name"
              label="姓名"
              placeholder="请输入姓名"
              :rules="[{ required: true, message: '请输入姓名' }]"
            />
            <Field
              v-model="userForm.email"
              name="email"
              label="邮箱"
              placeholder="请输入邮箱"
              type="email"
            />
            <Field
              v-model="userForm.phone"
              name="phone"
              label="手机号"
              placeholder="请输入手机号"
              type="tel"
            />
            <Field
              v-model="userForm.department"
              name="department"
              label="部门"
              placeholder="请选择部门"
              readonly
              is-link
              @click="selectDepartment"
            />
            <Field
              v-model="userForm.role"
              name="role"
              label="角色"
              placeholder="请选择角色"
              readonly
              is-link
              @click="selectRole"
            />
            <Field
              v-model="userForm.status"
              name="status"
              label="状态"
              placeholder="请选择状态"
              readonly
              is-link
              @click="selectStatus"
            />
            <div class="form-actions">
              <Button block type="primary" native-type="submit" :loading="saving">
                {{ editingUser ? '更新' : '创建' }}
              </Button>
            </div>
          </Form>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { 
  NavBar, Icon, Search, Badge, PullRefresh, List, Empty, Button,
  ActionSheet, Popup, Form, Field, showToast, showConfirmDialog 
} from 'vant';
import { systemApi } from '@/services/api';

const router = useRouter();

// 响应式数据
const users = ref([]);
const searchKeyword = ref('');
const activeFilter = ref('all');
const loading = ref(false);
const finished = ref(false);
const refreshing = ref(false);
const showActions = ref(false);
const showUserDialog = ref(false);
const saving = ref(false);
const selectedUser = ref(null);
const editingUser = ref(null);

// 用户表单
const userForm = reactive({
  username: '',
  name: '',
  email: '',
  phone: '',
  department: '',
  role: '',
  status: 'active'
});

// 状态筛选器
const statusFilters = ref([
  { key: 'all', label: '全部', count: 0 },
  { key: 'active', label: '活跃', count: 0 },
  { key: 'online', label: '在线', count: 0 },
  { key: 'disabled', label: '禁用', count: 0 }
]);

// 用户统计
const userStats = reactive({
  total: 156,
  active: 142,
  online: 25,
  disabled: 14
});

// 用户操作
const userActions = ref([
  { name: '查看详情', key: 'view' },
  { name: '编辑用户', key: 'edit' },
  { name: '重置密码', key: 'reset-password' },
  { name: '禁用用户', key: 'disable', color: '#ff6b6b' },
  { name: '删除用户', key: 'delete', color: '#ff6b6b' }
]);

// 计算属性
const filteredUsers = computed(() => {
  let filtered = users.value;
  
  // 状态筛选
  if (activeFilter.value !== 'all') {
    if (activeFilter.value === 'online') {
      filtered = filtered.filter(user => user.isOnline);
    } else {
      filtered = filtered.filter(user => user.status === activeFilter.value);
    }
  }
  
  // 搜索筛选
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase();
    filtered = filtered.filter(user => 
      user.username.toLowerCase().includes(keyword) ||
      user.name.toLowerCase().includes(keyword) ||
      user.email?.toLowerCase().includes(keyword)
    );
  }
  
  return filtered;
});

import { getUserStatusText } from '@/constants/systemConstants'

// 获取状态文本
const getStatusText = (status) => {
  return getUserStatusText(status);
};

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return '从未登录';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return date.toLocaleDateString('zh-CN');
};

// 分页状态
const currentPage = ref(1);
const pageSize = 20;

// 加载用户数据
const loadUsers = async (isRefresh = false) => {
  if (isRefresh) {
    users.value = [];
    currentPage.value = 1;
    finished.value = false;
  }

  try {
    const response = await systemApi.getUsers({
      page: currentPage.value,
      pageSize,
      keyword: searchKeyword.value || undefined
    });
    const data = response.data;
    const list = data?.list || data?.rows || (Array.isArray(data) ? data : []);

    // 规范化字段
    const normalized = list.map(u => ({
      ...u,
      name: u.real_name || u.name || u.username,
      department: u.department_name || u.department || '',
      role: u.role_name || u.role || '',
      isOnline: false,
      lastLogin: u.last_login_at || u.lastLogin || null,
      loginCount: u.login_count || 0
    }));

    if (isRefresh) {
      users.value = normalized;
    } else {
      users.value.push(...normalized);
    }

    finished.value = normalized.length < pageSize;
    currentPage.value++;

    // 更新筛选器计数
    updateFilterCounts();

  } catch (error) {
    console.error('加载用户失败:', error);
    showToast('加载失败，请重试');
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
};

// 更新筛选器计数
const updateFilterCounts = () => {
  statusFilters.value.forEach(filter => {
    if (filter.key === 'all') {
      filter.count = users.value.length;
    } else if (filter.key === 'online') {
      filter.count = users.value.filter(user => user.isOnline).length;
    } else {
      filter.count = users.value.filter(user => user.status === filter.key).length;
    }
  });
};

// 事件处理
const onLoad = () => {
  loading.value = true;
  loadUsers();
};

const onRefresh = () => {
  refreshing.value = true;
  loadUsers(true);
};

const handleSearch = () => {
  // 搜索逻辑已在计算属性中处理
};

const handleClear = () => {
  searchKeyword.value = '';
};

const selectFilter = (filterKey) => {
  activeFilter.value = filterKey;
};

const viewUser = (user) => {
  router.push(`/system/users/${user.id}`);
};

const showUserActions = (user) => {
  selectedUser.value = user;
  
  // 根据用户状态调整操作选项
  if (user.status === 'disabled') {
    userActions.value[3] = { name: '启用用户', key: 'enable', color: '#2ccfb0' };
  } else {
    userActions.value[3] = { name: '禁用用户', key: 'disable', color: '#ff6b6b' };
  }
  
  showActions.value = true;
};

const handleUserAction = (action) => {
  const user = selectedUser.value;
  
  switch (action.key) {
    case 'view':
      viewUser(user);
      break;
    case 'edit':
      editUser(user);
      break;
    case 'reset-password':
      resetPassword(user);
      break;
    case 'disable':
      toggleUserStatus(user, 'disabled');
      break;
    case 'enable':
      toggleUserStatus(user, 'active');
      break;
    case 'delete':
      deleteUser(user);
      break;
  }
};

const createUser = () => {
  editingUser.value = null;
  resetUserForm();
  showUserDialog.value = true;
};

const editUser = (user) => {
  editingUser.value = user;
  Object.assign(userForm, user);
  showUserDialog.value = true;
};

const resetUserForm = () => {
  Object.assign(userForm, {
    username: '',
    name: '',
    email: '',
    phone: '',
    department: '',
    role: '',
    status: 'active'
  });
};

const closeUserDialog = () => {
  showUserDialog.value = false;
  resetUserForm();
};

const saveUser = async () => {
  saving.value = true;

  try {
    if (editingUser.value) {
      await systemApi.updateUser(editingUser.value.id, { ...userForm });
      showToast('用户更新成功');
    } else {
      await systemApi.createUser({ ...userForm });
      showToast('用户创建成功');
    }

    closeUserDialog();
    loadUsers(true);

  } catch (error) {
    console.error('保存用户失败:', error);
    showToast(error?.response?.data?.message || '保存失败，请重试');
  } finally {
    saving.value = false;
  }
};

const resetPassword = async (user) => {
  try {
    await showConfirmDialog({
      title: '重置密码',
      message: `确定要重置用户 ${user.name} 的密码吗？`
    });

    await systemApi.resetUserPassword(user.id);
    showToast('密码重置成功');
  } catch (error) {
    if (error !== 'cancel') {
      showToast('重置失败，请重试');
    }
  }
};

const toggleUserStatus = async (user, status) => {
  try {
    const action = status === 'disabled' ? '禁用' : '启用';
    await showConfirmDialog({
      title: `${action}用户`,
      message: `确定要${action}用户 ${user.name} 吗？`
    });

    await systemApi.updateUserStatus(user.id, status);
    user.status = status;
    showToast(`用户${action}成功`);
    updateFilterCounts();
  } catch (error) {
    if (error !== 'cancel') {
      showToast('操作失败，请重试');
    }
  }
};

const deleteUser = async (user) => {
  try {
    await showConfirmDialog({
      title: '删除用户',
      message: `确定要删除用户 ${user.name} 吗？此操作不可恢复。`
    });

    await systemApi.deleteUser(user.id);
    users.value = users.value.filter(u => u.id !== user.id);
    showToast('用户删除成功');
    updateFilterCounts();
  } catch (error) {
    if (error !== 'cancel') {
      showToast('删除失败，请重试');
    }
  }
};

const selectDepartment = () => {
  showToast('部门选择功能开发中');
};

const selectRole = () => {
  showToast('角色选择功能开发中');
};

const selectStatus = () => {
  showToast('状态选择功能开发中');
};

// 初始化
onMounted(() => {
  loadUsers(true);
});
</script>

<style lang="scss" scoped>
.users-page {
  min-height: 100vh;
  background-color: var(--bg-primary);
}

.content-container {
  padding: 12px;
}

.search-section {
  margin-bottom: 4px;
}
.filter-scroll-wrapper {
  padding: 4px 0 8px;
  overflow: hidden;
}
.filter-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 0 6px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}
.filter-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 20px;
  background: var(--bg-secondary);
  border: 1.5px solid var(--glass-border);
  white-space: nowrap;
  flex-shrink: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  transition: all 0.25s ease;
  cursor: pointer;
  .chip-text { font-weight: 500; }
  &.active {
    background: var(--color-accent-bg, rgba(59, 130, 246, 0.1));
    border-color: var(--color-accent, var(--color-primary));
    color: var(--color-accent, var(--color-primary));
  }
}

.user-stats {
  display: flex;
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: none;

  .stats-item {
    flex: 1;
    text-align: center;

    .stats-number {
      font-size: 20px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;

      &.active {
        color: var(--module-green);
      }

      &.online {
        color: var(--module-blue);
      }

      &.disabled {
        color: var(--module-red);
      }
    }

    .stats-label {
      font-size: 12px;
      color: var(--text-secondary);
    }
  }
}

.user-list {
  .user-item {
    display: flex;
    align-items: flex-start;
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 8px;
    box-shadow: none;

    .user-avatar {
      position: relative;
      margin-right: 12px;

      img, .avatar-placeholder {
        width: 48px;
        height: 48px;
        border-radius: 50%;
      }

      .avatar-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--color-primary);
        color: var(--text-primary);
        font-size: 18px;
        font-weight: 600;
      }

      .online-indicator {
        position: absolute;
        bottom: 2px;
        right: 2px;
        width: 12px;
        height: 12px;
        background-color: var(--module-green);
        border: 2px solid #fff;
        border-radius: 50%;
      }
    }

    .user-info {
      flex: 1;

      .user-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;

        .user-name {
          font-size: 16px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .status-badge {
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 10px;
          color: var(--text-primary);

          &.active {
            background-color: var(--module-green);
          }

          &.disabled {
            background-color: var(--module-red);
          }

          &.pending {
            background-color: var(--module-orange);
          }
        }
      }

      .user-details {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 8px;

        .detail-item {
          display: flex;
          align-items: center;
          font-size: 12px;
          color: var(--text-secondary);

          span {
            margin-left: 4px;
          }
        }
      }

      .user-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;

        .meta-item {
          font-size: 11px;

          .meta-label {
            color: var(--text-secondary);
          }

          .meta-value {
            color: var(--text-primary);
            margin-left: 4px;
          }
        }
      }
    }

    .user-actions {
      padding-top: 4px;
    }
  }
}

.empty-users {
  padding: 60px 20px;
  text-align: center;
}

.user-dialog {
  height: 100%;
  display: flex;
  flex-direction: column;

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--van-border-color);
    font-size: 16px;
    font-weight: 600;
  }

  .dialog-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;

    .form-actions {
      margin-top: 24px;
    }
  }
}
</style>
