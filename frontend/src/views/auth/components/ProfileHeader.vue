<template>
  <div class="profile-header-card">
    <div class="header-left">
      <el-icon class="header-icon"><User /></el-icon>
      <div class="header-text">
        <h1 class="page-title">个人中心</h1>
        <p class="page-subtitle">管理您的个人信息和偏好设置</p>
      </div>
    </div>
    <div class="header-right">
      <div class="motivation-section">
        <div class="motivation-icon-wrapper">
          <div class="motivation-icon">✨</div>
          <div class="icon-glow"></div>
        </div>
        <div class="motivation-text">
          <div class="motivation-title">
            <span class="highlight-name">{{ userName || '用户' }}</span>，今天是你在KACON的第<span class="highlight-days">{{ days }}</span>天
          </div>
          <div class="motivation-desc">{{ motivation }}</div>
        </div>
      </div>
    </div>
    <div class="header-decoration">
      <div class="decoration-circle circle-1"></div>
      <div class="decoration-circle circle-2"></div>
      <div class="decoration-circle circle-3"></div>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { User } from '@element-plus/icons-vue'
const _props = defineProps({
  userName: {
    type: String,
    default: ''
  },
  days: {
    type: [Number, String],
    default: 1
  }
})
// 每日一句
const motivations = [
  "每一天都是新的开始，保持热爱，奔赴山海。",
  "星光不问赶路人，时光不负有心人。",
  "不仅要低头拉车，更要抬头看路。",
  "优秀是一种习惯，坚持是最好的天赋。",
  "做最好的自己，其他的交给时间。",
  "工作效率的提升，源于对细节的极致追求。",
  "保持专注，保持激情，创造无限可能。",
  "今天也要元气满满哦！"
]
const motivation = computed(() => {
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24)
  return motivations[dayOfYear % motivations.length]
})
</script>
<style scoped>
.profile-header-card {
  position: relative;
  background: linear-gradient(120deg, var(--el-color-primary-light-9) 0%, var(--el-bg-color) 100%);
  border-radius: 16px;
  padding: 24px 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  border: 1px solid var(--el-border-color-lighter);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 2;
}
.header-icon {
  font-size: 32px;
  color: var(--el-color-primary);
  background: white;
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.2);
}
.header-text {
  display: flex;
  flex-direction: column;
}
.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}
.page-subtitle {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}
.header-right {
  z-index: 2;
}
.motivation-section {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.6);
  padding: 10px 20px;
  border-radius: 12px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  transition: all 0.3s ease;
}
/* 深色模式适配 */
html.dark .motivation-section {
  background: rgba(0, 0, 0, 0.2);
  border-color: rgba(255, 255, 255, 0.1);
}
.motivation-section:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.motivation-icon-wrapper {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.motivation-icon {
  font-size: 24px;
  z-index: 2;
}
.icon-glow {
  position: absolute;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.4) 0%, transparent 70%);
  animation: pulse 2s infinite;
}
.motivation-text {
  display: flex;
  flex-direction: column;
}
.motivation-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.highlight-name {
  color: var(--el-color-primary);
  font-size: 16px;
}
.highlight-days {
  color: var(--el-color-warning);
  font-size: 18px;
  font-weight: 800;
  margin: 0 4px;
  font-family: 'DIN Alternate', sans-serif;
}
.motivation-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.header-decoration {
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 1;
  pointer-events: none;
}
.decoration-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.1;
}
.circle-1 {
  width: 200px;
  height: 200px;
  background: var(--el-color-primary);
  top: -50px;
  right: -50px;
}
.circle-2 {
  width: 100px;
  height: 100px;
  background: var(--el-color-success);
  bottom: 20px;
  right: 200px;
}
.circle-3 {
  width: 50px;
  height: 50px;
  background: var(--el-color-warning);
  top: 40px;
  right: 300px;
}
@keyframes pulse {
  0% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.2); opacity: 0.3; }
  100% { transform: scale(1); opacity: 0.6; }
}
@media (max-width: 768px) {
  .profile-header-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
  }
  
  .header-right {
    width: 100%;
  }
  
  .motivation-section {
    width: 100%;
  }
}
</style>