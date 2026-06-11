<!--
/**
 * PriceExchangePanel.vue
 * @description 仪表盘实时金属价格与汇率面板组件
 */
-->
<template>
  <div class="chart-container">
    <div class="chart-header">
      <div class="tab-group">
        <div class="tab active">实时价格与汇率</div>
        <el-tooltip content="手动刷新数据" placement="top">
          <el-button
            link
            size="small"
            @click="$emit('refresh')"
            :loading="exchangeRateLoading || metalPricesLoading"
            class="price-refresh-button"
          >
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>
    <div class="chart-body">
      <div class="scrollable-content" @scroll="handleScroll" ref="scrollContainer">
        <!-- 金属价格卡片显示 -->
        <div class="section-title">金属实时价格</div>
        <div class="metal-price-cards">
          <div class="price-card" :class="`price-card-${key.toLowerCase()}`" v-for="(metal, key) in metalPriceCards" :key="key">
            <div class="price-card-header">
              <div class="metal-info">
                <span class="metal-icon" :class="`metal-icon-${key.toLowerCase()}`"></span>
                <span class="metal-name">{{ metal.name }}</span>
              </div>
              <span class="price-change" :class="getChangeClass(metal.changePercent)">
                {{ formatChange(metal.changePercent) }}%
              </span>
            </div>
            <div class="price-value">{{ formatPrice(metal.price) }}</div>
            <div class="price-unit">{{ metal.unit }}</div>
            <div class="price-trend">
              <div class="mini-chart" :ref="el => setMetalMiniChartRef(key, el)"></div>
            </div>
          </div>
        </div>
        <div class="section-divider"></div>
        <!-- 汇率卡片显示 -->
        <div class="section-title">实时汇率走势</div>
        <div class="exchange-rate-cards">
          <div class="rate-card" v-for="(rate, key) in exchangeRateCards" :key="key">
            <div class="rate-card-header">
              <span class="currency-pair">{{ rate.pair }}</span>
              <span class="rate-change" :class="getChangeClass(rate.change)">
                {{ formatChange(rate.change) }}
              </span>
            </div>
            <div class="rate-value">{{ rate.value || '--' }}</div>
            <div class="rate-trend">
              <div class="mini-chart" :ref="el => setMiniChartRef(key, el)"></div>
            </div>
          </div>
        </div>
        <!-- 主要汇率走势图 -->
        <div class="exchange-rate-chart">
          <div ref="exchangeRateChartRef" class="exchange-rate-chart-canvas"></div>
        </div>
        <div class="last-update" v-if="lastUpdate">
          最后更新: {{ formatTime(lastUpdate) }}
          <span v-if="dataSource" class="data-source">
            | 数据源: {{ dataSource }}
          </span>
        </div>
      </div>
      <!-- 滚动提示 -->
      <div class="scroll-indicator" v-show="showScrollIndicator" @click="scrollToBottom">
        <el-icon><ArrowDown /></el-icon>
        <span>向下滚动查看更多</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { Refresh, ArrowDown } from '@element-plus/icons-vue'

defineProps({
  metalPriceCards: {
    type: Object,
    default: () => ({})
  },
  exchangeRateCards: {
    type: Object,
    default: () => ({})
  },
  exchangeRateLoading: {
    type: Boolean,
    default: false
  },
  metalPricesLoading: {
    type: Boolean,
    default: false
  },
  lastUpdate: {
    type: [Date, String, null],
    default: null
  },
  dataSource: {
    type: String,
    default: ''
  },
  setMiniChartRef: {
    type: Function,
    required: true
  },
  setMetalMiniChartRef: {
    type: Function,
    required: true
  }
})

defineEmits(['refresh'])

// 用于汇率走势图的 ref，通过 defineExpose 暴露给父组件
const exchangeRateChartRef = ref(null)

// 滚动相关
const scrollContainer = ref(null)
const showScrollIndicator = ref(true)

// 格式化价格显示（添加千分位分隔符）
const formatPrice = (price) => {
  if (price === null || price === undefined || price === '' || price === '--') return '--'
  const value = Number(price)
  if (Number.isNaN(value)) return '--'
  return `¥${value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

// 格式化变化值
const formatChange = (change) => {
  if (!change || change === 0) return '0.0000'
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(4)}`
}

// 获取变化样式类
const getChangeClass = (change) => {
  if (!change || change === 0) return 'neutral'
  return change > 0 ? 'positive' : 'negative'
}

// 格式化时间
const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 检查是否需要滚动指示器
const checkScrollIndicator = () => {
  nextTick(() => {
    if (scrollContainer.value) {
      const container = scrollContainer.value
      showScrollIndicator.value = container.scrollHeight > container.clientHeight
    }
  })
}

// 滚动到底部
const scrollToBottom = () => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTo({
      top: scrollContainer.value.scrollHeight,
      behavior: 'smooth'
    })
  }
}

// 处理滚动事件
const handleScroll = (event) => {
  const container = event.target
  const scrollTop = container.scrollTop
  const scrollHeight = container.scrollHeight
  const clientHeight = container.clientHeight
  if (scrollHeight <= clientHeight) {
    showScrollIndicator.value = false
    return
  }
  const scrollProgress = scrollTop / (scrollHeight - clientHeight)
  if (scrollProgress >= 0.95) {
    showScrollIndicator.value = false
  } else if (scrollTop === 0) {
    showScrollIndicator.value = true
  }
}

defineExpose({
  exchangeRateChartRef,
  checkScrollIndicator
})
</script>
