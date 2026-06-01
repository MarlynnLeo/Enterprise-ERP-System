<!--
/**
 * RecipientsList.vue
 * @description 鎶勯€佷汉鍛樺垪琛ㄧ粍浠讹紝鏄剧ず宸茶/鏈鐘舵€?
 */
-->
<template>
  <div class="recipients-list">
    <div class="header">
      <h3>鎶勯€佷汉鍛?({{ stats.total }})</h3>
      <div class="stats-bar">
        <el-tag type="success">宸茶: {{ stats.read }}</el-tag>
        <el-tag type="warning">鏈: {{ stats.unread }}</el-tag>
        <el-progress
          :percentage="readPercentage"
          :color="progressColor"
          class="read-progress"
        />
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <!-- 鐢ㄦ埛鍒楄〃 -->
      <el-tab-pane label="鐢ㄦ埛" name="users">
        <el-table :data="recipients" class="full-width-table" max-height="400">
          <el-table-column prop="real_name" label="濮撳悕" width="120" />
          <el-table-column prop="username" label="鐢ㄦ埛鍚?" width="120" />
          <el-table-column prop="department" label="閮ㄩ棬" width="150" />
          <el-table-column prop="position" label="鑱屼綅" width="120" />
          <el-table-column label="绫诲瀷" width="80">
            <template #default="{ row }">
              <el-tag :type="row.recipient_type === 'to' ? 'primary' : 'info'" size="small">
                {{ row.recipient_type === 'to' ? '涓婚€?' : '鎶勯€?' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="鐘舵€?" width="100">
            <template #default="{ row }">
              <el-tag :type="row.is_read ? 'success' : 'warning'" size="small">
                {{ row.is_read ? '宸茶' : '鏈' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="闃呰鏃堕棿" width="180">
            <template #default="{ row }">
              {{ row.read_at ? formatDate(row.read_at) : '-' }}
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 閮ㄩ棬鍒楄〃 -->
      <el-tab-pane label="閮ㄩ棬" name="departments">
        <el-table :data="departments" class="full-width-table">
          <el-table-column prop="department_name" label="閮ㄩ棬鍚嶇О" />
          <el-table-column label="浜烘暟" width="100">
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
import technicalCommunicationApi from '@/api/technicalCommunication';
import { ElMessage } from 'element-plus';
import { formatDate } from '@/utils/helpers/dateUtils'
import { parseDataObject } from '@/utils/responseParser'

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

// 璁＄畻宸茶鐧惧垎姣?
const readPercentage = computed(() => {
  if (stats.value.total === 0) return 0;
  return Math.round((stats.value.read / stats.value.total) * 100);
});

// 杩涘害鏉￠鑹?
const progressColor = computed(() => {
  const percentage = readPercentage.value;
  if (percentage < 30) return 'var(--color-danger)';
  if (percentage < 70) return 'var(--color-warning)';
  return 'var(--color-success)';
});

// 鏍煎紡鍖栨棩鏈?
// formatDate 宸茬粺涓€寮曠敤鍏叡瀹炵幇;

// 鑾峰彇閮ㄩ棬浜烘暟
const getDepartmentUserCount = (deptId) => {
  return recipients.value.filter(r => r.department_id === deptId).length;
};

// 鍔犺浇鎶勯€佷汉鍛?
const loadRecipients = async () => {
  try {
    const res = await technicalCommunicationApi.getRecipients(props.communicationId);
    const data = parseDataObject(res, { enableLog: false }) || {};
    recipients.value = data.recipients || [];
    departments.value = data.departments || [];
    stats.value = data.stats || { total: 0, read: 0, unread: 0 };
  } catch (error) {
    console.error('鍔犺浇鎶勯€佷汉鍛樺け璐?', error);
    ElMessage.error('鍔犺浇鎶勯€佷汉鍛樺け璐?');
  }
};

// 鐩戝惉閫氳ID鍙樺寲
watch(() => props.communicationId, (newId) => {
  if (newId) {
    loadRecipients();
  }
}, { immediate: true });

// 鏆撮湶鍒锋柊鏂规硶
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
  color: var(--color-text-primary);
}

.stats-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.read-progress {
  width: 200px;
  margin-left: 10px;
}
</style>
