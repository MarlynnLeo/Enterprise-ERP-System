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
        
        <div class="filter-tabs">
          <div 
            v-for="filter in statusFilters" 
            :key="filter.key"
            class="filter-tab"
            :class="{ active: activeFilter === filter.key }"
            @click="selectFilter(filter.key)"
          >
            {{ filter.label }}
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
                    <Icon name="contact" size="12" color="#c8c9cc" />
                    <span>{{ user.username }}</span>
                  </div>
                  <div class="detail-item" v-if="user.email">
                    <Icon name="envelop-o" size="12" color="#c8c9cc" />
                    <span>{{ user.email }}</span>
                  </div>
                  <div class="detail-item" v-if="user.department">
                    <Icon name="cluster-o" size="12" color="#c8c9cc" />
                    <span>{{ user.department }}</span>
                  </div>
                  <div class="detail-item" v-if="user.role">
                    <Icon name="shield-o" size="12" color="#c8c9cc" />
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

// 加载用户数据
const loadUsers = async (isRefresh = false) => {
  if (isRefresh) {
    users.value = [];
    finished.value = false;
  }

  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 模拟用户数据
    const mockUsers = [
      {
        id: 1,
        username: 'admin',
        name: '系统管理员',
        email: 'admin@example.com',
        phone: '138****8888',
        department: '信息技术部',
        role: '超级管理员',
        status: 'active',
        isOnline: true,
        lastLogin: Date.now() - 300000,
        loginCount: 1250,
        avatar: null
      },
      {
        id: 2,
        username: 'zhangsan',
        name: '张三',
        email: 'zhangsan@example.com',
        phone: '139****9999',
        department: '生产部',
        role: '部门经理',
        status: 'active',
        isOnline: false,
        lastLogin: Date.now() - 3600000,
        loginCount: 856,
        avatar: null
      },
      {
        id: 3,
        username: 'lisi',
        name: '李四',
        email: 'lisi@example.com',
        phone: '137****7777',
        department: '销售部',
        role: '销售员',
        status: 'active',
        isOnline: true,
        lastLogin: Date.now() - 1800000,
        loginCount: 432,
        avatar: null
      },
      {
        id: 4,
        username: 'wangwu',
        name: '王五',
        email: 'wangwu@example.com',
        phone: '136****6666',
        department: '财务部',
        role: '会计',
        status: 'disabled',
        isOnline: false,
        lastLogin: Date.now() - 86400000,
        loginCount: 123,
        avatar: null
      }
    ];
    
    const newUsers = isRefresh ? mockUsers : [];
    
    if (isRefresh) {
      users.value = newUsers;
    } else {
      users.value.push(...newUsers);
    }
    
    finished.value = newUsers.length < 20;
    
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
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (editingUser.value) {
      // 更新用户
      const index = users.value.findIndex(u => u.id === editingUser.value.id);
      if (index !== -1) {
        users.value[index] = { ...users.value[index], ...userForm };
      }
      showToast('用户更新成功');
    } else {
      // 创建用户
      const newUser = {
        id: Date.now(),
        ...userForm,
        isOnline: false,
        lastLogin: null,
        loginCount: 0,
        avatar: null
      };
      users.value.unshift(newUser);
      showToast('用户创建成功');
    }
    
    closeUserDialog();
    updateFilterCounts();
    
  } catch (error) {
    console.error('保存用户失败:', error);
    showToast('保存失败，请重试');
  } finally {
    saving.value = false;
  }
};

const resetPassword = async (user) => {
  try {
    const result = await showConfirmDialog({
      title: '重置密码',
      message: `确定要重置用户 ${user.name} 的密码吗？`
    });
    
    if (result === 'confirm') {
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 1000));
      showToast('密码重置成功');
    }
  } catch (error) {
    // 用户取消
  }
};

const toggleUserStatus = async (user, status) => {
  try {
    const action = status === 'disabled' ? '禁用' : '启用';
    const result = await showConfirmDialog({
      title: `${action}用户`,
      message: `确定要${action}用户 ${user.name} 吗？`
    });
    
    if (result === 'confirm') {
      user.status = status;
      showToast(`用户${action}成功`);
      updateFilterCounts();
    }
  } catch (error) {
    // 用户取消
  }
};

const deleteUser = async (user) => {
  try {
    const result = await showConfirmDialog({
      title: '删除用户',
      message: `确定要删除用户 ${user.name} 吗？此操作不可恢复。`
    });
    
    if (result === 'confirm') {
      const index = users.value.findIndex(u => u.id === user.id);
      if (index !== -1) {
        users.value.splice(index, 1);
        showToast('用户删除成功');
        updateFilterCounts();
      }
    }
  } catch (error) {
    // 用户取消
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
  margin-bottom: 16px;

  .filter-tabs {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 4px;
    margin-top: 12px;
    overflow-x: auto;

    .filter-tab {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-secondary);
      border-radius: 6px;
      transition: all 0.2s;
      white-space: nowrap;

      &.active {
        background-color: var(--color-primary);
        color: #fff;
      }
    }
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
        color: #fff;
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
          color: #fff;

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
