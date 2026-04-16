<!--
/**
 * AssetDetail.vue - 固定资产详情
 * @description 展示固定资产的完整信息
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="资产详情" left-arrow @click-left="$router.go(-1)" />

    <div class="detail-body" v-if="asset">
      <!-- 头部卡片 -->
      <div class="hero-card">
        <div class="hero-icon">
          <SvgIcon name="briefcase" size="1.5rem" />
        </div>
        <div class="hero-info">
          <div class="hero-title">{{ asset.asset_name || asset.name }}</div>
          <div class="hero-sub">{{ asset.asset_code }}</div>
        </div>
        <div class="hero-status" :class="statusClass">{{ statusText }}</div>
      </div>

      <!-- 价值卡片 -->
      <div class="amount-card">
        <div class="amount-row">
          <div class="amount-item">
            <span class="amount-label">资产原值</span>
            <span class="amount-value primary">¥{{ formatMoney(asset.original_value) }}</span>
          </div>
          <div class="amount-item">
            <span class="amount-label">累计折旧</span>
            <span class="amount-value warning"
              >¥{{ formatMoney(asset.accumulated_depreciation) }}</span
            >
          </div>
        </div>
        <div class="amount-row">
          <div class="amount-item">
            <span class="amount-label">净值</span>
            <span class="amount-value success">¥{{ formatMoney(asset.net_value) }}</span>
          </div>
          <div class="amount-item">
            <span class="amount-label">残值</span>
            <span class="amount-value">¥{{ formatMoney(asset.salvage_value) }}</span>
          </div>
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="info-section">
        <div class="section-title">基本信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">资产编号</span>
            <span class="info-value mono">{{ asset.asset_code }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">资产类别</span>
            <span class="info-value">{{ asset.category_name || asset.category || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">使用部门</span>
            <span class="info-value">{{ asset.department_name || asset.department || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">存放位置</span>
            <span class="info-value">{{ asset.location || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">购入日期</span>
            <span class="info-value">{{ formatDate(asset.purchase_date) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">使用年限</span>
            <span class="info-value">{{ asset.useful_life || '—' }} 年</span>
          </div>
          <div class="info-item">
            <span class="info-label">折旧方法</span>
            <span class="info-value">{{ asset.depreciation_method || '直线法' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">状态</span>
            <span class="info-value" :class="statusClass">{{ statusText }}</span>
          </div>
          <div class="info-item full" v-if="asset.description || asset.notes">
            <span class="info-label">说明</span>
            <span class="info-value">{{ asset.description || asset.notes }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="loading-state" v-else-if="loading">
      <Loading size="24px" /><span>加载中...</span>
    </div>
    <Empty v-else description="资产不存在或加载失败" />
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { NavBar, Loading, Empty, showToast } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { financeApi } from '@/services/api'
  import dayjs from 'dayjs'

  const route = useRoute()
  const asset = ref(null)
  const loading = ref(true)

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : '—')
  const formatMoney = (v) => {
    const n = Number(v)
    return isNaN(n)
      ? '0.00'
      : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const statusMap = {
    in_use: { text: '在用', cls: 'success' },
    在用: { text: '在用', cls: 'success' },
    idle: { text: '闲置', cls: 'warning' },
    闲置: { text: '闲置', cls: 'warning' },
    scrapped: { text: '报废', cls: 'danger' },
    报废: { text: '报废', cls: 'danger' }
  }
  const statusText = computed(
    () => statusMap[asset.value?.status]?.text || asset.value?.status || '—'
  )
  const statusClass = computed(() => statusMap[asset.value?.status]?.cls || 'default')

  onMounted(async () => {
    try {
      const res = await financeApi.getAssetById(route.params.id)
      const d = res.data || res
      asset.value = d.data || d
    } catch (e) {
      console.error('加载资产详情失败:', e)
      showToast('加载失败')
    } finally {
      loading.value = false
    }
  })
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100vh;
    background: var(--bg-primary);
    padding-bottom: 100px;
  }
  .detail-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .hero-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
  }
  .hero-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(168, 85, 247, 0.1);
    color: #a855f7;
    flex-shrink: 0;
  }
  .hero-info {
    flex: 1;
  }
  .hero-title {
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .hero-sub {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    margin-top: 2px;
    font-family: 'SF Mono', monospace;
  }
  .hero-status {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.6875rem;
    font-weight: 700;
    flex-shrink: 0;
    &.success {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }
    &.warning {
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
    }
    &.danger {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
    &.default {
      background: rgba(107, 114, 128, 0.1);
      color: #6b7280;
    }
  }

  .amount-card {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .amount-row {
    display: flex;
    gap: 12px;
  }
  .amount-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .amount-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .amount-value {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'SF Mono', monospace;
    &.primary {
      color: #3b82f6;
    }
    &.success {
      color: #10b981;
    }
    &.warning {
      color: #f59e0b;
    }
    &.danger {
      color: #ef4444;
    }
  }

  .info-section {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
  }
  .section-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 12px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }
  .info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    &.full {
      grid-column: span 2;
    }
  }
  .info-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .info-value {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    &.mono {
      font-family: 'SF Mono', monospace;
    }
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding-top: 40vh;
    color: var(--text-tertiary);
  }
</style>
