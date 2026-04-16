<!--
/**
 * Incoming.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="incoming-page">
    <NavBar title="来料检验" left-arrow @click-left="$router.go(-1)">
      <template #right>
        <Icon name="plus" size="18" @click="createInspection" />
      </template>
    </NavBar>
    
    <div class="content-container">
      <!-- 搜索和筛选 -->
      <div class="search-section">
        <Search 
          v-model="searchKeyword" 
          placeholder="搜索批次号或供应商"
          @search="handleSearch"
          @clear="handleClear"
        />
      </div>

      <!-- 状态筛选 -->
      <div class="filter-section">
        <div class="filter-tabs">
          <div 
            v-for="status in inspectionStatuses" 
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

      <!-- 检验列表 -->
      <div class="inspections-list">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <div v-for="inspection in inspections" :key="inspection.id" class="inspection-item">
              <div class="inspection-header" @click="viewInspection(inspection)">
                <div class="inspection-info">
                  <div class="inspection-number">{{ inspection.inspection_number }}</div>
                  <div class="batch-number">批次: {{ inspection.batch_number }}</div>
                </div>
                <div class="inspection-status">
                  <div class="status-badge" :class="getStatusClass(inspection.status)">
                    {{ getStatusLabel(inspection.status) }}
                  </div>
                  <div class="inspection-date">{{ formatDate(inspection.inspection_date) }}</div>
                </div>
              </div>
              
              <div class="inspection-content">
                <div class="material-info">
                  <div class="material-name">{{ inspection.material_name }}</div>
                  <div class="supplier-name">供应商: {{ inspection.supplier_name }}</div>
                </div>
                <div class="quantity-info">
                  <span class="quantity">数量: {{ inspection.quantity }} {{ inspection.unit }}</span>
                  <span class="sample-size">抽检: {{ inspection.sample_size }}</span>
                </div>
              </div>

              <!-- 检验结果 -->
              <div class="inspection-results" v-if="inspection.status !== 'pending'">
                <div class="result-summary">
                  <div class="result-item">
                    <span class="result-label">合格数:</span>
                    <span class="result-value pass">{{ inspection.pass_quantity || 0 }}</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">不合格数:</span>
                    <span class="result-value fail">{{ inspection.fail_quantity || 0 }}</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">合格率:</span>
                    <span class="result-value rate">{{ calculatePassRate(inspection) }}%</span>
                  </div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="inspection-actions" v-if="inspection.status === 'pending'">
                <Button size="small" type="primary" @click="startInspection(inspection)">
                  开始检验
                </Button>
                <Button size="small" type="default" @click="editInspection(inspection)">
                  编辑
                </Button>
              </div>
              
              <div class="inspection-actions" v-else-if="inspection.status === 'in_progress'">
                <Button size="small" type="primary" @click="continueInspection(inspection)">
                  继续检验
                </Button>
                <Button size="small" type="success" @click="completeInspection(inspection)">
                  完成检验
                </Button>
              </div>
            </div>
          </List>
        </PullRefresh>
      </div>
    </div>

    <!-- 快速操作浮动按钮 -->
    <div class="fab-container">
      <div class="fab-menu" :class="{ active: showFabMenu }">
        <div class="fab-item" @click="createInspection">
          <Icon name="add-o" size="20" />
          <span>新建检验</span>
        </div>
        <div class="fab-item" @click="scanQRCode">
          <Icon name="scan" size="20" />
          <span>扫码检验</span>
        </div>
        <div class="fab-item" @click="batchImport">
          <Icon name="upgrade" size="20" />
          <span>批量导入</span>
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

const router = useRouter();

// 响应式数据
const inspections = ref([]);
const loading = ref(false);
const finished = ref(false);
const refreshing = ref(false);
const searchKeyword = ref('');
const selectedStatus = ref('');
const showFabMenu = ref(false);

// 检验状态配置
const inspectionStatuses = ref([
  { label: '全部', value: '', count: 0 },
  { label: '待检验', value: 'pending', count: 0 },
  { label: '检验中', value: 'in_progress', count: 0 },
  { label: '已完成', value: 'completed', count: 0 },
  { label: '已入库', value: 'received', count: 0 }
]);

// 获取状态标签
const getStatusLabel = (status) => {
  const statusMap = {
    'pending': '待检验',
    'in_progress': '检验中',
    'completed': '已完成',
    'received': '已入库'
  };
  return statusMap[status] || status;
};

// 获取状态样式类
const getStatusClass = (status) => {
  const classMap = {
    'pending': 'pending',
    'in_progress': 'in-progress',
    'completed': 'completed',
    'received': 'received'
  };
  return classMap[status] || 'default';
};

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN');
};

// 计算合格率
const calculatePassRate = (inspection) => {
  const total = (inspection.pass_quantity || 0) + (inspection.fail_quantity || 0);
  if (total === 0) return 0;
  return Math.round((inspection.pass_quantity || 0) / total * 100);
};

// 加载检验列表
const loadInspections = async (isRefresh = false) => {
  if (isRefresh) {
    inspections.value = [];
    finished.value = false;
  }

  try {
    const params = {
      page: Math.floor(inspections.value.length / 20) + 1,
      limit: 20,
      search: searchKeyword.value,
      status: selectedStatus.value
    };

    // 这里调用API获取检验列表
    // const response = await qualityApi.getIncomingInspections(params);
    // const newInspections = response.data.inspections || [];
    
    // 模拟数据
    const mockData = [
      {
        id: 1,
        inspection_number: 'INC20241201001',
        batch_number: 'ST20241201-001',
        material_name: '304不锈钢板',
        supplier_name: '钢铁供应商A',
        quantity: 1000,
        unit: 'kg',
        sample_size: 50,
        status: 'pending',
        inspection_date: '2024-12-01',
        pass_quantity: null,
        fail_quantity: null
      },
      {
        id: 2,
        inspection_number: 'INC20241201002',
        batch_number: 'AL20241201-002',
        material_name: '铝合金型材',
        supplier_name: '铝材供应商B',
        quantity: 500,
        unit: 'm',
        sample_size: 25,
        status: 'completed',
        inspection_date: '2024-12-01',
        pass_quantity: 23,
        fail_quantity: 2
      }
    ];
    
    const newInspections = isRefresh ? mockData : [];
    
    if (isRefresh) {
      inspections.value = newInspections;
    } else {
      inspections.value.push(...newInspections);
    }
    
    finished.value = newInspections.length < 20;
    
    // 更新状态统计
    inspectionStatuses.value[1].count = 8; // 待检验
    inspectionStatuses.value[2].count = 3; // 检验中
    inspectionStatuses.value[3].count = 15; // 已完成
    inspectionStatuses.value[4].count = 12; // 已入库
  } catch (error) {
    console.error('加载检验列表失败:', error);
    showToast('加载失败，请重试');
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
};

// 事件处理
const onLoad = () => {
  loading.value = true;
  loadInspections();
};

const onRefresh = () => {
  refreshing.value = true;
  loadInspections(true);
};

const handleSearch = () => {
  loadInspections(true);
};

const handleClear = () => {
  searchKeyword.value = '';
  loadInspections(true);
};

const selectStatus = (status) => {
  selectedStatus.value = status;
  loadInspections(true);
};

const viewInspection = (inspection) => {
  router.push(`/quality/incoming/${inspection.id}`);
};

const createInspection = () => {
  showFabMenu.value = false;
  router.push('/quality/incoming/create');
};

const editInspection = (inspection) => {
  router.push(`/quality/incoming/${inspection.id}/edit`);
};

const startInspection = (inspection) => {
  router.push(`/quality/incoming/${inspection.id}/inspect`);
};

const continueInspection = (inspection) => {
  router.push(`/quality/incoming/${inspection.id}/inspect`);
};

const completeInspection = async (inspection) => {
  try {
    const result = await showConfirmDialog({
      title: '确认完成',
      message: `确定要完成检验 ${inspection.inspection_number} 吗？`
    });
    
    if (result === 'confirm') {
      // 调用API完成检验
      // await qualityApi.completeInspection(inspection.id);
      showToast('检验完成');
      loadInspections(true);
    }
  } catch (error) {
    console.error('完成检验失败:', error);
    showToast('操作失败，请重试');
  }
};

const toggleFabMenu = () => {
  showFabMenu.value = !showFabMenu.value;
};

const scanQRCode = () => {
  showFabMenu.value = false;
  showToast('扫码功能正在开发中');
};

const batchImport = () => {
  showFabMenu.value = false;
  showToast('批量导入功能正在开发中');
};

onMounted(() => {
  loadInspections(true);
});
</script>

<style lang="scss" scoped>
.incoming-page {
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

.inspections-list {
  .inspection-item {
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 8px;
    padding: 16px;
    box-shadow: none;

    .inspection-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      .inspection-info {
        .inspection-number {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .batch-number {
          font-size: 12px;
          color: var(--text-secondary);
        }
      }

      .inspection-status {
        text-align: right;

        .status-badge {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 10px;
          color: #fff;
          margin-bottom: 4px;

          &.pending { background-color: #c8c9cc; }
          &.in-progress { background-color: var(--module-orange); }
          &.completed { background-color: var(--module-green); }
          &.received { background-color: var(--module-blue); }
        }

        .inspection-date {
          font-size: 12px;
          color: var(--text-secondary);
        }
      }
    }

    .inspection-content {
      margin-bottom: 12px;

      .material-info {
        margin-bottom: 8px;

        .material-name {
          font-size: 14px;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .supplier-name {
          font-size: 12px;
          color: var(--text-secondary);
        }
      }

      .quantity-info {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: var(--text-secondary);
      }
    }

    .inspection-results {
      border-top: 1px solid var(--van-border-color);
      padding-top: 12px;
      margin-bottom: 12px;

      .result-summary {
        display: flex;
        justify-content: space-around;

        .result-item {
          text-align: center;

          .result-label {
            display: block;
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 4px;
          }

          .result-value {
            font-size: 14px;
            font-weight: 600;

            &.pass { color: var(--module-green); }
            &.fail { color: var(--module-red); }
            &.rate { color: var(--text-primary); }
          }
        }
      }
    }

    .inspection-actions {
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
