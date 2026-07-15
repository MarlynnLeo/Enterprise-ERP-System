<!--
  仪表盘：金属价格 / 汇率 统一面板（唯一实现）
-->
<template>
  <div class="chart-container price-exchange-panel">
    <div class="chart-header">
      <div class="tab-group price-panel-tabs" role="tablist" aria-label="实时价格与汇率">
        <div
          class="tab"
          role="tab"
          :aria-selected="activeTab === 'metal'"
          :class="{ active: activeTab === 'metal' }"
          tabindex="0"
          @click="switchTab('metal')"
          @keydown.enter.prevent="switchTab('metal')"
        >
          金属价格
        </div>
        <div
          class="tab"
          role="tab"
          :aria-selected="activeTab === 'exchange'"
          :class="{ active: activeTab === 'exchange' }"
          tabindex="0"
          @click="switchTab('exchange')"
          @keydown.enter.prevent="switchTab('exchange')"
        >
          汇率
        </div>
        <el-tooltip content="手动刷新数据" placement="top">
          <el-button
            link
            size="small"
            class="price-refresh-button"
            :loading="exchangeRateLoading || metalPricesLoading"
            aria-label="刷新金属与汇率数据"
            @click="$emit('refresh')"
          >
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>
    <div class="chart-body price-panel-body">
      <div v-show="activeTab === 'metal'" class="price-panel-pane" role="tabpanel">
        <div class="metal-price-cards">
          <div
            v-for="(metal, key) in metalPriceCards"
            :key="key"
            class="price-card"
            :class="`price-card-${String(key).toLowerCase()}`"
          >
            <div class="price-card-header">
              <div class="metal-info">
                <span class="metal-icon" :class="`metal-icon-${String(key).toLowerCase()}`" aria-hidden="true" />
                <span class="metal-name">{{ metal.name }}</span>
              </div>
              <span class="price-change" :class="getChangeClass(metal.changePercent)">
                {{ formatChange(metal.changePercent) }}%
              </span>
            </div>
            <div class="price-value">{{ formatPrice(metal.price) }}</div>
            <div class="price-unit">{{ metal.unit }}</div>
            <div class="price-trend">
              <div class="mini-chart" :ref="(el) => setMetalMiniChartRef(key, el)" />
            </div>
          </div>
        </div>
        <div v-if="metalLastUpdate" class="last-update">
          最后更新: {{ formatTime(metalLastUpdate) }}
        </div>
      </div>

      <div v-show="activeTab === 'exchange'" class="price-panel-pane" role="tabpanel">
        <div class="exchange-rate-cards">
          <div v-for="(rate, key) in exchangeRateCards" :key="key" class="rate-card">
            <div class="rate-card-header">
              <span class="currency-pair">{{ rate.pair }}</span>
              <span class="rate-change" :class="getChangeClass(rate.change)">
                {{ formatChange(rate.change) }}
              </span>
            </div>
            <div class="rate-value">{{ rate.value || '--' }}</div>
            <div class="rate-unit">{{ rate.unit || '中间价' }}</div>
            <div class="rate-trend">
              <div class="mini-chart" :ref="(el) => setMiniChartRef(key, el)" />
            </div>
          </div>
        </div>
        <div class="exchange-rate-chart">
          <div
            class="exchange-rate-chart-canvas"
            :ref="bindExchangeChartRef"
          />
        </div>
        <div v-if="exchangeLastUpdate" class="last-update">
          最后更新: {{ formatTime(exchangeLastUpdate) }}
          <span v-if="dataSource" class="data-source">
            | 数据源: {{ dataSource }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue';
import { Refresh } from '@element-plus/icons-vue';

const props = defineProps({
  metalPriceCards: { type: Object, default: () => ({}) },
  exchangeRateCards: { type: Object, default: () => ({}) },
  exchangeRateLoading: { type: Boolean, default: false },
  metalPricesLoading: { type: Boolean, default: false },
  metalLastUpdate: { type: [Date, String, null], default: null },
  exchangeLastUpdate: { type: [Date, String, null], default: null },
  dataSource: { type: String, default: '' },
  setMiniChartRef: { type: Function, required: true },
  setMetalMiniChartRef: { type: Function, required: true },
  setExchangeRateChartRef: { type: Function, required: true },
});

const emit = defineEmits(['refresh', 'tab-change']);

const activeTab = ref('metal');

const bindExchangeChartRef = (el) => {
  props.setExchangeRateChartRef(el);
};

const switchTab = async (tab) => {
  activeTab.value = tab;
  await nextTick();
  emit('tab-change', tab);
};

const formatPrice = (price) => {
  if (price === null || price === undefined || price === '' || price === '--') return '--';
  const value = Number(price);
  if (Number.isNaN(value)) return '--';
  return `¥${value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatChange = (change) => {
  if (!change || change === 0) return '0.0000';
  const sign = change > 0 ? '+' : '';
  return `${sign}${Number(change).toFixed(4)}`;
};

const getChangeClass = (change) => {
  if (!change || change === 0) return 'neutral';
  return change > 0 ? 'positive' : 'negative';
};

const formatTime = (date) =>
  new Date(date).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

defineExpose({ activeTab, switchTab });
</script>
