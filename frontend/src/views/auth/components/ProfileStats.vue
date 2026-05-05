<template>
  <el-card class="glass-card user-info-card" shadow="hover">
    <div class="user-header">
      <div class="avatar-wrapper">
        <!-- 动态特效容器 -->
        <div class="avatar-frame-container" style="position: relative; width: 140px; height: 140px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 2;">
            <Vue3Lottie 
              v-if="lottieData" 
              :animationData="lottieData" 
              :height="125" 
              :width="125" 
            />
          </div>
          <!-- 头像本体 -->
          <el-avatar
            :size="100"
            :src="avatar || '/default-avatar.webp'"
            class="user-avatar"
            style="position: relative; z-index: 1;"
            @error="handleError"
          >
            {{ name ? name[0].toUpperCase() : 'U' }}
          </el-avatar>
        </div>
        
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
import { getLottieAnimation } from '../../../assets/lottie'
const props = defineProps({
  name: String,
  role: String,
  avatar: String,
  avatarFrame: {
    type: String,
    default: 'frame1'
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
const lottieData = computed(() => getLottieAnimation(props.avatarFrame))
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
  border-radius: 16px;
  overflow: visible;
  height: 100%;
}
.user-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 25px;
}
.avatar-wrapper {
  position: relative;
  margin-bottom: 15px;
  width: 140px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.user-avatar {
  border: 4px solid var(--el-bg-color);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  background: var(--el-fill-color);
  font-size: 32px;
  color: var(--el-text-color-secondary);
}
.avatar-uploader {
  position: absolute;
  bottom: 0;
  right: 0;
  z-index: 10;
}
.user-name {
  margin: 10px 0 5px;
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.user-role {
  font-size: 14px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  padding: 4px 12px;
  border-radius: 20px;
  font-weight: 500;
}
.user-stats {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin: 25px 0;
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 12px 15px;
  background: var(--el-fill-color-light);
  border-radius: 12px;
  transition: all 0.3s ease;
}
.stat-item:hover {
  transform: translateX(5px);
  background: var(--el-fill-color);
}
.stat-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stat-icon {
  font-size: 20px;
  color: var(--color-on-primary, #fff);
}
.stat-icon-1 {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 4px 10px rgba(102, 126, 234, 0.3);
}
.stat-icon-2 {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  box-shadow: 0 4px 10px rgba(240, 147, 251, 0.3);
}
.stat-icon-3 {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  box-shadow: 0 4px 10px rgba(79, 172, 254, 0.3);
}
.stat-content {
  flex: 1;
  text-align: left;
}
.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}
.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.online-time-display {
  margin: 20px 0;
  padding: 15px;
  background: linear-gradient(135deg, var(--el-color-primary) 0%, var(--el-color-primary-light-3) 100%);
  border-radius: 12px;
  box-shadow: 0 8px 16px rgba(64, 158, 255, 0.2);
  color: var(--color-on-primary, #fff);
}
.time-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.time-item:last-child {
  border-bottom: none;
}
.time-label {
  flex: 1;
  text-align: left;
  margin-left: 8px;
  font-size: 13px;
  opacity: 0.9;
}
.time-value {
  font-weight: 700;
  font-family: monospace;
  font-size: 15px;
}
.last-login {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 10px;
}
</style>