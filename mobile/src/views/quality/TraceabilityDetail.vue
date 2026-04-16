<!--
/**
 * TraceabilityDetail.vue
 * @description 鎵规杩芥函璇︽儏椤甸潰 鈥?灞曠ず瀹屾暣杩芥函閾捐矾
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="trace-detail-page">
    <NavBar title="杩芥函璇︽儏" left-arrow @click-left="$router.go(-1)" />

    <div class="content-wrapper">
      <!-- 鍔犺浇鐘舵€?-->
      <div v-if="loading" class="loading-state">
        <Loading type="spinner" size="28" color="var(--color-accent)">姝ｅ湪杩芥函涓?..</Loading>
      </div>

      <template v-else-if="traceData">
        <!-- 鎵规鎽樿鍗＄墖 -->
        <div class="summary-card">
          <div class="summary-header">
            <div
              class="summary-icon"
              :class="batchType === 'product' ? 'icon-product' : 'icon-material'"
            >
              {{ batchType === 'product' ? '馃彮' : '馃摝' }}
            </div>
            <div class="summary-info">
              <div class="summary-title">{{ materialCode }}</div>
              <div class="summary-subtitle">{{ batchNumber }}</div>
            </div>
            <div
              class="summary-badge"
              :class="batchType === 'product' ? 'badge-product' : 'badge-material'"
            >
              {{ batchType === 'product' ? '鎴愬搧' : '鍘熸枡' }}
            </div>
          </div>

          <!-- 鍩虹淇℃伅缃戞牸 -->
          <div v-if="traceData.material_name || traceData.specification" class="info-grid">
            <div class="info-item" v-if="traceData.material_name">
              <span class="info-label">鐗╂枡鍚嶇О</span>
              <span class="info-value">{{ traceData.material_name }}</span>
            </div>
            <div class="info-item" v-if="traceData.specification">
              <span class="info-label">瑙勬牸</span>
              <span class="info-value">{{ traceData.specification }}</span>
            </div>
            <div class="info-item" v-if="traceData.current_stock !== undefined">
              <span class="info-label">褰撳墠搴撳瓨</span>
              <span class="info-value highlight"
                >{{ traceData.current_stock }} {{ traceData.unit || '' }}</span
              >
            </div>
            <div class="info-item" v-if="traceData.supplier_name">
              <span class="info-label">渚涘簲鍟?/span>
              <span class="info-value">{{ traceData.supplier_name }}</span>
            </div>
          </div>
        </div>

        <!-- BOM 缁勪欢锛堟垚鍝佽拷婧椂鏄剧ず锛?-->
        <div
          v-if="traceData.bom_components && traceData.bom_components.length > 0"
          class="section-card"
        >
          <div class="section-title">
            <span class="section-icon">馃З</span>
            <span>鍘熸枡缁勬垚</span>
            <span class="section-count">{{ traceData.bom_components.length }}</span>
          </div>
          <div class="bom-list">
            <div v-for="(comp, idx) in traceData.bom_components" :key="idx" class="bom-item">
              <div class="bom-main">
                <span class="bom-name">{{ comp.raw_material_name || comp.raw_material_code }}</span>
                <span class="bom-qty">{{ comp.consumed_quantity }} {{ comp.unit || '' }}</span>
              </div>
              <div class="bom-meta">
                <span v-if="comp.raw_material_batch" class="bom-batch"
                  >鎵规: {{ comp.raw_material_batch }}</span
                >
                <span v-if="comp.supplier_name" class="bom-supplier">{{ comp.supplier_name }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 杩芥函閾捐矾 -->
        <div v-if="traceData.steps && traceData.steps.length > 0" class="section-card">
          <div class="section-title">
            <span class="section-icon">馃敆</span>
            <span>杩芥函閾捐矾</span>
            <span class="section-count">{{ traceData.steps.length }}</span>
          </div>
          <div class="timeline">
            <div v-for="(step, idx) in traceData.steps" :key="idx" class="timeline-item">
              <div class="timeline-dot" :class="getStepTypeClass(step.step_type)"></div>
              <div class="timeline-content">
                <div class="step-header">
                  <span class="step-type-badge" :class="getStepTypeClass(step.step_type)">
                    {{ getStepTypeLabel(step.step_type) }}
                  </span>
                  <span class="step-time">{{ formatDateTime(step.created_at) }}</span>
                </div>
                <div class="step-body">
                  <div class="step-ref" v-if="step.reference_no">{{ step.reference_no }}</div>
                  <div class="step-remark" v-if="step.remarks">{{ step.remarks }}</div>
                  <div class="step-qty" v-if="step.quantity">
                    鏁伴噺: <strong>{{ step.quantity }}</strong>
                  </div>
                  <div class="step-product" v-if="step.product_name">
                    浜у搧: {{ step.product_name }} ({{ step.product_code }})
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 鎵规娴佹按璁板綍 -->
        <div
          v-if="traceData.batch_transactions && traceData.batch_transactions.length > 0"
          class="section-card"
        >
          <div class="section-title">
            <span class="section-icon">馃摑</span>
            <span>娴佹按璁板綍</span>
            <span class="section-count">{{ traceData.batch_transactions.length }}</span>
          </div>
          <div class="transaction-list">
            <div v-for="(tx, idx) in traceData.batch_transactions" :key="idx" class="tx-item">
              <div class="tx-row">
                <span class="tx-type" :class="tx.quantity > 0 ? 'tx-in' : 'tx-out'">
                  {{ tx.quantity > 0 ? '鍏ュ簱' : '鍑哄簱' }}
                </span>
                <span class="tx-qty" :class="tx.quantity > 0 ? 'qty-positive' : 'qty-negative'">
                  {{ tx.quantity > 0 ? '+' : '' }}{{ tx.quantity }}
                </span>
              </div>
              <div class="tx-meta">
                <span v-if="tx.reference_no">{{ tx.reference_no }}</span>
                <span v-if="tx.location_name">{{ tx.location_name }}</span>
                <span>{{ formatDateTime(tx.created_at) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 绌洪摼璺彁绀?-->
        <div
          v-if="
            !traceData.steps?.length &&
            !traceData.bom_components?.length &&
            !traceData.batch_transactions?.length
          "
          class="empty-chain"
        >
          <Empty description="鏆傛棤杩芥函閾捐矾鏁版嵁" />
        </div>
      </template>

      <!-- 閿欒鐘舵€?-->
      <div v-else-if="errorMsg" class="error-state">
        <Empty image="error" :description="errorMsg">
          <template #default>
            <Button plain type="primary" size="small" @click="loadTraceData">閲嶈瘯</Button>
          </template>
        </Empty>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { NavBar, Loading, Empty, Button } from 'vant'
  import { qualityApi } from '@/services/api'

  const route = useRoute()
  const router = useRouter()

  const loading = ref(false)
  const traceData = ref(null)
  const errorMsg = ref('')

  // 浠?query 涓幏鍙栧弬鏁?  const materialCode = route.query.materialCode || ''
  const batchNumber = route.query.batchNumber || ''
  const batchType = route.query.type || 'material'

  // 姝ラ绫诲瀷鏍囩
  const getStepTypeLabel = (type) => {
    const map = {
      PURCHASE_IN: '閲囪喘鍏ュ簱',
      PRODUCTION_IN: '鐢熶骇鍏ュ簱',
      PRODUCTION_OUT: '鐢熶骇棰嗘枡',
      SALES_OUT: '閿€鍞嚭搴?,
      TRANSFER: '璋冩嫧',
      ADJUSTMENT: '璋冩暣',
      RETURN_IN: '閫€璐у叆搴?
    }
    return map[type] || type || '娴佽浆'
  }

  // 姝ラ绫诲瀷鏍峰紡
  const getStepTypeClass = (type) => {
    if (['PURCHASE_IN', 'PRODUCTION_IN', 'RETURN_IN'].includes(type)) return 'step-in'
    if (['SALES_OUT', 'PRODUCTION_OUT'].includes(type)) return 'step-out'
    return 'step-neutral'
  }

  // 鏍煎紡鍖栨棩鏈熸椂闂?  const formatDateTime = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 鍔犺浇杩芥函鏁版嵁
  const loadTraceData = async () => {
    if (!materialCode || !batchNumber) {
      errorMsg.value = '缂哄皯鐗╂枡缂栫爜鎴栨壒娆″彿'
      return
    }

    loading.value = true
    errorMsg.value = ''

    try {
      const response = await qualityApi.traceBatch(materialCode, batchNumber)
      const respData = response.data || response

      // 瑙ｆ瀽鍝嶅簲
      if (respData.success === false) {
        errorMsg.value = respData.message || '杩芥函澶辫触'
        return
      }

      traceData.value = respData.data || respData
    } catch (error) {
      console.error('杩芥函鏌ヨ澶辫触:', error)
      errorMsg.value = '杩芥函鏌ヨ澶辫触锛岃閲嶈瘯'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    loadTraceData()
  })
</script>

<style lang="scss" scoped>
  .trace-detail-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 40px;
  }

  .content-wrapper {
    padding: 12px;
  }

  // 鍔犺浇鐘舵€?  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 60vh;
  }

  // 閿欒鐘舵€?  .error-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 60vh;
  }

  // 鎽樿鍗＄墖
  .summary-card {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    margin-bottom: 12px;
    border: 1px solid var(--glass-border);
    box-shadow: none;
  }

  .summary-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .summary-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;

    &.icon-product {
      background: rgba(103, 193, 217, 0.12);
    }

    &.icon-material {
      background: rgba(245, 158, 11, 0.12);
    }
  }

  .summary-info {
    flex: 1;
    min-width: 0;

    .summary-title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-primary);
      word-break: break-all;
    }

    .summary-subtitle {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-top: 2px;
      font-family: 'SF Mono', 'Menlo', monospace;
      word-break: break-all;
    }
  }

  .summary-badge {
    flex-shrink: 0;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.6875rem;
    font-weight: 600;

    &.badge-product {
      background: rgba(103, 193, 217, 0.15);
      color: #4ba8c0;
    }

    &.badge-material {
      background: rgba(245, 158, 11, 0.12);
      color: #d97706;
    }
  }

  // 淇℃伅缃戞牸
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    background: var(--bg-primary);
    border-radius: 10px;
    padding: 12px;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .info-label {
      font-size: 0.6875rem;
      color: var(--text-tertiary);
    }

    .info-value {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-primary);

      &.highlight {
        color: var(--color-accent);
      }
    }
  }

  // 鍒嗗尯鍗＄墖
  .section-card {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 14px 16px;
    margin-bottom: 12px;
    border: 1px solid var(--glass-border);
    box-shadow: none;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 12px;

    .section-icon {
      font-size: 1.125rem;
    }

    .section-count {
      margin-left: auto;
      background: var(--color-accent-bg);
      color: var(--color-accent);
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 1px 8px;
      border-radius: 10px;
    }
  }

  // BOM 鍒楄〃
  .bom-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bom-item {
    padding: 10px 12px;
    background: var(--bg-primary);
    border-radius: 10px;

    .bom-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;

      .bom-name {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .bom-qty {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-accent);
      }
    }

    .bom-meta {
      display: flex;
      gap: 12px;
      font-size: 0.6875rem;
      color: var(--text-tertiary);

      .bom-batch {
        font-family: 'SF Mono', 'Menlo', monospace;
      }
    }
  }

  // 鏃堕棿绾?  .timeline {
    position: relative;
    padding-left: 20px;

    &::before {
      content: '';
      position: absolute;
      left: 6px;
      top: 8px;
      bottom: 8px;
      width: 2px;
      background: var(--glass-border);
      border-radius: 1px;
    }
  }

  .timeline-item {
    position: relative;
    padding-bottom: 16px;

    &:last-child {
      padding-bottom: 0;
    }
  }

  .timeline-dot {
    position: absolute;
    left: -16px;
    top: 4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--bg-secondary);
    z-index: 1;

    &.step-in {
      background: var(--color-success);
    }

    &.step-out {
      background: var(--color-error);
    }

    &.step-neutral {
      background: var(--color-info);
    }
  }

  .timeline-content {
    background: var(--bg-primary);
    border-radius: 10px;
    padding: 10px 12px;
  }

  .step-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .step-type-badge {
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 0.6875rem;
    font-weight: 600;

    &.step-in {
      background: var(--color-success-bg);
      color: var(--color-success);
    }

    &.step-out {
      background: var(--color-error-bg);
      color: var(--color-error);
    }

    &.step-neutral {
      background: var(--color-info-bg);
      color: var(--color-info);
    }
  }

  .step-time {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }

  .step-body {
    .step-ref {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 2px;
    }

    .step-remark,
    .step-qty,
    .step-product {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
  }

  // 娴佹按璁板綍
  .transaction-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tx-item {
    padding: 8px 12px;
    background: var(--bg-primary);
    border-radius: 8px;

    .tx-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;

      .tx-type {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 4px;

        &.tx-in {
          background: var(--color-success-bg);
          color: var(--color-success);
        }

        &.tx-out {
          background: var(--color-error-bg);
          color: var(--color-error);
        }
      }

      .tx-qty {
        font-size: 0.875rem;
        font-weight: 700;
        font-family: 'SF Mono', 'Menlo', monospace;

        &.qty-positive {
          color: var(--color-success);
        }
        &.qty-negative {
          color: var(--color-error);
        }
      }
    }

    .tx-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 0.6875rem;
      color: var(--text-tertiary);
    }
  }

  // 绌洪摼璺?  .empty-chain {
    padding: 40px 0;
  }
</style>
