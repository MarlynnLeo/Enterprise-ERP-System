<!--
/**
 * Stock.vue
 * @description 库存查询页面 — 暗色主题统一风格
 * @date 2026-04-15
 * @version 2.0.0
 */
-->
<template>
  <div class="stock-page">
    <NavBar title="库存查询" left-arrow @click-left="router.back()" />

    <div class="content-wrapper">
      <!-- 搜索栏 -->
      <div class="search-section">
        <Search
          v-model="searchValue"
          placeholder="输入物料名称或编码搜索"
          @search="onSearch"
          @clear="onSearch"
        />
      </div>

      <!-- 筛选标签 -->
      <div class="filter-scroll-wrapper">
        <div class="filter-scroll">
          <div
            class="filter-chip"
            :class="{ active: stockStatus === '' }"
            @click="filterByStatus('')"
          >
            <SvgIcon name="apps" size="0.875rem" />
            <span class="chip-text">全部</span>
          </div>
          <div
            class="filter-chip"
            :class="{ active: stockStatus === 'inStock' }"
            @click="filterByStatus('inStock')"
          >
            <SvgIcon name="badge-check" size="0.875rem" />
            <span class="chip-text">有库存</span>
          </div>
          <div
            class="filter-chip"
            :class="{ active: stockStatus === 'outOfStock' }"
            @click="filterByStatus('outOfStock')"
          >
            <SvgIcon name="shield" size="0.875rem" />
            <span class="chip-text">缺货</span>
          </div>

          <!-- 仓库筛选 -->
          <div class="filter-chip warehouse-chip" @click="showWarehousePicker = true">
            <Icon name="location-o" size="14" />
            <span class="chip-text">{{ selectedWarehouse || '全部仓库' }}</span>
            <Icon name="arrow-down" size="10" />
          </div>
        </div>
      </div>

      <!-- 库存列表 -->
      <div class="list-area">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <Empty
            v-if="stockList.length === 0 && !loading && !refreshing"
            description="暂无库存数据"
          />
          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <div
              v-for="(item, index) in stockList"
              :key="item.id || index"
              class="stock-card"
              :style="{ animationDelay: `${index * 0.03}s` }"
              @click="viewStockDetail(item)"
            >
              <div
                class="card-accent"
                :class="item.quantity > 0 ? 'accent-green' : 'accent-red'"
              ></div>
              <div class="card-body">
                <div class="card-top">
                  <div class="title-area">
                    <span class="item-name">{{ item.material_name }}</span>
                    <span class="item-code">{{ item.material_code }}</span>
                  </div>
                  <span class="qty-badge" :class="item.quantity > 0 ? 'badge-green' : 'badge-red'">
                    {{ item.quantity }} {{ item.unit_name || '' }}
                  </span>
                </div>
                <div class="card-meta">
                  <span class="meta-item" v-if="item.spec">规格: {{ item.spec }}</span>
                  <span class="meta-item" v-if="item.location_name">{{ item.location_name }}</span>
                  <span class="meta-item" v-if="item.category_name">{{ item.category_name }}</span>
                </div>
              </div>
            </div>
          </List>
        </PullRefresh>
      </div>
    </div>

    <!-- 仓库选择弹出层 -->
    <Popup v-model:show="showWarehousePicker" position="bottom" round>
      <Picker
        :columns="warehouseColumns"
        @confirm="onWarehouseChange"
        @cancel="showWarehousePicker = false"
        title="选择仓库/库位"
      />
    </Popup>

    <!-- 详情弹出层 -->
    <Popup v-model:show="showDetail" position="bottom" round :style="{ height: '65%' }">
      <div class="detail-popup" v-if="currentStock">
        <div class="popup-header">
          <span class="popup-title">物料详情</span>
          <Icon name="cross" size="18" @click="showDetail = false" />
        </div>
        <div class="popup-content">
          <div class="popup-row">
            <span class="popup-label">物料编码</span>
            <span class="popup-value mono">{{ currentStock.material_code }}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">物料名称</span>
            <span class="popup-value">{{ currentStock.material_name }}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">规格型号</span>
            <span class="popup-value">{{ currentStock.spec || '—' }}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">库存数量</span>
            <span
              class="popup-value"
              :class="currentStock.quantity > 0 ? 'text-success' : 'text-danger'"
            >
              {{ currentStock.quantity }} {{ currentStock.unit_name }}
            </span>
          </div>
          <div class="popup-row">
            <span class="popup-label">仓库/库位</span>
            <span class="popup-value">{{ currentStock.location_name || '—' }}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">类别</span>
            <span class="popup-value">{{ currentStock.category_name || '—' }}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">单价</span>
            <span class="popup-value">{{
              currentStock.unit_price ? `¥${currentStock.unit_price}` : '—'
            }}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">库存金额</span>
            <span class="popup-value highlight">{{ calculateAmount(currentStock) }}</span>
          </div>
          <div class="popup-row" v-if="currentStock.last_in_date">
            <span class="popup-label">最近入库</span>
            <span class="popup-value">{{ currentStock.last_in_date }}</span>
          </div>
          <div class="popup-row" v-if="currentStock.last_out_date">
            <span class="popup-label">最近出库</span>
            <span class="popup-value">{{ currentStock.last_out_date }}</span>
          </div>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { NavBar, Search, Icon, Empty, PullRefresh, List, Popup, Picker, showToast } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { inventoryApi } from '@/services/api'

  const router = useRouter()
  const searchValue = ref('')
  const refreshing = ref(false)
  const loading = ref(false)
  const finished = ref(false)
  const stockList = ref([])
  const stockStatus = ref('')
  const showDetail = ref(false)
  const currentStock = ref(null)
  const selectedWarehouse = ref('')
  const selectedWarehouseId = ref('')
  const showWarehousePicker = ref(false)
  const warehouseColumns = ref([{ text: '全部仓库', value: '' }])

  const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

  const onSearch = () => {
    resetAndLoad()
  }
  const filterByStatus = (s) => {
    stockStatus.value = s
    resetAndLoad()
  }
  const onRefresh = () => {
    refreshing.value = true
    resetAndLoad()
  }
  const onLoad = () => loadStockList()
  const resetAndLoad = () => {
    stockList.value = []
    pagination.page = 1
    finished.value = false
    loadStockList()
  }
  const viewStockDetail = (item) => {
    currentStock.value = item
    showDetail.value = true
  }
  const calculateAmount = (s) =>
    s.quantity && s.unit_price ? `¥${(s.quantity * s.unit_price).toFixed(2)}` : '—'

  const onWarehouseChange = ({ selectedValues }) => {
    showWarehousePicker.value = false
    if (selectedValues?.[0] !== undefined) {
      const val = selectedValues[0]
      if (!val) {
        selectedWarehouse.value = ''
        selectedWarehouseId.value = ''
      } else {
        const col = warehouseColumns.value.find((c) => c.value === val)
        selectedWarehouse.value = col?.text || ''
        selectedWarehouseId.value = val
      }
      resetAndLoad()
    }
  }

  const loadStockList = async () => {
    loading.value = true
    try {
      const params = {
        page: pagination.page,
        limit: pagination.pageSize,
        search: searchValue.value || undefined,
        location_id: selectedWarehouseId.value || undefined
      }
      if (stockStatus.value === 'inStock') params.in_stock = true
      else if (stockStatus.value === 'outOfStock') params.in_stock = false

      const response = await inventoryApi.getInventoryStock(params)
      const rd = response.data?.data || response.data || response
      const items = rd.list || rd.items || rd.rows || []

      if (pagination.page === 1) stockList.value = items
      else stockList.value.push(...items)

      pagination.total = rd.total || stockList.value.length
      finished.value = stockList.value.length >= pagination.total || items.length === 0
      pagination.page++
    } catch (e) {
      console.error('获取库存列表失败:', e)
      showToast('获取库存列表失败')
      finished.value = true
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  const getWarehouses = async () => {
    try {
      const res = await inventoryApi.getLocations()
      const rd = res.data?.data || res.data || res
      const items = rd.list || rd.items || rd.rows || (Array.isArray(rd) ? rd : [])
      warehouseColumns.value = [
        { text: '全部仓库', value: '' },
        ...items.map((i) => ({ text: i.name, value: String(i.id) }))
      ]
    } catch (e) {
      console.error('获取仓库列表失败:', e)
    }
  }

  onMounted(() => {
    getWarehouses()
  })
</script>

<style lang="scss" scoped>
  .stock-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 80px;
  }
  .content-wrapper {
    padding: 0 12px 12px;
  }
  .search-section {
    padding: 4px 0;
  }

  .filter-scroll-wrapper {
    padding: 4px 0 8px;
    overflow: hidden;
  }
  .filter-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 2px 0 6px;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }
  .filter-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: 20px;
    background: var(--bg-secondary);
    border: 1.5px solid var(--glass-border);
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    transition: all 0.25s;
    cursor: pointer;
    .chip-text {
      font-weight: 500;
    }
    &.active {
      background: rgba(59, 130, 246, 0.1);
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    &.warehouse-chip {
      gap: 3px;
    }
  }

  .list-area {
    padding-top: 4px;
  }
  .stock-card {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 12px;
    margin-bottom: 10px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    animation: fadeInUp 0.35s ease-out both;
    &:active {
      transform: scale(0.98);
    }
  }
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .card-accent {
    width: 4px;
    flex-shrink: 0;
    &.accent-green {
      background: linear-gradient(180deg, var(--color-success), #34d399);
    }
    &.accent-red {
      background: linear-gradient(180deg, var(--color-danger), var(--color-danger));
    }
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
  .title-area {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }
  .item-name {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item-code {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    flex-shrink: 0;
  }
  .qty-badge {
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 700;
    flex-shrink: 0;
    font-family: 'SF Mono', 'Menlo', monospace;
    &.badge-green {
      background: rgba(16, 185, 129, 0.12);
      color: var(--color-success);
    }
    &.badge-red {
      background: rgba(239, 68, 68, 0.12);
      color: var(--color-danger);
    }
  }
  .card-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .meta-item {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }

  // ========== 详情弹出层 ==========
  .detail-popup {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
  }
  .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--glass-border);
  }
  .popup-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .popup-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }
  .popup-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 10px 16px;
    &:not(:last-child) {
      border-bottom: 1px solid var(--glass-border);
    }
  }
  .popup-label {
    font-size: 0.8125rem;
    color: var(--text-tertiary);
    min-width: 70px;
    flex-shrink: 0;
  }
  .popup-value {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    text-align: right;
    flex: 1;
    &.mono {
      font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    }
    &.highlight {
      color: var(--color-primary);
      font-weight: 700;
    }
    &.text-success {
      color: var(--color-success);
      font-weight: 700;
    }
    &.text-danger {
      color: var(--color-danger);
      font-weight: 700;
    }
  }
</style>
