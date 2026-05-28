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
        <SvgIcon v-if="showAddButton" name="plus" size="18" @click="$emit('add')" />
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
            <div class="quick-icon" :style="{ '--quick-action-bg': action.gradient }">
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
  import { computed, getCurrentInstance } from 'vue'
  import { NavBar } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'

  const props = defineProps({
    title: { type: String, required: true },
    stats: { type: Array, default: () => [] },
    actions: { type: Array, default: () => [] },
    groups: { type: Array, default: () => [] },
    showAdd: { type: Boolean, default: undefined }
  })

  defineEmits(['back', 'add', 'navigate'])

  const instance = getCurrentInstance()
  const showAddButton = computed(() => props.showAdd ?? Boolean(instance?.vnode?.props?.onAdd))

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
    min-height: 100%;
    background-color: var(--bg-primary);
    padding-bottom: 0;
  }

  .module-body {
    padding: 0 12px var(--app-bottom-space);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  // ========== 统计概览 — 横排 ==========
  .stats-banner {
    display: flex;
    align-items: center;
    justify-content: space-around;
    background: var(--bg-secondary);
    border-radius: 12px;
    min-height: 74px;
    padding: 12px 8px;
    margin: 8px 0 12px;
    border: 1px solid var(--surface-border, var(--border-subtle));
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
  }

  .stat-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }

  .stat-divider {
    width: 1px;
    height: 28px;
    background: var(--van-border-color, var(--surface-border));
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
    --quick-action-bg: var(--color-primary);
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-on-primary);
    background: var(--quick-action-bg, var(--color-primary));
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
    border: 1px solid var(--surface-border);
    box-shadow: none;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
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
      background: linear-gradient(180deg, var(--ds-blue), var(--ds-blue-strong));
    }
    &.accent-purple {
      background: linear-gradient(180deg, var(--ds-purple), var(--ds-purple-strong));
    }
    &.accent-green {
      background: linear-gradient(180deg, var(--ds-green), var(--ds-green-strong));
    }
    &.accent-orange {
      background: linear-gradient(180deg, var(--ds-orange), var(--ds-orange-strong));
    }
    &.accent-red {
      background: linear-gradient(180deg, var(--ds-red), var(--ds-red-strong));
    }
    &.accent-yellow {
      background: linear-gradient(180deg, var(--ds-yellow), var(--ds-yellow-strong));
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
      background: var(--ds-blue-bg);
      color: var(--ds-blue);
    }
    &.accent-purple {
      background: var(--ds-purple-bg);
      color: var(--ds-purple);
    }
    &.accent-green {
      background: var(--ds-green-bg);
      color: var(--ds-green);
    }
    &.accent-orange {
      background: var(--ds-orange-bg);
      color: var(--ds-orange);
    }
    &.accent-red {
      background: var(--ds-red-bg);
      color: var(--ds-red);
    }
    &.accent-yellow {
      background: var(--ds-yellow-bg);
      color: var(--ds-yellow);
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
    background: var(--ds-red-bg);
    color: var(--ds-red);
    font-size: 0.625rem;
    font-weight: 700;
  }

  .card-arrow {
    color: var(--text-tertiary);
  }

  // ========== 辅助类 ==========
  .text-blue-400 {
    color: var(--ds-blue);
  }
  .text-purple-400 {
    color: var(--ds-purple);
  }
  .text-green-400 {
    color: var(--ds-green);
  }
  .text-orange-400 {
    color: var(--ds-orange);
  }
  .text-red-400 {
    color: var(--ds-red);
  }
  .text-yellow-400 {
    color: var(--ds-yellow);
  }
  .text-pink-400 {
    color: var(--ds-pink);
  }
</style>
