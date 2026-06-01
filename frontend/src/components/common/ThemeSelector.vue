<template>
  <el-dropdown @command="handleThemeChange" trigger="click" placement="bottom-end">
    <button class="theme-selector" type="button" :aria-label="currentPresetAriaLabel">
      <el-icon :size="20">
        <component :is="themeIcon" />
      </el-icon>
    </button>

    <template #dropdown>
      <el-dropdown-menu class="theme-dropdown">
        <el-dropdown-item disabled>
          <div class="theme-dropdown__title">选择主题</div>
        </el-dropdown-item>

        <el-dropdown-item
          v-for="preset in themePresetList"
          :key="preset.id"
          :command="preset.id"
          :divided="preset.id === firstPresetId"
        >
          <div class="theme-item" :class="{ 'is-active': currentPreset === preset.id }">
            <span class="theme-item__check" aria-hidden="true">
              <el-icon v-if="currentPreset === preset.id">
                <Check />
              </el-icon>
            </span>
            <el-icon class="theme-item__icon">
              <component :is="preset.icon" />
            </el-icon>
            <span class="theme-item__content">
              <span class="theme-item__name">{{ preset.name }}</span>
              <span class="theme-item__description">{{ preset.description }}</span>
            </span>
          </div>
        </el-dropdown-item>

        <el-dropdown-item divided disabled>
          <div class="theme-dropdown__current">当前：{{ currentPresetName }}</div>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup>
import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { Check, Moon, Sunny } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const themeStore = useThemeStore()

const themePresetList = computed(() => themeStore.themePresetList)
const firstPresetId = computed(() => themePresetList.value[0]?.id)
const currentPreset = computed(() => themeStore.appearance.preset || themeStore.currentPreset.id)
const currentPresetName = computed(() => themeStore.currentPreset.name)
const currentPresetAriaLabel = computed(() => `当前主题：${currentPresetName.value}`)

const themeIcon = computed(() => {
  return themeStore.isDark ? Moon : Sunny
})

const handleThemeChange = async (presetId) => {
  const preset = themeStore.themePresets[presetId]
  if (!preset) {
    ElMessage.error({
      message: '主题不存在，请刷新后重试',
      duration: 2000
    })
    return
  }

  const synced = await themeStore.applyPreset(presetId)
  if (synced) {
    ElMessage.success({
      message: `已切换到 ${preset.name}`,
      duration: 1800
    })
  } else {
    ElMessage.warning({
      message: `已本地切换到 ${preset.name}，服务器同步失败`,
      duration: 2400
    })
  }
}
</script>

<style scoped>
.theme-selector {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md, var(--radius-md));
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color var(--transition-base),
    border-color var(--transition-base),
    color var(--transition-base);
}

.theme-selector:hover,
.theme-selector:focus-visible {
  color: var(--shell-accent, var(--color-primary));
  background: var(--shell-control-hover-bg, var(--color-bg-hover));
  border-color: var(--shell-control-border, var(--color-border-light));
  outline: none;
}

.theme-dropdown {
  min-width: 248px;
  padding: 8px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--shell-radius-md, var(--radius-md));
  background: var(--color-bg-base);
  box-shadow: var(--shadow-lg);
}

.theme-dropdown__title {
  width: 100%;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.theme-dropdown__current {
  font-size: 12px;
  color: var(--color-text-secondary);
}

:deep(.el-dropdown-menu__item) {
  min-height: 44px;
  padding: 8px 10px;
  border-radius: var(--shell-radius-sm, var(--radius-sm));
  margin: 2px 0;
  line-height: 1.35;
  transition:
    background-color var(--transition-base),
    color var(--transition-base);
}

:deep(.el-dropdown-menu__item:not(.is-disabled):hover) {
  background: var(--color-primary-light-9);
}

:deep(.el-dropdown-menu__item.is-divided) {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-lighter);
}

:deep(.el-dropdown-menu__item.is-disabled) {
  cursor: default;
  opacity: 1;
}

.theme-item {
  display: grid;
  grid-template-columns: 18px 24px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 212px;
  color: var(--color-text-regular);
}

.theme-item__check,
.theme-item__icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--shell-accent, var(--color-primary));
}

.theme-item__icon {
  width: 24px;
  height: 24px;
  color: var(--color-text-secondary);
}

.theme-item__content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.theme-item__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.theme-item__description {
  max-width: 168px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.theme-item.is-active .theme-item__name,
.theme-item.is-active .theme-item__icon {
  color: var(--shell-accent, var(--color-primary));
}
</style>
