<!--
/**
 * GlobalSearch.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="global-search-page">
    <NavBar title="全局搜索" left-arrow @click-left="$router.go(-1)" />
    
    <div class="search-container">
      <!-- 搜索框 -->
      <div class="search-header">
        <Search 
          v-model="searchKeyword" 
          placeholder="搜索物料、客户、订单、任务..."
          show-action
          @search="handleSearch"
          @clear="handleClear"
          @focus="handleFocus"
        >
          <template #action>
            <div @click="handleSearch" class="search-action">搜索</div>
          </template>
        </Search>
      </div>

      <!-- 搜索历史 -->
      <div class="search-history" v-if="!searchKeyword && searchHistory.length > 0">
        <div class="section-header">
          <span class="section-title">搜索历史</span>
          <Button size="mini" type="default" @click="clearHistory">清空</Button>
        </div>
        <div class="history-tags">
          <Tag 
            v-for="(item, index) in searchHistory" 
            :key="index"
            size="medium"
            @click="selectHistory(item)"
          >
            {{ item }}
          </Tag>
        </div>
      </div>

      <!-- 热门搜索 -->
      <div class="hot-search" v-if="!searchKeyword">
        <div class="section-title">热门搜索</div>
        <div class="hot-tags">
          <Tag 
            v-for="(item, index) in hotSearches" 
            :key="index"
            size="medium"
            type="primary"
            @click="selectHotSearch(item)"
          >
            {{ item }}
          </Tag>
        </div>
      </div>

      <!-- 搜索结果 -->
      <div class="search-results" v-if="searchKeyword && hasSearched">
        <!-- 结果统计 -->
        <div class="result-stats" v-if="totalResults > 0">
          找到 <span class="stats-number">{{ totalResults }}</span> 条相关结果
        </div>

        <!-- 结果分类标签 -->
        <div class="result-tabs" v-if="totalResults > 0">
          <div 
            v-for="category in resultCategories" 
            :key="category.key"
            class="result-tab"
            :class="{ active: activeCategory === category.key }"
            @click="selectCategory(category.key)"
          >
            {{ category.label }}
            <span class="tab-count" v-if="category.count > 0">({{ category.count }})</span>
          </div>
        </div>

        <!-- 搜索结果列表 -->
        <div class="result-list" v-if="currentResults.length > 0">
          <PullRefresh v-model="refreshing" @refresh="onRefresh">
            <List
              v-model:loading="loading"
              :finished="finished"
              finished-text="没有更多了"
              @load="onLoad"
            >
              <div 
                v-for="(item, index) in currentResults" 
                :key="index"
                class="result-item"
                @click="viewDetail(item)"
              >
                <div class="item-header">
                  <div class="item-type">
                    <Icon :name="getTypeIcon(item.type)" size="16" :color="getTypeColor(item.type)" />
                    <span>{{ getTypeLabel(item.type) }}</span>
                  </div>
                  <div class="item-status" v-if="item.status">
                    <div class="status-badge" :class="getStatusClass(item.status)">
                      {{ getStatusLabel(item.status) }}
                    </div>
                  </div>
                </div>
                
                <div class="item-content">
                  <div class="item-title" v-html="highlightKeyword(item.title)"></div>
                  <div class="item-subtitle" v-if="item.subtitle" v-html="highlightKeyword(item.subtitle)"></div>
                  <div class="item-description" v-if="item.description" v-html="highlightKeyword(item.description)"></div>
                </div>

                <div class="item-meta" v-if="item.meta">
                  <div class="meta-item" v-for="(meta, key) in item.meta" :key="key">
                    <span class="meta-label">{{ key }}:</span>
                    <span class="meta-value">{{ meta }}</span>
                  </div>
                </div>
              </div>
            </List>
          </PullRefresh>
        </div>

        <!-- 无结果提示 -->
        <div class="no-results" v-if="hasSearched && totalResults === 0">
          <Empty description="未找到相关结果">
            <div class="empty-actions">
              <Button type="primary" size="small" @click="handleClear">
                重新搜索
              </Button>
            </div>
          </Empty>
        </div>
      </div>

      <!-- 搜索建议 -->
      <div class="search-suggestions" v-if="searchKeyword && !hasSearched && suggestions.length > 0">
        <div class="section-title">搜索建议</div>
        <div class="suggestion-list">
          <div 
            v-for="(suggestion, index) in suggestions" 
            :key="index"
            class="suggestion-item"
            @click="selectSuggestion(suggestion)"
          >
            <Icon name="search" size="14" color="var(--text-disabled)" />
            <span v-html="highlightKeyword(suggestion)"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { 
  NavBar, Search, Button, Tag, Icon, PullRefresh, List, Empty,
  showToast, showConfirmDialog 
} from 'vant';
import { baseDataApi, salesApi, inventoryApi, productionApi } from '@/services/api';

const router = useRouter();

// 响应式数据
const searchKeyword = ref('');
const searchHistory = ref([]);
const hasSearched = ref(false);
const loading = ref(false);
const finished = ref(false);
const refreshing = ref(false);
const activeCategory = ref('all');
const suggestions = ref([]);

// 搜索结果
const searchResults = reactive({
  materials: [],
  customers: [],
  suppliers: [],
  orders: [],
  tasks: [],
  locations: [],
  boms: []
});

// 热门搜索
const hotSearches = ref([
  '304不锈钢', '客户A', '销售订单', '生产任务', 
  '库位A-01', 'BOM清单', '采购订单', '物料清单'
]);

// 结果分类
const resultCategories = ref([
  { key: 'all', label: '全部', count: 0 },
  { key: 'materials', label: '物料', count: 0 },
  { key: 'customers', label: '客户', count: 0 },
  { key: 'suppliers', label: '供应商', count: 0 },
  { key: 'orders', label: '订单', count: 0 },
  { key: 'tasks', label: '任务', count: 0 },
  { key: 'locations', label: '库位', count: 0 },
  { key: 'boms', label: 'BOM', count: 0 }
]);

// 计算属性
const totalResults = computed(() => {
  return Object.values(searchResults).reduce((total, results) => total + results.length, 0);
});

const currentResults = computed(() => {
  if (activeCategory.value === 'all') {
    return Object.values(searchResults).flat();
  }
  return searchResults[activeCategory.value] || [];
});

// 获取类型图标
const getTypeIcon = (type) => {
  const iconMap = {
    'material': 'goods-collect-o',
    'customer': 'friends-o',
    'supplier': 'shop-o',
    'order': 'notes-o',
    'task': 'todo-list-o',
    'location': 'location-o',
    'bom': 'cluster-o'
  };
  return iconMap[type] || 'records';
};

// 获取类型颜色
const getTypeColor = (type) => {
  const colorMap = {
    'material': '#5E7BF6',
    'customer': '#2CCFB0',
    'supplier': 'var(--color-warning)',
    'order': '#FF6B6B',
    'task': '#A48BE0',
    'location': '#FFC759',
    'bom': '#FF8A80'
  };
  return colorMap[type] || 'var(--text-disabled)';
};

// 获取类型标签
const getTypeLabel = (type) => {
  const labelMap = {
    'material': '物料',
    'customer': '客户',
    'supplier': '供应商',
    'order': '订单',
    'task': '任务',
    'location': '库位',
    'bom': 'BOM'
  };
  return labelMap[type] || type;
};

// 获取状态样式
const getStatusClass = (status) => {
  const classMap = {
    'active': 'active',
    'inactive': 'inactive',
    'pending': 'pending',
    'completed': 'completed',
    'cancelled': 'cancelled'
  };
  return classMap[status] || 'default';
};

// 获取状态标签
const getStatusLabel = (status) => {
  const labelMap = {
    'active': '启用',
    'inactive': '停用',
    'pending': '待处理',
    'completed': '已完成',
    'cancelled': '已取消'
  };
  return labelMap[status] || status;
};

// HTML 转义，防止 XSS
const escapeHtml = (str) => {
  if (!str) return str;
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// 转义正则特殊字符
const escapeRegExp = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// 高亮关键词（已做 XSS 防护）
const highlightKeyword = (text) => {
  if (!searchKeyword.value || !text) return escapeHtml(text);
  const safeText = escapeHtml(String(text));
  const safeKeyword = escapeHtml(searchKeyword.value);
  const regex = new RegExp(`(${escapeRegExp(safeKeyword)})`, 'gi');
  return safeText.replace(regex, '<span class="highlight">$1</span>');
};

// 执行搜索（并行调用多个后端 API，聚合结果）
const performSearch = async (keyword) => {
  if (!keyword.trim()) return;

  hasSearched.value = true;
  loading.value = true;

  // 先清空旧结果
  Object.keys(searchResults).forEach(key => { searchResults[key] = []; });

  const searchParam = { keyword, page: 1, pageSize: 10 };

  try {
    // 并行发起多个搜索请求，任一失败不影响其他
    const [matRes, custRes, suppRes, orderRes, taskRes, locRes] = await Promise.allSettled([
      baseDataApi.getMaterials(searchParam),
      salesApi.getCustomers(searchParam),
      baseDataApi.getSuppliersList(searchParam),
      salesApi.getSalesOrders(searchParam),
      productionApi.getTasks(searchParam),
      inventoryApi.getLocations(searchParam)
    ]);

    // 解析结果并统一转换格式
    const extract = (res) => {
      if (res.status !== 'fulfilled') return [];
      const d = res.value?.data;
      return d?.list || d?.rows || (Array.isArray(d) ? d : []);
    };

    searchResults.materials = extract(matRes).map(m => ({
      type: 'material', id: m.id,
      title: m.name, subtitle: m.code,
      description: m.specs || m.specification || '',
      status: m.status || 'active'
    }));

    searchResults.customers = extract(custRes).map(c => ({
      type: 'customer', id: c.id,
      title: c.name, subtitle: c.code,
      description: c.contact_person || '',
      status: c.status || 'active'
    }));

    searchResults.suppliers = extract(suppRes).map(s => ({
      type: 'supplier', id: s.id,
      title: s.name, subtitle: s.code,
      description: s.contact_person || '',
      status: s.status || 'active'
    }));

    searchResults.orders = extract(orderRes).map(o => ({
      type: 'order', id: o.id,
      title: `${o.order_no}`,
      subtitle: o.customer_name || '',
      description: o.remarks || '',
      status: o.status || 'pending'
    }));

    searchResults.tasks = extract(taskRes).map(t => ({
      type: 'task', id: t.id,
      title: t.task_no || t.name,
      subtitle: t.product_name || '',
      description: t.remarks || '',
      status: t.status || 'pending'
    }));

    searchResults.locations = extract(locRes).map(l => ({
      type: 'location', id: l.id,
      title: l.name, subtitle: l.code,
      description: l.warehouse_name || '',
      status: l.status || 'active'
    }));

    // 更新分类计数
    resultCategories.value.forEach(category => {
      if (category.key === 'all') {
        category.count = totalResults.value;
      } else {
        category.count = searchResults[category.key]?.length || 0;
      }
    });

    // 添加到搜索历史
    addToHistory(keyword);

  } catch (error) {
    console.error('搜索失败:', error);
    showToast('搜索失败，请重试');
  } finally {
    loading.value = false;
    finished.value = true;
  }
};

// 事件处理
const handleSearch = () => {
  if (!searchKeyword.value.trim()) {
    showToast('请输入搜索关键词');
    return;
  }
  performSearch(searchKeyword.value);
};

const handleClear = () => {
  searchKeyword.value = '';
  hasSearched.value = false;
  activeCategory.value = 'all';
  Object.keys(searchResults).forEach(key => {
    searchResults[key] = [];
  });
};

const handleFocus = () => {
  // 获取搜索建议
  if (searchKeyword.value) {
    getSuggestions(searchKeyword.value);
  }
};

const selectHistory = (item) => {
  searchKeyword.value = item;
  performSearch(item);
};

const selectHotSearch = (item) => {
  searchKeyword.value = item;
  performSearch(item);
};

const selectSuggestion = (suggestion) => {
  searchKeyword.value = suggestion;
  performSearch(suggestion);
};

const selectCategory = (category) => {
  activeCategory.value = category;
};

const viewDetail = (item) => {
  // 根据类型跳转到详情页
  const routeMap = {
    'material': `/baseData/materials/${item.id || 'detail'}`,
    'customer': `/baseData/customers/${item.id || 'detail'}`,
    'supplier': `/baseData/suppliers/${item.id || 'detail'}`,
    'order': `/sales/orders/${item.id || 'detail'}`,
    'task': `/production/tasks/${item.id || 'detail'}`,
    'location': `/baseData/locations/${item.id || 'detail'}`,
    'bom': `/baseData/boms/${item.id || 'detail'}`
  };

  const route = routeMap[item.type];
  if (route) {
    router.push(route);
  } else {
    showToast('详情页面开发中');
  }
};

const onRefresh = () => {
  refreshing.value = true;
  performSearch(searchKeyword.value).finally(() => {
    refreshing.value = false;
  });
};

const onLoad = () => {
  // 加载更多结果
  loading.value = true;
  setTimeout(() => {
    loading.value = false;
    finished.value = true;
  }, 1000);
};

// 搜索建议（基于搜索历史 + 热门搜索关键词）
const getSuggestions = (keyword) => {
  const history = getSearchHistory();
  const combined = [...history, ...hotSearches.value];
  const unique = [...new Set(combined)];
  suggestions.value = unique.filter(item =>
    item.toLowerCase().includes(keyword.toLowerCase())
  ).slice(0, 5);
};

// 历史记录管理
const addToHistory = (keyword) => {
  const history = getSearchHistory();
  const filtered = history.filter(item => item !== keyword);
  filtered.unshift(keyword);
  const limited = filtered.slice(0, 10);
  
  localStorage.setItem('global_search_history', JSON.stringify(limited));
  searchHistory.value = limited;
};

const getSearchHistory = () => {
  try {
    const history = localStorage.getItem('global_search_history');
    return history ? JSON.parse(history) : [];
  } catch (error) {
    return [];
  }
};

const clearHistory = async () => {
  try {
    const result = await showConfirmDialog({
      title: '确认清空',
      message: '确定要清空搜索历史吗？'
    });
    
    if (result === 'confirm') {
      localStorage.removeItem('global_search_history');
      searchHistory.value = [];
      showToast('已清空搜索历史');
    }
  } catch (error) {
    // 用户取消
  }
};

// 监听搜索关键词变化
watch(searchKeyword, (newVal) => {
  if (newVal) {
    getSuggestions(newVal);
  } else {
    suggestions.value = [];
    hasSearched.value = false;
  }
});

// 初始化
onMounted(() => {
  searchHistory.value = getSearchHistory();
});
</script>

<style lang="scss" scoped>
.global-search-page {
  min-height: 100vh;
  background-color: var(--bg-primary);
}

.search-container {
  padding: 12px;
}

.search-header {
  margin-bottom: 16px;

  .search-action {
    color: var(--color-primary);
    font-size: 14px;
    padding: 0 8px;
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.search-history,
.hot-search {
  margin-bottom: 20px;

  .history-tags,
  .hot-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .van-tag {
      margin: 0;
    }
  }
}

.search-results {
  .result-stats {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 12px;

    .stats-number {
      color: var(--color-primary);
      font-weight: 600;
    }
  }

  .result-tabs {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 4px;
    margin-bottom: 12px;
    overflow-x: auto;

    .result-tab {
      flex-shrink: 0;
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-secondary);
      border-radius: 6px;
      transition: all 0.2s;
      white-space: nowrap;

      &.active {
        background-color: var(--color-primary);
        color: var(--text-primary);
      }

      .tab-count {
        margin-left: 4px;
      }
    }
  }

  .result-list {
    .result-item {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 8px;
      box-shadow: none;

      .item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;

        .item-type {
          display: flex;
          align-items: center;
          font-size: 12px;
          color: var(--text-secondary);

          span {
            margin-left: 4px;
          }
        }

        .status-badge {
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 10px;
          color: var(--text-primary);

          &.active { background-color: var(--module-green); }
          &.inactive { background-color: var(--text-disabled); }
          &.pending { background-color: var(--module-orange); }
          &.completed { background-color: var(--module-blue); }
          &.cancelled { background-color: var(--module-red); }
        }
      }

      .item-content {
        margin-bottom: 8px;

        .item-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .item-subtitle {
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .item-description {
          font-size: 12px;
          color: var(--text-secondary);
        }
      }

      .item-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;

        .meta-item {
          font-size: 12px;

          .meta-label {
            color: var(--text-secondary);
          }

          .meta-value {
            color: var(--text-primary);
            margin-left: 4px;
          }
        }
      }
    }
  }
}

.search-suggestions {
  .suggestion-list {
    background: var(--bg-secondary);
    border-radius: 8px;
    overflow: hidden;

    .suggestion-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--van-border-color);
      font-size: 14px;
      color: var(--text-primary);

      &:last-child {
        border-bottom: none;
      }

      span {
        margin-left: 8px;
      }
    }
  }
}

.no-results {
  padding: 60px 20px;

  .empty-actions {
    margin-top: 16px;
  }
}

:deep(.highlight) {
  background-color: var(--bg-secondary);
  color: var(--color-warning);
  padding: 0 2px;
  border-radius: 2px;
}
</style>
