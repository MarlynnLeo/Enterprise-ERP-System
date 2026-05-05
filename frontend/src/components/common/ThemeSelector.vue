<!--
/**
 * ThemeSelector.vue
 * @description 主题选择器组件 - 支持多主题预设切换
 * @date 2025-10-23
 * @version 1.0.0
 */
-->
<template>
  <el-dropdown @command="handleThemeChange" trigger="click" placement="bottom-end">
    <div class="theme-selector">
      <el-icon :size="20">
        <component :is="themeIcon" />
      </el-icon>
    </div>
    <template #dropdown>
      <el-dropdown-menu class="theme-dropdown">
        <el-dropdown-item disabled>
          <span style="font-weight: bold; color: var(--el-text-color-primary);">
            选择主题
          </span>
        </el-dropdown-item>
        <el-dropdown-item divided command="default">
          <div class="theme-item">
            <el-icon v-if="currentPreset === 'default'" color="var(--el-color-primary)">
              <Check />
            </el-icon>
            <span :class="{ 'active-theme': currentPreset === 'default' }">
              🎨 默认主题
            </span>
          </div>
        </el-dropdown-item>
        <el-dropdown-item command="tech">
          <div class="theme-item">
            <el-icon v-if="currentPreset === 'tech'" color="var(--el-color-primary)">
              <Check />
            </el-icon>
            <span :class="{ 'active-theme': currentPreset === 'tech' }">
              🚀 科技主题
            </span>
          </div>
        </el-dropdown-item>
        <el-dropdown-item command="business">
          <div class="theme-item">
            <el-icon v-if="currentPreset === 'business'" color="var(--el-color-primary)">
              <Check />
            </el-icon>
            <span :class="{ 'active-theme': currentPreset === 'business' }">
              💼 商务主题
            </span>
          </div>
        </el-dropdown-item>
        <el-dropdown-item command="vibrant">
          <div class="theme-item">
            <el-icon v-if="currentPreset === 'vibrant'" color="var(--el-color-primary)">
              <Check />
            </el-icon>
            <span :class="{ 'active-theme': currentPreset === 'vibrant' }">
              🎉 活力主题
            </span>
          </div>
        </el-dropdown-item>
        <el-dropdown-item command="nature">
          <div class="theme-item">
            <el-icon v-if="currentPreset === 'nature'" color="var(--el-color-primary)">
              <Check />
            </el-icon>
            <span :class="{ 'active-theme': currentPreset === 'nature' }">
              🌿 自然主题
            </span>
          </div>
        </el-dropdown-item>
        <el-dropdown-item command="dark">
          <div class="theme-item">
            <el-icon v-if="currentPreset === 'dark'" color="var(--el-color-primary)">
              <Check />
            </el-icon>
            <span :class="{ 'active-theme': currentPreset === 'dark' }">
              🌙 深色主题
            </span>
          </div>
        </el-dropdown-item>
        <el-dropdown-item command="professional">
          <div class="theme-item">
            <el-icon v-if="currentPreset === 'professional'" color="var(--el-color-primary)">
              <Check />
            </el-icon>
            <span :class="{ 'active-theme': currentPreset === 'professional' }">
              💼 专业主题
            </span>
          </div>
        </el-dropdown-item>
        <el-dropdown-item command="kacon">
          <div class="theme-item">
            <el-icon v-if="currentPreset === 'kacon'" color="var(--el-color-primary)">
              <Check />
            </el-icon>
            <span :class="{ 'active-theme': currentPreset === 'kacon' }">
              🏢 KACON品牌
            </span>
          </div>
        </el-dropdown-item>
        <el-dropdown-item divided disabled>
          <span style="font-size: 12px; color: var(--el-text-color-secondary);">
            当前: {{ currentPresetName }}
          </span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
<script setup>
import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { Check, Sunny, Moon } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
const themeStore = useThemeStore()
// 当前主题预设
const currentPreset = computed(() => themeStore.appearance.preset || 'default')
// 当前主题预设名称
const currentPresetName = computed(() => {
  const preset = themeStore.themePresets[currentPreset.value]
  return preset ? preset.name : '默认主题'
})
// 主题图标
const themeIcon = computed(() => {
  if (themeStore.isDark) {
    return Moon
  }
  return Sunny
})
// 按钮类型
const _buttonType = computed(() => {
  return themeStore.isDark ? 'warning' : 'primary'
})
// 处理主题切换
const handleThemeChange = (presetId) => {
  try {
    themeStore.applyPreset(presetId)
    
    const preset = themeStore.themePresets[presetId]
    ElMessage.success({
      message: `已切换到 ${preset.name}`,
      duration: 2000
    })
  } catch (error) {
    console.error('切换主题失败:', error)
    ElMessage.error({
      message: '切换主题失败，请重试',
      duration: 2000
    })
  }
}
</script>
<style scoped>
.theme-selector {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  color: var(--el-text-color-primary);
}
.theme-selector:hover .el-icon {
  color: var(--tech-primary);
  animation: themeRotate 0.6s ease;
}
@keyframes themeRotate {
  0% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(180deg) scale(1.1); }
  100% { transform: rotate(360deg) scale(1); }
}
.theme-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 180px;
  padding: 2px 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.theme-item .el-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  transition: all 0.3s ease;
}
.active-theme {
  font-weight: 600;
  color: var(--el-color-primary);
}
/* 下拉菜单优化 */
.theme-dropdown {
  padding: 8px;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
}
:deep(.el-dropdown-menu__item) {
  padding: 10px 16px;
  border-radius: 8px;
  margin: 2px 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
:deep(.el-dropdown-menu__item:not(.is-disabled):hover) {
  background: linear-gradient(90deg, rgba(0, 195, 255, 0.1), rgba(0, 195, 255, 0.05));
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0, 195, 255, 0.2);
}
:deep(.el-dropdown-menu__item:not(.is-disabled):hover .theme-item .el-icon) {
  transform: scale(1.2) rotate(10deg);
  color: var(--tech-primary);
}
:deep(.el-dropdown-menu__item.is-divided) {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}
:deep(.el-dropdown-menu__item.is-disabled) {
  opacity: 0.6;
  cursor: not-allowed;
}
:deep(.el-button.is-circle:active) {
  transform: translateY(0);
}
</style>