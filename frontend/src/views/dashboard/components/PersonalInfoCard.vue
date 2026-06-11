<!--
/**
 * PersonalInfoCard.vue
 * @description 仪表盘个人信息与天气整合卡片组件
 */
-->
<template>
  <div class="combined-info-card">
    <div v-if="loading" class="loading-section">
      <el-skeleton animated style="width: 100%">
        <template #template>
          <div style="display: flex; gap: 20px; align-items: center;">
            <div style="flex: 1;">
              <el-skeleton-item variant="text" style="width: 60%; margin-bottom: 8px;" />
              <el-skeleton-item variant="text" style="width: 80%;" />
            </div>
            <el-skeleton-item variant="circle" style="width: 60px; height: 60px;" />
            <div style="flex: 1;">
              <el-skeleton-item variant="text" style="width: 60%; margin-bottom: 8px;" />
              <el-skeleton-item variant="text" style="width: 80%;" />
            </div>
          </div>
        </template>
      </el-skeleton>
    </div>
    <div v-else class="combined-content">
      <!-- 左侧：个人信息 -->
      <div class="left-info">
        <div class="name">{{ userProfile?.real_name || $t('page.profile.realName') }}</div>
        <div class="role-item">
          <el-icon><Avatar /></el-icon>
          <span>{{ userProfile?.role_name || userProfile?.role || $t('page.profile.role') }}</span>
        </div>
        <div class="role-item">
          <el-icon><Location /></el-icon>
          <span>{{ userProfile?.department_name || '未设置' }}</span>
        </div>
      </div>
      <!-- 中间：头像 -->
      <div class="center-avatar">
        <div class="avatar-container">
          <div class="avatar-glow"></div>
          <div class="avatar-particles">
            <span class="particle" v-for="i in 8" :key="i" :style="`--i: ${i}`"></span>
          </div>
          <img :src="userProfile?.avatar || '/default-avatar.webp'" class="avatar" />
        </div>
      </div>
      <!-- 右侧：天气信息 -->
      <div class="right-weather">
        <div class="weather-header-compact">
          <el-icon><LocationFilled /></el-icon>
          <span>{{ weather.city }}</span>
          <span class="weather-time">{{ weather.updateTime }}</span>
        </div>
        <div class="weather-main-compact">
          <div class="temp-large">{{ weather.temperature }}°C</div>
          <div class="weather-icon-compact">
            <el-icon v-if="weather.weatherCode === 'sunny'" class="weather-icon weather-icon-sunny">
              <Sunny />
            </el-icon>
            <el-icon v-else-if="weather.weatherCode === 'partly-cloudy'" class="weather-icon weather-icon-partly-cloudy">
              <PartlyCloudy />
            </el-icon>
            <el-icon v-else-if="weather.weatherCode === 'cloudy'" class="weather-icon weather-icon-cloudy">
              <Cloudy />
            </el-icon>
            <el-icon v-else-if="weather.weatherCode === 'rainy'" class="weather-icon weather-icon-rainy">
              <Cloudy />
            </el-icon>
            <el-icon v-else class="weather-icon weather-icon-cloudy">
              <Cloudy />
            </el-icon>
          </div>
        </div>
        <div class="weather-desc-compact">{{ weather.description }}</div>
        <div class="weather-details-compact">
          <span><el-icon class="weather-detail-icon"><WindPower /></el-icon> {{ weather.windSpeed }}km/h</span>
          <span><el-icon class="weather-detail-icon"><Drizzling /></el-icon> {{ weather.humidity }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  Avatar,
  Drizzling,
  Location,
  LocationFilled,
  Sunny,
  Cloudy,
  PartlyCloudy,
  WindPower
} from '@element-plus/icons-vue'

defineProps({
  userProfile: {
    type: Object,
    default: null
  },
  weather: {
    type: Object,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
/* 整合的个人信息与天气卡片 - 统一卡片风格 */
.combined-info-card {
  background: var(--theme-feature-card-bg);
  border-radius: 10px;
  padding: 15px;
  box-shadow: var(--theme-feature-card-shadow);
  margin-bottom: var(--spacing-lg);
  height: 90px;
  position: relative;
  overflow: hidden;
  transition: border-color var(--transition-base) ease, box-shadow var(--transition-base) ease, background-color var(--transition-base) ease;
  border: 1px solid var(--theme-feature-card-border);
}
.combined-info-card::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -50%;
  width: 200%;
  height: 200%;
  background: var(--theme-feature-card-decor);
  animation: rotate 20s linear infinite;
}
@keyframes rotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
.combined-info-card:hover {
  transform: none;
  box-shadow: var(--theme-feature-card-hover-shadow);
  border-color: var(--theme-feature-card-border);
}
.loading-section {
  height: 100%;
  display: flex;
  align-items: center;
}
.combined-content {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  color: var(--theme-feature-card-color);
}
/* 左侧个人信息 */
.left-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  justify-content: center;
}
.left-info .name {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.left-info .role-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  opacity: 0.9;
}
.left-info .role-item .el-icon {
  font-size: 12px;
}
.left-info .role-item span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 中间头像 */
.center-avatar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 100%;
  align-self: center;
}
.center-avatar .avatar-container {
  position: relative;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.center-avatar .avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid color-mix(in srgb, var(--ds-white) 50%, transparent);
  box-shadow: 0 0 15px color-mix(in srgb, var(--ds-white) 30%, transparent);
  z-index: 2;
  transition: background-color var(--transition-base) ease, border-color var(--transition-base) ease, color var(--transition-base) ease, box-shadow var(--transition-base) ease, opacity var(--transition-base) ease, transform var(--transition-base) ease;
}
.center-avatar .avatar:hover {
  border-color: color-mix(in srgb, var(--ds-white) 80%, transparent);
  box-shadow: 0 0 20px color-mix(in srgb, var(--ds-white) 50%, transparent);
}
/* 右侧天气信息 */
.right-weather {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  justify-content: center;
  text-align: right;
  padding-left: 15px;
}
.weather-header-compact {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  font-size: 13px;
  opacity: 0.95;
}
.weather-time {
  font-size: 10px;
  opacity: 0.8;
}
.weather-main-compact {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.temp-large {
  font-size: 20px;
  font-weight: bold;
  line-height: 1;
}
.weather-icon-compact {
  display: flex;
  align-items: center;
}
.weather-icon {
  font-size: 28px;
}
.weather-icon-sunny {
  color: var(--ds-yellow-strong);
}
.weather-icon-partly-cloudy {
  color: var(--ds-yellow-bg);
}
.weather-icon-cloudy {
  color: var(--color-border-lighter);
}
.weather-icon-rainy {
  color: var(--ds-blue-strong);
}
.weather-desc-compact {
  font-size: 12px;
  opacity: 0.9;
  font-weight: 500;
}
.weather-details-compact {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  font-size: 11px;
  opacity: 0.85;
}
.weather-detail-icon {
  font-size: 12px;
}
/* 头像光环效果 */
.avatar-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--ds-blue) 30%, transparent) 0%, transparent 70%);
  animation: glowPulse 3s ease-in-out infinite;
  z-index: 0;
}
@keyframes glowPulse {
  0%, 100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.5;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 0.8;
  }
}
/* 粒子容器 */
.avatar-particles {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 80px;
  height: 80px;
  transform: translate(-50%, -50%);
  z-index: 0;
}
/* 粒子特效 */
.particle {
  --i: 0;
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: linear-gradient(45deg, var(--ds-blue), var(--ds-cyan-strong));
  box-shadow: 0 0 6px color-mix(in srgb, var(--ds-blue) 80%, transparent);
  top: 50%;
  left: 50%;
  animation: particleOrbit 4s linear infinite;
  animation-delay: calc(var(--i) * -0.5s);
  opacity: 0;
}
@keyframes particleOrbit {
  0% {
    transform: translate(-50%, -50%) rotate(calc(var(--i) * 45deg)) translateX(40px) scale(0);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) rotate(calc(var(--i) * 45deg + 360deg)) translateX(40px) scale(1);
    opacity: 0;
  }
}
/* 响应式媒体查询 */
@media (max-width: 768px) {
  .combined-info-card {
    height: auto;
    padding: 15px;
  }
  .combined-content {
    flex-direction: column;
    gap: 15px;
    text-align: center;
  }
  .left-info,
  .right-weather {
    width: 100%;
  }
  .center-avatar {
    order: -1;
  }
  .weather-header-compact {
    justify-content: center;
  }
  .weather-main-compact {
    justify-content: center;
  }
  .weather-details-compact {
    justify-content: center;
  }
}
</style>
