<!--
/**
 * PersonalInfoCard.vue
 * @description 仪表盘个人信息与天气整合卡片组件
 */
-->
<template>
  <div class="combined-info-card">
    <div v-if="loading" class="loading-section">
      <el-skeleton animated class="w-full">
        <template #template>
          <div class="flex-row gap-20">
            <div class="flex-1">
              <el-skeleton-item variant="text" class="skel-line skel-w-60" />
              <el-skeleton-item variant="text" class="skel-line skel-w-80" />
            </div>
            <el-skeleton-item variant="circle" class="skel-avatar" />
            <div class="flex-1">
              <el-skeleton-item variant="text" class="skel-line skel-w-60" />
              <el-skeleton-item variant="text" class="skel-line skel-w-80" />
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
      <!-- 中间：头像特效（与个人中心同源） -->
      <div class="center-avatar">
        <DecorativeAvatarFrame
          :frame="avatarFrameConfig"
          :avatar="userProfile?.avatar || ''"
          :name="userProfile?.real_name || userProfile?.username || ''"
          :size="64"
          class="dash-avatar-frame"
        />
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
import { computed } from 'vue'
import DecorativeAvatarFrame from '@/views/auth/components/DecorativeAvatarFrame.vue'
import { getAvatarFrameConfig } from '@/utils/avatarFrames'

const props = defineProps({
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

const avatarFrameConfig = computed(() =>
  getAvatarFrameConfig(props.userProfile?.avatar_frame || props.userProfile?.avatarFrame)
)
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
  overflow: visible;
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
/* 中间头像特效 */
.center-avatar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 100%;
  align-self: center;
  z-index: 2;
  overflow: visible;
}
.dash-avatar-frame {
  flex-shrink: 0;
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
