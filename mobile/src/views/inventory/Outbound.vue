<!--
/**
 * Outbound.vue - 库存出库列表
 * @description 移动端出库管理页面
 * @date 2026-04-24
 * @version 2.1.0
 */
-->
<template>
  <div class="page-container">
    <NavBar
      title="库存出库"
      left-arrow
      @click-left="onClickLeft"
    >
      <template #right>
        <span v-permission="'inventory:outbound:create'" @click="createOutbound">
          <SvgIcon name="plus" size="1.125rem" />
        </span>
      </template>
    </NavBar>
    
    <div class="content-container">
      <!-- 搜索栏 -->
      <div class="search-section">
        <Search
          v-model="searchValue"
          placeholder="搜索出库单号或物料名称"
          @search="onSearch"
          shape="round"
        />
      </div>

      <!-- 横向滑动筛选标签 -->
      <div class="filter-scroll-wrapper">
        <div class="filter-scroll">
          <div
            v-for="(tab, index) in statusTabs"
            :key="index"
            class="filter-chip"
            :class="{ active: activeTab === index }"
            @click="switchTab(index)"
          >
            <span class="chip-text">{{ tab.label }}</span>
          </div>
        </div>
      </div>
      
      <!-- 出库单列表 -->
      <PullRefresh v-model="refreshing" @refresh="onRefresh">
        <List
          v-model:loading="loading"
          :finished="finished"
          finished-text="没有更多数据了"
          @load="onLoad"
        >
          <div v-if="outboundList.length === 0 && !loading" class="empty-state">
            <Empty description="暂无出库记录" />
          </div>
          
          <div 
            v-for="(outbound, idx) in outboundList" 
            :key="outbound.id" 
            class="list-card"
            :style="{ animationDelay: `${idx * 0.03}s` }"
            @click="viewOutboundDetail(outbound.id)"
          >
            <!-- 左侧色条 -->
            <div class="card-accent" :class="getAccentClass(outbound.status)"></div>

            <!-- 卡片主体 -->
            <div class="card-body">
              <!-- 第一行: 出库单号 + 状态 -->
              <div class="card-top">
                <div class="title-area">
                  <div class="item-icon" :class="getAccentClass(outbound.status)">
                    <SvgIcon name="export" size="0.875rem" />
                  </div>
                  <span class="item-title">{{ outbound.outbound_no }}</span>
                </div>
                <span class="status-tag" :class="'st-' + outbound.status">
                  {{ getOutboundStatusText(outbound.status) }}
                </span>
              </div>

              <!-- 第二行: 出库类型 -->
              <div class="item-subtitle">
                {{ getOutboundTypeText(outbound.outbound_type) }}
                <template v-if="outbound.product_specs"> · {{ outbound.product_specs }}</template>
              </div>

              <!-- 详情网格 -->
              <div class="detail-grid">
                <div class="detail-item">
                  <span class="detail-label">出库日期</span>
                  <span class="detail-value">{{ formatDate(outbound.outbound_date, 'YYYY-MM-DD') }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">物料数</span>
                  <span class="detail-value">{{ outbound.items_count || 0 }} 项</span>
                </div>
                <div class="detail-item" v-if="outbound.total_quantity">
                  <span class="detail-label">总数量</span>
                  <span class="detail-value">{{ outbound.total_quantity }}</span>
                </div>
                <div class="detail-item" v-if="outbound.operator_name">
                  <span class="detail-label">操作员</span>
                  <span class="detail-value">{{ outbound.operator_name }}</span>
                </div>
              </div>
            </div>
          </div>
        </List>
      </PullRefresh>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { NavBar, Search, Empty, PullRefresh, List, showToast, showConfirmDialog } from 'vant';
import SvgIcon from '@/components/icons/index.vue';
import { inventoryApi } from '@/services/api';
import { formatDate } from '@/utils/format';
import { getOutboundStatusText, getOutboundStatusColor, getOutboundTypeText } from '@/constants/statusConstants';

const router = useRouter();
const searchValue = ref('');
const refreshing = ref(false);
const loading = ref(false);
const finished = ref(false);
const outboundList = ref([]);
const activeTab = ref(0);

// 状态标签
const statusTabs = [
  { label: '全部', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '已确认', value: 'confirmed' },
  { label: '已完成', value: 'completed' },
  { label: '已取消', value: 'cancelled' }
];

// 分页参数
const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0
});

// 色条/图标颜色映射
const getAccentClass = (status) => {
  const map = {
    draft: 'accent-gray',
    confirmed: 'accent-blue',
    completed: 'accent-green',
    cancelled: 'accent-red'
  };
  return map[status] || 'accent-blue';
};

// 返回上一页
const onClickLeft = () => {
  router.back();
};

// 创建出库单
const createOutbound = () => {
  router.push('/inventory/outbound/create');
};

// 搜索
const onSearch = (val) => {
  searchValue.value = val;
  resetList();
  loadOutboundList();
};

// 切换标签
const switchTab = (index) => {
  activeTab.value = index;
  resetList();
  loadOutboundList();
};

// 下拉刷新
const onRefresh = () => {
  resetList();
  loadOutboundList().finally(() => {
    refreshing.value = false;
    showToast('刷新成功');
  });
};

// 重置列表
const resetList = () => {
  outboundList.value = [];
  pagination.page = 1;
  finished.value = false;
};

// 加载更多
const onLoad = () => {
  loadOutboundList();
};

// 加载出库单列表
const loadOutboundList = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      limit: pagination.limit,
      search: searchValue.value || undefined,
      status: statusTabs[activeTab.value].value || undefined
    };
    
    const response = await inventoryApi.getOutboundList(params);
    
    // 后端 ResponseHandler.paginated 返回 { data: { list, total } }
    // 经 axios 响应拦截器解包后，response.data = { list, total }
    const resData = response.data || response || {};
    const list = resData.list || resData.items || [];
    if (list.length > 0) {
      outboundList.value = [...outboundList.value, ...list];
      pagination.total = resData.total || 0;
      finished.value = outboundList.value.length >= pagination.total;
    } else {
      finished.value = true;
    }
    
    pagination.page++;
  } catch (error) {
    console.error('获取出库单列表失败:', error);
    showToast('获取出库单列表失败');
    finished.value = true;
  } finally {
    loading.value = false;
  }
};

// 获取出库单状态类型（使用统一常量）
const getOutboundStatusType = (status) => {
  return getOutboundStatusColor(status);
};

// 查看出库单详情
const viewOutboundDetail = (id) => {
  router.push(`/inventory/outbound/${id}`);
};

// 确认出库
const confirmOutbound = async (outbound) => {
  try {
    await showConfirmDialog({
      title: '确认出库',
      message: `确定要确认出库单 ${outbound.outbound_no} 吗？`
    });
    
    await inventoryApi.updateOutboundStatus(outbound.id, 'confirmed');
    showToast('出库单已确认');
    outbound.status = 'confirmed';
  } catch (error) {
    if (error !== 'cancel') {
      console.error('确认出库失败:', error);
      showToast('确认出库失败');
    }
  }
};

// 完成出库
const completeOutbound = async (outbound) => {
  try {
    await showConfirmDialog({
      title: '完成出库',
      message: `确定要完成出库单 ${outbound.outbound_no} 吗？`
    });
    
    await inventoryApi.updateOutboundStatus(outbound.id, 'completed');
    showToast('出库单已完成');
    outbound.status = 'completed';
  } catch (error) {
    if (error !== 'cancel') {
      console.error('完成出库失败:', error);
      showToast('完成出库失败');
    }
  }
};

onMounted(() => {
  loadOutboundList();
});
</script>

<style lang="scss" scoped>
.page-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg-primary);
  padding-bottom: 80px;
}
.content-container {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 12px;
}
.search-section { padding: 4px 0; }
.filter-scroll-wrapper { padding: 4px 0 8px; overflow: hidden; }
.filter-scroll {
  display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 6px;
  -webkit-overflow-scrolling: touch; scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}
.filter-chip {
  display: flex; align-items: center; gap: 4px; padding: 6px 14px;
  border-radius: 20px; background: var(--bg-secondary); border: 1.5px solid var(--glass-border);
  white-space: nowrap; flex-shrink: 0; font-size: 0.8125rem;
  color: var(--text-secondary); transition: all 0.25s ease; cursor: pointer;
  .chip-text { font-weight: 500; }
  &.active {
    background: var(--color-accent-bg, rgba(59,130,246,0.1));
    border-color: var(--color-accent, var(--color-primary)); color: var(--color-accent, var(--color-primary));
  }
}

// ========== 统一卡片风格（与 UniversalListPage 一致） ==========
.list-card {
  display: flex;
  background: var(--bg-secondary);
  border-radius: 10px;
  margin-bottom: 8px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  transition: all 0.2s;
  animation: fadeInUp 0.35s ease-out both;
  cursor: pointer;
  &:active {
    transform: scale(0.98);
  }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

// 左侧色条
.card-accent {
  width: 3px;
  flex-shrink: 0;
  &.accent-blue { background: linear-gradient(180deg, #3b82f6, #60a5fa); }
  &.accent-green { background: linear-gradient(180deg, #10b981, #34d399); }
  &.accent-yellow { background: linear-gradient(180deg, #f59e0b, #fbbf24); }
  &.accent-red { background: linear-gradient(180deg, #ef4444, #f87171); }
  &.accent-gray { background: linear-gradient(180deg, #94a3b8, #cbd5e1); }
}

.card-body {
  flex: 1;
  padding: 10px 12px;
  min-width: 0;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}
.title-area {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.item-icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  &.accent-blue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  &.accent-green { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  &.accent-yellow { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
  &.accent-red { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  &.accent-gray { background: rgba(148, 163, 184, 0.1); color: #94a3b8; }
}
.item-title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// 状态标签
.status-tag {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 0.625rem;
  font-weight: 700;
  flex-shrink: 0;
  &.st-draft { background: rgba(148, 163, 184, 0.12); color: #94a3b8; }
  &.st-confirmed { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  &.st-completed { background: rgba(16, 185, 129, 0.12); color: #10b981; }
  &.st-cancelled { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
}

.item-subtitle {
  font-size: 0.6875rem;
  color: var(--text-tertiary);
  margin-bottom: 4px;
  font-family: 'SF Mono', monospace;
}

// 详情网格
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  margin-top: 6px;
}
.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.detail-label {
  font-size: 0.6875rem;
  color: var(--text-tertiary);
}
.detail-value {
  font-size: 0.6875rem;
  color: var(--text-secondary);
  font-weight: 500;
}
</style>
