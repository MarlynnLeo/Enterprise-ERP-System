<!--
  仪表盘：金属价格 / 汇率 统一面板（经典主题）
-->
<template>
  <div class="chart-container price-exchange-panel">
    <div class="chart-header">
      <div class="price-segmented-control" role="tablist" aria-label="实时价格与汇率">
        <button
          type="button"
          class="segmented-tab"
          role="tab"
          :aria-selected="activeTab === 'metal'"
          :class="{ active: activeTab === 'metal' }"
          @click="switchTab('metal')"
        >
          金属价格
        </button>
        <button
          type="button"
          class="segmented-tab"
          role="tab"
          :aria-selected="activeTab === 'exchange'"
          :class="{ active: activeTab === 'exchange' }"
          @click="switchTab('exchange')"
        >
          外汇汇率
        </button>
      </div>

      <button
        type="button"
        class="price-refresh-btn"
        :class="{ 'is-loading': exchangeRateLoading || metalPricesLoading }"
        title="手动刷新行情数据"
        aria-label="刷新金属与汇率数据"
        @click="$emit('refresh')"
      >
        <el-icon><Refresh /></el-icon>
      </button>
    </div>

    <div class="chart-body price-panel-body">
      <!-- 金属行情 -->
      <div v-show="activeTab === 'metal'" class="price-panel-pane" role="tabpanel">
        <div class="metal-price-cards">
          <div
            v-for="(metal, key) in metalPriceCards"
            :key="key"
            class="price-card"
            :class="`price-card-${String(key).toLowerCase()}`"
          >
            <div class="metal-info">
              <span class="metal-dot" :class="`metal-dot-${String(key).toLowerCase()}`" aria-hidden="true" />
              <span class="metal-name">{{ metal.name }}</span>
            </div>
            <div class="price-quote">
              <span class="price-value">{{ formatPrice(metal.price) }}</span>
              <span class="price-unit">{{ metal.unit }}</span>
            </div>
            <div class="price-trend">
              <div class="mini-chart" :ref="(el) => setMetalMiniChartRef(key, el)" />
            </div>
            <span class="price-change-badge" :class="getChangeClass(metal.changePercent)">
              {{ formatChange(metal.changePercent) }}%
            </span>
          </div>
        </div>
        <div v-if="metalLastUpdate" class="last-update">
          <span>更新于 {{ formatTime(metalLastUpdate) }}</span>
          <span v-if="metalDataSource" class="data-source-tag">{{ metalDataSource }}</span>
        </div>
      </div>

      <!-- 汇率行情 -->
      <div v-show="activeTab === 'exchange'" class="price-panel-pane" role="tabpanel">
        <div class="exchange-rate-cards">
          <div v-for="(rate, key) in exchangeRateCards" :key="key" class="rate-card">
            <span class="currency-pair">{{ rate.pair }}</span>
            <div class="rate-quote">
              <span class="rate-value">{{ rate.value || '--' }}</span>
              <span class="rate-unit">{{ rate.unit || '中间价' }}</span>
            </div>
            <div class="rate-trend">
              <div class="mini-chart" :ref="(el) => setMiniChartRef(key, el)" />
            </div>
            <span class="rate-change-badge" :class="getChangeClass(rate.change)">
              {{ formatChange(rate.change) }}
            </span>
          </div>
        </div>
        <div class="exchange-rate-chart">
          <div
            class="exchange-rate-chart-canvas"
            :ref="bindExchangeChartRef"
          />
        </div>
        <div v-if="exchangeLastUpdate" class="last-update">
          <span>更新于 {{ formatTime(exchangeLastUpdate) }}</span>
          <span v-if="dataSource" class="data-source-tag">{{ dataSource }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { Refresh } from '@element-plus/icons-vue'

const props = defineProps({
  metalPriceCards: { type: Object, default: () => ({}) },
  exchangeRateCards: { type: Object, default: () => ({}) },
  exchangeRateLoading: { type: Boolean, default: false },
  metalPricesLoading: { type: Boolean, default: false },
  metalLastUpdate: { type: [Date, String, null], default: null },
  exchangeLastUpdate: { type: [Date, String, null], default: null },
  dataSource: { type: String, default: '' },
  metalDataSource: { type: String, default: '' },
  setMiniChartRef: { type: Function, required: true },
  setMetalMiniChartRef: { type: Function, required: true },
  setExchangeRateChartRef: { type: Function, required: true }
})

const emit = defineEmits(['refresh', 'tab-change'])

const activeTab = ref('metal')

const bindExchangeChartRef = (el) => {
  props.setExchangeRateChartRef(el)
}

const switchTab = async (tab) => {
  activeTab.value = tab
  await nextTick()
  emit('tab-change', tab)
}

const formatPrice = (price) => {
  if (price === null || price === undefined || price === '' || price === '--') return '--'
  const num = Number(price)
  return Number.isNaN(num) ? price : num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatChange = (change) => {
  if (change === null || change === undefined || change === '' || change === '--') return '--'
  const num = Number(change)
  if (Number.isNaN(num)) return change
  return num > 0 ? `+${num.toFixed(2)}` : num.toFixed(2)
}

const getChangeClass = (change) => {
  if (change === null || change === undefined || change === '' || change === '--') return 'is-neutral'
  const num = Number(change)
  if (Number.isNaN(num) || num === 0) return 'is-neutral'
  return num > 0 ? 'is-up' : 'is-down'
}

const formatTime = (time) => {
  if (!time) return ''
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return String(time)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>
