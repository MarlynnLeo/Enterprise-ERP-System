<template>
  <el-card class="profile-card user-info-card" shadow="hover">
    <div class="user-header">
      <div class="avatar-wrapper">
        <DecorativeAvatarFrame
          :frame="activeAvatarFrame"
          :avatar="avatar"
          :name="name"
          :size="150"
          :avatar-size="100"
          @avatar-error="handleError"
        />

        <el-upload
          v-if="isEditing"
          class="avatar-uploader"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="handleChange"
          :before-upload="beforeUpload"
        >
          <el-button size="small" type="primary" circle>
            <el-icon><Edit /></el-icon>
          </el-button>
        </el-upload>
      </div>
      <h2 class="user-name">{{ name }}</h2>
      <span class="user-role">{{ role }}</span>
    </div>

    <div class="user-stats">
      <div class="stat-item" v-for="(stat, index) in stats" :key="index" :style="{ animationDelay: `${index * 0.1}s` }">
        <div class="stat-icon-wrapper" :class="`stat-icon-${index + 1}`">
          <el-icon class="stat-icon">
            <component :is="stat.icon" />
          </el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ stat.value }}</div>
          <div class="stat-label">{{ stat.label }}</div>
        </div>
      </div>
    </div>

    <div class="online-time-display">
      <div class="time-item">
        <el-icon><Clock /></el-icon>
        <span class="time-label">今日在线:</span>
        <span class="time-value">{{ todayOnline }}</span>
      </div>
      <div class="time-item">
        <el-icon><Timer /></el-icon>
        <span class="time-label">累计在线:</span>
        <span class="time-value">{{ totalOnline }}</span>
      </div>
    </div>

    <div class="last-login">
      <el-icon><Timer /></el-icon>
      <span>上次登录: {{ lastLogin }}</span>
    </div>
  </el-card>
</template>
<script setup>
import { Edit, Clock, Timer } from '@element-plus/icons-vue'
import { computed } from 'vue'
import { DEFAULT_AVATAR_FRAME, getAvatarFrameConfig } from '@/utils/avatarFrames'
import DecorativeAvatarFrame from './DecorativeAvatarFrame.vue'
const props = defineProps({
  name: String,
  role: String,
  avatar: String,
  avatarFrame: {
    type: String,
    default: 'frame1'
  },
  avatarFrameConfig: {
    type: Object,
    default: null
  },
  isEditing: Boolean,
  stats: {
    type: Array,
    default: () => []
  },
  todayOnline: String,
  totalOnline: String,
  lastLogin: String
})
const activeAvatarFrame = computed(() => {
  if (props.avatarFrameConfig) {
    return props.avatarFrameConfig
  }

  if (props.avatarFrame === 'none') {
    return { id: 'none', name: '无特效', variant: 'none' }
  }

  return getAvatarFrameConfig(props.avatarFrame, DEFAULT_AVATAR_FRAME)
})
const emit = defineEmits(['update:avatar', 'avatar-error'])
const handleChange = (file) => {
  emit('update:avatar', file)
}
const beforeUpload = (_file) => {
  return false // 阻止自动上传
}
const handleError = () => {
  emit('avatar-error')
}
</script>
<style scoped>
.user-info-card {
  text-align: center;
  width: 100%;
  border-radius: var(--radius-md);
  overflow: visible;
  height: 100%;
  border: 1px solid var(--color-border-lighter);
  box-shadow: var(--shadow-sm);
}

.user-info-card :deep(.el-card__body) {
  padding: 24px 20px;
}

.user-header {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
  padding: 8px 0 18px;
  border-bottom: 1px solid var(--color-border-lighter);
}
.avatar-wrapper {
  position: relative;
  margin-bottom: 15px;
  width: 150px;
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-uploader {
  position: absolute;
  bottom: 6px;
  right: 6px;
  z-index: 20;
  border-radius: 50%;
}
.user-name {
  margin: 10px 0 5px;
  max-width: 100%;
  overflow: hidden;
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-role {
  font-size: 14px;
  color: var(--color-primary);
  background: var(--color-primary-light-9);
  padding: 5px 12px;
  border-radius: 20px;
  font-weight: 700;
}
.user-stats {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 18px 0;
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid var(--color-border-lighter);
  background: var(--color-bg-hover);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-base), background-color var(--transition-base);
}
.stat-item:hover {
  border-color: var(--color-primary-light-6);
  background: var(--color-bg-base);
}
.stat-icon-wrapper {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stat-icon {
  font-size: 20px;
  color: currentColor;
}
.stat-icon-1 {
  color: var(--color-on-primary);
  background: var(--color-primary);
}
.stat-icon-2 {
  color: var(--color-on-primary);
  background: var(--color-success);
}
.stat-icon-3 {
  color: var(--color-on-primary);
  background: var(--color-warning);
}
.stat-content {
  flex: 1;
  text-align: left;
  min-width: 0;
}
.stat-value {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1.2;
}
.stat-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.online-time-display {
  margin: 20px 0;
  padding: 14px;
  background: var(--color-bg-hover);
  border: 1px solid var(--color-border-lighter);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
}
.time-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px solid var(--color-border-lighter);
}
.time-item:last-child {
  border-bottom: none;
}
.time-label {
  flex: 1;
  text-align: left;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.time-value {
  color: var(--color-primary);
  font-weight: 800;
  font-family: monospace;
  font-size: 15px;
  white-space: nowrap;
}
.last-login {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-hover);
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 10px;
}

@media (max-width: 768px) {
  .user-info-card :deep(.el-card__body) {
    padding: 20px 16px;
  }
}
</style>
