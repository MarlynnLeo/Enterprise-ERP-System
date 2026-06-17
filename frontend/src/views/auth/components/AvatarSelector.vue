<template>
  <el-card class="profile-card avatar-frame-panel" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <el-icon class="header-icon"><Brush /></el-icon>
          <span class="header-title">头像动态框</span>
        </div>
        <div v-if="modelValue" class="current-selection">
          <span>当前</span>
          <el-tag type="success">{{ getFrameName(modelValue) }}</el-tag>
        </div>
      </div>
    </template>

    <el-tabs v-model="activeCategory" class="frame-tabs">
      <el-tab-pane
        v-for="category in categories"
        :key="category.name"
        :label="category.label"
        :name="category.name"
      />
    </el-tabs>

    <div class="frames-grid">
      <div
        v-for="frame in filteredFrames"
        :key="frame.id"
        class="frame-tile"
        role="button"
        tabindex="0"
        :class="{
          active: modelValue === frame.id,
          previewing: previewFrame === frame.id
        }"
        @click="selectFrame(frame.id)"
        @keydown.enter.prevent="selectFrame(frame.id)"
        @keydown.space.prevent="selectFrame(frame.id)"
      >
        <span v-if="modelValue === frame.id" class="active-badge">
          <el-icon><StarFilled /></el-icon>
        </span>

        <DecorativeAvatarFrame
          :frame="frame"
          :avatar="avatar"
          :name="name"
          :size="112"
          :avatar-size="72"
          class="tile-preview"
        />

        <span class="frame-name">{{ frame.name }}</span>
        <span class="frame-desc">{{ frame.description }}</span>
        <span class="frame-tags">
          <el-tag
            v-for="tag in frame.tags"
            :key="tag"
            size="small"
            :type="getFrameTagType(tag)"
          >
            {{ tag }}
          </el-tag>
        </span>

        <span class="frame-action">
          <el-button
            v-if="modelValue === frame.id"
            type="success"
            size="small"
            disabled
          >
            <el-icon><Check /></el-icon>
            使用中
          </el-button>
          <el-button
            v-else
            type="primary"
            size="small"
            @click.stop="applyFrame(frame.id)"
          >
            <el-icon><Select /></el-icon>
            应用
          </el-button>
        </span>
      </div>
    </div>

    <el-empty v-if="filteredFrames.length === 0" description="暂无此类头像框" />

    <el-divider content-position="center">
      <el-icon><Brush /></el-icon>
      预览
    </el-divider>

    <div class="large-preview-section">
      <DecorativeAvatarFrame
        :frame="currentPreviewFrame"
        :avatar="avatar"
        :name="name"
        :size="190"
        :avatar-size="120"
      />
      <div class="preview-copy">
        <strong>{{ currentPreviewFrame.name || '默认头像' }}</strong>
        <span>{{ currentPreviewFrame.description || '不使用动态头像框。' }}</span>
      </div>
      <el-button
        type="primary"
        :disabled="modelValue === previewFrame"
        @click="applyFrame(previewFrame)"
      >
        应用当前预览
      </el-button>
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Brush, Check, Select, StarFilled } from '@element-plus/icons-vue'
import DecorativeAvatarFrame from './DecorativeAvatarFrame.vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: 'none'
  },
  avatar: {
    type: String,
    default: ''
  },
  name: {
    type: String,
    default: ''
  },
  frames: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const previewFrame = ref(props.modelValue)
const activeCategory = ref('all')

const categories = [
  { name: 'all', label: '全部' },
  { name: 'featured', label: '推荐' },
  { name: 'image', label: '图片框' },
  { name: 'luxury', label: '华丽' },
  { name: 'tech', label: '科技' },
  { name: 'nature', label: '自然' },
  { name: 'fantasy', label: '梦幻' }
]

const categoryTags = {
  image: ['图片框'],
  luxury: ['华丽', '金色', '火焰', '宝石', '皇冠', '羽翼', '熔岩'],
  tech: ['科技', '直播', '霓虹', '赛博', '星河'],
  nature: ['自然', '海洋', '藤蔓', '樱花', '竹叶', '清新'],
  fantasy: ['月光', '星光', '梦幻', '彩虹', '冰晶', '魔法']
}

const filteredFrames = computed(() => {
  if (activeCategory.value === 'all') {
    return props.frames
  }

  if (activeCategory.value === 'featured') {
    return props.frames.filter(frame => frame.featured)
  }

  const targetTags = categoryTags[activeCategory.value] || []
  return props.frames.filter(frame => frame.tags?.some(tag => targetTags.includes(tag)))
})

const currentPreviewFrame = computed(() => {
  return props.frames.find(frame => frame.id === previewFrame.value) || props.frames[0] || {}
})

watch(() => props.modelValue, (value) => {
  previewFrame.value = value
})

function getFrameName(id) {
  const frame = props.frames.find(item => item.id === id)
  return frame ? frame.name : '默认头像'
}

function getFrameTagType(tag) {
  const typeMap = {
    图片框: 'warning',
    国风: 'danger',
    节庆: 'danger',
    华丽: 'warning',
    皇冠: 'warning',
    宝石: 'success',
    桂冠: 'warning',
    金色: 'warning',
    月光: 'info',
    星光: 'info',
    梦幻: 'primary',
    樱花: 'danger',
    冰晶: 'info',
    彩虹: 'primary',
    熔岩: 'danger',
    竹叶: 'success',
    魔法: 'primary',
    火焰: 'danger',
    羽翼: 'warning',
    海洋: 'primary',
    藤蔓: 'success',
    清新: 'success',
    科技: 'primary',
    赛博: 'primary',
    直播: 'primary',
    霓虹: 'primary',
    自然: 'success',
    星河: 'info',
    简约: 'info'
  }

  return typeMap[tag] || 'info'
}

function selectFrame(id) {
  previewFrame.value = id
}

function applyFrame(id) {
  emit('update:modelValue', id)
  emit('change', id)
  previewFrame.value = id
}
</script>

<style scoped>
.profile-card {
  border-radius: var(--radius-md);
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-lighter);
  box-shadow: var(--shadow-sm);
}

.avatar-frame-panel :deep(.el-card__header) {
  padding: 16px 18px;
}

.avatar-frame-panel :deep(.el-card__body) {
  padding: 18px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.header-left,
.current-selection {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 50%;
  background: var(--color-warning);
  color: var(--color-on-primary);
  font-size: 20px;
}

.header-title {
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 700;
}

.current-selection {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.frame-tabs {
  margin-bottom: 18px;
}

.frame-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background: var(--color-border-lighter);
}

.frame-tabs :deep(.el-tabs__item) {
  font-weight: 700;
}

.frames-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  margin-bottom: 28px;
}

.frame-tile {
  position: relative;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px 14px 16px;
  border: 1px solid var(--color-border-lighter);
  border-radius: var(--radius-md);
  background: var(--color-bg-base);
  color: inherit;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.frame-tile:hover,
.frame-tile.previewing {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.frame-tile:focus-visible {
  outline: 3px solid var(--color-primary-light-5);
  outline-offset: 2px;
}

.frame-tile.active {
  border-color: var(--color-success);
  background: var(--color-success-light);
}

.tile-preview {
  width: 112px;
  height: 112px;
  flex: 0 0 112px;
  margin-bottom: 2px;
}

.frame-name {
  color: var(--color-text-primary);
  font-size: 15px;
  font-weight: 800;
}

.frame-desc {
  min-height: 36px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.frame-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  min-height: 24px;
}

.frame-action {
  display: flex;
  justify-content: center;
  width: 100%;
  margin-top: auto;
}

.active-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  color: var(--color-success);
  font-size: 20px;
}

.large-preview-section {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 22px;
  padding: 26px;
  border: 1px solid var(--color-border-lighter);
  border-radius: var(--radius-md);
  background: var(--color-bg-hover);
}

.preview-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}

.preview-copy strong {
  color: var(--color-text-primary);
  font-size: 18px;
}

.preview-copy span {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .card-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .frames-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .large-preview-section {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
    padding: 20px 16px;
  }

  .preview-copy {
    text-align: center;
  }
}
</style>
