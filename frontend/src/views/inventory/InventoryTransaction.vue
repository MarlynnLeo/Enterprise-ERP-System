<!--
/**
 * InventoryTransaction.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <!-- 组件初始化加载状态 -->
  <div v-if="!isComponentReady" class="loading-container" v-loading="true" element-loading-text="正在初始化组件...">
    <div style="height: 200px; width: 100%;"></div>
  </div>

  <div class="inventory-transaction-container" v-else>
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>库存流水报表</h2>
          <p class="subtitle">查看库存出入库流水记录</p>
        </div>
        <el-button type="primary" @click="handleExport">
          <el-icon><Download /></el-icon> 导出报表
        </el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card" v-if="searchForm">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :shortcuts="dateShortcuts"
            value-format="YYYY-MM-DD"

          />
        </el-form-item>
        <el-form-item label="物料编码">
          <el-input v-model="searchForm.materialName" placeholder="输入物料编码" clearable />
        </el-form-item>
        <el-form-item label="流水类型">
          <el-select v-model="searchForm.transactionType" placeholder="选择流水类型" clearable>
            <el-option label="入库" value="inbound" />
            <el-option label="出库" value="outbound" />
            <el-option label="采购退货" value="purchase_return" />
            <el-option label="销售退货" value="sales_return" />
            <el-option label="生产退料" value="production_return" />
            <el-option label="不良退回" value="defective_return" />
            <el-option label="调拨" value="transfer" />
            <el-option label="盘点" value="check" />
            <el-option label="其他" value="other" />
            <el-option label="委外出库" value="outsourced_outbound" />
            <el-option label="委外入库" value="outsourced_inbound" />
          </el-select>
        </el-form-item>
        <el-form-item label="仓库位置">
          <el-select v-model="searchForm.locationId" placeholder="选择仓库位置" clearable>
            <el-option 
              v-for="location in locationOptions" 
              :key="location.id" 
              :label="location.name" 
              :value="location.id" 
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="handleReset">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 统计信息 -->
    <div class="statistics-row" v-if="statistics">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.totalTransactions || 0 }}</div>
        <div class="stat-label">流水总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.inboundCount || 0 }}</div>
        <div class="stat-label">入库数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.outboundCount || 0 }}</div>
        <div class="stat-label">出库数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(statistics?.totalAmount || 0) }}</div>
        <div class="stat-label">交易总金额</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.transferCount || 0 }}</div>
        <div class="stat-label">调拨数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.checkCount || 0 }}</div>
        <div class="stat-label">盘点数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.totalQuantity || 0 }}</div>
        <div class="stat-label">总交易数量</div>
      </el-card>
    </div>
    
    <!-- 流水记录列表 -->
    <el-card class="data-card" v-if="activeTab && transactionList">
      <el-tabs v-model="activeTab" @tab-click="handleTabChange">
        <el-tab-pane label="流水列表" name="list">
          <el-table
            :data="transactionList"
            border
            style="width: 100%"
            v-loading="loading"
            @row-click="handleRowClick"
          >
            <el-table-column prop="transactionNo" label="流水编号" width="150" show-overflow-tooltip />
            <el-table-column prop="transactionTime" label="交易时间" width="160" show-overflow-tooltip>
              <template #default="scope">
                {{ formatDateTime(scope.row.transactionTime) }}
              </template>
            </el-table-column>
            <el-table-column prop="materialCode" label="物料编码" width="150" show-overflow-tooltip />
            <el-table-column prop="materialName" label="物料名称" width="200" show-overflow-tooltip />
            <el-table-column prop="transactionType" label="流水类型" width="110">
              <template #default="scope">
                <el-tag :type="getTransactionTypeColor(scope.row.transactionType)">
                  {{ getTransactionTypeText(scope.row.transactionType) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="100">
              <template #default="scope">
                <span :class="getQuantityClass(scope.row)">
                  {{ getQuantityPrefix(scope.row) + formatNumber(scope.row.quantity) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="unitName" label="单位" width="60" />
            <el-table-column
              prop="beforeQuantity"
              label="变动前数量"
              width="110"
              align="right">
              <template #default="scope">
                {{ formatNumber(scope.row.beforeQuantity) }}
              </template>
            </el-table-column>
            <el-table-column
              prop="afterQuantity"
              label="变动后数量"
              width="110"
              align="right">
              <template #default="scope">
                {{ formatNumber(scope.row.afterQuantity) }}
              </template>
            </el-table-column>
            <el-table-column
              prop="amount"
              label="金额"
              width="120"
              align="right">
              <template #default="scope">
                {{ formatCurrency(scope.row.amount) }}
              </template>
            </el-table-column>
            <el-table-column prop="locationName" label="仓库位置" width="120" show-overflow-tooltip />
            <el-table-column prop="operator" label="操作人" width="100" show-overflow-tooltip />
            <el-table-column prop="remarks" label="备注" min-width="200" show-overflow-tooltip>
              <template #default="scope">
                {{ scope.row.remarks || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="80" fixed="right">
              <template #default="scope">
                <el-button size="small" @click.stop="showTransactionDetail(scope.row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <!-- 分页 -->
          <div class="pagination-container" v-if="pagination">
            <el-pagination
              @size-change="handleSizeChange"
              @current-change="handleCurrentChange"
              :current-page="pagination.currentPage || 1"
              :page-sizes="[10, 20, 50, 100]"
              :page-size="pagination.pageSize || 10"
              :background="true"
              layout="total, sizes, prev, pager, next, jumper"
              :total="pagination.total || 0"
            >
            </el-pagination>
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="流水统计" name="stats">
          <div class="chart-container">
            <div class="chart-row">
              <el-card class="chart-card">
                <h3 class="chart-title">
                  <el-icon><PieChart /></el-icon>
                  交易类型分布
                </h3>
                <div class="chart-box" ref="typeChartRef"></div>
              </el-card>
              
              <el-card class="chart-card">
                <h3 class="chart-title">
                  <el-icon><Histogram /></el-icon>
                  交易金额统计
                </h3>
                <div class="chart-box" ref="amountChartRef"></div>
              </el-card>
            </div>
            
            <el-card class="chart-card full-width">
              <h3 class="chart-title">
                <el-icon><TrendCharts /></el-icon>
                交易数量趋势
              </h3>
              <div class="chart-box" ref="trendChartRef"></div>
            </el-card>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
    
    <!-- 交易详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="流水详情"
      width="800px"
      destroy-on-close
    >
      <el-descriptions :column="2" border v-if="currentTransaction">
        <el-descriptions-item label="流水编号">{{ currentTransaction.transactionNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="交易时间">{{ formatDateTime(currentTransaction.transactionTime) }}</el-descriptions-item>
        <el-descriptions-item label="物料编码">{{ currentTransaction.materialCode || '-' }}</el-descriptions-item>
        <el-descriptions-item label="物料名称">{{ currentTransaction.materialName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="流水类型">
          <el-tag :type="getTransactionTypeColor(currentTransaction.transactionType)">
            {{ getTransactionTypeText(currentTransaction.transactionType) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="数量">
          <span :class="getQuantityClass(currentTransaction)">
            {{ getQuantityPrefix(currentTransaction) + formatNumber(currentTransaction.quantity) }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="变动前数量">{{ formatNumber(currentTransaction.beforeQuantity) }}</el-descriptions-item>
        <el-descriptions-item label="变动后数量">{{ formatNumber(currentTransaction.afterQuantity) }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ formatCurrency(currentTransaction.amount) }}</el-descriptions-item>
        <el-descriptions-item label="单位">{{ currentTransaction.unitName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="仓库位置">{{ currentTransaction.locationName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="操作人">{{ currentTransaction.operator || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间" :span="2">{{ formatDateTime(currentTransaction.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ currentTransaction.remarks || '无' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import apiAdapter from '@/utils/apiAdapter';
import { parseListData } from '@/utils/responseParser';
import { inventoryApi } from '@/api/inventory';
import { formatCurrency, formatNumber } from '@/utils/format'
import { formatDateTime } from '@/utils/helpers/dateUtils'

import { ref, onMounted, onUnmounted, nextTick, reactive, computed } from 'vue'
import { debounce } from 'lodash-es'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Download, TrendCharts, PieChart, Histogram } from '@element-plus/icons-vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart as EchartsPie } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getInventoryTransactionTypeText, getInventoryTransactionTypeColor } from '@/constants/systemConstants'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

// 注册 ECharts 组件
echarts.use([
  BarChart,
  LineChart,
  EchartsPie,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  TitleComponent,
  CanvasRenderer
])

// 页面数据
const loading = ref(false)
const transactionList = ref([])
const activeTab = ref('list')

// 分页数据 - 使用 reactive 确保响应性
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})

// 统计信息
const statistics = ref({
  totalTransactions: 0,
  inboundCount: 0,
  outboundCount: 0,
  transferCount: 0,
  checkCount: 0,
  totalAmount: 0,
  totalQuantity: 0,
  uniqueOperators: 0
})

// 当前选中的交易详情
const detailDialogVisible = ref(false)
const currentTransaction = ref({})

// 图表引用
const typeChartRef = ref(null)
const amountChartRef = ref(null)
const trendChartRef = ref(null)
let typeChart = null
let amountChart = null
let trendChart = null

// 基础数据
const locationOptions = ref([])

// 日期快捷选项
const dateShortcuts = [
  {
    text: '最近一周',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setTime(start.getTime() - 3600 * 1000 * 24 * 7)
      return [start, end]
    }
  },
  {
    text: '最近一个月',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setTime(start.getTime() - 3600 * 1000 * 24 * 30)
      return [start, end]
    }
  },
  {
    text: '最近三个月',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setTime(start.getTime() - 3600 * 1000 * 24 * 90)
      return [start, end]
    }
  }
]

// 搜索表单
const searchForm = ref({
  dateRange: [
    dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD')
  ],
  materialName: '',
  transactionType: '',
  locationId: ''
})

// 计算属性：检查组件是否已完全初始化
const isComponentReady = computed(() => {
  return !!(
    pagination &&
    statistics.value &&
    searchForm.value &&
    transactionList.value !== undefined &&
    locationOptions.value !== undefined
  )
})

// Tab 切换处理
const handleTabChange = (tab) => {
  if (tab.props.name === 'stats') {
    nextTick(() => {
      initCharts()
    })
  }
}

// 搜索处理
const handleSearch = () => {
  // 前端数据验证
  if (searchForm.value.materialName && searchForm.value.materialName.length > 100) {
    ElMessage.error('物料名称不能超过100个字符')
    return
  }

  if (searchForm.value.dateRange && searchForm.value.dateRange.length === 2) {
    const startDate = new Date(searchForm.value.dateRange[0])
    const endDate = new Date(searchForm.value.dateRange[1])

    if (startDate > endDate) {
      ElMessage.error('开始日期不能大于结束日期')
      return
    }

    // 限制查询时间范围不超过1年
    const oneYearMs = 365 * 24 * 60 * 60 * 1000
    if (endDate - startDate > oneYearMs) {
      ElMessage.error('查询时间范围不能超过1年')
      return
    }
  }

  if (pagination) {
    pagination.currentPage = 1
  }
  debouncedFetchTransactionList()
}

// 获取交易列表
const fetchTransactionList = async () => {
  try {
    loading.value = true

    // 安全检查：确保 pagination 对象存在
    if (!pagination) {
      console.error('分页对象未初始化')
      return
    }

    const params = {
      page: pagination.currentPage || 1,
      pageSize: pagination.pageSize || 10,
      startDate: searchForm.value.dateRange?.[0] || '',
      endDate: searchForm.value.dateRange?.[1] || '',
      materialName: searchForm.value.materialName || '',
      transactionType: searchForm.value.transactionType || '',
      locationId: searchForm.value.locationId || ''
    }

    const response = await inventoryApi.getTransactions(params)

    // 拦截器已解包，response.data 就是业务数据
    const responseData = response.data

    // 处理统计数据 - 确保所有字段都有默认值
    statistics.value = {
      totalTransactions: 0,
      inboundCount: 0,
      outboundCount: 0,
      transferCount: 0,
      checkCount: 0,
      totalAmount: 0,
      totalQuantity: 0,
      uniqueOperators: 0,
      ...(responseData.statistics || {})
    }

    // 处理交易数据
    transactionList.value = responseData.items || []

    // 处理变动前后数量
    calculateBeforeAfterQuantity()

    // 设置分页总数
    if (pagination) {
      pagination.total = Number(responseData.total) || 0
    }

  } catch (error) {
    console.error('获取库存流水数据失败:', error)
    ElMessage.error('获取库存流水数据失败')

    // 确保即使出错也有默认值
    if (pagination) {
      pagination.total = 0
    }
  } finally {
    loading.value = false
  }
}

// 性能优化：防抖搜索
const debouncedFetchTransactionList = debounce(fetchTransactionList, 300)

// 重置搜索
const handleReset = () => {
  searchForm.value = {
    dateRange: [
      dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
      dayjs().format('YYYY-MM-DD')
    ],
    materialName: '',
    transactionType: '',
    locationId: ''
  }
  if (pagination) {
    pagination.currentPage = 1
  }
  fetchTransactionList()
}

// 计算变动前后数量
const calculateBeforeAfterQuantity = () => {
  // 首先检查是否所有记录都已有变动前后数量
  const needCalculation = transactionList.value.some(
    item => item.beforeQuantity === undefined || item.beforeQuantity === null || 
           item.afterQuantity === undefined || item.afterQuantity === null
  );
  
  // 如果所有记录都已有变动前后数量，直接返回
  if (!needCalculation) {
    return;
  }
  
  // 按物料ID、位置ID和时间排序
  const sortedList = [...transactionList.value].sort((a, b) => {
    if (a.materialId !== b.materialId) return a.materialId - b.materialId;
    if (a.locationId !== b.locationId) return a.locationId - b.locationId;
    return new Date(a.transactionTime) - new Date(b.transactionTime);
  });
  
  // 用于跟踪每个物料在每个位置的当前库存
  const stockMap = {};
  
  // 处理每条记录
  sortedList.forEach(item => {
    // 组合key，确保每个物料在每个位置都有独立的库存跟踪
    const key = `${item.materialId}_${item.locationId}`;
    
    // 如果记录已经有变动前后数量，无需计算
    if (item.beforeQuantity !== undefined && item.beforeQuantity !== null && 
        item.afterQuantity !== undefined && item.afterQuantity !== null) {
      // 更新stockMap以保持状态一致
      stockMap[key] = item.afterQuantity;
      return;
    }
    
    const quantity = parseFloat(item.quantity || 0);
    const absQuantity = Math.abs(quantity);
    
    // 如果是第一次遇到这个物料位置组合，设置初始库存
    if (stockMap[key] === undefined) {
      // 委外入库和普通入库一样是增加库存，入库前的库存默认为0
      // 委外出库和普通出库一样是减少库存，出库前的库存默认为出库数量
      if (item.transactionType === 'inbound' || 
          item.transactionType === 'outsourced_inbound') {
        stockMap[key] = 0;
      } else if (item.transactionType === 'outbound' || 
                 item.transactionType === 'outsourced_outbound') {
        stockMap[key] = absQuantity;
      } else {
        stockMap[key] = 0; // 其他类型初始库存为0
      }
    }
    
    // 设置变动前数量
    item.beforeQuantity = stockMap[key];
    
    // 更新库存并设置变动后数量
    if (item.transactionType === 'inbound' || 
        item.transactionType === 'outsourced_inbound') {
      stockMap[key] += absQuantity; // 入库增加库存，确保使用绝对值
    } else if (item.transactionType === 'outbound' || 
               item.transactionType === 'outsourced_outbound') {
      stockMap[key] -= absQuantity; // 出库减少库存，确保使用绝对值
    } else if (item.transactionType === 'transfer') {
      stockMap[key] += quantity; // 调拨可能是正数或负数
    } else {
      stockMap[key] += quantity; // 其他类型按实际值调整
    }
    
    item.afterQuantity = stockMap[key];
  });
  
  // 更新交易列表
  transactionList.value.forEach(item => {
    const matchItem = sortedList.find(s => s.id === item.id);
    if (matchItem) {
      item.beforeQuantity = matchItem.beforeQuantity;
      item.afterQuantity = matchItem.afterQuantity;
    }
  });
}

// 获取统计数据
const fetchStatsData = async () => {
  try {
    const params = {
      startDate: searchForm.value.dateRange[0],
      endDate: searchForm.value.dateRange[1],
      materialName: searchForm.value.materialName,
      transactionType: searchForm.value.transactionType,
      locationId: searchForm.value.locationId
    }
    
    const response = await inventoryApi.getTransactionStats(params)
    return response.data
  } catch (error) {
    console.error('获取统计数据失败:', error)
    ElMessage.error('获取统计数据失败')
    return null
  }
}

// 获取基础数据
const fetchBaseData = async () => {
  try {
    // 获取仓库位置
    const locationResponse = await inventoryApi.getLocations()
    // 使用统一解析器
    locationOptions.value = parseListData(locationResponse, { enableLog: false })
  } catch (error) {
    console.error('获取基础数据失败:', error)
  }
}

// 初始化图表
const initCharts = async () => {
  const statsData = await fetchStatsData()
  if (!statsData) return
  
  // 类型分布图表
  if (typeChartRef.value) {
    typeChart = echarts.init(typeChartRef.value)
    typeChart.setOption({
      title: {
        text: '交易类型分布',
        left: 'center'
      },
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        data: statsData.typeDistribution.map(item => item.name)
      },
      series: [
        {
          name: '交易类型',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: '18',
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: false
          },
          data: statsData.typeDistribution
        }
      ]
    })
  }
  
  // 交易金额统计图表
  if (amountChartRef.value) {
    amountChart = echarts.init(amountChartRef.value)
    amountChart.setOption({
      title: {
        text: '交易金额统计',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: '{b}: {c} 元'
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: statsData.amountStats.map(item => item.name)
      },
      yAxis: {
        type: 'value',
        name: '金额(元)'
      },
      series: [
        {
          name: '金额',
          type: 'bar',
          barWidth: '60%',
          data: statsData.amountStats.map(item => item.value)
        }
      ]
    })
  }
  
  // 交易趋势图表
  if (trendChartRef.value) {
    trendChart = echarts.init(trendChartRef.value)
    trendChart.setOption({
      title: {
        text: '交易数量趋势',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: ['入库', '出库', '调拨', '盘点', '委外入库', '委外出库'],
        top: 30
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: statsData.trend.dates
      },
      yAxis: {
        type: 'value',
        name: '数量'
      },
      series: [
        {
          name: '入库',
          type: 'line',
          smooth: true,
          stack: 'Total',
          areaStyle: {},
          emphasis: {
            focus: 'series'
          },
          data: statsData.trend.inbound
        },
        {
          name: '出库',
          type: 'line',
          smooth: true,
          stack: 'Total',
          areaStyle: {},
          emphasis: {
            focus: 'series'
          },
          data: statsData.trend.outbound
        },
        {
          name: '调拨',
          type: 'line',
          smooth: true,
          stack: 'Total',
          areaStyle: {},
          emphasis: {
            focus: 'series'
          },
          data: statsData.trend.transfer
        },
        {
          name: '盘点',
          type: 'line',
          smooth: true,
          stack: 'Total',
          areaStyle: {},
          emphasis: {
            focus: 'series'
          },
          data: statsData.trend.check
        },
        {
          name: '委外入库',
          type: 'line',
          smooth: true,
          stack: 'Total',
          areaStyle: {},
          emphasis: {
            focus: 'series'
          },
          data: statsData.trend.outsourced_inbound || []
        },
        {
          name: '委外出库',
          type: 'line',
          smooth: true,
          stack: 'Total',
          areaStyle: {},
          emphasis: {
            focus: 'series'
          },
          data: statsData.trend.outsourced_outbound || []
        }
      ]
    })
  }
}

// 处理窗口大小变化
const handleResize = () => {
  if (typeChart) typeChart.resize()
  if (amountChart) amountChart.resize()
  if (trendChart) trendChart.resize()
}

// 导出报表
const handleExport = async () => {
  try {
    
    const params = {
      startDate: searchForm.value.dateRange[0],
      endDate: searchForm.value.dateRange[1],
      materialName: searchForm.value.materialName,
      transactionType: searchForm.value.transactionType,
      locationId: searchForm.value.locationId
    }
    
    const response = await inventoryApi.exportTransactions(params)
    
    const blob = new Blob([response.data], { type: 'application/vnd.ms-excel' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `库存流水报表_${dayjs().format('YYYYMMDD')}.xlsx`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    
    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出报表失败:', error)
    ElMessage.error('导出报表失败')
  }
}

// 交易类型颜色（使用统一常量）
const getTransactionTypeColor = (type) => {
  return getInventoryTransactionTypeColor(type)
}

// 交易类型文本
const getTransactionTypeText = (type) => {
  return getInventoryTransactionTypeText(type)
}

// 数量显示类
const getQuantityClass = (row) => {
  const type = row.transactionType;

  // 入库类型显示绿色（包括撤销出库）
  if (type === 'inbound' || type === 'outsourced_inbound' || type === 'purchase_inbound' ||
      type === 'sales_return' || type === '销售退货' || type === 'purchase_return' || type === '采购退货' ||
      type === 'sales_exchange_return' || type === '销售换退' ||
      type === 'adjustment_in' || type === '调整入库' ||
      type === 'outbound_cancel' || type === '撤销出库') {
    return 'increase-text';
  }

  // 出库类型显示红色
  if (type === 'outbound' || type === 'outsourced_outbound' ||
      type === 'sales_outbound' || type === '销售出库' ||
      type === 'sales_exchange_out' || type === '销售换出' ||
      type === 'adjustment_out' || type === '调整出库') {
    return 'decrease-text';
  }

  // 调拨和其他类型，根据数量正负决定显示颜色
  const quantity = parseFloat(row.quantity || 0);
  if (quantity > 0) return 'increase-text';
  if (quantity < 0) return 'decrease-text';

  return '';
}

// 数量显示前缀
const getQuantityPrefix = (row) => {
  const type = row.transactionType;
  const quantity = parseFloat(row.quantity || 0);

  // 入库类型显示"+"（包括撤销出库）
  if (type === 'inbound' || type === 'outsourced_inbound' || type === 'purchase_inbound' ||
      type === 'sales_return' || type === '销售退货' || type === 'purchase_return' || type === '采购退货' ||
      type === 'sales_exchange_return' || type === '销售换退' ||
      type === 'adjustment_in' || type === '调整入库' ||
      type === 'outbound_cancel' || type === '撤销出库') {
    return quantity >= 0 ? '+' : '';
  }

  // 出库类型：如果数量已经是负数，不需要额外的"-"前缀
  if (type === 'outbound' || type === 'outsourced_outbound' || type === 'sales_outbound' ||
      type === '销售出库' || type === 'sales_exchange_out' || type === '销售换出' ||
      type === 'adjustment_out' || type === '调整出库') {
    return quantity >= 0 ? '-' : '';  // 只有当数量为正数时才加"-"前缀
  }

  // 调拨和其他类型，根据数量正负决定显示前缀
  if (quantity > 0) return '+';
  if (quantity < 0) return '';  // 负数不需要前缀，因为已经有负号

  return '';
}

// 打开交易详情
const showTransactionDetail = (row) => {
  // 使用服务器提供的变动前后数量数据
  if (row.beforeQuantity !== undefined && row.afterQuantity !== undefined) {
    currentTransaction.value = row
    detailDialogVisible.value = true
    return
  }
  
  // 如果没有变动前后数量数据，设置默认值
  const rowQuantity = parseFloat(row.quantity || 0)
  const absQuantity = Math.abs(rowQuantity)
  
  // 设置默认值
  if (row.transactionType === 'inbound' || row.transactionType === 'outsourced_inbound') {
    row.beforeQuantity = 0
    row.afterQuantity = absQuantity
  } else if (row.transactionType === 'outbound' || row.transactionType === 'outsourced_outbound') {
    row.beforeQuantity = absQuantity
    row.afterQuantity = 0
  } else {
    // 对于其他类型，假设变动前为0
    row.beforeQuantity = 0
    row.afterQuantity = rowQuantity // 可能是正数或负数
  }
  
  currentTransaction.value = row
  detailDialogVisible.value = true
}

// 格式化数字
// formatNumber 已统一引用公共实现

// 格式化货币
// formatCurrency 已统一引用公共实现

// 格式化日期时间
// formatDateTime 已统一引用公共实现

// 分页处理
const handleSizeChange = (val) => {
  if (pagination) {
    pagination.pageSize = val
    fetchTransactionList()
  }
}

const handleCurrentChange = (val) => {
  if (pagination) {
    pagination.currentPage = val
    fetchTransactionList()
  }
}

// 初始化所有响应式数据
const initializeData = () => {
  // 确保分页参数有默认值
  if (pagination) {
    pagination.currentPage = 1
    pagination.pageSize = 10
    pagination.total = 0
  }

  // 确保统计数据有默认值
  if (statistics.value) {
    statistics.value = {
      totalTransactions: 0,
      inboundCount: 0,
      outboundCount: 0,
      transferCount: 0,
      checkCount: 0,
      totalAmount: 0,
      totalQuantity: 0,
      uniqueOperators: 0
    }
  }

  // 确保搜索表单有默认值
  if (searchForm.value) {
    searchForm.value = {
      dateRange: [
        dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
        dayjs().format('YYYY-MM-DD')
      ],
      materialName: '',
      transactionType: '',
      locationId: ''
    }
  }

  // 确保其他数据有默认值
  transactionList.value = []
  locationOptions.value = []
  currentTransaction.value = {}
  detailDialogVisible.value = false
  loading.value = false
  activeTab.value = 'list'
}

// 初始化
onMounted(() => {
  // 初始化所有数据
  initializeData()

  fetchBaseData()
  fetchTransactionList()

  // 监听窗口大小变化
  window.addEventListener('resize', handleResize)
})

// 组件销毁时清理
onUnmounted(() => {
  // 移除窗口大小变化监听器
  window.removeEventListener('resize', handleResize)

  // 清理图表实例
  if (typeChart) {
    typeChart.dispose()
    typeChart = null
  }
  if (amountChart) {
    amountChart.dispose()
    amountChart = null
  }
  if (trendChart) {
    trendChart.dispose()
    trendChart = null
  }
})

// 添加点击行事件
const handleRowClick = (row) => {
  showTransactionDetail(row)
}

// 安全性：HTML内容清理函数
const sanitizeHtml = (html) => {
  if (!html) return ''
  // 简单的HTML清理，移除潜在的XSS攻击代码
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
             .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
             .replace(/javascript:/gi, '')
             .replace(/on\w+\s*=/gi, '')
}
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

.search-form {
  display: flex;
  flex-wrap: wrap;
}

/* 使用全局 common-styles.css 中的 .statistics-row 和 .stat-card */

.chart-container {
  padding: 15px 0;
}

.chart-row {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
}

.chart-card {
  flex: 1;
  min-height: 350px;
}

.chart-title {
  text-align: center;
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 16px;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.chart-title .el-icon {
  color: var(--color-primary);
}

.chart-box {
  height: 300px;
}

.full-width {
  width: 100%;
}

.increase-text {
  color: var(--color-success);
  font-weight: 600;
}

.decrease-text {
  color: var(--color-danger);
  font-weight: 600;
}

.el-table {
  cursor: pointer;
}

.el-table .el-button--link {
  padding: 2px 0;
}

.el-descriptions {
  margin: 20px 0;
}

.el-descriptions-item__label {
  width: 120px;
  background-color: var(--color-bg-hover);
}

.el-descriptions-item__content {
  padding: 12px 15px;
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