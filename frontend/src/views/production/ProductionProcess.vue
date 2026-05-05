<!--
/**
 * ProductionProcess.vue
 * @description 生产过程管理页面
 * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="production-process-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>生产过程管理</h2>
          <p class="subtitle">管理生产工序与进度</p>
        </div>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="查询">
          <el-input
            v-model="searchForm.keyword"
            placeholder="请输入"
            clearable

          />
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"

            clearable
          />
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="searchForm.manager" placeholder="请选择" clearable @change="handleManagerChange">
            <el-option
              v-for="item in managers"
              :key="item"
              :label="item"
              :value="item"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="handleRefresh" style="margin-left: 12px;">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.total || 0 }}</div>
        <div class="stat-label">任务总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.pending || 0 }}</div>
        <div class="stat-label">未开始</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.preparing || 0 }}</div>
        <div class="stat-label">配料中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.material_issued || 0 }}</div>
        <div class="stat-label">已发料</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.in_progress || 0 }}</div>
        <div class="stat-label">生产中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.completed || 0 }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
    </div>
    
    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="taskList"
        border
        style="width: 100%"
        v-loading="loading"
        :fit="true"
        row-key="id"
        :expand-row-keys="expandedRowKeys"
        @expand-change="handleExpandChange"
      >
        <!-- 展开详情列 -->
        <el-table-column type="expand" width="50">
          <template #default="props">
            <div class="process-detail">
              <h4>工序列表</h4>
              <el-table :data="props.row.processes" border>
                <el-table-column prop="processName" label="工序名称" width="150" />
                <el-table-column label="实际开始时间" width="200">
                  <template #default="scope">
                    {{ formatDateTime(scope.row.actualStartTime || scope.row.actual_start_time) }}
                  </template>
                </el-table-column>
                <el-table-column label="实际结束时间" width="200">
                  <template #default="scope">
                    {{ formatDateTime(scope.row.actualEndTime || scope.row.actual_end_time) }}
                  </template>
                </el-table-column>
                <el-table-column label="进度" width="600">
                  <template #default="scope">
                    <el-progress :percentage="scope.row.progress" :status="getProgressStatus(scope.row.progress)"></el-progress>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="100">
                  <template #default="scope">
                    <el-tag :type="getStatusType(scope.row.status)">
                      {{ getStatusText(scope.row.status) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" min-width="220" fixed="right">
                  <template #default="scope">
                    <el-button
                      v-if="scope.row.status === 'pending'"
                      size="small"
                      type="success"
                      @click="handleQuickStart(scope.row)"
                      v-permission="'production:process:update'"
                    >
                      开始
                    </el-button>
                    <el-button
                      v-if="scope.row.status === 'in_progress' || scope.row.status === 'inProgress'"
                      size="small"
                      type="success"
                      @click="handleQuickComplete(scope.row)"
                      v-permission="'production:process:update'"
                    >
                      完成
                    </el-button>
                    <el-button
                      size="small"
                      type="primary"
                      @click="showUpdateModal(scope.row)"
                      v-permission="'production:process:update'"
                    >
                      更新
                    </el-button>
                    <el-button
                      size="small"
                      :type="hasInstructionDocs(props.row) ? 'success' : 'info'"
                      :plain="!hasInstructionDocs(props.row)"
                      @click="viewInstructionDocs(scope.row, props.row)"
                      v-permission="'production:process:view'"
                    >
                      查看指导书
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        
        <!-- 主表格内容 -->
        <el-table-column prop="code" label="任务编号" min-width="140" />
        <el-table-column prop="productCode" label="物料编码" min-width="140" />
        <el-table-column prop="productName" label="产品名称" min-width="180" />
        <el-table-column label="关联单据" min-width="140">
          <template #default="scope">
            <template v-if="scope.row.plan_code">
              {{ scope.row.plan_code }}
            </template>
            <span v-else>无关联计划</span>
          </template>
        </el-table-column>
        <el-table-column label="生产数量" min-width="90">
          <template #default="scope">
            {{ formatQuantity(scope.row.quantity) }}
          </template>
        </el-table-column>
        <el-table-column label="开始日期" min-width="120">
          <template #default="scope">
            {{ formatDate(scope.row.start_date) }}
          </template>
        </el-table-column>
        <el-table-column label="预计结束日期" min-width="120">
          <template #default="scope">
            {{ formatDate(scope.row.expected_end_date) }}
          </template>
        </el-table-column>
        <el-table-column label="倒计时" min-width="110">
          <template #default="scope">
            <span
              class="countdown-text"
              :style="{ color: getCountdownColor(scope.row.expected_end_date, scope.row.status) }"
            >
              {{ getCountdown(scope.row.expected_end_date, scope.row.status) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="manager" label="负责人" min-width="100" />
        <el-table-column label="状态" min-width="110">
          <template #default="scope">
            <el-tag 
              :type="getTaskStatusType(scope.row.status)"
              :class="getTaskStatusClass(scope.row.status)"
            >
              {{ getTaskStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="220" fixed="right">
          <template #default="scope">
            <el-button
              v-if="scope.row.status === 'material_issued' || scope.row.status === 'material_partial_issued'"
              size="small"
              type="success"
              @click="handleStartTask(scope.row)"
              v-permission="'production:process:update'"
            >
              开始
            </el-button>
            <el-button
              v-if="scope.row.status === 'in_progress'"
              size="small"
              type="primary"
              @click="handleCompleteTask(scope.row)"
              v-permission="'production:process:update'"
            >
              完工
            </el-button>
            <el-button
              v-if="scope.row.status === 'in_progress'"
              size="small"
              type="danger"
              plain
              @click="handleApplyParts(scope.row)"
              v-permission="'production:process:update'"
            >
              补料
            </el-button>
            <el-button
              v-if="canReturnMaterial(scope.row)"
              size="small"
              type="warning"
              @click="handleReturnMaterial(scope.row)"
              v-permission="'production:process:update'"
            >
              退料
            </el-button>
            <el-button
              size="small"
              :type="hasInstructionDocs(scope.row) ? 'warning' : 'info'"
              :plain="!hasInstructionDocs(scope.row)"
              @click="viewTaskInstructionDocs(scope.row)"
              v-permission="'production:process:view'"
            >
              指导书
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="currentPage"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pageSize"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(total, 1)"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 查看单个工序作业指导书对话框 -->
    <el-dialog
      v-model="instructionDocsVisible"
      :title="`${currentProcessName} - 作业指导书`"
      width="600px"
    >
      <div v-loading="instructionDocsLoading">
      <div v-if="currentInstructionDocs.length > 0">
        <el-table :data="currentInstructionDocs" border style="width: 100%">
          <el-table-column prop="name" label="文件名称" min-width="200" />
          <el-table-column label="上传时间" width="180">
            <template #default="scope">
              {{ scope.row.uploadTime ? dayjs(scope.row.uploadTime).format('YYYY-MM-DD HH:mm') : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="scope">
              <el-button size="small" type="primary" @click="openInstructionDoc(scope.row)">
                查看
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <el-empty v-else description="暂无作业指导书" />
      </div>
      <template #footer>
        <el-button @click="instructionDocsVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 查看任务所有工序作业指导书对话框 -->
    <el-dialog
      v-model="allInstructionDocsVisible"
      title="作业指导书"
      width="700px"
    >
      <div v-loading="allInstructionDocsLoading">
      <div v-if="allProcessInstructionDocs.length > 0">
        <el-table :data="allProcessInstructionDocs" border style="width: 100%">
          <el-table-column prop="processName" label="工序名称" width="120" />
          <el-table-column prop="name" label="文件名称" min-width="200" />
          <el-table-column label="上传时间" width="180">
            <template #default="scope">
              {{ scope.row.uploadTime ? dayjs(scope.row.uploadTime).format('YYYY-MM-DD HH:mm') : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="scope">
              <el-button size="small" type="primary" @click="openInstructionDoc(scope.row)">
                查看
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <el-empty v-else description="暂无作业指导书" />
      </div>
      <template #footer>
        <el-button @click="allInstructionDocsVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 文件预览对话框 -->
    <el-dialog
      v-model="previewVisible"
      :title="previewFileName"
      :width="isPreviewFullScreen ? '100%' : '90%'"
      :top="isPreviewFullScreen ? '0' : '5vh'"
      :close-on-click-modal="false"
      :fullscreen="isPreviewFullScreen"
      destroy-on-close
      class="preview-dialog"
    >
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span>{{ previewFileName }}</span>
          <el-button
            :icon="isPreviewFullScreen ? 'Close' : 'FullScreen'"
            circle
            @click="togglePreviewFullScreen"
            :title="isPreviewFullScreen ? '退出全屏' : '全屏显示'"
          />
        </div>
      </template>

      <div :style="{ height: isPreviewFullScreen ? 'calc(100vh - 120px)' : '80vh', width: '100%', position: 'relative' }">
        <!-- Word文档预览 -->
        <VueOfficeDocx
          v-if="previewFileType === '.docx' || previewFileType === '.doc'"
          :src="previewFileUrl"
          style="height: 100%;"
          @rendered="handleDocRendered"
          @error="handleDocError"
        />

        <!-- Excel文档预览 -->
        <VueOfficeExcel
          v-else-if="previewFileType === '.xlsx' || previewFileType === '.xls'"
          :src="previewFileUrl"
          style="height: 100%;"
          @rendered="handleDocRendered"
          @error="handleDocError"
        />

        <!-- 其他文件类型使用iframe -->
        <iframe
          v-else
          :src="previewFileUrl"
          style="width: 100%; height: 100%; border: none;"
          frameborder="0"
        ></iframe>
      </div>

      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
        <el-button type="primary" @click="downloadFile">下载文件</el-button>
      </template>
    </el-dialog>

    <!-- 更新进度弹窗 -->
    <el-dialog
      v-model="modalVisible"
      title="更新生产进度"
      width="600px"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-width="120px"
      >
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="工序名称" prop="processName">
              <el-input v-model="formData.processName" disabled />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="当前状态" prop="status">
              <el-select v-model="formData.status" placeholder="请选择状态" style="width: 100%">
                <el-option label="未开始" value="pending" v-if="formData.progress === 0" />
                <el-option label="生产中" value="in_progress" v-if="formData.progress < 100" />
                <el-option label="已完成" value="completed" v-if="formData.progress === 100" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="进度" prop="progress">
              <el-slider
                v-model="formData.progress"
                :min="0"
                :max="100"
                :step="5"
                show-input
                :disabled="formData.status === 'completed'"
              />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20" v-if="!formData.actualStartTime">
          <el-col :span="24">
            <el-form-item label="实际开始时间" prop="actualStartTime">
              <el-date-picker
                v-model="formData.actualStartTime"
                type="datetime"
                placeholder="选择实际开始时间"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20" v-if="formData.status === 'completed'">
          <el-col :span="24">
            <el-form-item label="实际结束时间" prop="actualEndTime">
              <el-date-picker
                v-model="formData.actualEndTime"
                type="datetime"
                placeholder="选择实际结束时间"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="备注" prop="remarks">
              <el-input
                v-model="formData.remarks"
                type="textarea"
                placeholder="请输入备注信息"
                :rows="4"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="modalVisible = false">取消</el-button>
          <el-button type="primary" @click="handleModalOk">确定</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 完工登记对话框 -->
    <el-dialog
      v-model="completionDialogVisible"
      title="完工登记"
      width="500px"
      destroy-on-close
    >
      <el-form :model="completionForm" label-width="120px">
        <el-form-item label="任务编号">
          <el-input v-model="completionForm.taskCode" disabled />
        </el-form-item>
        <el-form-item label="产品名称">
          <el-input v-model="completionForm.productName" disabled />
        </el-form-item>
        <el-form-item label="订单数量">
          <el-input :value="completionForm.totalQuantity" disabled />
        </el-form-item>
        <el-form-item label="已完工数量">
          <el-input :value="completionForm.completedQuantity" disabled />
        </el-form-item>
        <el-form-item label="剩余数量">
          <el-input :value="remainingQuantity" disabled />
        </el-form-item>
        <el-form-item label="本次完工数量" required>
          <el-input-number 
            v-model="completionForm.quantity" 
            :min="1" 
            :max="remainingQuantity"
            :precision="0"

          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input 
            v-model="completionForm.remark" 
            type="textarea" 
            :rows="2"
            placeholder="可选，如：急单先完工100件"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="completionDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitCompletion" :loading="submittingCompletion">
            确认完工
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 补料申请对话框 -->
    <el-dialog
      v-model="applyPartsVisible"
      title="零部件补料申请"
      width="600px"
      destroy-on-close
    >
      <el-form :model="applyPartsForm" :rules="applyPartsRules" ref="applyPartsFormRef" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="任务编号">
              <el-input v-model="applyPartsForm.taskCode" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品名称">
              <el-input v-model="applyPartsForm.productName" disabled />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item label="补料物料" prop="materialId">
          <!-- 替换为 BOM 表格选择 -->
          <div class="bom-selection-area" v-if="bomList.length > 0">
            <p class="bom-tip">请从BOM清单中选择，或搜索其他物料：</p>
            <el-table 
              :data="bomList" 
              border 
              size="small" 
              highlight-current-row
              @current-change="handleBomSelect"
              v-loading="bomLoading"
              style="margin-bottom: 10px; max-height: 200px; overflow-y: auto;"
            >
              <el-table-column prop="material_code" label="编码" width="120" />
              <el-table-column prop="material_name" label="名称" min-width="120" />
              <el-table-column prop="material_specs" label="规格" width="100" show-overflow-tooltip />
              <el-table-column prop="stock_quantity" label="库存" width="80">
                <template #default="{ row }">{{ Number(row.stock_quantity) }}</template>
              </el-table-column>
            </el-table>
          </div>

          <el-select
            v-model="applyPartsForm.materialId"
            filterable
            remote
            reserve-keyword
            placeholder="搜索物料（如不在BOM中）"
            :remote-method="searchMaterials"
            :loading="materialLoading"
            style="width: 100%"
            @change="handleMaterialChange"
          >
            <el-option
              v-for="item in materialOptions"
              :key="item.id"
              :label="item.label"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="补料数量" prop="quantity">
              <el-input-number 
                v-model="applyPartsForm.quantity" 
                :min="0.01" 
                :precision="2" 
                style="width: 100%" 
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位">
              <el-input v-model="applyPartsForm.unitName" disabled placeholder="自动获取" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="补料原因" prop="reason">
          <el-select v-model="applyPartsForm.reason" placeholder="请选择原因" style="width: 100%" allow-create filterable>
            <el-option
              v-for="item in supplementReasonOptions"
              :key="item.id"
              :label="item.reason_name"
              :value="item.reason_name"
            />
          </el-select>
        </el-form-item>

        <!-- ✅ 来料不良时：纯提示，无需操作 -->
        <el-alert
          v-if="isDefectiveReason"
          title="系统将自动生成不良退回入库单，退回至隔离区仓库"
          type="success"
          :closable="false"
          show-icon
          style="margin-bottom: 12px;"
        />

        <el-form-item label="详细说明">
          <el-input 
            v-model="applyPartsForm.remark" 
            type="textarea" 
            :rows="2" 
            placeholder="请详细描述补料原因" 
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="applyPartsVisible = false" size="large">取消</el-button>
          <el-button type="primary" @click="submitApplyParts" :loading="submittingApply" size="large">
            提交申请
          </el-button>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { defineAsyncComponent, ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { formatDate, formatDateTime } from '@/utils/helpers/dateUtils'
// 格式化数量：去除尾零，整数不显示小数点
const formatQuantity = (val) => {
  if (val === null || val === undefined || val === '') return '-'
  const num = Number(val)
  if (isNaN(num)) return val
  return num % 1 === 0 ? num.toFixed(0) : parseFloat(num.toFixed(2)).toString()
}
import axios from '@/services/api'
import { baseDataApi } from '@/services/api'
import { parseListData } from '@/utils/responseParser'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()

// 权限store
const authStore = useAuthStore()

// 导入样式
import '@vue-office/docx/lib/index.css'
import '@vue-office/excel/lib/index.css'

const VueOfficeDocx = defineAsyncComponent(() => import('@vue-office/docx'))
const VueOfficeExcel = defineAsyncComponent(() => import('@vue-office/excel'))

// 数据定义
const loading = ref(false)
const taskList = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const expandedRowKeys = ref([])

// 处理展开行变化
const handleExpandChange = (row, expandedRows) => {
  expandedRowKeys.value = expandedRows.map(item => item.id)
}

// 搜索表单
const searchForm = ref({
  keyword: '',  // 合并的搜索关键词（任务编号/产品名称/产品编码）
  manager: '',
  dateRange: []  // 时间范围
})

// 负责人列表
const managers = ref([])

// 统计数据
const taskStats = ref({
  total: 0,
  pending: 0,
  preparing: 0,
  material_issued: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0
})

// 表单相关
const modalVisible = ref(false)
const formRef = ref()
const formData = ref({
  id: '',
  processName: '',
  status: '',
  progress: 0,
  actualStartTime: null,
  actualEndTime: null,
  remarks: ''
})

const rules = {
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  progress: [{ required: true, message: '请设置进度', trigger: 'change' }],
  actualStartTime: [{ required: true, message: '请选择实际开始时间', trigger: 'change' }]
}

// 完工对话框相关
const completionDialogVisible = ref(false)
const submittingCompletion = ref(false)
const completionForm = ref({
  taskId: null,
  taskCode: '',
  productName: '',
  totalQuantity: 0,
  completedQuantity: 0,
  quantity: 0,
  remark: ''
})

const remainingQuantity = computed(() => (
  Number(completionForm.value.totalQuantity || 0) - Number(completionForm.value.completedQuantity || 0)
))

// 补料申请相关逻辑
const applyPartsVisible = ref(false)
const submittingApply = ref(false)
const materialLoading = ref(false)
const materialOptions = ref([])
const applyPartsFormRef = ref()
const applyPartsForm = ref({
  taskId: null,
  taskCode: '',
  productName: '',
  materialId: null,
  quantity: 1,
  unitId: null,
  unitName: '',
  reason: '',
  remark: '',
  returnDefective: true,
  returnLocationId: null // 隔离区仓库ID
})

// 计算属性：是否是来料不良原因
const isDefectiveReason = computed(() => {
  const reason = applyPartsForm.value.reason
  return reason && reason.includes('来料不良')
})

// 仓库列表
const warehouseList = ref([])

// 加载仓库列表并通过仓库类型变量自动匹配隔离区
const fetchWarehouseList = async () => {
  try {
    const res = await axios.get('/baseData/locations', { params: { page: 1, pageSize: 200 } })
    // axios 拦截器已解包，res.data 直接是业务数据
    const rawData = res.data
    let items = []
    if (Array.isArray(rawData)) {
      items = rawData
    } else if (rawData && rawData.list) {
      items = rawData.list
    } else if (rawData && rawData.items) {
      items = rawData.items
    } else if (rawData && rawData.rows) {
      items = rawData.rows
    }
    warehouseList.value = items
    
    // 通过仓库类型变量精确匹配
    const quarantine = items.find(w => w.type === 'quarantine')
    if (quarantine) {
      applyPartsForm.value.returnLocationId = quarantine.id
    } else {
      applyPartsForm.value.returnLocationId = ''
    }
  } catch {
    applyPartsForm.value.returnLocationId = ''
    ElMessage.warning('仓库列表加载失败，请手动选择退回库位')
  }
}

const applyPartsRules = {
  materialId: [{ required: true, message: '请选择物料', trigger: 'change' }],
  quantity: [{ required: true, message: '请输入数量', trigger: 'blur' }],
  reason: [{ required: true, message: '请选择或输入原因', trigger: 'change' }]
}

// BOM 数据
const bomList = ref([])
const bomLoading = ref(false)

// 打开补料对话框
const handleApplyParts = async (row) => {
  applyPartsForm.value = {
    taskId: row.id,
    taskCode: row.code,
    productName: row.productName,
    materialId: null,
    quantity: 1,
    unitId: null,
    unitName: '',
    reason: '',
    remark: '',
    returnDefective: true,
    returnLocationId: null
  }
  materialOptions.value = []
  applyPartsVisible.value = true
  
  // 加载该任务的BOM清单
  await fetchTaskBom(row.id)
  // 加载仓库列表（用于选择隔离区仓库）
  await fetchWarehouseList()
}

// 补料原因列表
const supplementReasonOptions = ref([])

// 获取补料原因
const fetchSupplementReasons = async () => {
    try {
        const res = await axios.get('/finance-enhancement/cost/supplement-reasons')
        if (res.data) {
            supplementReasonOptions.value = Array.isArray(res.data) ? res.data : (res.data.data || []);
        }
    } catch (error) {
        console.error('获取补料原因失败', error)
    }
}

onMounted(() => {
    fetchSupplementReasons()
})

// 获取任务BOM
const fetchTaskBom = async (taskId) => {
  try {
    bomLoading.value = true
    bomList.value = []
    const res = await axios.get(`/production/tasks/${taskId}/bom`)
    if (res.data && res.data.data) {
      bomList.value = res.data.data
    } else if (Array.isArray(res.data)) {
      bomList.value = res.data
    }
  } catch (error) {
    console.error('获取BOM失败', error)
    // 不报错，只是列表为空
  } finally {
    bomLoading.value = false
  }
}

// 处理BOM表格选择
const handleBomSelect = (row) => {
  if (!row) return
  
  // 将选中的BOM项添加到下拉选项中，并选中
  const option = {
    id: row.material_id,
    label: `${row.material_code} - ${row.material_name} (${row.material_specs || '-'})`,
    unitId: row.unit_id,
    unitName: row.unit_name
  }
  
  // 检查是否已存在
  const exists = materialOptions.value.find(opts => opts.id === option.id)
  if (!exists) {
    materialOptions.value.push(option)
  }
  
  applyPartsForm.value.materialId = row.material_id
  applyPartsForm.value.unitId = row.unit_id
  applyPartsForm.value.unitName = row.unit_name
}

// 搜索物料
const searchMaterials = async (query) => {
  if (!query) {
    materialOptions.value = []
    return
  }
  
  try {
    materialLoading.value = true
    // 假设后端有 /materials/search 接口，或者使用通用列表接口过滤
    // 这里复用已知的 material 列表接口
    const res = await axios.get('/baseData/materials', {
      params: {
        page: 1,
        limit: 20,
        search: query,
        status: 1
      }
    })
    
    // 解析返回结构，兼容 paginated response
    const items = res.data?.items || res.data || []
    
    materialOptions.value = items.map(item => ({
      id: item.id,
      label: `${item.code} - ${item.name} (${item.specs || '-'})`,
      unitId: item.unit_id,
      unitName: item.unit_name
    }))
  } catch (error) {
    console.error('搜索物料失败', error)
  } finally {
    materialLoading.value = false
  }
}

// 选择物料后自动填充单位
const handleMaterialChange = (val) => {
  const selected = materialOptions.value.find(item => item.id === val)
  if (selected) {
    applyPartsForm.value.unitId = selected.unitId
    applyPartsForm.value.unitName = selected.unitName
  }
}

// 提交补料申请
const submitApplyParts = async () => {
  if (!applyPartsFormRef.value) return
  
  await applyPartsFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        submittingApply.value = true
        
        // 步骤1：生成补料出库单（新料发出）
        const payload = {
          outbound_date: dayjs().format('YYYY-MM-DD'),
          status: 'draft',
          outbound_type: 'supplement',
          production_task_id: applyPartsForm.value.taskId,
          force_excess: true,
          issue_reason: applyPartsForm.value.reason,
          remark: `【补料申请】${applyPartsForm.value.remark || applyPartsForm.value.reason}`,
          items: [
            {
              materialId: applyPartsForm.value.materialId,
              quantity: applyPartsForm.value.quantity,
              unitId: applyPartsForm.value.unitId,
              remark: applyPartsForm.value.remark
            }
          ]
        }
        
        await axios.post('/inventory/outbound', payload)
        
        let successMsg = '补料申请已提交，生成的出库单为草稿状态，请联系仓库审核。'
        
        // 步骤2：来料不良 → 自动生成不良退回入库单（直接退入隔离区）
        if (isDefectiveReason.value && applyPartsForm.value.returnLocationId) {
          try {
            const currentUser = authStore.user?.username || authStore.user?.real_name || 'system'
            
            const inboundPayload = {
              inbound_date: dayjs().format('YYYY-MM-DD'),
              location_id: applyPartsForm.value.returnLocationId,
              status: 'draft',
              operator: currentUser,
              inbound_type: 'defective_return',
              reference_type: 'production_task',
              reference_id: applyPartsForm.value.taskId,
              reference_no: applyPartsForm.value.taskCode,
              remark: `【不良退回】产线退回来料不良物料，关联补料申请。${applyPartsForm.value.remark || ''}`,
              items: [
                {
                  material_id: applyPartsForm.value.materialId,
                  quantity: applyPartsForm.value.quantity,
                  unit_id: applyPartsForm.value.unitId,
                  location_id: applyPartsForm.value.returnLocationId, // 明确把退回舱位传给明细，防止后端只查明细仓位时丢失
                  remark: `来料不良退回 - ${applyPartsForm.value.remark || '待质检处置'}`
                }
              ]
            }
            
            await axios.post('/inventory/inbound', inboundPayload)
            
            // 新流程：此步骤仅发起退回隔离区的入库单草稿，不越权直接生成 NCP
            // 等待库管确认收货后，由后端服务自动抛出进料检验单(IQA)，再由检验定性抛出 NCP。
            successMsg = '补料申请已提交！不良品收货通知已发送至入库管理，等待库管入库后将由品质部门处理。'
          } catch (returnError) {
            console.error('创建不良退回单失败:', returnError)
            successMsg = '补料出库单已生成，但退回单创建失败，请手动到入库管理创建。'
          }
        }
        
        ElMessage.success(successMsg)
        applyPartsVisible.value = false
      } catch (error) {
        console.error('补料申请提交失败:', error)
        console.error('后端返回:', error.response?.data)
        const backendMessage = error.response?.data?.message || error.response?.data?.error || error.message || '提交失败'
        ElMessage.error(backendMessage)
      } finally {
        submittingApply.value = false
      }
    }
  })
}

// 获取生产任务列表
const fetchTaskList = async () => {
  try {
    loading.value = true

    // 查询参数，只获取已发料、进行中和已完成的任务
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.value.keyword,  // 合并搜索关键词
      manager: searchForm.value.manager,
      // 只显示已发料及之后状态的任务（这些任务才有生产过程）
      // 使用数据库实际的状态值（下划线命名）
      statusList: 'material_issued,material_partial_issued,in_progress,inspection,warehousing,completed'
    }

    // 添加时间范围参数
    if (searchForm.value.dateRange && searchForm.value.dateRange.length === 2) {
      params.startDate = searchForm.value.dateRange[0]
      params.endDate = searchForm.value.dateRange[1]
    }

    const response = await axios.get('/production/tasks', { params })

    // 使用统一解析器处理数据
    const tasks = parseListData(response, { enableLog: false })

    // 确保每个任务都有processes数组
    taskList.value = tasks.map(task => ({
      ...task,
      processes: task.processes || []
    }))

    total.value = response.data?.total || tasks.length

    // 使用后端返回的统计数据（统一使用下划线命名）
    taskStats.value = response.data.statistics || {
      total: 0,
      pending: 0,
      preparing: 0,
      material_issued: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0
    }
  } catch (error) {
    console.error('获取生产任务列表失败:', error)
    ElMessage.error('获取生产任务列表失败')
  } finally {
    loading.value = false
  }
}

import { getProductionStatusColor } from '@/constants/systemConstants'

// 统一状态颜色（工序和任务共用）
const getStatusType = (status) => {
  return getProductionStatusColor(status)
}
// 任务状态颜色复用
const getTaskStatusType = getStatusType

// 工序状态文本
const getStatusText = (status) => {
  const statusMap = {
    pending: '待开始',
    in_progress: '生产中',
    completed: '已完成'
  }
  return statusMap[status] || status
}

// 任务状态自定义样式类 - 用于生产中/待检验的特殊颜色
const getTaskStatusClass = (status) => {
  // 生产中状态 - 深蓝色
  if (status === 'in_progress') {
    return 'status-in-progress'
  }
  // 待检验状态 - 紫色
  if (status === 'inspection') {
    return 'status-inspection'
  }
  return ''
}

// 任务状态文本（统一使用业务标准的下划线命名）
const getTaskStatusText = (status) => {
  const statusMap = {
    pending: '待开始',
    preparing: '配料中',
    material_issued: '已发料',
    material_partial_issued: '部分发料',
    in_progress: '生产中',
    inspection: '待检验',
    warehousing: '入库中',
    completed: '已完成'
  }
  return statusMap[status] || status
}

// 计算倒计时
const getCountdown = (expectedEndDate, status) => {
  // 如果任务已完成或已取消，不显示倒计时
  if (status === 'completed' || status === 'done' || status === 'cancelled' || status === 'cancel') {
    return '-'
  }

  if (!expectedEndDate) {
    return '-'
  }

  const now = new Date()
  const endDate = new Date(expectedEndDate)

  // 计算时间差（毫秒）
  const diff = endDate - now

  // 如果已经过期
  if (diff < 0) {
    const absDiff = Math.abs(diff)
    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (days > 0) {
      return `逾期${days}天`
    } else if (hours > 0) {
      return `逾期${hours}小时`
    } else {
      return '逾期'
    }
  }

  // 计算剩余天数和小时
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days > 0) {
    return `剩余${days}天`
  } else if (hours > 0) {
    return `剩余${hours}小时`
  } else {
    return '即将到期'
  }
}

// 获取倒计时颜色
const getCountdownColor = (expectedEndDate, status) => {
  // 如果任务已完成或已取消，使用灰色
  if (status === 'completed' || status === 'done' || status === 'cancelled' || status === 'cancel') {
    return '#909399'
  }

  if (!expectedEndDate) {
    return '#909399'
  }

  const now = new Date()
  const endDate = new Date(expectedEndDate)
  const diff = endDate - now

  // 已逾期 - 红色
  if (diff < 0) {
    return '#F56C6C'
  }

  // 计算剩余天数
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  // 剩余1天以内 - 橙色
  if (days < 1) {
    return '#E6A23C'
  }

  // 剩余3天以内 - 黄色
  if (days < 3) {
    return '#F59A23'
  }

  // 正常 - 绿色
  return '#67C23A'
}

// 获取负责人列表
const fetchManagers = async () => {
  try {
    const response = await axios.get('/production/tasks/managers')
    // 拦截器已解包，response.data 就是业务数据
    managers.value = response.data || []
  } catch (error) {
    console.error('获取负责人列表失败:', error)
    managers.value = []
  }
}

// 处理负责人选择变化
const handleManagerChange = () => {
  currentPage.value = 1
  fetchTaskList()
}

// 事件处理
const handleSearch = () => {
  currentPage.value = 1
  fetchTaskList()
}

const handleRefresh = () => {
  searchForm.value.keyword = ''
  searchForm.value.manager = ''
  searchForm.value.dateRange = []
  currentPage.value = 1
  fetchTaskList()
}

const handleSizeChange = (val) => {
  pageSize.value = val
  fetchTaskList()
}

const handleCurrentChange = (val) => {
  currentPage.value = val
  fetchTaskList()
}

const showUpdateModal = (record) => {
  formData.value = {
    id: record.id,
    processName: record.processName,
    status: record.status,
    progress: record.progress,
    actualStartTime: record.actualStartTime ? dayjs(record.actualStartTime).toDate() : null,
    actualEndTime: record.actualEndTime ? dayjs(record.actualEndTime).toDate() : null,
    remarks: ''
  }
  modalVisible.value = true
}

// 查看任务的作业指导书
const instructionDocsVisible = ref(false)
const instructionDocsLoading = ref(false)
const currentInstructionDocs = ref([])
const currentProcessName = ref('')

// 查看任务的所有工序指导书
const allProcessInstructionDocs = ref([])
const allInstructionDocsVisible = ref(false)
const allInstructionDocsLoading = ref(false)

/**
 * 公共函数：获取产品工序模板的工序列表
 * @param {Object} taskOrProcess - 包含 product_id 或 productId 的对象
 * @returns {Array|null} 工序列表，失败返回 null
 */
const fetchProcessTemplateProcesses = async (taskOrProcess) => {
  const productId = taskOrProcess.product_id || taskOrProcess.productId
  if (!productId) {
    ElMessage.warning('无法获取产品信息')
    return null
  }

  const response = await baseDataApi.getProcessTemplateByProductId(productId)
  if (response.data?.processes) {
    return response.data.processes
  }

  ElMessage.info('未找到工序模板信息')
  return null
}

/**
 * 从工序模板中提取作业指导书文件列表
 * @param {Object} process - 工序模板对象
 * @returns {Array} 指导书文件列表
 */
const extractInstructionDocs = (process) => {
  if (!process || !process.instruction_docs) return []
  return Array.isArray(process.instruction_docs) ? process.instruction_docs : []
}

// 查看单个工序的作业指导书
const viewInstructionDocs = async (process, task) => {
  instructionDocsVisible.value = true
  instructionDocsLoading.value = true
  currentProcessName.value = process.processName || process.process_name || ''
  currentInstructionDocs.value = []
  
  try {
    const processes = await fetchProcessTemplateProcesses(task)
    if (!processes) return

    const matchedProcess = processes.find(p => p.name === currentProcessName.value)
    const docs = extractInstructionDocs(matchedProcess)

    if (docs.length > 0) {
      currentInstructionDocs.value = docs
    } else {
      ElMessage.info('该工序暂无作业指导书')
    }
  } catch (error) {
    console.error('获取作业指导书失败:', error)
    ElMessage.info('该产品暂无作业指导书')
  } finally {
    instructionDocsLoading.value = false
  }
}

// 查看任务所有工序的作业指导书
const viewTaskInstructionDocs = async (task) => {
  try {
    loading.value = true

    const processes = await fetchProcessTemplateProcesses(task)
    if (!processes) return

    // 收集所有工序的作业指导书
    const allDocs = []
    processes.forEach(process => {
      const docs = extractInstructionDocs(process)
      docs.forEach(doc => {
        allDocs.push({ processName: process.name, ...doc })
      })
    })

    if (allDocs.length > 0) {
      allProcessInstructionDocs.value = allDocs
      allInstructionDocsVisible.value = true
    } else {
      ElMessage.info('该任务的工序暂无作业指导书')
    }
  } catch (error) {
    console.error('获取作业指导书失败:', error)
    ElMessage.info('该产品暂无作业指导书')
  } finally {
    loading.value = false
  }
}

// 快捷开始工序
const handleQuickStart = async (row) => {
  try {
    loading.value = true
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    await axios.put(`/production/processes/${row.id}`, {
      status: 'in_progress',
      actualStartTime: now,
      progress: 0
    })
    ElMessage.success('工序已开始')
    fetchTaskList()
  } catch (error) {
    console.error('开始工序失败:', error)
    ElMessage.error('操作失败: ' + (error.response?.data?.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// 快捷完成工序
const handleQuickComplete = async (row) => {
  try {
    loading.value = true
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    await axios.put(`/production/processes/${row.id}`, {
      status: 'completed',
      progress: 100,
      actualEndTime: now
    })
    ElMessage.success('工序已完成')
    fetchTaskList()
  } catch (error) {
    console.error('完成工序失败:', error)
    ElMessage.error('操作失败: ' + (error.response?.data?.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// 文件预览相关状态
const previewVisible = ref(false)
const previewFileUrl = ref('')
const previewFileName = ref('')
const previewFileType = ref('')
const isPreviewFullScreen = ref(false)
const originalFileUrl = ref('')

// 打开文件预览
const openInstructionDoc = (doc) => {
  if (doc && doc.url) {
    // 处理文件URL：如果是相对路径，添加API基础路径
    let fileUrl = doc.url
    if (!fileUrl.startsWith('http')) {
      fileUrl = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`
      const baseURL = import.meta.env.VITE_API_URL || ''
      fileUrl = `${baseURL}${fileUrl}`
    }

    originalFileUrl.value = fileUrl

    const fileName = doc.name || doc.url
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase()

    previewFileName.value = doc.name || '作业指导书'
    previewFileType.value = ext
    previewFileUrl.value = fileUrl
    previewVisible.value = true
  }
}

// 下载文件
const downloadFile = async () => {
  try {
    const fileUrl = originalFileUrl.value || previewFileUrl.value
    if (!fileUrl) return

    const response = await axios.get(fileUrl, {
      responseType: 'blob'
    })

    const blob = new Blob([response.data])
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = previewFileName.value
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    ElMessage.success('文件下载成功')
  } catch (error) {
    console.error('文件下载失败:', error)
    ElMessage.error('文件下载失败: ' + (error.response?.data?.message || error.message))
  }
}

// 文档渲染回调
const handleDocRendered = () => {
  // 文档渲染成功
}

const handleDocError = () => {
  ElMessage.error('文档加载失败，请尝试下载到本地查看')
}

// 切换预览全屏
const togglePreviewFullScreen = () => {
  isPreviewFullScreen.value = !isPreviewFullScreen.value
}

// 检查任务是否有作业指导书(简化判断,有产品ID就认为可能有)
const hasInstructionDocs = (task) => {
  return !!(task.product_id || task.productId)
}

const handleModalOk = async () => {
  try {
    await formRef.value.validate()
    
    // 检查状态和进度是否匹配
    if (formData.value.status === 'completed' && formData.value.progress !== 100) {
      ElMessage.warning('已完成状态下进度必须为100%')
      return
    }
    
    if (formData.value.status === 'pending' && formData.value.progress > 0) {
      ElMessage.warning('未开始状态下进度必须为0%')
      return
    }
    
    // 如果状态是已完成，但是没有设置实际结束时间，则使用当前时间
    if (formData.value.status === 'completed' && !formData.value.actualEndTime) {
      formData.value.actualEndTime = new Date()
    }
    
    const data = {
      status: formData.value.status,
      progress: formData.value.progress,
      actualStartTime: formData.value.actualStartTime ? dayjs(formData.value.actualStartTime).format('YYYY-MM-DD HH:mm:ss') : null,
      actualEndTime: formData.value.actualEndTime ? dayjs(formData.value.actualEndTime).format('YYYY-MM-DD HH:mm:ss') : null,
      remarks: formData.value.remarks
    }
    
    await axios.put(`/production/processes/${formData.value.id}`, data)
    ElMessage.success('进度更新成功')
    modalVisible.value = false
    fetchTaskList()
  } catch (error) {
    console.error('更新进度失败:', error)
    ElMessage.error('更新进度失败: ' + (error.response?.data?.message || error.message))
  }
}

// 监听进度变化自动更改状态（统一使用下划线命名）
watch(() => formData.value.progress, (newValue) => {
  if (newValue === 0) {
    formData.value.status = 'pending'
  } else if (newValue === 100) {
    formData.value.status = 'completed'
  } else {
    formData.value.status = 'in_progress'
  }
})

// 添加进度状态函数
const getProgressStatus = (progress) => {
  if (progress === 100) return 'success'
  if (progress > 50) return 'warning'
  return ''
}

// 开始任务
const handleStartTask = async (row) => {
  // 乐观更新：立即更新UI
  const originalStatus = row.status
  row.status = 'in_progress'

  try {
    // 异步更新后端，不阻塞UI
    const updatePromise = axios.put(`/production/tasks/${row.id}/status`, { status: 'in_progress' })

    // 显示成功消息
    ElMessage.success('任务已开始')

    // 等待后端响应
    await updatePromise

    // 后台刷新数据（不显示loading）
    fetchTaskList()
  } catch (error) {
    // 如果失败，回滚UI状态
    row.status = originalStatus
    console.error('开始任务失败:', error)
    ElMessage.error('开始任务失败: ' + (error.response?.data?.message || error.message))
  }
}

// 完工任务 - 打开完工对话框
const handleCompleteTask = (row) => {
  // 校验：必须完成所有工序才能完工
  if (row.processes && row.processes.length > 0) {
    // 检查是否有未完成的工序 (状态不是 completed 且不是 cancelled)
    const uncompletedProcesses = row.processes.filter(p => p.status !== 'completed' && p.status !== 'cancelled')
    
    if (uncompletedProcesses.length > 0) {
      ElMessage.warning(`存在 ${uncompletedProcesses.length} 个未完成的工序，请先完成所有工序后再进行任务完工。`)
      return
    }
  }

  // 初始化完工表单数据
  completionForm.value = {
    taskId: row.id,
    taskCode: row.code,
    productName: row.productName,
    totalQuantity: Number(row.quantity) || 0,
    completedQuantity: Number(row.completed_quantity) || 0,
    quantity: (Number(row.quantity) || 0) - (Number(row.completed_quantity) || 0), // 默认填入剩余数量
    remark: ''
  }
  completionDialogVisible.value = true
}

// 提交完工
const submitCompletion = async () => {
  if (completionForm.value.quantity <= 0) {
    ElMessage.warning('请输入有效的完工数量')
    return
  }
  
  if (completionForm.value.quantity > remainingQuantity.value) {
    ElMessage.warning('完工数量不能超过剩余数量')
    return
  }
  
  submittingCompletion.value = true
  
  try {
    // 调用后端完工API，传入本次完工数量
    await axios.post(`/production/tasks/${completionForm.value.taskId}/complete`, {
      quantity: completionForm.value.quantity,
      remark: completionForm.value.remark
    })
    
    const newCompleted = completionForm.value.completedQuantity + completionForm.value.quantity
    const isFullComplete = newCompleted >= completionForm.value.totalQuantity
    
    if (isFullComplete) {
      ElMessage.success('全部完工！任务已进入待检验状态')
    } else {
      ElMessage.success(`本次完工 ${completionForm.value.quantity} 件，累计完工 ${newCompleted} 件`)
    }
    
    completionDialogVisible.value = false
    fetchTaskList()
  } catch (error) {
    console.error('完工失败:', error)
    ElMessage.error('完工失败: ' + (error.response?.data?.message || error.message))
  } finally {
    submittingCompletion.value = false
  }
}

// 判断是否可以退料
const canReturnMaterial = (row) => {
  // 只有已完成的任务才可以退料
  return row.status === 'completed'
}

// 处理退料 - 跳转到入库页面
const handleReturnMaterial = (row) => {
  // 跳转到入库管理页面，并带上任务信息
  router.push({
    path: '/inventory/inbound',
    query: {
      action: 'return',
      taskId: row.id,
      taskCode: row.code
    }
  })
}

// 生命周期钩子
onMounted(() => {
  // 加载数据
  fetchTaskList()

  // 获取负责人列表
  fetchManagers()
})

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

/* 工序详情 */
.process-detail {
  padding: 20px;
  background-color: var(--el-fill-color-lighter);
}

.process-detail h4 {
  margin: 0 0 15px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 操作列按钮间距 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}

/* 倒计时样式 */
.countdown-text {
  font-weight: 600;
  font-size: 14px;
}

/* 对话框底部按钮 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 详情对话框长文本处理 */
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

/* 表格单元格不换行 */
:deep(.el-table__cell .cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 搜索表单不换行 */
.search-form {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
}

.search-form .el-form-item {
  flex-shrink: 0;
}

/* 自定义状态标签颜色 */
/* 生产中 - 深蓝色 */
.status-in-progress {
  --el-tag-bg-color: #1e40af !important;
  --el-tag-border-color: #1e40af !important;
  --el-tag-text-color: #ffffff !important;
  background-color: #1e40af !important;
  border-color: #1e40af !important;
  color: #ffffff !important;
}

/* 待检验 - 紫色 */
.status-inspection {
  --el-tag-bg-color: #7c3aed !important;
  --el-tag-border-color: #7c3aed !important;
  --el-tag-text-color: #ffffff !important;
  background-color: #7c3aed !important;
  border-color: #7c3aed !important;
  color: #ffffff !important;
}
</style>
