<!--
/**
 * ModuleIndexPage.vue - 模块首页统一布局组件
 * @description 所有业务模块首页的唯一布局入口 — 与 Accounts.vue 同风格
 * @date 2026-04-15
 * @version 4.0.0
 */
-->
<template>
  <div class="module-page">
    <!-- 标准 Vant NavBar 改装为悬浮卡片 -->
    <NavBar :title="title" left-arrow @click-left="$emit('back')">
      <template #right>
        <Icon name="plus" size="18" @click="$emit('add')" />
      </template>
    </NavBar>

    <div class="module-body">
      <!-- 统计概览 — 横排统计条 -->
      <div class="stats-banner" v-if="stats && stats.length">
        <template v-for="(stat, idx) in stats" :key="idx">
          <div class="stat-item">
            <span class="stat-num" :class="stat.color || ''">{{ stat.value }}</span>
            <span class="stat-label">{{ stat.label }}</span>
          </div>
          <div v-if="idx < stats.length - 1" class="stat-divider"></div>
        </template>
      </div>

      <!-- 快捷操作 — 4 宫格 -->
      <div class="quick-section" v-if="actions && actions.length">
        <div class="section-title">快捷操作</div>
        <div class="quick-grid">
          <div
            v-for="action in actions"
            :key="action.path"
            class="quick-item"
            @click="$emit('navigate', action.path)"
          >
            <div class="quick-icon" :style="{ background: action.gradient }">
              <SvgIcon :name="action.icon" size="1.25rem" />
            </div>
            <span class="quick-text">{{ action.label }}</span>
          </div>
        </div>
      </div>

      <!-- 功能模块 — 分组卡片列表 -->
      <div class="groups-section" v-if="groups && groups.length">
        <div class="section-title">功能模块</div>
        <div v-for="(group, gIdx) in groups" :key="gIdx" class="module-group">
          <div class="group-header">
            <SvgIcon :name="group.icon" size="0.875rem" :class="group.color" />
            <span class="group-title">{{ group.title }}</span>
          </div>
          <div class="group-items">
            <div
              v-for="(item, iIdx) in group.items"
              :key="item.path"
              class="group-card"
              :style="{ animationDelay: `${(gIdx * 3 + iIdx) * 0.04}s` }"
              @click="$emit('navigate', item.path)"
            >
              <!-- 左侧色条 -->
              <div class="card-accent" :class="getAccentClass(gIdx)"></div>
              <!-- 卡片主体 -->
              <div class="card-body">
                <div class="card-top">
                  <div class="card-info">
                    <div class="card-icon" :class="getAccentClass(gIdx)">
                      <SvgIcon :name="item.icon" size="1rem" />
                    </div>
                    <div>
                      <div class="card-title">{{ item.title }}</div>
                      <div v-if="item.desc" class="card-desc">{{ item.desc }}</div>
                    </div>
                  </div>
                  <div class="card-right">
                    <span v-if="item.badge > 0" class="card-badge">{{ item.badge }}</span>
                    <SvgIcon name="chevron-right" size="0.875rem" class="card-arrow" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { NavBar } from 'vant'
  import Icon from '@/components/icons/index.vue'
  import SvgIcon from '@/components/icons/index.vue'

  defineProps({
    title: { type: String, required: true },
    stats: { type: Array, default: () => [] },
    actions: { type: Array, default: () => [] },
    groups: { type: Array, default: () => [] }
  })

  defineEmits(['back', 'add', 'navigate'])

  // 根据分组索引分配色条颜色
  const accentColors = [
    'accent-blue',
    'accent-purple',
    'accent-green',
    'accent-orange',
    'accent-red',
    'accent-yellow'
  ]
  const getAccentClass = (idx) => accentColors[idx % accentColors.length]
</script>

<style lang="scss" scoped>
  .module-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 80px;
  }

  .module-body {
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  // ========== 统计概览 — 横排 ==========
  .stats-banner {
    display: flex;
    align-items: center;
    justify-content: space-around;
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 14px 8px;
    margin-top: 8px;
    border: 1px solid var(--glass-border);
    box-shadow: none;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .stat-num {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--text-primary);
    &.bg-blue {
      color: #3b82f6;
    }
    &.bg-purple {
      color: #a855f7;
    }
    &.bg-yellow {
      color: #fbbf24;
    }
    &.bg-green {
      color: #34d399;
    }
    &.bg-red {
      color: #ef4444;
    }
    &.bg-orange {
      color: #f97316;
    }
    &.bg-pink {
      color: #ec4899;
    }
  }

  .stat-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }

  .stat-divider {
    width: 1px;
    height: 28px;
    background: var(--glass-border);
  }

  // ========== 快捷操作 ==========
  .quick-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .quick-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .quick-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 4px;
    border-radius: 12px;
    cursor: pointer;
    transition: transform 0.15s ease;
    &:active {
      transform: scale(0.95);
    }
  }

  .quick-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .quick-text {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-primary);
    text-align: center;
  }

  // ========== 功能模块分组 ==========
  .groups-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .module-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .group-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .group-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  // ========== 功能卡片 — 左侧色条 ==========
  .group-card {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    box-shadow: none;
    transition: all 0.2s ease;
    animation: fadeInUp 0.35s ease-out both;
    cursor: pointer;

    &:active {
      transform: scale(0.98);
      box-shadow: none;
    }
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  // 左侧色条
  .card-accent {
    width: 4px;
    flex-shrink: 0;
    &.accent-blue {
      background: linear-gradient(180deg, #3b82f6, #60a5fa);
    }
    &.accent-purple {
      background: linear-gradient(180deg, #a855f7, #c084fc);
    }
    &.accent-green {
      background: linear-gradient(180deg, #10b981, #34d399);
    }
    &.accent-orange {
      background: linear-gradient(180deg, #f97316, #fb923c);
    }
    &.accent-red {
      background: linear-gradient(180deg, #ef4444, #f87171);
    }
    &.accent-yellow {
      background: linear-gradient(180deg, #f59e0b, #fbbf24);
    }
  }

  .card-body {
    flex: 1;
    padding: 12px 14px;
    min-width: 0;
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .card-info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .card-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &.accent-blue {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
    }
    &.accent-purple {
      background: rgba(168, 85, 247, 0.1);
      color: #a855f7;
    }
    &.accent-green {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }
    &.accent-orange {
      background: rgba(249, 115, 22, 0.1);
      color: #f97316;
    }
    &.accent-red {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
    &.accent-yellow {
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
    }
  }

  .card-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .card-desc {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    margin-top: 2px;
  }

  .card-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .card-badge {
    padding: 1px 8px;
    border-radius: 10px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    font-size: 0.625rem;
    font-weight: 700;
  }

  .card-arrow {
    color: var(--text-tertiary);
  }

  // ========== 辅助类 ==========
  .text-blue-400 {
    color: #3b82f6;
  }
  .text-purple-400 {
    color: #a855f7;
  }
  .text-green-400 {
    color: #10b981;
  }
  .text-orange-400 {
    color: #f97316;
  }
  .text-red-400 {
    color: #ef4444;
  }
  .text-yellow-400 {
    color: #f59e0b;
  }
  .text-pink-400 {
    color: #ec4899;
  }
</style>
