<!--
/**
 * Profile.vue
 * @description 移动端个人中心页面 - Material Design 3 风格
 * @date 2025-12-29
 * @version 3.0.0
 */
-->
<template>
  <div class="profile-page">
    <!-- 整体可滚动区域 -->
    <div class="scroll-container">
      <!-- 顶部用户信息区 -->
      <div class="profile-header">
        <div class="user-card">
          <div class="user-card-top">
            <div class="avatar-section" @click="handleUploadAvatar">
              <div class="avatar-ring">
                <img v-if="userInfo.avatar" :src="userInfo.avatar" alt="用户头像" class="avatar-img" />
                <div v-else class="avatar-fallback">
                  <SvgIcon name="user" size="1.25rem" />
                </div>
              </div>
              <div class="avatar-edit-badge">
                <SvgIcon name="camera" size="0.5rem" />
              </div>
            </div>
            <div class="user-text">
              <h2 class="user-name">{{ userName }}</h2>
              <span class="user-role-badge">{{ userRole }}</span>
            </div>
            <div class="user-contacts">
              <span class="contact-chip">
                <SvgIcon name="mail" size="0.625rem" />
                {{ userInfo.email || '未设置' }}
              </span>
              <span class="contact-chip">
                <SvgIcon name="phone" size="0.625rem" />
                {{ userInfo.phone || '未设置' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="section">
        <h3 class="section-label">我的数据</h3>
        <div class="stats-row">
          <div class="stat-chip" @click="router.push('/production/tasks')">
            <div class="stat-icon bg-indigo"><SvgIcon name="clipboard-check" size="1rem" /></div>
            <div class="stat-num">{{ statistics.tasks || 0 }}</div>
            <div class="stat-text">任务</div>
          </div>
          <div class="stat-chip" @click="router.push('/production/report/history')">
            <div class="stat-icon bg-rose"><SvgIcon name="document-text" size="1rem" /></div>
            <div class="stat-num">{{ statistics.reports || 0 }}</div>
            <div class="stat-text">报工</div>
          </div>
          <div class="stat-chip" @click="router.push('/quality/incoming')">
            <div class="stat-icon bg-cyan"><SvgIcon name="shield-check" size="1rem" /></div>
            <div class="stat-num">{{ statistics.inspections || 0 }}</div>
            <div class="stat-text">质检</div>
          </div>
          <div class="stat-chip" @click="router.push('/inventory/stock')">
            <div class="stat-icon bg-emerald"><SvgIcon name="cube" size="1rem" /></div>
            <div class="stat-num">{{ statistics.operations || 0 }}</div>
            <div class="stat-text">库存</div>
          </div>
        </div>
      </div>

      <!-- 个人信息 -->
      <div class="section">
        <h3 class="section-label">个人信息</h3>
        <div class="info-list">
          <div class="info-row">
            <span class="info-key">用户名</span>
            <span class="info-val">{{ userInfo.username || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">真实姓名</span>
            <span class="info-val">{{ userInfo.real_name || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">部门</span>
            <span class="info-val">{{ userInfo.department_name || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">职位</span>
            <span class="info-val">{{ userInfo.position || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">注册时间</span>
            <span class="info-val">{{ formatDate(userInfo.created_at) }}</span>
          </div>
        </div>
      </div>

      <!-- 功能菜单 -->
      <div class="section">
        <h3 class="section-label">功能设置</h3>
        <div class="menu-list">
          <div class="menu-row" @click="handleEditProfile">
            <div class="menu-icon-box"><SvgIcon name="pencil" size="1rem" /></div>
            <span class="menu-text">编辑资料</span>
            <SvgIcon name="chevron-right" size="1rem" class="menu-arrow" />
          </div>
          <div class="menu-row" @click="handleChangePassword">
            <div class="menu-icon-box"><SvgIcon name="lock-closed" size="1rem" /></div>
            <span class="menu-text">修改密码</span>
            <SvgIcon name="chevron-right" size="1rem" class="menu-arrow" />
          </div>
          <div class="menu-row" @click="router.push('/profile/theme')">
            <div class="menu-icon-box"><SvgIcon name="sun" size="1rem" /></div>
            <span class="menu-text">主题设置</span>
            <SvgIcon name="chevron-right" size="1rem" class="menu-arrow" />
          </div>
          <div class="menu-row" @click="router.push('/about')">
            <div class="menu-icon-box"><SvgIcon name="information-circle" size="1rem" /></div>
            <span class="menu-text">关于系统</span>
            <SvgIcon name="chevron-right" size="1rem" class="menu-arrow" />
          </div>
        </div>
      </div>

      <!-- 退出登录 -->
      <div class="section section-logout">
        <button class="logout-btn" @click="handleLogout">
          <SvgIcon name="logout" size="1rem" />
          退出登录
        </button>
      </div>
    </div>

    <!-- 头像上传弹窗 -->
    <van-popup v-model:show="showAvatarUpload" position="bottom" round>
      <div class="avatar-upload-popup">
        <div class="popup-bar"></div>
        <h3 class="popup-title">更换头像</h3>
        <input ref="fileInput" type="file" accept="image/*" style="display: none;" @change="handleFileChange" />
        <van-button type="primary" block round @click="triggerFileInput">选择图片</van-button>
        <p class="upload-hint">支持 JPG、PNG 格式，文件大小不超过 2MB</p>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import SvgIcon from '@/components/icons/index.vue'
import { showConfirmDialog, showToast, showLoadingToast, closeToast } from 'vant'
import { useAuthStore } from '@/stores/auth'
import { authApi, productionApi } from '@/services/api'
import dayjs from 'dayjs'

const router = useRouter()
const authStore = useAuthStore()

// 状态
const showAvatarUpload = ref(false)
const fileInput = ref(null)
const statistics = ref({ tasks: 0, reports: 0, inspections: 0, operations: 0 })

// 计算用户信息
const userInfo = computed(() => authStore.user || {})
const userName = computed(() => userInfo.value.real_name || userInfo.value.username || '用户')
const userRole = computed(() => {
  const roleMap = {
    'admin': '系统管理员', 'manager': '部门经理',
    'supervisor': '主管', 'user': '普通用户', 'operator': '操作员'
  }
  return roleMap[userInfo.value.role] || userInfo.value.role || '普通用户'
})

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '—'
  return dayjs(dateString).format('YYYY-MM-DD')
}

// 从统计字段中安全提取数值（后端返回嵌套对象如 { total, inProgress, ... }）
const extractCount = (field) => {
  if (field === null || field === undefined) return 0
  if (typeof field === 'number') return field
  if (typeof field === 'object' && field.total !== undefined) return Number(field.total) || 0
  return Number(field) || 0
}

// 加载统计数据
const loadStatistics = async () => {
  try {
    const response = await productionApi.getDashboardStatistics()
    const data = response.data || {}
    statistics.value = {
      tasks: extractCount(data.tasks),
      reports: extractCount(data.reports),
      inspections: extractCount(data.inspections) || extractCount(data.processes),
      operations: extractCount(data.operations) || extractCount(data.production)
    }
  } catch (error) {
    // 统计加载失败不影响页面使用
    console.warn('加载统计数据失败:', error)
  }
}

// 处理头像上传
const handleUploadAvatar = () => { showAvatarUpload.value = true }
const triggerFileInput = () => { fileInput.value?.click() }

const handleFileChange = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showToast({ type: 'fail', message: '请选择图片文件' }); return
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast({ type: 'fail', message: '图片大小不能超过 2MB' }); return
  }
  try {
    showLoadingToast({ message: '上传中...', forbidClick: true, duration: 0 })
    const formData = new FormData()
    formData.append('avatar', file)
    await authApi.uploadAvatar(formData)
    closeToast()
    showToast({ type: 'success', message: '头像上传成功' })
    showAvatarUpload.value = false
    authStore.fetchUserProfile()
    if (fileInput.value) fileInput.value.value = ''
  } catch (error) {
    closeToast()
    showToast({ type: 'fail', message: error?.response?.data?.message || '头像上传失败' })
  }
}

// 编辑和密码
const handleEditProfile = () => { router.push('/profile/edit') }
const handleChangePassword = () => { router.push('/profile/password') }

// 退出登录
const handleLogout = async () => {
  try {
    await showConfirmDialog({
      title: '确认退出', message: '确定要退出登录吗？',
      confirmButtonText: '退出', cancelButtonText: '取消'
    })
    showLoadingToast({ message: '退出中...', forbidClick: true, duration: 0 })
    await authStore.logout()
    closeToast()
    router.replace('/login')
    showToast({ type: 'success', message: '已退出登录' })
  } catch {
    closeToast()
  }
}

onMounted(() => { loadStatistics() })
</script>

<style lang="scss" scoped>
.profile-page {
  position: absolute;
  inset: 0;
  background: var(--bg-primary);
  overflow: hidden;
}

.scroll-container {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: calc(env(safe-area-inset-bottom, 0) + 70px);
}

/* === 头部 === */
.profile-header {
  padding: 16px 16px 8px;
}

.user-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle, rgba(0,0,0,0.06));
  border-radius: 14px;
  padding: 14px;
}

.user-card-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 头像 */
.avatar-section {
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
}
.avatar-ring {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary, var(--color-primary)), #7c3aed);
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--bg-secondary);
}
.avatar-fallback {
  width: calc(100% - 4px);
  height: calc(100% - 4px);
  border-radius: 50%;
  background: var(--bg-tertiary, var(--bg-primary));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}
.avatar-edit-badge {
  position: absolute;
  bottom: -1px;
  right: -2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-primary, var(--color-primary));
  border: 2px solid var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
}

/* 用户文字 */
.user-text {
  flex: 1;
  min-width: 0;
}
.user-name {
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 3px;
  line-height: 1.2;
}
.user-role-badge {
  display: inline-block;
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--color-primary, var(--color-primary));
  background: color-mix(in srgb, var(--color-primary, var(--color-primary)) 10%, transparent);
  padding: 1px 8px;
  border-radius: 99px;
}

/* 联系方式芯片 */
.user-contacts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  margin-left: auto;
}
.contact-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.625rem;
  color: var(--text-tertiary);
  background: var(--bg-tertiary, var(--bg-primary));
  padding: 3px 8px;
  border-radius: 99px;
}

/* === 通用 Section === */
.section {
  padding: 0 16px;
  margin-bottom: 20px;
}
.section-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 8px 4px;
}

/* === 统计行 === */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.stat-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle, rgba(0,0,0,0.06));
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.15s;
  &:active { transform: scale(0.95); }
}
.stat-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  &.bg-indigo { background: linear-gradient(135deg, #6366f1, #818cf8); }
  &.bg-rose { background: linear-gradient(135deg, #f43f5e, #fb7185); }
  &.bg-cyan { background: linear-gradient(135deg, #06b6d4, #22d3ee); }
  &.bg-emerald { background: linear-gradient(135deg, var(--color-success), #34d399); }
}
.stat-num {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}
.stat-text {
  font-size: 0.625rem;
  color: var(--text-tertiary);
  font-weight: 500;
}

/* === 个人信息列表 === */
.info-list {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle, rgba(0,0,0,0.06));
  border-radius: 12px;
  overflow: hidden;
}
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  & + & { border-top: 1px solid var(--border-subtle, rgba(0,0,0,0.06)); }
}
.info-key {
  font-size: 0.8125rem;
  color: var(--text-tertiary);
}
.info-val {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* === 功能菜单 === */
.menu-list {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle, rgba(0,0,0,0.06));
  border-radius: 12px;
  overflow: hidden;
}
.menu-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  cursor: pointer;
  transition: background 0.15s;
  & + & { border-top: 1px solid var(--border-subtle, rgba(0,0,0,0.06)); }
  &:active { background: var(--surface-hover, rgba(0,0,0,0.03)); }
}
.menu-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--bg-tertiary, var(--bg-primary));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.menu-text {
  flex: 1;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}
.menu-arrow {
  color: var(--text-tertiary);
}

/* === 退出登录 === */
.section-logout {
  padding-bottom: 16px;
}
.logout-btn {
  width: 100%;
  height: 44px;
  border-radius: 12px;
  border: 1px solid rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.06);
  color: var(--color-danger);
  font-size: 0.875rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.15s;
  &:active {
    background: rgba(239, 68, 68, 0.12);
    transform: scale(0.98);
  }
}

/* === 弹窗 === */
.avatar-upload-popup {
  padding: 16px 20px 28px;
}
.popup-bar {
  width: 36px;
  height: 4px;
  background: var(--van-border-color);
  border-radius: 2px;
  margin: 0 auto 16px;
}
.popup-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 16px;
  text-align: center;
}
.upload-hint {
  margin-top: 12px;
  font-size: 0.6875rem;
  color: var(--text-tertiary);
  text-align: center;
}
</style>
