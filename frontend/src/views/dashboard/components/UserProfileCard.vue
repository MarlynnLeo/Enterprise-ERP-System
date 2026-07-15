<!--
/**
 * UserProfileCard.vue
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
