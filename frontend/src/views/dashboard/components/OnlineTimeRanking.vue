<template>
  <section class="online-ranking" aria-label="在线时长排行榜">
    <header class="ranking-header">
      <div class="ranking-title">
        <span class="title-icon">
          <el-icon><Timer /></el-icon>
        </span>
        <span>在线时长排行榜</span>
      </div>
      <div class="ranking-actions">
        <span v-if="date" class="ranking-date">{{ date }}</span>
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
        <div class="skeleton-champion"></div>
        <div class="skeleton-row">
          <span></span>
          <span></span>
        </div>
      </div>

      <div v-else-if="hasRanking" class="ranking-content">
        <article class="champion-card">
          <div class="champion-meta">
            <span class="rank-pill">NO.1</span>
            <span class="online-state">今日领先</span>
          </div>
          <div class="champion-main">
            <div class="avatar-wrap champion-avatar">
              <DecorativeAvatarFrame
                :frame="championFrame"
                :avatar="champion.avatar"
                :name="champion.realName"
                :size="92"
                :default-avatar="DEFAULT_AVATAR"
              />
            </div>
            <div class="champion-info">
              <h3>{{ champion.realName }}</h3>
            </div>
            <div class="champion-time">{{ champion.displayTime }}</div>
          </div>
          <div class="time-bar" aria-hidden="true">
            <span :style="{ width: `${getProgress(champion)}%` }"></span>
          </div>
        </article>

        <div class="runner-grid">
          <article
            v-for="entry in runnerEntries"
            :key="entry.userId || entry.rank"
            class="runner-card"
            :class="`rank-${entry.rank}`"
          >
            <div class="runner-rank">NO.{{ entry.rank }}</div>
            <div class="avatar-wrap">
              <DecorativeAvatarFrame
                :frame="getFrame(entry.avatarFrame)"
                :avatar="entry.avatar"
                :name="entry.realName"
                :size="66"
                :default-avatar="DEFAULT_AVATAR"
              />
            </div>
            <div class="runner-info">
              <strong>{{ entry.realName }}</strong>
              <span>{{ entry.displayTime }}</span>
            </div>
            <div class="mini-bar" aria-hidden="true">
              <span :style="{ width: `${getProgress(entry)}%` }"></span>
            </div>
          </article>

          <article
            v-for="slot in emptyRunnerSlots"
            :key="`empty-${slot}`"
            class="runner-card empty-runner"
          >
            <div class="runner-rank">NO.{{ slot }}</div>
            <div class="avatar-placeholder">
              <el-icon><UserFilled /></el-icon>
            </div>
            <div class="runner-info">
              <strong>暂无数据</strong>
              <span>等待上榜</span>
            </div>
          </article>
        </div>
      </div>

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
import { Refresh, Timer, Trophy, UserFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../stores/auth'
import { DEFAULT_AVATAR_FRAME, getAvatarFrameConfig, normalizeAvatarFrameId } from '@/utils/avatarFrames'
import DecorativeAvatarFrame from '../../auth/components/DecorativeAvatarFrame.vue'

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
const champion = computed(() => normalizedRankings.value[0] || null)
const championFrame = computed(() => getFrame(champion.value?.avatarFrame))
const runnerEntries = computed(() => normalizedRankings.value.slice(1, 3))
const emptyRunnerSlots = computed(() => {
  const startRank = runnerEntries.value.length + 2
  return Array.from({ length: Math.max(0, 2 - runnerEntries.value.length) }, (_, index) => startRank + index)
})
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
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-base);
  container-type: inline-size;
  container-name: online-ranking;
}

.ranking-header {
  height: 45px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border-lighter);
}

.ranking-title,
.ranking-actions {
  display: flex;
  align-items: center;
}

.ranking-title {
  gap: 8px;
  min-width: 0;
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 700;
}

.title-icon {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  background: var(--ds-blue-bg);
  border-radius: 8px;
}

.ranking-actions {
  gap: 6px;
  color: var(--color-text-secondary);
}

.ranking-date {
  max-width: 120px;
  overflow: hidden;
  color: var(--color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.refresh-button {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 8px;
  color: var(--color-text-secondary);
}

.refresh-button:hover {
  color: var(--color-primary);
  background: var(--ds-blue-bg);
}

.ranking-body {
  flex: 1;
  min-height: 0;
  padding: 14px;
}

.ranking-content {
  height: 100%;
  display: grid;
  grid-template-rows: minmax(128px, 1fr) auto;
  gap: 12px;
}

.champion-card,
.runner-card {
  border: 1px solid var(--color-border-lighter);
  border-radius: 8px;
  background: var(--color-bg-base);
  box-sizing: border-box;
}

.champion-card {
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 14px;
  background: linear-gradient(135deg, var(--ds-yellow-bg), var(--color-bg-base));
  border-color: color-mix(in srgb, var(--ds-yellow) 36%, var(--color-border-lighter));
}

.champion-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.rank-pill,
.online-state,
.runner-rank {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.rank-pill {
  color: var(--ds-yellow-strong);
  background: color-mix(in srgb, var(--ds-yellow) 18%, transparent);
}

.online-state {
  color: var(--ds-green);
  background: var(--ds-green-bg);
}

.champion-main {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
}

.avatar-wrap {
  position: relative;
  width: 66px;
  height: 66px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.champion-avatar {
  width: 92px;
  height: 92px;
}

.champion-info {
  min-width: 0;
}

.champion-info h3,
.champion-info p,
.runner-info strong,
.runner-info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.champion-info h3 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 18px;
  line-height: 1.3;
}

.champion-info p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.champion-time {
  color: var(--ds-yellow-strong);
  font-size: 18px;
  font-weight: 800;
  white-space: nowrap;
}

.time-bar,
.mini-bar {
  height: 6px;
  overflow: hidden;
  background: var(--ds-gray-bg);
  border-radius: 999px;
}

.time-bar {
  margin-top: 14px;
}

.time-bar span,
.mini-bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--ds-yellow), var(--ds-blue));
  border-radius: inherit;
}

.runner-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.runner-card {
  min-width: 0;
  display: grid;
  grid-template-columns: auto 66px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 10px;
  row-gap: 8px;
  padding: 12px;
}

.runner-rank {
  color: var(--color-primary);
  background: var(--ds-blue-bg);
}

.runner-card.rank-3 .runner-rank {
  color: var(--ds-orange);
  background: var(--ds-orange-bg);
}

.runner-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.runner-info strong {
  color: var(--color-text-primary);
  font-size: 13px;
}

.runner-info span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.mini-bar {
  grid-column: 1 / -1;
}

.empty-runner {
  color: var(--color-text-secondary);
  background: var(--color-bg-section);
  border-style: dashed;
}

.avatar-placeholder,
.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--ds-gray-bg);
  color: var(--color-text-secondary);
}

.avatar-placeholder {
  width: 56px;
  height: 56px;
  font-size: 24px;
}

.empty-state {
  height: 100%;
  min-height: 250px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  color: var(--color-text-secondary);
}

.empty-icon {
  width: 56px;
  height: 56px;
  margin-bottom: 4px;
  color: var(--color-primary);
  font-size: 28px;
}

.empty-state strong {
  color: var(--color-text-primary);
  font-size: 15px;
}

.empty-state span {
  font-size: 12px;
}

.ranking-skeleton {
  height: 100%;
  display: grid;
  grid-template-rows: minmax(128px, 1fr) auto;
  gap: 12px;
}

.skeleton-champion,
.skeleton-row span {
  border-radius: 8px;
  background: linear-gradient(90deg, var(--color-bg-section) 25%, var(--color-bg-hover) 50%, var(--color-bg-section) 75%);
  background-size: 220px 100%;
  animation: skeletonLoading 1.4s ease-in-out infinite;
}

.skeleton-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.skeleton-row span {
  height: 94px;
}

@keyframes skeletonLoading {
  from {
    background-position: -220px 0;
  }
  to {
    background-position: calc(220px + 100%) 0;
  }
}

@media (max-width: 1200px) {
  .champion-main {
    grid-template-columns: 96px minmax(0, 1fr);
  }

  .champion-time {
    grid-column: 2;
    font-size: 16px;
  }

  .champion-avatar {
    grid-row: 1 / span 2;
  }
}

@container online-ranking (max-width: 440px) {
  .ranking-body {
    padding: 12px;
  }

  .ranking-content,
  .ranking-skeleton {
    grid-template-rows: minmax(122px, 1fr) auto;
    gap: 10px;
  }

  .champion-card {
    padding: 12px;
  }

  .champion-main {
    grid-template-columns: 82px minmax(0, 1fr);
    gap: 10px;
  }

  .champion-avatar {
    width: 78px;
    height: 78px;
    grid-row: 1 / span 2;
    transform: scale(0.85);
    transform-origin: center;
  }

  .champion-info h3 {
    font-size: 16px;
  }

  .champion-time {
    grid-column: 2;
    font-size: 15px;
  }

  .runner-grid,
  .skeleton-row {
    gap: 8px;
  }

  .runner-card {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 58px auto auto;
    justify-items: center;
    row-gap: 5px;
    padding: 9px 8px;
    text-align: center;
  }

  .runner-card .avatar-wrap {
    width: 58px;
    height: 58px;
    transform: scale(0.84);
    transform-origin: center;
  }

  .runner-info {
    width: 100%;
    align-items: center;
    gap: 2px;
  }

  .mini-bar {
    width: 100%;
    grid-column: 1;
  }

  .skeleton-row span {
    height: 126px;
  }
}

@media (max-width: 768px) {
  .ranking-header {
    padding: 0 12px;
  }

  .ranking-body {
    padding: 12px;
  }

  .refresh-button {
    width: 36px;
    height: 36px;
  }

  .ranking-content,
  .ranking-skeleton {
    grid-template-rows: auto auto;
  }

  .champion-main {
    grid-template-columns: 96px minmax(0, 1fr);
  }

  .champion-avatar {
    width: 92px;
    height: 92px;
  }

  .champion-time {
    grid-column: 1 / -1;
    font-size: 16px;
  }

  .runner-grid,
  .skeleton-row {
    grid-template-columns: 1fr;
  }

  .runner-card {
    grid-template-columns: auto 66px minmax(0, 1fr);
  }
}
</style>
