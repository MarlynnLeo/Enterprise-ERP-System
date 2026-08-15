<!--
/**
 * InventoryTransfer.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page inventory-transfer-container">
    <PageHeader title="库存调拨管理" subtitle="管理库存调拨与转移">
      <template #actions>
<el-button type="primary" :icon="Plus" @click="openTransferDialog()">新建调拨单</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="handleSearch"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input v-model="searchForm.materialName" placeholder="物料名称" clearable @keyup.enter="handleSearch"></el-input>
        </el-form-item>
      </template>
      <template #advanced>
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
      </template>
      <template #actions>
        <el-dropdown @command="handleBatchCommand" v-permission="'inventory:transfer:update'">
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
      </template>
    </FinanceQueryCard>

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
        class="table-row-click w-full"
        @selection-change="handleSelectionChange"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewTransfer(row.id))">
        <template #empty>
          <EmptyState description="暂无调拨单数据" />
        </template>
        <el-table-column type="selection" width="55"></el-table-column>
        <el-table-column prop="transferNo" label="调拨单号" min-width="100" show-overflow-tooltip></el-table-column>
        <el-table-column label="调拨日期" min-width="100">
          <template #default="scope">
            {{ formatDate(scope.row.transferDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="fromLocation" label="源库位" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="toLocation" label="目标库位" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="itemCount" label="物料种类" min-width="100"></el-table-column>
        <el-table-column prop="status" label="状态" min-width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ getStatusText(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="creatorName" label="创建人" min-width="100">
          <template #default="scope">
            {{ scope.row.creatorName || scope.row.creator || '未知' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
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


              <el-button
                size="small"
                @click="editTransfer(scope.row.id)"
                v-if="scope.row.status === 'draft'"
                v-permission="'inventory:transfer:update'"
              >
                <el-icon><Edit /></el-icon> 编辑
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
    <AppDialog
      v-model="transferDialogVisible"
      :title="dialogType === 'create' ? '新建调拨单' : '编辑调拨单'"
      mode="form"
      wide
    >
      <div v-loading="editLoading">
      <el-form :model="transferForm" :rules="transferRules" ref="transferFormRef" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="调拨日期" prop="transferDate">
              <el-date-picker
                v-model="transferForm.transfer_date"
                type="date"
                placeholder="选择调拨日期"
                value-format="YYYY-MM-DD"
                class="w-full"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="源库位" prop="fromLocationId">
              <el-select
                v-model="transferForm.from_location_id"
                placeholder="选择源库位"
                class="w-full"
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
            <el-form-item label="目标库位" prop="toLocationId">
              <el-select
                v-model="transferForm.to_location_id"
                placeholder="选择目标库位"
                class="w-full"
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

        <el-table :data="transferForm.items" border class="w-full">
          <el-table-column label="物料" min-width="200">
            <template #default="{ row, $index }">
              <el-select
                v-model="row.materialId"
                placeholder="请选择或输入关键字搜索"
                class="w-full"
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
                :max="row.availableStock || 999999"
                step="0.01"
                class="w-full"
              />
            </template>
          </el-table-column>
          <el-table-column label="单位" width="120">
            <template #default="{ row }">
              <span>{{ row.unitName || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="库存数量" width="120">
            <template #default="{ row }">
              <span>{{ row.availableStock || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="150">
            <template #default="{ row }">
              <el-input v-model="row.remark" placeholder="请输入备注" />
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="80" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="{ $index }">
              <el-button type="danger" link @click="removeTransferItem($index)" v-permission="'inventory:transfer:update'">
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
        </AppDialog>

    <!-- 查看调拨单详情对话框 -->
    <AppDialog
      v-model="viewDialogVisible"
      title="调拨单详情"
      mode="view"
      content-width="wide"
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

        <h3 class="mt-20">物料明细</h3>
        <el-table :data="transferDetail.items || []" border style="width: 100%; margin-top: 10px;">
          <el-table-column type="index" label="序号" width="50"></el-table-column>
          <el-table-column prop="materialCode" label="物料编码" min-width="150" show-overflow-tooltip></el-table-column>
          <el-table-column prop="materialName" label="物料名称" min-width="160" show-overflow-tooltip></el-table-column>
          <el-table-column prop="specification" label="规格型号" min-width="140" show-overflow-tooltip></el-table-column>
          <el-table-column prop="quantity" label="调拨数量" min-width="100"></el-table-column>
          <el-table-column prop="unitName" label="单位" min-width="80"></el-table-column>
          <el-table-column prop="remarks" label="备注" min-width="150"></el-table-column>
        </el-table>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="viewDialogVisible = false">关闭</el-button>
        </div>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, ArrowDown, Delete, Check, Select, Finished, Close, CopyDocument, Printer, Download, View, Edit } from '@element-plus/icons-vue';
import { inventoryApi } from '@/api';
import { getCurrentDate } from '@/utils/helpers/dateUtils';
import { formatDate } from '@/utils/helpers/formatters';
import { getTransferStatusText, getTransferStatusColor } from '@/constants/systemConstants';
import { useAuthStore } from '@/stores/auth';
import { parseListData, parsePaginatedData } from '@/utils/responseParser';
import { SEARCH_CONFIG, searchMaterials, mapMaterialData } from '@/utils/searchConfig';
import printService from '@/services/printService';

// 权限store
const authStore = useAuthStore();
const BATCH_STOCK_QUERY_LIMIT = 50;
const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

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
  materialName: '',
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
        material_id: item.materialId,
        material_name: item.materialName,
        material_code: item.materialCode,
        specs: item.specs,
        quantity: item.quantity,
        unit_name: item.unitName,
        available_stock: item.availableStock || 0,
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
  searchForm.materialName = '';
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
    transferForm.items[index].materialName = material.name;
    transferForm.items[index].materialCode = material.code;
    transferForm.items[index].specification = material.specs || material.specification || '';
    transferForm.items[index].unitName = material.unitName || '';

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
    try {
      const queries = transferForm.items
        .filter(item => item.materialId)
        .map(item => ({
          materialId: item.materialId,
          locationId: transferForm.from_location_id
        }));
      const stockResults = [];
      for (const chunk of chunkArray(queries, BATCH_STOCK_QUERY_LIMIT)) {
        const response = await inventoryApi.getBatchMaterialStock(chunk);
        stockResults.push(...(response.data || []));
      }
      const stockMap = new Map(stockResults.map(stock => [
        Number(stock.materialId),
        Number(stock.quantity || stock.stockQuantity || 0)
      ]));
      for (const item of transferForm.items) {
        item.availableStock = stockMap.get(Number(item.materialId)) || 0;
      }
    } catch (error) {
      console.error('获取物料库存失败:', error);
      for (const item of transferForm.items) {
        item.availableStock = 0;
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
      if (!item.materialId) {
        ElMessage.warning(`第${i+1}行物料未选择`);
        return;
      }

      // 检查调拨数量是否超过库存
      if (item.quantity > item.availableStock) {
        ElMessage.warning(`${item.materialName}的调拨数量超过可用库存`);
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
import { debounce } from '@/utils/commonHelpers'
const searchProducts = async (query) => {
  const searchId = ++currentSearchId;
  loadingMaterials.value = true;
  try {
    const results = await searchMaterials(query);
    if (searchId === currentSearchId) {
      materialOptions.value = results.map(mapMaterialData);
    }
  } catch {
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
      materialName: searchForm.materialName,
      transfer_no: searchForm.transfer_no,
      status: searchForm.status
    };

    // 添加日期范围参数
    if (searchForm.date_range && searchForm.date_range.length === 2) {
      params.startDate = searchForm.date_range[0];
      params.endDate = searchForm.date_range[1];
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
        material_id: item.materialId,
        material_name: item.materialName,
        material_code: item.materialCode,
        specs: item.specs,
        quantity: item.quantity,
        unit_name: item.unitName,
        available_stock: item.availableStock || 0,
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
    detailLoading.value = true;
    const response = await inventoryApi.getTransferDetail(id);
    const detail = response.data;

    const html = await printService.generateByDefaultTemplate('inventory', 'transfer', {
      ...detail,
      transfer_date: formatDate(detail.transferDate) || '-',
      from_location_name: detail.fromLocationName || detail.fromLocation || '-',
      to_location_name: detail.toLocationName || detail.toLocation || '-',
      status: getStatusText(detail.status) || '-',
      operator: detail.operator || detail.creator || '',
      remark: detail.remark || detail.remarks || '',
      print_time: new Date().toLocaleString(),
      items: (detail.items || []).map((item, index) => ({
        index: index + 1,
        material_code: item.materialCode || '-',
        material_name: item.materialName || '-',
        specification: item.specification || item.specs || '-',
        quantity: item.quantity ?? '-',
        unit_name: item.unitName || item.unit || '-',
        remark: item.remark || item.remarks || ''
      }))
    });

    printService.previewDocument(html);
  } catch (error) {
    console.error('打印调拨单失败:', error);
    ElMessage.error('打印调拨单失败');
  } finally {
    detailLoading.value = false;
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
    const transferNos = selectedTransfers.value.map(item => item.transferNo).join(', ');

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

// 批量打印调拨单 - 使用打印中心默认模板
const batchPrintTransfers = async () => {
  if (selectedTransfers.value.length > 5) {
    ElMessage.warning('一次最多只能打印5个调拨单');
    return;
  }

  try {
    ElMessage.info('正在准备打印...');

    const ids = selectedTransfers.value.map(item => item.id);
    const response = await inventoryApi.getTransferDetails(ids);
    const transferDetails = parseListData(response, { enableLog: false });

    const pages = [];
    for (const detail of transferDetails) {
      const page = await printService.generateByDefaultTemplate('inventory', 'transfer', {
        ...detail,
        transfer_date: formatDate(detail.transferDate) || '-',
        from_location_name: detail.fromLocationName || detail.fromLocation || '-',
        to_location_name: detail.toLocationName || detail.toLocation || '-',
        status: getStatusText(detail.status) || '-',
        operator: detail.operator || detail.creator || '',
        remark: detail.remark || detail.remarks || '',
        print_time: new Date().toLocaleString(),
        items: (detail.items || []).map((item, index) => ({
          index: index + 1,
          material_code: item.materialCode || '-',
          material_name: item.materialName || '-',
          specification: item.specification || item.specs || '-',
          quantity: item.quantity ?? '-',
          unit_name: item.unitName || item.unit || '-',
          remark: item.remark || item.remarks || ''
        }))
      });

      pages.push(page);
    }

    printService.previewDocument(pages.join('<div class="page-break"></div>'));
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

    try {
      await inventoryApi.batchDeleteTransfers(ids);
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
  width: calc(100% - 120px);
}

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
  background-color: var(--color-bg-hover);
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


:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
