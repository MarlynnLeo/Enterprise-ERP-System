<template>
  <div class="production-board">
    <!-- 头部 -->
    <div class="board-header">
      <div class="header-content">
        <h1 class="board-title">
          <el-icon class="title-icon"><DataBoard /></el-icon>
          生产流程可视化看板
        </h1>
        <div class="header-actions">
          <div class="update-time">
            <el-icon><Clock /></el-icon>
            更新时间: {{ updateTime }}
          </div>
          <el-button type="primary" :icon="Setting" circle @click="showSettings = true" title="看板设置" />
        </div>
      </div>
    </div>

    <!-- 设置对话框 -->
    <el-dialog v-model="showSettings" title="看板设置" width="600px" :close-on-click-modal="false">
      <div class="settings-content">
        <h4>选择要显示的卡片模块</h4>
        <el-checkbox-group v-model="tempCardConfig">
          <div class="card-checkbox-list">
            <el-checkbox v-for="card in allCardOptions" :key="card.key" :label="card.key">
              {{ card.label }}
            </el-checkbox>
          </div>
        </el-checkbox-group>

        <h4 style="margin-top: 20px;">调整显示顺序（拖拽排序）</h4>
        <div class="card-order-list">
          <div
            v-for="(cardKey, index) in tempCardOrder"
            :key="cardKey"
            class="card-order-item"
            draggable="true"
            @dragstart="handleDragStart(index)"
            @dragover.prevent
            @drop="handleDrop(index)"
          >
            <el-icon><Rank /></el-icon>
            <span>{{ getCardLabel(cardKey) }}</span>
            <div class="order-actions">
              <el-button size="small" :disabled="index === 0" @click="moveCard(index, -1)">↑</el-button>
              <el-button size="small" :disabled="index === tempCardOrder.length - 1" @click="moveCard(index, 1)">↓</el-button>
            </div>
          </div>
        </div>

        <h4 style="margin-top: 20px;">最近生产计划显示条数</h4>
        <div class="limit-setting">
          <el-slider
            v-model="tempRecentPlansLimit"
            :min="5"
            :max="30"
            :step="1"
            show-input
            :show-input-controls="false"
            input-size="small"
          />
        </div>

        <h4 style="margin-top: 20px;">自动滚动设置</h4>
        <div class="scroll-setting">
          <div class="scroll-row">
            <span>开启自动滚动</span>
            <el-switch v-model="tempAutoScroll" />
          </div>
          <div class="scroll-row" v-if="tempAutoScroll">
            <span>滚动速度（秒/行）</span>
            <el-slider
              v-model="tempScrollSpeed"
              :min="1"
              :max="10"
              :step="0.5"
              :format-tooltip="(val) => val + '秒'"

            />
            <span class="speed-value">{{ tempScrollSpeed }}秒</span>
          </div>
          <div class="scroll-row" v-if="tempAutoScroll">
            <span>显示行数（表格高度）</span>
            <el-input-number v-model="tempVisibleRows" :min="3" :max="15" :step="1" size="small" />
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showSettings = false">取消</el-button>
        <el-button type="warning" @click="resetSettings">恢复默认</el-button>
        <el-button type="primary" @click="saveSettings">保存设置</el-button>
      </template>
    </el-dialog>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-container">
      <el-icon class="is-loading" :size="50"><Loading /></el-icon>
      <p>加载中...</p>
    </div>

    <!-- 主要内容 -->
    <div v-else class="board-content">
      <!-- 根据配置动态渲染各模块 -->
      <template v-for="cardKey in cardOrder" :key="cardKey">
        <!-- 今日统计卡片 -->
        <div v-if="cardKey === 'statsCards' && cardConfig.includes('statsCards')" class="stats-cards">
          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);">
              <el-icon :size="32"><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">今日计划</div>
              <div class="stat-value">{{ boardData.todayStats?.plansCount || 0 }}</div>
              <div class="stat-sub">已完成 {{ boardData.todayStats?.completedPlans || 0 }}</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #e67e22 0%, #d35400 100%);">
              <el-icon :size="32"><List /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">今日任务</div>
              <div class="stat-value">{{ boardData.todayStats?.tasksCount || 0 }}</div>
              <div class="stat-sub">已完成 {{ boardData.todayStats?.completedTasks || 0 }}</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #16a085 0%, #1abc9c 100%);">
              <el-icon :size="32"><Setting /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">工序完成率</div>
              <div class="stat-value">{{ boardData.processStats?.completionRate || 0 }}%</div>
              <div class="stat-sub">{{ boardData.processStats?.completed || 0 }}/{{ boardData.processStats?.total || 0 }}</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);">
              <el-icon :size="32"><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">检验合格率</div>
              <div class="stat-value">{{ boardData.inspectionStats?.passRate || 0 }}%</div>
              <div class="stat-sub">{{ boardData.inspectionStats?.passed || 0 }}/{{ boardData.inspectionStats?.total || 0 }}</div>
            </div>
          </div>
        </div>

        <!-- 生产流程步骤 -->
        <div v-if="cardKey === 'flowSection' && cardConfig.includes('flowSection')" class="flow-section">
        <h2 class="section-title">
          <el-icon><TrendCharts /></el-icon>
          生产流程进度
        </h2>
        <div class="flow-steps">
          <div 
            v-for="(step, index) in flowSteps" 
            :key="step.status"
            class="flow-step"
            :class="{ 'has-data': getStepCount(step.status) > 0 }"
          >
            <div class="step-number">{{ index + 1 }}</div>
            <div class="step-content">
              <div class="step-name">{{ step.name }}</div>
              <div class="step-stats">
                <div class="step-stat">
                  <span class="stat-label">计划:</span>
                  <span class="stat-value">{{ boardData.flowStats?.plans[step.status] || 0 }}</span>
                </div>
                <div class="step-stat">
                  <span class="stat-label">任务:</span>
                  <span class="stat-value">{{ boardData.flowStats?.tasks[step.status] || 0 }}</span>
                </div>
              </div>
            </div>
            <div v-if="index < flowSteps.length - 1" class="step-arrow">
              <el-icon><Right /></el-icon>
            </div>
          </div>
        </div>
        </div>

        <!-- 完成率统计 -->
        <div v-if="cardKey === 'completionSection' && cardConfig.includes('completionSection')" class="completion-section">
          <div class="completion-card">
            <h3 class="card-title">计划完成率</h3>
            <el-progress
              type="circle"
              :percentage="boardData.flowStats?.planCompletionRate || 0"
              :width="150"
              :stroke-width="12"
              color="#67c23a"
            >
              <template #default="{ percentage }">
                <span class="percentage-value">{{ percentage }}%</span>
              </template>
            </el-progress>
            <div class="completion-detail">
              {{ boardData.flowStats?.plans?.completed || 0 }} / {{ boardData.flowStats?.totalPlans || 0 }}
            </div>
          </div>

          <div class="completion-card">
            <h3 class="card-title">任务完成率</h3>
            <el-progress
              type="circle"
              :percentage="boardData.flowStats?.taskCompletionRate || 0"
              :width="150"
              :stroke-width="12"
              color="#409eff"
            >
              <template #default="{ percentage }">
                <span class="percentage-value">{{ percentage }}%</span>
              </template>
            </el-progress>
            <div class="completion-detail">
              {{ boardData.flowStats?.tasks?.completed || 0 }} / {{ boardData.flowStats?.totalTasks || 0 }}
            </div>
          </div>

          <div class="completion-card">
            <h3 class="card-title">入库完成率</h3>
            <el-progress
              type="circle"
              :percentage="boardData.inboundStats?.completionRate || 0"
              :width="150"
              :stroke-width="12"
              color="#e6a23c"
            >
              <template #default="{ percentage }">
                <span class="percentage-value">{{ percentage }}%</span>
              </template>
            </el-progress>
            <div class="completion-detail">
              {{ boardData.inboundStats?.completed || 0 }} / {{ boardData.inboundStats?.total || 0 }}
            </div>
          </div>
        </div>

        <!-- 最近的生产计划 -->
        <div v-if="cardKey === 'recentPlans' && cardConfig.includes('recentPlans')" class="recent-plans-section">
          <h2 class="section-title">
            <el-icon><Tickets /></el-icon>
            最近生产计划
            <span v-if="autoScroll" class="scroll-indicator">
              <el-icon class="is-loading"><Loading /></el-icon>
              自动滚动中
            </span>
          </h2>
          <div
            class="table-scroll-wrapper"
            @mouseenter="pauseScroll"
            @mouseleave="resumeScroll"
          >
            <el-table
              ref="tableRef"
              :data="boardData.recentPlans"
              stripe
              style="width: 100%"
              :height="autoScroll ? visibleRows * 48 + 48 : undefined"
            >
              <el-table-column prop="code" label="计划编号" width="150" />
              <el-table-column prop="name" label="计划名称" min-width="130" />
              <el-table-column prop="product_code" label="产品编码" width="200" />
              <el-table-column prop="product_name" label="产品名称" min-width="200" />
              <el-table-column prop="quantity" label="数量" width="150" align="right">
                <template #default="scope">
                  {{ scope.row.quantity }} {{ scope.row.unit }}
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="120">
                <template #default="scope">
                  <el-tag :type="getStatusType(scope.row.status)">
                    {{ getStatusText(scope.row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="任务进度" width="150">
                <template #default="scope">
                  <el-progress
                    :percentage="Number(scope.row.taskCompletionRate)"
                    :stroke-width="8"
                    :color="getProgressColor(Number(scope.row.taskCompletionRate))"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="start_date" label="计划开始" width="120" />
              <el-table-column prop="end_date" label="计划结束" width="120" />
            </el-table>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import {
  DataBoard, Clock, Loading, Document, List, Setting, CircleCheck,
  TrendCharts, Right, Tickets, Rank
} from '@element-plus/icons-vue'
import axios from 'axios'
import { PRODUCTION_FLOW_STEPS } from '@/constants/systemConstants'

// 数据
const loading = ref(true)
const boardData = ref({})
const updateTime = ref('')
let refreshTimer = null

// ========== 看板配置相关 ==========
const STORAGE_KEY = 'production_board_config'

// 所有可用的卡片选项
const allCardOptions = [
  { key: 'statsCards', label: '今日统计卡片' },
  { key: 'flowSection', label: '生产流程进度' },
  { key: 'completionSection', label: '完成率统计' },
  { key: 'recentPlans', label: '最近生产计划' }
]

// 默认配置
const defaultCardConfig = ['statsCards', 'flowSection', 'completionSection', 'recentPlans']
const defaultCardOrder = ['statsCards', 'flowSection', 'completionSection', 'recentPlans']
const defaultRecentPlansLimit = 12
const defaultAutoScroll = false
const defaultScrollSpeed = 3
const defaultVisibleRows = 6

// 当前配置（从 localStorage 加载）
const cardConfig = ref([...defaultCardConfig])
const cardOrder = ref([...defaultCardOrder])
const recentPlansLimit = ref(defaultRecentPlansLimit)
const autoScroll = ref(defaultAutoScroll)
const scrollSpeed = ref(defaultScrollSpeed)
const visibleRows = ref(defaultVisibleRows)

// 设置对话框相关
const showSettings = ref(false)
const tempCardConfig = ref([])
const tempCardOrder = ref([])
const tempRecentPlansLimit = ref(defaultRecentPlansLimit)
const tempAutoScroll = ref(defaultAutoScroll)
const tempScrollSpeed = ref(defaultScrollSpeed)
const tempVisibleRows = ref(defaultVisibleRows)
let dragIndex = null

// 滚动相关
const tableRef = ref(null)
let scrollTimer = null
let isPaused = false
let currentScrollTop = 0

// 加载配置
const loadConfig = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const config = JSON.parse(saved)
      cardConfig.value = config.cards || [...defaultCardConfig]
      cardOrder.value = config.order || [...defaultCardOrder]
      recentPlansLimit.value = config.recentPlansLimit || defaultRecentPlansLimit
      autoScroll.value = config.autoScroll ?? defaultAutoScroll
      scrollSpeed.value = config.scrollSpeed || defaultScrollSpeed
      visibleRows.value = config.visibleRows || defaultVisibleRows
    }
  } catch (e) {
    console.error('加载看板配置失败:', e)
  }
}

// 打开设置时初始化临时配置
const openSettings = () => {
  tempCardConfig.value = [...cardConfig.value]
  tempCardOrder.value = [...cardOrder.value]
  tempAutoScroll.value = autoScroll.value
  tempScrollSpeed.value = scrollSpeed.value
  tempVisibleRows.value = visibleRows.value
  showSettings.value = true
}

// 获取卡片标签
const getCardLabel = (key) => {
  const option = allCardOptions.find(opt => opt.key === key)
  return option ? option.label : key
}

// 拖拽排序
const handleDragStart = (index) => {
  dragIndex = index
}

const handleDrop = (targetIndex) => {
  if (dragIndex === null || dragIndex === targetIndex) return
  const item = tempCardOrder.value.splice(dragIndex, 1)[0]
  tempCardOrder.value.splice(targetIndex, 0, item)
  dragIndex = null
}

// 按钮移动
const moveCard = (index, direction) => {
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= tempCardOrder.value.length) return
  const temp = tempCardOrder.value[index]
  tempCardOrder.value[index] = tempCardOrder.value[newIndex]
  tempCardOrder.value[newIndex] = temp
}

// 保存设置
const saveSettings = () => {
  cardConfig.value = [...tempCardConfig.value]
  cardOrder.value = [...tempCardOrder.value]
  recentPlansLimit.value = tempRecentPlansLimit.value
  autoScroll.value = tempAutoScroll.value
  scrollSpeed.value = tempScrollSpeed.value
  visibleRows.value = tempVisibleRows.value

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cards: cardConfig.value,
      order: cardOrder.value,
      recentPlansLimit: recentPlansLimit.value,
      autoScroll: autoScroll.value,
      scrollSpeed: scrollSpeed.value,
      visibleRows: visibleRows.value
    }))
    ElMessage.success('看板设置已保存')
    // 重新获取数据以应用新的条数限制
    fetchBoardData()
    // 重新启动滚动
    stopAutoScroll()
    if (autoScroll.value) {
      nextTick(() => startAutoScroll())
    }
  } catch (e) {
    console.error('保存看板配置失败:', e)
    ElMessage.error('保存失败')
  }

  showSettings.value = false
}

// 恢复默认设置
const resetSettings = () => {
  tempCardConfig.value = [...defaultCardConfig]
  tempCardOrder.value = [...defaultCardOrder]
  tempRecentPlansLimit.value = defaultRecentPlansLimit
  tempAutoScroll.value = defaultAutoScroll
  tempScrollSpeed.value = defaultScrollSpeed
  tempVisibleRows.value = defaultVisibleRows
  ElMessage.info('已恢复默认设置，请点击保存生效')
}

// 生产流程步骤定义（使用统一常量）
const flowSteps = PRODUCTION_FLOW_STEPS

// 获取看板数据
const fetchBoardData = async () => {
  try {
    // 直接使用相对路径，因为 axios.defaults.baseURL 已经设置为 '/api'
    const response = await axios.get('/public/production-board', {
      params: { limit: recentPlansLimit.value }
    })

    // 原生axios，response.data是完整响应 { success, message, data, timestamp }
    // 真正的业务数据在 response.data.data 中
    if (response.data && response.data.success && response.data.data) {
      boardData.value = response.data.data
      updateTime.value = new Date(response.data.data.updatedAt).toLocaleString('zh-CN')
    }
  } catch (error) {
    console.error('获取看板数据失败:', error)
  } finally {
    loading.value = false
  }
}

// 获取步骤数量
const getStepCount = (status) => {
  const plans = boardData.value.flowStats?.plans[status] || 0
  const tasks = boardData.value.flowStats?.tasks[status] || 0
  return plans + tasks
}

// 获取状态类型
const getStatusType = (status) => {
  const typeMap = {
    draft: 'info',
    allocated: 'warning',
    material_issuing: 'warning',
    preparing: 'warning',
    material_issued: 'primary',
    in_progress: 'primary',
    inspection: 'warning',
    warehousing: 'success',
    completed: 'success'
  }
  return typeMap[status] || 'info'
}

// 获取状态文本
const getStatusText = (status) => {
  const textMap = {
    draft: '未开始',
    allocated: '分配中',
    material_issuing: '发料中',
    preparing: '配料中',
    material_issued: '已发料',
    in_progress: '生产中',
    inspection: '待检验',
    warehousing: '入库中',
    completed: '已完成'
  }
  return textMap[status] || status
}

// 获取进度条颜色
const getProgressColor = (percentage) => {
  if (percentage >= 100) return '#67c23a'
  if (percentage >= 80) return '#409eff'
  if (percentage >= 50) return '#e6a23c'
  return '#f56c6c'
}

// ========== 自动滚动相关 ==========
const startAutoScroll = () => {
  if (!autoScroll.value || !tableRef.value) return

  // 等待 DOM 更新
  nextTick(() => {
    const tableEl = tableRef.value?.$el
    if (!tableEl) return

    // el-table 的滚动容器
    const scrollWrapper = tableEl.querySelector('.el-scrollbar__wrap')
    if (!scrollWrapper) return

    const rowHeight = 48 // 每行高度

    scrollTimer = setInterval(() => {
      if (isPaused) return

      const scrollHeight = scrollWrapper.scrollHeight
      const clientHeight = scrollWrapper.clientHeight

      if (scrollHeight <= clientHeight) return // 内容不够滚动

      currentScrollTop += rowHeight
      if (currentScrollTop >= scrollHeight - clientHeight) {
        currentScrollTop = 0 // 回到顶部
      }

      scrollWrapper.scrollTo({
        top: currentScrollTop,
        behavior: 'smooth'
      })
    }, scrollSpeed.value * 1000)
  })
}

const stopAutoScroll = () => {
  if (scrollTimer) {
    clearInterval(scrollTimer)
    scrollTimer = null
  }
  currentScrollTop = 0
}

const pauseScroll = () => {
  isPaused = true
}

const resumeScroll = () => {
  isPaused = false
}

// 监听数据变化，重新启动滚动
watch(() => boardData.value.recentPlans, () => {
  if (autoScroll.value) {
    stopAutoScroll()
    setTimeout(() => startAutoScroll(), 500) // 延迟启动，确保表格渲染完成
  }
})

// 生命周期
onMounted(() => {
  loadConfig() // 加载配置
  tempCardConfig.value = [...cardConfig.value]
  tempCardOrder.value = [...cardOrder.value]
  tempRecentPlansLimit.value = recentPlansLimit.value
  tempAutoScroll.value = autoScroll.value
  tempScrollSpeed.value = scrollSpeed.value
  tempVisibleRows.value = visibleRows.value
  fetchBoardData()
  // 每30秒自动刷新
  refreshTimer = setInterval(fetchBoardData, 30000)
  // 启动自动滚动
  if (autoScroll.value) {
    nextTick(() => startAutoScroll())
  }
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
  stopAutoScroll()
})
</script>

<style scoped>
.production-board {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a2a3a 0%, #2c3e50 50%, #34495e 100%);
  padding: 20px;
}

.board-header {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.board-title {
  font-size: 28px;
  font-weight: bold;
  color: #333;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
}

.title-icon {
  font-size: 32px;
  color: #2980b9;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.update-time {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #666;
  font-size: 14px;
}

/* 设置对话框样式 */
.settings-content h4 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 15px;
}

.card-checkbox-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 12px;
  background: var(--color-bg-hover);
  border-radius: 8px;
}

.card-order-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-order-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg-hover);
  border-radius: 8px;
  cursor: grab;
  transition: all 0.2s;
}

.card-order-item:hover {
  background: #e6f7ff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-order-item:active {
  cursor: grabbing;
}

.card-order-item .el-icon {
  color: #999;
}

.card-order-item span {
  flex: 1;
  font-size: 14px;
}

.order-actions {
  display: flex;
  gap: 4px;
}

.limit-setting {
  padding: 12px 16px;
  background: var(--color-bg-hover);
  border-radius: 8px;
}

.limit-setting :deep(.el-slider) {
  padding-right: 100px;
}

.limit-setting :deep(.el-input-number) {
  width: 80px;
}

.scroll-setting {
  padding: 12px 16px;
  background: var(--color-bg-hover);
  border-radius: 8px;
}

.scroll-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.scroll-row:last-child {
  margin-bottom: 0;
}

.scroll-row > span:first-child {
  width: 140px;
  flex-shrink: 0;
  font-size: 14px;
  color: #666;
}

.speed-value {
  min-width: 40px;
  font-size: 14px;
  color: var(--color-primary);
  font-weight: 500;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: white;
  font-size: 18px;
}

.board-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 统计卡片 */
.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s, box-shadow 0.3s;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.stat-icon {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.stat-info {
  flex: 1;
}

.stat-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #333;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-sub {
  font-size: 12px;
  color: #999;
}

/* 流程步骤 */
.flow-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.section-title {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  margin: 0 0 20px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.flow-steps {
  display: flex;
  align-items: center;
  overflow-x: auto;
  padding: 20px 0;
  gap: 12px;
}

.flow-step {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #e0e0e0;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 14px;
}

.flow-step.has-data .step-number {
  background: linear-gradient(135deg, #2980b9 0%, #3498db 100%);
  color: white;
}

.step-content {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 12px 16px;
  min-width: 120px;
}

.flow-step.has-data .step-content {
  background: linear-gradient(135deg, #e8f4fc 0%, #d4edfc 100%);
  border: 2px solid #2980b9;
}

.step-name {
  font-weight: bold;
  color: #333;
  margin-bottom: 8px;
  font-size: 14px;
}

.step-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.step-stat {
  font-size: 12px;
  color: #666;
}

.step-stat .stat-label {
  color: #999;
}

.step-stat .stat-value {
  font-weight: bold;
  color: #2980b9;
  margin-left: 4px;
}

.step-arrow {
  color: #999;
  font-size: 20px;
}

/* 完成率统计 */
.completion-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.completion-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin: 0 0 20px 0;
}

.percentage-value {
  font-size: 24px;
  font-weight: bold;
}

.completion-detail {
  margin-top: 12px;
  font-size: 14px;
  color: #666;
}

/* 最近计划 */
.recent-plans-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.scroll-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 12px;
  font-size: 14px;
  color: var(--color-primary);
  font-weight: normal;
}

.table-scroll-container {
  overflow-y: auto;
  scroll-behavior: smooth;
}

/* 响应式 */
@media (max-width: 768px) {
  .board-header {
    padding: 16px;
  }

  .header-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .board-title {
    font-size: 20px;
  }

  .stats-cards {
    grid-template-columns: 1fr;
  }

  .flow-steps {
    flex-direction: column;
    align-items: stretch;
  }

  .flow-step {
    flex-direction: column;
  }

  .step-arrow {
    transform: rotate(90deg);
  }

  .completion-section {
    grid-template-columns: 1fr;
  }
}
</style>

