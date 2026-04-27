<!--
/**
 * GLDashboard.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="dashboard-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>总账管理</h2>
          <p class="subtitle">财务总账管理中心</p>
        </div>
      </div>
    </el-card>
    
    <el-row :gutter="20">
      <!-- 科目管理卡片 -->
      <el-col :xs="24" :sm="12" :md="8" :lg="6">
        <el-card class="module-card" shadow="hover" @click="navigateTo('/finance/gl/accounts')">
          <div class="card-content">
            <el-icon class="card-icon"><Document /></el-icon>
            <div class="card-title">科目管理</div>
            <div class="card-desc">管理会计科目树，设置科目属性</div>
          </div>
        </el-card>
      </el-col>
      
      <!-- 凭证管理卡片 -->
      <el-col :xs="24" :sm="12" :md="8" :lg="6">
        <el-card class="module-card" shadow="hover" @click="navigateTo('/finance/gl/entries')">
          <div class="card-content">
            <el-icon class="card-icon"><Tickets /></el-icon>
            <div class="card-title">凭证管理</div>
            <div class="card-desc">创建、查询和管理会计凭证</div>
          </div>
        </el-card>
      </el-col>
      
      <!-- 期间管理卡片 -->
      <el-col :xs="24" :sm="12" :md="8" :lg="6">
        <el-card class="module-card" shadow="hover" @click="navigateTo('/finance/gl/periods')">
          <div class="card-content">
            <el-icon class="card-icon"><Calendar /></el-icon>
            <div class="card-title">期间管理</div>
            <div class="card-desc">设置和关闭会计期间</div>
          </div>
        </el-card>
      </el-col>
      
      <!-- 账簿查询卡片 -->
      <el-col :xs="24" :sm="12" :md="8" :lg="6">
        <el-card class="module-card" shadow="hover" @click="navigateTo('/finance/gl/ledger')">
          <div class="card-content">
            <el-icon class="card-icon"><Search /></el-icon>
            <div class="card-title">账簿查询</div>
            <div class="card-desc">查询总账、明细账和科目余额</div>
          </div>
        </el-card>
      </el-col>
      
      <!-- 财务报表卡片 -->
      <el-col :xs="24" :sm="12" :md="8" :lg="6">
        <el-card class="module-card" shadow="hover" @click="navigateTo('/finance/gl/reports')">
          <div class="card-content">
            <el-icon class="card-icon"><PieChart /></el-icon>
            <div class="card-title">财务报表</div>
            <div class="card-desc">生成资产负债表和利润表</div>
          </div>
        </el-card>
      </el-col>
      
      <!-- 初始化卡片 -->
      <el-col :xs="24" :sm="12" :md="8" :lg="6">
        <el-card class="module-card" shadow="hover" @click="showInitConfirm">
          <div class="card-content">
            <el-icon class="card-icon"><Setting /></el-icon>
            <div class="card-title">系统初始化</div>
            <div class="card-desc">创建基础会计科目和期间</div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    
    <!-- 财务概览 -->
    <div class="overview-section">
      <h3>财务概览</h3>
      <el-row :gutter="20">
        <el-col :xs="24" :sm="12" :md="8">
          <el-card class="stat-card">
            <template #header>
              <div class="stat-header">
                <span>总资产</span>
                <el-icon><Money /></el-icon>
              </div>
            </template>
            <div class="stat-value">{{ formatCurrency(statistics.totalAssets) }}</div>
            <div class="stat-footer">
              <span :class="statistics.assetsChangeRate >= 0 ? 'positive-change' : 'negative-change'">
                {{ statistics.assetsChangeRate >= 0 ? '+' : '' }}{{ statistics.assetsChangeRate }}%
              </span>
              <span class="stat-period">较上月</span>
            </div>
          </el-card>
        </el-col>
        
        <el-col :xs="24" :sm="12" :md="8">
          <el-card class="stat-card">
            <template #header>
              <div class="stat-header">
                <span>本月收入</span>
                <el-icon><TrendCharts /></el-icon>
              </div>
            </template>
            <div class="stat-value">{{ formatCurrency(statistics.monthlyRevenue) }}</div>
            <div class="stat-footer">
              <span :class="statistics.revenueChangeRate >= 0 ? 'positive-change' : 'negative-change'">
                {{ statistics.revenueChangeRate >= 0 ? '+' : '' }}{{ statistics.revenueChangeRate }}%
              </span>
              <span class="stat-period">较上月</span>
            </div>
          </el-card>
        </el-col>
        
        <el-col :xs="24" :sm="12" :md="8">
          <el-card class="stat-card">
            <template #header>
              <div class="stat-header">
                <span>本月利润</span>
                <el-icon><DataLine /></el-icon>
              </div>
            </template>
            <div class="stat-value">{{ formatCurrency(statistics.monthlyProfit) }}</div>
            <div class="stat-footer">
              <span :class="statistics.profitChangeRate >= 0 ? 'positive-change' : 'negative-change'">
                {{ statistics.profitChangeRate >= 0 ? '+' : '' }}{{ statistics.profitChangeRate }}%
              </span>
              <span class="stat-period">较上月</span>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
    
    <!-- 最近凭证 -->
    <div class="recent-section">
      <div class="section-header">
        <h3>最近凭证</h3>
        <el-button type="primary" link @click="navigateTo('/finance/gl/entries')">
          查看全部
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
      
      <el-table :data="recentEntries" style="width: 100%" border v-loading="loading">
        <el-table-column prop="entryNumber" label="凭证编号" width="120"></el-table-column>
        <el-table-column prop="entryDate" label="记账日期" width="100"></el-table-column>
        <el-table-column prop="documentType" label="单据类型" width="100"></el-table-column>
        <el-table-column prop="description" label="描述"></el-table-column>
        <el-table-column prop="amount" label="金额" width="120" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.amount) }}
          </template>
        </el-table-column>
        <el-table-column width="80">
          <template #default="scope">
            <el-button type="primary" link @click="viewEntry(scope.row)">
              查看
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>

import { formatDate } from '@/utils/helpers/dateUtils'

import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Document, Tickets, Calendar, Search, PieChart, Setting, Money, TrendCharts, DataLine, ArrowRight } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '@/services/api';
// 权限计算属性
const router = useRouter();
const loading = ref(false);

// 统计数据
const statistics = reactive({
  totalAssets: 0,
  assetsChangeRate: 0,
  monthlyRevenue: 0,
  revenueChangeRate: 0,
  monthlyProfit: 0,
  profitChangeRate: 0,
});

// 最近凭证
const recentEntries = ref([]);

// 页面导航
const navigateTo = (path) => {
  router.push(path);
};

// 加载财务统计数据
const loadStatistics = async () => {
  try {
    // 获取当天日期作为报表日期
    const reportDate = new Date().toISOString().split('T')[0];
    const response = await api.get('/finance/reports/summary', {
      params: { reportDate },
    });
    const data = response.data;
    if (data) {
      // API返回结构: { keyMetrics: { totalAssets, totalLiabilities, ... } }
      const metrics = data.keyMetrics || data;
      statistics.totalAssets = parseFloat(metrics.totalAssets || 0);
      statistics.assetsChangeRate = parseFloat(metrics.equityRatio || 0);
      statistics.monthlyRevenue = parseFloat(metrics.totalEquity || data.monthlyRevenue || 0);
      statistics.revenueChangeRate = parseFloat(metrics.debtToAssetRatio || 0);
      statistics.monthlyProfit = parseFloat(metrics.totalLiabilities || data.monthlyProfit || 0);
      statistics.profitChangeRate = parseFloat(data.profitChangeRate || 0);
    }
  } catch (error) {
    console.warn('加载财务统计数据失败，使用默认值:', error);
    // 加载失败时保持初始化的0值，不影响页面渲染
  }
};

// 系统初始化确认
const showInitConfirm = () => {
  ElMessageBox.confirm(
    '系统初始化将创建基础的会计科目和会计期间。是否继续？',
    '确认初始化',
    {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
    }
  )
    .then(() => {
      initializeSystem();
    })
    .catch(() => {
      // 用户取消操作
    });
};

// 执行系统初始化
const initializeSystem = async () => {
  try {
    loading.value = true;
    await api.post('/finance/init');
    ElMessage.success('系统初始化成功');
    // 重新加载数据
    loadRecentEntries();
  } catch (error) {
    console.error('系统初始化失败:', error);
    ElMessage.error('系统初始化失败');
  } finally {
    loading.value = false;
  }
};

// 加载最近凭证
const loadRecentEntries = async () => {
  try {
    loading.value = true;
    const response = await api.get('/finance/entries', {
      params: {
        page: 1,
        pageSize: 5,
      },
    });
    
    // 拦截器已解包，response.data 就是业务数据
    if (response.data?.entries) {
      recentEntries.value = response.data.entries.map(entry => ({
        id: entry.id,
        entryNumber: entry.entry_number,
        entryDate: formatDate(entry.entry_date),
        documentType: entry.document_type,
        description: entry.description || '-',
        amount: entry.total_debit || 0
      }));
    }
  } catch (error) {
    console.error('加载最近凭证失败:', error);
    ElMessage.error('加载最近凭证失败');
  } finally {
    loading.value = false;
  }
};

// 查看凭证详情
const viewEntry = (entry) => {
  router.push(`/finance/gl/entries/${entry.id}`);
};

// 货币格式化
// formatCurrency: 使用公共实现

// 日期格式化
// formatDate 已统一引用公共实现;

// 页面加载时执行
onMounted(() => {
  loadStatistics();
  loadRecentEntries();
});
</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.module-card {
  margin-bottom: var(--spacing-base);
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
}

.module-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
}

.card-icon {
  font-size: 32px;
  color: var(--color-primary);
  margin-bottom: 10px;
}

.card-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 5px;
}

.card-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
}

.overview-section {
  margin-top: 30px;
  margin-bottom: 30px;
}


.stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}


.stat-footer {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.stat-period {
  margin-left: 5px;
  color: var(--color-text-secondary);
}

.positive-change {
  color: var(--color-success);
}

.negative-change {
  color: var(--color-danger);
}

.recent-section {
  margin-top: 30px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}


/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style> 