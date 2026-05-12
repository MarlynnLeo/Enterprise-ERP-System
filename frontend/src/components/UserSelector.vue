<!--
/**
 * UserSelector.vue
 * @description 用户选择器组件，支持按用户和部门选择
 */
-->
<template>
  <div class="user-selector">
    <el-tabs v-model="activeTab">
      <!-- 按用户选择 -->
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
          style="width: 100%"
          @change="handleUserChange"
        >
          <el-option
            v-for="user in userList"
            :key="user.id"
            :label="`${user.real_name} (${user.username}) - ${user.department || '无部门'}`"
            :value="user.id"
          >
            <div class="user-option">
              <span class="user-name">{{ user.real_name }}</span>
              <span class="user-info">{{ user.department }} - {{ user.position }}</span>
            </div>
          </el-option>
        </el-select>

        <!-- 已选用户列表 -->
        <div v-if="selectedUsers.length > 0" class="selected-list">
          <el-tag
            v-for="userId in selectedUsers"
            :key="userId"
            closable
            @close="removeUser(userId)"
            style="margin: 5px"
          >
            {{ getUserName(userId) }}
          </el-tag>
        </div>
      </el-tab-pane>

      <!-- 按部门选择 -->
      <el-tab-pane label="选择部门" name="departments">
        <el-select
          v-model="selectedDepartments"
          multiple
          filterable
          placeholder="选择部门"
          style="width: 100%"
          @change="handleDepartmentChange"
        >
          <el-option
            v-for="dept in departmentList"
            :key="dept.id"
            :label="`${dept.name} (${dept.user_count || 0}人)`"
            :value="dept.id"
          />
        </el-select>

        <!-- 已选部门列表 -->
        <div v-if="selectedDepartments.length > 0" class="selected-list">
          <el-tag
            v-for="deptId in selectedDepartments"
            :key="deptId"
            closable
            type="success"
            @close="removeDepartment(deptId)"
            style="margin: 5px"
          >
            {{ getDepartmentName(deptId) }}
          </el-tag>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 统计信息 -->
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
import { api } from '@/services/api';
import { parseListData } from '@/utils/responseParser';

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

// 搜索用户
const searchUsers = async (query) => {
  if (!query) {
    await loadUsers();
    return;
  }
  loading.value = true;
  try {
    const res = await api.get('/api/system/users', {
      params: { keyword: query, pageSize: 50 }
    });
    // 使用统一解析器
    userList.value = parseListData(res, { enableLog: false });
  } catch (error) {
    // ✅ 优化: 如果是权限不足,静默处理
    if (error.response?.status === 403) {
      userList.value = [];
    } else {
      console.error('搜索用户失败:', error);
      userList.value = [];
    }
  } finally {
    loading.value = false;
  }
};

// 加载用户列表
const loadUsers = async () => {
  loading.value = true;
  try {
    const res = await api.get('/api/system/users', {
      params: { pageSize: 100 }
    });
    // 使用统一解析器
    userList.value = parseListData(res, { enableLog: false });
  } catch (error) {
    // ✅ 优化: 如果是权限不足,静默处理
    if (error.response?.status === 403) {
      userList.value = [];
    } else {
      console.error('加载用户失败:', error);
      userList.value = [];
    }
  } finally {
    loading.value = false;
  }
};

// 加载部门列表
const loadDepartments = async () => {
  try {
    const res = await api.get('/api/system/departments');
    // 拦截器已解包，res.data 就是业务数据
    departmentList.value = Array.isArray(res.data) ? res.data : (res.data?.list || []);
  } catch (error) {
    // ✅ 优化: 如果是权限不足,静默处理
    if (error.response?.status === 403) {
      departmentList.value = [];
    } else {
      console.error('加载部门失败:', error);
      departmentList.value = [];
    }
  }
};

// 获取用户名称
const getUserName = (userId) => {
  const user = userList.value.find(u => u.id === userId);
  return user ? `${user.real_name} (${user.department || '无部门'})` : userId;
};

// 获取部门名称
const getDepartmentName = (deptId) => {
  const dept = departmentList.value.find(d => d.id === deptId);
  return dept ? dept.name : deptId;
};

// 移除用户
const removeUser = (userId) => {
  selectedUsers.value = selectedUsers.value.filter(id => id !== userId);
};

// 移除部门
const removeDepartment = (deptId) => {
  selectedDepartments.value = selectedDepartments.value.filter(id => id !== deptId);
};

// 处理用户变更
const handleUserChange = () => {
  emitChange();
};

// 处理部门变更
const handleDepartmentChange = () => {
  emitChange();
};

// 发送变更事件
const emitChange = () => {
  emit('update:modelValue', {
    users: selectedUsers.value,
    departments: selectedDepartments.value
  });
};

// 监听外部值变化
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    selectedUsers.value = newVal.users || [];
    selectedDepartments.value = newVal.departments || [];
  }
}, { immediate: true, deep: true });

// 初始化
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
  color: #303133;
}

.user-info {
  font-size: 12px;
  color: #909399;
}

.selected-list {
  margin-top: 10px;
  padding: 10px;
  background-color: #f5f7fa;
  border-radius: 4px;
  min-height: 40px;
}

.stats {
  margin-top: 15px;
}
</style>

