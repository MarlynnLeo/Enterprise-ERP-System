<!--
/**
 * Theme.vue - 主题设置
 * @description 主题切换设置页面
 * @date 2025-12-27
 * @version 1.0.0
 */
-->
<template>
  <div class="theme-settings">
    <!-- 导航栏 -->
    <div class="nav-bar">
      <button class="back-btn" @click="goBack">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="title">主题设置</h1>
      <div class="placeholder"></div>
    </div>

    <!-- 内容区域 -->
    <div class="content">
      <!-- 当前主题预览 -->
      <div class="current-theme">
        <h2 class="section-title">当前主题</h2>
        <div class="theme-preview">
          <div class="preview-card">
            <div class="preview-header">
              <div class="preview-icon"><VanIcon :name="currentThemeIcon" size="24px" /></div>
              <div class="preview-info">
                <h3>{{ currentThemeLabel }}</h3>
                <p>{{ currentThemeDescription }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 主题列表 -->
      <div class="theme-list">
        <h2 class="section-title">选择主题</h2>

        <div
          v-for="themeOption in themeOptions"
          :key="themeOption.name"
          class="theme-item"
          :class="{ active: currentThemeName === themeOption.name }"
          @click="selectTheme(themeOption.name)"
        >
          <div class="theme-icon">
            <VanIcon :name="themeOption.icon || 'brush-o'" size="22px" />
          </div>
          <div class="theme-info">
            <h3 class="theme-name">{{ themeOption.label }}</h3>
            <p class="theme-desc">{{ themeOption.description }}</p>
          </div>
          <div class="theme-check" v-if="currentThemeName === themeOption.name">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      </div>

      <!-- 主题预览色板 -->
      <div class="color-palette">
        <h2 class="section-title">色板预览</h2>
        <div class="palette-grid">
          <div class="color-item" v-for="color in colorPalette" :key="color.name">
            <div class="color-box" :style="{ background: color.value }"></div>
            <span class="color-name">{{ color.name }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { loadThemeFromServer, useTheme } from '@/composables/useTheme'
import { getTheme } from '@/config/themes'
import { showToast } from 'vant'

const router = useRouter()
const { currentThemeName, availableThemes, setTheme } = useTheme()

// 当前主题信息
const themeOptions = availableThemes

const currentThemeOption = computed(() => {
  return themeOptions.value.find(t => t.name === currentThemeName.value)
})

const currentThemeLabel = computed(() => {
  return currentThemeOption.value?.label || getTheme(currentThemeName.value)?.label || currentThemeName.value
})

const currentThemeDescription = computed(() => {
  return currentThemeOption.value?.description || getTheme(currentThemeName.value)?.description || ''
})

const currentThemeIcon = computed(() => {
  return currentThemeOption.value?.icon || 'gem-o'
})

// 色板预览（使用主题的 preview 配色）
const colorPalette = computed(() => {

  const themeConfig = getTheme(currentThemeName.value)
  return [
    { name: '主色', value: themeConfig?.preview?.primary || 'var(--color-primary)' },
    { name: '辅色', value: themeConfig?.preview?.accent || 'var(--color-accent)' },
    { name: '背景', value: themeConfig?.preview?.bg || 'var(--bg-primary)' },
  ]
})

// 选择主题
const selectTheme = async (themeName) => {
  const selected = themeOptions.value.find(t => t.name === themeName)
  const synced = await setTheme(themeName)
  showToast({
    message: synced
      ? `已切换到${selected?.label || themeName}主题`
      : `已本地切换到${selected?.label || themeName}主题，服务器同步失败`,
    position: 'top'
  })
}

// 返回
onMounted(() => {
  loadThemeFromServer().catch(() => {})
})

const goBack = () => {
  router.back()
}
</script>

<style lang="scss" scoped>
.theme-settings {
  min-height: 100%;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  min-height: calc(48px + var(--safe-area-top, 0px));
  margin: 0;
  padding: var(--safe-area-top, 0px) 12px 0;
  background: var(--bg-secondary);
  border: 0;
  border-bottom: 1px solid var(--van-border-color, var(--surface-border));
  border-radius: 0;
  position: sticky;
  top: 0;
  z-index: 100;
}

.back-btn {
  width: 2.75rem;
  height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;

  svg {
    width: 1.5rem;
    height: 1.5rem;
  }
}

.title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.placeholder {
  width: 2.75rem;
}

.content {
  width: 100%;
  flex: 1 0 auto;
  padding: 0 12px var(--app-bottom-space);
  display: flex;
  flex-direction: column;
  gap: calc(12px * 2);
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 1rem 0;
  text-transform: uppercase;
  letter-spacing: 0;
}

.current-theme {
  .preview-card {
    background: var(--bg-secondary);
    border: 1px solid var(--surface-border, var(--border-subtle));
    border-radius: 12px;
    min-height: 72px;
    padding: 14px;
    box-shadow: none;
  }

  .preview-header {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .preview-icon {
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    color: var(--color-on-primary);
    background: var(--color-primary);
    border-radius: var(--radius-md);
  }

  .preview-info {
    flex: 1;

    h3 {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 0.25rem 0;
    }

    p {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin: 0;
    }
  }
}

.theme-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.theme-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-height: 72px;
  padding: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--surface-border, var(--border-subtle));
  border-radius: 12px;
  cursor: pointer;
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease,
    transform 0.3s ease;

  &:hover {
    background: var(--surface-hover);
    transform: translateY(-2px);
  }

  &.active {
    background: var(--color-primary-bg);
    border-color: var(--color-primary);
    box-shadow: none;
  }
}

.theme-icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  background: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
}

.theme-info {
  flex: 1;
  min-width: 0;

  .theme-name {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.25rem 0;
  }

  .theme-desc {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.4;
  }
}

.theme-check {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--color-primary);

  svg {
    width: 100%;
    height: 100%;
  }
}

.color-palette {
  .palette-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }

  .color-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .color-box {
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius-md);
    box-shadow: none;
    border: 1px solid var(--surface-border);
  }

  .color-name {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-align: center;
  }
}

@media (min-width: 640px) {
  .content {
    max-width: 760px;
    margin: 0 auto;
  }

  .theme-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .theme-list .section-title {
    grid-column: 1 / -1;
  }
}


</style>
