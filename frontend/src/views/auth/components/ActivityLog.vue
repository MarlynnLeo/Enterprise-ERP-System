<template>
  <el-card class="glass-card activity-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <el-icon class="header-icon" color="#909399"><Clock /></el-icon>
          <span class="header-title">活动记录</span>
        </div>
        <el-button type="primary" size="small" @click="exportActivities">
          <el-icon><Download /></el-icon> 导出
        </el-button>
      </div>
    </template>

    <div class="activity-filters">
      <el-select v-model="filterType" placeholder="筛选类型" @change="handleFilterChange">
        <el-option label="📋 全部" value="all" />
        <el-option label="👤 登录" value="login" />
        <el-option label="⚙️ 系统" value="system" />
        <el-option label="📝 资料" value="profile" />
        <el-option label="✅ 任务" value="task" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"

        @change="handleFilterChange"
      />
    </div>

    <el-timeline class="activity-timeline">
      <el-timeline-item
        v-for="(activity, index) in filteredActivities"
        :key="index"
        :timestamp="activity.timestamp"
        :color="getActivityColor(activity.category)"
        placement="top"
      >
        <el-card class="activity-item-card" shadow="hover">
          <div class="activity-content">
            <el-icon class="activity-icon" :color="getActivityColor(activity.category)">
              <component :is="getActivityIconComponent(activity.category)" />
            </el-icon>
            <div class="activity-text">
              <div class="activity-title">{{ activity.content }}</div>
              <div class="activity-category">{{ getActivityCategoryName(activity.category) }}</div>
            </div>
          </div>
        </el-card>
      </el-timeline-item>
    </el-timeline>
    
    <div class="load-more" v-if="hasMore">
      <el-button type="primary" text @click="loadMore">
        <el-icon><More /></el-icon> 加载更多活动
      </el-button>
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { 
  Clock, Download, More 
} from '@element-plus/icons-vue'

const props = defineProps({
  activities: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['export', 'load-more'])

const filterType = ref('all')
const dateRange = ref([])
const hasMore = ref(true)

const filteredActivities = computed(() => {
  let result = props.activities
  
  if (filterType.value !== 'all') {
    result = result.filter(a => a.category === filterType.value)
  }
  
  if (dateRange.value && dateRange.value.length === 2) {
    const start = new Date(dateRange.value[0]).getTime()
    const end = new Date(dateRange.value[1]).getTime() + 86400000 // 包含结束当天
    result = result.filter(a => {
      const time = new Date(a.timestamp).getTime()
      return time >= start && time < end
    })
  }
  
  return result
})

const handleFilterChange = () => {
  // 可以在这里触发后端筛选，目前是纯前端筛选
}

const loadMore = () => {
  emit('load-more')
}

const exportActivities = () => {
  emit('export')
}

const getActivityColor = (category) => {
  const map = {
    login: '#409EFF',
    system: '#E6A23C',
    profile: '#67C23A',
    task: '#F56C6C'
  }
  return map[category] || '#909399'
}

const getActivityIconComponent = (category) => {
  const map = {
    login: 'User',
    system: 'Setting',
    profile: 'Edit',
    task: 'CircleCheck'
  }
  return map[category] || 'InfoFilled'
}

const getActivityCategoryName = (category) => {
  const map = {
    login: '登录活动',
    system: '系统通知',
    profile: '资料更新',
    task: '任务操作'
  }
  return map[category] || '其他活动'
}
</script>

<style scoped>
.glass-card {
  border-radius: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-size: 20px;
  background: var(--el-fill-color-light);
  padding: 8px;
  border-radius: 8px;
  box-sizing: content-box;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.activity-filters {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.activity-timeline {
  padding-left: 2px;
}

.activity-item-card {
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
}

.activity-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.activity-icon {
  font-size: 24px;
  background: var(--el-fill-color-lighter);
  padding: 8px;
  border-radius: 50%;
  box-sizing: content-box;
}

.activity-text {
  flex: 1;
}

.activity-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.activity-category {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.load-more {
  text-align: center;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
