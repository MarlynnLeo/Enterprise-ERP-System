<template>
  <section class="online-ranking" aria-label="在线时长排行榜" :aria-busy="loading">
    <header class="ranking-header">
      <div class="ranking-title">
        <span class="title-icon">
          <el-icon><Timer /></el-icon>
        </span>
        <span>在线时长排行榜</span>
      </div>
      <div class="ranking-actions">
        <span v-if="date" class="ranking-date" :title="date">{{ date }}</span>
        <el-button
          class="refresh-button"
          text
          :loading="loading"
          title="刷新排行榜"
          aria-label="刷新排行榜"
          @click="emit('refresh')"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </header>

    <div class="ranking-body">
      <div v-if="loading" class="ranking-skeleton" aria-hidden="true">
        <div v-for="slot in 3" :key="slot" class="skeleton-row">
          <span class="skeleton-avatar"></span>
          <span class="skeleton-name"></span>
          <span class="skeleton-time"></span>
        </div>
      </div>

      <ol v-else-if="hasRanking" class="ranking-content" aria-label="今日在线时长排名">
        <li
          v-for="entry in normalizedRankings"
          :key="entry.userId || entry.rank"
          class="ranking-row"
          :class="`rank-${entry.rank}`"
          :value="entry.rank"
        >
          <span class="rank-number" :aria-label="`第${entry.rank}名`">{{ entry.rank }}</span>
          <div class="avatar-wrap">
            <DecorativeAvatarFrame
              :frame="getFrame(entry.avatarFrame)"
              :avatar="entry.avatar"
              :name="entry.realName"
              :size="32"
              :default-avatar="DEFAULT_AVATAR"
            />
          </div>
          <div class="ranking-person">
            <strong :title="entry.realName">{{ entry.realName }}</strong>
            <div class="time-bar" aria-hidden="true">
              <span :style="{ width: `${getProgress(entry)}%` }"></span>
            </div>
          </div>
          <span class="ranking-time">{{ entry.displayTime }}</span>
        </li>
      </ol>

      <div v-else class="empty-state">
        <div class="empty-icon">
          <el-icon><Trophy /></el-icon>
        </div>
        <strong>暂无在线时长数据</strong>
        <span>用户登录并产生操作记录后会自动统计</span>
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
    return `${hours}小时${minutes}分钟`
  }

  return `${Math.max(minutes, 1)}分钟`
}

function getProgress(entry) {
  if (!entry?.totalSeconds) {
    return 0
  }

  return Math.max(8, Math.round((entry.totalSeconds / maxSeconds.value) * 100))
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
  border-radius: var(--radius-sm);
  container-type: inline-size;
  container-name: online-ranking;
}

.ranking-header {
  min-height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-border-lighter);
}

.ranking-title,
.ranking-actions {
  display: flex;
  align-items: center;
}

.ranking-title {
  gap: 6px;
  min-width: 0;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.title-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-primary);
  font-size: 16px;
}

.ranking-actions {
  gap: 4px;
  min-width: 0;
  color: var(--color-text-secondary);
}

.ranking-date {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.refresh-button {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

.refresh-button:hover {
  color: var(--color-primary);
  background: var(--ds-blue-bg);
}

.ranking-body {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 4px 10px;
}

.ranking-content {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ranking-row {
  min-width: 0;
  display: grid;
  grid-template-columns: 20px 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
}

.ranking-row + .ranking-row,
.skeleton-row + .skeleton-row {
  border-top: 1px solid var(--color-border-lighter);
}

.rank-number {
  color: var(--color-text-secondary);
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.rank-1 .rank-number {
  color: var(--color-warning);
}

.avatar-wrap {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ranking-person {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ranking-person strong {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-time {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.time-bar {
  width: 100%;
  max-width: 120px;
  height: 3px;
  overflow: hidden;
  background: var(--color-bg-section);
  border-radius: 2px;
}

.time-bar span {
  display: block;
  height: 100%;
  background: var(--color-primary);
  border-radius: inherit;
  opacity: 0.65;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 22px 4px;
  text-align: center;
  color: var(--color-text-secondary);
}

.empty-icon {
  display: inline-flex;
  color: var(--color-primary);
  font-size: 24px;
}

.empty-state strong {
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 500;
}

.empty-state span {
  font-size: 12px;
  line-height: 1.5;
}

.skeleton-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 72px;
  align-items: center;
  gap: 10px;
  padding: 9px 0 9px 30px;
}

.skeleton-row span {
  height: 12px;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--color-bg-section) 25%, var(--color-bg-hover) 50%, var(--color-bg-section) 75%);
  background-size: 220px 100%;
  animation: skeletonLoading 1.4s ease-in-out infinite;
}

.skeleton-row .skeleton-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.skeleton-name {
  max-width: 120px;
}

@keyframes skeletonLoading {
  from {
    background-position: -220px 0;
  }
  to {
    background-position: calc(220px + 100%) 0;
  }
}

@container online-ranking (max-width: 320px) {
  .ranking-row {
    gap: 7px;
  }

  .ranking-date {
    max-width: 64px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-row span {
    animation: none;
  }
}
</style>
