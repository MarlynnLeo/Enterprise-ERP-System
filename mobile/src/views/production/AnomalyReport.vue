<!--
/**
 * AnomalyReport.vue - 移动端异常上报(Andon)
 * @description 装配异常快速上报与跟踪处理 — 移动端
 * @date 2026-06-23
 */
-->
<template>
  <div class="anomaly-page">
    <NavBar title="异常上报" left-arrow @click-left="$router.go(-1)">
      <template #right>
        <Icon name="plus" size="18" @click="showCreate = true" />
      </template>
    </NavBar>

    <div class="content-wrapper">
      <!-- 统计概览 -->
      <div class="stats-banner">
        <div class="stat-item">
          <span class="stat-num danger">{{ stats.open || 0 }}</span>
          <span class="stat-label">待处理</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num accent">{{ stats.processing || 0 }}</span>
          <span class="stat-label">处理中</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num success">{{ stats.resolved || 0 }}</span>
          <span class="stat-label">已解决</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num">{{ stats.closed || 0 }}</span>
          <span class="stat-label">已关闭</span>
        </div>
      </div>

      <!-- 状态筛选 -->
      <div class="filter-scroll-wrapper">
        <div class="filter-scroll">
          <div
            v-for="tab in statusTabs"
            :key="tab.value"
            class="filter-chip"
            :class="{ active: activeStatus === tab.value }"
            @click="activeStatus = tab.value; loadData(true)"
          >
            <span class="chip-text">{{ tab.label }}</span>
            <span v-if="getCount(tab.value)" class="chip-badge">{{ getCount(tab.value) }}</span>
          </div>
        </div>
      </div>

      <!-- 列表 -->
      <div class="anomaly-list">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <Empty v-if="list.length === 0 && !loading" description="暂无异常记录" />

          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <div
              v-for="(item, index) in list"
              :key="item.id"
              class="anomaly-card"
              :style="{ animationDelay: `${index * 0.03}s` }"
              @click="viewDetail(item)"
            >
              <!-- 左侧色条 -->
              <div class="card-accent" :class="severityAccent(item.severity)"></div>

              <!-- 卡片主体 -->
              <div class="card-body">
                <div class="card-top">
                  <div class="code-area">
                    <span class="item-code">{{ item.code }}</span>
                    <span class="severity-tag" :class="severityAccent(item.severity)">{{ severityLabel[item.severity] }}</span>
                  </div>
                  <span class="status-tag" :class="statusAccent(item.status)">{{ statusLabel[item.status] }}</span>
                </div>
                <div class="item-title">{{ item.title }}</div>
                <div class="card-bottom">
                  <div class="meta-area">
                    <span class="meta-item" v-if="item.reporter_name">{{ item.reporter_name }}</span>
                    <span class="meta-item">{{ categoryLabel[item.category] || item.category }}</span>
                    <span class="meta-item" v-if="item.location">{{ item.location }}</span>
                  </div>
                  <span class="meta-time">{{ formatTime(item.createdAt) }}</span>
                </div>
              </div>
            </div>
          </List>
        </PullRefresh>
      </div>
    </div>

    <!-- 上报弹窗 -->
    <Popup v-model:show="showCreate" position="bottom" :style="{ height: '70%' }" round>
      <div class="create-dialog">
        <div class="dialog-header">
          <div class="dialog-title">上报异常</div>
          <VanIcon name="cross" size="18" @click="showCreate = false" />
        </div>
        <div class="dialog-content">
          <Field v-model="form.title" label="标题" placeholder="简要描述异常" required />
          <Field v-model="form.category" is-link readonly label="类别" :placeholder="categoryLabel[form.category]" @click="showCategoryPicker = true" />
          <Field v-model="form.severity" is-link readonly label="严重程度" :placeholder="severityLabel[form.severity]" @click="showSeverityPicker = true" />
          <Field v-model="form.location" label="位置" placeholder="发生位置/工位" />
          <Field v-model="form.description" type="textarea" label="描述" placeholder="详细描述异常情况" rows="3" required />
          <div class="form-actions">
            <VanButton block type="primary" @click="submitReport" :loading="submitting">提交上报</VanButton>
          </div>
        </div>
      </div>
    </Popup>

    <!-- 类别选择器 -->
    <Popup v-model:show="showCategoryPicker" position="bottom" round>
      <Picker
        :columns="categoryOptions"
        @confirm="onCategoryConfirm"
        @cancel="showCategoryPicker = false"
      />
    </Popup>

    <!-- 严重程度选择器 -->
    <Popup v-model:show="showSeverityPicker" position="bottom" round>
      <Picker
        :columns="severityOptions"
        @confirm="onSeverityConfirm"
        @cancel="showSeverityPicker = false"
      />
    </Popup>

    <!-- 详情弹窗 -->
    <Popup v-model:show="showDetail" position="bottom" :style="{ height: '75%' }" round>
      <div class="detail-dialog" v-if="detail">
        <div class="dialog-header">
          <div class="dialog-title">{{ detail.code }}</div>
          <VanIcon name="cross" size="18" @click="showDetail = false" />
        </div>
        <div class="dialog-content detail-content">
          <div class="detail-section">
            <div class="detail-row">
              <span class="detail-label">标题</span>
              <span class="detail-value">{{ detail.title }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">类别</span>
              <span class="detail-value">{{ categoryLabel[detail.category] }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">严重程度</span>
              <span class="severity-tag" :class="severityAccent(detail.severity)">{{ severityLabel[detail.severity] }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">状态</span>
              <span class="status-tag" :class="statusAccent(detail.status)">{{ statusLabel[detail.status] }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">上报人</span>
              <span class="detail-value">{{ detail.reporter_name || '-' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">位置</span>
              <span class="detail-value">{{ detail.location || '-' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">处理人</span>
              <span class="detail-value">{{ detail.assignee_name || '-' }}</span>
            </div>
          </div>
          <div class="detail-section">
            <div class="section-title">异常描述</div>
            <div class="description-text">{{ detail.description }}</div>
          </div>
          <div class="detail-section" v-if="detail.resolution">
            <div class="section-title">解决方案</div>
            <div class="description-text">{{ detail.resolution }}</div>
          </div>

          <!-- 操作按钮 -->
          <div class="detail-actions" v-if="detail.status === 'open' || detail.status === 'processing'">
            <Field
              v-if="detail.status === 'processing'"
              v-model="resolution"
              type="textarea"
              label="解决方案"
              placeholder="请输入解决方案"
              rows="2"
            />
            <VanButton
              v-if="detail.status === 'processing'"
              block
              type="success"
              @click="handleResolve"
              :loading="submitting"
            >确认解决</VanButton>
          </div>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import {
    NavBar, Icon, PullRefresh, List, Empty, Popup, Field,
    Button as VanButton, Picker, Icon as VanIcon, showToast
  } from 'vant'
  import { productionApi } from '@/api'
  import dayjs from 'dayjs'

  // 状态/标签
  const categoryLabel = { quality: '质量', equipment: '设备', material: '物料', safety: '安全', process: '工艺', other: '其他' }
  const severityLabel = { low: '低', medium: '中', high: '高', critical: '紧急' }
  const statusLabel = { open: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' }

  const categoryOptions = Object.entries(categoryLabel).map(([k, v]) => ({ text: v, value: k }))
  const severityOptions = Object.entries(severityLabel).map(([k, v]) => ({ text: v, value: k }))

  const statusTabs = [
    { label: '全部', value: '' },
    { label: '待处理', value: 'open' },
    { label: '处理中', value: 'processing' },
    { label: '已解决', value: 'resolved' },
  ]

  // 数据
  const list = ref([])
  const stats = ref({})
  const loading = ref(false)
  const finished = ref(false)
  const refreshing = ref(false)
  const page = ref(1)
  const activeStatus = ref('')

  const showCreate = ref(false)
  const showDetail = ref(false)
  const showCategoryPicker = ref(false)
  const showSeverityPicker = ref(false)
  const submitting = ref(false)
  const detail = ref(null)
  const resolution = ref('')

  const form = reactive({
    title: '', category: 'quality', severity: 'medium', location: '', description: '',
  })

  // 样式映射
  const severityAccent = (s) => ({
    low: 'sev-low', medium: 'sev-medium', high: 'sev-high', critical: 'sev-critical'
  }[s] || 'sev-medium')

  const statusAccent = (s) => ({
    open: 'st-open', processing: 'st-processing', resolved: 'st-resolved', closed: 'st-closed'
  }[s] || 'st-open')

  const getCount = (status) => {
    if (!status) return (stats.value.open || 0) + (stats.value.processing || 0) + (stats.value.resolved || 0) + (stats.value.closed || 0)
    return stats.value[status] || 0
  }

  const formatTime = (d) => d ? dayjs(d).format('MM-DD HH:mm') : ''

  // 数据加载
  const loadData = async (isRefresh = false) => {
    if (isRefresh) {
      list.value = []
      page.value = 1
      finished.value = false
    }
    try {
      const params = { page: page.value, pageSize: 20 }
      if (activeStatus.value) params.status = activeStatus.value
      const res = await productionApi.getAnomalies(params)
      const data = res.data || res
      const items = data.list || []

      if (isRefresh) {
        list.value = items
      } else {
        list.value.push(...items)
      }
      finished.value = items.length < 20
      page.value++
    } catch {
      showToast('加载失败')
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  const loadStats = async () => {
    try {
      const res = await productionApi.getAnomalyStats()
      stats.value = res.data || res || {}
    } catch { /* silent */ }
  }

  const onLoad = () => { loading.value = true; loadData() }
  const onRefresh = () => { refreshing.value = true; loadData(true); loadStats() }

  // Picker 回调
  const onCategoryConfirm = ({ selectedOptions }) => {
    form.category = selectedOptions[0].value
    showCategoryPicker.value = false
  }
  const onSeverityConfirm = ({ selectedOptions }) => {
    form.severity = selectedOptions[0].value
    showSeverityPicker.value = false
  }

  // 提交上报
  const submitReport = async () => {
    if (!form.title?.trim()) return showToast('请填写标题')
    if (!form.description?.trim()) return showToast('请填写描述')
    submitting.value = true
    try {
      await productionApi.createAnomaly(form)
      showToast('上报成功')
      showCreate.value = false
      form.title = ''; form.description = ''; form.location = ''
      loadData(true)
      loadStats()
    } catch (err) {
      showToast(err.response?.data?.message || '上报失败')
    } finally {
      submitting.value = false
    }
  }

  // 查看详情
  const viewDetail = (item) => {
    detail.value = item
    resolution.value = ''
    showDetail.value = true
  }

  // 解决
  const handleResolve = async () => {
    if (!resolution.value?.trim()) return showToast('请输入解决方案')
    submitting.value = true
    try {
      await productionApi.resolveAnomaly(detail.value.id, { resolution: resolution.value })
      showToast('已解决')
      showDetail.value = false
      loadData(true)
      loadStats()
    } catch {
      showToast('操作失败')
    } finally {
      submitting.value = false
    }
  }

  onMounted(() => { loadData(true); loadStats() })
</script>

<style lang="scss" scoped>
  .anomaly-page {
    min-height: 100%;
    background-color: var(--bg-primary);
    padding-bottom: var(--app-bottom-space);
  }

  .content-wrapper {
    padding: 0 12px var(--app-bottom-space);
  }

  // 统计概览
  .stats-banner {
    display: flex;
    align-items: center;
    justify-content: space-around;
    background: var(--bg-secondary);
    border-radius: 12px;
    min-height: 74px;
    padding: 12px 8px;
    margin: 8px 0 12px;
    border: 1px solid var(--surface-border, var(--border-subtle));
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;

    .stat-num {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-primary);
      &.danger { color: var(--color-danger); }
      &.accent { color: var(--color-warning); }
      &.success { color: var(--ds-green-strong); }
    }
    .stat-label {
      font-size: 0.6875rem;
      color: var(--text-tertiary);
    }
  }

  .stat-divider {
    width: 1px;
    height: 28px;
    background: var(--van-border-color, var(--surface-border));
  }

  // 筛选标签
  .filter-scroll-wrapper {
    padding: 4px 0 8px;
    overflow: hidden;
  }

  .filter-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 2px 0 6px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
  }

  .filter-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: 20px;
    background: var(--bg-secondary);
    border: 1.5px solid var(--surface-border, var(--border-subtle));
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    transition: all 0.25s ease;
    cursor: pointer;

    .chip-text { font-weight: 500; }
    .chip-badge {
      min-width: 18px;
      height: 18px;
      line-height: 18px;
      text-align: center;
      font-size: 0.625rem;
      font-weight: 700;
      border-radius: 9px;
      background: var(--surface-border, var(--border-subtle));
      color: var(--text-secondary);
      padding: 0 4px;
    }

    &.active {
      background: var(--color-accent-bg, rgba(59, 130, 246, 0.1));
      border-color: var(--color-accent, var(--color-primary));
      color: var(--color-accent, var(--color-primary));
      .chip-badge {
        background: var(--color-accent, var(--color-primary));
        color: var(--text-primary);
      }
    }
  }

  // 列表卡片
  .anomaly-card {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 12px;
    margin-bottom: 10px;
    overflow: hidden;
    border: 1px solid var(--surface-border, var(--border-subtle));
    transition: all 0.2s ease;
    animation: fadeInUp 0.35s ease-out both;

    &:active {
      transform: scale(0.98);
    }
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  // 左侧色条（按严重程度）
  .card-accent {
    width: 4px;
    flex-shrink: 0;
    &.sev-low { background: linear-gradient(180deg, var(--text-secondary), var(--text-disabled)); }
    &.sev-medium { background: linear-gradient(180deg, var(--color-warning), var(--color-warning)); }
    &.sev-high { background: linear-gradient(180deg, #f97316, #ea580c); }
    &.sev-critical { background: linear-gradient(180deg, var(--color-danger), #dc2626); }
  }

  .card-body {
    flex: 1;
    padding: 12px 14px;
    min-width: 0;
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .code-area {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .item-code {
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  }

  // 严重程度标签
  .severity-tag {
    display: inline-flex;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 0.625rem;
    font-weight: 700;

    &.sev-low { background: rgba(148, 163, 184, 0.12); color: var(--text-secondary); }
    &.sev-medium { background: rgba(245, 158, 11, 0.12); color: var(--color-warning); }
    &.sev-high { background: rgba(249, 115, 22, 0.12); color: #f97316; }
    &.sev-critical { background: rgba(239, 68, 68, 0.15); color: var(--color-danger); }
  }

  // 状态标签
  .status-tag {
    display: inline-flex;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 0.625rem;
    font-weight: 700;

    &.st-open { background: rgba(239, 68, 68, 0.1); color: var(--color-danger); }
    &.st-processing { background: rgba(245, 158, 11, 0.12); color: var(--color-warning); }
    &.st-resolved { background: rgba(16, 185, 129, 0.12); color: var(--color-success); }
    &.st-closed { background: rgba(107, 114, 128, 0.1); color: var(--text-secondary); }
  }

  .item-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .meta-area {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .meta-item {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }

  .meta-time {
    font-size: 0.625rem;
    color: var(--text-disabled);
    font-family: 'SF Mono', monospace;
    flex-shrink: 0;
  }

  // 弹窗通用
  .create-dialog, .detail-dialog {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--surface-border, var(--border-subtle));
    .dialog-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
    }
  }

  .dialog-content {
    flex: 1;
    overflow-y: auto;
    padding-bottom: env(safe-area-inset-bottom, 20px);
  }

  .form-actions {
    padding: 16px;
  }

  // 详情
  .detail-content {
    padding: 0;
  }

  .detail-section {
    padding: 12px 16px;
    border-bottom: 1px solid var(--surface-border, var(--border-subtle));
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
  }

  .detail-label {
    font-size: 0.8125rem;
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .detail-value {
    font-size: 0.8125rem;
    color: var(--text-primary);
    text-align: right;
  }

  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .description-text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .detail-actions {
    padding: 12px 16px;
  }
</style>
