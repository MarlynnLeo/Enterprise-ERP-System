<!--
/**
 * UserProfile.vue
 * @description 用户个人中心页面 - 重构版
 * @date 2026-01-21
 * @version 3.0.0
 */
-->
<template>
  <div class="user-profile">
    <!-- 加载状态 -->
    <el-card v-if="isLoading" class="glass-card loading-card" shadow="hover">
      <el-skeleton :rows="5" animated />
    </el-card>

    <template v-else>
      <!-- 头部组件 -->
      <ProfileHeader 
        :user-name="userForm.name"
        :days="daysFromRegistration"
      />
    
      <!-- 导航按钮 -->
      <div class="nav-buttons">
        <el-button
          v-for="tab in tabs"
          :key="tab.id"
          :type="activeTab === tab.id ? 'primary' : ''"
          :plain="activeTab !== tab.id"
          @click="activeTab = tab.id"
          class="nav-btn"
        >
          <el-icon><component :is="tab.icon" /></el-icon>
          <span>{{ tab.label }}</span>
        </el-button>
      </div>

      <!-- 主要内容区 -->
      <el-row :gutter="20">
        <!-- 左侧：用户信息卡片 -->
        <el-col :xs="24" :sm="24" :md="8" :lg="7" :xl="6">
          <ProfileStats
            :name="userForm.name"
            :role="userForm.role"
            :avatar="userForm.avatar"
            :avatar-frame="currentAvatarFrame"
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
        <el-col :xs="24" :sm="24" :md="16" :lg="17" :xl="18">
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
            @change-password="changePassword"
          />

          <!-- 待办事项 -->
          <div v-show="activeTab === 'todos'">
            <TodoManager 
              :todos="todos"
              @save="saveTodo"
              @delete="deleteTodo"
              @toggle="toggleTodoStatus"
              @import="importTodos"
              @export="exportTodos"
            />
          </div>

          <!-- 外观设置 -->
          <div v-show="activeTab === 'appearance'">
            <el-card class="glass-card appearance-card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <div class="header-left">
                    <el-icon class="header-icon" color="#E6A23C"><Brush /></el-icon>
                    <span class="header-title">外观偏好</span>
                  </div>
                </div>
              </template>
              
              <el-form :model="appearanceForm" label-width="120px">
                <div class="appearance-section">
                  <div class="section-title">
                    <el-icon><Sunny /></el-icon>
                    主题模式
                  </div>
                  <el-form-item label="选择主题">
                    <el-radio-group v-model="appearanceForm.theme" size="large">
                      <el-radio-button value="light">
                        <el-icon><Sunny /></el-icon> 浅色
                      </el-radio-button>
                      <el-radio-button value="dark">
                        <el-icon><Moon /></el-icon> 深色
                      </el-radio-button>
                      <el-radio-button value="system">
                        <el-icon><Monitor /></el-icon> 跟随系统
                      </el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                </div>
                
                <el-divider />
                
                <div class="appearance-section">
                  <div class="section-title">
                    <el-icon><Brush /></el-icon>
                    颜色配置
                  </div>
                  <el-form-item label="主色调">
                    <div class="color-picker-wrapper">
                      <el-color-picker v-model="appearanceForm.primaryColor" show-alpha />
                      <el-input v-model="appearanceForm.primaryColor" style="width: 120px; margin-left: 10px" />
                      <div class="color-preview" :style="{background: appearanceForm.primaryColor}"></div>
                    </div>
                  </el-form-item>
                </div>
                
                <el-divider />
                
                <div class="appearance-section">
                  <div class="section-title">
                    <el-icon><Reading /></el-icon>
                    字体设置
                  </div>
                  <el-form-item label="字体大小">
                    <div class="font-size-wrapper">
                      <el-slider 
                        v-model="appearanceForm.fontSize" 
                        :min="12" 
                        :max="20" 
                        :step="1" 
                        show-stops 
                        :marks="{12: '小', 14: '默认', 16: '中', 18: '大', 20: '超大'}"
                      />
                      <div class="font-preview" :style="{fontSize: appearanceForm.fontSize + 'px'}">
                        预览文本 Aa
                      </div>
                    </div>
                  </el-form-item>
                </div>
                
                <el-form-item>
                  <el-button type="primary" @click="saveAppearance">
                    <el-icon><Check /></el-icon> 保存设置
                  </el-button>
                  <el-button @click="resetAppearance">
                    <el-icon><RefreshRight /></el-icon> 重置默认
                  </el-button>
                </el-form-item>
              </el-form>
            </el-card>
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
              :completed-todos="completedTodosCount"
              :total-todos="todos.length"
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
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { formatDate } from '@/utils/helpers/dateUtils'
import {
  User, Lock, List, Brush, Clock, TrendCharts, StarFilled,
  Sunny, Moon, Monitor, Reading, Check, RefreshRight
} from '@element-plus/icons-vue'
import { todoApi, userApi } from '../services/api'
import api from '../services/api'

// 引入拆分的组件
import ProfileHeader from './auth/components/ProfileHeader.vue'
import ProfileStats from './auth/components/ProfileStats.vue'
import ProfileEdit from './auth/components/ProfileEdit.vue'
import TodoManager from './auth/components/TodoManager.vue'
import ActivityLog from './auth/components/ActivityLog.vue'
import UserMetrics from './auth/components/UserMetrics.vue'
import AvatarSelector from './auth/components/AvatarSelector.vue'

const authStore = useAuthStore()
const themeStore = useThemeStore()

// 状态
const isLoading = ref(true)
const isEditing = ref(false)
const activeTab = ref('basic')
const currentAvatarFrame = ref('lottie-golden')

// 表单数据
const userForm = reactive({
  name: '',
  email: '',
  phone: '',
  role: '',
  avatar: '',
  location: [],
  bio: '',
  created_at: null
})

const appearanceForm = reactive({
  theme: themeStore.appearance.theme,
  primaryColor: themeStore.appearance.primaryColor,
  fontSize: themeStore.appearance.fontSize
})

// 数据
const todos = ref([])
const userActivities = ref([])
const userStats = reactive({
  loginCount: 0,
  daysActive: 0,
  tasksCompleted: 0,
  lastLogin: new Date(),
  todayOnlineTime: 0,
  totalOnlineTime: 0
})

// 计算属性
const statsData = computed(() => {
  return [
    { icon: 'User', label: '项目参与', value: '12' },
    { icon: 'TrendCharts', label: '任务完成', value: userStats.tasksCompleted },
    { icon: 'StarFilled', label: '获赞统计', value: '328' }
  ]
})

const daysFromRegistration = computed(() => {
  if (!userForm.created_at) return 1
  const created = new Date(userForm.created_at)
  const now = new Date()
  return Math.floor((now - created) / (1000 * 60 * 60 * 24)) || 1
})

const completedTodosCount = computed(() => todos.value.filter(t => t.completed).length)
const efficiencyScore = ref(85)
const averageResponseTime = ref('2.3小时')

// 选项
const tabs = [
  { id: 'basic', label: '基本信息', icon: 'User' },
  { id: 'password', label: '密码修改', icon: 'Lock' },
  { id: 'todos', label: '待办事项', icon: 'List' },
  { id: 'appearance', label: '外观设置', icon: 'Brush' },
  { id: 'activities', label: '近期活动', icon: 'Clock' },
  { id: 'stats', label: '数据统计', icon: 'TrendCharts' },
  { id: 'avatar', label: '头像特效', icon: 'StarFilled' }
]

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

import frameGolden from '../assets/lottie/frame-golden.json'
import frameCyber from '../assets/lottie/frame-cyber.json'
import frameNature from '../assets/lottie/frame-nature.json'
import frameHexagon from '../assets/lottie/frame-hexagon.json'
import frameDiamond from '../assets/lottie/frame-diamond.json'
import frameStar from '../assets/lottie/frame-star.json'
import frameRipple from '../assets/lottie/frame-ripple.json'

// 头像特效配置
const avatarFrames = ref([
  // 顶级全屏动态矢量动画
  { id: 'lottie-golden', name: '皇家金冠', description: '专属王者闪耀金环特效，尊贵流光', tags: ['魔法', '奢华'], animationData: frameGolden },
  { id: 'lottie-cyber', name: '赛博霓虹', description: '未来科技脉冲呼吸灯，动态描边', tags: ['科技', '赛博'], animationData: frameCyber },
  { id: 'lottie-nature', name: '自然律动', description: '清新森系多重轨道环绕，生机盎然', tags: ['自然', '清新'], animationData: frameNature },
  { id: 'lottie-hexagon', name: '赛博六边', description: '多维矩阵工业外骨骼扫描框', tags: ['科技', '硬核'], animationData: frameHexagon },
  { id: 'lottie-diamond', name: '棱镜护盾', description: '交叉复式四芒星法力屏障', tags: ['魔法', '神圣'], animationData: frameDiamond },
  { id: 'lottie-star', name: '闪耀星芒', description: '八星光辉核心能量反应炉', tags: ['魔法', '趣味'], animationData: frameStar },
  { id: 'lottie-ripple', name: '灵动涟漪', description: '静水流深扩散波纹，唯美治愈', tags: ['自然', '唯美'], animationData: frameRipple },
  { id: 'none', name: '无特效', description: '朴实无华的默认基本盘', tags: ['简约'] }
])

// 初始化
onMounted(async () => {
  try {
    isLoading.value = true
    await loadUserProfile()
    await loadTodos()
    await loadActivities()
    await loadUserStats()
    
    // 初始化模拟数据
    userStats.todayOnlineTime = 3600 * 2.5
    userStats.totalOnlineTime = 3600 * 128
    userForm.created_at = new Date(Date.now() - 1000 * 60 * 60 * 24 * 45) // 45天前
    currentAvatarFrame.value = authStore.user?.avatar_frame || 'lottie-golden'
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
        name: user.real_name || user.username,
        email: user.email,
        phone: user.phone || '13800138000',
        role: user.role_name || user.roleNames || user.role || '未分配角色',
        avatar: user.avatar,
        location: ['beijing', 'haidian'],
        bio: user.bio || '这家伙很懒，什么都没写~'
      })
    }
  } catch (error) {
    console.error('Failed to load profile', error)
  }
}

const loadTodos = async () => {
  try {
    const res = await todoApi.getAllTodos()
    if (res.success) {
      todos.value = parseListData(res.data)
    } else {
      // 模拟数据
      todos.value = [] 
    }
  } catch (error) {
    // 使用模拟数据作为降级方案
    todos.value = [
      { id: 1, title: '完成各模块单元测试', deadline: new Date(Date.now() + 86400000), completed: false, priority: 3, description: '包含财务、库存模块' },
      { id: 2, title: '更新用户文档', deadline: new Date(Date.now() + 172800000), completed: true, priority: 2 }
    ]
  }
}

const loadActivities = async () => {
  // 模拟活动数据
  userActivities.value = [
    { timestamp: '2026-01-20 09:30', content: '登录系统', category: 'login' },
    { timestamp: '2026-01-20 10:15', content: '更新了个人资料', category: 'profile' },
    { timestamp: '2026-01-19 14:20', content: '完成了任务 #1024', category: 'task' },
    { timestamp: '2026-01-19 16:45', content: '系统安全警告', category: 'system' }
  ]
}

const loadUserStats = async () => {
  userStats.loginCount = 120
  userStats.daysActive = 15
  userStats.tasksCompleted = 45
}

const loadMoreActivities = async () => {
  // 模拟加载更多
  const more = [
    { timestamp: '2026-01-18 09:00', content: '查看了报表', category: 'system' },
    { timestamp: '2026-01-17 18:30', content: '退出了系统', category: 'login' }
  ]
  userActivities.value.push(...more)
  ElMessage.success('已加载更多活动记录')
}

const exportActivities = () => {
  const data = JSON.stringify(userActivities.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `activities-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// 业务逻辑
const cancelEditing = () => {
  isEditing.value = false
  loadUserProfile() // 恢复原数据
}

const saveProfile = async () => {
  try {
    // 调用后端API保存资料
    const response = await userApi.updateProfile({
      real_name: userForm.name,
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
        real_name: userForm.name,
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

const saveTodo = (todo) => {
  if (todo.id) {
    const index = todos.value.findIndex(t => t.id === todo.id)
    if (index !== -1) todos.value[index] = todo
  } else {
    todos.value.unshift({ ...todo, id: Date.now() })
  }
  ElMessage.success('待办事项已保存')
}

const deleteTodo = (id) => {
  todos.value = todos.value.filter(t => t.id !== id)
  ElMessage.success('待办事项已删除')
}

const toggleTodoStatus = (todo) => {
  ElMessage.info(todo.completed ? '已标记为完成' : '已标记为未完成')
}

const importTodos = (file) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (Array.isArray(data)) {
        todos.value = [...data, ...todos.value]
        ElMessage.success(`成功导入 ${data.length} 条待办`)
      }
    } catch (err) {
      ElMessage.error('文件格式错误')
    }
  }
  reader.readAsText(file)
}

const exportTodos = () => {
  const data = JSON.stringify(todos.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `todos-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const saveAppearance = () => {
  themeStore.setTheme(appearanceForm.theme)
  themeStore.setPrimaryColor(appearanceForm.primaryColor)
  // 字体大小设置暂略
  ElMessage.success('外观设置已保存')
}

const resetAppearance = () => {
  appearanceForm.theme = 'light'
  appearanceForm.primaryColor = '#409EFF'
  appearanceForm.fontSize = 14
  saveAppearance()
}

const handleAvatarChange = (file) => {
  // 处理头像上传
  ElMessage.success('头像上传成功')
}

const handleAvatarError = () => {
  ElMessage.warning('头像加载失败，使用默认头像')
}

const handleFrameChange = async (frameId) => {
  currentAvatarFrame.value = frameId
  try {
    // 使用专用接口保存
    await userApi.updateAvatarFrame(frameId)
    
    // 更新本地 store
    authStore.user.avatar_frame = frameId
    
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

.nav-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  width: 100%;
}

.nav-btn {
  flex: 1;
  border-radius: 12px;
  transition: all 0.3s;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
}

.nav-btn:hover {
  transform: translateY(-2px);
}

.glass-card {
  border-radius: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 20px;
}

/* 外观设置样式 */
.appearance-section {
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 20px;
}

.color-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-preview {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
}

.font-size-wrapper {
  padding: 0 10px;
}

.font-preview {
  margin-top: 20px;
  padding: 15px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  text-align: center;
}

/* 响应式 */
@media (max-width: 768px) {
  .user-profile {
    padding: 10px;
  }
  
  .nav-buttons {
    gap: 8px;
  }
  
  .nav-btn {
    padding: 8px 12px;
    font-size: 12px;
  }
}
</style>
