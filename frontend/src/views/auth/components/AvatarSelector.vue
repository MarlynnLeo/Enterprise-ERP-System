<template>
  <el-card class="glass-card avatar-frame-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <el-icon class="header-icon" color="#E6A23C"><Brush /></el-icon>
          <span class="header-title">🎨 头像特效选择</span>
        </div>
        <div class="current-selection" v-if="modelValue">
          <span>当前使用：</span>
          <el-tag type="success">{{ getFrameName(modelValue) }}</el-tag>
        </div>
      </div>
    </template>

    <el-alert
      title="选择你喜欢的头像特效，让个人资料更炫酷"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 20px"
    />

    <!-- 分类标签 -->
    <el-tabs v-model="activeCategory" class="frame-tabs">
      <el-tab-pane v-for="cat in categories" :key="cat.name" :label="cat.label" :name="cat.name">
        <template #label>
          <span class="custom-tab-label">
            <span class="tab-icon">{{ cat.icon }}</span>
            <span>{{ cat.label }}</span>
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>

    <!-- 特效网格 -->
    <div class="frames-grid">
      <div
        v-for="frame in filteredFrames"
        :key="frame.id"
        class="frame-item"
        :class="{ 'active': modelValue === frame.id }"
        @click="selectFrame(frame.id)"
      >
        <div class="frame-preview">
          <div class="avatar-frame-container" style="position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 2;">
              <Vue3Lottie
                v-if="frame.animationData"
                :animationData="frame.animationData"
                :height="85"
                :width="85"
              />
            </div>
            <el-avatar
              :size="70"
              :src="avatar || '/default-avatar.png'"
              class="preview-avatar"
              style="position: relative; z-index: 1;"
            >
              {{ name ? name[0].toUpperCase() : 'U' }}
            </el-avatar>
          </div>
        </div>

        <div class="frame-info">
          <h3>{{ frame.name }}</h3>
          <p class="frame-desc">{{ frame.description }}</p>
          <div class="frame-tags">
            <el-tag v-for="tag in frame.tags" :key="tag" size="small" :type="getFrameTagType(tag)">
              {{ tag }}
            </el-tag>
          </div>
        </div>

        <div class="frame-actions">
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
            选择
          </el-button>
        </div>

        <div v-if="modelValue === frame.id" class="active-badge">
          <el-icon><StarFilled /></el-icon>
        </div>
      </div>
    </div>

    <!-- 无结果提示 -->
    <el-empty v-if="filteredFrames.length === 0" description="暂无此类特效" />

    <!-- 实时预览 -->
    <el-divider content-position="center">
      <el-icon><Brush /></el-icon> 实时预览
    </el-divider>

    <div class="large-preview-section">
      <div class="large-preview">
        <div class="preview-container-large" style="position: relative; width: 140px; height: 140px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 2;">
            <Vue3Lottie
              v-if="getCurrentPreviewFrame.animationData"
              :animationData="getCurrentPreviewFrame.animationData"
              :height="140"
              :width="140"
            />
          </div>
          <el-avatar
            :size="120"
            :src="avatar || '/default-avatar.png'"
            class="large-preview-avatar"
            style="position: relative; z-index: 1;"
          >
            {{ name ? name[0].toUpperCase() : 'U' }}
          </el-avatar>
        </div>
      </div>
      <div class="preview-info">
        <el-alert
          :title="`预览：${getFrameName(previewFrame)}`"
          type="info"
          :closable="false"
          show-icon
        />
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Brush, Check, Select, StarFilled } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: 'frame1'
  },
  avatar: String,
  name: String,
  frames: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const previewFrame = ref(props.modelValue)
const activeCategory = ref('all')

const categories = [
  { name: 'all', label: '全部', icon: '📋' },
  { name: 'magic', label: '魔法', icon: '🪄' },
  { name: 'tech', label: '科技', icon: '🚀' },
  { name: 'nature', label: '自然', icon: '🌿' },
  { name: 'fun', label: '趣味', icon: '🎨' }
]

const categoryTags = {
  magic: ['魔法', '神圣', '神秘', '黑暗', '光效'],
  tech: ['科技', '赛博', '军事', '宇宙', '未来', '动态', '故障'],
  nature: ['星空', '火焰', '雷电', '自然', '冰雪', '熔岩', '唯美', '清新', '森系', '能量', '光影'],
  fun: ['复古', '彩虹', '机械', '潮流', '可爱', '光明', '奢华', '黑客', '简约', '极简', '水墨', '趣味', '设计', '生活', '爱心', '炫彩', '硬核', '酷炫', '霸气']
}

const filteredFrames = computed(() => {
  if (activeCategory.value === 'all') {
    return props.frames
  }

  const targetTags = categoryTags[activeCategory.value] || []
  return props.frames.filter(frame => {
    return frame.tags.some(tag => targetTags.includes(tag))
  })
})

const getFrameName = (id) => {
  const frame = props.frames.find(f => f.id === id)
  return frame ? frame.name : '默认特效'
}

const getCurrentPreviewFrame = computed(() => {
  return props.frames.find(f => f.id === previewFrame.value) || {}
})

const getFrameTagType = (tag) => {
  const typeMap = {
    '魔法': 'warning', '神圣': 'warning', '黑暗': 'info',
    '科技': 'primary', '赛博': 'primary', '未来': 'primary',
    '自然': 'success', '火焰': 'danger', '雷电': 'danger',
    '趣味': 'success', '可爱': 'danger', '复古': 'info'
  }
  return typeMap[tag] || 'info'
}

const selectFrame = (id) => {
  previewFrame.value = id
}

const applyFrame = (id) => {
  emit('update:modelValue', id)
  emit('change', id)
  previewFrame.value = id
}
</script>

<style scoped>
.glass-card {
  border-radius: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-size: 20px;
  background: var(--el-fill-color-light);
  padding: 8px;
  border-radius: 8px;
  box-sizing: content-box;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.current-selection {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.frames-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.frame-item {
  position: relative;
  border: 2px solid var(--el-border-color-lighter);
  border-radius: 16px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.3s;
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  overflow: visible;
}

.frame-item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  transform: translateY(-4px);
}

.frame-item.active {
  border-color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.frame-preview {
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-frame-container {
  transform: scale(0.8);
}

.frame-info {
  text-align: center;
  flex: 1;
}

.frame-info h3 {
  margin: 0 0 8px;
  font-size: 16px;
  color: var(--el-text-color-primary);
}

.frame-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  height: 36px;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.frame-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.frame-actions {
  width: 100%;
  display: flex;
  justify-content: center;
}

.active-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  color: var(--el-color-success);
  font-size: 20px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.large-preview-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 30px;
  background: var(--el-fill-color-lighter);
  border-radius: 16px;
}

.large-preview {
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-container-large {
  transform: scale(1);
}

.effect-wrapper :deep(.el-avatar),
.effect-wrapper-large :deep(.el-avatar) {
  position: relative;
  z-index: 2;
}
</style>
