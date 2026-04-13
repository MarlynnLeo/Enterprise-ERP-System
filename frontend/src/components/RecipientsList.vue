<!--
/**
 * RecipientsList.vue
 * @description 抄送人员列表组件，显示已读/未读状态
 */
-->
<template>
  <div class="recipients-list">
    <div class="header">
      <h3>抄送人员 ({{ stats.total }})</h3>
      <div class="stats-bar">
        <el-tag type="success">已读: {{ stats.read }}</el-tag>
        <el-tag type="warning">未读: {{ stats.unread }}</el-tag>
        <el-progress
          :percentage="readPercentage"
          :color="progressColor"
          style="width: 200px; margin-left: 10px;"
        />
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <!-- 用户列表 -->
      <el-tab-pane label="用户" name="users">
        <el-table :data="recipients" style="width: 100%" max-height="400">
          <el-table-column prop="real_name" label="姓名" width="120" />
          <el-table-column prop="username" label="用户名" width="120" />
          <el-table-column prop="department" label="部门" width="150" />
          <el-table-column prop="position" label="职位" width="120" />
          <el-table-column label="类型" width="80">
            <template #default="{ row }">
              <el-tag :type="row.recipient_type === 'to' ? 'primary' : 'info'" size="small">
                {{ row.recipient_type === 'to' ? '主送' : '抄送' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.is_read ? 'success' : 'warning'" size="small">
                {{ row.is_read ? '已读' : '未读' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="阅读时间" width="180">
            <template #default="{ row }">
              {{ row.read_at ? formatDate(row.read_at) : '-' }}
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 部门列表 -->
      <el-tab-pane label="部门" name="departments">
        <el-table :data="departments" style="width: 100%">
          <el-table-column prop="department_name" label="部门名称" />
          <el-table-column label="人数" width="100">
            <template #default="{ row }">
              {{ getDepartmentUserCount(row.department_id) }}
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import technicalCommunicationApi from '@/services/technicalCommunicationApi';
import { ElMessage } from 'element-plus';
import { formatDate } from '@/utils/helpers/dateUtils'

const props = defineProps({
  communicationId: {
    type: Number,
    required: true
  }
});

const activeTab = ref('users');
const recipients = ref([]);
const departments = ref([]);
const stats = ref({
  total: 0,
  read: 0,
  unread: 0
});

// 计算已读百分比
const readPercentage = computed(() => {
  if (stats.value.total === 0) return 0;
  return Math.round((stats.value.read / stats.value.total) * 100);
});

// 进度条颜色
const progressColor = computed(() => {
  const percentage = readPercentage.value;
  if (percentage < 30) return '#f56c6c';
  if (percentage < 70) return '#e6a23c';
  return '#67c23a';
});

// 格式化日期
// formatDate 已统一引用公共实现;

// 获取部门人数
const getDepartmentUserCount = (deptId) => {
  return recipients.value.filter(r => r.department_id === deptId).length;
};

// 加载抄送人员
const loadRecipients = async () => {
  try {
    const res = await technicalCommunicationApi.getRecipients(props.communicationId);
    if (res.data.code === 200) {
      recipients.value = res.data.data.recipients || [];
      departments.value = res.data.data.departments || [];
      stats.value = res.data.data.stats || { total: 0, read: 0, unread: 0 };
    }
  } catch (error) {
    console.error('加载抄送人员失败:', error);
    ElMessage.error('加载抄送人员失败');
  }
};

// 监听通讯ID变化
watch(() => props.communicationId, (newId) => {
  if (newId) {
    loadRecipients();
  }
}, { immediate: true });

// 暴露刷新方法
defineExpose({
  refresh: loadRecipients
});
</script>

<style scoped>
.recipients-list {
  padding: 10px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h3 {
  margin: 0;
  color: #303133;
}

.stats-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>

