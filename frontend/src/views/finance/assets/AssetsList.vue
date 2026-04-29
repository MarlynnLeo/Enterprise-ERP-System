<!--
/**
 * AssetsList.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="assets-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>固定资产管理</h2>
          <p class="subtitle">管理固定资产与折旧</p>
        </div>
        <el-button v-permission="'finance:assets:create'" type="primary" :icon="Plus" @click="showAddDialog">新增资产</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="资产编号">
          <el-input  v-model="searchForm.assetCode" placeholder="输入资产编号" clearable ></el-input>
        </el-form-item>
        <el-form-item label="资产名称">
          <el-input  v-model="searchForm.assetName" placeholder="输入资产名称" clearable ></el-input>
        </el-form-item>
        <el-form-item label="类别">
          <el-select  v-model="searchForm.categoryId" placeholder="选择类别" clearable>
            <el-option
              v-for="item in categoryOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select  v-model="searchForm.status" placeholder="选择状态" clearable>
            <el-option label="在用" value="in_use"></el-option>
            <el-option label="闲置" value="idle"></el-option>
            <el-option label="维修" value="under_repair"></el-option>
            <el-option label="报废" value="disposed"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchAssets">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ assetStats.total }}</div>
        <div class="stat-label">资产总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(assetStats.totalValue) }}</div>
        <div class="stat-label">资产原值合计</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value value-text">{{ formatCurrency(assetStats.totalNetValue || 0) }}</div>
        <div class="stat-label">资产净值合计</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ assetStats.inUseCount }}</div>
        <div class="stat-label">在用资产</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ assetStats.idleCount }}</div>
        <div class="stat-label">闲置资产</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ assetStats.underRepairCount }}</div>
        <div class="stat-label">维修中</div>
      </el-card>
    </div>
    
    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="assetList"
        style="width: 100%"
        border
        v-loading="loading"
      >
        <el-table-column prop="assetCode" label="资产编号" width="200" show-overflow-tooltip>
          <template #default="scope">
            <el-link type="primary" class="cell-link" @click="goToDetail(scope.row.id)">{{ scope.row.assetCode }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="assetName" label="资产名称" width="180" show-overflow-tooltip></el-table-column>
        <el-table-column prop="categoryName" label="类别" width="100" show-overflow-tooltip></el-table-column>
        <el-table-column prop="purchaseDate" label="购入日期" width="100">
          <template #default="scope">
            {{ formatDate(scope.row.purchaseDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="originalValue" label="原值" width="120" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.originalValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="netValue" label="净值" width="120" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.netValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="location" label="存放地点" width="110" show-overflow-tooltip />
        <el-table-column prop="department" label="使用部门" width="100" show-overflow-tooltip />
        <el-table-column prop="responsible" label="责任人" width="100" show-overflow-tooltip />
        <el-table-column label="状态" min-width="90">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审核" width="100" align="center" fixed="right">
          <template #default="scope">
            <el-tag v-if="scope.row.auditStatus === 'approved'" type="success" effect="dark" size="small">已审核</el-tag>
            <el-tag v-else type="info" effect="plain" size="small">待审核</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <el-button type="primary" size="small" @click="handleEdit(scope.row)" v-if="!isDisposed(scope.row.status) && scope.row.auditStatus !== 'approved'"
              v-permission="'finance:assets:update'">编辑</el-button>
            <el-button type="success" size="small" @click="handleAudit(scope.row, 'approve')" v-if="scope.row.auditStatus !== 'approved' && !isDisposed(scope.row.status)">审核</el-button>
            <el-dropdown v-if="!isDisposed(scope.row.status)" trigger="click" @command="(cmd) => handleMoreCommand(cmd, scope.row)" style="margin-left: 8px;">
              <el-button size="small">
                更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="unaudit" v-if="scope.row.auditStatus === 'approved'">反审核</el-dropdown-item>
                  <el-dropdown-item command="impairment" v-if="scope.row.status === 'in_use' || scope.row.status === 'idle'">资产减值</el-dropdown-item>
                  <el-dropdown-item command="transfer">资产调拨</el-dropdown-item>
                  <el-dropdown-item command="split">资产拆分</el-dropdown-item>
                  <el-dropdown-item command="dispose" divided>资产处置</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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
        >
        </el-pagination>
      </div>
    </el-card>
    
    <!-- 添加/编辑对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="650px"
    >
      <el-form :model="assetForm" :rules="assetRules" ref="assetFormRef" label-width="100px">
        <el-form-item label="资产编号" prop="assetCode">
          <el-input  v-model="assetForm.assetCode" placeholder="请输入资产编号，留空将自动生成" clearable >
            <template #append v-if="!assetForm.id">
              <el-button @click="generateCode">自动获取</el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="资产名称" prop="assetName">
          <el-input v-model="assetForm.assetName" placeholder="请输入资产名称"></el-input>
        </el-form-item>
        <el-form-item label="资产类别" prop="categoryId">
          <el-select v-model="assetForm.categoryId" placeholder="请选择资产类别" style="width: 100%" @change="onCategoryChange">
            <el-option
              v-for="item in categoryOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            ></el-option>
          </el-select>
        </el-form-item>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="购入日期" prop="purchaseDate">
              <el-date-picker
                v-model="assetForm.purchaseDate"
                type="date"
                placeholder="选择购入日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="原值" prop="originalValue">
              <el-input v-model="assetForm.originalValue" placeholder="请输入原值" style="width: 100%">
                <template #prepend>¥</template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="使用年限" prop="usefulLife">
              <el-input v-model="assetForm.usefulLife" placeholder="请输入年限" style="width: 100%">
                <template #append>年</template>
              </el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="残值率" prop="salvageRate">
              <el-input v-model="assetForm.salvageRate" placeholder="请输入残值率" style="width: 100%">
                <template #append>%</template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item label="折旧方法" prop="depreciationMethod">
          <el-radio-group v-model="assetForm.depreciationMethod">
            <el-radio value="straight_line">直线法</el-radio>
            <el-radio value="double_declining">双倍余额递减法</el-radio>
            <el-radio value="sum_of_years">年数总和法</el-radio>
            <el-radio value="no_depreciation">不计提折旧</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="存放地点" prop="location">
              <el-input v-model="assetForm.location" placeholder="请输入存放地点"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="使用部门" prop="department">
              <el-select v-model="assetForm.department" placeholder="请选择部门" style="width: 100%">
                <el-option
                  v-for="item in departmentOptions"
                  :key="item.id"
                  :label="item.name"
                  :value="item.name"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="责任人" prop="responsible">
              <el-input v-model="assetForm.responsible" placeholder="请输入责任人"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="assetForm.status" placeholder="请选择状态" style="width: 100%">
                <el-option label="在用" value="in_use"></el-option>
                <el-option label="闲置" value="idle"></el-option>
                <el-option label="维修" value="under_repair"></el-option>
                <el-option label="报废" value="disposed"></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item label="备注" prop="notes">
          <el-input
            v-model="assetForm.notes"
            type="textarea"
            :rows="3"
            placeholder="请输入备注信息"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveAsset" :loading="saveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 资产调拨对话框 -->
    <el-dialog
      :title="transferDialogTitle"
      v-model="transferDialogVisible"
      width="650px"
    >
      <el-form :model="transferForm" :rules="transferRules" ref="transferFormRef" label-width="100px">
        <el-form-item label="资产编号" prop="assetCode">
          <el-input v-model="transferForm.assetCode" placeholder="请输入资产编号" readonly></el-input>
        </el-form-item>
        <el-form-item label="资产名称" prop="assetName">
          <el-input v-model="transferForm.assetName" placeholder="请输入资产名称" readonly></el-input>
        </el-form-item>
        <el-form-item label="原部门" prop="originalDepartment">
          <el-input v-model="transferForm.originalDepartment" placeholder="请输入原部门" readonly></el-input>
        </el-form-item>
        <el-form-item label="原责任人" prop="originalResponsible">
          <el-input v-model="transferForm.originalResponsible" placeholder="请输入原责任人" readonly></el-input>
        </el-form-item>
        <el-form-item label="原存放地点" prop="originalLocation">
          <el-input v-model="transferForm.originalLocation" placeholder="请输入原存放地点" readonly></el-input>
        </el-form-item>
        <el-form-item label="新部门" prop="newDepartment">
          <el-select v-model="transferForm.newDepartment" placeholder="请选择新部门" style="width: 100%">
            <el-option
              v-for="item in departmentOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="新责任人" prop="newResponsible">
          <el-input v-model="transferForm.newResponsible" placeholder="请输入新责任人"></el-input>
        </el-form-item>
        <el-form-item label="新存放地点" prop="newLocation">
          <el-input v-model="transferForm.newLocation" placeholder="请输入新存放地点"></el-input>
        </el-form-item>
        <el-form-item label="调拨日期" prop="transferDate">
          <el-date-picker
            v-model="transferForm.transferDate"
            type="date"
            placeholder="选择调拨日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="调拨原因" prop="transferReason">
          <el-input v-model="transferForm.transferReason" placeholder="请输入调拨原因"></el-input>
        </el-form-item>
        <el-form-item label="备注" prop="notes">
          <el-input
            v-model="transferForm.notes"
            type="textarea"
            :rows="3"
            placeholder="请输入备注信息"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="transferDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitTransfer" :loading="transferLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 资产处置对话框 -->
    <el-dialog
      title="资产处置"
      v-model="disposeDialogVisible"
      width="500px"
    >
      <el-form :model="disposeForm" :rules="disposeRules" ref="disposeFormRef" label-width="100px">
        <el-form-item label="资产编号">
          <span>{{ disposeForm.assetCode }}</span>
        </el-form-item>
        <el-form-item label="资产名称">
          <span>{{ disposeForm.assetName }}</span>
        </el-form-item>
        <el-form-item label="当前净值">
          <span class="value-text">{{ formatCurrency(disposeForm.netValue) }}</span>
        </el-form-item>
        <el-form-item label="处置方式" prop="disposeType">
          <el-select v-model="disposeForm.disposeType" placeholder="请选择处置方式" style="width: 100%">
            <el-option label="报废" value="scrap"></el-option>
            <el-option label="变卖" value="sale"></el-option>
            <el-option label="损毁" value="damage"></el-option>
            <el-option label="其他" value="other"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="处置金额" prop="disposeAmount">
          <el-input-number v-model="disposeForm.disposeAmount" :precision="2" :min="0" style="width: 100%"></el-input-number>
        </el-form-item>
        <div style="margin-bottom: 15px; text-align: right; color: var(--color-text-secondary); font-size: 13px;">
          预计处置损益: <span :class="disposeProfitLoss >= 0 ? 'value-text' : 'danger-text'">{{ disposeProfitLoss >= 0 ? '+' : '' }}{{ formatCurrency(disposeProfitLoss) }}</span>
        </div>
        <el-form-item label="处置日期" prop="disposeDate">
          <el-date-picker
            v-model="disposeForm.disposeDate"
            type="date"
            placeholder="选择处置日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="处置原因" prop="reason">
          <el-input
            v-model="disposeForm.reason"
            type="textarea"
            :rows="3"
            placeholder="请输入处置原因"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="disposeDialogVisible = false">取消</el-button>
          <el-button type="danger" @click="submitDispose" :loading="disposeLoading">确认处置</el-button>
        </span>
      </template>
    </el-dialog>
    <!-- 资产拆分对话框 -->
    <el-dialog
      title="资产拆分"
      v-model="splitDialogVisible"
      width="500px"
    >
      <el-form :model="splitForm" :rules="splitRules" ref="splitFormRef" label-width="110px">
        <el-form-item label="原资产编号">
          <span>{{ splitForm.assetCode }}</span>
        </el-form-item>
        <el-form-item label="原资产名称">
          <span>{{ splitForm.assetName }}</span>
        </el-form-item>
        <el-form-item label="资产总原值">
          <span class="value-text">{{ formatCurrency(splitForm.originalValue) }}</span>
        </el-form-item>
        <el-form-item label="拆分金额" prop="split_cost">
          <el-input-number v-model="splitForm.split_cost" :precision="2" :min="0.01" :max="splitForm.originalValue - 0.01" style="width: 100%"></el-input-number>
          <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">拆出部分的价值，剩余原值将被扣除</div>
        </el-form-item>
        <el-form-item label="新资产名称" prop="new_asset_name">
          <el-input v-model="splitForm.new_asset_name" placeholder="默认为：原名称-拆分X"></el-input>
        </el-form-item>
        <el-form-item label="新使用部门">
          <el-select v-model="splitForm.department_id" placeholder="选填，默认同原资产" style="width: 100%" clearable>
            <el-option
              v-for="item in departmentOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="新存放地点">
          <el-input v-model="splitForm.location_id" placeholder="选填，默认同原资产"></el-input>
        </el-form-item>
        <el-form-item label="新责任人">
          <el-input v-model="splitForm.custodian" placeholder="选填，默认同原资产"></el-input>
        </el-form-item>
        <el-form-item label="拆分原因" prop="reason">
          <el-input
            v-model="splitForm.reason"
            type="textarea"
            :rows="2"
            placeholder="请输入资产拆分的原因"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="splitDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitSplit" :loading="splitLoading">确认拆分</el-button>
        </span>
      </template>
    </el-dialog>
    <!-- 计提减值对话框 -->
    <el-dialog v-model="impairmentDialogVisible" title="计提资产减值" width="500px">
      <el-form :model="impairmentForm" :rules="impairmentRules" ref="impairmentFormRef" label-width="100px">
        <el-alert
          title="当前资产净值"
          :description="'¥ ' + formatCurrency(impairmentForm.netValue)"
          type="warning"
          :closable="false"
          style="margin-bottom: 20px"
        />
        <el-form-item label="减值金额" prop="impairment_amount">
          <el-input-number v-model="impairmentForm.impairment_amount" :min="0.01" :max="impairmentForm.netValue" :precision="2" :step="100" style="width: 100%" />
        </el-form-item>
        <el-form-item label="减值日期" prop="impairment_date">
          <el-date-picker v-model="impairmentForm.impairment_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="减值原因" prop="reason">
          <el-input v-model="impairmentForm.reason" type="textarea" :rows="3" placeholder="请输入发生减值的原因（如：损坏、技术淘汰等）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="impairmentDialogVisible = false">取消</el-button>
          <el-button type="danger" @click="submitImpairment" :loading="submitImpairmentLoading">确认计提</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { parsePaginatedData, parseListData, parseDataObject } from '@/utils/responseParser';

import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, ArrowDown } from '@element-plus/icons-vue';
import { api } from '@/services/api';
import { formatDate, formatCurrency } from '@/utils/helpers/formatters';

const router = useRouter();

// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);
const transferLoading = ref(false);

// 分页相关
const total = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);

// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('新增固定资产');
const assetFormRef = ref(null);

// 调拨对话框
const transferDialogVisible = ref(false);
const transferDialogTitle = ref('资产调拨');
const transferFormRef = ref(null);
const transferForm = reactive({
  assetId: null,
  assetCode: '',
  assetName: '',
  originalDepartment: '',
  originalResponsible: '',
  originalLocation: '',
  newDepartment: '',
  newResponsible: '',
  newLocation: '',
  transferDate: formatDate(new Date()),
  transferReason: '',
  notes: ''
});

// 调拨表单验证规则
const transferRules = {
  newDepartment: [{ required: true, message: '请选择调拨部门', trigger: 'change' }],
  newResponsible: [{ required: true, message: '请输入新责任人', trigger: 'blur' }],
  newLocation: [{ required: true, message: '请输入新存放地点', trigger: 'blur' }],
  transferDate: [{ required: true, message: '请选择调拨日期', trigger: 'change' }]
};

// 处置对话框
const disposeDialogVisible = ref(false);
const disposeLoading = ref(false);
const disposeFormRef = ref(null);
const disposeForm = reactive({
  assetId: null,
  assetCode: '',
  assetName: '',
  netValue: 0,
  disposeType: 'scrap',
  disposeAmount: 0,
  disposeDate: formatDate(new Date()),
  reason: ''
});

// 处置损益计算
const disposeProfitLoss = computed(() => {
  return (disposeForm.disposeAmount || 0) - (disposeForm.netValue || 0);
});

// 处置表单验证规则
const disposeRules = {
  disposeType: [{ required: true, message: '请选择处置方式', trigger: 'change' }],
  disposeDate: [{ required: true, message: '请选择处置日期', trigger: 'change' }],
  reason: [{ required: true, message: '请输入处置原因', trigger: 'blur' }]
};

// 拆分对话框
const splitDialogVisible = ref(false);
const splitLoading = ref(false);
const splitFormRef = ref(null);
const splitForm = reactive({
  assetId: null,
  assetCode: '',
  assetName: '',
  originalValue: 0,
  split_cost: 0,
  new_asset_name: '',
  department_id: '',
  location_id: '',
  custodian: '',
  reason: ''
});

// 拆分表单验证规则
const splitRules = {
  split_cost: [{ required: true, message: '请输入拆分金额', trigger: 'blur' }]
};

// 减值对话框
const impairmentDialogVisible = ref(false);
const submitImpairmentLoading = ref(false);
const impairmentFormRef = ref(null);
const impairmentForm = reactive({
  assetId: null,
  netValue: 0,
  impairment_amount: 0,
  impairment_date: '',
  reason: ''
});
const impairmentRules = {
  impairment_amount: [{ required: true, message: '请输入减值金额', trigger: 'blur' }],
  impairment_date: [{ required: true, message: '请选择减值日期', trigger: 'change' }],
  reason: [{ required: true, message: '请输入减值原因', trigger: 'blur' }]
};

// 数据列表
const assetList = ref([]);
const categoryOptions = ref([]);
const departmentOptions = ref([]);

// 资产统计信息
const assetStats = reactive({
  total: 0,
  totalValue: 0,
  totalNetValue: 0,
  inUseCount: 0,
  idleCount: 0,
  underRepairCount: 0
});

// 搜索表单
const searchForm = reactive({
  assetCode: '',
  assetName: '',
  categoryId: '',
  status: ''
});

// 资产表单
const assetForm = reactive({
  id: null,
  assetCode: '',
  assetName: '',
  categoryId: null,
  purchaseDate: formatDate(new Date()),
  originalValue: 0,
  netValue: 0,
  usefulLife: 5,
  salvageRate: 5.0,
  depreciationMethod: 'straight_line',
  location: '',
  department: '',
  responsible: '',
  status: 'in_use',
  notes: ''
});

// 表单验证规则
const assetRules = {
  /* assetCode 设置为非必填，后端自动生成如果在前端没提供的情况下 */
  assetCode: [],
  assetName: [
    { required: true, message: '请输入资产名称', trigger: 'blur' }
  ],
  categoryId: [
    { required: true, message: '请选择资产类别', trigger: 'change' }
  ],
  purchaseDate: [
    { required: true, message: '请选择购入日期', trigger: 'change' }
  ],
  originalValue: [
    { required: true, message: '请输入资产原值', trigger: 'blur' }
  ],
  usefulLife: [
    { required: true, message: '请输入预计使用年限', trigger: 'blur' }
  ],
  depreciationMethod: [
    { required: true, message: '请选择折旧方法', trigger: 'change' }
  ],
  location: [
    { required: true, message: '请输入存放地点', trigger: 'blur' }
  ],
  department: [
    { required: true, message: '请选择使用部门', trigger: 'change' }
  ],
  status: [
    { required: true, message: '请选择资产状态', trigger: 'change' }
  ]
};

import { getAssetStatusText, getAssetStatusColor } from '@/constants/systemConstants'

// 获取状态类型
const getStatusType = (status) => {
  return getAssetStatusColor(status);
};

// 获取状态文本
const getStatusText = (status) => {
  return getAssetStatusText(status);
};

// 判断资产是否已处置（任何形式）
const isDisposed = (status) => {
  return ['disposed', 'sold', 'transferred', 'donated'].includes(status);
};

// 加载资产列表
const loadAssets = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      assetCode: searchForm.assetCode,
      assetName: searchForm.assetName,
      categoryId: searchForm.categoryId,
      status: searchForm.status
    };

    const response = await api.get('/finance/assets', { params });

    // 使用统一的响应解析工具
    const { list, total: totalCount } = parsePaginatedData(response, { enableLog: false });

    // 处理返回的日期格式和字段映射
    list.forEach(asset => {
      // 日期格式化
      if (asset.purchaseDate || asset.acquisitionDate) {
        asset.purchaseDate = formatDate(asset.purchaseDate || asset.acquisitionDate);
      }
      
      // 字段映射适配
      asset.assetCode = asset.assetCode || asset.asset_code || '';
      asset.assetName = asset.assetName || asset.asset_name || '';
      asset.categoryName = asset.categoryName || asset.category_name || '';
      asset.originalValue = asset.originalValue !== undefined ? asset.originalValue : (asset.acquisitionCost !== undefined ? asset.acquisitionCost : (asset.acquisition_cost || 0));
      asset.netValue = asset.netValue !== undefined ? asset.netValue : (asset.currentValue !== undefined ? asset.currentValue : (asset.current_value || 0));
      asset.location = asset.location || asset.location_id || asset.location_name || '';
      asset.department = asset.department || asset.department_id || asset.department_name || '';
      asset.responsible = asset.responsible || asset.custodian || '';
    });

    assetList.value = list;
    total.value = totalCount;

    // 加载资产统计信息
    loadAssetStats();
  } catch (error) {
    console.error('加载资产列表失败:', error);
    ElMessage.error('加载资产列表失败');
    assetList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

// 加载资产类别选项
const loadCategoryOptions = async () => {
  try {
    const response = await api.get('/finance/assets/categories');
    // 使用统一的列表解析工具
    categoryOptions.value = parseListData(response, { enableLog: false });
  } catch (error) {
    console.error('加载资产类别列表失败:', error);
    ElMessage.error('加载资产类别列表失败，将使用空列表');
    // 提供备用选项以允许应用继续运行
    categoryOptions.value = [
      { id: 1, name: '电子设备', code: 'ELE' },
      { id: 2, name: '办公家具', code: 'FUR' },
      { id: 3, name: '机器设备', code: 'MAC' },
      { id: 4, name: '运输设备', code: 'VEH' },
      { id: 5, name: '房屋建筑', code: 'BLD' }
    ];
  }
};

// 加载部门选项
const loadDepartmentOptions = async () => {
  try {
    const response = await api.get('/system/departments/list');
    // 使用统一的列表解析工具
    departmentOptions.value = parseListData(response, { enableLog: false });
  } catch (error) {
    console.error('加载部门列表失败:', error);
    ElMessage.error('加载部门列表失败');
    departmentOptions.value = [];
  }
};

// 加载资产统计信息
const loadAssetStats = async () => {
  try {
    const response = await api.get('/finance/assets/stats');
    const statsData = parseDataObject(response, { enableLog: false });
    if (statsData) {
      Object.assign(assetStats, statsData);
    }
  } catch (error) {
    console.error('加载资产统计信息失败:', error);
  }
};

// 搜索资产
const searchAssets = () => {
  currentPage.value = 1;
  loadAssets();
};

// 重置搜索条件
const resetSearch = () => {
  searchForm.assetCode = '';
  searchForm.assetName = '';
  searchForm.categoryId = '';
  searchForm.status = '';
  searchAssets();
};

// 新增资产
const showAddDialog = () => {
  dialogTitle.value = '新增固定资产';
  resetAssetForm();
  dialogVisible.value = true;
};

// 根据所选类别自动获取编号，并同步类别的默认设置
const onCategoryChange = () => {
  if (!assetForm.id && assetForm.categoryId) {
    // 自动获取编号
    generateCode();
    
    // 同步类别默认设置
    const category = categoryOptions.value.find(c => c.id === assetForm.categoryId);
    if (category) {
      const usefulLife = category.defaultUsefulLife || category.default_useful_life;
      if (usefulLife) assetForm.usefulLife = usefulLife;
      
      const salvageRate = category.defaultSalvageRate || category.default_salvage_rate;
      if (salvageRate !== undefined) assetForm.salvageRate = Number(salvageRate);
      
      const depMethod = category.defaultDepreciationMethod || category.default_depreciation_method;
      if (depMethod) {
        // 数据库返回的是中文，前端表单需要英文 key
        const methodMap = {
          '直线法': 'straight_line',
          '双倍余额递减法': 'double_declining',
          '年数总和法': 'sum_of_years',
          '不计提': 'no_depreciation',
          '工作量法': 'workload'
        };
        assetForm.depreciationMethod = methodMap[depMethod] || depMethod;
      }
    }
  }
};

// 获取自动生成的编号
const generateCode = async () => {
  try {
    const params = assetForm.categoryId ? { categoryId: assetForm.categoryId } : {};
    const res = await api.get('/finance/assets/generate-code', { params });
    if (res.data && res.data.code) {
      assetForm.assetCode = res.data.code;
      ElMessage.success('自动生成编号成功');
    }
  } catch (err) {
    ElMessage.error('自动生成编号失败');
  }
};

// 详情页跳转
const goToDetail = (id) => {
  router.push(`/finance/assets/detail/${id}`);
};

// 编辑资产
const handleEdit = async (row) => {
  dialogTitle.value = '编辑固定资产';
  
  try {
    const response = await api.get(`/finance/assets/${row.id}`);
    const asset = response.data;
    
    resetAssetForm();
    
    // 处理日期格式
    if (asset.purchaseDate) {
      asset.purchaseDate = formatDate(asset.purchaseDate);
    }
    
    // 确保数值字段为数字类型
    if (asset.originalValue) asset.originalValue = parseFloat(asset.originalValue);
    if (asset.netValue) asset.netValue = parseFloat(asset.netValue);
    if (asset.usefulLife) asset.usefulLife = parseInt(asset.usefulLife);
    if (asset.salvageRate) asset.salvageRate = parseFloat(asset.salvageRate);
    if (asset.categoryId) asset.categoryId = parseInt(asset.categoryId);
    
    // 填充表单数据
    Object.assign(assetForm, asset);
    
    
    dialogVisible.value = true;
  } catch (error) {
    console.error('获取资产详情失败:', error);
    ElMessage.error('获取资产详情失败');
  }
};

// 下拉菜单命令分发
const handleMoreCommand = (command, row) => {
  switch (command) {
    case 'impairment': handleImpairment(row); break;
    case 'transfer': handleTransfer(row); break;
    case 'split': handleSplit(row); break;
    case 'dispose': handleDispose(row); break;
    case 'unaudit': handleAudit(row, 'reject'); break;
  }
};

// 审核/反审核资产
const handleAudit = async (row, action) => {
  const actionText = action === 'approve' ? '审核' : '反审核';
  try {
    await ElMessageBox.confirm(
      `确定要${actionText}资产 "${row.assetName}" 吗？${action === 'approve' ? '审核后将不可编辑。' : '反审核后可以重新编辑。'}`,
      `确认${actionText}`,
      { type: 'warning' }
    );
  } catch {
    return;
  }
  
  try {
    await api.post(`/finance/assets/${row.id}/audit`, { action });
    ElMessage.success(`${row.assetName} ${actionText}成功`);
    loadAssets();
  } catch (error) {
    console.error(`${actionText}失败:`, error);
    ElMessage.error(`${actionText}失败`);
  }
};

// 处理资产调拨
const handleTransfer = (row) => {
  // 填充调拨表单数据
  transferForm.assetId = row.id;
  transferForm.assetCode = row.assetCode;
  transferForm.assetName = row.assetName;
  transferForm.originalDepartment = row.department;
  transferForm.originalResponsible = row.responsible;
  transferForm.originalLocation = row.location;
  transferForm.newDepartment = '';
  transferForm.newResponsible = '';
  transferForm.newLocation = '';
  transferForm.transferDate = formatDate(new Date());
  transferForm.transferReason = '';
  transferForm.notes = '';
  
  // 显示调拨对话框
  transferDialogVisible.value = true;
};

// 提交资产调拨
const submitTransfer = async () => {
  if (!transferFormRef.value) return;
  
  await transferFormRef.value.validate(async (valid) => {
    if (valid) {
      transferLoading.value = true;
      try {
        await api.post(`/finance/assets/${transferForm.assetId}/transfer`, transferForm);
        ElMessage.success('资产调拨成功');
        transferDialogVisible.value = false;
        loadAssets(); // 重新加载资产列表
      } catch (error) {
        console.error('资产调拨失败:', error);
        ElMessage.error('资产调拨失败');
      } finally {
        transferLoading.value = false;
      }
    }
  });
};

// 处理资产拆分
const handleSplit = (row) => {
  splitForm.assetId = row.id;
  splitForm.assetCode = row.assetCode;
  splitForm.assetName = row.assetName;
  splitForm.originalValue = row.originalValue || 0;
  splitForm.split_cost = 0;
  splitForm.new_asset_name = '';
  splitForm.department_id = '';
  splitForm.location_id = '';
  splitForm.custodian = '';
  splitForm.reason = '';

  splitDialogVisible.value = true;
};

// 提交资产拆分
const submitSplit = async () => {
  if (!splitFormRef.value) return;

  await splitFormRef.value.validate(async (valid) => {
    if (valid) {
      splitLoading.value = true;
      try {
        await api.post(`/finance/assets/${splitForm.assetId}/split`, splitForm);
        ElMessage.success('资产拆分成功');
        splitDialogVisible.value = false;
        loadAssets(); // 重新加载资产列表
      } catch (error) {
        console.error('资产拆分失败:', error);
        ElMessage.error('资产拆分失败');
      } finally {
        splitLoading.value = false;
      }
    }
  });
};

// 处理资产减值
const handleImpairment = (row) => {
  impairmentForm.assetId = row.id;
  impairmentForm.netValue = row.netValue || 0;
  impairmentForm.impairment_amount = 0;
  impairmentForm.impairment_date = new Date().toISOString().split('T')[0];
  impairmentForm.reason = '';
  
  impairmentDialogVisible.value = true;
};

// 提交资产减值
const submitImpairment = async () => {
  if (!impairmentFormRef.value) return;
  
  await impairmentFormRef.value.validate(async (valid) => {
    if (valid) {
      if (impairmentForm.impairment_amount > impairmentForm.netValue) {
        ElMessage.error('减值金额不能大于当前净值');
        return;
      }
      
      submitImpairmentLoading.value = true;
      try {
        await api.post(`/finance/assets/${impairmentForm.assetId}/impairments`, impairmentForm);
        ElMessage.success('减值计提成功');
        impairmentDialogVisible.value = false;
        loadAssets(); // 重新加载资产列表
      } catch (error) {
        ElMessage.error(error.message || '减值计提失败');
      } finally {
        submitImpairmentLoading.value = false;
      }
    }
  });
};

// 处理资产处置
const handleDispose = (row) => {
  disposeForm.assetId = row.id;
  disposeForm.assetCode = row.assetCode;
  disposeForm.assetName = row.assetName;
  disposeForm.netValue = row.netValue || 0;
  disposeForm.disposeType = 'scrap';
  disposeForm.disposeAmount = 0;
  disposeForm.disposeDate = formatDate(new Date());
  disposeForm.reason = '';

  disposeDialogVisible.value = true;
};

// 提交资产处置
const submitDispose = async () => {
  if (!disposeFormRef.value) return;

  try {
    await disposeFormRef.value.validate();
  } catch (validErr) {
    // 表单验证未通过，Element Plus 会自动显示字段错误提示
    return;
  }

  disposeLoading.value = true;
  try {
    const disposeMethodMap = {
      scrap: '报废',
      sale: '出售',
      damage: '报废',
      other: '其他'
    };
    const payload = {
      disposalMethod: disposeMethodMap[disposeForm.disposeType] || '其他',
      disposalAmount: disposeForm.disposeAmount,
      disposalDate: disposeForm.disposeDate,
      disposalReason: disposeForm.reason,
    };
    await api.post(`/finance/assets/${disposeForm.assetId}/dispose`, payload);
    ElMessage.success('资产处置成功');
    disposeDialogVisible.value = false;
    loadAssets(); // 重新加载资产列表
  } catch (error) {
    console.error('资产处置失败:', error);
    const msg = error.response?.data?.message || error.response?.data?.error || error.message || '未知错误';
    ElMessage.error('资产处置失败: ' + msg);
  } finally {
    disposeLoading.value = false;
  }
};

// 保存资产
const saveAsset = async () => {
  if (!assetFormRef.value) return;
  
  await assetFormRef.value.validate(async (valid) => {
    if (valid) {
      saveLoading.value = true;
      try {
        // 如果是新增，设置初始净值等于原值
        if (!assetForm.id) {
          assetForm.netValue = assetForm.originalValue;
        }
        
        // 准备提交的数据
        const data = { ...assetForm };
        
        if (assetForm.id) {
          // 更新
          await api.put(`/finance/assets/${assetForm.id}`, data);
          ElMessage.success('更新成功');
        } else {
          // 新增
          await api.post('/finance/assets', data);
          ElMessage.success('添加成功');
        }
        dialogVisible.value = false;
        loadAssets();
      } catch (error) {
        console.error('保存资产失败:', error);
        ElMessage.error('保存资产失败');
      } finally {
        saveLoading.value = false;
      }
    }
  });
};

// 重置资产表单
const resetAssetForm = () => {
  assetForm.id = null;
  assetForm.assetCode = '';
  assetForm.assetName = '';
  assetForm.categoryId = null;
  assetForm.purchaseDate = formatDate(new Date());
  assetForm.originalValue = 0;
  assetForm.netValue = 0;
  assetForm.usefulLife = 5;
  assetForm.salvageRate = 5.0;
  assetForm.depreciationMethod = 'straight_line';
  assetForm.location = '';
  assetForm.department = '';
  assetForm.responsible = '';
  assetForm.status = 'in_use';
  assetForm.notes = '';
  
  // 清除校验
  if (assetFormRef.value) {
    assetFormRef.value.resetFields();
  }
};

// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = size;
  loadAssets();
};

const handleCurrentChange = (page) => {
  currentPage.value = page;
  loadAssets();
};

// 页面加载时执行
onMounted(() => {
  loadAssets();
  loadCategoryOptions();
  loadDepartmentOptions();
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

:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}

:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value-text {
  color: var(--el-color-success);
  font-weight: bold;
}

.danger-text {
  color: var(--el-color-danger);
  font-weight: bold;
}
</style>

<style>
/* 资产列表表格统一样式 - 单元格不换行，超出省略 */
.assets-container .el-table .el-table__cell > .cell {
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.assets-container .el-table .cell-link {
  display: inline !important;
  max-width: 100% !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
</style>