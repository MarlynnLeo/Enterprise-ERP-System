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
          <el-icon class="motivation-icon"><Trophy /></el-icon>
        </div>
        <div class="motivation-text">
          <div class="motivation-title">
            <span class="highlight-name">{{ userName || '用户' }}</span>，今天是你在KACON的第<span class="highlight-days">{{ days }}</span>天
          </div>
          <div class="motivation-desc">{{ motivation }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { Trophy, User } from '@element-plus/icons-vue'
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
  background: var(--el-bg-color);
  border-radius: 12px;
  padding: 24px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 color-mix(in srgb, var(--ds-black) 5%, transparent);
  border: 1px solid var(--el-border-color-lighter);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 2;
}
.header-icon {
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--el-color-white);
  background: var(--el-color-primary);
  border-radius: 50%;
}
.header-text {
  display: flex;
  flex-direction: column;
}
.page-title {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
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
  background: var(--el-fill-color-extra-light);
  padding: 12px 18px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  transition: border-color 0.2s ease, background-color 0.2s ease;
}
/* 深色模式适配 */
:global(html.dark[data-theme="dark"]) .motivation-section {
  background: color-mix(in srgb, var(--color-text-primary) 20%, transparent);
  border-color: color-mix(in srgb, var(--el-color-white) 10%, transparent);
}
.motivation-section:hover {
  border-color: var(--el-color-primary-light-6);
  background: var(--el-bg-color);
}
.motivation-icon-wrapper {
  position: relative;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 42px;
  border-radius: 50%;
  color: var(--el-color-white);
  background: var(--el-color-warning);
}
.motivation-icon {
  font-size: 22px;
}
.motivation-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.motivation-title {
  font-size: 14px;
  font-weight: 700;
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
  max-width: 440px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
@media (max-width: 768px) {
  .profile-header-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    padding: 18px;
  }

  .header-right {
    width: 100%;
  }

  .motivation-section {
    width: 100%;
    box-sizing: border-box;
    align-items: flex-start;
  }

  .page-title {
    font-size: 22px;
  }

  .motivation-desc {
    white-space: normal;
  }
}
</style>
