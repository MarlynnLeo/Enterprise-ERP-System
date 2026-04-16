<!--
/**
 * Inbound.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="page-container">
    <NavBar
      title="库存入库"
      left-arrow
      @click-left="onClickLeft"
    >
      <template #right>
        <Icon name="plus" size="18" @click="createInbound" />
      </template>
    </NavBar>
    
    <div class="content-container">
      <!-- 搜索和筛选 -->
      <div class="search-filter">
        <Search
          v-model="searchValue"
          placeholder="搜索入库单号或物料名称"
          @search="onSearch"
          shape="round"
        />
        
        <div class="filter-tabs">
          <div 
            v-for="(tab, index) in statusTabs" 
            :key="index"
            :class="['filter-tab', { active: activeTab === index }]"
            @click="switchTab(index)"
          >
            {{ tab.label }}
          </div>
        </div>
      </div>
      
      <!-- 入库单列表 -->
      <PullRefresh v-model="refreshing" @refresh="onRefresh">
        <List
          v-model:loading="loading"
          :finished="finished"
          finished-text="没有更多数据了"
          @load="onLoad"
        >
          <div v-if="inboundList.length === 0 && !loading" class="empty-state">
            <Empty description="暂无入库记录" />
          </div>
          
          <Card 
            v-for="inbound in inboundList" 
            :key="inbound.id" 
            class="inbound-card"
            @click="viewInboundDetail(inbound.id)"
          >
            <div class="inbound-item">
              <div class="inbound-header">
                <span class="inbound-no">{{ inbound.inbound_no }}</span>
                <Tag :type="getInboundStatusType(inbound.status)" size="medium">
                  {{ getInboundStatusText(inbound.status) }}
                </Tag>
              </div>
              
              <div class="inbound-type">{{ getInboundTypeText(inbound.inbound_type) }}</div>
              
              <div class="inbound-details">
                <div class="detail-row">
                  <span class="label">入库日期:</span>
                  <span class="value">{{ formatDate(inbound.inbound_date) }}</span>
                </div>
                <div class="detail-row" v-if="inbound.warehouse_name">
                  <span class="label">入库仓库:</span>
                  <span class="value">{{ inbound.warehouse_name }}</span>
                </div>
                <div class="detail-row" v-if="inbound.operator_name">
                  <span class="label">操作员:</span>
                  <span class="value">{{ inbound.operator_name }}</span>
                </div>
                <div class="detail-row" v-if="inbound.source_no">
                  <span class="label">来源单号:</span>
                  <span class="value">{{ inbound.source_no }}</span>
                </div>
              </div>
              
              <div class="inbound-items" v-if="inbound.items && inbound.items.length > 0">
                <div class="items-title">入库物料 ({{ inbound.items.length }}项)</div>
                <div class="items-list">
                  <div 
                    v-for="(item, index) in inbound.items.slice(0, 2)" 
                    :key="index"
                    class="item-row"
                  >
                    <span class="item-name">{{ item.material_name }}</span>
                    <span class="item-quantity">{{ item.quantity }} {{ item.unit_name }}</span>
                  </div>
                  <div v-if="inbound.items.length > 2" class="more-items">
                    还有 {{ inbound.items.length - 2 }} 项...
                  </div>
                </div>
              </div>
              
              <div class="inbound-actions">
                <Button 
                  size="small" 
                  type="primary" 
                  plain
                  @click.stop="viewInboundDetail(inbound.id)"
                >
                  查看详情
                </Button>
                <Button 
                  v-if="inbound.status === 'draft'"
                  size="small" 
                  type="success" 
                  plain
                  @click.stop="confirmInbound(inbound)"
                >
                  确认入库
                </Button>
                <Button 
                  v-if="inbound.status === 'confirmed'"
                  size="small" 
                  type="warning" 
                  plain
                  @click.stop="completeInbound(inbound)"
                >
                  完成入库
                </Button>
              </div>
            </div>
          </Card>
        </List>
      </PullRefresh>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { NavBar, Search, Icon, Empty, Card, Tag, PullRefresh, List, Button, showToast, showConfirmDialog } from 'vant';
import { inventoryApi } from '@/services/api';
import { formatDate } from '@/utils/date';
import { getInboundStatusText, getInboundStatusColor, getInboundTypeText } from '@/constants/statusConstants';

const router = useRouter();
const searchValue = ref('');
const refreshing = ref(false);
const loading = ref(false);
const finished = ref(false);
const inboundList = ref([]);
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
  limit: 10,
  total: 0
});

// 返回上一页
const onClickLeft = () => {
  router.back();
};

// 创建入库单
const createInbound = () => {
  showToast('功能开发中');
};

// 搜索
const onSearch = (val) => {
  searchValue.value = val;
  resetList();
  loadInboundList();
};

// 切换标签
const switchTab = (index) => {
  activeTab.value = index;
  resetList();
  loadInboundList();
};

// 下拉刷新
const onRefresh = () => {
  resetList();
  loadInboundList().finally(() => {
    refreshing.value = false;
    showToast('刷新成功');
  });
};

// 重置列表
const resetList = () => {
  inboundList.value = [];
  pagination.page = 1;
  finished.value = false;
};

// 加载更多
const onLoad = () => {
  loadInboundList();
};

// 加载入库单列表
const loadInboundList = async () => {
  if (loading.value) return;
  
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      limit: pagination.limit,
      search: searchValue.value || undefined,
      status: statusTabs[activeTab.value].value || undefined
    };
    
    const response = await inventoryApi.getInboundList(params);
    
    if (response.data && response.data.items) {
      inboundList.value = [...inboundList.value, ...response.data.items];
      pagination.total = response.data.total || 0;
      finished.value = inboundList.value.length >= pagination.total;
    } else {
      finished.value = true;
    }
    
    pagination.page++;
  } catch (error) {
    console.error('获取入库单列表失败:', error);
    showToast('获取入库单列表失败');
    finished.value = true;
  } finally {
    loading.value = false;
  }
};

// 获取入库单状态类型（使用统一常量）
const getInboundStatusType = (status) => {
  return getInboundStatusColor(status);
};

// 查看入库单详情
const viewInboundDetail = (id) => {
  router.push(`/inventory/inbound/${id}`);
};

// 确认入库
const confirmInbound = async (inbound) => {
  try {
    await showConfirmDialog({
      title: '确认入库',
      message: `确定要确认入库单 ${inbound.inbound_no} 吗？`
    });
    
    await inventoryApi.updateInboundStatus(inbound.id, 'confirmed');
    showToast('入库单已确认');
    
    // 更新本地状态
    inbound.status = 'confirmed';
  } catch (error) {
    if (error !== 'cancel') {
      console.error('确认入库失败:', error);
      showToast('确认入库失败');
    }
  }
};

// 完成入库
const completeInbound = async (inbound) => {
  try {
    await showConfirmDialog({
      title: '完成入库',
      message: `确定要完成入库单 ${inbound.inbound_no} 吗？`
    });
    
    await inventoryApi.updateInboundStatus(inbound.id, 'completed');
    showToast('入库单已完成');
    
    // 更新本地状态
    inbound.status = 'completed';
  } catch (error) {
    if (error !== 'cancel') {
      console.error('完成入库失败:', error);
      showToast('完成入库失败');
    }
  }
};

onMounted(() => {
  loadInboundList();
});
</script>

<style lang="scss" scoped>
.search-filter {
  padding: $padding-md;
  background-color: white;
  border-bottom: 1px solid var(--van-border-color);
}

.filter-tabs {
  display: flex;
  margin-top: $margin-sm;
  overflow-x: auto;
  
  &::-webkit-scrollbar {
    display: none;
  }
  
  .filter-tab {
    flex: 0 0 auto;
    text-align: center;
    padding: $padding-xs $padding-sm;
    font-size: 12px;
    color: var(--text-secondary);
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    margin-right: $margin-sm;
    
    &.active {
      color: var(--color-primary);
      border-bottom-color: var(--color-primary);
    }
  }
}

.inbound-card {
  margin: $margin-md;
  margin-bottom: $margin-sm;
}

.inbound-item {
  padding: $padding-xs 0;
}

.inbound-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $margin-xs;
}

.inbound-no {
  font-size: 12px;
  color: var(--text-secondary);
}

.inbound-type {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: $margin-sm;
  color: var(--color-primary);
}

.inbound-details {
  margin-bottom: $margin-md;
  
  .detail-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    
    .label {
      font-size: 12px;
      color: var(--text-secondary);
    }
    
    .value {
      font-size: 12px;
      color: var(--text-primary);
    }
  }
}

.inbound-items {
  margin-bottom: $margin-md;
  
  .items-title {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: $margin-xs;
  }
  
  .items-list {
    background-color: var(--bg-primary);
    padding: $padding-sm;
    border-radius: $border-radius-sm;
    
    .item-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      
      &:last-child {
        margin-bottom: 0;
      }
      
      .item-name {
        font-size: 12px;
        color: var(--text-primary);
        flex: 1;
        margin-right: $margin-sm;
      }
      
      .item-quantity {
        font-size: 12px;
        color: var(--text-secondary);
      }
    }
    
    .more-items {
      font-size: 10px;
      color: var(--text-secondary);
      text-align: center;
      margin-top: $margin-xs;
    }
  }
}

.inbound-actions {
  display: flex;
  gap: $margin-sm;
  
  .van-button {
    flex: 1;
  }
}
</style>
