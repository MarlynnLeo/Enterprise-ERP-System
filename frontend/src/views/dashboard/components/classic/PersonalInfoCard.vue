<!--
/**
 * PersonalInfoCard.vue
 * @description 经典主题仪表盘：个人信息与天气整合卡片
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
        <div class="user-greeting">
          <span class="user-name" :title="userProfile?.realName || userProfile?.username">
            {{ userProfile?.realName || userProfile?.username || $t('page.profile.realName') }}
          </span>
          <span class="online-status-dot" title="在线"></span>
        </div>
        <div class="user-tags">
          <span class="role-badge">
            <el-icon><Avatar /></el-icon>
            <span>{{ userProfile?.roleName || userProfile?.role || '系统用户' }}</span>
          </span>
          <span class="dept-badge" v-if="userProfile?.departmentName">
            <el-icon><Location /></el-icon>
            <span>{{ userProfile.departmentName }}</span>
          </span>
        </div>
      </div>

      <!-- 中间：头像 -->
      <div class="center-avatar">
        <DecorativeAvatarFrame
          :frame="avatarFrameConfig"
          :avatar="userProfile?.avatar || ''"
          :name="userProfile?.realName || userProfile?.username || ''"
          :size="44"
          class="dash-avatar-frame"
        />
      </div>

      <!-- 右侧：天气信息 -->
      <div class="right-weather">
        <div class="weather-top-row">
          <span class="weather-city">
            <el-icon class="loc-icon"><LocationFilled /></el-icon>
            {{ weather.city || '本地' }}
          </span>
          <span class="weather-condition">{{ weather.description || '晴' }}</span>
        </div>
        <div class="weather-main-row">
          <div class="weather-icon-wrapper">
            <el-icon v-if="weather.weatherCode === 'sunny'" class="weather-icon weather-icon-sunny">
              <Sunny />
            </el-icon>
            <el-icon v-else-if="weather.weatherCode === 'partly-cloudy'" class="weather-icon weather-icon-partly-cloudy">
              <PartlyCloudy />
            </el-icon>
            <el-icon v-else-if="weather.weatherCode === 'rainy'" class="weather-icon weather-icon-rainy">
              <Cloudy />
            </el-icon>
            <el-icon v-else class="weather-icon weather-icon-cloudy">
              <Cloudy />
            </el-icon>
          </div>
          <span class="temp-large">{{ weather.temperature ?? '--' }}°</span>
          <div class="weather-details-pill">
            <span class="detail-item" title="风速">
              <el-icon><WindPower /></el-icon>{{ weather.windSpeed || '0' }}km/h
            </span>
            <span class="detail-item" title="湿度">
              <el-icon><Drizzling /></el-icon>{{ weather.humidity || '0' }}%
            </span>
          </div>
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
  getAvatarFrameConfig(props.userProfile?.avatarFrame)
)
</script>

<style scoped>
.combined-info-card {
  container-type: inline-size;
  container-name: personal-info;
  background: var(--color-bg-base);
  border-radius: 8px;
  padding: 10px 14px;
  box-sizing: border-box;
  margin-bottom: 0;
  min-height: 82px;
  height: 82px;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--color-border-base);
  border-radius: 4px;
  box-shadow: none;
  transition: all var(--transition-base) ease;
}

.combined-info-card:hover {
  border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border-base));
  box-shadow: none;
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
  gap: 12px;
}

/* 左侧：个人信息 */
.left-info {
  flex: 1 1 35%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  min-width: 0;
}

.user-greeting {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.user-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

.online-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-success);
  flex-shrink: 0;
  box-shadow: none;
}

.user-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.role-badge,
.dept-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 110px;
}

.role-badge {
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-base));
  color: var(--color-primary);
  border: 1px solid color-mix(in srgb, var(--color-primary) 15%, transparent);
}

.dept-badge {
  background: var(--color-bg-section);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border-light);
}

/* 中间：头像 */
.center-avatar {
  flex: 0 0 46px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dash-avatar-frame {
  flex-shrink: 0;
}

/* 右侧：天气 */
.right-weather {
  flex: 1 1 45%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  gap: 4px;
  min-width: 0;
  text-align: right;
}

.weather-top-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.weather-city {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 600;
  color: var(--color-text-regular);
}

.loc-icon {
  font-size: 12px;
  color: var(--color-primary);
}

.weather-condition {
  padding: 0 4px;
  background: var(--color-bg-section);
  border-radius: 3px;
  font-size: 10px;
}

.weather-main-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.weather-icon-wrapper {
  display: flex;
  align-items: center;
}

.weather-icon {
  font-size: 20px;
}

.weather-icon-sunny { color: #F59E0B; }
.weather-icon-partly-cloudy { color: #FBBF24; }
.weather-icon-cloudy { color: #94A3B8; }
.weather-icon-rainy { color: #3B82F6; }

.temp-large {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.weather-details-pill {
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
  padding: 1px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-border-light) 60%, var(--color-bg-base));
  font-size: 9px;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.detail-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}

@container personal-info (max-width: 320px) {
  .user-tags {
    display: none;
  }
  .weather-details-pill {
    display: none;
  }
}
</style>
