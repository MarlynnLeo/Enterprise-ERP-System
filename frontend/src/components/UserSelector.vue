<!--
/**
 * UserSelector.vue
 * @description 用户与部门选择组件
 */
-->
<template>
  <div class="user-selector">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="选择用户" name="users">
        <el-select
          v-model="selectedUsers"
          multiple
          filterable
          remote
          reserve-keyword
          placeholder="搜索并选择用户"
          :remote-method="searchUsers"
          :loading="loading"
          class="full-width-control"
          @change="handleUserChange"
        >
          <el-option
            v-for="user in userList"
            :key="user.id"
            :label="formatUserOption(user)"
            :value="user.id"
          >
            <div class="user-option">
              <span class="user-name">{{ user.real_name }}</span>
              <span class="user-info">{{ user.department || '无部门' }} - {{ user.position || '未设置岗位' }}</span>
            </div>
          </el-option>
        </el-select>

        <div v-if="selectedUsers.length > 0" class="selected-list">
          <el-tag
            v-for="userId in selectedUsers"
            :key="userId"
            closable
            class="selected-tag"
            @close="removeUser(userId)"
          >
            {{ getUserName(userId) }}
          </el-tag>
        </div>
      </el-tab-pane>

      <el-tab-pane label="选择部门" name="departments">
        <el-select
          v-model="selectedDepartments"
          multiple
          filterable
          placeholder="选择部门"
          class="full-width-control"
          @change="handleDepartmentChange"
        >
          <el-option
            v-for="dept in departmentList"
            :key="dept.id"
            :label="`${dept.name} (${dept.user_count || 0}人)`"
            :value="dept.id"
          />
        </el-select>

        <div v-if="selectedDepartments.length > 0" class="selected-list">
          <el-tag
            v-for="deptId in selectedDepartments"
            :key="deptId"
            closable
            type="success"
            class="selected-tag"
            @close="removeDepartment(deptId)"
          >
            {{ getDepartmentName(deptId) }}
          </el-tag>
        </div>
      </el-tab-pane>
    </el-tabs>

    <div class="stats">
      <el-alert
        :title="`已选择 ${selectedUsers.length} 个用户，${selectedDepartments.length} 个部门`"
        type="info"
        :closable="false"
        show-icon
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { loadDepartmentOptions, searchUserOptions } from '@/utils/optionLoaders';

const normalizeUsers = (users = []) => users.map(user => ({
  ...user,
  department: user.department || user.departmentName || user.department_name || '',
  position: user.position || user.positionName || user.position_name || '',
  real_name: user.real_name || user.name || user.username || ''
}));

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ users: [], departments: [] })
  }
});

const emit = defineEmits(['update:modelValue']);

const activeTab = ref('users');
const loading = ref(false);
const userList = ref([]);
const departmentList = ref([]);
const selectedUsers = ref([]);
const selectedDepartments = ref([]);

const formatUserOption = (user) => {
  const username = user.username ? ` (${user.username})` : '';
  const department = user.department || '无部门';
  return `${user.real_name}${username} - ${department}`;
};

const searchUsers = async (query) => {
  if (!query) {
    await loadUsers();
    return;
  }

  loading.value = true;
  try {
    const users = await searchUserOptions(query, { pageSize: 50 });
    userList.value = normalizeUsers(users);
  } catch (error) {
    if (error.response?.status !== 403) {
      console.error('搜索用户失败:', error);
    }
    userList.value = [];
  } finally {
    loading.value = false;
  }
};

const loadUsers = async () => {
  loading.value = true;
  try {
    const users = await searchUserOptions('', { pageSize: 50 });
    userList.value = normalizeUsers(users);
  } catch (error) {
    if (error.response?.status !== 403) {
      console.error('加载用户失败:', error);
    }
    userList.value = [];
  } finally {
    loading.value = false;
  }
};

const loadDepartments = async () => {
  try {
    const departments = await loadDepartmentOptions();
    departmentList.value = departments.filter(dept => String(dept.status ?? 1) === '1');
  } catch (error) {
    if (error.response?.status !== 403) {
      console.error('加载部门失败:', error);
    }
    departmentList.value = [];
  }
};

const getUserName = (userId) => {
  const user = userList.value.find(item => item.id === userId);
  return user ? `${user.real_name} (${user.department || '无部门'})` : userId;
};

const getDepartmentName = (deptId) => {
  const dept = departmentList.value.find(item => item.id === deptId);
  return dept ? dept.name : deptId;
};

const removeUser = (userId) => {
  selectedUsers.value = selectedUsers.value.filter(id => id !== userId);
  emitChange();
};

const removeDepartment = (deptId) => {
  selectedDepartments.value = selectedDepartments.value.filter(id => id !== deptId);
  emitChange();
};

const handleUserChange = () => {
  emitChange();
};

const handleDepartmentChange = () => {
  emitChange();
};

const emitChange = () => {
  emit('update:modelValue', {
    users: selectedUsers.value,
    departments: selectedDepartments.value
  });
};

watch(() => props.modelValue, (newVal) => {
  selectedUsers.value = newVal?.users || [];
  selectedDepartments.value = newVal?.departments || [];
}, { immediate: true, deep: true });

onMounted(() => {
  loadUsers();
  loadDepartments();
});
</script>

<style scoped>
.user-selector {
  width: 100%;
}

.user-option {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-weight: bold;
  color: var(--color-text-primary);
}

.user-info {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.selected-list {
  margin-top: 10px;
  padding: 10px;
  background-color: var(--color-bg-hover);
  border-radius: var(--radius-sm);
  min-height: 40px;
}

.selected-tag {
  margin: 5px;
}

.stats {
  margin-top: 15px;
}
</style>
