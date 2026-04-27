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
              <div class="preview-icon"><VanIcon name="gem-o" size="24px" /></div>
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
          <div class="theme-icon">{{ themeOption.icon }}</div>
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
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { getTheme } from '@/config/themes'
import { showToast } from 'vant'

const router = useRouter()
const { currentThemeName, setTheme } = useTheme()

// 主题选项（与 config/themes.js 对齐）
const themeOptions = [
  {
    name: 'kacon',
    label: 'KACON 工业',
    icon: '🏢',
    description: '品牌标准配色 — 深灰蓝 + 青色'
  },
  {
    name: 'dark',
    label: '暗色模式',
    icon: '🌙',
    description: '深色背景 — 护眼夜间模式'
  },
  {
    name: 'nature',
    label: '自然护眼',
    icon: '🌿',
    description: '清新绿色 — 缓解视觉疲劳'
  },
  {
    name: 'tech',
    label: '科技主题',
    icon: '🚀',
    description: '霓虹蓝绿 — 信息密集场景'
  }
]

// 当前主题信息
const currentThemeLabel = computed(() => {
  const current = themeOptions.find(t => t.name === currentThemeName.value)
  return current?.label || 'KACON 工业'
})

const currentThemeDescription = computed(() => {
  const current = themeOptions.find(t => t.name === currentThemeName.value)
  return current?.description || '品牌标准配色'
})

// 色板预览（使用主题的 preview 配色）
const colorPalette = computed(() => {
  const current = themeOptions.find(t => t.name === currentThemeName.value) || themeOptions[0]
  const themeConfig = getTheme(currentThemeName.value)
  return [
    { name: '主色', value: themeConfig?.preview?.primary || '#1a73e8' },
    { name: '辅色', value: themeConfig?.preview?.accent || '#67C1D9' },
    { name: '背景', value: themeConfig?.preview?.bg || '#F4F7FA' },
  ]
})

// 选择主题
const selectTheme = (themeName) => {
  setTheme(themeName)
  showToast({
    message: `已切换到${themeOptions.find(t => t.name === themeName)?.label}主题`,
    position: 'top'
  })
}

// 返回
const goBack = () => {
  router.back()
}
</script>

<style lang="scss" scoped>
.theme-settings {
  min-height: 100vh;
  background: var(--color-bg-primary);
  padding-bottom: 2rem;
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: var(--color-glass-light);
  backdrop-filter: blur(var(--effect-blur));
  border-bottom: 1px solid var(--color-border-light);
  position: sticky;
  top: 0;
  z-index: 100;
}

.back-btn {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-text-primary);
  cursor: pointer;
  
  svg {
    width: 1.5rem;
    height: 1.5rem;
  }
}

.title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.placeholder {
  width: 2.5rem;
}

.content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0 0 1rem 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.current-theme {
  .preview-card {
    background: var(--color-glass-medium);
    backdrop-filter: blur(var(--effect-blur));
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
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
    background: var(--color-gradient-primary);
    border-radius: var(--radius-md);
  }

  .preview-info {
    flex: 1;

    h3 {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 0.25rem 0;
    }

    p {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
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
  padding: 1rem;
  background: var(--color-glass-light);
  backdrop-filter: blur(var(--effect-blur));
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: var(--color-glass-medium);
    transform: translateY(-2px);
  }

  &.active {
    background: var(--color-glass-medium);
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
  background: var(--color-glass-medium);
  border-radius: var(--radius-sm);
}

.theme-info {
  flex: 1;

  .theme-name {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 0.25rem 0;
  }

  .theme-desc {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    margin: 0;
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
    border: 1px solid var(--color-border-light);
  }

  .color-name {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    text-align: center;
  }
}


</style>
