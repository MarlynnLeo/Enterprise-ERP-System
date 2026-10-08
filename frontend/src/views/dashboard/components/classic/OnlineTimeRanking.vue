<!--
  OnlineTimeRanking — 经典主题在线时长排行榜
-->
<template>
  <section class="online-ranking" aria-label="在线时长排行榜" :aria-busy="loading">
    <header class="ranking-header">
      <div class="ranking-title">
        <div class="title-icon-wrap">
          <el-icon><Timer /></el-icon>
        </div>
        <span>今日在线时长榜</span>
      </div>
      <div class="ranking-actions">
        <span v-if="date" class="ranking-date" :title="date">{{ date }}</span>
        <button
          type="button"
          class="refresh-icon-btn"
          :class="{ 'is-spinning': loading }"
          title="刷新排行榜"
          aria-label="刷新排行榜"
          @click="emit('refresh')"
        >
          <el-icon><Refresh /></el-icon>
        </button>
      </div>
    </header>

    <div class="ranking-body">
      <div v-if="loading" class="ranking-skeleton" aria-hidden="true">
        <div v-for="slot in 3" :key="slot" class="skeleton-row">
          <span class="skeleton-rank"></span>
          <span class="skeleton-avatar"></span>
          <div class="skeleton-content">
            <span class="skeleton-name"></span>
            <span class="skeleton-bar"></span>
          </div>
          <span class="skeleton-time"></span>
        </div>
      </div>

      <ol v-else-if="hasRanking" class="ranking-content" aria-label="今日在线时长排名">
        <li
          v-for="entry in normalizedRankings"
          :key="entry.userId || entry.rank"
          class="ranking-row"
          :class="`rank-item-${entry.rank}`"
          :value="entry.rank"
        >
          <!-- 奖牌徽章 -->
          <div class="rank-badge" :class="`badge-pos-${entry.rank}`">
            <span class="rank-num">{{ entry.rank }}</span>
          </div>

          <div class="avatar-wrap">
            <DecorativeAvatarFrame
              :frame="getFrame(entry.avatarFrame)"
              :avatar="entry.avatar"
              :name="entry.realName"
              :size="34"
              :default-avatar="DEFAULT_AVATAR"
            />
          </div>

          <div class="ranking-person">
            <div class="person-top">
              <span class="person-name" :title="entry.realName">{{ entry.realName }}</span>
              <span class="ranking-time">{{ entry.displayTime }}</span>
            </div>
            <div class="time-track" aria-hidden="true">
              <div
                class="time-fill"
                :class="`fill-${entry.rank}`"
                :style="{ width: `${getProgress(entry)}%` }"
              ></div>
            </div>
          </div>
        </li>
      </ol>

      <div v-else class="empty-state">
        <div class="empty-icon-wrap">
          <el-icon><Trophy /></el-icon>
        </div>
        <strong class="empty-title">暂无在线时长记录</strong>
        <span class="empty-sub">用户操作产生系统日志后将自动上榜</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { Refresh, Timer, Trophy } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { DEFAULT_AVATAR_FRAME, getAvatarFrameConfig, normalizeAvatarFrameId } from '@/utils/avatarFrames'
import DecorativeAvatarFrame from '@/views/auth/components/DecorativeAvatarFrame.vue'

const DEFAULT_AVATAR = '/default-avatar.webp'

const props = defineProps({
  rankings: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  date: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['refresh'])
const authStore = useAuthStore()

const normalizedRankings = computed(() => {
  return props.rankings.slice(0, 3).map((item, index) => {
    const hours = Number(item.hours || 0)
    const minutes = Number(item.minutes || 0)
    const totalSeconds = Number(
      item.totalSeconds ?? ((hours * 60 + minutes) * 60)
    )

    const userId = item.userId
    const isCurrentUser = isSameUser(userId, authStore.user?.id)
    const avatar = isCurrentUser ? (authStore.user?.avatar || item.avatar) : item.avatar
    const avatarFrame = isCurrentUser
      ? (authStore.user?.avatarFrame || item.avatarFrame)
      : (item.avatarFrame)

    return {
      rank: Number(item.rank || index + 1),
      userId,
      username: item.username || '',
      realName: item.realName || '未命名用户',
      avatar: avatar || DEFAULT_AVATAR,
      avatarFrame: normalizeAvatarFrameId(avatarFrame, DEFAULT_AVATAR_FRAME),
      totalSeconds: Number.isFinite(totalSeconds) ? totalSeconds : 0,
      displayTime: formatDuration(totalSeconds)
    }
  })
})

const hasRanking = computed(() => normalizedRankings.value.length > 0)
const maxSeconds = computed(() => {
  return Math.max(...normalizedRankings.value.map((entry) => entry.totalSeconds), 1)
})

function formatDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) {
    return '0分钟'
  }

  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${Math.max(minutes, 1)}m`
}

function getProgress(entry) {
  if (!entry?.totalSeconds) {
    return 0
  }

  return Math.max(12, Math.round((entry.totalSeconds / maxSeconds.value) * 100))
}

function getFrame(frameId) {
  return getAvatarFrameConfig(frameId, 'none')
}

function isSameUser(left, right) {
  return left != null && right != null && String(left) === String(right)
}
</script>

<style scoped>
.online-ranking {
  min-width: 0;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-base);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
  transition: all var(--transition-base) ease;
}

.online-ranking:hover {
  border-color: color-mix(in srgb, var(--color-primary) 25%, var(--color-border-base));
}

.ranking-header {
  min-height: 46px;
  flex: 0 0 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 14px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-border-lighter);
}

.ranking-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 700;
}

.title-icon-wrap {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.ranking-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ranking-date {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.refresh-icon-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-base);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all var(--transition-fast) ease;
}

.refresh-icon-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
}

.refresh-icon-btn.is-spinning .el-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.ranking-body {
  min-width: 0;
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
}

.ranking-content {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ranking-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  background: var(--color-bg-section);
  border: 1px solid var(--color-border-lighter);
  transition: all var(--transition-fast) ease;
}

.ranking-row:hover {
  background: color-mix(in srgb, var(--color-primary) 3%, var(--color-bg-base));
  border-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
}

/* 奖牌徽章 */
.rank-badge {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.badge-pos-1 {
  background: #F59E0B;
  color: #FFFFFF;
  box-shadow: none;
  border-radius: 4px;
}

.badge-pos-2 {
  background: #64748B;
  color: #FFFFFF;
  box-shadow: none;
  border-radius: 4px;
}

.badge-pos-3 {
  background: #D97706;
  color: #FFFFFF;
  box-shadow: none;
  border-radius: 4px;
}

.avatar-wrap {
  flex: 0 0 34px;
}

.ranking-person {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.person-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.person-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ranking-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.time-track {
  height: 5px;
  border-radius: 999px;
  background: var(--color-border-light);
  overflow: hidden;
}

.time-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease;
}

.fill-1 { background: #F59E0B; }
.fill-2 { background: #2563EB; }
.fill-3 { background: #047857; }

/* 空状态 */
.empty-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 10px;
  text-align: center;
}

.empty-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--color-bg-section);
  color: var(--color-text-placeholder);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  margin-bottom: 8px;
}

.empty-title {
  color: var(--color-text-regular);
  font-size: 13px;
  font-weight: 600;
}

.empty-sub {
  color: var(--color-text-placeholder);
  font-size: 11px;
  margin-top: 2px;
}

/* 骨架屏 */
.ranking-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
}

.skeleton-rank {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--color-bg-hover);
}

.skeleton-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--color-bg-hover);
}

.skeleton-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skeleton-name {
  width: 40%;
  height: 12px;
  background: var(--color-bg-hover);
  border-radius: 4px;
}

.skeleton-bar {
  width: 100%;
  height: 5px;
  background: var(--color-bg-hover);
  border-radius: 999px;
}

.skeleton-time {
  width: 40px;
  height: 12px;
  background: var(--color-bg-hover);
  border-radius: 4px;
}
</style>
