<!--
/**
 * FinalInspection.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page inspection-container">
    <PageHeader title="成品检验管理" subtitle="成品检验任务与结果管理">
      <template #actions>
        <el-button
          type="primary"
          @click="handleCreate"
          v-permission="'quality:inspections:create'"
        >
          新增
        </el-button>
      </template>
    </PageHeader>

    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.total }}</div>
        <div class="stat-label">全部检验单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.pending }}</div>
        <div class="stat-label">待检验</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.passed }}</div>
        <div class="stat-label">合格</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.failed }}</div>
        <div class="stat-label">不合格</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.review }}</div>
        <div class="stat-label">复检</div>
      </el-card>
    </div>

    <FinanceQueryCard :model="searchFormModel" @search="handleSearch" @reset="handleRefresh">
      <template #basic>
        <el-form-item label="关键词">
          <el-input
            v-model="searchKeyword"
            placeholder="检验单号/工单号/产品名称"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="检验状态">
          <el-select v-model="statusFilter" placeholder="检验状态" clearable class="form-control-md">
            <el-option label="待检验" value="pending" />
            <el-option label="检验中" value="in_progress" />
            <el-option label="合格" value="passed" />
            <el-option label="不合格" value="failed" />
            <el-option label="复检" value="review" />
          </el-select>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <el-card class="data-card">
      <!-- 检验单列表 -->
      <el-table
        :data="inspectionList"
        border
        class="table-row-click w-full mt-md"
        v-loading="loading"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))">
        <el-table-column prop="inspectionNo" label="检验单号" min-width="130" />
        <el-table-column prop="itemName" label="产品名称" min-width="180" />
        <el-table-column prop="itemCode" label="产品型号" min-width="150" />
        <el-table-column prop="referenceNo" label="工单号" min-width="150" />
        <el-table-column prop="batchNo" label="批次号" min-width="170" />
        <el-table-column prop="quantity" label="检验数量" min-width="80">
          <template #default="scope">
            {{ scope.row.quantity }} {{ scope.row.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="qualifiedQuantity" label="合格数" min-width="80">
          <template #default="scope">
            <span v-if="scope.row.qualifiedQuantity !== null && scope.row.qualifiedQuantity !== undefined" class="text-success font-weight-700">{{ scope.row.qualifiedQuantity }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="unqualifiedQuantity" label="不合格" min-width="80">
          <template #default="scope">
            <span v-if="scope.row.unqualifiedQuantity > 0" class="text-danger font-weight-700">{{ scope.row.unqualifiedQuantity }}</span>
            <span v-else class="text-muted">{{ scope.row.unqualifiedQuantity === 0 ? '0' : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="plannedDate" label="检验日期" min-width="110">
          <template #default="scope">
            {{ formatDate(scope.row.actualDate || scope.row.plannedDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="inspectorName" label="检验员" min-width="90">
          <template #default="scope">
            {{ scope.row.inspectorName || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="检验状态" min-width="90">
          <template #default="scope">
            <el-tag
              :type="getStatusType(scope.row.status)"
            >
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" min-width="320" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="scope">
            
            <el-button
              v-if="scope.row.status === 'pending'"
              v-permission="'quality:inspections:update'"
              size="small"
              type="primary"
              @click="handleInspect(scope.row)"
            >
              检验
            </el-button>
            <el-button
              v-if="scope.row.status === 'failed' && reworkStatusMap[scope.row.id]?.allowReinspection"
              v-permission="'quality:inspections:update'"
              size="small"
              type="primary"
              @click="handleDropdownCommand('review', scope.row)"
            >
              复检
            </el-button>
            <el-tag
              v-else-if="scope.row.status === 'failed' && !reworkStatusMap[scope.row.id]?.allowReinspection"
              type="info"
              size="small"
              effect="plain"
            >
              {{ getReworkHintText(scope.row.id) }}
            </el-tag>
            <el-button
              v-if="scope.row.status === 'passed'"
              size="small"
              type="primary"
              @click="handleDropdownCommand('certificate', scope.row)"
            >
              证书
            </el-button>
            <el-button
              v-if="scope.row.status !== 'pending'"
              size="small"
              type="success"
              @click="handleDropdownCommand('print', scope.row)"
            >
              打印
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(total, 1)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 新建检验单弹窗 -->
    <AppDialog
      v-model="createDialogVisible"
      title="新建成品检验单"
      mode="form"
      width="650px"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="来源" prop="sourceType">
          <el-radio-group v-model="form.sourceType" @change="handleSourceTypeChange">
            <el-radio-button value="production">生产工单</el-radio-button>
            <el-radio-button value="odm">ODM采购</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="form.sourceType === 'production'" label="工单号" prop="productionOrderNo">
          <el-select
            v-model="form.productionOrderNo"
            @change="handleOrderChange"
            placeholder="选择工单号"
            filterable
          >
            <el-option
              v-for="order in productionOrderOptions"
              :key="order.id"
              :label="order.orderNo"
              :value="order.orderNo"
            />
          </el-select>
        </el-form-item>

        <el-form-item v-else label="采购单" prop="purchaseOrderNo">
          <el-select
            v-model="form.purchaseOrderNo"
            @change="handlePurchaseOrderChange"
            placeholder="选择ODM采购单"
            filterable
          >
            <el-option
              v-for="order in purchaseOrderOptions"
              :key="order.id"
              :label="`${order.orderNo} ${order.supplierName}`"
              :value="order.orderNo"
            />
          </el-select>
        </el-form-item>

        <el-form-item v-if="form.sourceType === 'odm' && purchaseMaterialOptions.length > 1" label="产品" prop="productId">
          <el-select v-model="form.productId" filterable placeholder="选择采购成品" @change="handleOdmMaterialChange">
            <el-option
              v-for="item in purchaseMaterialOptions"
              :key="item.id"
              :label="`${item.code} ${item.name}`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="产品名称" prop="productName">
          <el-input v-model="form.productName" disabled />
        </el-form-item>

        <el-form-item label="产品型号" prop="productCode">
          <el-input v-model="form.productCode" disabled />
        </el-form-item>

        <el-form-item label="批次号" prop="batchNo">
          <el-input v-model="form.batchNo" placeholder="请输入批次号" />
        </el-form-item>

        <el-form-item label="检验数量" prop="quantity">
          <el-input-number v-model="form.quantity" :min="1" />
          <span class="unit-text">{{ form.unit }}</span>
        </el-form-item>

        <el-form-item label="标准类型" prop="standardType">
          <el-select v-model="form.standardType" placeholder="选择标准类型">
            <el-option label="出厂标准" value="factory" />
            <el-option label="客户标准" value="customer" />
            <el-option label="行业标准" value="industry" />
            <el-option label="国家标准" value="national" />
          </el-select>
        </el-form-item>

        <el-form-item label="标准编号" prop="standardNo">
          <el-input v-model="form.standardNo" placeholder="请输入标准编号" />
        </el-form-item>

        <el-alert
          v-if="currentInspectionTemplateSource"
          :title="currentInspectionTemplateSource"
          type="info"
          show-icon
          :closable="false"
          class="mb-md"
        />

        <el-form-item label="计划检验日期" prop="plannedDate">
          <el-date-picker
            v-model="form.plannedDate"
            type="date"
            placeholder="选择计划检验日期"
          />
        </el-form-item>

        <el-form-item label="备注" prop="note">
          <el-input
            v-model="form.note"
            type="textarea"
            placeholder="请输入备注信息"
            :rows="3"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button
            @click="createDialogVisible = false"
          >
            取消
          </el-button>
          <el-button
            type="primary"
            @click="submitForm"
            v-permission="'quality:inspections:create'"
          >
            确认
          </el-button>
        </span>
      </template>
        </AppDialog>

    <!-- 检验弹窗 -->
    <AppDialog
      v-model="inspectDialogVisible"
      :title="`成品检验 - ${inspectForm.inspectionNo || ''}`"
      mode="form"
      wide
    >
      <el-form ref="inspectFormRef" :model="inspectForm" :rules="inspectRules" label-width="100px">
        <!-- 产品信息头部面板 -->
        <el-descriptions :column="4" border size="small" class="mb-md">
          <el-descriptions-item label="产品名称">{{ inspectForm.productName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="工单号">{{ inspectForm.referenceNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="批次号">{{ inspectForm.batchNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="检验数量">{{ inspectForm.quantity }} {{ inspectForm.unit || '' }}</el-descriptions-item>
        </el-descriptions>
        <el-alert
          v-if="currentInspectionTemplateSource"
          :title="currentInspectionTemplateSource"
          type="info"
          show-icon
          :closable="false"
          class="mb-12"
        />
        <!-- 检验项目表格 -->
        <el-form-item label="检验项目" prop="items">
          <div class="w-full">
            <div class="flex-end-mb">
              <el-button type="success" size="small" @click="handleAllPassed"><el-icon class="mr-sm"><Select /></el-icon>全部合格</el-button>
            </div>
            <el-table :data="inspectForm.items" border class="w-full">
              <el-table-column prop="itemName" label="检验项目" width="120" show-overflow-tooltip>
                <template #default="scope">
                  <span>{{ scope.row.itemName }}</span>
                  <el-icon v-if="scope.row.isCritical" class="icon-warning-ml" :size="14"><StarFilled /></el-icon>
                </template>
              </el-table-column>
              <el-table-column label="标准±公差" width="150" show-overflow-tooltip>
                <template #default="scope">
                  {{ formatFqcStandard(scope.row) }}
                </template>
              </el-table-column>
              <el-table-column prop="actualValue" label="实测值" width="120">
                <template #default="scope">
                  <el-input
                    v-model="scope.row.actualValue"
                    size="small"
                    :placeholder="scope.row.type === 'dimension' ? '输入数值' : '输入结果'"
                    @blur="checkFqcTolerance(scope.row)"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="result" label="结果" width="120">
                <template #default="scope">
                  <el-select
                    v-model="scope.row.result"
                    placeholder="结果"
                    size="small"
                    :class="{
                      'result-select-passed': scope.row.result === 'passed',
                      'result-select-failed': scope.row.result === 'failed'
                    }"
                  >
                    <el-option label="合格" value="passed" class="text-success font-weight-700" />
                    <el-option label="不合格" value="failed" class="text-danger font-weight-700" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column prop="remarks" label="备注" min-width="120">
                <template #default="scope">
                  <el-input v-model="scope.row.remarks" size="small" placeholder="备注" />
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="合格数量" prop="qualifiedQuantity">
              <el-input-number
                v-model="inspectForm.qualifiedQuantity"
                :min="0"
                :max="inspectForm.quantity"
                :controls="false"
                class="w-full"
                @change="onQualifiedQuantityChange"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="不合格数量">
              <el-input-number
                v-model="inspectForm.unqualifiedQuantity"
                :min="0"
                :controls="false"
                class="w-full"
                disabled
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="检验日期" prop="inspectionDate">
              <el-date-picker
                v-model="inspectForm.inspectionDate"
                type="date"
                placeholder="选择检验日期"
                class="w-full"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="检验员" prop="inspectorName">
              <el-input v-model="inspectForm.inspectorName" />
            </el-form-item>
          </el-col>
          <el-col :span="16">
            <el-form-item label="备注" prop="note">
              <el-input
                v-model="inspectForm.note"
                placeholder="请输入备注信息"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="inspectDialogVisible = false">取消</el-button>
          <el-button v-permission="'quality:inspections:update'" type="primary" @click="submitInspection" :loading="submitLoading">提交检验</el-button>
        </span>
      </template>
        </AppDialog>

    <!-- 查看检验单弹窗 -->
    <AppDialog
      v-model="viewDialogVisible"
      :title="currentInspection && currentInspection.inspectionNo ? `检验单详情 - ${currentInspection.inspectionNo}` : '检验单详情'"
      mode="view"
      content-width="wide"
      :detail-navigation="finalInspectionViewNavigation"
    >
      <template v-if="currentInspection && currentInspection.inspectionNo">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="检验单号">{{ currentInspection.inspectionNo }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ currentInspection.itemName || currentInspection.productName }}</el-descriptions-item>
          <el-descriptions-item label="检验状态">
            <el-tag :type="getStatusType(currentInspection.status)">
              {{ getStatusText(currentInspection.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="工单号">{{ currentInspection.referenceNo }}</el-descriptions-item>
          <el-descriptions-item label="批次号">{{ currentInspection.batchNo }}</el-descriptions-item>
          <el-descriptions-item label="检验日期">{{ formatDate(currentInspection.actualDate || currentInspection.plannedDate) }}</el-descriptions-item>
          <el-descriptions-item label="检验数量">{{ currentInspection.quantity }} {{ currentInspection.unit }}</el-descriptions-item>
          <el-descriptions-item label="合格数">
            <span v-if="currentInspection.qualifiedQuantity !== null && currentInspection.qualifiedQuantity !== undefined" class="text-success font-weight-700">{{ currentInspection.qualifiedQuantity }}</span>
            <span v-else class="text-muted">-</span>
          </el-descriptions-item>
          <el-descriptions-item label="不合格数">
            <span v-if="currentInspection.unqualifiedQuantity > 0" class="text-danger font-weight-700">{{ currentInspection.unqualifiedQuantity }}</span>
            <span v-else class="text-muted">{{ currentInspection.unqualifiedQuantity === 0 ? '0' : '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="检验员">{{ currentInspection.inspectorName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="引用模板">{{ currentInspection.templateName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="合格率">
            <span v-if="currentInspection.qualifiedQuantity !== null && currentInspection.quantity"
                  :class="(currentInspection.qualifiedQuantity / currentInspection.quantity) >= 1 ? 'text-stock-ok font-weight-700' : 'text-stock-low font-weight-700'">
              {{ ((currentInspection.qualifiedQuantity / currentInspection.quantity) * 100).toFixed(1) }}%
            </span>
            <span v-else class="text-muted">-</span>
          </el-descriptions-item>
          <el-descriptions-item label="标准编号">{{ currentInspection.standardNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="3">{{ currentInspection.note || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="inspection-items row-mt-20">
          <h4>检验项目</h4>
          <el-table :data="currentInspection.items" border class="w-full">
            <el-table-column prop="itemName" label="项目名称" min-width="140" />
            <el-table-column prop="standard" label="标准" min-width="160" />
            <el-table-column prop="actualValue" label="实测值" min-width="100" />
            <el-table-column label="结果" min-width="90">
              <template #default="scope">
                <el-tag v-if="scope.row.result === 'passed' || scope.row.result === 'pass'" type="success" size="small">合格</el-tag>
                <el-tag v-else-if="scope.row.result === 'failed' || scope.row.result === 'fail'" type="danger" size="small">不合格</el-tag>
                <span v-else class="text-muted">{{ scope.row.result || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="remarks" label="备注" min-width="140" />
          </el-table>
        </div>
      </template>
      <template v-else>
        <EmptyState description="暂无检验单数据" />
      </template>
    </AppDialog>

    <!-- 检验报告弹窗 -->
    <AppDialog
      v-model="reportDialogVisible"
      title="检验报告"
      mode="form"
      width="800px"
    >
      <div class="report-container">
        <div class="report-header">
          <h2 class="text-center">成品检验报告</h2>
          <p class="text-center">FINAL QUALITY INSPECTION REPORT</p>
        </div>

        <el-divider />

        <div class="report-info">
          <div class="info-row">
            <span class="info-label">检验单号：</span>
            <span class="info-value">{{ currentInspection.inspectionNo }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">产品名称：</span>
            <span class="info-value">{{ currentInspection.itemName || currentInspection.productName }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">产品型号：</span>
            <span class="info-value">{{ currentInspection.itemCode || currentInspection.productCode }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">工单号：</span>
            <span class="info-value">{{ currentInspection.referenceNo }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">批次号：</span>
            <span class="info-value">{{ currentInspection.batchNo }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">检验数量：</span>
            <span class="info-value">{{ currentInspection.quantity }} {{ currentInspection.unit }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">检验日期：</span>
            <span class="info-value">{{ formatDate(currentInspection.actualDate) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">检验员：</span>
            <span class="info-value">{{ currentInspection.inspectorName || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">检验结果：</span>
            <span class="info-value">
              <el-tag :type="getStatusType(currentInspection.status)">
                {{ getStatusText(currentInspection.status) }}
              </el-tag>
            </span>
          </div>
        </div>

        <div class="report-items">
          <h3>检验项目：</h3>
          <el-table :data="currentInspection.items" border class="w-full">
            <el-table-column type="index" width="50" label="序号" />
            <el-table-column prop="itemName" label="检验项目" width="150" />
            <el-table-column prop="standard" label="检验标准" min-width="180" />
            <el-table-column prop="type" label="检验类型" width="100">
              <template #default="scope">
                {{ getTypeText(scope.row.type) }}
              </template>
            </el-table-column>
            <el-table-column prop="actualValue" label="实际值" width="120" />
            <el-table-column prop="result" label="检验结果" width="100">
              <template #default="scope">
                <el-tag :type="scope.row.result === 'passed' ? 'success' : 'danger'">
                  {{ scope.row.result === 'passed' ? '合格' : '不合格' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="remarks" label="备注" min-width="150" />
          </el-table>
        </div>

        <div class="report-note" v-if="currentInspection.note">
          <h3>检验备注：</h3>
          <p>{{ currentInspection.note }}</p>
        </div>

        <div class="report-signatures">
          <div class="signature-item">
            <p>检验员签名：___________________</p>
            <p>日期：{{ formatDate(new Date()) }}</p>
          </div>
          <div class="signature-item">
            <p>质检主管签名：___________________</p>
            <p>日期：{{ formatDate(new Date()) }}</p>
          </div>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button
            @click="handlePrintReport"
          >
            打印报告
          </el-button>
          <el-button
            @click="reportDialogVisible = false"
          >
            关闭
          </el-button>
        </span>
      </template>
        </AppDialog>

    <!-- 合格证书弹窗 -->
    <AppDialog
      v-model="certificateDialogVisible"
      title="合格证书"
      mode="form"
      width="800px"
    >
      <div class="certificate-container">
        <div class="certificate-header">
          <h2 class="text-center">产品合格证书</h2>
          <p class="text-center">CERTIFICATE OF CONFORMITY</p>
        </div>

        <el-divider />

        <div class="certificate-content">
          <p>兹证明，以下产品经过质量检验，符合相关标准要求，特发此证。</p>

          <div class="info-row">
            <span class="info-label">产品名称：</span>
            <span class="info-value">{{ currentInspection.itemName || currentInspection.productName }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">产品型号：</span>
            <span class="info-value">{{ currentInspection.itemCode || currentInspection.productCode }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">批次号：</span>
            <span class="info-value">{{ currentInspection.batchNo }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">生产日期：</span>
            <span class="info-value">{{ formatDate(currentInspection.plannedDate) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">检验日期：</span>
            <span class="info-value">{{ formatDate(currentInspection.actualDate) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">检验标准：</span>
            <span class="info-value">{{ currentInspection.standardType === 'factory' ? '工厂标准' :
                                   currentInspection.standardType === 'customer' ? '客户标准' :
                                   currentInspection.standardType === 'industry' ? '行业标准' :
                                   currentInspection.standardType === 'national' ? '国家标准' : '未知' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">标准编号：</span>
            <span class="info-value">{{ currentInspection.standardNo }}</span>
          </div>

          <div class="certificate-declaration">
            <p>本产品的质量符合相关质量标准，特此证明。</p>
          </div>
        </div>

        <div class="certificate-seal">
          <div class="seal-item">
            <p>检验员：{{ currentInspection.inspectorName || '-' }}</p>
            <p>日期：{{ formatDate(currentInspection.actualDate) }}</p>
          </div>
          <div class="seal-item text-center">
            <div class="company-seal">
              <p>（公司盖章）</p>
            </div>
            <p>生效日期：{{ formatDate(new Date()) }}</p>
          </div>
          <div class="seal-item">
            <p>质量负责人：_________________</p>
            <p>日期：{{ formatDate(new Date()) }}</p>
          </div>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button
            @click="handlePrintCertificate"
          >
            打印证书
          </el-button>
          <el-button
            @click="certificateDialogVisible = false"
          >
            关闭
          </el-button>
        </span>
      </template>
        </AppDialog>
  </div>
</template>
<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { parseListData, parseResponseData } from '@/utils/responseParser';
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Select, StarFilled } from '@element-plus/icons-vue'
import 'dayjs'
import { qualityApi, productionApi, purchaseApi } from '@/api'
import printService from '@/services/printService'
import { useAuthStore } from '@/stores/auth'
import { tokenManager } from '@/utils/unifiedStorage'
import { formatDate } from '@/utils/helpers/dateUtils'
import { useListDetailNavigation } from '@/composables/useListDetailNavigation'
import {
  getTemplateItems,
  getTemplateSourceText,
  mapTemplateItemsToInspectionItems,
  resolveEffectiveInspectionTemplates
} from '@/utils/inspectionTemplateResolver'
// 权限store
const authStore = useAuthStore()
const getCurrentUserDisplayName = () => {
  const currentUser = authStore.user || tokenManager.getUser()
  return currentUser?.realName || currentUser?.realName || currentUser?.name || currentUser?.username || ''
}
// 搜索相关 - 使用统一的filters对象
const filters = reactive({
  keyword: '',
  status: '',
  startDate: '',
  endDate: ''
})
// 为了兼容现有模板，保留原有的ref
const searchKeyword = computed({
  get: () => filters.keyword,
  set: (val) => filters.keyword = val
})
const statusFilter = computed({
  get: () => filters.status,
  set: (val) => filters.status = val
})
const dateRange = computed({
  get: () => filters.startDate && filters.endDate ? [filters.startDate, filters.endDate] : [],
  set: (val) => {
    if (val && val.length === 2) {
      filters.startDate = formatDate(val[0])
      filters.endDate = formatDate(val[1])
    } else {
      filters.startDate = ''
      filters.endDate = ''
    }
  }
})
const searchFormModel = computed(() => ({
  keyword: filters.keyword,
  status: filters.status,
  dateRange: dateRange.value,
}))
// 表格数据相关
const loading = ref(false)
const submitLoading = ref(false)
const inspectionList = ref([])
const {
  previousItem: previousViewInspection,
  nextItem: nextViewInspection,
  hasPrevious: hasPreviousViewInspection,
  hasNext: hasNextViewInspection,
  setCurrentItem: setCurrentViewInspection
} = useListDetailNavigation(inspectionList)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
// 创建检验单相关
const createDialogVisible = ref(false)
const formRef = ref(null)
const form = reactive({
  sourceType: 'production',
  referenceId: null,
  productionOrderNo: '',
  purchaseOrderNo: '',
  productId: null,
  productName: '',
  productCode: '',
  batchNo: '',
  quantity: 1,
  unit: '',
  standardType: 'factory',
  standardNo: '',
  plannedDate: new Date(),
  note: ''
})
// 表单验证规则
const rules = {
  sourceType: [{ required: true, message: '请选择来源', trigger: 'change' }],
  productionOrderNo: [{
    validator: (_rule, value, callback) => {
      if (form.sourceType === 'production' && !value) callback(new Error('请选择工单号'))
      else callback()
    },
    trigger: 'change'
  }],
  purchaseOrderNo: [{
    validator: (_rule, value, callback) => {
      if (form.sourceType === 'odm' && !value) callback(new Error('请选择ODM采购单'))
      else callback()
    },
    trigger: 'change'
  }],
  batchNo: [{ required: true, message: '请输入批次号', trigger: 'blur' }],
  quantity: [{ required: true, message: '请输入检验数量', trigger: 'blur' }],
  standardType: [{ required: true, message: '请选择标准类型', trigger: 'change' }],
  standardNo: [{ required: true, message: '请输入标准编号', trigger: 'blur' }],
  plannedDate: [{ required: true, message: '请选择计划检验日期', trigger: 'change' }]
}
// 工单选项
const productionOrderOptions = ref([])
const purchaseOrderOptions = ref([])
const purchaseMaterialOptions = ref([])
// 添加检验单统计数据
const inspectionStats = ref({
  total: 0,
  pending: 0,
  passed: 0,
  failed: 0,
  review: 0
})
// 返工状态缓存: key 为检验单ID, value 为返工状态对象
const reworkStatusMap = ref({})
// 添加检验模板相关数据
const _inspectionTemplates = ref([])
const currentTemplateItems = ref([])
const currentInspectionTemplateId = ref(null)
const currentInspectionTemplateName = ref('')
const currentInspectionTemplateSource = ref('')
// 在script setup部分添加
const viewDialogVisible = ref(false)
const viewLoading = ref(false)
const currentInspection = ref({})
// 添加报告和证书对话框的ref
const reportDialogVisible = ref(false)
const certificateDialogVisible = ref(false)
const _router = useRouter()
// 获取工单选项
const fetchProductionOrders = async () => {
  try {
    const response = await productionApi.getProductionTasks({
      status: 'completed',
      pageSize: 50
    });
    const taskItems = parseListData(response, { enableLog: false });
    if (taskItems.length > 0) {
      productionOrderOptions.value = taskItems
        .filter(task => task.status === 'completed')
        .map(task => ({
          id: task.id,
          orderNo: task.code || task.taskNo,
          productId: task.productId || task.materialId || null, // 关键：保存物料/产品ID
          productName: task.productName || '未知产品',
          productCode: task.specs || task.productCode || '未知型号',
          batchNo: task.batchNo || '',
          unit: task.unit || '个'
        }));
    }
    if (productionOrderOptions.value.length === 0) {
      ElMessage.info('暂无已完成的生产工单');
    }
  } catch (error) {
    console.error('获取生产工单失败:', error);
    ElMessage.warning(`获取生产工单数据失败: ${error.message || '未知错误'}`);
    productionOrderOptions.value = [];
  }
}
// 获取成品检验模板（使用物料/产品ID查询，同时包含通用模板）
const fetchInspectionTemplate = async (materialId) => {
  if (!materialId) return;
  submitLoading.value = true
  try {
    const response = await qualityApi.getTemplates({
      material_type: materialId,
      inspection_type: 'final',
      status: 'active',
      include_general: true,  // 同时查询通用模板
      pageSize: 50,
      page: 1
    });
    const templatesData = parseListData(response, { enableLog: false });
    const effectiveTemplates = resolveEffectiveInspectionTemplates(templatesData);
    if (effectiveTemplates.length > 0) {
      const template = effectiveTemplates[0];
      const templateItems = getTemplateItems(template);
      if (templateItems.length > 0) {
        currentInspectionTemplateId.value = template.id;
        currentInspectionTemplateName.value = template.templateName || '';
        currentInspectionTemplateSource.value = getTemplateSourceText(template);
        currentTemplateItems.value = mapTemplateItemsToInspectionItems(templateItems);
        if (template.is_general) {
          ElMessage.info(`已自动使用成品通用模板: ${template.templateName}`);
        }
        return;
      }
    }
    currentTemplateItems.value = [];
    currentInspectionTemplateId.value = null;
    currentInspectionTemplateName.value = '';
    currentInspectionTemplateSource.value = '';
    throw new Error('未找到可用的成品检验模板');
  } catch (error) {
    console.error('获取检验模板失败:', error);
    currentTemplateItems.value = [];
    currentInspectionTemplateId.value = null;
    currentInspectionTemplateName.value = '';
    currentInspectionTemplateSource.value = '';
    throw error;
  } finally {
    submitLoading.value = false;
  }
}
// 从后端获取各状态的统计总数（使用轻量请求 limit=1 只取 total 字段）
const calculateInspectionStats = async () => {
  try {
    const response = await qualityApi.getFinalInspectionStats()
    const data = parseResponseData(response, {})
    const pending = Number(data.pending) || 0
    const passed = Number(data.passed) || 0
    const failed = Number(data.failed) || 0
    const review = Number(data.review) || 0
    inspectionStats.value = {
      total: Number(data.total) || pending + passed + failed + review,
      pending,
      passed,
      failed,
      review
    }
  } catch (err) {
    console.error('获取统计数据失败:', err)
    // 降级使用当前页数据
    const stats = { total: total.value, pending: 0, passed: 0, failed: 0, review: 0 }
    inspectionList.value.forEach(item => {
      if (item.status === 'pending') stats.pending++
      else if (item.status === 'passed') stats.passed++
      else if (item.status === 'failed') stats.failed++
      else if (item.status === 'review') stats.review++
    })
    inspectionStats.value = stats
  }
}
// 添加统一的日期格式化方法
// formatDate 已统一引用公共实现
// 工单选择后，提取物料信息并查询模板
const handleOrderChange = (orderNo) => {
  const order = productionOrderOptions.value.find(item => item.orderNo === orderNo)
  if (order) {
    form.referenceId = order.id
    form.productId = order.productId || null
    form.productName = order.productName
    form.productCode = order.productCode
    form.unit = order.unit
    form.batchNo = order.batchNo || ''
    fetchInspectionTemplate(order.productId)
    form.standardNo = `${orderNo}-FQC`
  }
}

const handleSourceTypeChange = () => {
  form.referenceId = null
  form.productionOrderNo = ''
  form.purchaseOrderNo = ''
  form.productId = null
  form.productName = ''
  form.productCode = ''
  form.batchNo = ''
  form.unit = ''
  purchaseMaterialOptions.value = []
  currentTemplateItems.value = []
  currentInspectionTemplateId.value = null
  currentInspectionTemplateName.value = ''
  currentInspectionTemplateSource.value = ''
  if (form.sourceType === 'odm') {
    fetchPurchaseOrders()
  }
}

const fetchPurchaseOrders = async () => {
  try {
    const response = await purchaseApi.getOrders({ pageSize: 50 })
    const orders = parseListData(response, { enableLog: false })
    const validStatuses = ['confirmed', 'approved', 'received', 'partial_received', 'inspecting', 'inspected', 'warehousing']
    purchaseOrderOptions.value = (orders || [])
      .filter((item) => validStatuses.includes(item.status))
      .map((item) => ({
        id: item.id,
        orderNo: item.orderNo || '',
        supplierName: item.supplier?.name || item.supplierName || '',
      }))
  } catch (error) {
    console.error('获取采购单失败:', error)
    purchaseOrderOptions.value = []
  }
}

const handlePurchaseOrderChange = async (orderNo) => {
  const selected = purchaseOrderOptions.value.find((item) => item.orderNo === orderNo)
  if (!selected) return
  form.referenceId = selected.id
  form.standardNo = `${orderNo}-ODM-FQC`
  try {
    const response = await purchaseApi.getOrder(orderNo)
    const items = response.data?.items || response.items || []
    purchaseMaterialOptions.value = items.map((item) => ({
      id: item.materialId,
      name: item.materialName || item.materialCode,
      code: item.materialCode,
      unit: item.unitName || item.unit,
      quantity: item.quantity,
    }))
    const first = purchaseMaterialOptions.value[0]
    if (first) {
      form.productId = first.id
      form.productName = first.name
      form.productCode = first.code
      form.unit = first.unit || '个'
      form.quantity = Number(first.quantity) || 1
      fetchInspectionTemplate(first.id)
    }
  } catch (error) {
    console.error('获取采购单明细失败:', error)
    ElMessage.error('获取采购单明细失败')
  }
}

const handleOdmMaterialChange = (materialId) => {
  const item = purchaseMaterialOptions.value.find((row) => row.id === materialId)
  if (!item) return
  form.productId = item.id
  form.productName = item.name
  form.productCode = item.code
  form.unit = item.unit || '个'
  form.quantity = Number(item.quantity) || form.quantity
  fetchInspectionTemplate(item.id)
}
// 初始化
onMounted(() => {
  fetchData()
  fetchProductionOrders()
})
// 获取检验单列表
const fetchData = async () => {
  loading.value = true;
  try {
    // 构建查询参数对象 - 使用filters对象
    const queryParams = {
      page: currentPage.value,
      limit: pageSize.value
    };
    if (filters.keyword) {
      queryParams.keyword = filters.keyword;
    }
    if (filters.status) {
      queryParams.status = filters.status;
    }
    if (filters.startDate && filters.endDate) {
      queryParams.startDate = filters.startDate;
      queryParams.endDate = filters.endDate;
    }
    // 使用统一的API调用方式
    const response = await qualityApi.getFinalInspections(queryParams);
    // axios 拦截器已自动解包，response.data 是分页数据对象 {list, total, page, pageSize}
    const responseData = response.data;
    if (responseData && (responseData.list || Array.isArray(responseData))) {
      inspectionList.value = responseData.list || responseData || [];
      total.value = responseData.total || 0;
      calculateInspectionStats();
      // 批量查询 failed 状态检验单的返工任务状态，决定复检按钮是否可点击
      await fetchReworkStatusForFailedInspections();
    } else {
      console.error('API返回错误:', responseData);
      ElMessage.error('获取检验单列表失败');
    }
  } catch (error) {
    console.error('获取检验单列表失败:', error);
    ElMessage.error(`获取检验单列表失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
}
/**
 * 批量查询当前列表中所有 failed 状态检验单的返工任务状态
 * 闭环逻辑: 只有当返工任务完成后，复检按钮才可点击
 */
const fetchReworkStatusForFailedInspections = async () => {
  const failedInspections = inspectionList.value.filter(row => row.status === 'failed');
  if (failedInspections.length === 0) return;
  try {
    const res = await qualityApi.getReworkStatusByInspectionIds(failedInspections.map(row => row.id));
    const data = parseResponseData(res, {});
    failedInspections.forEach(row => {
      reworkStatusMap.value[row.id] = data[row.id] || { allow_reinspection: false };
    });
  } catch {
    failedInspections.forEach(row => {
      reworkStatusMap.value[row.id] = { allow_reinspection: false };
    });
  }
}
/**
 * 根据检验单的返工闭环状态，返回对应的提示文字
 */
const getReworkHintText = (inspectionId) => {
  const status = reworkStatusMap.value[inspectionId];
  if (!status) return '查询中...';
  if (!status.hasNcp) return '待处置';
  if (!status.hasRework && status.disposition === 'rework') return '待返工';
  if (!status.hasRework) return status.disposition === 'scrap' ? '已报废' : '待处理';
  if (status.reworkStatus === 'pending') return '返工待分配';
  if (status.reworkStatus === 'in_progress') return '返工中';
  if (status.reworkCompleted) return '复检'; // 不应该走到这里，因为 allow_reinspection 已经为 true
  return '返工中';
}
import { getQualityStatusText, getQualityStatusColor, getQualityInspectionTypeText } from '@/constants/systemConstants'
// 获取状态类型（用于tag颜色）
const getStatusType = (status) => {
  return getQualityStatusColor(status)
}
// 获取状态文本
const getStatusText = (status) => {
  return getQualityStatusText(status)
}
// 添加获取检验类型的中文文本函数
const getTypeText = (type) => {
  return getQualityInspectionTypeText(type)
}
// 搜索
const handleSearch = () => {
  currentPage.value = 1
  fetchData()
}
// 刷新
const handleRefresh = () => {
  // 重置filters对象
  filters.keyword = ''
  filters.status = ''
  filters.startDate = ''
  filters.endDate = ''
  currentPage.value = 1
  pageSize.value = 20
  fetchData()
}
// 分页相关
const handleSizeChange = (val) => {
  pageSize.value = val
  fetchData()
}
const handleCurrentChange = (val) => {
  currentPage.value = val
  fetchData()
}
// 新建检验单
const handleCreate = () => {
  // 重置表单
  Object.keys(form).forEach(key => {
    if (key === 'quantity') {
      form[key] = 1
    } else if (key === 'plannedDate') {
      form[key] = new Date()
    } else if (key === 'standardType') {
      form[key] = 'factory'
    } else if (key === 'sourceType') {
      form[key] = 'production'
    } else if (key === 'referenceId' || key === 'productId') {
      form[key] = null
    } else {
      form[key] = ''
    }
  })
  purchaseMaterialOptions.value = []
  currentTemplateItems.value = []
  currentInspectionTemplateId.value = null
  currentInspectionTemplateName.value = ''
  currentInspectionTemplateSource.value = ''

  createDialogVisible.value = true
}
// 提交表单
const submitForm = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()

    // 获取选中的工单信息
    const formData = {
      inspectionType: 'final',
      referenceId: form.referenceId,
      referenceNo: form.sourceType === 'odm' ? form.purchaseOrderNo : form.productionOrderNo,
      productId: form.productId,
      productName: form.productName,
      productCode: form.productCode,
      batchNo: form.batchNo,
      quantity: form.quantity,
      unit: form.unit,
      standardType: form.standardType,
      standardNo: form.standardNo,
      templateId: currentInspectionTemplateId.value || null,
      plannedDate: formatDate(form.plannedDate),
      note: form.note,
      status: 'pending'
    }

    submitLoading.value = true
    // 使用统一的API调用方式
    const response = await qualityApi.createFinalInspection(formData);
    if (response.data) {
      ElMessage.success('检验单创建成功')
      createDialogVisible.value = false
      fetchData()
    } else {
      ElMessage.error('创建检验单失败')
    }
  } catch (error) {
    console.error('表单验证或提交失败:', error)
    ElMessage.error('创建检验单失败')
  } finally {
    submitLoading.value = false
  }
}
// 查看详情
const handleView = async (row) => {
  if (viewLoading.value) return

  viewLoading.value = true
  try {
    // 使用统一的API调用方式
    const response = await qualityApi.getFinalInspection(row.id);
    // axios 拦截器已自动解包，response.data 是详情数据对象
    const data = response.data;
    if (data) {
      // 后端已输出 camel
      currentInspection.value = {
        ...data,
        items: data.items || [],
        standardNo: data.standardNo || data.templateCode || null
      };
    } else {
      throw new Error('获取检验单详情失败');
    }

    if (!currentInspection.value.items || currentInspection.value.items.length === 0) {
      currentInspection.value.items = [];
      ElMessage.warning('当前检验单未配置检验项目');
    }

    viewDialogVisible.value = true;
    setCurrentViewInspection(row);
  } catch (error) {
    console.error('获取检验单详情失败:', error);
    ElMessage.error('获取检验单详情失败: ' + error.message);
  } finally {
    viewLoading.value = false
  }
}

const handleViewPrevious = () => {
  if (previousViewInspection.value) handleView(previousViewInspection.value)
}

const handleViewNext = () => {
  if (nextViewInspection.value) handleView(nextViewInspection.value)
}

const finalInspectionViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewInspection.value,
  hasNext: hasNextViewInspection.value,
  loading: viewLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext
}))
// 修改检验弹窗相关功能
const inspectDialogVisible = ref(false)
const inspectFormRef = ref(null)
const inspectForm = reactive({
  id: '',
  inspectionNo: '',
  items: [],
  inspectorName: '',
  inspectionDate: new Date(),
  note: '',
  // 产品相关字段
  productId: '',
  productName: '',
  quantity: 0,
  qualifiedQuantity: 0,
  unqualifiedQuantity: 0,
  unitId: null,
  unit: '',
  batchNo: '',
  referenceNo: ''
})
// 合格数量变更时自动计算不合格数量
const onQualifiedQuantityChange = (val) => {
  inspectForm.unqualifiedQuantity = Math.max(0, (inspectForm.quantity || 0) - (val || 0));
}
// “全部合格”快捷按钮——一键将所有检验项标记为合格
const handleAllPassed = () => {
  if (!inspectForm.items || inspectForm.items.length === 0) return
  inspectForm.items.forEach(item => {
    item.result = 'passed'
    if (!item.actualValue) {
      // 非尺寸类项填 OK，尺寸类填标准值
      item.actualValue = item.type === 'dimension' && item.dimensionValue ? String(item.dimensionValue) : 'OK'
    }
  })
  // 同时将合格数量设为总数
  inspectForm.qualifiedQuantity = inspectForm.quantity
  inspectForm.unqualifiedQuantity = 0
  ElMessage.success('已将所有检验项标记为合格')
}
// 格式化FQC检验项的标准±公差展示
const formatFqcStandard = (item) => {
  if (item.type === 'dimension' && (item.dimensionValue || item.standard)) {
    const base = item.dimensionValue || item.standard
    const tolerance = item.toleranceUpper != null && item.toleranceLower != null
      ? ` (+${item.toleranceUpper}/-${Math.abs(item.toleranceLower)})`
      : ''
    return `${base}${tolerance}`
  }
  return item.standard || '-'
}
// 尺寸类检验项输入后自动检查公差
const checkFqcTolerance = (item) => {
  if (item.type !== 'dimension' || !item.dimensionValue || !item.actualValue) return
  const actual = parseFloat(item.actualValue)
  if (isNaN(actual)) return
  const std = parseFloat(item.dimensionValue)
  const upper = parseFloat(item.toleranceUpper) || 0
  const lower = parseFloat(item.toleranceLower) || 0
  // 判定是否在公差范围内
  if (actual >= (std + lower) && actual <= (std + upper)) {
    item.result = 'passed'
  } else {
    item.result = 'failed'
  }
}
// 检验表单验证规则
const inspectRules = {
  inspectorName: [
    { required: true, message: '请输入检验员姓名', trigger: 'blur' }
  ],
  inspectionDate: [
    { required: true, message: '请选择检验日期', trigger: 'change' }
  ]
}
// 进行检验
const handleInspect = async (row) => {
  try {
    // 使用统一的API调用方式
    const response = await qualityApi.getFinalInspection(row.id);
    // axios 拦截器已自动解包，response.data 是详情数据对象
    const inspection = response.data;
    if (!inspection) {
      throw new Error('获取检验单详情失败');
    }
    // 初始化表单数据 - 优先使用传入的row.id，确保ID正确
    inspectForm.id = row.id || inspection.id;
    inspectForm.inspectionNo = inspection.inspectionNo;
    // 设置产品相关信息
    inspectForm.productId = inspection.productId;
    inspectForm.productName = inspection.productName || inspection.itemName || '';
    inspectForm.quantity = inspection.quantity || 1;
    inspectForm.qualifiedQuantity = inspection.qualifiedQuantity ?? inspection.quantity ?? 0;
    inspectForm.unqualifiedQuantity = inspection.unqualifiedQuantity || 0;
    inspectForm.unitId = inspection.unitId || null;
    inspectForm.unit = inspection.unit || '';
    inspectForm.batchNo = inspection.batchNo || '';
    inspectForm.referenceNo = inspection.referenceNo || '';
    currentInspectionTemplateId.value = inspection.templateId || null;
    currentInspectionTemplateName.value = inspection.templateName || '';
    currentInspectionTemplateSource.value = inspection.templateName ? `已引用模板：${inspection.templateName}` : '';

    // 确保检验项目数据
    const inspectionItems = inspection.items || [];

    // 如果从API获取到了检验项目，使用这些项目
    if (inspectionItems.length > 0) {
      inspectForm.items = inspectionItems.map(item => ({
        ...item,
        itemName: item.itemName || item.name || '',
        type: item.type || '',
        actualValue: item.actualValue || '',
        result: item.result || '',
        remarks: item.remarks || '',
        isCritical: item.isCritical,
        dimensionValue: item.dimensionValue,
        toleranceUpper: item.toleranceUpper,
        toleranceLower: item.toleranceLower
      }));
    } else {
      // 尝试获取检验模板
      try {
        const materialId = inspection.materialId || inspection.productId;
        if (!materialId) {
          throw new Error('缺少物料/产品ID');
        }

        await fetchInspectionTemplate(materialId);
        if (currentTemplateItems.value && currentTemplateItems.value.length > 0) {
          inspectForm.items = currentTemplateItems.value.map(item => ({
            id: item.id,
            itemName: item.itemName,
            standard: item.standard,
            type: item.type,
            actualValue: '',
            result: '',
            remarks: '',
            isCritical: item.isCritical ?? item.isCritical,
            dimensionValue: item.dimensionValue ?? item.dimensionValue,
            toleranceUpper: item.toleranceUpper ?? item.toleranceUpper,
            toleranceLower: item.toleranceLower ?? item.toleranceLower
          }));
        } else {
          throw new Error('检验模板中没有检验项目');
        }
      } catch (templateError) {
        console.error('获取或处理检验模板失败:', templateError);
        inspectForm.items = [];
        ElMessage.warning('未找到可用的检验模板，请先维护成品检验模板');
      }
    }

    // 自动填入当前登录用户的真实姓名作为检验员
    inspectForm.inspectorName = getCurrentUserDisplayName();

    inspectForm.inspectionDate = new Date();
    inspectForm.note = inspection.note || '';

    inspectDialogVisible.value = true;
  } catch (error) {
    console.error('获取检验单详情失败:', error);
    ElMessage.error('获取检验单详情失败: ' + error.message);
  }
}
// 提交检验结果
const submitInspection = async () => {
  if (!inspectFormRef.value) return
  // 防止重复提交
  if (submitLoading.value) {
    ElMessage.warning('正在提交中，请勿重复操作');
    return;
  }
  submitLoading.value = true;
  try {
    await inspectFormRef.value.validate()

    // 手动验证 items (避免 vue/element-plus 数组深度监控引发警告)
    if (inspectForm.items.some(item => !item.actualValue)) {
      ElMessage.warning('请填写所有检验项的实际值');
      submitLoading.value = false;
      return;
    }
    if (inspectForm.items.some(item => !item.result)) {
      ElMessage.warning('请选择所有检验项的结果');
      submitLoading.value = false;
      return;
    }

    // 计算检验结果状态
    const allPassed = inspectForm.items.every(item => item.result === 'passed')
    const status = allPassed ? 'passed' : 'failed'

    // 准备提交的数据（纯 camel）
    const submitData = {
      id: inspectForm.id,
      inspectionNo: inspectForm.inspectionNo,
      items: inspectForm.items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        standard: item.standard,
        type: item.type,
        isCritical: item.isCritical,
        dimensionValue: item.dimensionValue,
        toleranceUpper: item.toleranceUpper,
        toleranceLower: item.toleranceLower,
        actualValue: item.actualValue,
        result: item.result,
        remarks: item.remarks
      })),
      inspectorName: inspectForm.inspectorName,
      templateId: currentInspectionTemplateId.value || null,
      actualDate: formatDate(inspectForm.inspectionDate),
      note: inspectForm.note,
      status: status,
      quantity: inspectForm.quantity,
      qualifiedQuantity: inspectForm.qualifiedQuantity || 0,
      unqualifiedQuantity: inspectForm.unqualifiedQuantity || 0
    }
    // 提交检验结果 - 需要分离ID和数据
    const inspectionId = submitData.id
    if (!inspectionId) {
      ElMessage.error('检验单ID缺失，无法提交');
      return;
    }
    const inspectionData = { ...submitData }
    delete inspectionData.id  // 从数据对象中移除ID

    const _response = await qualityApi.updateFinalInspection(inspectionId, inspectionData)
    // 拦截器已解包，如果业务失败会抛出错误
    inspectDialogVisible.value = false // 关闭检验对话框
    // 入库单由后端统一创建（qualityInspection.js 中的 updateInspection 方法）
    // 避免前后端重复创建入库单的问题
    if (status === 'passed') {
      ElMessage.success('检验合格，系统将自动创建入库单')
    } else {
      ElMessage.success('检验结果提交成功')
    }
    // 重新加载列表
    fetchData()
  } catch (error) {
    console.error('提交检验结果出错:', error)
    ElMessage.error('提交检验结果失败: ' + (error.message || '未知错误'))
  } finally {
    submitLoading.value = false
  }
}
// 处理下拉菜单命令
const handleDropdownCommand = (command, row) => {
  if (command === 'report') {
    handleReport(row)
  } else if (command === 'review') {
    handleReview(row)
  } else if (command === 'certificate') {
    handleGenerateCertificate(row)
  } else if (command === 'print') {
    handlePrint(row)
  }
}
// 查看报告
const handleReport = (row) => {
  // 先获取检验单详情，确保数据完整
  handleGetInspectionDetail(row.id).then(() => {
    reportDialogVisible.value = true;
  }).catch(error => {
    ElMessage.error('获取检验报告数据失败: ' + error.message);
  });
}
// 复检
const handleReview = (row) => {
  ElMessageBox.confirm('确定要对该检验单进行复检吗?', '复检确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    // 先获取检验单详情
    handleGetInspectionDetail(row.id).then(() => {
      // 复制当前检验单信息作为新的检验，状态改为review
      inspectForm.id = currentInspection.value.id;
      inspectForm.inspectionNo = currentInspection.value.inspectionNo;
      inspectForm.items = currentInspection.value.items.map(item => ({
        ...item,
        actualValue: item.actualValue || '',
        result: '',
        remarks: ''
      }));

      // 自动填入当前登录用户的真实姓名作为检验员
      inspectForm.inspectorName = getCurrentUserDisplayName();

      inspectForm.inspectionDate = new Date();
      inspectForm.note = (currentInspection.value.note || '') + ' (复检)';

      inspectDialogVisible.value = true;
    }).catch(error => {
      ElMessage.error('准备复检失败: ' + error.message);
    });
  }).catch(() => {
    // 用户取消操作
  });
}
// 获取检验单详情的通用方法
const handleGetInspectionDetail = async (id) => {
  try {
    // 使用统一的API调用方式
    const response = await qualityApi.getFinalInspection(id);
    // axios 拦截器已自动解包，response.data 是详情数据对象
    const data = response.data;
    if (!data) {
      throw new Error('获取检验单详情失败');
    }
    // 后端已输出 camel
    currentInspection.value = {
      ...data,
      items: data.items || [],
      standardNo: data.standardNo || data.templateCode || null
    };
    if (!currentInspection.value.items || currentInspection.value.items.length === 0) {
      currentInspection.value.items = [];
      ElMessage.warning('当前检验单未配置检验项目');
    }

    return currentInspection.value;
  } catch (error) {
    console.error('获取检验单详情失败:', error);
    throw error;
  }
}
// 生成合格证
const handleGenerateCertificate = (row) => {
  // 检查检验单是否合格
  if (row.status !== 'passed') {
    ElMessage.warning('只能为合格的检验单生成合格证书');
    return;
  }

  // 获取检验单详情并显示合格证书
  handleGetInspectionDetail(row.id).then(() => {
    certificateDialogVisible.value = true;
  }).catch(error => {
    ElMessage.error('获取合格证书数据失败: ' + error.message);
  });
}
// 打印报告
const handlePrint = (row) => {
  // 获取检验单详情并显示打印预览
  handleGetInspectionDetail(row.id).then(() => {
    reportDialogVisible.value = true;
    // 延迟一下再执行打印，确保内容已经渲染
    setTimeout(() => {
      handlePrintReport();
    }, 500);
  }).catch(error => {
    ElMessage.error('获取打印数据失败: ' + error.message);
  });
}
// 业务 camel；printService 自动展开 snake 模板占位
const getFinalInspectionPrintData = () => {
  const inspection = currentInspection.value || {}
  const inspectionDate = inspection.actualDate || inspection.plannedDate
  const inspectionNo = inspection.inspectionNo || ''
  const productName = inspection.itemName || inspection.productName || ''
  const productCode = inspection.itemCode || inspection.productCode || ''

  return {
    fqcNo: inspectionNo,
    documentNo: inspectionNo,
    inspectionNo,
    date: formatDate(inspectionDate),
    inspectionDate: formatDate(inspectionDate),
    plannedDate: formatDate(inspection.plannedDate),
    actualDate: formatDate(inspection.actualDate),
    status: getStatusText(inspection.status),
    productCode,
    productName,
    itemCode: productCode,
    itemName: productName,
    referenceNo: inspection.referenceNo || '',
    batchNo: inspection.batchNo || '',
    quantity: inspection.quantity || '',
    qualifiedQuantity: inspection.qualifiedQuantity ?? '',
    unqualifiedQuantity: inspection.unqualifiedQuantity ?? '',
    unitName: inspection.unit || '',
    unit: inspection.unit || '',
    inspector: inspection.inspectorName || '',
    inspectorName: inspection.inspectorName || '',
    standardNo: inspection.standardNo || inspection.templateCode || '',
    standardTypeText: inspection.standardType === 'factory' ? '工厂标准'
      : inspection.standardType === 'customer' ? '客户标准'
        : inspection.standardType === 'industry' ? '行业标准'
          : inspection.standardType === 'national' ? '国家标准'
            : (inspection.standardType || ''),
    remarks: inspection.note || '',
    remark: inspection.note || '',
    note: inspection.note || '',
    printTime: new Date().toLocaleString(),
    items: (inspection.items || []).map((item, index) => ({
      index: index + 1,
      itemCode: item.itemCode || item.code || '',
      itemName: item.itemName || item.name || '',
      specification: item.standard || item.specification || item.dimensionValue || '',
      quantity: item.actualValue || item.quantity || '',
      unitName: item.unit || '',
      result: item.result === 'passed' || item.result === 'pass' ? '合格'
        : item.result === 'failed' || item.result === 'fail' ? '不合格'
          : (item.result || ''),
      remarks: item.remarks || item.remark || '',
      remark: item.remarks || item.remark || ''
    }))
  }
}

// 打印报告实现
const handlePrintReport = async () => {
  try {
    const html = await printService.generateByDefaultTemplate('quality', 'final_inspection', getFinalInspectionPrintData())
    printService.previewDocument(html)
    ElMessage.success('打印预览已打开')
  } catch (error) {
    console.error('打印报告失败:', error)
    ElMessage.error('打印报告失败')
  }
}
// 打印合格证书
const handlePrintCertificate = async () => {
  try {
    const printData = getFinalInspectionPrintData()
    const html = await printService.generateByDefaultTemplate('quality', 'final_inspection_certificate', {
      ...printData,
      certificateNo: `COC-${printData.inspectionNo || new Date().getTime()}`,
      productionDate: printData.plannedDate,
      issueDate: new Date().toLocaleDateString(),
      remarks: printData.remarks || '产品经成品检验合格，准予出货。',
      remark: printData.remarks || '产品经成品检验合格，准予出货。'
    })
    printService.previewDocument(html)
    ElMessage.success('打印预览已打开')
  } catch (error) {
    console.error('打印合格证失败:', error)
    ElMessage.error('打印合格证失败')
  }
}
</script>
<style scoped>
.search-container {
  margin-bottom: var(--spacing-base);
}
.search-buttons {
  display: flex;
  gap: 8px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.unit-text {
  margin-left: 8px;
}
.inspection-criteria {
  margin-top: var(--spacing-base);
}
.criteria-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.criteria-item {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px dashed var(--color-border-lighter);
}
.criteria-item:last-child {
  border-bottom: none;
}
.certificate-container {
  padding: 20px;
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-hover);
}
.certificate-header {
  text-align: center;
  margin-bottom: var(--spacing-lg);
  padding-bottom: 20px;
  border-bottom: 2px solid var(--color-primary);
}
.certificate-title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 10px;
}
/* 添加表格操作按钮的统一样式 */
:deep(.el-table .el-button) {
  vertical-align: middle !important;
}
:deep(.el-table .el-dropdown .el-button) {
  vertical-align: middle !important;
  padding: 2px 4px !important;
  line-height: 1.5 !important;
  height: 24px !important;
}
/* 确保所有按钮图标垂直对齐 */
:deep(.el-button .el-icon) {
  vertical-align: middle !important;
  }
:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 检验结果选择器样式 */
.result-select-passed :deep(.el-input__wrapper) {
  border-color: var(--color-success) !important;
  box-shadow: 0 0 0 1px var(--color-success) inset !important;
}
.result-select-failed :deep(.el-input__wrapper) {
  border-color: var(--color-danger) !important;
  box-shadow: 0 0 0 1px var(--color-danger) inset !important;
}
</style>
