<!--
/**
 * ProductionProcess.vue
 * @description 生产过程管理页面
 * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page production-process-container">
    <PageHeader title="生产过程管理" subtitle="管理生产工序与进度" />

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      @search="handleSearch"
      @reset="handleRefresh"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input
            v-model="searchForm.keyword"
            placeholder="物料名称"
            clearable

          />
        </el-form-item>
      </template>
      <template #advanced>
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
      </template>
    </FinanceQueryCard>

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
        class="w-full"
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
                <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
                  <template #default="scope">
                    <el-button
                      v-if="scope.row.status === 'pending' && canStartProcess(props.row)"
                      size="small"
                      type="success"
                      @click="handleQuickStart(scope.row, props.row)"
                      v-permission="'production:process:update'"
                    >
                      开始
                    </el-button>
                    <el-button
                      v-if="scope.row.status === 'in_progress' && canCompleteProcess(props.row)"
                      size="small"
                      type="success"
                      @click="handleQuickComplete(scope.row, props.row)"
                      v-permission="'production:process:update'"
                    >
                      完成
                    </el-button>
                    <el-button
                      size="small"
                      type="primary"
                      @click="showUpdateModal(scope.row, props.row)"
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
              :class="getCountdownClass(scope.row.expected_end_date, scope.row.status)"
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
        <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
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
    <AppDialog
      v-model="instructionDocsVisible"
      :title="`${currentProcessName} - 作业指导书`"
      mode="view"
      content-width="wide"
    >
      <div v-loading="instructionDocsLoading">
      <div v-if="currentInstructionDocs.length > 0">
        <el-table :data="currentInstructionDocs" border class="w-full">
          <el-table-column prop="name" label="文件名称" min-width="200" />
          <el-table-column label="上传时间" width="180">
            <template #default="scope">
              {{ scope.row.uploadTime ? dayjs(scope.row.uploadTime).format('YYYY-MM-DD HH:mm') : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="100" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="scope">
              <el-button class="btn-op-view" size="small" type="primary" @click="openInstructionDoc(scope.row)">
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
    </AppDialog>

    <!-- 查看任务所有工序作业指导书对话框 -->
    <AppDialog
      v-model="allInstructionDocsVisible"
      title="作业指导书"
      mode="view"
      content-width="wide"
    >
      <div v-loading="allInstructionDocsLoading">
      <div v-if="allProcessInstructionDocs.length > 0">
        <el-table :data="allProcessInstructionDocs" border class="w-full">
          <el-table-column prop="processName" label="工序名称" width="120" />
          <el-table-column prop="name" label="文件名称" min-width="200" />
          <el-table-column label="上传时间" width="180">
            <template #default="scope">
              {{ scope.row.uploadTime ? dayjs(scope.row.uploadTime).format('YYYY-MM-DD HH:mm') : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="100" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="scope">
              <el-button class="btn-op-view" size="small" type="primary" @click="openInstructionDoc(scope.row)">
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
    </AppDialog>

    <!-- 文件预览对话框 -->
    <AppDialog
      v-model="previewVisible"
      mode="preview"
      :title="previewFileName"
      :close-on-click-modal="false"
    >
      <VueOfficeDocx
        v-if="previewFileType === '.docx' || previewFileType === '.doc'"
        :src="previewFileUrl"
        class="preview-fill"
        @rendered="handleDocRendered"
        @error="handleDocError"
      />
      <VueOfficeExcel
        v-else-if="previewFileType === '.xlsx' || previewFileType === '.xls'"
        :src="previewFileUrl"
        class="preview-fill"
        @rendered="handleDocRendered"
        @error="handleDocError"
      />
      <iframe
        v-else
        :src="previewFileUrl"
        class="iframe-full"
        frameborder="0"
      ></iframe>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
        <el-button type="primary" @click="downloadFile">下载文件</el-button>
      </template>
    </AppDialog>

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
              <el-select v-model="formData.status" placeholder="请选择状态" class="w-full">
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
                class="w-full"
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
                class="w-full"
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
              class="preview-scroll-box"
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
            class="w-full"
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
                class="w-full"
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
          <el-select v-model="applyPartsForm.reason" placeholder="请选择原因" class="w-full" allow-create filterable>
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
          class="mb-12"
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

    <!-- 退料对话框 -->
    <el-dialog
      v-model="returnMaterialVisible"
      title="生产退料"
      width="850px"
      destroy-on-close
    >
      <el-form :model="returnMaterialForm" :rules="returnMaterialRules" ref="returnMaterialFormRef" label-width="100px">
        <el-form-item label="任务编号">
          <el-input v-model="returnMaterialForm.taskCode" disabled />
        </el-form-item>
        <el-form-item label="产品名称">
          <el-input v-model="returnMaterialForm.productName" disabled />
        </el-form-item>

        <!-- BOM物料列表（勾选要退的物料） -->
        <el-form-item label="选择物料">
          <el-table
            v-if="returnBomList.length > 0"
            ref="returnBomTableRef"
            :data="returnBomList"
            size="small"
            max-height="250"
            @selection-change="handleReturnSelectionChange"
            class="w-full"
          >
            <el-table-column type="selection" width="40" />
            <el-table-column prop="material_code" label="编码" width="120" />
            <el-table-column prop="material_name" label="名称" min-width="120" />
            <el-table-column prop="material_specs" label="规格" width="100" />
            <el-table-column prop="unit_usage" label="BOM用量" width="80" />
            <el-table-column label="退料数量" width="120">
              <template #default="scope">
                <el-input-number
                  v-model="scope.row.returnQty"
                  :min="0"
                  :precision="2"
                  size="small"
                  controls-position="right"
                  class="w-full"
                />
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="该任务无BOM数据" :image-size="40" />
          <div v-if="returnItems.length > 0" class="return-hint">
            已选择 {{ returnItems.length }} 种物料退料
          </div>
        </el-form-item>

        <el-form-item label="备注">
          <el-input
            v-model="returnMaterialForm.remark"
            type="textarea"
            :rows="2"
            placeholder="退料原因说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="returnMaterialVisible = false" size="large">取消</el-button>
          <el-button type="primary" @click="submitReturnMaterial" :loading="submittingReturn" size="large">
            确认退料
          </el-button>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { defineAsyncComponent, ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import dayjs from 'dayjs'
import { formatDate, formatDateTime } from '@/utils/helpers/dateUtils'
// 格式化数量：去除尾零，整数不显示小数点
const formatQuantity = (val) => {
  if (val === null || val === undefined || val === '') return '-'
  const num = Number(val)
  if (isNaN(num)) return val
  return num % 1 === 0 ? num.toFixed(0) : parseFloat(num.toFixed(2)).toString()
}
import { baseDataApi, commonApi, financeApi, inventoryApi, productionApi } from '@/api'
import { parseListData } from '@/utils/responseParser'
import { useAuthStore } from '@/stores/auth'
import { buildResourceUrl } from '@/config/app'
// 权限store
const authStore = useAuthStore()
const router = useRouter()
const BATCH_MATERIAL_QUERY_LIMIT = 100
const chunkArray = (items, size) => {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

// 统一解析后端返回的业务警告并展示给用户
const showBusinessWarnings = (res) => {
  const data = res?.data || res
  if (data?.warnings && Array.isArray(data.warnings)) {
    data.warnings.forEach((msg, idx) => {
      setTimeout(() => {
        ElMessage.warning({ message: msg, duration: 10000, showClose: true })
      }, (idx + 1) * 600)
    })
  }
}

// 导入样式
import '@vue-office/docx/lib/v3/index.css'
import '@vue-office/excel/lib/v3/index.css'

const VueOfficeDocx = defineAsyncComponent(() => import('@vue-office/docx/lib/v3/index.js'))
const VueOfficeExcel = defineAsyncComponent(() => import('@vue-office/excel/lib/v3/index.js'))

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
  taskStatus: '',
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
    const res = await baseDataApi.getLocations({ page: 1, pageSize: 50 })
    // axios 拦截器已解包，res.data 直接是业务数据
    const items = parseListData(res, { enableLog: false })
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
        const res = await financeApi.cost.getSupplementReasons()
        supplementReasonOptions.value = parseListData(res, { enableLog: false })
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
    const res = await productionApi.getTaskBom(taskId)
    bomList.value = parseListData(res, { enableLog: false })
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
    const res = await baseDataApi.getMaterials({
      page: 1,
      limit: 20,
      search: query,
      status: 1
    })

    // 解析返回结构，兼容 paginated response
    const items = parseListData(res, { enableLog: false })

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

        await inventoryApi.createOutbound(payload)

        let successMsg = '补料申请已提交，生成的出库单为草稿状态，请联系仓库审核。'

        // 步骤2：来料不良 → 自动生成不良退回入库单（直接退入隔离区）
        if (isDefectiveReason.value && applyPartsForm.value.returnLocationId) {
          try {
            const currentUser = authStore.user?.username || authStore.user?.real_name || authStore.user?.name || ''
            if (!currentUser) {
              ElMessage.error('无法识别当前登录用户，请重新登录后再操作')
              return
            }

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

            await inventoryApi.createInbound(inboundPayload)

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

    const response = await productionApi.getProductionTasks(params)

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

// 倒计时语义 class（替代行内颜色）
const getCountdownClass = (expectedEndDate, status) => {
  if (status === 'completed' || status === 'done' || status === 'cancelled' || status === 'cancel') {
    return 'text-muted'
  }
  if (!expectedEndDate) return 'text-muted'

  const now = new Date()
  const endDate = new Date(expectedEndDate)
  const diff = endDate - now
  if (diff < 0) return 'text-danger'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days < 1) return 'text-warning'
  if (days < 3) return 'text-warning'
  return 'text-success'
}

// 获取负责人列表
const fetchManagers = async () => {
  try {
    const response = await productionApi.getTaskManagers()
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

const showUpdateModal = (record, task) => {
  formData.value = {
    id: record.id,
    processName: record.processName,
    status: record.status,
    progress: record.progress,
    taskStatus: task?.status || '',
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
const handleQuickStart = async (row, task) => {
  if (!canStartProcess(task)) {
    ElMessage.warning('任务必须先完成发料，才能开始工序')
    return
  }

  try {
    loading.value = true
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    await productionApi.updateProductionProcess(row.id, {
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
const handleQuickComplete = async (row, task) => {
  if (!canCompleteProcess(task)) {
    ElMessage.warning('任务必须处于生产中，才能完成工序')
    return
  }

  try {
    loading.value = true
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    const res = await productionApi.updateProductionProcess(row.id, {
      status: 'completed',
      progress: 100,
      actualEndTime: now
    })
    ElMessage.success('工序已完成')
    showBusinessWarnings(res)
    fetchTaskList()
  } catch (error) {
    console.error('完成工序失败:', error)
    await handleProcessUpdateError(error, '完成工序失败')
  } finally {
    loading.value = false
  }
}

/** 工序更新失败：优先展示后端业务提示，支持跳转检验单 */
const handleProcessUpdateError = async (error, fallback = '操作失败') => {
  const data = error?.response?.data || {}
  const message = data.message || error?.message || fallback
  const action = data.action
  const code = data.errorCode || data.code

  if (code === 'OPEN_INSPECTIONS' || action?.route) {
    try {
      await ElMessageBox.confirm(message, '无法完成工序', {
        type: 'warning',
        confirmButtonText: action?.buttonText || '去处理检验单',
        cancelButtonText: '关闭',
        distinguishCancelAndClose: true,
      })
      if (action?.route) {
        router.push(action.route)
      }
    } catch {
      // 用户关闭
    }
    return
  }

  ElMessage.error(message)
}

// 文件预览相关状态
const previewVisible = ref(false)
const previewFileUrl = ref('')
const previewFileName = ref('')
const previewFileType = ref('')
const originalFileUrl = ref('')

// 打开文件预览
const openInstructionDoc = (doc) => {
  if (doc && doc.url) {
    // 处理文件URL：如果是相对路径，添加API基础路径
    let fileUrl = doc.url
    if (!fileUrl.startsWith('http')) {
      fileUrl = buildResourceUrl(fileUrl)
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

    const response = await commonApi.downloadResource(fileUrl)

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

// 检查任务是否有作业指导书(简化判断,有产品ID就认为可能有)
const hasInstructionDocs = (task) => {
  return !!(task.product_id || task.productId)
}

const processStartableTaskStatuses = new Set(['material_issued', 'material_partial_issued', 'in_progress'])
const canStartProcess = (task) => processStartableTaskStatuses.has(task?.status)
const canCompleteProcess = (task) => task?.status === 'in_progress'

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

    if (formData.value.status === 'in_progress' && !processStartableTaskStatuses.has(formData.value.taskStatus)) {
      ElMessage.warning('任务必须先完成发料，才能开始工序')
      return
    }

    if (formData.value.status === 'completed' && formData.value.taskStatus !== 'in_progress') {
      ElMessage.warning('任务必须处于生产中，才能完成工序')
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

    const res = await productionApi.updateProductionProcess(formData.value.id, data)
    ElMessage.success('进度更新成功')
    modalVisible.value = false
    showBusinessWarnings(res)
    fetchTaskList()
  } catch (error) {
    console.error('更新进度失败:', error)
    await handleProcessUpdateError(error, '更新进度失败')
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
  try {
    loading.value = true
    await productionApi.updateProductionTaskStatus(row.id, { status: 'in_progress' })
    ElMessage.success('任务已开始')
    fetchTaskList()
  } catch (error) {
    console.error('开始任务失败:', error)
    ElMessage.error('开始任务失败: ' + (error.response?.data?.message || error.message))
  } finally {
    loading.value = false
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
    const res = await productionApi.completeTask(completionForm.value.taskId, {
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

    showBusinessWarnings(res)

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
  // 待检验、入库中、已完成状态的任务均可退料
  return ['inspection', 'warehousing', 'completed'].includes(row.status)
}

// ====== 退料相关状态 ======
const returnMaterialVisible = ref(false)
const submittingReturn = ref(false)
const returnMaterialFormRef = ref()
const returnBomTableRef = ref()
const returnBomList = ref([])
const returnItems = ref([])
const returnMaterialForm = ref({
  taskId: null,
  taskCode: '',
  productName: '',
  remark: ''
})
const returnMaterialRules = {}

// 处理退料 - 弹出退料对话框
const handleReturnMaterial = async (row) => {
  returnMaterialForm.value = {
    taskId: row.id,
    taskCode: row.code,
    productName: row.productName,
    remark: ''
  }
  returnItems.value = []
  returnBomList.value = []
  returnMaterialVisible.value = true

  try {
    const bomRes = await productionApi.getTaskBom(row.id)
    const list = parseListData(bomRes, { enableLog: false })
    returnBomList.value = list.map(item => ({ ...item, returnQty: 0 }))
  } catch (err) {
    console.error('加载BOM数据失败:', err)
  }
}

// BOM表格勾选变化
const handleReturnSelectionChange = (selection) => {
  returnItems.value = selection
}



// 提交退料（多物料）
const submitReturnMaterial = async () => {
  // 过滤出退料数量 > 0 的勾选项
  const validItems = returnItems.value.filter(item => item.returnQty > 0)

  if (validItems.length === 0) {
    ElMessage.warning('请勾选要退的物料并填写退料数量')
    return
  }

  try {
    submittingReturn.value = true
    const currentUser = authStore.user?.username || authStore.user?.real_name || authStore.user?.name || ''
    if (!currentUser) {
      ElMessage.error('无法识别当前登录用户，请重新登录后再操作')
      return
    }

    const materialLocations = {}
    let firstLocationId = null
    const materialIds = [...new Set(validItems.map(item => item.material_id).filter(Boolean))]
    try {
      const materials = []
      for (const chunk of chunkArray(materialIds, BATCH_MATERIAL_QUERY_LIMIT)) {
        const materialsRes = await baseDataApi.getMaterialsByIds(chunk)
        materials.push(...parseListData(materialsRes, { enableLog: false }))
      }
      const locationMap = new Map(materials.map(mat => [Number(mat.id), mat.location_id || null]))
      for (const item of validItems) {
        const locationId = locationMap.get(Number(item.material_id)) || null
        materialLocations[item.material_id] = locationId
        if (!firstLocationId && locationId) firstLocationId = locationId
      }
    } catch {
      for (const item of validItems) {
        materialLocations[item.material_id] = null
      }
    }

    const payload = {
      inbound_date: dayjs().format('YYYY-MM-DD'),
      location_id: firstLocationId,
      status: 'draft',
      operator: currentUser,
      inbound_type: 'production_return',
      reference_type: 'production_task',
      reference_id: returnMaterialForm.value.taskId,
      reference_no: returnMaterialForm.value.taskCode,
      remark: `【生产退料】${returnMaterialForm.value.remark || '剩余物料退回仓库'}`,
      items: validItems.map(item => ({
        material_id: item.material_id,
        quantity: item.returnQty,
        unit_id: item.unit_id,
        location_id: materialLocations[item.material_id] || firstLocationId,
        remark: returnMaterialForm.value.remark || '生产退料'
      }))
    }

    await inventoryApi.createInbound(payload)
    ElMessage.success(`退料入库单已创建（${validItems.length} 种物料），请通知仓库确认入库。`)
    returnMaterialVisible.value = false
  } catch (error) {
    console.error('退料失败:', error)
    const msg = error.response?.data?.message || error.message || '退料失败'
    ElMessage.error(msg)
  } finally {
    submittingReturn.value = false
  }
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
.preview-fill {
  height: 100%;
}
.iframe-full {
  width: 100%;
  height: 100%;
  border: none;
}
.header-card {
  margin-bottom: 20px;
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
  --el-tag-bg-color: var(--color-primary) !important;
  --el-tag-border-color: var(--color-primary) !important;
  --el-tag-text-color: var(--color-on-primary) !important;
  background-color: var(--color-primary) !important;
  border-color: var(--color-primary) !important;
  color: var(--color-on-primary) !important;
}

/* 待检验 - 紫色 */
.status-inspection {
  --inspection-status-color: color-mix(in srgb, var(--color-primary) 60%, var(--color-danger));
  --el-tag-bg-color: var(--inspection-status-color) !important;
  --el-tag-border-color: var(--inspection-status-color) !important;
  --el-tag-text-color: var(--color-on-primary) !important;
  background-color: var(--inspection-status-color) !important;
  border-color: var(--inspection-status-color) !important;
  color: var(--color-on-primary) !important;
}
</style>
