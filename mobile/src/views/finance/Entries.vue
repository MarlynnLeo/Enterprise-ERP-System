<!--
/**
 * Entries.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="entries-page">
    <NavBar title="会计凭证" left-arrow @click-left="$router.go(-1)">
      <template #right>
        <Icon name="plus" size="18" @click="createEntry" />
      </template>
    </NavBar>
    
    <div class="content-container">
      <!-- 搜索和筛选 -->
      <div class="search-section">
        <Search 
          v-model="searchKeyword" 
          placeholder="搜索凭证号或摘要"
          @search="handleSearch"
          @clear="handleClear"
        />
      </div>

      <!-- 状态筛选 -->
      <div class="filter-section">
        <div class="filter-tabs">
          <div 
            v-for="status in entryStatuses" 
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

      <!-- 凭证列表 -->
      <div class="entries-list">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <div v-for="entry in entries" :key="entry.id" class="entry-item">
              <div class="entry-header" @click="viewEntry(entry)">
                <div class="entry-info">
                  <div class="entry-number">{{ entry.entry_number }}</div>
                  <div class="entry-date">{{ formatDate(entry.entry_date) }}</div>
                </div>
                <div class="entry-status">
                  <div class="status-badge" :class="getStatusClass(entry.status)">
                    {{ getStatusLabel(entry.status) }}
                  </div>
                  <div class="entry-amount">¥{{ formatMoney(entry.total_amount) }}</div>
                </div>
              </div>
              
              <div class="entry-content">
                <div class="entry-summary">{{ entry.summary || '无摘要' }}</div>
                <div class="entry-details">
                  <span class="creator">制单: {{ entry.created_by_name }}</span>
                  <span class="time">{{ formatDateTime(entry.created_at) }}</span>
                </div>
              </div>

              <!-- 凭证分录预览 -->
              <div class="entry-lines" v-if="entry.lines && entry.lines.length > 0">
                <div v-for="line in entry.lines.slice(0, 2)" :key="line.id" class="line-item">
                  <div class="line-account">{{ line.account_name }}</div>
                  <div class="line-amounts">
                    <span v-if="line.debit_amount > 0" class="debit">
                      借: ¥{{ formatMoney(line.debit_amount) }}
                    </span>
                    <span v-if="line.credit_amount > 0" class="credit">
                      贷: ¥{{ formatMoney(line.credit_amount) }}
                    </span>
                  </div>
                </div>
                <div v-if="entry.lines.length > 2" class="more-lines">
                  还有 {{ entry.lines.length - 2 }} 条分录...
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="entry-actions" v-if="entry.status === 'draft'">
                <Button size="small" type="default" @click="editEntry(entry)">编辑</Button>
                <Button size="small" type="primary" @click="approveEntry(entry)">审核</Button>
                <Button size="small" type="danger" @click="deleteEntry(entry)">删除</Button>
              </div>
            </div>
          </List>
        </PullRefresh>
      </div>
    </div>

    <!-- 快速操作浮动按钮 -->
    <div class="fab-container">
      <div class="fab-menu" :class="{ active: showFabMenu }">
        <div class="fab-item" @click="createEntry">
          <Icon name="add-o" size="20" />
          <span>新建凭证</span>
        </div>
        <div class="fab-item" @click="importEntry">
          <Icon name="upgrade" size="20" />
          <span>导入凭证</span>
        </div>
        <div class="fab-item" @click="exportEntries">
          <Icon name="down" size="20" />
          <span>导出凭证</span>
        </div>
      </div>
      <div class="fab-button" @click="toggleFabMenu">
        <Icon :name="showFabMenu ? 'cross' : 'plus'" size="24" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { 
  NavBar, Icon, Search, PullRefresh, List, Badge, Button,
  showToast, showConfirmDialog 
} from 'vant';
import { financeApi } from '@/services/api';

const router = useRouter();

// 响应式数据
const entries = ref([]);
const loading = ref(false);
const finished = ref(false);
const refreshing = ref(false);
const searchKeyword = ref('');
const selectedStatus = ref('');
const showFabMenu = ref(false);

// 凭证状态配置
const entryStatuses = ref([
  { label: '全部', value: '', count: 0 },
  { label: '草稿', value: 'draft', count: 0 },
  { label: '待审核', value: 'pending', count: 0 },
  { label: '已审核', value: 'approved', count: 0 },
  { label: '已驳回', value: 'rejected', count: 0 }
]);

import { getApprovalStatusText, getApprovalStatusColor } from '@/constants/systemConstants'

// 获取状态标签
const getStatusLabel = (status) => {
  return getApprovalStatusText(status);
};

// 获取状态样式类
const getStatusClass = (status) => {
  return getApprovalStatusColor(status);
};

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN');
};

// 格式化日期时间
const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN');
};

// 格式化金额
const formatMoney = (amount) => {
  if (!amount) return '0.00';
  return Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// 加载凭证列表
const loadEntries = async (isRefresh = false) => {
  if (isRefresh) {
    entries.value = [];
    finished.value = false;
  }

  try {
    const params = {
      page: Math.floor(entries.value.length / 20) + 1,
      limit: 20,
      search: searchKeyword.value,
      status: selectedStatus.value
    };

    const response = await financeApi.getEntries(params);
    const newEntries = response.data.entries || [];
    
    if (isRefresh) {
      entries.value = newEntries;
    } else {
      entries.value.push(...newEntries);
    }
    
    finished.value = newEntries.length < 20;
    
    // 更新状态统计
    if (response.data.statusCounts) {
      entryStatuses.value.forEach(status => {
        status.count = response.data.statusCounts[status.value] || 0;
      });
    }
  } catch (error) {
    console.error('加载凭证列表失败:', error);
    showToast('加载失败，请重试');
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
};

// 事件处理
const onLoad = () => {
  loading.value = true;
  loadEntries();
};

const onRefresh = () => {
  refreshing.value = true;
  loadEntries(true);
};

const handleSearch = () => {
  loadEntries(true);
};

const handleClear = () => {
  searchKeyword.value = '';
  loadEntries(true);
};

const selectStatus = (status) => {
  selectedStatus.value = status;
  loadEntries(true);
};

const viewEntry = (entry) => {
  router.push(`/finance/gl/entries/${entry.id}`);
};

const createEntry = () => {
  showFabMenu.value = false;
  router.push('/finance/gl/entries/create');
};

const editEntry = (entry) => {
  router.push(`/finance/gl/entries/${entry.id}/edit`);
};

const approveEntry = async (entry) => {
  try {
    const result = await showConfirmDialog({
      title: '确认审核',
      message: `确定要审核凭证 ${entry.entry_number} 吗？`
    });
    
    if (result === 'confirm') {
      await financeApi.approveEntry(entry.id);
      showToast('凭证审核成功');
      loadEntries(true);
    }
  } catch (error) {
    console.error('审核凭证失败:', error);
    showToast('审核失败，请重试');
  }
};

const deleteEntry = async (entry) => {
  try {
    const result = await showConfirmDialog({
      title: '确认删除',
      message: `确定要删除凭证 ${entry.entry_number} 吗？此操作不可恢复。`
    });
    
    if (result === 'confirm') {
      await financeApi.deleteEntry(entry.id);
      showToast('凭证删除成功');
      loadEntries(true);
    }
  } catch (error) {
    console.error('删除凭证失败:', error);
    showToast('删除失败，请重试');
  }
};

const toggleFabMenu = () => {
  showFabMenu.value = !showFabMenu.value;
};

const importEntry = () => {
  showFabMenu.value = false;
  showToast('导入功能正在开发中');
};

const exportEntries = () => {
  showFabMenu.value = false;
  showToast('导出功能正在开发中');
};

onMounted(() => {
  loadEntries(true);
});
</script>

<style lang="scss" scoped>
.entries-page {
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
    box-shadow: none;
    overflow-x: auto;

    .filter-tab {
      flex-shrink: 0;
      text-align: center;
      padding: 8px 12px;
      font-size: 14px;
      color: var(--text-secondary);
      border-radius: 6px;
      transition: all 0.2s;
      position: relative;
      white-space: nowrap;

      &.active {
        background-color: var(--color-primary);
        color: #fff;
      }
    }
  }
}

.entries-list {
  .entry-item {
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 8px;
    padding: 16px;
    box-shadow: none;

    .entry-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      .entry-info {
        .entry-number {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .entry-date {
          font-size: 12px;
          color: var(--text-secondary);
        }
      }

      .entry-status {
        text-align: right;

        .status-badge {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 10px;
          color: #fff;
          margin-bottom: 4px;

          &.draft { background-color: #c8c9cc; }
          &.pending { background-color: var(--module-orange); }
          &.approved { background-color: var(--module-green); }
          &.rejected { background-color: var(--module-red); }
        }

        .entry-amount {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
      }
    }

    .entry-content {
      margin-bottom: 12px;

      .entry-summary {
        font-size: 14px;
        color: var(--text-primary);
        margin-bottom: 8px;
      }

      .entry-details {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: var(--text-secondary);
      }
    }

    .entry-lines {
      border-top: 1px solid var(--van-border-color);
      padding-top: 12px;
      margin-bottom: 12px;

      .line-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;

        .line-account {
          font-size: 12px;
          color: var(--text-primary);
        }

        .line-amounts {
          font-size: 12px;

          .debit {
            color: var(--module-red);
            margin-right: 8px;
          }

          .credit {
            color: var(--module-green);
          }
        }
      }

      .more-lines {
        font-size: 12px;
        color: var(--text-secondary);
        text-align: center;
        padding: 4px 0;
      }
    }

    .entry-actions {
      display: flex;
      gap: 8px;
      border-top: 1px solid var(--van-border-color);
      padding-top: 12px;

      .van-button {
        flex: 1;
      }
    }
  }
}

.fab-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;

  .fab-menu {
    position: absolute;
    bottom: 70px;
    right: 0;
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.3s ease;
    pointer-events: none;

    &.active {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    .fab-item {
      display: flex;
      align-items: center;
      background: var(--bg-secondary);
      border-radius: 24px;
      padding: 12px 16px;
      margin-bottom: 8px;
      box-shadow: none;
      white-space: nowrap;

      span {
        margin-left: 8px;
        font-size: 14px;
        color: var(--text-primary);
      }
    }
  }

  .fab-button {
    width: 56px;
    height: 56px;
    border-radius: 28px;
    background-color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: none;
    color: #fff;
    transition: all 0.3s ease;

    &:active {
      transform: scale(0.95);
    }
  }
}
</style>
