<template>
  <div class="batch-traceability">
    <el-card class="search-card">
      <template #header>
        <div class="card-header">
          <span>零部件批次追溯系统</span>
          <div class="actions">
            <el-button type="primary" @click="refreshData" :disabled="!hasData">
              <el-icon><Refresh /></el-icon> 刷新数据
            </el-button>
            <el-button type="success" @click="exportReport" :disabled="!hasData">
              <el-icon><Download /></el-icon> 导出报告
            </el-button>
          </div>
        </div>
      </template>

      <!-- 搜索区域 -->
      <div class="search-section">
        <el-form :model="searchForm" inline>
          <el-form-item label="物料编码">
            <el-input
              v-model="searchForm.materialCode"
              placeholder="请输入物料编码"

              clearable
            />
          </el-form-item>
          <el-form-item label="批次号">
            <el-input
              v-model="searchForm.batchNumber"
              placeholder="请输入批次号"

              clearable
            />
          </el-form-item>
          <el-form-item label="追溯方向">
            <el-select v-model="searchForm.direction">
              <el-option label="正向追溯" value="forward" />
              <el-option label="反向追溯" value="backward" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch" :loading="loading">
              <el-icon><Search /></el-icon> 查询追溯
            </el-button>
            <el-button @click="resetSearch">
              <el-icon><Refresh /></el-icon> 重置
            </el-button>
          </el-form-item>
        </el-form>

        <!-- 快速测试按钮 -->
        <div class="test-cases" style="margin-top: 10px;">
          <span style="color: var(--color-text-regular); font-size: 12px;">快速测试: </span>
          <el-button
            v-for="testCase in testCases"
            :key="testCase.code"
            size="small"
            type="primary"
            plain
            @click="loadTestCase(testCase)"
            style="margin-right: 8px; margin-bottom: 4px;"
          >
            {{ testCase.label }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 批次基本信息 -->
    <el-card v-if="batchInfo" class="batch-info-card" style="margin-top: 20px;">
      <template #header>
        <span>批次基本信息</span>
      </template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="物料编码">{{ batchInfo.material_code }}</el-descriptions-item>
        <el-descriptions-item label="物料名称">{{ batchInfo.material_name }}</el-descriptions-item>
        <el-descriptions-item label="批次号">{{ batchInfo.batch_number }}</el-descriptions-item>
        <el-descriptions-item label="当前库存">{{ batchInfo.current_quantity }} {{ batchInfo.unit }}</el-descriptions-item>
        <el-descriptions-item label="可用库存">{{ batchInfo.available_quantity }} {{ batchInfo.unit }}</el-descriptions-item>
        <el-descriptions-item label="预留库存">{{ batchInfo.reserved_quantity }} {{ batchInfo.unit }}</el-descriptions-item>
        <el-descriptions-item label="供应商">{{ batchInfo.supplier_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="入库时间">{{ formatDate(batchInfo.receipt_date) }}</el-descriptions-item>
        <el-descriptions-item label="有效期">{{ formatDate(batchInfo.expiry_date) || '-' }}</el-descriptions-item>
        <el-descriptions-item label="仓库位置">{{ batchInfo.warehouse_name }} - {{ batchInfo.location || '-' }}</el-descriptions-item>
        <el-descriptions-item label="单位成本">{{ batchInfo.unit_cost || 0 }} 元</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(batchInfo.status)">{{ getStatusText(batchInfo.status) }}</el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 追溯链路图表 -->
    <el-card v-if="traceabilityChain && traceabilityChain.length > 0" class="chain-card" style="margin-top: 20px;">
      <template #header>
        <span>{{ searchForm.direction === 'forward' ? '正向追溯链路' : '反向追溯链路' }}</span>
      </template>
      
      <!-- 链路流程图 -->
      <div class="chain-flow" style="margin-bottom: 20px;">
        <div class="flow-container">
          <div 
            v-for="(item, index) in traceabilityChain" 
            :key="index"
            class="flow-item"
            :style="{ marginLeft: (item.level * 40) + 'px' }"
          >
            <div class="flow-node">
              <div class="node-header">
                <el-tag :type="getRelationshipType(item.relationship_type)">
                  {{ getRelationshipText(item.relationship_type) }}
                </el-tag>
                <span class="process-type">{{ item.process_type || '-' }}</span>
              </div>
              <div class="node-content">
                <div class="batch-info">
                  <strong>{{ searchForm.direction === 'forward' ? item.child_batch.material_code : item.parent_batch.material_code }}</strong>
                  <span class="batch-number">批次: {{ searchForm.direction === 'forward' ? item.child_batch.batch_number : item.parent_batch.batch_number }}</span>
                </div>
                <div class="quantity-info">
                  <span>消耗: {{ item.consumed_quantity }}</span>
                  <span>产出: {{ item.produced_quantity }}</span>
                  <span>比例: {{ item.conversion_ratio }}</span>
                </div>
                <div class="reference-info">
                  <span>单据: {{ item.reference_no || '-' }}</span>
                  <span>时间: {{ formatDate(item.created_at) }}</span>
                </div>
              </div>
            </div>
            <div v-if="index < traceabilityChain.length - 1" class="flow-arrow">
              <el-icon><ArrowDown /></el-icon>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 流转历史 -->
    <el-card v-if="transactionHistory && transactionHistory.length > 0" class="history-card" style="margin-top: 20px;">
      <template #header>
        <span>批次流转历史</span>
      </template>
      <el-table :data="transactionHistory" stripe>
        <el-table-column prop="transaction_type" label="交易类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getTransactionType(row.transaction_type)">
              {{ getTransactionText(row.transaction_type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="transaction_no" label="单据号" width="150" />
        <el-table-column prop="quantity" label="数量" width="100" />
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column prop="before_quantity" label="变更前" width="100" />
        <el-table-column prop="after_quantity" label="变更后" width="100" />
        <el-table-column prop="operator" label="操作员" width="100" />
        <el-table-column prop="formatted_date" label="交易时间" width="160" />
        <el-table-column prop="remarks" label="备注" min-width="200" />
      </el-table>
    </el-card>

    <!-- FIFO出库预览 -->
    <el-card class="fifo-card" style="margin-top: 20px;">
      <template #header>
        <div class="card-header">
          <span>FIFO出库预览</span>
          <el-button type="primary" size="small" @click="showFIFODialog = true">
            <el-icon><View /></el-icon> 查看预览
          </el-button>
        </div>
      </template>
      <el-empty v-if="!fifoPreview" description="请先查询批次信息" />
    </el-card>

    <!-- FIFO出库预览对话框 -->
    <el-dialog
      v-model="showFIFODialog"
      title="FIFO出库预览"
      width="80%"
      :before-close="handleCloseFIFODialog"
    >
      <div class="fifo-preview-form">
        <el-form :model="fifoForm" inline>
          <el-form-item label="物料ID">
            <el-input v-model="fifoForm.materialId" placeholder="请输入物料ID" />
          </el-form-item>
          <el-form-item label="需要数量">
            <el-input v-model="fifoForm.requiredQuantity" placeholder="请输入需要数量" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="getFIFOPreview" :loading="fifoLoading">
              获取预览
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <div v-if="fifoPreview" class="fifo-preview-result">
        <el-descriptions :column="2" border style="margin-bottom: 20px;">
          <el-descriptions-item label="需要数量">{{ fifoPreview.required_quantity }}</el-descriptions-item>
          <el-descriptions-item label="可分配数量">{{ fifoPreview.total_allocated }}</el-descriptions-item>
          <el-descriptions-item label="缺少数量">{{ fifoPreview.shortage || 0 }}</el-descriptions-item>
          <el-descriptions-item label="总成本">{{ fifoPreview.total_cost.toFixed(2) }} 元</el-descriptions-item>
          <el-descriptions-item label="平均成本">{{ fifoPreview.weighted_avg_cost.toFixed(4) }} 元</el-descriptions-item>
          <el-descriptions-item label="是否可满足">
            <el-tag :type="fifoPreview.can_fulfill ? 'success' : 'danger'">
              {{ fifoPreview.can_fulfill ? '可满足' : '不可满足' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <el-table :data="fifoPreview.batch_details" stripe>
          <el-table-column prop="batch_number" label="批次号" width="150" />
          <el-table-column prop="allocated_quantity" label="分配数量" width="100" />
          <el-table-column prop="unit_cost" label="单位成本" width="100" />
          <el-table-column prop="total_cost" label="总成本" width="100" />
          <el-table-column prop="warehouse_name" label="仓库" width="120" />
          <el-table-column prop="location" label="库位" width="100" />
          <el-table-column prop="receipt_date" label="入库时间" width="160">
            <template #default="{ row }">
              {{ formatDate(row.receipt_date) }}
            </template>
          </el-table-column>
          <el-table-column prop="remaining_in_batch" label="批次剩余" width="100" />
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { formatDate } from '@/utils/helpers/dateUtils'

import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Download, View, ArrowDown } from '@element-plus/icons-vue'
import axios from 'axios'

export default {
  name: 'BatchTraceability',
  components: {
    Search,
    Refresh,
    Download,
    View,
    ArrowDown
  },
  setup() {
    // 响应式数据
    const loading = ref(false)
    const hasData = ref(false)
    const showFIFODialog = ref(false)
    const fifoLoading = ref(false)
    
    const searchForm = reactive({
      materialCode: '',
      batchNumber: '',
      direction: 'forward'
    })
    
    const fifoForm = reactive({
      materialId: '',
      requiredQuantity: ''
    })
    
    const batchInfo = ref(null)
    const traceabilityChain = ref([])
    const transactionHistory = ref([])
    const fifoPreview = ref(null)
    
    // 测试用例
    const testCases = ref([
      { code: 'SCR001', batch: 'SCR001240101001', label: '螺丝测试' },
      { code: 'PIN001', batch: 'PIN001240101001', label: '脚钉测试' },
      { code: 'PROD001', batch: 'PROD001240101001', label: '成品测试' }
    ])
    
    // 方法
    const handleSearch = async () => {
      if (!searchForm.materialCode || !searchForm.batchNumber) {
        ElMessage.warning('请输入物料编码和批次号')
        return
      }
      
      loading.value = true
      
      try {
        // 获取批次详细信息
        const batchResponse = await axios.get('/api/batch-traceability/batch/details', {
          params: {
            materialCode: searchForm.materialCode,
            batchNumber: searchForm.batchNumber
          }
        })

        // 拦截器已解包，response.data 就是业务数据
        if (batchResponse.data) {
          batchInfo.value = batchResponse.data.batch_info
          transactionHistory.value = batchResponse.data.transaction_history
        }

        // 获取追溯链路
        const chainResponse = await axios.get('/api/batch-traceability/chain', {
          params: {
            materialCode: searchForm.materialCode,
            batchNumber: searchForm.batchNumber,
            direction: searchForm.direction
          }
        })

        // 拦截器已解包，response.data 就是业务数据
        if (chainResponse.data) {
          traceabilityChain.value = chainResponse.data.traceability_chain
          hasData.value = true
        }

        ElMessage.success('查询成功')

      } catch (error) {
        console.error('查询失败:', error)
        ElMessage.error(error.response?.data?.message || '查询失败')
      } finally {
        loading.value = false
      }
    }

    const resetSearch = () => {
      searchForm.materialCode = ''
      searchForm.batchNumber = ''
      searchForm.direction = 'forward'
      batchInfo.value = null
      traceabilityChain.value = []
      transactionHistory.value = []
      fifoPreview.value = null
      hasData.value = false
    }

    const loadTestCase = (testCase) => {
      searchForm.materialCode = testCase.code
      searchForm.batchNumber = testCase.batch
      handleSearch()
    }

    const getFIFOPreview = async () => {
      if (!fifoForm.materialId || !fifoForm.requiredQuantity) {
        ElMessage.warning('请输入物料ID和需要数量')
        return
      }

      fifoLoading.value = true

      try {
        const response = await axios.get('/api/batch-traceability/fifo/preview', {
          params: {
            materialId: fifoForm.materialId,
            requiredQuantity: fifoForm.requiredQuantity
          }
        })

        // 拦截器已解包，response.data 就是业务数据
        if (response.data) {
          fifoPreview.value = response.data
          ElMessage.success('获取FIFO预览成功')
        }

      } catch (error) {
        console.error('获取FIFO预览失败:', error)
        ElMessage.error(error.response?.data?.message || '获取FIFO预览失败')
      } finally {
        fifoLoading.value = false
      }
    }
    
    const handleCloseFIFODialog = () => {
      showFIFODialog.value = false
      fifoForm.materialId = ''
      fifoForm.requiredQuantity = ''
      fifoPreview.value = null
    }
    
    const refreshData = () => {
      if (hasData.value) {
        handleSearch()
      }
    }
    
    const exportReport = async () => {
      if (!batchInfo.value) {
        ElMessage.warning('请先查询批次信息')
        return
      }
      
      try {
        const response = await axios.get('/api/batch-traceability/export/report', {
          params: {
            materialCode: searchForm.materialCode,
            batchNumber: searchForm.batchNumber,
            direction: searchForm.direction
          },
          responseType: 'blob'
        })
        
        // 创建下载链接
        const url = window.URL.createObjectURL(new Blob([response.data]))
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `批次追溯报告_${searchForm.batchNumber}_${new Date().getTime()}.xlsx`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        
        ElMessage.success('导出成功')
      } catch (error) {
        console.error('导出失败:', error)
        ElMessage.error(error.response?.data?.message || '导出失败')
      }
    }
    
    // 工具方法
    // formatDate 已统一引用公共实现
    
    const getStatusType = (status) => {
      const types = {
        'active': 'success',
        'reserved': 'warning',
        'locked': 'info',
        'expired': 'danger',
        'consumed': 'info'
      }
      return types[status] || 'info'
    }
    
    const getStatusText = (status) => {
      const texts = {
        'active': '正常',
        'reserved': '预留',
        'locked': '锁定',
        'expired': '过期',
        'consumed': '已消耗'
      }
      return texts[status] || status
    }
    
    const getRelationshipType = (type) => {
      const types = {
        'consume': 'warning',
        'produce': 'success',
        'transform': 'primary',
        'assemble': 'info'
      }
      return types[type] || 'info'
    }
    
    const getRelationshipText = (type) => {
      const texts = {
        'consume': '消耗',
        'produce': '生产',
        'transform': '转换',
        'assemble': '组装'
      }
      return texts[type] || type
    }
    
    const getTransactionType = (type) => {
      const types = {
        'in': 'success',
        'out': 'warning',
        'transfer': 'primary',
        'adjust': 'info',
        'reserve': 'warning',
        'unreserve': 'success'
      }
      return types[type] || 'info'
    }
    
    const getTransactionText = (type) => {
      const texts = {
        'in': '入库',
        'out': '出库',
        'transfer': '转移',
        'adjust': '调整',
        'reserve': '预留',
        'unreserve': '取消预留'
      }
      return texts[type] || type
    }
    
    return {
      loading,
      hasData,
      showFIFODialog,
      fifoLoading,
      searchForm,
      fifoForm,
      batchInfo,
      traceabilityChain,
      transactionHistory,
      fifoPreview,
      testCases,
      handleSearch,
      resetSearch,
      loadTestCase,
      getFIFOPreview,
      handleCloseFIFODialog,
      refreshData,
      exportReport,
      formatDate,
      getStatusType,
      getStatusText,
      getRelationshipType,
      getRelationshipText,
      getTransactionType,
      getTransactionText
    }
  }
}
</script>

<style scoped>
.batch-traceability {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-section {
  margin-bottom: var(--spacing-lg);
}

.test-cases {
  padding: 10px;
  background-color: var(--color-bg-hover);
  border-radius: var(--radius-sm);
}

.chain-flow {
  max-height: 600px;
  overflow-y: auto;
}

.flow-container {
  position: relative;
}

.flow-item {
  margin-bottom: var(--spacing-lg);
  position: relative;
}

.flow-node {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  padding: 15px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  max-width: 600px;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.process-type {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.node-content {
  font-size: 14px;
}

.batch-info {
  margin-bottom: 8px;
}

.batch-info strong {
  color: var(--color-text-primary);
  margin-right: 10px;
}

.batch-number {
  color: var(--color-text-regular);
  font-size: 12px;
}

.quantity-info {
  margin-bottom: 8px;
}

.quantity-info span {
  margin-right: 15px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.reference-info span {
  margin-right: 15px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.flow-arrow {
  text-align: center;
  color: var(--color-primary);
  font-size: 20px;
  margin: 10px 0;
}

.fifo-preview-form {
  margin-bottom: var(--spacing-lg);
  padding: 15px;
  background-color: var(--color-bg-hover);
  border-radius: var(--radius-sm);
}

.fifo-preview-result {
  margin-top: var(--spacing-lg);
}

.el-descriptions {
  margin-bottom: var(--spacing-lg);
}

.el-table {
  margin-top: 10px;
}

@media (max-width: 768px) {
  .batch-traceability {
    padding: 10px;
  }

  .flow-node {
    max-width: 100%;
  }

  .el-descriptions {
    :deep(.el-descriptions__body) {
      .el-descriptions__table {
        .el-descriptions__cell {
          padding: 8px;
        }
      }
    }
  }
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
