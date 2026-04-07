<!--
/**
 * InventoryTransfer.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="inventory-transfer-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>库存调拨管理</h2>
          <p class="subtitle">管理库存调拨与转移</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="openTransferDialog()">新建调拨单</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :model="searchForm" :inline="true" class="search-form">
        <el-form-item label="调拨单号">
          <el-input  v-model="searchForm.transfer_no" placeholder="请输入调拨单号" clearable ></el-input>
        </el-form-item>
        <el-form-item label="调拨状态">
          <el-select  v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="searchForm.date_range"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>
      
      <!-- 批量操作按钮 -->
      <div class="batch-actions">
        <el-dropdown @command="handleBatchCommand">
          <el-button type="primary">
            批量操作<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="export">
                <el-icon><Download /></el-icon> 导出调拨单
              </el-dropdown-item>
              <el-dropdown-item command="print">
                <el-icon><Printer /></el-icon> 批量打印
              </el-dropdown-item>
              <el-dropdown-item command="delete" divided>
                <el-icon><Delete /></el-icon> 批量删除
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-card>
    
    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ transferStats.total || 0 }}</div>
        <div class="stat-label">调拨单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ transferStats.draft || 0 }}</div>
        <div class="stat-label">草稿调拨单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ transferStats.pendingCount || 0 }}</div>
        <div class="stat-label">待审批调拨单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ transferStats.approvedCount || 0 }}</div>
        <div class="stat-label">已批准调拨单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ transferStats.completedCount || 0 }}</div>
        <div class="stat-label">已完成调拨单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ transferStats.cancelledCount || 0 }}</div>
        <div class="stat-label">已取消调拨单</div>
      </el-card>
    </div>
    
    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        v-loading="loading"
        :data="transferList"
        border
        style="width: 100%"
        @selection-change="handleSelectionChange"
      >
        <template #empty>
          <el-empty description="暂无调拨单数据" />
        </template>
        <el-table-column type="selection" width="55"></el-table-column>
        <el-table-column prop="transfer_no" label="调拨单号" min-width="100" show-overflow-tooltip></el-table-column>
        <el-table-column label="调拨日期" min-width="100">
          <template #default="scope">
            {{ formatDate(scope.row.transfer_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="from_location" label="源库位" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="to_location" label="目标库位" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="item_count" label="物料种类" min-width="100" align="center"></el-table-column>
        <el-table-column prop="status" label="状态" min-width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ getStatusText(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="creator_name" label="创建人" min-width="100">
          <template #default="scope">
            {{ scope.row.creator_name || scope.row.creator || '未知' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="250" fixed="right">
          <template #default="scope">
            <div class="operation-btns">
              <el-dropdown 
                v-if="scope.row.status !== 'cancelled' && scope.row.status !== 'completed'" 
                trigger="click" 
                placement="bottom-end"
                class="operation-dropdown"
              >
                <el-button size="small" type="primary">
                  更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="scope.row.status === 'draft'" @click="updateStatus(scope.row.id, 'pending')">
                      <el-icon><Check /></el-icon>提交调拨单
                    </el-dropdown-item>
                    <el-dropdown-item v-if="scope.row.status === 'pending'" @click="updateStatus(scope.row.id, 'approved')">
                      <el-icon><Select /></el-icon>批准调拨单
                    </el-dropdown-item>
                    <el-dropdown-item v-if="scope.row.status === 'approved'" @click="updateStatus(scope.row.id, 'completed')">
                      <el-icon><Finished /></el-icon>完成调拨
                    </el-dropdown-item>
                    <el-dropdown-item v-if="['draft', 'pending', 'approved'].includes(scope.row.status)" @click="updateStatus(scope.row.id, 'cancelled')">
                      <el-icon><Close /></el-icon>取消调拨
                    </el-dropdown-item>
                    <el-dropdown-item v-if="scope.row.status === 'draft'" @click="deleteTransfer(scope.row.id)" divided>
                      <el-icon><Delete /></el-icon>删除调拨单
                    </el-dropdown-item>
                    <el-dropdown-item v-if="scope.row.status === 'draft'" @click="duplicateTransfer(scope.row.id)">
                      <el-icon><CopyDocument /></el-icon>复制调拨单
                    </el-dropdown-item>
                    <el-dropdown-item @click="printTransfer(scope.row.id)">
                      <el-icon><Printer /></el-icon>打印调拨单
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              
              <el-button size="small" @click="viewTransfer(scope.row.id)">
                查看
              </el-button>
              
              <el-button 
                size="small" 
                type="primary" 
                @click="editTransfer(scope.row.id)"
                v-if="scope.row.status === 'draft'"
              >
                编辑
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          @update:page-size="handleSizeChange"
          @update:current-page="handleCurrentChange"
          :currentPage="pagination.current"
          :page-sizes="[10, 20, 50, 100]"
          :pageSize="pagination.size"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 新建/编辑调拨单对话框 -->
    <el-dialog
      :title="dialogType === 'create' ? '新建调拨单' : '编辑调拨单'"
      v-model="transferDialogVisible"
      width="50%"
      destroy-on-close
    >
      <div v-loading="editLoading">
      <el-form :model="transferForm" :rules="transferRules" ref="transferFormRef" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="调拨日期" prop="transfer_date">
              <el-date-picker
                v-model="transferForm.transfer_date"
                type="date"
                placeholder="选择调拨日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="源库位" prop="from_location_id">
              <el-select
                v-model="transferForm.from_location_id"
                placeholder="选择源库位"
                style="width: 100%"
                filterable
                @change="handleFromLocationChange"
              >
                <el-option
                  v-for="item in locationOptions"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="目标库位" prop="to_location_id">
              <el-select
                v-model="transferForm.to_location_id"
                placeholder="选择目标库位"
                style="width: 100%"
                filterable
              >
                <el-option
                  v-for="item in locationOptions.filter(loc => loc.id !== transferForm.from_location_id)"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="操作人" prop="creator">
              <el-input v-model="transferForm.creator" placeholder="系统自动填充当前用户姓名" readonly />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input
            v-model="transferForm.remark"
            type="textarea"
            :rows="2"
            placeholder="请输入备注"
          />
        </el-form-item>

        <el-divider>调拨明细</el-divider>

        <div class="table-toolbar">
          <el-button type="primary" @click="addTransferItem">
            <el-icon><Plus /></el-icon>添加物料
          </el-button>
        </div>

        <el-table :data="transferForm.items" border style="width: 100%">
          <el-table-column label="物料" min-width="200">
            <template #default="{ row, $index }">
              <el-select
                v-model="row.material_id"
                placeholder="请选择或输入关键字搜索"
                style="width: 100%"
                filterable
                remote
                reserve-keyword
                :remote-method="debouncedSearchMaterials"
                :loading="loadingMaterials"
                @focus="handleMaterialSelectFocus"
                @change="(value) => handleMaterialChange(value, $index)"
                clearable
              >
                <el-option
                  v-for="item in materialOptions"
                  :key="item.id"
                  :label="`${item.code} - ${item.name}`"
                  :value="item.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="规格型号" width="150">
            <template #default="{ row }">
              <span>{{ row.specification || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="150">
            <template #default="{ row }">
              <el-input
                v-model="row.quantity"
                placeholder="请输入数量"
                type="number"
                :min="0.01"
                :max="row.available_stock || 999999"
                step="0.01"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="单位" width="120">
            <template #default="{ row }">
              <span>{{ row.unit_name || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="库存数量" width="120">
            <template #default="{ row }">
              <span>{{ row.available_stock || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="150">
            <template #default="{ row }">
              <el-input v-model="row.remark" placeholder="请输入备注" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ $index }">
              <el-button type="danger" link @click="removeTransferItem($index)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="transferDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitTransferForm" :loading="submitting">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看调拨单详情对话框 -->
    <el-dialog 
      title="调拨单详情" 
      v-model="viewDialogVisible" 
      width="50%"
    >
      <div v-loading="detailLoading" id="print-section">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="调拨单号">{{ transferDetail.transfer_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="调拨日期">{{ formatDate(transferDetail.transfer_date) || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(transferDetail.status)">{{ getStatusText(transferDetail.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="源库位">{{ transferDetail.from_location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="目标库位">{{ transferDetail.to_location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ transferDetail.creator || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="3">{{ transferDetail.remarks || '无' }}</el-descriptions-item>
        </el-descriptions>
        
        <h3 style="margin-top: 20px;">物料明细</h3>
        <el-table :data="transferDetail.items || []" border style="width: 100%; margin-top: 10px;">
          <el-table-column type="index" label="序号" width="50"></el-table-column>
          <el-table-column prop="material_code" label="物料编码" min-width="150" show-overflow-tooltip></el-table-column>
          <el-table-column prop="material_name" label="物料名称" min-width="160" show-overflow-tooltip></el-table-column>
          <el-table-column prop="specification" label="规格型号" min-width="140" show-overflow-tooltip></el-table-column>
          <el-table-column prop="quantity" label="调拨数量" min-width="100"></el-table-column>
          <el-table-column prop="unit_name" label="单位" min-width="80"></el-table-column>
          <el-table-column prop="remarks" label="备注" min-width="150"></el-table-column>
        </el-table>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="viewDialogVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Refresh, ArrowDown, Delete, Check, Select, Finished, Close, CopyDocument, Printer, Download } from '@element-plus/icons-vue';
import { inventoryApi, baseDataApi } from '@/services/api';
import { getCurrentDate } from '@/utils/helpers/dateUtils';
import { formatDate } from '@/utils/helpers/formatters';
import { getTransferStatusText, getTransferStatusColor } from '@/constants/systemConstants';
import { useAuthStore } from '@/stores/auth';
import { parseListData, parsePaginatedData } from '@/utils/responseParser';
import { SEARCH_CONFIG, searchMaterials, mapMaterialData } from '@/utils/searchConfig';
import { computed } from 'vue';

// 权限store
const authStore = useAuthStore();

// 权限计算属性
// 状态选项（使用统一常量）
const statusOptions = [
  { value: 'draft', label: getTransferStatusText('draft') },
  { value: 'pending', label: getTransferStatusText('pending') },
  { value: 'approved', label: getTransferStatusText('approved') },
  { value: 'completed', label: getTransferStatusText('completed') },
  { value: 'cancelled', label: getTransferStatusText('cancelled') }
];

// 状态映射函数（使用统一常量）
const getStatusText = (status) => {
  return getTransferStatusText(status)
}

// 搜索表单
const searchForm = reactive({
  transfer_no: '',
  status: '',
  date_range: []
});

// 分页配置
const pagination = reactive({
  current: 1,
  size: 10,
  total: 0
});

// 其他状态变量
const loading = ref(false);
const transferList = ref([]);
const materialOptions = ref([]); // 物料选项
const locationOptions = ref([]); // 库位选项
const dialogType = ref('create'); // 对话框类型：create-新建，edit-编辑
const transferDialogVisible = ref(false); // 调拨单对话框可见性
const viewDialogVisible = ref(false); // 查看对话框可见性
const submitting = ref(false); // 提交中状态
const detailLoading = ref(false); // 详情加载状态
const editLoading = ref(false); // 编辑加载状态

// 表单引用
const transferFormRef = ref(null);

// 调拨单表单
const transferForm = reactive({
  id: '',
  transfer_date: getCurrentDate(),
  from_location_id: '',
  to_location_id: '',
  creator: authStore.realName || '系统用户', // 使用当前登录用户的真实姓名
  remark: '',
  items: []
});

// 调拨单详情
const transferDetail = ref({});

// 表单验证规则
const transferRules = {
  transfer_date: [{ required: true, message: '请选择调拨日期', trigger: 'change' }],
  from_location_id: [{ required: true, message: '请选择源库位', trigger: 'change' }],
  to_location_id: [{ required: true, message: '请选择目标库位', trigger: 'change' }]
};

// 调拨单统计数据
const transferStats = ref({
  total: 0,
  draft: 0,
  pendingCount: 0,
  approvedCount: 0,
  completedCount: 0,
  cancelledCount: 0
});

// 状态映射函数已在上面定义，确保没有重复定义

// 获取状态类型（使用统一常量）
const getStatusType = (status) => {
  return getTransferStatusColor(status);
};

// 查看调拨单
const viewTransfer = async (id) => {
  viewDialogVisible.value = true;
  detailLoading.value = true;
  try {
    const response = await inventoryApi.getTransferDetail(id);
    // 拦截器已解包，response.data 就是业务数据
    transferDetail.value = response.data;
  } catch (error) {
    console.error('获取调拨单详情失败:', error);
    ElMessage.error('获取调拨单详情失败');
  } finally {
    detailLoading.value = false;
  }
};

// 编辑调拨单
const editTransfer = async (id) => {
  dialogType.value = 'edit';
  transferDialogVisible.value = true;
  editLoading.value = true;
  try {
    await fetchMaterials();
    await fetchLocations();

    const response = await inventoryApi.getTransferDetail(id);
    // 拦截器已解包，response.data 就是业务数据
    const transferData = response.data;
    
    // 重置表单
    resetTransferForm();
    
    // 填充表单数据
    transferForm.id = transferData.id;
    transferForm.transfer_date = transferData.transfer_date;
    transferForm.from_location_id = transferData.from_location_id;
    transferForm.to_location_id = transferData.to_location_id;
    transferForm.remark = transferData.remark || transferData.remarks || '';
    
    // 填充物料明细
    if (transferData.items && transferData.items.length > 0) {
      transferForm.items = transferData.items.map(item => ({
        id: item.id,
        material_id: item.material_id,
        material_name: item.material_name,
        material_code: item.material_code,
        specs: item.specs,
        quantity: item.quantity,
        unit_name: item.unit_name,
        available_stock: item.available_stock || 0,
        remarks: item.remarks || ''
      }));
    }
  } catch (error) {
    console.error('获取调拨单详情失败:', error);
    ElMessage.error('获取调拨单详情失败');
  } finally {
    editLoading.value = false;
  }
};

// 更新调拨单状态
const updateStatus = async (id, status) => {
  try {
    await ElMessageBox.confirm(`确定要将调拨单状态更新为"${getStatusText(status)}"吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });
    
    await inventoryApi.updateTransferStatus(id, status);
    ElMessage.success('状态更新成功');
    await loadTransferList();
    loadTransferStats();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('更新调拨单状态失败:', error);
      ElMessage.error('更新调拨单状态失败');
    }
  }
};

// 删除调拨单
const deleteTransfer = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除该调拨单吗？此操作不可逆。', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });
    
    await inventoryApi.deleteTransfer(id);
    ElMessage.success('删除成功');
    await loadTransferList();
    loadTransferStats();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除调拨单失败:', error);
      ElMessage.error('删除调拨单失败');
    }
  }
};

// 处理搜索
const handleSearch = async () => {
  pagination.current = 1;
  await loadTransferList();
  loadTransferStats(); // 重新计算统计数据
};

// 重置搜索
const resetSearch = async () => {
  searchForm.transfer_no = '';
  searchForm.status = '';
  searchForm.date_range = [];
  await handleSearch();
};

// 处理分页大小变化
const handleSizeChange = async (size) => {
  pagination.size = size;
  await loadTransferList();
  // 分页变化时不重新计算统计数据，统计数据应该基于全部数据
};

// 处理页码变化
const handleCurrentChange = async (current) => {
  pagination.current = current;
  await loadTransferList();
  // 分页变化时不重新计算统计数据，统计数据应该基于全部数据
};

// 打开新建调拨单对话框
const openTransferDialog = async () => {
  dialogType.value = 'create';
  resetTransferForm();
  
  // 先显示对话框，再加载数据
  transferDialogVisible.value = true; 
  editLoading.value = true;
  
  try {
    // 异步加载基础数据
    await Promise.all([
      fetchMaterials(),
      fetchLocations()
    ]);
  } catch (error) {
    console.error('加载基础数据失败:', error);
    ElMessage.error('加载基础数据失败，可能需要重新登录');
  } finally {
    editLoading.value = false;
  }
};

// 重置调拨单表单
const resetTransferForm = () => {
  if (transferFormRef.value) {
    transferFormRef.value.resetFields();
  }

  transferForm.id = '';
  transferForm.transfer_date = getCurrentDate();
  transferForm.from_location_id = '';
  transferForm.to_location_id = '';
  transferForm.creator = authStore.realName || '系统用户'; // 重置时也使用当前用户姓名
  transferForm.remark = '';
  transferForm.items = [];
};

// 添加调拨物料
const addTransferItem = () => {
  transferForm.items.push({
    material_id: '',
    material_name: '',
    material_code: '',
    specs: '',
    quantity: 1,
    unit_name: '',
    available_stock: 0,
    remarks: ''
  });
};

// 移除调拨物料
const removeTransferItem = (index) => {
  transferForm.items.splice(index, 1);
};

// 处理物料变更
const handleMaterialChange = async (materialId, index) => {
  if (!materialId) return;
  
  const material = materialOptions.value.find(m => m.id === materialId);
  if (material) {
    transferForm.items[index].material_name = material.name;
    transferForm.items[index].material_code = material.code;
    transferForm.items[index].specification = material.specs || material.specification || '';
    transferForm.items[index].unit_name = material.unit_name || '';
    
    // 获取该物料在源库位的库存
    if (transferForm.from_location_id) {
      try {
        const response = await inventoryApi.getMaterialStock(materialId, transferForm.from_location_id);
        // 拦截器已解包，response.data 就是业务数据
        if (response.data?.quantity) {
          transferForm.items[index].available_stock = response.data.quantity;
        } else {
          transferForm.items[index].available_stock = 0;
          ElMessage.warning(`所选库位没有该物料库存`);
        }
      } catch (error) {
        console.error('获取物料库存失败:', error);
        transferForm.items[index].available_stock = 0;
      }
    }
  }
};

// 处理源库位变更
const handleFromLocationChange = async () => {
  // 清空目标库位
  if (transferForm.to_location_id === transferForm.from_location_id) {
    transferForm.to_location_id = '';
  }
  
  // 更新已选物料的库存数量
  if (transferForm.items.length > 0 && transferForm.from_location_id) {
    for (let i = 0; i < transferForm.items.length; i++) {
      const item = transferForm.items[i];
      if (item.material_id) {
        try {
          const response = await inventoryApi.getMaterialStock(item.material_id, transferForm.from_location_id);
          // 拦截器已解包，response.data 就是业务数据
          if (response.data?.quantity) {
            transferForm.items[i].available_stock = response.data.quantity;
          } else {
            transferForm.items[i].available_stock = 0;
          }
        } catch (error) {
          console.error('获取物料库存失败:', error);
          transferForm.items[i].available_stock = 0;
        }
      }
    }
  }
};

// 提交调拨单表单
const submitTransferForm = async () => {
  if (!transferFormRef.value) return;
  
  try {
    await transferFormRef.value.validate();
    
    // 检查物料列表
    if (transferForm.items.length === 0) {
      ElMessage.warning('请添加至少一种物料');
      return;
    }
    
    // 检查每个物料是否已选择
    for (let i = 0; i < transferForm.items.length; i++) {
      const item = transferForm.items[i];
      if (!item.material_id) {
        ElMessage.warning(`第${i+1}行物料未选择`);
        return;
      }
      
      // 检查调拨数量是否超过库存
      if (item.quantity > item.available_stock) {
        ElMessage.warning(`${item.material_name}的调拨数量超过可用库存`);
        return;
      }
    }
    
    // 检查源库位和目标库位是否相同
    if (transferForm.from_location_id === transferForm.to_location_id) {
      ElMessage.warning('源库位和目标库位不能相同');
      return;
    }
    
    submitting.value = true;
    
    // 准备提交数据
    const formData = {
      transfer_date: transferForm.transfer_date,
      from_location_id: transferForm.from_location_id,
      to_location_id: transferForm.to_location_id,
      remark: transferForm.remark,
      items: transferForm.items,
      status: 'draft',
      from_location: locationOptions.value.find(loc => loc.id === transferForm.from_location_id)?.name || '',
      to_location: locationOptions.value.find(loc => loc.id === transferForm.to_location_id)?.name || ''
    };



    // 提交表单
    if (dialogType.value === 'create') {
      await inventoryApi.createTransfer(formData);
      ElMessage.success('调拨单创建成功');
    } else {
      await inventoryApi.updateTransfer(formData.id, formData);
      ElMessage.success('调拨单更新成功');
    }
    
    // 关闭对话框并刷新列表
    transferDialogVisible.value = false;
    resetTransferForm();
    await loadTransferList();
    loadTransferStats();
  } catch (error) {
    console.error('提交调拨单失败:', error);

    let errorMessage = '提交失败: ';
    if (error.response && error.response.data) {
      if (error.response.data.message) {
        errorMessage += error.response.data.message;
      } else {
        errorMessage += JSON.stringify(error.response.data);
      }
    } else if (error.message) {
      errorMessage += error.message;
    } else {
      errorMessage += '未知错误';
    }

    ElMessage.error(errorMessage);
  } finally {
    submitting.value = false;
  }
};

// ====== 物料搜索相关 (开始) ======
const loadingMaterials = ref(false);
let currentSearchId = 0;

// 防抖函数
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// 搜索物料
const searchProducts = async (query) => {
  const searchId = ++currentSearchId;
  loadingMaterials.value = true;
  
  try {
    if (!query || query.trim().length === 0) {
      // 首次加载或查询为空时加载默认列表
      const defaultResults = await searchMaterials(baseDataApi, '', {
        pageSize: 20,
        includeAll: true
      });
      if (searchId === currentSearchId) {
        materialOptions.value = mapMaterialData(defaultResults);
      }
      return;
    }
    
    const searchResults = await searchMaterials(baseDataApi, query.trim(), {
      pageSize: SEARCH_CONFIG.REMOTE_SEARCH_PAGE_SIZE,
      includeAll: true
    });
    
    if (searchId === currentSearchId) {
      materialOptions.value = mapMaterialData(searchResults);
    }
  } catch (error) {
    if (searchId === currentSearchId) materialOptions.value = [];
  } finally {
    if (searchId === currentSearchId) loadingMaterials.value = false;
  }
};

const debouncedSearchMaterials = debounce(searchProducts, SEARCH_CONFIG.SEARCH_DEBOUNCE_DELAY || 300);

const handleMaterialSelectFocus = () => {
  if (materialOptions.value.length === 0) {
    debouncedSearchMaterials('');
  }
};

// 获取初始物料列表 (替换原有全量的)
const fetchMaterials = async () => {
  debouncedSearchMaterials('');
};
// ====== 物料搜索相关 (结束) ======

// 获取库位列表
const fetchLocations = async () => {
  try {
    const response = await inventoryApi.getLocations({ status: 1 }); // 只获取启用的库位
    locationOptions.value = parseListData(response, { enableLog: false });
  } catch (error) {
    console.error('获取库位列表失败:', error);
    locationOptions.value = [];
  }
};

// 加载调拨单统计数据
const loadTransferStats = async () => {
  try {
    // 调用专门的统计API，基于全部数据计算统计信息
    const response = await inventoryApi.getTransferStatistics();
    if (response.data) {
      transferStats.value = {
        total: response.data.total || 0,
        draft: response.data.draft || 0,
        pendingCount: response.data.pendingCount || 0,
        approvedCount: response.data.approvedCount || 0,
        completedCount: response.data.completedCount || 0,
        cancelledCount: response.data.cancelledCount || 0
      };
    }
  } catch (error) {
    console.error('获取调拨单统计数据失败:', error);
    // 如果API失败，从当前列表数据计算统计信息作为备用
    const total = pagination.total || 0; // 使用分页总数
    const draftCount = transferList.value.filter(item => item.status === 'draft').length;
    const pendingCount = transferList.value.filter(item => item.status === 'pending').length;
    const approvedCount = transferList.value.filter(item => item.status === 'approved').length;
    const completedCount = transferList.value.filter(item => item.status === 'completed').length;
    const cancelledCount = transferList.value.filter(item => item.status === 'cancelled').length;

    // 更新统计数据
    transferStats.value = {
      total,
      draft: draftCount,
      pendingCount,
      approvedCount,
      completedCount,
      cancelledCount
    };
  }
};

// 加载调拨单列表数据
const loadTransferList = async () => {
  loading.value = true;
  try {
    // 构建查询参数
    const params = {
      page: pagination.current,
      limit: pagination.size,
      transfer_no: searchForm.transfer_no,
      status: searchForm.status
    };
    
    // 添加日期范围参数
    if (searchForm.date_range && searchForm.date_range.length === 2) {
      params.start_date = searchForm.date_range[0];
      params.end_date = searchForm.date_range[1];
    }
    
    // 调用API获取数据
    const response = await inventoryApi.getTransferList(params);
    const { list, total } = parsePaginatedData(response);

    transferList.value = list;
    pagination.total = total;
  } catch (error) {
    console.error('获取调拨单列表失败:', error);
    ElMessage.error('获取调拨单列表失败');
  } finally {
    loading.value = false;
  }
};

// 复制调拨单
const duplicateTransfer = async (id) => {
  dialogType.value = 'create';
  transferDialogVisible.value = true;
  editLoading.value = true;
  try {
    await fetchMaterials();
    await fetchLocations();

    const response = await inventoryApi.getTransferDetail(id);
    // 拦截器已解包，response.data 就是业务数据
    const transferData = response.data;
    
    // 重置表单
    resetTransferForm();
    
    // 填充表单数据，但不设置id，因为是新建
    transferForm.transfer_date = getCurrentDate(); // 使用当前日期
    transferForm.from_location_id = transferData.from_location_id;
    transferForm.to_location_id = transferData.to_location_id;
    transferForm.remark = (transferData.remark || transferData.remarks || '') + ' (复制)';
    
    // 填充物料明细
    if (transferData.items && transferData.items.length > 0) {
      transferForm.items = transferData.items.map(item => ({
        material_id: item.material_id,
        material_name: item.material_name,
        material_code: item.material_code,
        specs: item.specs,
        quantity: item.quantity,
        unit_name: item.unit_name,
        available_stock: item.available_stock || 0,
        remarks: item.remarks || ''
      }));
    }
    
    ElMessage.success('已创建调拨单副本，请检查并保存');
  } catch (error) {
    console.error('复制调拨单失败:', error);
    ElMessage.error('复制调拨单失败');
    transferDialogVisible.value = false;
  } finally {
    editLoading.value = false;
  }
};

// 打印调拨单
const printTransfer = async (id) => {
  try {
    // 先获取调拨单详情
    detailLoading.value = true;
    const response = await inventoryApi.getTransferDetail(id);
    // 拦截器已解包，response.data 就是业务数据
    transferDetail.value = response.data;
    
    // 等待DOM更新
    await nextTick();
    
    // 创建打印样式
    const printStyle = document.createElement('style');
    printStyle.innerHTML = `
      @media print {
        body * {
          visibility: hidden;
        }
        
        #print-section, #print-section * {
          visibility: visible;
        }
        
        #print-section {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
        }
        
        .el-button, .dialog-footer {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(printStyle);
    
    // 打开详情对话框，但不显示
    viewDialogVisible.value = true;
    
    // 等待对话框内容加载完成
    setTimeout(() => {
      // 执行打印
      window.print();
      
      // 打印完成后移除样式并关闭对话框
      setTimeout(() => {
        document.head.removeChild(printStyle);
        viewDialogVisible.value = false;
        detailLoading.value = false;
      }, 500);
    }, 500);
  } catch (error) {
    detailLoading.value = false;
    console.error('打印调拨单失败:', error);
    ElMessage.error('打印调拨单失败');
  }
};



// 页面初始化
onMounted(async () => {
  try {
    // 先加载调拨单列表
    await loadTransferList();
    // 在列表数据加载完成后计算统计数据
    loadTransferStats();

    // 加载基础数据（物料和库位）
    await fetchMaterials();
    await fetchLocations();
  } catch (error) {
    console.error('页面初始化失败:', error);
    ElMessage.error('页面初始化失败，请刷新重试');
  }
});

// 处理选择变化
const selectedTransfers = ref([]);
const handleSelectionChange = (selected) => {
  selectedTransfers.value = selected;
};

// 批量操作处理
const handleBatchCommand = async (command) => {
  if (selectedTransfers.value.length === 0) {
    ElMessage.warning('请先选择要操作的调拨单');
    return;
  }

  if (command === 'export') {
    // 导出选中的调拨单
    exportSelectedTransfers();
  } else if (command === 'print') {
    // 批量打印选中的调拨单
    batchPrintTransfers();
  } else if (command === 'delete') {
    // 批量删除选中的调拨单
    batchDeleteTransfers();
  }
};

// 导出选中的调拨单
const exportSelectedTransfers = async () => {
  try {
    const ids = selectedTransfers.value.map(item => item.id);
    const transferNos = selectedTransfers.value.map(item => item.transfer_no).join(', ');

    ElMessage.info(`正在导出 ${selectedTransfers.value.length} 个调拨单: ${transferNos}`);
    
    // 调用导出API
    const response = await inventoryApi.exportTransfers(ids);
    
    // 处理二进制文件下载
    const blob = new Blob([response.data], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `调拨单导出_${new Date().getTime()}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    ElMessage.success('导出成功');
  } catch (error) {
    console.error('导出调拨单失败:', error);
    ElMessage.error('导出调拨单失败: ' + (error.response?.data?.message || error.message));
  }
};

// 批量打印调拨单 - 使用打印模板系统
const batchPrintTransfers = async () => {
  if (selectedTransfers.value.length > 5) {
    ElMessage.warning('一次最多只能打印5个调拨单');
    return;
  }
  
  try {
    ElMessage.info('正在准备打印...');
    
    // 获取打印模板
    let templateContent = '';
    try {
      const response = await inventoryApi.getApi().get('/print/templates', {
        params: {
          template_type: 'transfer',
          is_default: 1,
          status: 1
        }
      });
      
      const templates = response.data?.list || response.data?.data || response.data || [];
      const template = Array.isArray(templates) ? templates[0] : null;
      
      if (template && template.content) {
        templateContent = template.content;
      }
    } catch (templateError) {
      console.error('获取打印模板失败:', templateError);
    }
    
    // 如果没有找到模板，提示用户配置
    if (!templateContent) {
      ElMessage.warning('未找到调拨单打印模板，请在系统管理-打印管理中配置 transfer 类型模板');
      return;
    }
    
    // 创建打印窗口
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      ElMessage.error('无法打开打印窗口，请检查是否被浏览器拦截');
      return;
    }
    
    let allContent = '';
    
    // 为每个选中的调拨单获取详情并渲染模板
    for (const transfer of selectedTransfers.value) {
      const response = await inventoryApi.getTransferDetail(transfer.id);
      const detail = response.data;
      
      // 复制模板内容
      let pageContent = templateContent;
      
      // 替换模板变量
      pageContent = pageContent.replace(/{{transfer_no}}/g, detail.transfer_no || '-');
      pageContent = pageContent.replace(/{{transfer_date}}/g, formatDate(detail.transfer_date) || '-');
      pageContent = pageContent.replace(/{{from_location}}/g, detail.from_location || '-');
      pageContent = pageContent.replace(/{{to_location}}/g, detail.to_location || '-');
      pageContent = pageContent.replace(/{{status}}/g, getStatusText(detail.status) || '-');
      pageContent = pageContent.replace(/{{creator}}/g, detail.creator || '-');
      pageContent = pageContent.replace(/{{remarks}}/g, detail.remarks || '无');
      pageContent = pageContent.replace(/{{print_date}}/g, new Date().toLocaleDateString());
      
      // 处理明细项列表
      if (pageContent.includes('{{#each items}}')) {
        const itemStart = pageContent.indexOf('{{#each items}}');
        const itemEnd = pageContent.indexOf('{{/each}}', itemStart);
        
        if (itemStart !== -1 && itemEnd !== -1) {
          const itemTemplate = pageContent.substring(itemStart + '{{#each items}}'.length, itemEnd);
          let itemsHtml = '';
          
          if (detail.items && detail.items.length > 0) {
            detail.items.forEach((item, index) => {
              let itemHtml = itemTemplate;
              itemHtml = itemHtml.replace(/{{index}}/g, (index + 1).toString());
              itemHtml = itemHtml.replace(/{{material_code}}/g, item.material_code || '-');
              itemHtml = itemHtml.replace(/{{material_name}}/g, item.material_name || '-');
              itemHtml = itemHtml.replace(/{{specs}}/g, item.specs || '-');
              itemHtml = itemHtml.replace(/{{quantity}}/g, item.quantity?.toString() || '-');
              itemHtml = itemHtml.replace(/{{unit_name}}/g, item.unit_name || '-');
              itemHtml = itemHtml.replace(/{{remarks}}/g, item.remarks || '-');
              itemsHtml += itemHtml;
            });
          } else {
            itemsHtml = '<tr><td colspan="7" style="text-align: center;">暂无物料数据</td></tr>';
          }
          
          pageContent = pageContent.substring(0, itemStart) + itemsHtml + pageContent.substring(itemEnd + '{{/each}}'.length);
        }
      }
      
      allContent += pageContent;
    }
    
    printWindow.document.write(allContent);
    printWindow.document.close();
    
    // 等待内容加载完成后打印
    printWindow.onload = function() {
      printWindow.print();
      printWindow.close();
    };
  } catch (error) {
    console.error('批量打印调拨单失败:', error);
    ElMessage.error('批量打印调拨单失败');
  }
};

// 批量删除调拨单
const batchDeleteTransfers = async () => {
  // 筛选出可以删除的调拨单（草稿状态）
  const deletableTransfers = selectedTransfers.value.filter(item => item.status === 'draft');
  
  if (deletableTransfers.length === 0) {
    ElMessage.warning('选中的调拨单中没有可删除的项（只能删除草稿状态的调拨单）');
    return;
  }
  
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${deletableTransfers.length} 个草稿调拨单吗？此操作不可逆。`,
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );
    
    
    const ids = deletableTransfers.map(item => item.id);
    
    // 调用批量删除API（如果后端支持批量删除接口）
    // 优先使用批量删除接口以提高性能
    try {
      if (inventoryApi.batchDeleteTransfers) {
        // 如果存在批量删除API，使用批量删除
        await inventoryApi.batchDeleteTransfers(ids);
      } else {
        // 否则循环调用单个删除
        let successCount = 0;
        let failCount = 0;
        
        for (const id of ids) {
          try {
            await inventoryApi.deleteTransfer(id);
            successCount++;
          } catch (error) {
            console.error(`删除调拨单 ${id} 失败:`, error);
            failCount++;
          }
        }
        
        if (failCount > 0) {
          ElMessage.warning(`批量删除完成：成功 ${successCount} 个，失败 ${failCount} 个`);
        }
      }
    } catch (error) {
      console.error('批量删除调拨单失败:', error);
      ElMessage.error('批量删除失败: ' + (error.response?.data?.message || error.message));
      return;
    }
    
    ElMessage.success(`成功删除 ${deletableTransfers.length} 个调拨单`);
    await loadTransferList();
    loadTransferStats();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量删除调拨单失败:', error);
      ElMessage.error('批量删除调拨单失败');
    }
  }
};
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
  color: #303133;
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: #909399;
}

.search-form {
  display: flex;
  flex-wrap: wrap;
  width: calc(100% - 120px);
}

/* 使用全局 common-styles.css 中的 .statistics-row 和 .stat-card */







/* 主区域管理样式删除 */







/* 物料选择下拉框样式优化 */
.el-select .el-input {
  width: 100%;
}

.el-select-dropdown__item {
  height: auto;
  line-height: 1.4;
  padding: 8px 20px;
}

/* 物料编码显示样式 */
.material-code-display {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: var(--color-text-regular);
  word-break: break-all;
  margin-top: 4px;
  padding: 2px 4px;
  background-color: #f5f7fa;
  border-radius: 3px;
}

/* 表格列宽度优化 */
.el-table .cell {
  word-break: break-word;
}

/* 下拉选项样式 */
.material-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 24px;
}

.material-option .code {
  font-weight: bold;
  color: var(--color-primary);
  font-family: 'Courier New', monospace;
  font-size: 13px;
  min-width: 80px;
  flex-shrink: 0;
}

.material-option .name {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-left: 8px;
  flex: 1;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

/* 确保下拉框选项有足够的宽度 */
.el-select-dropdown {
  min-width: 300px !important;
}

.el-select-dropdown__item {
  padding: 8px 12px !important;
  line-height: 1.4 !important;
  height: auto !important;
}



.operation-dropdown {
  margin-right: 0;
}

.batch-actions {
  position: absolute;
  right: 20px;
  top: 20px;
}

.table-toolbar {
  margin-bottom: 10px;
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