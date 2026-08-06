<!--
/**
 * UserProfile.vue
 * @description 用户个人中心页面 - 重构版
 * @date 2026-01-21
 * @version 3.0.0
 */
-->
<template>
  <div class="user-profile module-page">
    <!-- 加载状态 -->
    <el-card v-if="isLoading" class="profile-card loading-card" shadow="hover">
      <el-skeleton :rows="5" animated />
    </el-card>
    <template v-else>
      <!-- 头部组件 -->
      <ProfileHeader
        :user-name="userForm.name"
        :days="daysFromRegistration"
      />

      <!-- 导航按钮 -->
      <div class="profile-nav" role="tablist" aria-label="个人中心导航">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          class="profile-nav-item"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <span class="nav-icon">
            <el-icon><component :is="tab.icon" /></el-icon>
          </span>
          <span class="nav-text">
            <span class="nav-label">{{ tab.label }}</span>
            <span class="nav-desc">{{ tab.description }}</span>
          </span>
        </button>
      </div>
      <!-- 主要内容区 -->
      <el-row
        :gutter="20"
        class="profile-content-row"
        :class="{ 'avatar-tab-active': activeTab === 'avatar' }"
      >
        <!-- 左侧：用户信息卡片 -->
        <el-col class="profile-side-col" :xs="24" :sm="24" :md="8" :lg="7" :xl="6">
          <ProfileStats
            :name="userForm.name"
            :role="userForm.role"
            :avatar="userForm.avatar"
            :avatar-frame="currentAvatarFrame"
            :avatar-frame-config="selectedAvatarFrame"
            :is-editing="isEditing"
            :stats="statsData"
            :today-online="formatOnlineTime(userStats.todayOnlineTime)"
            :total-online="formatOnlineTime(userStats.totalOnlineTime)"
            :last-login="formatDate(userStats.lastLogin)"
            @update:avatar="handleAvatarChange"
            @avatar-error="handleAvatarError"
          />
        </el-col>
        <!-- 右侧：内容区 -->
        <el-col class="profile-main-col" :xs="24" :sm="24" :md="16" :lg="17" :xl="18">
          <div class="profile-section-header">
            <div class="section-heading">
              <span class="section-icon">
                <el-icon><component :is="activeTabInfo.icon" /></el-icon>
              </span>
              <div>
                <h2>{{ activeTabInfo.label }}</h2>
                <p>{{ activeTabInfo.description }}</p>
              </div>
            </div>
          </div>

          <!-- 基本信息与密码 -->
          <ProfileEdit
            v-show="activeTab === 'basic' || activeTab === 'password'"
            :active-tab="activeTab"
            :user-form="userForm"
            :location-options="locationOptions"
            :is-editing="isEditing"
            @start-editing="isEditing = true"
            @cancel-editing="cancelEditing"
            @save-profile="saveProfile"
            @update:user-form="updateUserForm"
            @change-password="changePassword"
          />
          <!-- 待办事项 -->
          <div v-show="activeTab === 'todos'">
            <ProfileTodos
              :todo-id="route.query.id"
              @changed="loadUserStats"
            />
          </div>
          <!-- 近期活动 -->
          <div v-show="activeTab === 'activities'">
            <ActivityLog
              :activities="userActivities"
              @load-more="loadMoreActivities"
              @export="exportActivities"
            />
          </div>
          <!-- 数据统计 -->
          <div v-show="activeTab === 'stats'">
            <UserMetrics
              :efficiency-score="efficiencyScore"
              :average-response-time="averageResponseTime"
              :days-active="userStats.daysActive"
              :login-count="userStats.loginCount"
              :tasks-completed="userStats.tasksCompleted"
            />
          </div>
          <!-- 头像特效 -->
          <div v-show="activeTab === 'avatar'">
            <AvatarSelector
              v-model="currentAvatarFrame"
              :avatar="userForm.avatar"
              :name="userForm.name"
              :frames="avatarFrames"
              @change="handleFrameChange"
            />
          </div>
        </el-col>
      </el-row>
    </template>
  </div>
</template>
<script setup>
import { formatLocalDate } from '@/utils/format';
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import { Clock, Lock, StarFilled, Tickets, TrendCharts, User } from '@element-plus/icons-vue'
import { formatDate } from '@/utils/helpers/dateUtils'
import {  userApi } from '@/api'
import { parseDataObject, parseListData } from '@/utils/responseParser'
import {
  AVATAR_FRAME_OPTIONS,
  DEFAULT_AVATAR_FRAME,
  getAvatarFrameConfig,
  normalizeAvatarFrameId
} from '@/utils/avatarFrames'
// 引入拆分的组件
import ProfileHeader from './auth/components/ProfileHeader.vue'
import ProfileStats from './auth/components/ProfileStats.vue'
import ProfileEdit from './auth/components/ProfileEdit.vue'
import ProfileTodos from './auth/components/ProfileTodos.vue'
import ActivityLog from './auth/components/ActivityLog.vue'
import UserMetrics from './auth/components/UserMetrics.vue'
import AvatarSelector from './auth/components/AvatarSelector.vue'
const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
// 状态
const isLoading = ref(true)
const isEditing = ref(false)
const activeTab = ref('basic')
const currentAvatarFrame = ref(DEFAULT_AVATAR_FRAME)
// 表单数据
const userForm = reactive({
  name: '',
  email: '',
  phone: '',
  role: '',
  avatar: '',
  location: [],
  bio: '',
  createdAt: null
})
// 数据
const userActivities = ref([])
const userStats = reactive({
  loginCount: 0,
  daysActive: 0,
  tasksCompleted: 0,
  projectsParticipated: 0,
  praiseCount: 0,
  lastLogin: new Date(),
  todayOnlineTime: 0,
  totalOnlineTime: 0
})
// 计算属性
const statsData = computed(() => {
  return [
    { icon: User, label: '项目参与', value: userStats.projectsParticipated },
    { icon: TrendCharts, label: '任务完成', value: userStats.tasksCompleted },
    { icon: StarFilled, label: '获赞统计', value: userStats.praiseCount }
  ]
})
const daysFromRegistration = computed(() => {
  if (!userForm.createdAt) return 1
  const created = new Date(userForm.createdAt)
  const now = new Date()
  return Math.floor((now - created) / (1000 * 60 * 60 * 24)) || 1
})
const efficiencyScore = ref(85)
const averageResponseTime = ref('2.3小时')
// 选项
const tabs = [
  { id: 'basic', label: '基本信息', description: '资料维护', icon: User },
  { id: 'todos', label: '待办事项', description: '任务闭环', icon: Tickets },
  { id: 'password', label: '密码修改', description: '账号安全', icon: Lock },
  { id: 'activities', label: '近期活动', description: '操作轨迹', icon: Clock },
  { id: 'stats', label: '数据统计', description: '效率概览', icon: TrendCharts },
  { id: 'avatar', label: '头像特效', description: '动态装扮', icon: StarFilled }
]
const activeTabInfo = computed(() => tabs.find(tab => tab.id === activeTab.value) || tabs[0])
const locationOptions = [
  {
    value: 'beijing', label: '北京',
    children: [
      { value: 'haidian', label: '海淀区' },
      { value: 'chaoyang', label: '朝阳区' }
    ]
  },
  {
    value: 'shanghai', label: '上海',
    children: [
      { value: 'pudong', label: '浦东新区' },
      { value: 'huangpu', label: '黄浦区' }
    ]
  }
]
// 头像特效配置
const avatarFrames = AVATAR_FRAME_OPTIONS
const selectedAvatarFrame = computed(() => getAvatarFrameConfig(currentAvatarFrame.value))

const profileTabAliases = {
  'avatar-frame': 'avatar',
  avatarFrame: 'avatar',
  todo: 'todos',
  task: 'todos'
}

const syncActiveTabFromRoute = (tab) => {
  const normalizedTab = profileTabAliases[tab] || tab
  const exists = tabs.some(item => item.id === normalizedTab)
  activeTab.value = exists ? normalizedTab : 'basic'
}

watch(
  () => route.query.tab,
  (tab) => syncActiveTabFromRoute(tab),
  { immediate: true }
)

// 初始化
onMounted(async () => {
  try {
    isLoading.value = true
    await loadUserProfile()
    await loadActivities()
    await loadUserStats()
    currentAvatarFrame.value = normalizeAvatarFrameId(authStore.user?.avatarFrame)
  } finally {
    isLoading.value = false
  }
})
// API 方法
const loadUserProfile = async () => {
  try {
    const user = authStore.user
    if (user) {
      Object.assign(userForm, {
        name: user.realName || user.username,
        email: user.email,
        phone: user.phone || '',
        role: user.roleName || user.roleNames || user.role || '未分配角色',
        avatar: user.avatar,
        location: user.location || [],
        bio: user.bio || '',
        createdAt: user.createdAt || null
      })
    }
  } catch (error) {
    console.error('Failed to load profile', error)
  }
}
const loadActivities = async () => {
  try {
    const response = await userApi.getActivities({ page: 1, limit: 20 })
    const data = parseDataObject(response, { enableLog: false }) || {}
    userActivities.value = data.activities || parseListData(response, { enableLog: false })
  } catch (error) {
    console.error('Failed to load activities', error)
    userActivities.value = []
  }
}
const loadUserStats = async () => {
  try {
    const response = await userApi.getStatistics()
    const data = parseDataObject(response, { enableLog: false }) || {}
    const loginStats = data.loginStats || {}
    const todoStats = data.todoStats || {}
    const activityStats = data.activityStats || {}

    userStats.loginCount = loginStats.totalLogins || 0
    userStats.daysActive = loginStats.daysActive || 0
    userStats.tasksCompleted = todoStats.completedTodos || 0
    userStats.todayOnlineTime = loginStats.todayOnlineTime || 0
    userStats.totalOnlineTime = loginStats.totalOnlineTime || 0
    userStats.lastLogin = loginStats.lastLogin || null
    userStats.projectsParticipated = activityStats.projectsParticipated || 0
    userStats.praiseCount = activityStats.praiseCount || 0
    efficiencyScore.value = activityStats.efficiencyScore || 0
    averageResponseTime.value = activityStats.averageResponseTime || ''
  } catch (error) {
    console.error('Failed to load user stats', error)
  }
}
const loadMoreActivities = async () => {
  try {
    const nextPage = Math.floor(userActivities.value.length / 20) + 1
    const response = await userApi.getActivities({ page: nextPage, limit: 20 })
    const data = parseDataObject(response, { enableLog: false }) || {}
    const more = data.activities || parseListData(response, { enableLog: false })
    userActivities.value.push(...more)
  } catch (error) {
    console.error('Failed to load more activities', error)
    ElMessage.error('加载更多活动记录失败')
  }
}
const exportActivities = () => {
  const data = JSON.stringify(userActivities.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `activities-${formatLocalDate(new Date())}.json`
  a.click()
  URL.revokeObjectURL(url)
}
// 业务逻辑
const updateUserForm = (nextUserForm) => {
  Object.assign(userForm, nextUserForm)
}

const cancelEditing = () => {
  isEditing.value = false
  loadUserProfile() // 恢复原数据
}
const saveProfile = async () => {
  try {
    // 调用后端API保存资料
    const response = await userApi.updateProfile({
      realName: userForm.name,
      email: userForm.email,
      phone: userForm.phone,
      bio: userForm.bio
    })

    // 更新本地store
    if (response.data) {
      authStore.updateUser(response.data)
    } else {
      authStore.updateUser({
        ...authStore.user,
        realName: userForm.name,
        email: userForm.email,
        phone: userForm.phone,
        bio: userForm.bio
      })
    }

    ElMessage.success('个人资料已更新')
    isEditing.value = false
  } catch (error) {
    console.error('Save profile error:', error)
    ElMessage.error('保存失败: ' + (error.response?.data?.message || error.message || '未知错误'))
  }
}
const changePassword = async (data, callback) => {
  try {
    await userApi.changePassword(data)
    ElMessage.success('密码修改成功，请重新登录')
    authStore.logout()
    router.push('/login')
  } catch (error) {
    ElMessage.error('密码修改失败：' + (error.message || '未知错误'))
  } finally {
    callback && callback()
  }
}
const handleAvatarChange = async (file) => {
  const rawFile = file?.raw || file
  if (!rawFile) {
    ElMessage.warning('请选择头像文件')
    return
  }

  const formData = new FormData()
  formData.append('avatar', rawFile)

  try {
    const response = await userApi.updateAvatar(formData)
    const data = parseDataObject(response, { enableLog: false }) || {}
    const avatarUrl = data.avatarUrl || data.avatar || data.url

    if (avatarUrl) {
      userForm.avatar = avatarUrl
      if (authStore.user) {
        authStore.user.avatar = avatarUrl
      }
    }

    await authStore.fetchUserProfile(false)
    userForm.avatar = authStore.user?.avatar || userForm.avatar
    window.dispatchEvent(new CustomEvent('erp:user-profile-updated', {
      detail: {
        avatar: userForm.avatar,
        avatarFrame: currentAvatarFrame.value
      }
    }))
    ElMessage.success('头像上传成功')
  } catch (error) {
    console.error('Avatar upload error:', error)
    ElMessage.error('头像上传失败: ' + (error.response?.data?.message || error.message || '未知错误'))
  }
}
const handleAvatarError = () => {
  ElMessage.warning('头像加载失败，使用默认头像')
}
const handleFrameChange = async (frameId) => {
  const normalizedFrameId = normalizeAvatarFrameId(frameId)
  currentAvatarFrame.value = normalizedFrameId
  try {
    // 使用专用接口保存
    await userApi.updateAvatarFrame(normalizedFrameId)

    // 更新本地 store
    if (authStore.user) {
      authStore.user.avatarFrame = normalizedFrameId
    }

    window.dispatchEvent(new CustomEvent('erp:user-profile-updated', {
      detail: {
        avatar: userForm.avatar,
        avatarFrame: normalizedFrameId
      }
    }))
    ElMessage.success('头像特效已保存')
  } catch (error) {
    ElMessage.error('特效保存失败: ' + (error.message || '未知错误'))
  }
}
// 工具函数
const formatOnlineTime = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}小时${m}分钟`
}
// formatDate 已统一引用公共实现
</script>
<style scoped>
.user-profile {
  padding: 20px;
  max-width: 1600px;
  margin: 0 auto;
  min-height: calc(100vh - 84px);
  animation: fadeIn 0.5s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.profile-nav {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
  width: 100%;
}

.profile-nav-item {
  appearance: none;
  min-width: 0;
  min-height: 68px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  color: var(--el-text-color-regular);
  background: var(--el-bg-color);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}

.profile-nav-item:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color-extra-light);
}

.profile-nav-item.active {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.profile-nav-item:focus-visible {
  outline: 3px solid var(--el-color-primary-light-6);
  outline-offset: 2px;
}

.nav-icon {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-8);
  font-size: 19px;
}

.profile-nav-item.active .nav-icon {
  color: var(--el-color-white);
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

.nav-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.nav-label {
  overflow: hidden;
  color: inherit;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-desc {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-card {
  border-radius: 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 20px;
  box-shadow: 0 2px 12px 0 color-mix(in srgb, var(--ds-black) 5%, transparent);
}

.profile-content-row {
  align-items: stretch;
}

.profile-side-col,
.profile-main-col {
  min-width: 0;
}

.profile-side-col {
  display: flex;
}

.profile-main-col {
  display: flex;
  flex-direction: column;
}

.profile-section-header {
  margin-bottom: 14px;
  padding: 16px 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color);
  box-shadow: 0 2px 12px 0 color-mix(in srgb, var(--ds-black) 5%, transparent);
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-icon {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--el-color-white);
  background: var(--el-color-primary);
  font-size: 21px;
}

.section-heading h2 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 800;
  line-height: 1.25;
}

.section-heading p {
  margin: 3px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
/* 响应式 */
@media (max-width: 768px) {
  .user-profile {
    padding: 10px;
  }

  .profile-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .profile-nav-item {
    min-height: 60px;
    padding: 10px;
    gap: 9px;
  }

  .nav-icon {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
    font-size: 17px;
  }

  .nav-label {
    font-size: 13px;
  }

  .nav-desc {
    font-size: 11px;
  }

  .profile-section-header {
    padding: 14px;
  }

  .section-icon {
    width: 38px;
    height: 38px;
    font-size: 19px;
  }

  .section-heading h2 {
    font-size: 16px;
  }

  .profile-content-row.avatar-tab-active {
    flex-direction: column;
  }

  .profile-content-row.avatar-tab-active .profile-main-col {
    order: 1;
  }

  .profile-content-row.avatar-tab-active .profile-side-col {
    order: 2;
  }
}

@media (min-width: 769px) and (max-width: 1200px) {
  .profile-nav {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
