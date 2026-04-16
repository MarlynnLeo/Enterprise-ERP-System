<!--
/**
 * Profile.vue
 * @description 移动端个人中心页面 - Glassmorphism 风格
 * @date 2025-12-29
 * @version 2.0.0
 */
-->
<template>
  <div class="profile-page">
    <!-- 背景模糊层 -->
    <div class="bg-overlay"></div>

    <!-- 顶部用户信息卡片 -->
    <div class="profile-header">
      <div class="header-bg"></div>

      <div class="user-card">
        <div class="avatar-section" @click="handleUploadAvatar">
          <div class="avatar-container">
            <img v-if="userInfo.avatar" :src="userInfo.avatar" alt="用户头像" class="avatar-img" />
            <div v-else class="avatar-placeholder">
              <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div class="avatar-badge">
              <Icon name="camera" size="0.875rem" />
            </div>
          </div>
        </div>

        <div class="user-info">
          <h2 class="user-name">{{ userName }}</h2>
          <p class="user-role">{{ userRole }}</p>
          <div class="user-meta">
            <span class="meta-item">
              <Icon name="mail" size="0.875rem" />
              {{ userInfo.email || '未设置邮箱' }}
            </span>
            <span class="meta-item">
              <Icon name="phone" size="0.875rem" />
              {{ userInfo.phone || '未设置手机' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 主要内容区域 -->
    <div class="page-content">
      <!-- 统计数据 -->
      <div class="stats-section">
        <h3 class="section-title">我的数据</h3>
        <div class="stats-grid">
          <div class="stat-card" @click="router.push('/production/tasks')">
            <div class="stat-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
              <Icon name="clipboard-check" size="1.25rem" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.tasks || 0 }}</div>
              <div class="stat-label">我的任务</div>
            </div>
          </div>

          <div class="stat-card" @click="router.push('/production/report/history')">
            <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
              <Icon name="document-text" size="1.25rem" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.reports || 0 }}</div>
              <div class="stat-label">报工记录</div>
            </div>
          </div>

          <div class="stat-card" @click="router.push('/quality/inspections')">
            <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
              <Icon name="shield-check" size="1.25rem" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.inspections || 0 }}</div>
              <div class="stat-label">质检记录</div>
            </div>
          </div>

          <div class="stat-card" @click="router.push('/inventory/operations')">
            <div class="stat-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
              <Icon name="cube" size="1.25rem" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.operations || 0 }}</div>
              <div class="stat-label">库存操作</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 个人信息 -->
      <div class="info-section">
        <h3 class="section-title">个人信息</h3>
        <div class="info-card">
          <div class="info-item">
            <span class="info-label">用户名</span>
            <span class="info-value">{{ userInfo.username || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">真实姓名</span>
            <span class="info-value">{{ userInfo.real_name || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">部门</span>
            <span class="info-value">{{ userInfo.department_name || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">职位</span>
            <span class="info-value">{{ userInfo.position || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">注册时间</span>
            <span class="info-value">{{ formatDate(userInfo.created_at) }}</span>
          </div>
        </div>
      </div>

      <!-- 功能菜单 -->
      <div class="menu-section">
        <h3 class="section-title">功能设置</h3>
        <div class="menu-card">
          <div class="menu-item" @click="handleEditProfile">
            <div class="menu-icon">
              <Icon name="pencil" size="1.125rem" />
            </div>
            <span class="menu-label">编辑资料</span>
            <Icon name="chevron-right" size="1rem" class-name="menu-arrow" />
          </div>

          <div class="menu-item" @click="handleChangePassword">
            <div class="menu-icon">
              <Icon name="lock-closed" size="1.125rem" />
            </div>
            <span class="menu-label">修改密码</span>
            <Icon name="chevron-right" size="1rem" class-name="menu-arrow" />
          </div>

          <div class="menu-item" @click="router.push('/settings')">
            <div class="menu-icon">
              <Icon name="cog" size="1.125rem" />
            </div>
            <span class="menu-label">系统设置</span>
            <Icon name="chevron-right" size="1rem" class-name="menu-arrow" />
          </div>

          <div class="menu-item" @click="router.push('/about')">
            <div class="menu-icon">
              <Icon name="information-circle" size="1.125rem" />
            </div>
            <span class="menu-label">关于我们</span>
            <Icon name="chevron-right" size="1rem" class-name="menu-arrow" />
          </div>
        </div>
      </div>

      <!-- 退出登录按钮 -->
      <div class="logout-section">
        <van-button class="logout-btn" block @click="handleLogout">
          <Icon name="logout" size="1.125rem" style="margin-right: 0.5rem;" />
          退出登录
        </van-button>
      </div>
    </div>

    <!-- 头像上传弹窗 -->
    <van-popup v-model:show="showAvatarUpload" position="bottom" round>
      <div class="avatar-upload-popup">
        <div class="popup-header">
          <h3>更换头像</h3>
          <button class="close-btn" @click="showAvatarUpload = false">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="popup-content">
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            style="display: none;"
            @change="handleFileChange"
          />
          <van-button type="primary" block @click="triggerFileInput">
            选择图片
          </van-button>
          <p class="upload-tip">支持 JPG、PNG 格式，文件大小不超过 2MB</p>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/icons/index.vue'
import { showConfirmDialog, showToast, showLoadingToast, closeToast, showImagePreview } from 'vant'
import { useAuthStore } from '@/stores/auth'
import dayjs from 'dayjs'

const router = useRouter()
const authStore = useAuthStore()

// 状态
const showAvatarUpload = ref(false)
const fileInput = ref(null)
const statistics = ref({
  tasks: 0,
  reports: 0,
  inspections: 0,
  operations: 0
})

// 计算用户信息
const userInfo = computed(() => {
  return authStore.user || {}
})

const userName = computed(() => {
  return userInfo.value.real_name || userInfo.value.username || '用户'
})

const userRole = computed(() => {
  const roleMap = {
    'admin': '系统管理员',
    'manager': '部门经理',
    'supervisor': '主管',
    'user': '普通用户',
    'operator': '操作员'
  }
  return roleMap[userInfo.value.role] || userInfo.value.role || '普通用户'
})

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '-'
  return dayjs(dateString).format('YYYY-MM-DD HH:mm')
}

// 加载统计数据
const loadStatistics = async () => {
  try {
    // 这里应该调用真实的API获取用户统计数据
    // 暂时使用模拟数据
    statistics.value = {
      tasks: 12,
      reports: 45,
      inspections: 8,
      operations: 23
    }
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
}

// 处理头像上传
const handleUploadAvatar = () => {
  showAvatarUpload.value = true
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileChange = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    showToast({
      type: 'fail',
      message: '请选择图片文件'
    })
    return
  }

  // 验证文件大小（2MB）
  if (file.size > 2 * 1024 * 1024) {
    showToast({
      type: 'fail',
      message: '图片大小不能超过 2MB'
    })
    return
  }

  try {
    showLoadingToast({
      message: '上传中...',
      forbidClick: true,
      duration: 0
    })

    // 创建 FormData
    const formData = new FormData()
    formData.append('avatar', file)

    // 调用上传接口
    // const response = await authApi.uploadAvatar(formData)

    // 模拟上传成功
    setTimeout(() => {
      closeToast()
      showToast({
        type: 'success',
        message: '头像上传成功'
      })
      showAvatarUpload.value = false

      // 刷新用户信息
      authStore.fetchUserProfile()

      // 重置文件输入
      if (fileInput.value) {
        fileInput.value.value = ''
      }
    }, 1500)
  } catch (error) {
    closeToast()
    showToast({
      type: 'fail',
      message: error.message || '头像上传失败'
    })
  }
}

// 编辑资料
const handleEditProfile = () => {
  router.push('/profile/edit')
}

// 修改密码
const handleChangePassword = () => {
  router.push('/profile/password')
}

// 退出登录
const handleLogout = async () => {
  try {
    await showConfirmDialog({
      title: '确认退出',
      message: '确定要退出登录吗？',
      confirmButtonText: '退出',
      cancelButtonText: '取消'
    })

    showLoadingToast({
      message: '退出中...',
      forbidClick: true,
      duration: 0
    })

    await authStore.logout()

    closeToast()
    router.replace('/login')

    showToast({
      type: 'success',
      message: '已退出登录'
    })
  } catch (error) {
    closeToast()
    // 用户取消或退出失败
    if (error !== 'cancel') {
      console.error('退出登录失败:', error)
    }
  }
}

onMounted(() => {
  loadStatistics()
})
</script>

<style lang="scss" scoped>
.profile-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-primary);
  overflow-y: auto;
}

.bg-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-primary);
  backdrop-filter: blur(48px);
  -webkit-backdrop-filter: blur(48px);
  z-index: -1;
}

/* 顶部用户信息 */
.profile-header {
  position: relative;
  padding: 3rem 1.5rem 2rem;
  flex-shrink: 0;
}

.header-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  opacity: 0.1;
}

.user-card {
  position: relative;
  background: var(--bg-secondary);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--van-border-color);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.avatar-section {
  position: relative;
  cursor: pointer;
}

.avatar-container {
  position: relative;
  width: 5rem;
  height: 5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 3px;
  overflow: hidden;
}

.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg-secondary);
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.avatar-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: 2px solid var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.user-info {
  text-align: center;
  width: 100%;
}

.user-name {
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  margin-bottom: 0.25rem;
}

.user-role {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* 主要内容区域 */
.page-content {
  flex: 1;
  padding: 0 1.5rem 1.5rem;
  overflow-y: auto;
}

.page-content::-webkit-scrollbar {
  display: none;
}

/* 统计数据 */
.stats-section {
  margin-bottom: 1.5rem;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  margin-bottom: 0.75rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.stat-card {
  background: var(--bg-secondary);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--van-border-color);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.stat-card:active {
  transform: scale(0.95);
}

.stat-icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  line-height: 1;
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* 个人信息 */
.info-section {
  margin-bottom: 1.5rem;
}

.info-card {
  background: var(--bg-secondary);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--van-border-color);
  border-radius: 0.75rem;
  padding: 0.5rem 0;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--van-border-color);
}

.info-item:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.info-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  text-align: right;
}

/* 功能菜单 */
.menu-section {
  margin-bottom: 1.5rem;
}

.menu-card {
  background: var(--bg-secondary);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--van-border-color);
  border-radius: 0.75rem;
  padding: 0.5rem 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  border-bottom: 1px solid var(--van-border-color);
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:active {
  background: var(--bg-secondary);
}

.menu-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.menu-label {
  flex: 1;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
}

.menu-arrow {
  color: var(--text-secondary);
}

/* 退出登录 */
.logout-section {
  margin-bottom: 1.5rem;
}

.logout-btn {
  background: rgba(239, 68, 68, 0.1) !important;
  border: 1px solid rgba(239, 68, 68, 0.3) !important;
  color: rgb(248, 113, 113) !important;
  height: 2.75rem !important;
  font-size: 1rem !important;
  font-weight: 600 !important;
  border-radius: 0.75rem !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logout-btn:active {
  background: rgba(239, 68, 68, 0.2) !important;
}

/* 头像上传弹窗 */
.avatar-upload-popup {
  padding: 1.5rem;
  background: white;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.popup-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #323233;
}

.close-btn {
  padding: 0.25rem;
  background: none;
  border: none;
  color: #969799;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.popup-content {
  padding: 1rem 0;
}

.popup-content :deep(.van-button--primary) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  height: 2.75rem;
  font-size: 1rem;
  font-weight: 600;
}

.upload-tip {
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: #969799;
  text-align: center;
  line-height: 1.5;
}

/* 工具类 */
.w-5 { width: 1.25rem; height: 1.25rem; }
.w-12 { width: 3rem; height: 3rem; }
</style>
