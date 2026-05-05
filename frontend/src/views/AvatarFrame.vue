<template>
  <div class="avatar-frame-page">
    <!-- 页面头部 -->
    <div class="page-header-section">
      <div class="header-content">
        <h1 class="page-title">🎨 头像特效选择</h1>
        <p class="page-subtitle">选择你喜欢的头像特效，让个人资料更炫酷</p>
      </div>
      <div class="current-frame-badge" v-if="currentFrame">
        <span class="badge-label">当前使用</span>
        <el-tag type="success" effect="dark">{{ getFrameName(currentFrame) }}</el-tag>
      </div>
    </div>
    <!-- 实时预览区 -->
    <div class="preview-section-main">
      <el-card class="preview-card-main" shadow="hover">
        <div class="preview-content">
          <div class="preview-left">
            <h3>实时预览</h3>
            <div class="large-preview">
              <div class="preview-container" :data-frame="selectedPreviewFrame">
                <component :is="'div'" :class="`effect-wrapper-large effect-${selectedPreviewFrame}`">
                  <el-avatar
                    :size="140"
                    :src="userAvatar"
                    class="large-preview-avatar"
                  >
                    {{ userStore.user?.real_name?.charAt(0) || 'U' }}
                  </el-avatar>
                </component>
              </div>
            </div>
          </div>
          <div class="preview-right">
            <div class="preview-info-box">
              <h4>{{ getFrameName(selectedPreviewFrame) }}</h4>
              <p class="preview-desc">{{ getFrameDescription(selectedPreviewFrame) }}</p>
              <div class="preview-tags">
                <el-tag v-for="tag in getFrameTags(selectedPreviewFrame)" :key="tag" size="small" :type="getTagType(tag)">
                  {{ tag }}
                </el-tag>
              </div>
              <el-button
                v-if="currentFrame !== selectedPreviewFrame"
                type="primary"
                size="large"
                class="apply-btn"
                @click="applyFrame(selectedPreviewFrame)"
              >
                <el-icon><Select /></el-icon>
                应用此特效
              </el-button>
              <el-button
                v-else
                type="success"
                size="large"
                disabled
                class="apply-btn"
              >
                <el-icon><Check /></el-icon>
                已使用
              </el-button>
            </div>
          </div>
        </div>
      </el-card>
    </div>
    <!-- 特效画廊 -->
    <el-card class="frame-gallery" shadow="hover">
      <template #header>
        <div class="gallery-header">
          <h2>✨ 特效画廊</h2>
          <div class="gallery-stats">
            <span class="stat-item">共 {{ frames.length }} 个特效</span>
          </div>
        </div>
      </template>
      <div class="frames-grid">
        <div
          v-for="frame in frames"
          :key="frame.id"
          class="frame-item"
          :class="{ 'active': currentFrame === frame.id, 'selected': selectedPreviewFrame === frame.id }"
          @click="selectFrame(frame.id)"
        >
          <div class="frame-preview">
            <div class="avatar-container" :data-frame="frame.id">
              <component :is="'div'" :class="`effect-wrapper effect-${frame.id}`">
                <el-avatar
                  :size="80"
                  :src="userAvatar"
                  class="preview-avatar"
                >
                  {{ userStore.user?.real_name?.charAt(0) || 'U' }}
                </el-avatar>
              </component>
            </div>
          </div>
          <div class="frame-info">
            <h3>{{ frame.name }}</h3>
            <p class="frame-desc">{{ frame.description }}</p>
            <div class="frame-tags">
              <el-tag v-for="tag in frame.tags" :key="tag" size="small" :type="getTagType(tag)">
                {{ tag }}
              </el-tag>
            </div>
          </div>
          <div class="frame-actions">
            <el-button
              v-if="currentFrame === frame.id"
              type="success"
              size="small"
              disabled
              class="action-btn"
            >
              <el-icon><Check /></el-icon>
              使用中
            </el-button>
            <el-button
              v-else
              type="primary"
              size="small"
              @click.stop="applyFrame(frame.id)"
              class="action-btn"
            >
              <el-icon><Select /></el-icon>
              选择
            </el-button>
          </div>
          <div v-if="currentFrame === frame.id" class="active-badge">
            <el-icon><StarFilled /></el-icon>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Select, StarFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
const userStore = useAuthStore()
// 当前选中的特效
const currentFrame = ref('frame1')
const selectedPreviewFrame = ref('frame1')
// 用户头像
const userAvatar = computed(() => {
  return userStore.user?.avatar || ''
})
// 10种不同的特效框架
const frames = ref([
  {
    id: 'frame1',
    name: '梦幻法术圈',
    description: '3D旋转光线与魔法光圈的完美结合，充满神秘感',
    tags: ['3D', '梦幻', '魔法']
  },
  {
    id: 'frame2',
    name: '霓虹脉冲',
    description: '赛博朋克风格的霓虹灯效果，科技感十足',
    tags: ['科技', '霓虹', '动感']
  },
  {
    id: 'frame3',
    name: '星空粒子',
    description: '闪烁的星空粒子环绕，浪漫而优雅',
    tags: ['星空', '浪漫', '粒子']
  },
  {
    id: 'frame4',
    name: '火焰光环',
    description: '燃烧的火焰特效，热情而充满能量',
    tags: ['火焰', '热情', '能量']
  },
  {
    id: 'frame5',
    name: '冰霜水晶',
    description: '冰冷的水晶特效，清冷而高贵',
    tags: ['冰霜', '水晶', '高贵']
  },
  {
    id: 'frame6',
    name: '黄金荣耀',
    description: '金色光芒闪耀，彰显尊贵与荣耀',
    tags: ['黄金', '尊贵', '荣耀']
  },
  {
    id: 'frame7',
    name: '雷电风暴',
    description: '电光闪烁的风暴特效，强大而震撼',
    tags: ['雷电', '风暴', '强大']
  },
  {
    id: 'frame8',
    name: '彩虹光谱',
    description: '七彩光谱流动，色彩缤纷活泼',
    tags: ['彩虹', '多彩', '活泼']
  },
  {
    id: 'frame9',
    name: '暗影之力',
    description: '黑暗与紫色的神秘力量，低调而神秘',
    tags: ['暗影', '神秘', '低调']
  },
  {
    id: 'frame10',
    name: '简约清新',
    description: '简洁的呼吸光效，清新自然',
    tags: ['简约', '清新', '自然']
  }
])
// 获取特效名称
const getFrameName = (frameId) => {
  const frame = frames.value.find(f => f.id === frameId)
  return frame ? frame.name : '未知特效'
}
// 获取特效描述
const getFrameDescription = (frameId) => {
  const frame = frames.value.find(f => f.id === frameId)
  return frame ? frame.description : '暂无描述'
}
// 获取特效标签
const getFrameTags = (frameId) => {
  const frame = frames.value.find(f => f.id === frameId)
  return frame ? frame.tags : []
}
// 获取标签类型
const getTagType = (tag) => {
  const tagTypes = {
    '3D': 'primary',
    '梦幻': 'success',
    '魔法': 'warning',
    '科技': 'info',
    '霓虹': 'danger',
    '动感': 'primary',
    '星空': 'primary',
    '浪漫': 'danger',
    '粒子': 'warning',
    '火焰': 'danger',
    '热情': 'danger',
    '能量': 'warning',
    '冰霜': 'info',
    '水晶': 'primary',
    '高贵': 'success',
    '黄金': 'warning',
    '尊贵': 'warning',
    '荣耀': 'success',
    '雷电': 'info',
    '风暴': 'primary',
    '强大': 'danger',
    '彩虹': 'success',
    '多彩': 'warning',
    '活泼': 'success',
    '暗影': '',
    '神秘': 'info',
    '低调': '',
    '简约': 'info',
    '清新': 'success',
    '自然': 'success'
  }
  return tagTypes[tag] || 'info'
}
// 选择特效（仅预览）
const selectFrame = (frameId) => {
  selectedPreviewFrame.value = frameId
}
// 应用特效（保存）
const applyFrame = async (frameId) => {
  try {
    // 调用API保存用户选择
    const _response = await api.post('/auth/profile/avatar-frame', {
      frameId
    })
    currentFrame.value = frameId
    selectedPreviewFrame.value = frameId
    // 更新本地存储
    localStorage.setItem('userAvatarFrame', frameId)
    // 刷新用户数据以获取最新的avatar_frame
    await userStore.fetchUserProfile(false)
    ElMessage.success('头像特效已更新！')
  } catch {
    ElMessage.error('保存失败，请重试')
  }
}
// 加载用户当前的特效
onMounted(async () => {
  try {
    // 从API获取用户当前的特效设置
    const response = await api.get('/auth/profile')
    if (response.data.avatar_frame) {
      currentFrame.value = response.data.avatar_frame
      selectedPreviewFrame.value = response.data.avatar_frame
    } else {
      // 如果没有设置，尝试从本地存储读取
      const savedFrame = localStorage.getItem('userAvatarFrame')
      if (savedFrame) {
        currentFrame.value = savedFrame
        selectedPreviewFrame.value = savedFrame
      }
    }
  } catch (error) {
    console.error('加载特效设置失败:', error)
    // 使用本地存储作为后备
    const savedFrame = localStorage.getItem('userAvatarFrame')
    if (savedFrame) {
      currentFrame.value = savedFrame
      selectedPreviewFrame.value = savedFrame
    }
  }
})
</script>
<style scoped>
.avatar-frame-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
  border-radius: var(--radius-md);
}
/* 页面头部 */
.page-header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding: 30px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: var(--radius-lg);
  color: var(--color-on-primary, #fff);
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
}
.header-content {
  flex: 1;
}
.page-title {
  font-size: 36px;
  margin: 0 0 8px 0;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.page-subtitle {
  font-size: 16px;
  opacity: 0.9;
  margin: 0;
  font-weight: 300;
}
.current-frame-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-md);
  backdrop-filter: blur(10px);
}
.badge-label {
  font-size: 14px;
  font-weight: 500;
}
/* 实时预览区 */
.preview-section-main {
  margin-bottom: 30px;
}
.preview-card-main {
  background: white;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}
.preview-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  padding: 40px;
  align-items: center;
}
.preview-left {
  text-align: center;
}
.preview-left h3 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 20px 0;
  color: var(--el-text-color-primary);
}
.large-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
  background: radial-gradient(circle, rgba(102, 126, 234, 0.05) 0%, transparent 70%);
  border-radius: var(--radius-lg);
  border: 2px dashed rgba(102, 126, 234, 0.2);
}
.preview-container {
  position: relative;
  width: 220px;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-right {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.preview-info-box {
  padding: 20px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
  border-radius: var(--radius-lg);
  border-left: 4px solid #667eea;
}
.preview-info-box h4 {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: var(--el-text-color-primary);
}
.preview-desc {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  margin: 0 0 16px 0;
}
.preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: var(--spacing-lg);
}
.apply-btn {
  width: 100%;
  height: 40px;
  font-size: 16px;
  font-weight: 500;
}
/* 特效画廊 */
.frame-gallery {
  background: white;
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}
.gallery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-lg);
}
.gallery-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.gallery-stats {
  display: flex;
  gap: var(--spacing-lg);
}
.stat-item {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  padding: 6px 12px;
  background: var(--el-fill-color-light);
  border-radius: var(--radius-base);
}
.frames-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--spacing-lg);
}
.frame-item {
  position: relative;
  border: 2px solid var(--el-border-color);
  border-radius: var(--radius-lg);
  padding: 20px;
  cursor: pointer;
  transition: all var(--transition-base) cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--el-bg-color);
  overflow: hidden;
}
.frame-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.5s ease;
  z-index: 1;
}
.frame-item:hover::before {
  left: 100%;
}
.frame-item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.2);
  transform: translateY(-4px);
}
.frame-item.active {
  border-color: var(--el-color-success);
  background: linear-gradient(135deg, rgba(103, 194, 58, 0.08) 0%, rgba(103, 194, 58, 0.03) 100%);
  box-shadow: 0 4px 12px rgba(103, 194, 58, 0.15);
}
.frame-item.selected {
  border-color: var(--el-color-primary);
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(102, 126, 234, 0.03) 100%);
}
.frame-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 30px 20px;
  background: radial-gradient(circle, rgba(0, 0, 0, 0.02) 0%, transparent 70%);
  border-radius: var(--radius-md);
  margin-bottom: 15px;
  min-height: 160px;
  position: relative;
  z-index: 2;
}
.avatar-container {
  position: relative;
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.effect-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-avatar {
  position: relative;
  z-index: 10;
}
.frame-info {
  margin-bottom: 15px;
  position: relative;
  z-index: 2;
}
.frame-info h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.frame-desc {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.frame-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 15px;
}
.frame-actions {
  display: flex;
  justify-content: center;
  position: relative;
  z-index: 2;
}
.action-btn {
  width: 100%;
}
.active-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #67C23A 0%, #85CE61 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-on-primary, #fff);
  font-size: 20px;
  box-shadow: 0 4px 12px rgba(103, 194, 58, 0.4);
  z-index: 3;
  animation: badgePulse 2s ease-in-out infinite;
}
@keyframes badgePulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 4px 12px rgba(103, 194, 58, 0.4);
  }
  50% {
    transform: scale(1.1);
    box-shadow: 0 6px 16px rgba(103, 194, 58, 0.6);
  }
}
.effect-wrapper-large {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.large-preview-avatar {
  position: relative;
  z-index: 10;
}
/* 响应式设计 */
@media (max-width: 1024px) {
  .preview-content {
    grid-template-columns: 1fr;
    gap: 30px;
  }
  .page-header-section {
    flex-direction: column;
    text-align: center;
    gap: var(--spacing-lg);
  }
  .current-frame-badge {
    justify-content: center;
  }
}
@media (max-width: 768px) {
  .avatar-frame-page {
    padding: 12px;
  }
  .page-header-section {
    padding: 20px;
  }
  .page-title {
    font-size: 28px;
  }
  .frames-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--spacing-base);
  }
  .preview-content {
    padding: 20px;
  }
}
/* ========== 特效1: 梦幻法术圈 (原始特效) ========== */
.effect-frame1 {
  position: relative;
}
.effect-frame1::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 110px;
  height: 110px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: rgba(99, 102, 241, 0.8);
  border-right-color: rgba(139, 92, 246, 0.6);
  border-bottom-color: rgba(99, 102, 241, 0.4);
  animation: rotate360 4s linear infinite;
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
}
.effect-frame1::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent,
    rgba(99, 102, 241, 0.3),
    rgba(139, 92, 246, 0.2),
    transparent
  );
  animation: rotate360 3s linear infinite reverse;
  filter: blur(5px);
}
@keyframes rotate360 {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
/* 大尺寸版本 */
.effect-wrapper-large.effect-frame1::before {
  width: 180px;
  height: 180px;
  border-width: 4px;
  box-shadow: 0 0 30px rgba(99, 102, 241, 0.4);
}
.effect-wrapper-large.effect-frame1::after {
  width: 160px;
  height: 160px;
}
/* ========== 特效2: 霓虹脉冲 ========== */
.effect-frame2::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 2px solid rgba(0, 255, 255, 0.5);
  box-shadow:
    0 0 15px rgba(0, 255, 255, 0.8),
    0 0 30px rgba(255, 0, 255, 0.6),
    inset 0 0 15px rgba(0, 255, 255, 0.3);
  animation: neonPulse 2s ease-in-out infinite;
}
@keyframes neonPulse {
  0%, 100% {
    box-shadow:
      0 0 15px rgba(0, 255, 255, 0.8),
      0 0 30px rgba(255, 0, 255, 0.6),
      inset 0 0 15px rgba(0, 255, 255, 0.3);
    border-color: rgba(0, 255, 255, 0.5);
  }
  50% {
    box-shadow:
      0 0 25px rgba(0, 255, 255, 1),
      0 0 50px rgba(255, 0, 255, 0.8),
      inset 0 0 25px rgba(0, 255, 255, 0.6);
    border-color: rgba(0, 255, 255, 0.8);
  }
}
.effect-wrapper-large.effect-frame2::before {
  width: 160px;
  height: 160px;
  border-width: 3px;
}
/* ========== 特效3: 星空粒子 ========== */
.effect-frame3 {
  position: relative;
}
.effect-frame3::before,
.effect-frame3::after {
  content: '✨';
  position: absolute;
  font-size: 16px;
  animation: starFloat 3s ease-in-out infinite;
}
.effect-frame3::before {
  top: 10%;
  left: 10%;
  animation-delay: 0s;
}
.effect-frame3::after {
  bottom: 10%;
  right: 10%;
  animation-delay: 1.5s;
}
@keyframes starFloat {
  0%, 100% {
    transform: translateY(0px) scale(1);
    opacity: 0.6;
  }
  50% {
    transform: translateY(-10px) scale(1.2);
    opacity: 1;
  }
}
/* ========== 特效4: 火焰光环 ========== */
.effect-frame4::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    rgba(255, 100, 0, 0.7),
    rgba(255, 200, 0, 0.9),
    rgba(255, 50, 0, 0.7),
    rgba(255, 100, 0, 0.7)
  );
  animation: flameRotate 2s linear infinite;
  filter: blur(8px);
  box-shadow: 0 0 25px rgba(255, 100, 0, 0.5);
}
@keyframes flameRotate {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
.effect-wrapper-large.effect-frame4::before {
  width: 160px;
  height: 160px;
  box-shadow: 0 0 35px rgba(255, 100, 0, 0.6);
}
/* ========== 特效5: 冰霜水晶 ========== */
.effect-frame5 {
  position: relative;
}
.effect-frame5::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(0deg);
  width: 110px;
  height: 110px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: rgba(100, 200, 255, 0.9);
  border-right-color: rgba(150, 220, 255, 0.7);
  border-bottom-color: rgba(100, 200, 255, 0.5);
  animation: crystalSpin 4s linear infinite;
  box-shadow: 0 0 20px rgba(100, 200, 255, 0.4);
}
.effect-frame5::after {
  content: '❄️';
  position: absolute;
  top: 5px;
  right: 5px;
  font-size: 20px;
  animation: snowFlake 3s ease-in-out infinite;
  filter: drop-shadow(0 0 4px rgba(100, 200, 255, 0.6));
}
@keyframes crystalSpin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
@keyframes snowFlake {
  0%, 100% { transform: rotate(0deg) scale(1); opacity: 0.8; }
  50% { transform: rotate(180deg) scale(1.2); opacity: 1; }
}
.effect-wrapper-large.effect-frame5::before {
  width: 180px;
  height: 180px;
  border-width: 4px;
  box-shadow: 0 0 30px rgba(100, 200, 255, 0.5);
}
/* ========== 特效6: 黄金荣耀 ========== */
.effect-frame6::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 215, 0, 0.5) 0%,
    rgba(255, 193, 7, 0.3) 50%,
    transparent 70%
  );
  border: 2px solid rgba(255, 215, 0, 0.3);
  animation: goldenGlow 2s ease-in-out infinite;
}
@keyframes goldenGlow {
  0%, 100% {
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.6), inset 0 0 10px rgba(255, 215, 0, 0.2);
    transform: translate(-50%, -50%) scale(1);
    border-color: rgba(255, 215, 0, 0.3);
  }
  50% {
    box-shadow: 0 0 40px rgba(255, 215, 0, 0.8), inset 0 0 20px rgba(255, 215, 0, 0.3);
    transform: translate(-50%, -50%) scale(1.1);
    border-color: rgba(255, 215, 0, 0.6);
  }
}
.effect-wrapper-large.effect-frame6::before {
  width: 160px;
  height: 160px;
  border-width: 3px;
}
/* ========== 特效7: 雷电风暴 ========== */
.effect-frame7 {
  position: relative;
}
.effect-frame7::before {
  content: '⚡';
  position: absolute;
  top: -5px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 28px;
  animation: lightning 1.5s ease-in-out infinite;
  filter: drop-shadow(0 0 6px rgba(100, 150, 255, 0.8));
}
.effect-frame7::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 2px solid rgba(100, 150, 255, 0.7);
  box-shadow: 0 0 15px rgba(100, 150, 255, 0.5);
  animation: electricPulse 1.5s ease-in-out infinite;
}
@keyframes lightning {
  0%, 90%, 100% { opacity: 0; transform: translateX(-50%) scale(0.8); }
  95% { opacity: 1; transform: translateX(-50%) scale(1); }
}
@keyframes electricPulse {
  0%, 100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.6;
    box-shadow: 0 0 15px rgba(100, 150, 255, 0.5);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.15);
    opacity: 1;
    box-shadow: 0 0 30px rgba(100, 150, 255, 0.8);
  }
}
.effect-wrapper-large.effect-frame7::after {
  width: 160px;
  height: 160px;
  border-width: 3px;
  box-shadow: 0 0 25px rgba(100, 150, 255, 0.6);
}
/* ========== 特效8: 彩虹光谱 ========== */
.effect-frame8::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    red, orange, yellow, green, cyan, blue, indigo, violet, red
  );
  animation: rainbowSpin 5s linear infinite;
  opacity: 0.4;
  filter: blur(6px);
  box-shadow: 0 0 20px rgba(255, 100, 200, 0.3);
}
@keyframes rainbowSpin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
.effect-wrapper-large.effect-frame8::before {
  width: 160px;
  height: 160px;
  opacity: 0.5;
  box-shadow: 0 0 30px rgba(255, 100, 200, 0.4);
}
/* ========== 特效9: 暗影之力 ========== */
.effect-frame9::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(75, 0, 130, 0.5) 0%,
    rgba(25, 0, 51, 0.7) 50%,
    transparent 70%
  );
  border: 2px solid rgba(138, 43, 226, 0.3);
  animation: shadowPulse 3s ease-in-out infinite;
}
@keyframes shadowPulse {
  0%, 100% {
    box-shadow: 0 0 20px rgba(75, 0, 130, 0.8), inset 0 0 10px rgba(138, 43, 226, 0.2);
    border-color: rgba(138, 43, 226, 0.3);
  }
  50% {
    box-shadow: 0 0 40px rgba(138, 43, 226, 0.9), inset 0 0 20px rgba(138, 43, 226, 0.3);
    border-color: rgba(138, 43, 226, 0.6);
  }
}
.effect-wrapper-large.effect-frame9::before {
  width: 160px;
  height: 160px;
  border-width: 3px;
}
/* ========== 特效10: 简约清新 ========== */
.effect-frame10::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 2px solid rgba(64, 158, 255, 0.4);
  box-shadow: 0 0 12px rgba(64, 158, 255, 0.2);
  animation: breathe 3s ease-in-out infinite;
}
@keyframes breathe {
  0%, 100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.6;
    border-color: rgba(64, 158, 255, 0.4);
    box-shadow: 0 0 12px rgba(64, 158, 255, 0.2);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.08);
    opacity: 1;
    border-color: rgba(64, 158, 255, 0.7);
    box-shadow: 0 0 20px rgba(64, 158, 255, 0.4);
  }
}
.effect-wrapper-large.effect-frame10::before {
  width: 160px;
  height: 160px;
  border-width: 3px;
}
</style>