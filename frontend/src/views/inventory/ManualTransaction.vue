<!--
/**
 * ManualTransaction.vue
 * @description 手工出入管理页面
 * @date 2025-11-01
 * @version 1.0.0
 */
-->
<template>
  <div class="manual-transaction-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>手工出入库</h2>
          <p class="subtitle">管理手工出入库单据</p>
        </div>
        <div>
          <el-button type="primary" :icon="Plus" @click="handleCreate">新建出入库单</el-button>
          <el-button type="warning" :icon="Refresh" @click="handleExchange">调货</el-button>
        </div>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="单据编号">
          <el-input v-model="searchForm.transactionNo" placeholder="单据编号" clearable />
        </el-form-item>
        <el-form-item label="业务类型">
          <el-select v-model="searchForm.transactionType" placeholder="业务类型" clearable>
            <el-option
              v-for="item in businessTypes"
              :key="item.code"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="审批状态">
          <el-select v-model="searchForm.approvalStatus" placeholder="审批状态" clearable>
            <el-option label="待审批" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.total || 0 }}</div>
        <div class="stat-label">单据总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.inCount || 0 }}</div>
        <div class="stat-label">入库单数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.outCount || 0 }}</div>
        <div class="stat-label">出库单数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.todayCount || 0 }}</div>
        <div class="stat-label">今日单据</div>
      </el-card>
    </div>
    
    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="tableData"
        style="width: 100%"
        v-loading="loading"
        border
      >
        <el-table-column prop="transaction_no" label="单据编号" width="160" />
        <el-table-column label="业务类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getBusinessTypeTag(row.business_type_code || row.transaction_type)">
              {{ getBusinessTypeName(row.business_type_code || row.transaction_type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="物料" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.material_names || '无' }}
          </template>
        </el-table-column>
        <el-table-column label="物料编码" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.material_codes || '无' }}
          </template>
        </el-table-column>
        <el-table-column label="型号规格" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.material_specs || '无规格' }}
          </template>
        </el-table-column>
        <el-table-column label="明细数" width="80" align="center">
          <template #default="{ row }">
            {{ row.item_count || 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="transaction_date" label="业务日期" width="120" />
        <el-table-column prop="operator_name" label="操作人" width="100">
          <template #default="{ row }">
            {{ row.operator_name || row.operator || '未知' }}
          </template>
        </el-table-column>
        <el-table-column label="审批状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getApprovalStatusTag(row.approval_status)">
              {{ getApprovalStatusText(row.approval_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" min-width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="handleView(row)">查看</el-button>
            <el-button
              v-if="row.approval_status === 'pending' && canApprove"
              size="small"
              type="success"
              @click="handleApprove(row)"
            >审批</el-button>
            <el-button
              v-if="row.approval_status === 'pending' && canDelete"
              size="small"
              type="danger"
              @click="handleDelete(row)"
            >删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.currentPage"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
    
    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogType === 'create' ? '新建出入库单' : '编辑出入库单'"
      width="55%"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="单据编号">
              <el-input v-model="form.transaction_no" placeholder="系统自动生成" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="业务类型" prop="transaction_type">
              <el-select v-model="form.transaction_type" placeholder="请选择业务类型" style="width: 100%">
                <el-option-group label="入库类型">
                  <el-option
                    v-for="item in inboundTypes"
                    :key="item.code"
                    :label="item.name"
                    :value="item.code"
                  />
                </el-option-group>
                <el-option-group label="出库类型">
                  <el-option
                    v-for="item in outboundTypes"
                    :key="item.code"
                    :label="item.name"
                    :value="item.code"
                  />
                </el-option-group>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="业务日期" prop="transaction_date">
              <el-date-picker
                v-model="form.transaction_date"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="操作人">
              <el-input v-model="form.operator" placeholder="系统自动填充" readonly />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            placeholder="请输入备注"
          />
        </el-form-item>

        <el-divider content-position="center">出入库明细</el-divider>

        <div class="materials-list">
          <el-table
            :data="form.items"
            border
            style="width: 100%"
            max-height="400"
            :header-cell-style="{ background: '#f5f7fa', color: '#606266' }"
            empty-text="请添加物料，按 Enter 键快速录入"
            show-summary
            :summary-method="getSummaries"
          >
            <el-table-column label="序号" width="55" type="index" align="center" />

            <el-table-column label="物料编码" width="160" show-overflow-tooltip>
              <template #default="{ row, $index }">
                <el-autocomplete
                  :ref="(el) => setMaterialSelectRef(el, $index)"
                  v-model="row.material_code"
                  placeholder="输入编码/名称/规格"
                  clearable
                  :fetch-suggestions="(query, callback) => fetchMaterialSuggestions(query, callback)"
                  @select="(item) => handleMaterialSelect(item, $index)"
                  @keydown.enter.prevent="handleMaterialEnter($index)"
                  @clear="handleMaterialClear($index)"
                  style="width: 100%"
                  :trigger-on-focus="true"
                  :debounce="300"
                  :hide-loading="false"
                  value-key="code"
                  :popper-append-to-body="false"
                >
                  <template #default="{ item }">
                    <div style="display: flex; align-items: center; gap: 12px; padding: 4px 0;">
                      <span style="font-weight: 500; font-size: 13px; min-width: 100px;">{{ item.code }}</span>
                      <span style="color: #606266; font-size: 13px; flex: 1;">{{ item.name }}</span>
                      <span v-if="item.specs" style="color: #909399; font-size: 12px;">{{ item.specs }}</span>
                    </div>
                  </template>
                </el-autocomplete>
              </template>
            </el-table-column>

            <el-table-column label="物料名称" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.material_name || '-' }}
              </template>
            </el-table-column>

            <el-table-column label="规格" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.specification || '-' }}
              </template>
            </el-table-column>

            <el-table-column label="单位" width="70" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.unit_name || '-' }}
              </template>
            </el-table-column>

            <el-table-column label="仓库" width="140" show-overflow-tooltip>
              <template #default="{ row, $index }">
                <el-select
                  :ref="(el) => setLocationSelectRef(el, $index)"
                  v-model="row.location_id"
                  placeholder="选择仓库"
                  style="width: 100%"
                  @change="handleLocationChange($index)"
                  @keydown.enter.prevent="handleLocationEnter($index)"
                >
                  <el-option
                    v-for="item in locations"
                    :key="item.id"
                    :label="item.name"
                    :value="item.id"
                  />
                </el-select>
              </template>
            </el-table-column>

            <el-table-column label="库存" width="80" align="right">
              <template #default="{ row }">
                <span :style="{ color: row.stock_quantity > 0 ? '#67c23a' : '#909399' }">
                  {{ row.stock_quantity || 0 }}
                </span>
              </template>
            </el-table-column>

            <el-table-column label="数量" width="120">
              <template #default="{ row, $index }">
                <el-input-number
                  :ref="(el) => setQuantityInputRef(el, $index)"
                  v-model="row.quantity"
                  :min="0.01"
                  :precision="2"
                  :step="1"
                  :controls="false"
                  placeholder="数量"
                  style="width: 100%"
                  @keydown.enter.prevent="handleQuantityEnter($index)"
                />
              </template>
            </el-table-column>

            <el-table-column label="操作" width="60" fixed="right" align="center">
              <template #default="{ $index }">
                <el-button
                  link
                  type="danger"
                  size="small"
                  @click="handleRemoveItem($index)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 查看对话框 -->
    <el-dialog
      v-model="viewDialogVisible"
      title="出入库单详情"
      width="50%"
    >
      <div v-loading="viewLoading">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="单据编号">{{ currentRecord.transaction_no }}</el-descriptions-item>
        <el-descriptions-item label="业务类型">
          <el-tag :type="getBusinessTypeTag(currentRecord.business_type_code || currentRecord.transaction_type)">
            {{ getBusinessTypeName(currentRecord.business_type_code || currentRecord.transaction_type) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="业务日期">{{ currentRecord.transaction_date }}</el-descriptions-item>
        <el-descriptions-item label="操作人">{{ currentRecord.operator_name || currentRecord.operator || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ currentRecord.created_at }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="1">{{ currentRecord.remark || '-' }}</el-descriptions-item>
      </el-descriptions>

      <el-divider>出入库明细</el-divider>

      <el-table :data="currentRecord.items || []" border style="width: 100%">
        <el-table-column label="序号" width="60" type="index" />
        <el-table-column label="物料编码" width="130" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.material_code }}
          </template>
        </el-table-column>
        <el-table-column label="物料名称" width="180" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.material_name }}
          </template>
        </el-table-column>
        <el-table-column label="规格" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.specification || '无规格' }}
          </template>
        </el-table-column>
        <el-table-column label="单位" width="80">
          <template #default="{ row }">
            {{ row.unit_name }}
          </template>
        </el-table-column>
        <el-table-column label="仓库" width="120" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.location_name }}
          </template>
        </el-table-column>
        <el-table-column label="数量" width="100" align="right">
          <template #default="{ row }">
            {{ row.quantity }}
          </template>
        </el-table-column>
      </el-table>
      </div>

      <template #footer>
        <el-button @click="viewDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 调货对话框 -->
    <el-dialog
      v-model="exchangeDialogVisible"
      title="物料调货"
      width="40%"
    >
      <el-form
        ref="exchangeFormRef"
        :model="exchangeForm"
        :rules="exchangeFormRules"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="业务日期" prop="transaction_date">
              <el-date-picker
                v-model="exchangeForm.transaction_date"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="调货原因" prop="remark">
              <el-input v-model="exchangeForm.remark" placeholder="请输入调货原因" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider>退回物料（入库）</el-divider>
        <el-row :gutter="20">
          <el-col :span="14">
            <el-form-item label="退回物料" prop="return_material_id">
              <el-select
                v-model="exchangeForm.return_material_id"
                filterable
                remote
                reserve-keyword
                placeholder="请输入物料编码或名称"
                :remote-method="searchReturnMaterials"
                :loading="returnMaterialLoading"
                style="width: 100%"
                @change="handleReturnMaterialChange"
              >
                <el-option
                  v-for="item in returnMaterialOptions"
                  :key="item.id"
                  :label="`${item.code} - ${item.name}`"
                  :value="item.id"
                >
                  <div style="display: flex; justify-content: space-between">
                    <span>{{ item.code }} - {{ item.name }}</span>
                    <span style="color: #8492a6; font-size: 12px">{{ item.specs || '无规格' }}</span>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="退回数量" prop="return_quantity">
              <el-input-number
                v-model="exchangeForm.return_quantity"
                :min="0.01"
                :precision="2"
                :step="1"
                :controls="false"
                placeholder="数量"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row v-if="exchangeForm.return_location_name" :gutter="20">
          <el-col :span="24">
            <el-alert
              :title="`退回仓库：${exchangeForm.return_location_name}`"
              type="info"
              :closable="false"
              show-icon
            />
          </el-col>
        </el-row>

        <el-divider>补发物料（出库）</el-divider>
        <el-row :gutter="20">
          <el-col :span="14">
            <el-form-item label="补发物料" prop="issue_material_id">
              <el-select
                v-model="exchangeForm.issue_material_id"
                filterable
                remote
                reserve-keyword
                placeholder="请输入物料编码或名称"
                :remote-method="searchIssueMaterials"
                :loading="issueMaterialLoading"
                style="width: 100%"
                @change="handleIssueMaterialChange"
              >
                <el-option
                  v-for="item in issueMaterialOptions"
                  :key="item.id"
                  :label="`${item.code} - ${item.name}`"
                  :value="item.id"
                >
                  <div style="display: flex; justify-content: space-between">
                    <span>{{ item.code }} - {{ item.name }}</span>
                    <span style="color: #8492a6; font-size: 12px">{{ item.specs || '无规格' }}</span>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="补发数量" prop="issue_quantity">
              <el-input-number
                v-model="exchangeForm.issue_quantity"
                :min="0.01"
                :precision="2"
                :step="1"
                :controls="false"
                placeholder="数量"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row v-if="exchangeForm.issue_location_name" :gutter="20">
          <el-col :span="24">
            <el-alert
              :title="`补发仓库：${exchangeForm.issue_location_name}`"
              type="info"
              :closable="false"
              show-icon
            />
          </el-col>
        </el-row>
      </el-form>

      <template #footer>
        <el-button @click="exchangeDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="exchangeSubmitting"
          :disabled="!canSubmitExchange"
          @click="handleExchangeSubmit"
        >
          确定
        </el-button>
        <div v-if="!canSubmitExchange" style="color: #f56c6c; font-size: 12px; margin-top: 8px;">
          提示：请确保退回和补发物料都已设置默认仓库
        </div>
      </template>
    </el-dialog>

    <!-- 审批对话框 -->
    <el-dialog
      v-model="approvalDialogVisible"
      title="审批出入库单"
      width="500px"
    >
      <el-descriptions :column="1" border>
        <el-descriptions-item label="单据编号">{{ approvalForm.transaction_no }}</el-descriptions-item>
        <el-descriptions-item label="业务类型">
          <el-tag :type="getBusinessTypeTag(approvalForm.business_type_code)">
            {{ getBusinessTypeName(approvalForm.business_type_code) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="业务日期">{{ approvalForm.transaction_date }}</el-descriptions-item>
        <el-descriptions-item label="操作人">{{ approvalForm.operator }}</el-descriptions-item>
        <el-descriptions-item label="明细数量">{{ approvalForm.item_count || 0 }} 条</el-descriptions-item>
      </el-descriptions>

      <el-form :model="approvalForm" label-width="80px" style="margin-top: 20px;">
        <el-form-item label="审批备注">
          <el-input
            v-model="approvalForm.remark"
            type="textarea"
            :rows="3"
            placeholder="请输入审批备注（可选）"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="approvalDialogVisible = false">取消</el-button>
        <el-button v-permission="'inventory:manualtransaction:reject'" type="danger" :loading="approvalSubmitting" @click="handleReject">拒绝</el-button>
        <el-button type="success" :loading="approvalSubmitting" @click="handleApproveConfirm">通过</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh } from '@element-plus/icons-vue'
import { inventoryApi, baseDataApi, systemApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { getBusinessTypeCategoryColor } from '@/constants/systemConstants'
import { searchMaterials } from '@/utils/searchConfig'
import { parseListData } from '@/utils/responseParser'

const authStore = useAuthStore()

// 权限控制
const canApprove = computed(() => authStore.hasPermission('inventory:manualtransaction:approve'))
const canDelete = computed(() => authStore.hasPermission('inventory:manualtransaction:delete'))

// 业务类型列表
const businessTypes = ref([])
const businessTypesMap = ref({})

// 搜索表单
const searchForm = reactive({
  transactionNo: '',
  transactionType: '',
  locationId: '',
  dateRange: [],
  approvalStatus: ''
})

// 表格数据
const tableData = ref([])
const loading = ref(false)

// 分页
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})

// 统计数据
const stats = reactive({
  total: 0,
  inCount: 0,
  outCount: 0,
  todayCount: 0
})

// 对话框
const dialogVisible = ref(false)
const viewDialogVisible = ref(false)
const viewLoading = ref(false)
const dialogType = ref('create')
const formRef = ref(null)
const submitting = ref(false)

// 审批对话框
const approvalDialogVisible = ref(false)
const approvalSubmitting = ref(false)
const approvalForm = reactive({
  id: null,
  transaction_no: '',
  business_type_code: '',
  transaction_date: '',
  operator: '',
  item_count: 0,
  remark: ''
})

// 表单数据
const form = reactive({
  transaction_no: '',
  transaction_type: 'in',
  transaction_date: '',
  operator: '',
  remark: '',
  items: [] // 明细列表
})

// 当前查看的记录
const currentRecord = reactive({
  transaction_no: '',
  transaction_type: '',
  material_code: '',
  material_name: '',
  quantity: 0,
  unit_name: '',
  location_name: '',
  transaction_date: '',
  operator: '',
  created_at: '',
  remark: ''
})

// 仓库列表
const locations = ref([])

// 组件引用管理
const materialSelectRefs = ref({})
const quantityInputRefs = ref({})
const locationSelectRefs = ref({})

// 设置物料选择框引用
const setMaterialSelectRef = (el, index) => {
  if (el) {
    materialSelectRefs.value[index] = el
  }
}

// 设置仓库选择框引用
const setLocationSelectRef = (el, index) => {
  if (el) {
    locationSelectRefs.value[index] = el
  }
}

// 设置数量输入框引用
const setQuantityInputRef = (el, index) => {
  if (el) {
    quantityInputRefs.value[index] = el
  }
}

// 表单验证规则
const formRules = {
  transaction_type: [
    { required: true, message: '请选择业务类型', trigger: 'change' }
  ],
  transaction_date: [
    { required: true, message: '请选择业务日期', trigger: 'change' }
  ]
}

// 加载业务类型列表
const loadBusinessTypes = async () => {
  try {
    const res = await systemApi.getBusinessTypes({ status: 1 })
    // axios拦截器已自动解包ResponseHandler格式
    const types = Array.isArray(res.data) ? res.data : []
    businessTypes.value = types

    // 创建映射表方便查找
    const map = {}
    types.forEach(item => {
      map[item.code] = item
    })
    businessTypesMap.value = map
  } catch (error) {
    console.error('加载业务类型失败:', error)
  }
}

// 入库类型业务类型
const inboundTypes = computed(() => {
  return businessTypes.value.filter(item => item.category === 'in')
})

// 出库类型业务类型
const outboundTypes = computed(() => {
  return businessTypes.value.filter(item => item.category === 'out')
})

// 获取业务类型名称
const getBusinessTypeName = (code) => {
  // 优先使用 business_type_code，如果没有则兼容旧数据（将 'in'/'out' 转换为 'manual_in'/'manual_out'）
  let businessTypeCode = code
  if (code === 'in') businessTypeCode = 'manual_in'
  if (code === 'out') businessTypeCode = 'manual_out'
  return businessTypesMap.value[businessTypeCode]?.name || code
}

// 获取业务类型标签类型
const getBusinessTypeTag = (code) => {
  let businessTypeCode = code
  if (code === 'in') businessTypeCode = 'manual_in'
  if (code === 'out') businessTypeCode = 'manual_out'
  const category = businessTypesMap.value[businessTypeCode]?.category
  return getBusinessTypeCategoryColor(category)
}

// 获取审批状态文本
const getApprovalStatusText = (status) => {
  const statusMap = {
    'pending': '待审批',
    'approved': '已通过',
    'rejected': '已拒绝'
  }
  return statusMap[status] || '待审批'
}

// 获取审批状态标签类型
const getApprovalStatusTag = (status) => {
  const tagMap = {
    'pending': 'warning',
    'approved': 'success',
    'rejected': 'danger'
  }
  return tagMap[status] || 'warning'
}

// 加载仓库列表
const loadLocations = async () => {
  try {
    const res = await baseDataApi.getLocations()
    // 使用统一解析器
    const locationList = parseListData(res, { enableLog: false })
    // 过滤掉没有id的项
    locations.value = locationList.filter(item => item.id !== undefined && item.id !== null)
  } catch (error) {
    console.error('加载仓库列表失败:', error)
    ElMessage.error('加载仓库列表失败')
  }
}

// 添加物料行
const handleAddMaterialRow = () => {
  form.items.push({
    material_id: null,
    material_code: '',
    material_name: '',
    specification: '',
    unit_name: '',
    location_id: null,
    stock_quantity: 0,
    quantity: ''
  })

  // 聚焦到新行的物料编码输入框
  nextTick(() => {
    const newIndex = form.items.length - 1
    const materialSelect = materialSelectRefs.value[newIndex]
    if (materialSelect) {
      materialSelect.focus()
    }
  })
}

// 获取物料建议 - 使用统一搜索函数
const fetchMaterialSuggestions = async (query, callback) => {
  if (!query || query.length < 1) {
    callback([])
    return
  }

  try {
    // 使用统一的搜索函数
    const searchResults = await searchMaterials(baseDataApi, query.trim(), {
      pageSize: 500,
      includeAll: true
    })

    // 映射搜索结果为自动完成需要的格式
    const suggestions = searchResults.map(item => ({
      value: item.code || '无编码',
      id: item.id,
      code: item.code || '无编码',
      name: item.name || '未命名',
      specs: item.specification || item.specs || '',
      specification: item.specification || item.specs || '',
      unit_name: item.unit_name || '个',
      unit_id: item.unit_id,
      location_id: item.location_id || item.default_location_id || null,
      stock_quantity: item.stock_quantity || 0
    }))

    callback(suggestions)
  } catch (error) {
    console.error('搜索物料失败:', error)
    ElMessage.error('搜索物料失败')
    callback([])
  }
}

// 处理物料选择
const handleMaterialSelect = (item, index) => {
  form.items[index].material_id = item.id
  form.items[index].material_code = item.code
  form.items[index].material_name = item.name
  form.items[index].specification = item.specs || item.specification || ''
  form.items[index].unit_name = item.unit_name
  form.items[index].location_id = item.location_id || null
  form.items[index].stock_quantity = item.stock_quantity || 0

  // 选择物料后，自动聚焦到仓库选择框
  nextTick(() => {
    const locationSelect = locationSelectRefs.value[index]
    if (locationSelect) {
      locationSelect.focus()
    }
  })
}

// 处理物料编码Enter键
const handleMaterialEnter = (index) => {
  // Enter键时，如果已选择物料，则聚焦到仓库选择框
  if (form.items[index].material_id) {
    nextTick(() => {
      const locationSelect = locationSelectRefs.value[index]
      if (locationSelect) {
        locationSelect.focus()
      }
    })
  }
}

// 处理物料清除
const handleMaterialClear = (index) => {
  form.items[index].material_id = null
  form.items[index].material_name = ''
  form.items[index].specification = ''
  form.items[index].unit_name = ''
  form.items[index].location_id = null
  form.items[index].stock_quantity = 0
}

// 处理仓库变化 - 实时查询库存
const handleLocationChange = async (index) => {
  const item = form.items[index]
  if (item.material_id && item.location_id) {
    try {
      // 查询该仓库的库存
      const response = await inventoryApi.getStockByLocation({
        material_id: item.material_id,
        location_id: item.location_id
      })
      form.items[index].stock_quantity = response.data?.quantity || 0
    } catch (error) {
      console.error('查询库存失败:', error)
      form.items[index].stock_quantity = 0
    }
  }
}

// 处理仓库Enter键
const handleLocationEnter = (index) => {
  // 聚焦到数量输入框
  nextTick(() => {
    const quantityInput = quantityInputRefs.value[index]
    if (quantityInput) {
      quantityInput.focus()
    }
  })
}

// 处理数量Enter键
const handleQuantityEnter = (index) => {
  // 如果是最后一行，自动添加新行
  if (index === form.items.length - 1) {
    handleAddMaterialRow()
  } else {
    // 否则聚焦到下一行的物料编码输入框
    nextTick(() => {
      const nextMaterialSelect = materialSelectRefs.value[index + 1]
      if (nextMaterialSelect) {
        nextMaterialSelect.focus()
      }
    })
  }
}

// 明细表格合计方法
const getSummaries = (param) => {
  const { columns, data } = param
  const sums = []

  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = '合计'
      return
    }

    // 数量列（第5列，索引为4）
    if (index === 4) {
      const values = data.map(item => Number(item.quantity))
      if (!values.every(value => Number.isNaN(value))) {
        const total = values.reduce((prev, curr) => {
          const value = Number(curr)
          if (!Number.isNaN(value)) {
            return prev + value
          } else {
            return prev
          }
        }, 0)
        sums[index] = total.toFixed(2)
      } else {
        sums[index] = '0.00'
      }
    } else {
      sums[index] = ''
    }
  })

  return sums
}

// 删除明细行
const handleRemoveItem = (index) => {
  form.items.splice(index, 1)
}

// 加载列表数据
const loadTableData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize
    }

    // 只添加非空的查询参数
    if (searchForm.transactionNo) {
      params.transaction_no = searchForm.transactionNo
    }
    if (searchForm.transactionType) {
      params.transaction_type = searchForm.transactionType
    }
    if (searchForm.locationId) {
      params.location_id = searchForm.locationId
    }
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.start_date = searchForm.dateRange[0]
      params.end_date = searchForm.dateRange[1]
    }
    if (searchForm.approvalStatus) {
      params.approval_status = searchForm.approvalStatus
    }

    const res = await inventoryApi.getManualTransactions(params)

    // axios拦截器已自动解包ResponseHandler格式
    const responseData = res.data
    tableData.value = responseData.items || []
    pagination.total = Number(responseData.total) || 0

    // 更新统计数据
    if (responseData.stats) {
      Object.assign(stats, responseData.stats)
    }
  } catch (error) {
    console.error('加载数据失败:', error)
    ElMessage.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

// 查询
const handleSearch = () => {
  pagination.currentPage = 1
  loadTableData()
}

// 重置搜索
const resetSearch = () => {
  Object.assign(searchForm, {
    transactionNo: '',
    transactionType: '',
    locationId: '',
    dateRange: [],
    approvalStatus: ''
  })
  handleSearch()
}

// 分页变化
const handleSizeChange = (val) => {
  pagination.pageSize = val
  loadTableData()
}

const handleCurrentChange = (val) => {
  pagination.currentPage = val
  loadTableData()
}

// 新建
const handleCreate = () => {
  dialogType.value = 'create'
  Object.assign(form, {
    transaction_no: '',
    transaction_type: 'in',
    transaction_date: new Date().toISOString().split('T')[0],
    operator: authStore.realName || authStore.user?.username || '',
    remark: '',
    items: []
  })

  // 自动添加一行空白物料行
  handleAddMaterialRow()

  dialogVisible.value = true

  // 聚焦到第一行的物料编码输入框
  nextTick(() => {
    const firstMaterialSelect = materialSelectRefs.value[0]
    if (firstMaterialSelect) {
      firstMaterialSelect.focus()
    }
  })
}

// 查看
const handleView = async (row) => {
  viewDialogVisible.value = true
  viewLoading.value = true
  try {
    const res = await inventoryApi.getManualTransaction(row.transaction_no)
    // axios拦截器已自动解包ResponseHandler格式
    Object.assign(currentRecord, res.data)
  } catch (error) {
    console.error('获取详情失败:', error)
    ElMessage.error('获取详情失败')
  } finally {
    viewLoading.value = false
  }
}

// 删除
const handleDelete = (row) => {
  // 检查审批状态
  if (row.approval_status === 'approved') {
    ElMessageBox.confirm(
      '该单据已审批通过，删除后将回滚库存。确定要删除吗？',
      '警告',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
        distinguishCancelAndClose: true
      }
    ).then(async () => {
      try {
        await inventoryApi.deleteManualTransaction(row.transaction_no)
        ElMessage.success('删除成功，库存已回滚')
        loadTableData()
      } catch (error) {
        console.error('删除失败:', error)
        ElMessage.error(error.response?.data?.message || '删除失败')
      }
    }).catch(() => {})
  } else if (row.approval_status === 'rejected') {
    ElMessage.warning('已拒绝的单据无需删除')
  } else {
    // pending 状态，正常删除
    ElMessageBox.confirm('确定要删除这个单据吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(async () => {
      try {
        await inventoryApi.deleteManualTransaction(row.transaction_no)
        ElMessage.success('删除成功')
        loadTableData()
      } catch (error) {
        console.error('删除失败:', error)
        ElMessage.error(error.response?.data?.message || '删除失败')
      }
    }).catch(() => {})
  }
}

// ==================== 审批相关 ====================

// 打开审批对话框
const handleApprove = (row) => {
  approvalForm.id = row.id
  approvalForm.transaction_no = row.transaction_no
  approvalForm.business_type_code = row.business_type_code || row.transaction_type
  approvalForm.transaction_date = row.transaction_date
  approvalForm.operator = row.operator_name || row.operator || '未知'
  approvalForm.item_count = row.item_count
  approvalForm.remark = ''
  approvalDialogVisible.value = true
}

// 审批通过
const handleApproveConfirm = async () => {
  try {
    approvalSubmitting.value = true
    await inventoryApi.approveManualTransaction(approvalForm.id, {
      action: 'approve',
      remark: approvalForm.remark
    })
    ElMessage.success('审批通过，库存已更新')
    approvalDialogVisible.value = false
    loadTableData()
  } catch (error) {
    console.error('审批失败:', error)
    ElMessage.error('审批失败: ' + (error.message || '未知错误'))
  } finally {
    approvalSubmitting.value = false
  }
}

// 审批拒绝
const handleReject = async () => {
  try {
    approvalSubmitting.value = true
    await inventoryApi.approveManualTransaction(approvalForm.id, {
      action: 'reject',
      remark: approvalForm.remark
    })
    ElMessage.success('已拒绝该单据')
    approvalDialogVisible.value = false
    loadTableData()
  } catch (error) {
    console.error('拒绝失败:', error)
    ElMessage.error('操作失败: ' + (error.message || '未知错误'))
  } finally {
    approvalSubmitting.value = false
  }
}

// ==================== 调货相关 ====================
// 调货对话框
const exchangeDialogVisible = ref(false)
const exchangeSubmitting = ref(false)
const exchangeFormRef = ref(null)

// 调货表单
const exchangeForm = reactive({
  transaction_date: '',
  remark: '',
  return_material_id: null,
  return_location_id: null,
  return_location_name: '',
  return_quantity: '',
  issue_material_id: null,
  issue_location_id: null,
  issue_location_name: '',
  issue_quantity: ''
})

// 调货表单验证规则
const exchangeFormRules = {
  transaction_date: [{ required: true, message: '请选择业务日期', trigger: 'change' }],
  remark: [{ required: true, message: '请输入调货原因', trigger: 'blur' }],
  return_material_id: [{ required: true, message: '请选择退回物料', trigger: 'change' }],
  return_quantity: [
    { required: true, message: '请输入退回数量', trigger: 'blur' },
    { type: 'number', min: 0.01, message: '数量必须大于0', trigger: 'blur' }
  ],
  issue_material_id: [{ required: true, message: '请选择补发物料', trigger: 'change' }],
  issue_quantity: [
    { required: true, message: '请输入补发数量', trigger: 'blur' },
    { type: 'number', min: 0.01, message: '数量必须大于0', trigger: 'blur' }
  ]
}

// 调货表单是否可以提交
const canSubmitExchange = computed(() => {
  return exchangeForm.return_location_id && exchangeForm.issue_location_id
})

// 退回物料选项
const returnMaterialOptions = ref([])
const returnMaterialLoading = ref(false)

// 补发物料选项
const issueMaterialOptions = ref([])
const issueMaterialLoading = ref(false)

// 搜索退回物料
const searchReturnMaterials = async (query) => {
  if (!query) {
    returnMaterialOptions.value = []
    return
  }
  returnMaterialLoading.value = true
  try {
    const res = await baseDataApi.getMaterials({ keyword: query, page: 1, pageSize: 20 })
    // 使用统一解析器
    returnMaterialOptions.value = parseListData(res, { enableLog: false })
  } catch (error) {
    console.error('搜索物料失败:', error)
    ElMessage.error('搜索物料失败')
  } finally {
    returnMaterialLoading.value = false
  }
}

// 搜索补发物料
const searchIssueMaterials = async (query) => {
  if (!query) {
    issueMaterialOptions.value = []
    return
  }
  issueMaterialLoading.value = true
  try {
    const res = await baseDataApi.getMaterials({ keyword: query, page: 1, pageSize: 20 })
    // 使用统一解析器
    issueMaterialOptions.value = parseListData(res, { enableLog: false })
  } catch (error) {
    console.error('搜索物料失败:', error)
    ElMessage.error('搜索物料失败')
  } finally {
    issueMaterialLoading.value = false
  }
}

// 提取物料列表已统一使用 parseListData 解析器

// 自动填充仓库信息
const autoFillLocation = (material, formPrefix) => {
  if (material.location_id && material.location_name) {
    exchangeForm[`${formPrefix}_location_id`] = material.location_id
    exchangeForm[`${formPrefix}_location_name`] = material.location_name
  } else if (material.location_id) {
    const location = locations.value.find(l => l.id === material.location_id)
    if (location) {
      exchangeForm[`${formPrefix}_location_id`] = material.location_id
      exchangeForm[`${formPrefix}_location_name`] = location.name
    } else {
      ElMessage.warning('物料未设置默认仓库，请联系管理员')
      exchangeForm[`${formPrefix}_location_id`] = null
      exchangeForm[`${formPrefix}_location_name`] = ''
    }
  } else {
    ElMessage.warning('物料未设置默认仓库，请联系管理员')
    exchangeForm[`${formPrefix}_location_id`] = null
    exchangeForm[`${formPrefix}_location_name`] = ''
  }
}

// 退回物料变化
const handleReturnMaterialChange = (materialId) => {
  const material = returnMaterialOptions.value.find(m => m.id === materialId)
  if (material) {
    autoFillLocation(material, 'return')
  }
}

// 补发物料变化
const handleIssueMaterialChange = (materialId) => {
  const material = issueMaterialOptions.value.find(m => m.id === materialId)
  if (material) {
    autoFillLocation(material, 'issue')
  }
}

// 打开调货对话框
const handleExchange = () => {
  Object.assign(exchangeForm, {
    transaction_date: new Date().toISOString().split('T')[0],
    remark: '',
    return_material_id: null,
    return_location_id: null,
    return_location_name: '',
    return_quantity: '',
    issue_material_id: null,
    issue_location_id: null,
    issue_location_name: '',
    issue_quantity: ''
  })
  returnMaterialOptions.value = []
  issueMaterialOptions.value = []
  exchangeDialogVisible.value = true
}

// 提交调货
const handleExchangeSubmit = async () => {
  if (!exchangeFormRef.value) return

  await exchangeFormRef.value.validate(async (valid) => {
    if (!valid) return

    // 验证仓库是否已设置
    if (!exchangeForm.return_location_id) {
      ElMessage.error('退回物料未设置默认仓库，请联系管理员')
      return
    }
    if (!exchangeForm.issue_location_id) {
      ElMessage.error('补发物料未设置默认仓库，请联系管理员')
      return
    }

    exchangeSubmitting.value = true
    try {
      const data = {
        transaction_date: exchangeForm.transaction_date,
        remark: exchangeForm.remark,
        return_material_id: exchangeForm.return_material_id,
        return_location_id: exchangeForm.return_location_id,
        return_quantity: Number(exchangeForm.return_quantity),
        issue_material_id: exchangeForm.issue_material_id,
        issue_location_id: exchangeForm.issue_location_id,
        issue_quantity: Number(exchangeForm.issue_quantity)
      }

      // 调用专用调货接口，在一个事务中创建两个单据
      const response = await inventoryApi.createExchange(data)

      ElMessage.success(`调货成功！退回单号：${response.data.return_transaction_no}，补发单号：${response.data.issue_transaction_no}`)
      exchangeDialogVisible.value = false
      loadTableData()
    } catch (error) {
      console.error('调货失败:', error)
      ElMessage.error(error.response?.data?.message || '调货失败')
    } finally {
      exchangeSubmitting.value = false
    }
  })
}

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return

  // 验证明细
  if (!form.items || form.items.length === 0) {
    ElMessage.warning('请至少添加一条物料明细')
    return
  }

  // 验证每条明细
  for (let i = 0; i < form.items.length; i++) {
    const item = form.items[i]
    if (!item.location_id) {
      ElMessage.warning(`第${i + 1}行：请选择仓库`)
      return
    }
    if (!item.quantity || item.quantity <= 0) {
      ElMessage.warning(`第${i + 1}行：请输入有效数量`)
      return
    }
  }

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    // 检查是否为出库类型
    const selectedBusinessType = businessTypesMap.value[form.transaction_type]
    const isOutbound = selectedBusinessType?.category === 'out'

    // 如果是出库，检查库存是否充足
    if (isOutbound) {
      const insufficientItems = []
      for (let i = 0; i < form.items.length; i++) {
        const item = form.items[i]
        if (item.quantity > item.stock_quantity) {
          insufficientItems.push({
            index: i + 1,
            material_name: item.material_name,
            quantity: item.quantity,
            stock: item.stock_quantity
          })
        }
      }

      if (insufficientItems.length > 0) {
        const messages = insufficientItems.map(item =>
          `第${item.index}行【${item.material_name}】：需要${item.quantity}，库存${item.stock}`
        ).join('\n')

        try {
          await ElMessageBox.confirm(
            `以下物料库存不足：\n${messages}\n\n是否继续创建？（需审批通过后才会出库）`,
            '库存不足提示',
            {
              confirmButtonText: '继续创建',
              cancelButtonText: '取消',
              type: 'warning',
              dangerouslyUseHTMLString: false
            }
          )
        } catch {
          // 用户点击取消
          return
        }
      }
    }

    submitting.value = true
    try {
      const data = {
        transaction_type: form.transaction_type,
        transaction_date: form.transaction_date,
        remark: form.remark || '',
        items: form.items.map(item => ({
          material_id: item.material_id,
          location_id: item.location_id,
          quantity: Number(item.quantity)
        }))
      }

      // 只支持创建，不支持编辑（手工出入库单据一旦创建，不应修改，如需修改请删除重建）
      await inventoryApi.createManualTransaction(data)
      ElMessage.success('创建成功，等待审批')

      dialogVisible.value = false
      loadTableData()
    } catch (error) {
      console.error('提交失败:', error)
      ElMessage.error(error.response?.data?.message || '提交失败')
    } finally {
      submitting.value = false
    }
  })
}

// 初始化
onMounted(() => {
  loadBusinessTypes()
  loadLocations()
  loadTableData()
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

.manual-transaction-container {
  padding: 20px;
}

/* 使用全局 common-styles.css 中的 .page-header, .search-card, .statistics-row, .stat-card, .stat-value, .stat-label, .data-card, .pagination-container */

/* 修复表格内输入框宽度问题 */
:deep(.el-table .el-autocomplete) {
  width: 100% !important;
}

:deep(.el-table .el-autocomplete .el-input__wrapper) {
  width: 100% !important;
  min-width: 100px;
}

:deep(.el-table .el-autocomplete .el-input__inner) {
  width: 100% !important;
  min-width: 100px;
}

/* 修复表格内 el-input 输入框宽度问题 */
:deep(.el-table .el-input) {
  width: 100% !important;
}

:deep(.el-table .el-input__wrapper) {
  width: 100% !important;
}

:deep(.el-table .el-input__inner) {
  width: 100% !important;
}

/* 修复表格内 el-select 下拉框宽度问题 */
:deep(.el-table .el-select) {
  width: 100% !important;
}

:deep(.el-table .el-select .el-input__wrapper) {
  width: 100% !important;
}

:deep(.el-table .el-select .el-input__inner) {
  width: 100% !important;
}

/* 物料列表样式 */
.materials-list {
  margin-top: 10px;
}

.materials-list :deep(.el-table__header) {
  font-weight: 600;
}

.materials-list :deep(.el-table__empty-text) {
  color: var(--color-text-secondary);
  font-size: 13px;
}

/* 自动完成下拉框样式优化 */
:deep(.el-autocomplete-suggestion) {
  max-width: 500px;
}

:deep(.el-autocomplete-suggestion__wrap) {
  max-height: 300px;
}
</style>

