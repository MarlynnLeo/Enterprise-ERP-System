<!--
/**
 * FinalInspection.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="inspection-container">
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
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>成品检验管理</span>
        </div>
      </template>
      
      <!-- 搜索表单 -->
      <div class="search-container">
        <el-row :gutter="16">
          <el-col :span="4">
            <el-input 
              v-model="searchKeyword"
              placeholder="请输入检验单号/工单号/产品名称"
              @keyup.enter="handleSearch"
              clearable >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </el-col>
          
          <el-col :span="3">
            <el-select v-model="statusFilter" placeholder="检验状态" clearable @change="handleSearch" style="width: 100%">
              <el-option label="待检验" value="pending" />
              <el-option label="检验中" value="in_progress" />
              <el-option label="合格" value="passed" />
              <el-option label="不合格" value="failed" />
              <el-option label="复检" value="review" />
            </el-select>
          </el-col>
          
          <el-col :span="5">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              @change="handleSearch"
              style="width: 100%"
            />
          </el-col>
          
          <el-col :span="6">
            <div class="search-buttons">
              <el-button 
                type="primary" 
                @click="handleSearch"
              >
                查询
              </el-button>
              <el-button 
                @click="handleRefresh"
              >
                重置
              </el-button>
              <el-button 
                type="primary" 
                @click="handleCreate"
              
                v-permission="'quality:final'">
                新增
              </el-button>
            </div>
          </el-col>
        </el-row>
      </div>
      <!-- 检验单列表 -->
      <el-table
        :data="inspectionList"
        border
        style="width: 100%; margin-top: 16px;"
        v-loading="loading"
      >
        <el-table-column prop="inspection_no" label="检验单号" min-width="130" />
        <el-table-column prop="item_name" label="产品名称" min-width="180" />
        <el-table-column prop="item_code" label="产品型号" min-width="150" />
        <el-table-column prop="reference_no" label="工单号" min-width="150" />
        <el-table-column prop="batch_no" label="批次号" min-width="170" />
        <el-table-column prop="quantity" label="检验数量" min-width="80">
          <template #default="scope">
            {{ scope.row.quantity }} {{ scope.row.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="qualified_quantity" label="合格数" min-width="80">
          <template #default="scope">
            <span v-if="scope.row.qualified_quantity !== null && scope.row.qualified_quantity !== undefined" style="color: var(--color-success); font-weight: bold;">{{ scope.row.qualified_quantity }}</span>
            <span v-else style="color: var(--color-text-secondary);">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="unqualified_quantity" label="不合格" min-width="80">
          <template #default="scope">
            <span v-if="scope.row.unqualified_quantity > 0" style="color: var(--color-danger); font-weight: bold;">{{ scope.row.unqualified_quantity }}</span>
            <span v-else style="color: var(--color-text-secondary);">{{ scope.row.unqualified_quantity === 0 ? '0' : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="inspection_date" label="检验日期" min-width="110">
          <template #default="scope">
            {{ formatDate(scope.row.inspection_date || scope.row.planned_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="inspector" label="检验员" min-width="90">
          <template #default="scope">
            {{ scope.row.inspector_name || scope.row.inspector || '-' }}
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
        <el-table-column label="操作" fixed="right" min-width="200">
          <template #default="scope">
            <el-button 
              size="small" 
              @click="handleView(scope.row)"
            >
              查看
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="primary"
              @click="handleInspect(scope.row)"
            >
              检验
            </el-button>
            <el-button
              v-if="scope.row.status === 'failed' && reworkStatusMap[scope.row.id]?.allow_reinspection"
              size="small"
              type="primary"
              @click="handleDropdownCommand('review', scope.row)"
            >
              复检
            </el-button>
            <el-tag
              v-else-if="scope.row.status === 'failed' && !reworkStatusMap[scope.row.id]?.allow_reinspection"
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
    <el-dialog
      v-model="createDialogVisible"
      title="新建成品检验单"
      width="650px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="工单号" prop="productionOrderNo">
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
          >
            确认
          </el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 检验弹窗 -->
    <el-dialog
      v-model="inspectDialogVisible"
      :title="`成品检验 - ${inspectForm.inspection_no || ''}`"
      width="960px"
      destroy-on-close
    >
      <el-form ref="inspectFormRef" :model="inspectForm" :rules="inspectRules" label-width="100px">
        <!-- 产品信息头部面板 -->
        <el-descriptions :column="4" border size="small" style="margin-bottom: 16px;">
          <el-descriptions-item label="产品名称">{{ inspectForm.product_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="工单号">{{ inspectForm.reference_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="批次号">{{ inspectForm.batch_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="检验数量">{{ inspectForm.quantity }} {{ inspectForm.unit || '' }}</el-descriptions-item>
        </el-descriptions>
        <!-- 检验项目表格 -->
        <el-form-item label="检验项目" prop="items">
          <div style="width: 100%;">
            <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
              <el-button type="success" size="small" @click="handleAllPassed"><el-icon style="margin-right: 4px;"><Select /></el-icon>全部合格</el-button>
            </div>
            <el-table :data="inspectForm.items" border style="width: 100%;">
              <el-table-column prop="item_name" label="检验项目" width="120" show-overflow-tooltip>
                <template #default="scope">
                  <span>{{ scope.row.item_name }}</span>
                  <el-icon v-if="scope.row.is_critical" style="color: var(--color-warning); margin-left: 4px;" :size="14"><StarFilled /></el-icon>
                </template>
              </el-table-column>
              <el-table-column label="标准±公差" width="150" show-overflow-tooltip>
                <template #default="scope">
                  {{ formatFqcStandard(scope.row) }}
                </template>
              </el-table-column>
              <el-table-column prop="actual_value" label="实测值" width="120">
                <template #default="scope">
                  <el-input 
                    v-model="scope.row.actual_value" 
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
                    <el-option label="合格" value="passed" style="color: var(--color-success); font-weight: bold;" />
                    <el-option label="不合格" value="failed" style="color: var(--color-danger); font-weight: bold;" />
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
            <el-form-item label="合格数量" prop="qualified_quantity">
              <el-input-number 
                v-model="inspectForm.qualified_quantity" 
                :min="0" 
                :max="inspectForm.quantity" 
                :controls="false" 
                style="width: 100%" 
                @change="onQualifiedQuantityChange"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="不合格数量">
              <el-input-number 
                v-model="inspectForm.unqualified_quantity" 
                :min="0" 
                :controls="false" 
                style="width: 100%" 
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
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="检验员" prop="inspector_name">
              <el-input v-model="inspectForm.inspector_name" />
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
          <el-button v-permission="'quality:inspections:create'" type="primary" @click="submitInspection" :loading="submitLoading">提交检验</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 查看检验单弹窗 -->
    <el-dialog
      v-model="viewDialogVisible"
      :title="currentInspection && currentInspection.inspection_no ? `检验单详情 - ${currentInspection.inspection_no}` : '检验单详情'"
      width="800px"
    >
      <template v-if="currentInspection && currentInspection.inspection_no">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="检验单号">{{ currentInspection.inspection_no }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ currentInspection.item_name }}</el-descriptions-item>
          <el-descriptions-item label="检验状态">
            <el-tag :type="getStatusType(currentInspection.status)">
              {{ getStatusText(currentInspection.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="工单号">{{ currentInspection.reference_no }}</el-descriptions-item>
          <el-descriptions-item label="批次号">{{ currentInspection.batch_no }}</el-descriptions-item>
          <el-descriptions-item label="检验日期">{{ formatDate(currentInspection.inspection_date) }}</el-descriptions-item>
          <el-descriptions-item label="检验数量">{{ currentInspection.quantity }} {{ currentInspection.unit }}</el-descriptions-item>
          <el-descriptions-item label="合格数">
            <span v-if="currentInspection.qualified_quantity !== null && currentInspection.qualified_quantity !== undefined" style="color: var(--color-success); font-weight: bold;">{{ currentInspection.qualified_quantity }}</span>
            <span v-else style="color: var(--color-text-secondary);">-</span>
          </el-descriptions-item>
          <el-descriptions-item label="不合格数">
            <span v-if="currentInspection.unqualified_quantity > 0" style="color: var(--color-danger); font-weight: bold;">{{ currentInspection.unqualified_quantity }}</span>
            <span v-else style="color: var(--color-text-secondary);">{{ currentInspection.unqualified_quantity === 0 ? '0' : '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="检验员">{{ currentInspection.inspector_name || currentInspection.inspector || '-' }}</el-descriptions-item>
          <el-descriptions-item label="合格率">
            <span v-if="currentInspection.qualified_quantity !== null && currentInspection.quantity" 
                  :style="{ color: (currentInspection.qualified_quantity / currentInspection.quantity) >= 1 ? '#67C23A' : '#F56C6C', fontWeight: 'bold' }">
              {{ ((currentInspection.qualified_quantity / currentInspection.quantity) * 100).toFixed(1) }}%
            </span>
            <span v-else style="color: var(--color-text-secondary);">-</span>
          </el-descriptions-item>
          <el-descriptions-item label="标准编号">{{ currentInspection.standard_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="3">{{ currentInspection.note || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="inspection-items" style="margin-top: 20px;">
          <h4>检验项目</h4>
          <el-table :data="currentInspection.items" border style="width: 100%">
            <el-table-column prop="item_name" label="项目名称" min-width="140" />
            <el-table-column prop="standard" label="标准" min-width="160" />
            <el-table-column prop="actual_value" label="实测值" min-width="100" align="center" />
            <el-table-column label="结果" min-width="90" align="center">
              <template #default="scope">
                <el-tag v-if="scope.row.result === 'passed' || scope.row.result === 'pass'" type="success" size="small">合格</el-tag>
                <el-tag v-else-if="scope.row.result === 'failed' || scope.row.result === 'fail'" type="danger" size="small">不合格</el-tag>
                <span v-else style="color: var(--color-text-secondary);">{{ scope.row.result || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="remarks" label="备注" min-width="140" />
          </el-table>
        </div>
      </template>
      <template v-else>
        <el-empty description="暂无检验单数据" />
      </template>
    </el-dialog>
    
    <!-- 检验报告弹窗 -->
    <el-dialog
      v-model="reportDialogVisible"
      title="检验报告"
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
            <span class="info-value">{{ currentInspection.inspection_no }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">产品名称：</span>
            <span class="info-value">{{ currentInspection.item_name }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">产品型号：</span>
            <span class="info-value">{{ currentInspection.item_code }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">工单号：</span>
            <span class="info-value">{{ currentInspection.reference_no }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">批次号：</span>
            <span class="info-value">{{ currentInspection.batch_no }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">检验数量：</span>
            <span class="info-value">{{ currentInspection.quantity }} {{ currentInspection.unit }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">检验日期：</span>
            <span class="info-value">{{ formatDate(currentInspection.actual_date) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">检验员：</span>
            <span class="info-value">{{ currentInspection.inspector_name || currentInspection.inspector || '-' }}</span>
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
          <el-table :data="currentInspection.items" border style="width: 100%">
            <el-table-column type="index" width="50" label="序号" />
            <el-table-column prop="item_name" label="检验项目" width="150" />
            <el-table-column prop="standard" label="检验标准" min-width="180" />
            <el-table-column prop="type" label="检验类型" width="100">
              <template #default="scope">
                {{ getTypeText(scope.row.type) }}
              </template>
            </el-table-column>
            <el-table-column prop="actual_value" label="实际值" width="120" />
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
    </el-dialog>
    
    <!-- 合格证书弹窗 -->
    <el-dialog
      v-model="certificateDialogVisible"
      title="合格证书"
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
            <span class="info-value">{{ currentInspection.item_name }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">产品型号：</span>
            <span class="info-value">{{ currentInspection.item_code }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">批次号：</span>
            <span class="info-value">{{ currentInspection.batch_no }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">生产日期：</span>
            <span class="info-value">{{ formatDate(currentInspection.planned_date) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">检验日期：</span>
            <span class="info-value">{{ formatDate(currentInspection.actual_date) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">检验标准：</span>
            <span class="info-value">{{ currentInspection.standard_type === 'factory' ? '工厂标准' : 
                                   currentInspection.standard_type === 'customer' ? '客户标准' :
                                   currentInspection.standard_type === 'industry' ? '行业标准' :
                                   currentInspection.standard_type === 'national' ? '国家标准' : '未知' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">标准编号：</span>
            <span class="info-value">{{ currentInspection.standard_no }}</span>
          </div>
          
          <div class="certificate-declaration">
            <p>本产品的质量符合相关质量标准，特此证明。</p>
          </div>
        </div>
        
        <div class="certificate-seal">
          <div class="seal-item">
            <p>检验员：{{ currentInspection.inspector_name || currentInspection.inspector || '-' }}</p>
            <p>日期：{{ formatDate(currentInspection.actual_date) }}</p>
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
    </el-dialog>
  </div>
</template>
<script setup>
import { parseListData } from '@/utils/responseParser';
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, StarFilled } from '@element-plus/icons-vue'
import 'dayjs'
import { qualityApi, productionApi } from '@/services/api'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/utils/helpers/dateUtils'
// 权限store
const authStore = useAuthStore()
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
// 表格数据相关
const loading = ref(false)
const submitLoading = ref(false)
const inspectionList = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
// 创建检验单相关
const createDialogVisible = ref(false)
const formRef = ref(null)
const form = reactive({
  productionOrderNo: '',
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
  productionOrderNo: [{ required: true, message: '请选择工单号', trigger: 'change' }],
  batchNo: [{ required: true, message: '请输入批次号', trigger: 'blur' }],
  quantity: [{ required: true, message: '请输入检验数量', trigger: 'blur' }],
  standardType: [{ required: true, message: '请选择标准类型', trigger: 'change' }],
  standardNo: [{ required: true, message: '请输入标准编号', trigger: 'blur' }],
  plannedDate: [{ required: true, message: '请选择计划检验日期', trigger: 'change' }]
}
// 工单选项
const productionOrderOptions = ref([])
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
// 在script setup部分添加
const viewDialogVisible = ref(false)
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
      pageSize: 1000
    });
    const taskItems = parseListData(response, { enableLog: false });
    if (taskItems.length > 0) {
      productionOrderOptions.value = taskItems
        .filter(task => task.status === 'completed')
        .map(task => ({
          id: task.id,
          orderNo: task.code || task.task_no,
          productId: task.product_id || task.material_id || null, // 关键：保存物料/产品ID
          productName: task.productName || task.product_name || '未知产品',
          productCode: task.specs || task.productCode || task.product_code || '未知型号',
          batchNo: task.batchNo || task.batch_no || '',
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
      pageSize: 100,
      page: 1
    });
    const templatesData = parseListData(response, { enableLog: false });
    if (templatesData.length > 0) {
      // 优先专属模板，没有则回退到通用模板
      const specificTemplates = templatesData.filter(t => {
        if (String(t.material_type) === String(materialId)) return true;
        if (t.material_types) {
          try {
            const types = typeof t.material_types === 'string' ? JSON.parse(t.material_types) : t.material_types;
            if (Array.isArray(types) && types.map(String).includes(String(materialId))) return true;
          } catch { /* 忽略 */ }
        }
        return false;
      });
      const generalTemplates = templatesData.filter(t => t.is_general);
      const effectiveTemplates = specificTemplates.length > 0 ? specificTemplates : generalTemplates;
      if (effectiveTemplates.length > 0) {
        const template = effectiveTemplates.find(t => t.is_default) || effectiveTemplates[0];
        const templateItems = template.items || template.InspectionItems || [];
        if (templateItems.length > 0) {
          currentTemplateItems.value = templateItems.map(item => ({
            id: item.id,
            item_name: item.item_name,
            standard: item.standard,
            type: item.type_name || item.type || 'visual',
            is_critical: item.is_critical || false
          }));
          if (template.is_general) {
            ElMessage.info(`已自动使用成品通用模板: ${template.template_name}`);
          }
          return; // 成功获取模板，直接返回
        }
      }
    }
    currentTemplateItems.value = [];
    throw new Error('未找到可用的成品检验模板');
  } catch (error) {
    console.error('获取检验模板失败:', error);
    currentTemplateItems.value = [];
    throw error;
  } finally {
    submitLoading.value = false;
  }
}
// 从后端获取各状态的统计总数（使用轻量请求 limit=1 只取 total 字段）
const calculateInspectionStats = async () => {
  try {
    const [pendingRes, passedRes, failedRes, reviewRes] = await Promise.all([
      qualityApi.getFinalInspections({ status: 'pending', page: 1, limit: 1 }),
      qualityApi.getFinalInspections({ status: 'passed', page: 1, limit: 1 }),
      qualityApi.getFinalInspections({ status: 'failed', page: 1, limit: 1 }),
      qualityApi.getFinalInspections({ status: 'review', page: 1, limit: 1 }),
    ])
    const getTotal = (res) => res?.data?.total || 0
    const pending = getTotal(pendingRes)
    const passed = getTotal(passedRes)
    const failed = getTotal(failedRes)
    const review = getTotal(reviewRes)
    inspectionStats.value = {
      total: pending + passed + failed + review,
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
    // 保存产品ID和产品信息
    form.productId = order.productId || order.id; // 优先使用产品/物料ID
    form.productName = order.productName
    form.productCode = order.productCode
    form.unit = order.unit
    
    form.batchNo = order.batchNo || ''
    
    // 使用物料/产品ID查询检验模板（而非工单ID）
    const materialId = order.productId || order.id;
    fetchInspectionTemplate(materialId)
    
    // 生成标准编号
    form.standardNo = orderNo.replace('PD', 'STD') + '-FQC'
  }
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
  // 并行查询所有 failed 检验单的返工状态
  const promises = failedInspections.map(async (row) => {
    try {
      const res = await api.get(`/rework-tasks/by-inspection/${row.id}`);
      const data = res.data?.data || res.data;
      reworkStatusMap.value[row.id] = data;
    } catch {
      // 查询失败时默认不允许复检
      reworkStatusMap.value[row.id] = { allow_reinspection: false };
    }
  });
  await Promise.all(promises);
}
/**
 * 根据检验单的返工闭环状态，返回对应的提示文字
 */
const getReworkHintText = (inspectionId) => {
  const status = reworkStatusMap.value[inspectionId];
  if (!status) return '查询中...';
  if (!status.has_ncp) return '待处置';
  if (!status.has_rework && status.disposition === 'rework') return '待返工';
  if (!status.has_rework) return status.disposition === 'scrap' ? '已报废' : '待处理';
  if (status.rework_status === 'pending') return '返工待分配';
  if (status.rework_status === 'in_progress') return '返工中';
  if (status.rework_completed) return '复检'; // 不应该走到这里，因为 allow_reinspection 已经为 true
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
    } else {
      form[key] = ''
    }
  })
  
  createDialogVisible.value = true
}
// 提交表单
const submitForm = async () => {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    
    // 获取选中的工单信息
    const _selectedOrder = productionOrderOptions.value.find(
      order => order.orderNo === form.productionOrderNo
    );
    // 准备数据
    const formData = {
      inspection_type: 'final',
      reference_id: form.productId,  // 使用productId作为reference_id
      reference_no: form.productionOrderNo,
      product_id: form.productId,
      product_name: form.productName,
      product_code: form.productCode,
      batch_no: form.batchNo,
      quantity: form.quantity,
      unit: form.unit,
      standard_type: form.standardType,
      standard_no: form.standardNo,
      planned_date: formatDate(form.plannedDate),
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
  try {
    // 使用统一的API调用方式
    const response = await qualityApi.getFinalInspection(row.id);
    // axios 拦截器已自动解包，response.data 是详情数据对象
    const data = response.data;
    if (data) {
      // 确保currentInspection中包含items属性，并处理字段映射
      currentInspection.value = {
        ...data,
        items: data.items || [],
        // 字段映射处理
        inspection_date: data.actual_date || data.planned_date || data.inspection_date,
        inspector_name: data.inspector_name || data.inspector,
        item_name: data.item_name || data.product_name || data.material_name,
        reference_no: data.reference_no || data.task_no || data.order_no,
        // 使用模板编号作为标准编号
        standard_no: data.template_code || data.standard_no
      };
    } else {
      throw new Error('获取检验单详情失败');
    }
    
    if (!currentInspection.value.items || currentInspection.value.items.length === 0) {
      currentInspection.value.items = [];
      ElMessage.warning('当前检验单未配置检验项目');
    }
    
    viewDialogVisible.value = true;
  } catch (error) {
    console.error('获取检验单详情失败:', error);
    ElMessage.error('获取检验单详情失败: ' + error.message);
  }
}
// 修改检验弹窗相关功能
const inspectDialogVisible = ref(false)
const inspectFormRef = ref(null)
const inspectForm = reactive({
  id: '',
  inspection_no: '',
  items: [],
  inspector_name: '',
  inspectionDate: new Date(),
  note: '',
  // 产品相关字段
  product_id: '',
  product_name: '',
  quantity: 0,
  qualified_quantity: 0,
  unqualified_quantity: 0,
  unit_id: null,
  unit: '',
  batch_no: '',
  reference_no: ''
})
// 合格数量变更时自动计算不合格数量
const onQualifiedQuantityChange = (val) => {
  inspectForm.unqualified_quantity = Math.max(0, (inspectForm.quantity || 0) - (val || 0));
}
// “全部合格”快捷按钮——一键将所有检验项标记为合格
const handleAllPassed = () => {
  if (!inspectForm.items || inspectForm.items.length === 0) return
  inspectForm.items.forEach(item => {
    item.result = 'passed'
    if (!item.actual_value) {
      // 非尺寸类项填 OK，尺寸类填标准值
      item.actual_value = item.type === 'dimension' && item.standard_value ? String(item.standard_value) : 'OK'
    }
  })
  // 同时将合格数量设为总数
  inspectForm.qualified_quantity = inspectForm.quantity
  inspectForm.unqualified_quantity = 0
  ElMessage.success('已将所有检验项标记为合格')
}
// 格式化FQC检验项的标准±公差展示
const formatFqcStandard = (item) => {
  if (item.type === 'dimension' && item.standard_value) {
    const tolerance = item.tolerance_upper && item.tolerance_lower
      ? ` (+${item.tolerance_upper}/-${Math.abs(item.tolerance_lower)})`
      : ''
    return `${item.standard_value}${tolerance}`
  }
  return item.standard || '-'
}
// 尺寸类检验项输入后自动检查公差
const checkFqcTolerance = (item) => {
  if (item.type !== 'dimension' || !item.standard_value || !item.actual_value) return
  const actual = parseFloat(item.actual_value)
  if (isNaN(actual)) return
  const std = parseFloat(item.standard_value)
  const upper = parseFloat(item.tolerance_upper) || 0
  const lower = parseFloat(item.tolerance_lower) || 0
  // 判定是否在公差范围内
  if (actual >= (std + lower) && actual <= (std + upper)) {
    item.result = 'passed'
  } else {
    item.result = 'failed'
  }
}
// 检验表单验证规则
const inspectRules = {
  inspector_name: [
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
    inspectForm.inspection_no = inspection.inspection_no;
    // 设置产品相关信息
    inspectForm.product_id = inspection.product_id;
    inspectForm.product_name = inspection.product_name || inspection.item_name || '';
    inspectForm.quantity = inspection.quantity || 1;
    inspectForm.qualified_quantity = inspection.qualified_quantity || inspection.quantity || 0;
    inspectForm.unqualified_quantity = inspection.unqualified_quantity || 0;
    inspectForm.unit_id = inspection.unit_id || null;
    inspectForm.unit = inspection.unit || '';
    inspectForm.batch_no = inspection.batch_no || '';
    inspectForm.reference_no = inspection.reference_no || '';
    
    // 确保检验项目数据
    // 这部分逻辑与handleView保持一致，确保两种方式获取的检验项目一致
    const inspectionItems = inspection.items || [];
    
    // 如果没有检验项，将在后面使用检验模板
    
    // 如果从API获取到了检验项目，使用这些项目
    if (inspectionItems.length > 0) {
      inspectForm.items = inspectionItems.map(item => ({
        ...item,
        // 优先使用type_name，如果没有则使用原始type，或者通过getTypeText转换
        type: item.type_name || (typeof item.type === 'string' ? item.type : getTypeText(item.type)),
        actual_value: item.actual_value || '',
        result: item.result || '',
        remarks: item.remarks || ''
      }));
    } else {
      // 尝试获取检验模板
      try {
        // 使用物料/产品ID获取检验模板
        const materialId = inspection.material_id || inspection.product_id;
        if (!materialId) {
          throw new Error('缺少物料/产品ID');
        }
        
        await fetchInspectionTemplate(materialId);
        if (currentTemplateItems.value && currentTemplateItems.value.length > 0) {
          inspectForm.items = currentTemplateItems.value.map(item => ({
            id: item.id,
            item_name: item.item_name,
            standard: item.standard,
            type: item.type,
            actual_value: '',
            result: '',
            remarks: ''
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
    
    // 打印最终要使用的检验项目
    // 自动填入当前登录用户的真实姓名作为检验员
    const currentUser = authStore.user;
    if (currentUser) {
      // 优先使用real_name字段作为真实姓名
      inspectForm.inspector_name = currentUser.real_name || currentUser.name || '';
      } else {
      // 如果authStore中没有用户信息，尝试从localStorage获取
      const localUser = JSON.parse(localStorage.getItem('user') || 'null');
      if (localUser) {
        inspectForm.inspector_name = localUser.real_name || localUser.name || '';
        } else {
        inspectForm.inspector_name = '';
      }
    }
    
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
    if (inspectForm.items.some(item => !item.actual_value)) {
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
    
    // 准备提交的数据
    const submitData = {
      id: inspectForm.id,
      inspection_no: inspectForm.inspection_no,
      items: inspectForm.items,
      inspector_name: inspectForm.inspector_name,
      actual_date: formatDate(inspectForm.inspectionDate),
      note: inspectForm.note,
      status: status,
      quantity: inspectForm.quantity,
      qualified_quantity: inspectForm.qualified_quantity || 0,
      unqualified_quantity: inspectForm.unqualified_quantity || 0
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
      inspectForm.inspection_no = currentInspection.value.inspection_no;
      inspectForm.items = currentInspection.value.items.map(item => ({
        ...item,
        actual_value: item.actual_value || '',
        result: '',
        remarks: ''
      }));
      
      // 自动填入当前登录用户的真实姓名作为检验员
      const currentUser = authStore.user;
      if (currentUser) {
        // 优先使用real_name字段作为真实姓名
        inspectForm.inspector_name = currentUser.real_name || currentUser.name || '';
        } else {
        // 如果authStore中没有用户信息，尝试从localStorage获取
        const localUser = JSON.parse(localStorage.getItem('user') || 'null');
        if (localUser) {
          inspectForm.inspector_name = localUser.real_name || localUser.name || '';
          } else {
          inspectForm.inspector_name = '';
        }
      }
      
      inspectForm.inspectionDate = new Date();
      inspectForm.note = currentInspection.value.note + ' (复检)';
      
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
    // 确保currentInspection中包含items属性
    currentInspection.value = {
      ...data,
      items: data.items || [],
      // 字段映射处理
      inspection_date: data.actual_date || data.planned_date || data.inspection_date,
      inspector_name: data.inspector_name || data.inspector,
      item_name: data.item_name || data.product_name || data.material_name,
      reference_no: data.reference_no || data.task_no || data.order_no,
      // 使用模板编号作为标准编号
      standard_no: data.template_code || data.standard_no
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
// 打印报告实现
const handlePrintReport = () => {
  // 获取报告内容
  const reportContent = document.querySelector('.report-container');
  if (!reportContent) {
    ElMessage.error('无法获取报告内容');
    return;
  }
  
  // 创建打印窗口
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    ElMessage.error('无法创建打印窗口，请检查浏览器是否阻止了弹出窗口');
    return;
  }
  
  // 添加样式
  const style = printWindow.document.createElement('style');
  style.textContent = `
    body { font-family: Arial, sans-serif; margin: 20px; }
    .text-center { text-align: center; }
    .report-header { margin-bottom: 20px; }
    .info-row { margin: 8px 0; }
    .info-label { font-weight: bold; display: inline-block; width: 120px; }
    .report-items { margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .report-signatures { margin-top: 50px; display: flex; justify-content: space-between; }
    .signature-item { width: 45%; }
    @media print { button { display: none; } }
  `;
  
  // 设置标题
  printWindow.document.title = `检验报告 - ${currentInspection.value.inspection_no}`;
  
  // 添加内容
  printWindow.document.body.replaceChildren(reportContent.cloneNode(true));
  printWindow.document.head.appendChild(style);
  
  // 添加打印脚本
  const script = printWindow.document.createElement('script');
  script.textContent = 'window.onload = function() { window.print(); }';
  printWindow.document.body.appendChild(script);
}
// 打印合格证书
const handlePrintCertificate = () => {
  // 获取证书内容
  const certificateContent = document.querySelector('.certificate-container');
  if (!certificateContent) {
    ElMessage.error('无法获取证书内容');
    return;
  }
  
  // 创建打印窗口
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    ElMessage.error('无法创建打印窗口，请检查浏览器是否阻止了弹出窗口');
    return;
  }
  
  // 添加样式
  const style = printWindow.document.createElement('style');
  style.textContent = `
    body { font-family: Arial, sans-serif; margin: 20px; }
    .text-center { text-align: center; }
    .certificate-header { margin-bottom: 20px; }
    .info-row { margin: 12px 0; }
    .info-label { font-weight: bold; display: inline-block; width: 120px; }
    .certificate-declaration { margin: 30px 0; }
    .certificate-seal { margin-top: 80px; display: flex; justify-content: space-between; }
    .seal-item { width: 30%; }
    .company-seal { margin: 20px 0; height: 100px; border: 2px dashed #999; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    @media print { button { display: none; } }
  `;
  
  // 设置标题
  printWindow.document.title = `合格证书 - ${currentInspection.value.inspection_no}`;
  
  // 添加内容
  printWindow.document.body.replaceChildren(certificateContent.cloneNode(true));
  printWindow.document.head.appendChild(style);
  
  // 添加打印脚本
  const script = printWindow.document.createElement('script');
  script.textContent = 'window.onload = function() { window.print(); }';
  printWindow.document.body.appendChild(script);
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
/* 使用全局样式 common-styles.css 中的 .statistics-row 和 .stat-card */
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
  border-bottom: 1px dashed #eee;
}
.criteria-item:last-child {
  border-bottom: none;
}
.certificate-container {
  padding: 20px;
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
  background-color: #f7f7f7;
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
/* 检验结果选择器样式 */
.result-select-passed :deep(.el-input__wrapper) {
  border-color: var(--color-success) !important;
  box-shadow: 0 0 0 1px #67C23A inset !important;
}
.result-select-failed :deep(.el-input__wrapper) {
  border-color: var(--color-danger) !important;
  box-shadow: 0 0 0 1px #F56C6C inset !important;
}
</style> 
