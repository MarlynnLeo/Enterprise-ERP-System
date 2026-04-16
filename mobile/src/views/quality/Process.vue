<!--
/**
 * Process.vue
 * @description 过程检验列表页面 — 统一 Unified 暗色风格
 * @date 2025-12-27
 * @version 2.0.0
 */
-->
<template>
  <div class="inspection-page">
    <NavBar title="过程检验" left-arrow @click-left="$router.go(-1)">
      <template #right>
        <VanIcon name="plus" size="18" @click="createInspection" />
      </template>
    </NavBar>

    <div class="content-container">
      <!-- 搜索和筛选 -->
      <div class="search-section">
        <Search
          v-model="searchKeyword"
          placeholder="搜索工单号或工序名称"
          @search="handleSearch"
          @clear="handleClear"
        />
      </div>

      <!-- 状态筛选 -->
      <div class="filter-section">
        <div class="filter-tabs">
          <div
            v-for="status in inspectionStatuses"
            :key="status.value"
            class="filter-tab"
            :class="{ active: selectedStatus === status.value }"
            @click="selectStatus(status.value)"
          >
            {{ status.label }}
            <Badge v-if="status.count > 0" :content="status.count" />
          </div>
        </div>
      </div>

      <!-- 检验列表 -->
      <div class="inspections-list">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <div v-for="inspection in inspections" :key="inspection.id" class="inspection-item">
              <div class="inspection-header" @click="viewInspection(inspection)">
                <div class="inspection-info">
                  <div class="inspection-number">{{ inspection.inspection_no }}</div>
                  <div class="batch-number">工单: {{ inspection.reference_no || '--' }}</div>
                </div>
                <div class="inspection-status">
                  <div class="status-badge" :class="getStatusClass(inspection.status)">
                    {{ getStatusLabel(inspection.status) }}
                  </div>
                  <div class="inspection-date">
                    {{ formatDate(inspection.planned_date || inspection.created_at) }}
                  </div>
                </div>
              </div>

              <div class="inspection-content">
                <div class="material-info">
                  <div class="material-name">
                    {{ inspection.item_name || inspection.product_name || '--' }}
                  </div>
                  <div class="supplier-name">工序: {{ inspection.item_code || '--' }}</div>
                </div>
                <div class="quantity-info">
                  <span class="quantity"
                    >数量: {{ inspection.quantity || 0 }} {{ inspection.unit || '件' }}</span
                  >
                  <span class="sample-size">抽检: {{ inspection.sample_size || 0 }}</span>
                </div>
              </div>

              <!-- 检验结果 -->
              <div class="inspection-results" v-if="inspection.status !== 'pending'">
                <div class="result-summary">
                  <div class="result-item">
                    <span class="result-label">合格数:</span>
                    <span class="result-value pass">{{ inspection.qualified_quantity || 0 }}</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">不合格数:</span>
                    <span class="result-value fail">{{
                      inspection.unqualified_quantity || 0
                    }}</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">合格率:</span>
                    <span class="result-value rate">{{ calculatePassRate(inspection) }}%</span>
                  </div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="inspection-actions" v-if="inspection.status === 'pending'">
                <Button size="small" type="primary" @click="startInspection(inspection)">
                  开始检验
                </Button>
              </div>

              <div class="inspection-actions" v-else-if="inspection.status === 'in_progress'">
                <Button size="small" type="success" @click="completeInspection(inspection)">
                  完成检验
                </Button>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-if="!loading && inspections.length === 0" class="empty-state">
              <VanIcon name="search" size="48" color="var(--text-secondary)" />
              <p>暂无过程检验记录</p>
            </div>
          </List>
        </PullRefresh>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Icon,
    Search,
    PullRefresh,
    List,
    Badge,
    Button,
    showToast,
    showConfirmDialog,
    Icon as VanIcon
  } from 'vant'
  import { qualityApi } from '@/services/api'

  const router = useRouter()

  // 响应式数据
  const inspections = ref([])
  const loading = ref(false)
  const finished = ref(false)
  const refreshing = ref(false)
  const searchKeyword = ref('')
  const selectedStatus = ref('')

  // 检验状态配置（对齐数据库 ENUM）
  const inspectionStatuses = ref([
    { label: '全部', value: '', count: 0 },
    { label: '待检验', value: 'pending', count: 0 },
    { label: '检验中', value: 'in_progress', count: 0 },
    { label: '已通过', value: 'passed', count: 0 },
    { label: '不合格', value: 'failed', count: 0 }
  ])

  // 获取状态标签
  const getStatusLabel = (status) => {
    const statusMap = {
      pending: '待检验',
      in_progress: '检验中',
      passed: '已通过',
      failed: '不合格',
      conditional: '有条件放行'
    }
    return statusMap[status] || status
  }

  // 获取状态样式类
  const getStatusClass = (status) => {
    const classMap = {
      pending: 'pending',
      in_progress: 'in-progress',
      passed: 'completed',
      failed: 'failed',
      conditional: 'conditional'
    }
    return classMap[status] || 'default'
  }

  // 格式化日期
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN')
  }

  // 计算合格率
  const calculatePassRate = (inspection) => {
    const total = (inspection.qualified_quantity || 0) + (inspection.unqualified_quantity || 0)
    if (total === 0) return 0
    return Math.round(((inspection.qualified_quantity || 0) / total) * 100)
  }

  // 加载检验列表
  const loadInspections = async (isRefresh = false) => {
    if (isRefresh) {
      inspections.value = []
      finished.value = false
    }

    try {
      const params = {
        page: Math.floor(inspections.value.length / 20) + 1,
        limit: 20,
        keyword: searchKeyword.value || undefined,
        status: selectedStatus.value || undefined
      }

      const response = await qualityApi.getProcessInspections(params)
      const responseData = response.data
      const pageData = responseData.data || responseData
      const newInspections = pageData.list || pageData.items || pageData.rows || []

      if (isRefresh) {
        inspections.value = newInspections
      } else {
        inspections.value.push(...newInspections)
      }

      finished.value = newInspections.length < 20
    } catch (error) {
      console.error('加载过程检验列表失败:', error)
      finished.value = true
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  // 事件处理
  const onLoad = () => {
    loading.value = true
    loadInspections()
  }

  const onRefresh = () => {
    refreshing.value = true
    loadInspections(true)
  }

  const handleSearch = () => {
    loadInspections(true)
  }

  const handleClear = () => {
    searchKeyword.value = ''
    loadInspections(true)
  }

  const selectStatus = (status) => {
    selectedStatus.value = status
    loadInspections(true)
  }

  const viewInspection = (inspection) => {
    router.push({
      path: `/quality/process/${inspection.id}`,
      query: { data: JSON.stringify(inspection) }
    })
  }

  const createInspection = () => {
    router.push('/quality/process/create')
  }

  // 使用通用更新接口 PUT /quality/inspections/:id
  const startInspection = async (inspection) => {
    try {
      await qualityApi.startInspection(inspection.id)
      showToast({ message: '✓ 检验已开始', duration: 2000 })
      loading.value = true
      finished.value = true
      selectedStatus.value = 'in_progress'
      await loadInspections(true)
    } catch (error) {
      console.error('开始检验失败:', error)
      showToast('操作失败')
    }
  }

  const completeInspection = async (inspection) => {
    try {
      await showConfirmDialog({
        title: '确认完成',
        message: `确定要完成检验 ${inspection.inspection_no} 吗？`
      })
      await qualityApi.completeInspection(inspection.id, {
        qualified_quantity: inspection.quantity,
        unqualified_quantity: 0
      })
      showToast({ message: '✓ 检验完成', duration: 2000 })
      loading.value = true
      finished.value = true
      selectedStatus.value = 'passed'
      await loadInspections(true)
    } catch (error) {
      if (error === 'cancel') return
      console.error('完成检验失败:', error)
      showToast('操作失败')
    }
  }

  onMounted(() => {
    loadInspections(true)
  })
</script>

<style lang="scss" scoped>
  @import '@/assets/styles/variables.scss';

  .inspection-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 80px;
  }

  .content-container {
    padding: 0 12px 12px;
  }

  .search-section {
    padding: 12px 0;
  }

  .filter-section {
    margin-bottom: 12px;

    .filter-tabs {
      display: flex;
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 4px;
      overflow-x: auto;

      .filter-tab {
        flex-shrink: 0;
        text-align: center;
        padding: 8px 12px;
        font-size: 0.875rem;
        color: var(--text-secondary);
        border-radius: 6px;
        transition: all 0.2s;
        white-space: nowrap;

        &.active {
          background-color: var(--color-primary);
          color: var(--text-primary);
        }
      }
    }
  }

  .inspections-list {
    .inspection-item {
      background: var(--bg-secondary);
      border-radius: 8px;
      margin-bottom: 8px;
      padding: 16px;
      border: 1px solid var(--glass-border);

      .inspection-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;

        .inspection-info {
          .inspection-number {
            font-size: 1rem;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 4px;
          }

          .batch-number {
            font-size: 0.75rem;
            color: var(--text-secondary);
          }
        }

        .inspection-status {
          text-align: right;

          .status-badge {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.625rem;
            color: var(--text-primary);
            margin-bottom: 4px;

            &.pending {
              background-color: var(--text-tertiary);
            }
            &.in-progress {
              background-color: var(--color-warning);
            }
            &.completed {
              background-color: var(--color-success);
            }
          }

          .inspection-date {
            font-size: 0.75rem;
            color: var(--text-secondary);
          }
        }
      }

      .inspection-content {
        margin-bottom: 12px;

        .material-info {
          margin-bottom: 8px;

          .material-name {
            font-size: 0.875rem;
            color: var(--text-primary);
            margin-bottom: 4px;
          }

          .supplier-name {
            font-size: 0.75rem;
            color: var(--text-secondary);
          }
        }

        .quantity-info {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
      }

      .inspection-results {
        border-top: 1px solid var(--glass-border);
        padding-top: 12px;
        margin-bottom: 12px;

        .result-summary {
          display: flex;
          justify-content: space-around;

          .result-item {
            text-align: center;

            .result-label {
              display: block;
              font-size: 0.75rem;
              color: var(--text-secondary);
              margin-bottom: 4px;
            }

            .result-value {
              font-size: 0.875rem;
              font-weight: 600;

              &.pass {
                color: var(--color-success);
              }
              &.fail {
                color: var(--color-error);
              }
              &.rate {
                color: var(--text-primary);
              }
            }
          }
        }
      }

      .inspection-actions {
        display: flex;
        gap: 8px;
        border-top: 1px solid var(--glass-border);
        padding-top: 12px;

        .van-button {
          flex: 1;
        }
      }
    }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    color: var(--text-secondary);
    font-size: 0.875rem;

    p {
      margin-top: 12px;
    }
  }
</style>
