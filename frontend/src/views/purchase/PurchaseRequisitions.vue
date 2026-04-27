<!--
/**
 * PurchaseRequisitions.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="purchase-requisitions-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>采购申请管理</h2>
          <p class="subtitle">管理采购需求与申请</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="showCreateDialog">新建采购申请</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="申请号/合同编码">
          <el-input
            v-model="searchForm.keyword"
            placeholder="申请单号或合同编码"
            clearable

            @clear="loadRequisitions(1)"
            @keyup.enter="loadRequisitions(1)"
          ></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="searchForm.status"
            placeholder="请选择状态"
            clearable

            @change="loadRequisitions(1)"
          >
            <el-option label="草稿" value="draft"></el-option>
            <el-option label="已提交" value="submitted"></el-option>
            <el-option label="已批准" value="approved"></el-option>
            <el-option label="已拒绝" value="rejected"></el-option>
            <el-option label="已完成" value="completed"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="申请人">
          <el-select
            v-model="searchForm.requester"
            placeholder="请选择申请人"
            clearable
            filterable

            @change="loadRequisitions(1)"
          >
            <el-option
              v-for="item in operators"
              :key="item.username"
              :label="item.real_name || item.username"
              :value="item.username"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="申请日期">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"

            @change="loadRequisitions(1)"
          ></el-date-picker>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadRequisitions(1)">
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
        <div class="stat-value">{{ requisitionStats.total || 0 }}</div>
        <div class="stat-label">申请单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ requisitionStats.draftCount || 0 }}</div>
        <div class="stat-label">草稿状态</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ requisitionStats.submittedCount || 0 }}</div>
        <div class="stat-label">已提交审批</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ requisitionStats.approvedCount || 0 }}</div>
        <div class="stat-label">已批准</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ requisitionStats.rejectedCount || 0 }}</div>
        <div class="stat-label">已拒绝</div>
      </el-card>
    </div>

    <!-- 采购申请列表 -->
    <el-card class="data-card">
      <el-table
        ref="requisitionTableRef"
        v-loading="loading"
        :data="requisitions"
        border
        style="width: 100%"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" fixed="left"></el-table-column>
        <el-table-column prop="requisition_number" label="申请单号" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="contract_code" label="合同编码" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.contract_code || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="request_date" label="申请日期" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatDate(row.request_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="requester" label="申请人" min-width="100" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.real_name || row.requester || '未知' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="100" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-if="row.is_fully_ordered" type="success">已采购</el-tag>
            <el-tag v-else-if="row.is_partially_ordered" type="warning">部分采购</el-tag>
            <el-tag v-else-if="row.status === 'approved'" type="danger">未采购</el-tag>
            <el-tag v-else :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remarks" label="备注" min-width="350" show-overflow-tooltip></el-table-column>
        <el-table-column label="创建时间" min-width="140" prop="created_at" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              v-permission="'purchase:requisitions:view'"
              @click="viewRequisition(row)"
            >
              查看
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              size="small"
              type="primary"
              v-permission="'purchase:requisitions:update'"
              @click="editRequisition(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              size="small"
              type="danger"
              v-permission="'purchase:requisitions:delete'"
              @click="handleCommand('delete', row)"
            >
              删除
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              size="small"
              type="success"
              v-permission="'purchase:requisitions:update'"
              @click="handleCommand('submit', row)"
            >
              提交审批
            </el-button>
            <el-button
              v-if="row.status === 'rejected'"
              size="small"
              type="primary"
              v-permission="'purchase:requisitions:update'"
              @click="handleCommand('redraft', row)"
            >
              重新编辑
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        ></el-pagination>
      </div>
    </el-card>

    <!-- 创建/编辑申请对话框 -->
    <el-dialog
      v-model="requisitionDialog.visible"
      :title="requisitionDialog.isEdit ? '编辑采购申请' : '新建采购申请'"
      width="850px"
      destroy-on-close
    >
      <div v-loading="requisitionDialog.loading">
        <el-form
          ref="requisitionFormRef"
          :model="requisitionForm"
          :rules="requisitionRules"
          label-width="100px"
        >
        <el-form-item label="申请日期" prop="requestDate">
          <el-date-picker
            v-model="requisitionForm.requestDate"
            type="date"
            placeholder="选择日期"
            style="width: 100%"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>

        <el-form-item label="合同编码">
          <el-input 
            v-model="requisitionForm.contractCode"
            placeholder="请输入关联的销售订单合同编码（选填）"
            clearable ></el-input>
        </el-form-item>

        <el-form-item label="备注" prop="remarks">
          <el-input
            v-model="requisitionForm.remarks"
            type="textarea"
            :rows="2"
            placeholder="请输入备注"
          ></el-input>
        </el-form-item>

        <el-divider content-position="center">申请物料</el-divider>

        <div class="materials-list">
          <el-table :data="requisitionForm.materials" border style="width: 100%">
            <el-table-column label="序号" type="index" width="55" align="center"></el-table-column>
            <el-table-column label="物料编码" width="150" show-overflow-tooltip>
              <template #default="{ row, $index }">
                <el-autocomplete
                  :ref="(el) => setMaterialSelectRef(el, $index)"
                  v-model="row.materialCode"
                  placeholder="输入物料编码"
                  clearable
                  :fetch-suggestions="(query, callback) => fetchMaterialSuggestions(query, callback, $index)"
                  @select="(item) => handleMaterialSelect(item, $index)"
                  @keydown.enter="handleMaterialEnter($index)"
                  style="width: 100%"
                  :trigger-on-focus="false"
                  :debounce="300"
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
            <el-table-column label="物料名称" width="130" show-overflow-tooltip>
              <template #default="scope">
                {{ scope.row.materialName || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="规格" width="180" show-overflow-tooltip>
              <template #default="scope">
                {{ scope.row.specification || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="单位" min-width="55" show-overflow-tooltip>
              <template #default="scope">
                {{ scope.row.unit || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="数量" width="120" show-overflow-tooltip>
              <template #default="{ row, $index }">
                <el-input
                  :ref="(el) => setQuantityInputRef(el, $index)"
                  v-model="row.quantity"
                  placeholder="数量"
                  @keydown.enter="handleQuantityEnter($index)"
                ></el-input>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="60" fixed="right">
              <template #default="{ $index }">
                <el-button
                  link
                  type="danger"
                  size="small"
                  @click="removeMaterial($index)"
                  v-permission="'purchase:requisitions:update'"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="add-material" style="margin-top: 10px;">
            <el-button type="primary" @click="addMaterialRow">
              <el-icon><Plus /></el-icon>添加物料
            </el-button>
          </div>
        </div>
      </el-form>
      </div>
      <template #footer>
        <el-button @click="requisitionDialog.visible = false" :disabled="requisitionDialog.loading">取消</el-button>
        <el-button v-permission="'purchase:requisitions:update'" type="primary" @click="submitForm" :loading="requisitionDialog.loading">保存</el-button>
      </template>
    </el-dialog>

    <!-- 采购申请详情对话框 -->
    <el-dialog
      v-model="viewDialog.visible"
      title="采购申请详情"
      width="830px"
      destroy-on-close
    >
      <div v-loading="viewDialog.loading">
        <el-descriptions border :column="2">
        <el-descriptions-item label="申请单号">{{ viewData.requisition_number || viewData.requisitionNumber || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="申请日期">{{ formatDate(viewData.request_date || viewData.requestDate) }}</el-descriptions-item>
        <el-descriptions-item label="申请人">
          {{ viewData.real_name || viewData.requester || '未知' }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(viewData.status || 'draft')">{{ getStatusText(viewData.status || 'draft') }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(viewData.created_at || viewData.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatDate(viewData.updated_at || viewData.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ viewData.remarks || '无' }}</el-descriptions-item>
      </el-descriptions>

      <el-divider content-position="center">申请物料</el-divider>

      <el-table :data="viewData.materials || []" border style="width: 100%">
        <el-table-column label="物料编码" prop="material_code" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.material_code || row.materialCode || '未知' }}
          </template>
        </el-table-column>
        <el-table-column label="物料名称" prop="material_name" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.material_name || row.materialName || '未知' }}
          </template>
        </el-table-column>
        <el-table-column label="规格" prop="specification" min-width="150" show-overflow-tooltip></el-table-column>
        <el-table-column label="单位" prop="unit" min-width="60" show-overflow-tooltip></el-table-column>
        <el-table-column label="供应商" prop="supplier_name" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.supplier_name && row.supplier_name !== '暂无设置供应商' ? row.supplier_name : (row.supplier_name || '暂无设置供应商') }}
          </template>
        </el-table-column>
        <el-table-column label="数量" min-width="100" show-overflow-tooltip>
          <template #default="{ row }">
            {{ parseFloat(row.quantity || 0).toFixed(2) }}
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!viewData.materials || viewData.materials.length === 0" class="no-data-message">
        暂无物料数据
      </div>
      </div>
      <template #footer>
        <el-button @click="viewDialog.visible = false">关闭</el-button>
        <el-button type="primary" @click="handlePrintRequisition" :loading="printLoading">打印</el-button>
      </template>
    </el-dialog>

    <!-- 状态更新确认对话框 -->
    <el-dialog
      v-model="statusDialog.visible"
      :title="statusDialog.title"
      width="500px"
      destroy-on-close
    >
      <div v-loading="statusDialog.loading">
        <div>您确定要{{ statusDialog.description }}吗？</div>
      </div>
      <template #footer>
        <el-button @click="statusDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="updateStatus">确认</el-button>
      </template>
    </el-dialog>

    <!-- 浮动批量操作栏 -->
    <Transition name="slide-up">
      <div v-if="selectedRequisitions.length > 0" class="floating-batch-bar">
        <div class="batch-info">
          <el-icon><Select /></el-icon>
          <span>已选中 <strong>{{ selectedRequisitions.length }}</strong> 个申请单</span>
        </div>
        <div class="batch-buttons">
          <el-button
            v-if="canBatchSubmit"
            type="success"
            @click="handleBatchSubmit"
            :loading="batchLoading"
          >
            <el-icon><Promotion /></el-icon> 批量提交
          </el-button>
          <el-button
            @click="clearSelection"
          >
            <el-icon><Close /></el-icon> 清空选择
          </el-button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onActivated, nextTick, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, purchaseApi, baseDataApi } from '@/services/api';
import { Plus, Search, Refresh, Select, Promotion, CircleCheck, Close } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { searchMaterials } from '@/utils/searchConfig';
import { formatDate } from '@/utils/helpers/dateUtils'
import printService, { parseTemplateResponse } from '@/services/printService'

// 初始化 authStore
const authStore = useAuthStore();

// 搜索表单
const searchForm = reactive({
  keyword: '',  // 申请单号或合同编码关键字
  status: '',
  requester: '',  // 申请人
  dateRange: null
});

// 分页设置
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
});

// 申请单列表
const requisitions = ref([]);
const loading = ref(false);
const operators = ref([]);  // 操作人列表

// 批量操作相关
const requisitionTableRef = ref(null);
const selectedRequisitions = ref([]);
const batchLoading = ref(false);

// 申请单对话框
const requisitionDialog = reactive({
  visible: false,
  isEdit: false,
  loading: false
});

// 申请单表单
const requisitionFormRef = ref(null);
const requisitionForm = reactive({
  id: null,
  requestDate: new Date().toISOString().split('T')[0],
  contractCode: '',  // 合同编码（选填）
  remarks: '',
  materials: []
});

// 申请单表单验证规则
const requisitionRules = {
  requestDate: [{ required: true, message: '请选择申请日期', trigger: 'change' }],
  materials: [
    {
      type: 'array',
      required: true,
      message: '请至少选择一个物料',
      trigger: 'change',
      validator: (rule, value) => value.length > 0
    }
  ]
};

// 查看详情对话框
const viewDialog = reactive({
  visible: false,
  loading: false
});

// 查看详情数据
const viewData = reactive({
  requisition_number: '',
  request_date: '',
  requester: '',
  status: '',
  remarks: '',
  created_at: '',
  updated_at: '',
  materials: []
});

// 状态更新对话框
const statusDialog = reactive({
  visible: false,
  loading: false,
  title: '',
  description: '',
  requisitionId: null,
  newStatus: ''
});

// 申请单统计数据
const requisitionStats = ref({
  total: 0,
  draftCount: 0,
  submittedCount: 0,
  approvedCount: 0,
  rejectedCount: 0
});

// 加载申请单列表
const loadRequisitions = async (page = pagination.page) => {
  loading.value = true;
  try {
    const params = {
      page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,  // 申请单号或合同编码关键字
      status: searchForm.status || undefined,
      requester: searchForm.requester || undefined  // 申请人
    };

    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }

    let response;
    try {
      response = await purchaseApi.getRequisitions(params);
    } catch (err) {
      console.error('API调用失败:', err);
      // API调用失败时返回空数据
      response = {
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0
      };
    }
    
    requisitions.value = response.items || [];
    pagination.total = Number(response.total ?? 0);
    pagination.page = Number(response.page ?? 1);
    

    
    await loadRequisitionStats();
  } catch (error) {
    console.error('加载采购申请列表失败:', error);
    if (error.response) {
      console.error('错误响应状态:', error.response.status);
      console.error('错误响应数据:', error.response.data);
    }
    ElMessage.error('加载采购申请列表失败');
    
    // 加载失败时设置空数据
    requisitions.value = [];
    pagination.total = 0;
  } finally {
    loading.value = false;
  }
};

// 搜索重置
const resetSearch = () => {
  searchForm.keyword = '';
  searchForm.status = '';
  searchForm.requester = '';
  searchForm.dateRange = null;
  loadRequisitions(1);
};

// 加载操作人列表
const loadOperators = async () => {
  try {
    const res = await api.get('/system/users/list');

    // 处理不同格式的响应数据
    if (res.data && Array.isArray(res.data)) {
      operators.value = res.data;
    } else if (res.data && res.data.data && Array.isArray(res.data.data)) {
      operators.value = res.data.data;
    } else {
      console.error('未能识别的用户数据格式:', res.data);
      operators.value = [];
    }
  } catch (error) {
    console.error('加载操作人列表失败:', error);
    operators.value = [];
  }
};

// 分页大小变更处理
const handleSizeChange = (newSize) => {
  pagination.pageSize = newSize;
  loadRequisitions(1);
};

// 页码变更处理
const handleCurrentChange = (newPage) => {
  loadRequisitions(newPage);
};

// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    draft: '草稿',
    submitted: '已提交',
    approved: '已批准',
    rejected: '已拒绝',
    completed: '已完成'
  };
  return statusMap[status] || status;
};

// 获取状态类型（用于标签样式）
const getStatusType = (status) => {
  const statusTypeMap = {
    draft: 'info',
    submitted: 'warning',
    approved: 'success',
    rejected: 'danger',
    completed: 'success'
  };
  return statusTypeMap[status] || 'info';
};

// 显示创建对话框
const showCreateDialog = () => {
  requisitionDialog.isEdit = false;
  requisitionForm.id = null;
  requisitionForm.requestDate = new Date().toISOString().split('T')[0];
  requisitionForm.remarks = '';
  requisitionForm.materials = [];
  // 自动添加一行空的物料
  addMaterialRow();
  requisitionDialog.visible = true;
};

// 编辑申请单
const editRequisition = async (row) => {
  requisitionDialog.isEdit = true;
  requisitionDialog.visible = true;
  requisitionDialog.loading = true;
  try {
    const response = await purchaseApi.getRequisition(row.id);
    
    requisitionForm.id = response.id;
    requisitionForm.requestDate = response.request_date;
    requisitionForm.remarks = response.remarks;
    
    // 转换材料格式
    requisitionForm.materials = response.materials.map(item => ({
      materialId: item.material_id,
      materialCode: item.material_code,
      materialName: item.material_name,
      specification: item.specification,
      unit: item.unit,
      unitId: item.unit_id,
      quantity: Number(item.quantity)
    }));
    
    requisitionDialog.isEdit = true;
  } catch (error) {
    console.error('获取采购申请详情失败:', error);
    ElMessage.error('获取采购申请详情失败');
    requisitionDialog.visible = false;
  } finally {
    requisitionDialog.loading = false;
  }
};

// 提交表单
const submitForm = async () => {
  if (!requisitionFormRef.value) return;
  
  await requisitionFormRef.value.validate(async (valid) => {
    if (!valid) return;
    
    try {
      requisitionDialog.loading = true;
      
      // 先尝试获取最新的用户信息
      try {
        await authStore.fetchUserProfile();
      } catch (err) {
        console.warn('获取最新用户信息失败，将使用当前缓存的用户信息');
      }
      
      // 确保物料数据格式正确
      const processedMaterials = requisitionForm.materials.map(material => ({
        materialId: material.materialId || null,
        materialCode: material.materialCode || '',
        materialName: material.materialName || '',
        specification: material.specification || '',
        unit: material.unit || '',
        unitId: material.unitId || null,
        quantity: material.quantity || 0
      }));
      
      const formData = {
        requestDate: requisitionForm.requestDate,
        contractCode: requisitionForm.contractCode || null,  // 合同编码（选填）
        remarks: requisitionForm.remarks,
        materials: processedMaterials,
        requester: authStore.user?.username || '',
        real_name: authStore.user?.real_name || ''
      };
      
      if (requisitionDialog.isEdit) {
        await purchaseApi.updateRequisition(requisitionForm.id, formData);
        ElMessage.success('采购申请更新成功');
      } else {
        await purchaseApi.createRequisition(formData);
        ElMessage.success('采购申请创建成功');
      }
      
      requisitionDialog.visible = false;
      loadRequisitions();
    } catch (error) {
      console.error('保存采购申请失败:', error);
      if (error.response) {
        console.error('错误响应:', error.response.data);
      }
      ElMessage.error('保存采购申请失败');
    } finally {
      requisitionDialog.loading = false;
    }
  });
};

// 移除物料
const removeMaterial = (index) => {
  requisitionForm.materials.splice(index, 1);
};

// 添加物料行
const addMaterialRow = () => {
  requisitionForm.materials.push({
    materialId: null,
    materialCode: '',
    materialName: '',
    specification: '',
    unit: '',
    unitId: null,
    quantity: ''
  });
};

// 过滤物料
const materialsLoading = ref(false);
const filteredProducts = ref([]);

// 组件引用管理
const materialSelectRefs = ref({});
const quantityInputRefs = ref({});

// 设置物料选择框引用
const setMaterialSelectRef = (el, index) => {
  if (el) {
    materialSelectRefs.value[index] = el;
  }
};

// 设置数量输入框引用
const setQuantityInputRef = (el, index) => {
  if (el) {
    quantityInputRefs.value[index] = el;
  }
};

// 获取物料建议 - 使用统一搜索函数
const fetchMaterialSuggestions = async (query, callback) => {
  if (!query || query.length < 1) {
    callback([]);
    return;
  }

  try {
    // 使用统一的搜索函数
    const searchResults = await searchMaterials(baseDataApi, query.trim(), {
      pageSize: 500,
      includeAll: true
    });

    // 格式化数据供自动完成使用
    const suggestions = searchResults.map(item => ({
      value: item.code || '无编码',
      code: item.code || '无编码',
      name: item.name || '未命名',
      specs: item.specification || item.specs || '',
      stock_quantity: item.stock_quantity || 0,
      id: item.id,
      unit_name: item.unit_name || '个',
      unit_id: item.unit_id
    }));

    // 保存到全局变量供Enter键使用
    filteredProducts.value = suggestions;

    callback(suggestions);
  } catch (error) {
    ElMessage.error('搜索物料失败');
    callback([]);
  }
};

// 处理自动完成选择
const handleMaterialSelect = (item, index) => {
  requisitionForm.materials[index].materialId = item.id;
  requisitionForm.materials[index].materialCode = item.code;
  requisitionForm.materials[index].materialName = item.name;
  requisitionForm.materials[index].specification = item.specs;
  requisitionForm.materials[index].unit = item.unit_name;
  requisitionForm.materials[index].unitId = item.unit_id;
  
  // 选择物料后，自动聚焦到数量输入框
  nextTick(() => {
    const quantityInput = quantityInputRefs.value[index];
    if (quantityInput) {
      quantityInput.focus();
    }
  });
};

// 处理物料选择（保留兼容性）
const handleMaterialChange = (materialCode, index) => {
  if (!materialCode) {
    // 清空物料信息
    requisitionForm.materials[index].materialId = null;
    requisitionForm.materials[index].materialName = '';
    requisitionForm.materials[index].specification = '';
    requisitionForm.materials[index].unit = '';
    requisitionForm.materials[index].unitId = null;
    return;
  }
  
  // 从过滤结果中找到选中的物料
  const selectedMaterial = filteredProducts.value.find(m => 
    m.code === materialCode
  );
  if (selectedMaterial) {
    handleMaterialSelect(selectedMaterial, index);
  }
};

// 处理物料编码Enter键
const handleMaterialEnter = (index) => {
  // 如果有搜索结果，自动选择第一个
  if (filteredProducts.value.length > 0) {
    const firstMaterial = filteredProducts.value[0];
    handleMaterialSelect(firstMaterial, index);
  }
};

// 处理数量Enter键
const handleQuantityEnter = (index) => {
  // 添加新的物料行
  addMaterialRow();
  
  // 聚焦到新行的物料选择框
  nextTick(() => {
    const newIndex = requisitionForm.materials.length - 1;
    const materialSelect = materialSelectRefs.value[newIndex];
    if (materialSelect) {
      materialSelect.focus();
    }
  });
};

// 查看采购申请详情
const viewRequisition = async (row) => {
  viewDialog.visible = true;
  viewDialog.loading = true;
  try {
    let response;
    try {
      response = await purchaseApi.getRequisition(row.id);
    } catch (err) {
      console.error('获取申请详情失败:', err);
      // 使用行数据作为备用
      response = {
        ...row,
        materials: []
      };
    }
    
    // 清空之前的数据
    Object.keys(viewData).forEach(key => {
      if (typeof viewData[key] === 'object' && !Array.isArray(viewData[key])) {
        viewData[key] = {};
      } else if (Array.isArray(viewData[key])) {
        viewData[key] = [];
      } else {
        viewData[key] = '';
      }
    });
    
    // 填充新数据
    Object.assign(viewData, response);
    
    
  } catch (error) {
    console.error('获取采购申请详情失败:', error);
    ElMessage.error('获取采购申请详情失败');
    viewDialog.visible = false;
  } finally {
    viewDialog.loading = false;
  }
};

// 批量操作相关计算属性
const canBatchSubmit = computed(() => {
  if (selectedRequisitions.value.length === 0) return false;
  return selectedRequisitions.value.every(req => req.status === 'draft');
});


// 批量操作方法
const handleSelectionChange = (selection) => {
  selectedRequisitions.value = selection;
};

const clearSelection = () => {
  if (requisitionTableRef.value) {
    requisitionTableRef.value.clearSelection();
  }
  selectedRequisitions.value = [];
};

const handleBatchSubmit = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要批量提交选中的 ${selectedRequisitions.value.length} 个申请单吗？`,
      '批量提交',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    batchLoading.value = true;
    let successCount = 0;
    let failCount = 0;

    for (const req of selectedRequisitions.value) {
      try {
        await purchaseApi.updateRequisitionStatus(req.id, { newStatus: 'submitted' });
        successCount++;
      } catch (error) {
        console.error(`申请单 ${req.requisition_number} 提交失败:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      ElMessage.success(`成功提交 ${successCount} 个申请单${failCount > 0 ? `，${failCount} 个失败` : ''}`);
      clearSelection();
      await loadRequisitions();
    } else {
      ElMessage.error('批量提交失败');
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量提交失败:', error);
    }
  } finally {
    batchLoading.value = false;
  }
};

// 处理下拉菜单命令
const handleCommand = (command, row) => {
  switch (command) {
    case 'submit':
      showStatusDialog(row.id, 'submitted', '状态更新', '将此申请提交审批');
      break;
    case 'redraft':
      showStatusDialog(row.id, 'draft', '重新编辑', '将此申请退回至草稿状态');
      break;
    case 'delete':
      confirmDelete(row);
      break;
  }
};

// 显示状态更新对话框
const showStatusDialog = (id, newStatus, title, description) => {
  statusDialog.requisitionId = id;
  statusDialog.newStatus = newStatus;
  statusDialog.title = title;
  statusDialog.description = description;
  statusDialog.visible = true;
};

// 更新状态
const updateStatus = async () => {
  statusDialog.loading = true;
  try {
    const response = await purchaseApi.updateRequisitionStatus(
      statusDialog.requisitionId,
      { newStatus: statusDialog.newStatus }
    );
    
    // 检查后端自动审批通过后是否生成了采购订单（auto_approved场景）
    if (response.generated_orders && response.generated_orders.length > 0) {
      const orders = response.generated_orders;
      let message = `审批成功！已自动生成 ${orders.length} 个采购订单：\n`;
      orders.forEach((order, index) => {
        message += `\n${index + 1}. 订单号: ${order.order_no}`;
        message += `\n   供应商: ${order.supplier_name}`;
        message += `\n   物料数: ${order.items_count} 件`;
        message += `\n   总金额: ¥${order.total_amount.toFixed(2)}`;
      });
      message += '\n\n请前往"采购订单"页面查看详情。';
      
      ElMessageBox.alert(message, '采购订单已生成', {
        confirmButtonText: '知道了',
        type: 'success',
        dangerouslyUseHTMLString: false
      });
    } else {
      ElMessage.success('状态更新成功');
    }
    
    statusDialog.visible = false;
    loadRequisitions();
  } catch (error) {
    console.error('更新状态失败:', error);
    ElMessage.error('更新状态失败: ' + (error.response?.data?.error || error.message));
  } finally {
    statusDialog.loading = false;
  }
};

// 确认删除
const confirmDelete = (row) => {
  ElMessageBox.confirm(
    '确定要删除此采购申请吗？此操作无法撤销。',
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  )
    .then(async () => {
      try {
        await purchaseApi.deleteRequisition(row.id);
        ElMessage.success('删除成功');
        loadRequisitions();
      } catch (error) {
        console.error('删除失败:', error);
        ElMessage.error('删除失败: ' + (error.response?.data?.error || error.message));
      }
    })
    .catch(() => {});
};

// 格式化日期
// formatDate: 使用公共实现


// 加载申请单统计数据
const loadRequisitionStats = async () => {
  try {
    // 从当前列表数据计算统计信息
    const total = requisitions.value.length;
    const draftCount = requisitions.value.filter(item => item.status === 'draft').length;
    const submittedCount = requisitions.value.filter(item => item.status === 'submitted').length;
    const approvedCount = requisitions.value.filter(item => item.status === 'approved').length;
    const rejectedCount = requisitions.value.filter(item => item.status === 'rejected').length;
    
    // 更新统计数据
    requisitionStats.value = {
      total,
      draftCount,
      submittedCount,
      approvedCount,
      rejectedCount
    };
  } catch (error) {
    console.error('计算申请单统计数据失败:', error);
    // 保持当前统计数据不变
  }
};

// 页面加载时获取数据
onMounted(async () => {
  // 立即显示加载状态
  loading.value = true;

  // 并行加载数据，提高加载速度
  try {
    await Promise.allSettled([
      loadRequisitions(1),
      loadRequisitionStats(),
      loadOperators(),
      authStore.fetchUserProfile(false) // 不获取权限信息，提高速度
    ]);
  } catch (error) {
    console.error('页面初始化失败:', error);
  } finally {
    loading.value = false;
  }
});

// 页面激活时刷新数据（从其他页面返回时）
onActivated(async () => {
  // 刷新申请单列表和统计数据
  try {
    await Promise.allSettled([
      loadRequisitions(),
      loadRequisitionStats()
    ]);
  } catch (error) {
    console.error('页面激活刷新失败:', error);
  }
});

// ========== 打印功能 ==========
const printLoading = ref(false)
const handlePrintRequisition = async () => {
  printLoading.value = true
  try {
    const response = await printService.getPrintTemplateById(73)
    const template = parseTemplateResponse(response)
    if (!template || !template.content) {
      ElMessage.error('未找到采购申请单打印模板，请在系统管理-打印模板中配置')
      return
    }
    const printData = {
      requisition_number: viewData.requisition_number || viewData.requisitionNumber || '',
      request_date: formatDate(viewData.request_date || viewData.requestDate) || '',
      requester: viewData.real_name || viewData.requester || '',
      status: getStatusText(viewData.status || 'draft'),
      remarks: viewData.remarks || '',
      items: (viewData.materials || []).map((item, idx) => ({
        index: idx + 1,
        material_code: item.material_code || item.materialCode || '',
        material_name: item.material_name || item.materialName || '',
        specification: item.specification || '',
        quantity: parseFloat(item.quantity || 0).toFixed(2),
        unit_name: item.unit || item.unit_name || '',
        remark: item.remark || ''
      }))
    }
    const html = printService.generatePrintContent(template, printData)
    printService.previewDocument(html)
  } catch (error) {
    console.error('打印采购申请单失败:', error)
    ElMessage.error('打印失败: ' + (error.message || '未知错误'))
  } finally {
    printLoading.value = false
  }
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

/* 浮动批量操作栏样式 */
.floating-batch-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4), 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  gap: 32px;
  min-width: 400px;
}

.floating-batch-bar .batch-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-size: 14px;
}

.floating-batch-bar .batch-info .el-icon {
  font-size: 20px;
}

.floating-batch-bar .batch-info strong {
  color: #ffd700;
  font-size: 18px;
  margin: 0 2px;
}

.floating-batch-bar .batch-buttons {
  display: flex;
  gap: 12px;
}

.floating-batch-bar .batch-buttons .el-button {
  border: 1px solid rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
}

.floating-batch-bar .batch-buttons .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* 浮动栏进入/离开动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 100%);
}

.materials-list {
  margin-top: var(--spacing-base);
}

.materials-header {
  margin-bottom: var(--spacing-base);
  display: flex;
  justify-content: flex-start;
}

/* 物料搜索对话框 */
.material-search {
  margin-bottom: var(--spacing-base);
}

.material-search .el-input {
  width: 300px;
}

/* 操作列样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
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