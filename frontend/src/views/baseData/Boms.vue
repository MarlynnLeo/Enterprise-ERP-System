<!--
/**
 * Boms.vue
 * @description 前端界面组件文件 (Refactored)
 * @date 2026-01-23
 * @version 2.0.0
 */
-->
<template>
  <div class="bom-management-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>BOM管理</h2>
          <p class="subtitle">管理产品物料清单，支持多级BOM结构与版本控制</p>
        </div>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleAdd">新增BOM</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="产品">
          <el-select
            v-model="searchForm.productId"
            placeholder="请选择产品或输入关键词搜索"
            clearable
            filterable
            remote
            reserve-keyword
            :remote-method="searchProducts"
            :loading="loadingProducts"
            no-data-text="没有找到匹配的产品"
            loading-text="搜索中..."
>
            <el-option
              v-for="item in productOptions"
              :key="item.id"
              :label="`${item.code} - ${item.name}`"
              :value="item.id">
              <span style="float: left">{{ item.code }}</span>
              <span style="float: right; color: var(--color-text-muted); font-size: 13px">{{ item.name }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="版本">
          <el-input  v-model="searchForm.version" placeholder="请输入版本" clearable ></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-select  v-model="searchForm.approved" placeholder="请选择审核状态" clearable>
            <el-option :value="true" label="已审核"></el-option>
            <el-option :value="false" label="未审核"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" style="margin-right: 10px" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch" style="margin-right: 20px" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> 重置
          </el-button>
          <el-dropdown @command="handleMoreCommand">
            <el-button type="primary">
              <el-icon><MoreFilled /></el-icon> 更多
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="toggleSelect">
                  <el-icon><Select /></el-icon> {{ selectionMode ? '取消选择' : '选择' }}
                </el-dropdown-item>
                <el-dropdown-item command="copyBom"><el-icon><CopyDocument /></el-icon> 复制</el-dropdown-item>
                <el-dropdown-item command="replaceBom"><el-icon><Files /></el-icon> 替换</el-dropdown-item>
                <el-dropdown-item command="locatePart"><el-icon><Position /></el-icon> 定位</el-dropdown-item>
                <el-dropdown-item command="exportBom"><el-icon><Download /></el-icon> 导出</el-dropdown-item>
                <el-dropdown-item command="importBom"><el-icon><Upload /></el-icon> 导入</el-dropdown-item>
                <el-dropdown-item command="compareBom"><el-icon><Switch /></el-icon> 版本对比</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计信息 -->
    <BomStatCards :stats="stats" />

    <!-- 表格区域 -->
    <el-card class="data-card">
      <BomTable
        :tableData="tableData"
        :loading="loading"
        :total="total"
        v-model:currentPage="currentPage"
        v-model:pageSize="pageSize"
        :selectionMode="selectionMode"
        :canUpdate="canUpdate"
        :canDelete="canDelete"

        @view="handleView"
        @edit="handleEdit"
        @upgrade="handleUpgrade"
        @delete="handleDelete"
        @approve="handleApprove"
        @unapprove="handleUnapprove"
        @size-change="fetchData"
        @current-change="fetchData"
        @selection-change="handleSelectionChange"
      />
    </el-card>

    <!-- 新增/编辑对话框 -->
    <BomFormDialog
      v-if="dialogVisible"
      v-model="dialogVisible"
      :title="dialogTitle"
      :editData="currentEditBom"
      @success="fetchData"
    />

    <!-- 查看对话框 -->
    <BomViewDialog
      v-if="viewDialogVisible"
      v-model="viewDialogVisible"
      :bomData="currentViewBom"
    />

    <!-- BOM版本对比弹窗 -->
    <BomCompareDialog
      v-model="compareDialogVisible"
      :bomList="tableData"
    />

    <!-- 零部件定位结果弹窗 -->
    <el-dialog
      title="零部件定位结果"
      v-model="locateDialogVisible"
      width="750px"
      destroy-on-close
    >
      <el-alert
        v-if="locateResults.length > 0"
        :title="`共找到 ${locateResults.length} 个BOM包含物料 '${locateKeyword}'`"
        type="success"
        :closable="false"
        style="margin-bottom: 16px"
      />
      <el-alert
        v-else
        :title="`未找到包含物料 '${locateKeyword}' 的BOM`"
        type="warning"
        :closable="false"
        style="margin-bottom: 16px"
      />
      <el-table :data="locateResults" border max-height="400" v-if="locateResults.length > 0">
        <el-table-column prop="product_code" label="产品编码" width="130" />
        <el-table-column prop="product_name" label="产品名称" min-width="150" />
        <el-table-column prop="version" label="BOM版本" width="100" />
        <el-table-column prop="material_code" label="物料编码" width="130" />
        <el-table-column prop="material_name" label="物料名称" min-width="130" />
        <el-table-column prop="quantity" label="用量" width="80" align="right" />
        <el-table-column prop="unit" label="单位" width="70" align="center" />
      </el-table>
      <template #footer>
        <el-button @click="locateDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 复制BOM选择弹窗 -->
    <el-dialog
      title="复制BOM"
      v-model="copyDialogVisible"
      width="500px"
      destroy-on-close
    >
      <el-form label-width="100px">
        <el-form-item label="选择源BOM">
          <el-select
            v-model="copySelectedBomId"
            placeholder="请选择要复制的源BOM"
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="bom in tableData"
              :key="bom.id"
              :label="`${bom.product_code || ''} - ${bom.product_name || '未知'} (${bom.version || 'V1.0'})`"
              :value="bom.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="目标产品" required>
          <el-select
            v-model="copyTargetProductId"
            placeholder="请选择目标产品编码"
            clearable
            filterable
            remote
            reserve-keyword
            :remote-method="searchProductsForCopy"
            :loading="loadingProductsForCopy"
            no-data-text="没有找到匹配的产品"
            loading-text="搜索中..."
            style="width: 100%"
          >
            <el-option
              v-for="item in copyProductOptions"
              :key="item.id"
              :label="`${item.code} - ${item.name}`"
              :value="item.id">
              <span style="float: left">{{ item.code }}</span>
              <span style="float: right; color: var(--color-text-muted); font-size: 13px">{{ item.name }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="版本号" required>
          <el-input v-model="copyTargetVersion" placeholder="请输入版本号" />
        </el-form-item>
        <el-form-item>
          <el-text type="info" size="small">将原BOM配置完全复制给目标产品作为新版本</el-text>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="copyDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="copyLoading" :disabled="!copySelectedBomId || !copyTargetProductId || !copyTargetVersion" @click="executeCopyBom">确认复制</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Refresh, MoreFilled, Select, CopyDocument, Files, Position, Download, Upload, Switch } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { materialApi } from '@/api/material';
import { bomApi } from '@/api/bom';
import { parsePaginatedData, parseListData, parseDataObject } from '@/utils/responseParser';

// 引入新组件
import BomTable from './components/BomTable.vue';
import BomStatCards from './components/BomStatCards.vue';
import BomFormDialog from './components/BomFormDialog.vue';
import BomViewDialog from './components/BomViewDialog.vue';
import BomCompareDialog from './components/BomCompareDialog.vue';

const authStore = useAuthStore();
const canCreate = computed(() => authStore.hasPermission('basedata:boms:create'));
const canUpdate = computed(() => authStore.hasPermission('basedata:boms:update'));
const canDelete = computed(() => authStore.hasPermission('basedata:boms:delete'));


// 状态
const loading = ref(false);
const tableData = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const selectionMode = ref(false);
const selectedRows = ref([]);  // 已选中的行
const dialogVisible = ref(false);
const viewDialogVisible = ref(false);
const dialogTitle = ref('新增BOM');
const currentEditBom = ref(null);
const currentViewBom = ref(null);
const compareDialogVisible = ref(false);
// 定位弹窗状态
const locateDialogVisible = ref(false);
const locateResults = ref([]);
const locateKeyword = ref('');
// 复制弹窗状态
const copyDialogVisible = ref(false);
const copySelectedBomId = ref(null);
const copyTargetProductId = ref(null);
const copyTargetVersion = ref('V1.0');
const copyProductOptions = ref([]);
const loadingProductsForCopy = ref(false);
const copyLoading = ref(false);

const searchForm = reactive({
  productId: '',
  version: '',
  approved: ''
});

const stats = reactive({
  total: 0,
  active: 0,
  inactive: 0,
  detailsCount: 0,
  totalCost: 0
});

// 产品搜索相关
const loadingProducts = ref(false);
const productOptions = ref([]);

const searchProducts = async (query) => {
  if (query) {
    loadingProducts.value = true;
    try {
      const res = await materialApi.getMaterials({ keyword: query, page: 1, pageSize: 20 });
      productOptions.value = parseListData(res);
    } catch (error) {
      console.error('搜索产品失败:', error);
      productOptions.value = [];
    } finally {
      loadingProducts.value = false;
    }
  } else {
    productOptions.value = [];
  }
};

// 数据获取
const fetchData = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      ...searchForm
    };
    // 假设 bomApi.getBoms 存在
    const res = await bomApi.getBoms(params);
    const { list, total: t } = parsePaginatedData(res);
    tableData.value = list;
    total.value = t;
    
    // 更新统计
    fetchStats();
  } catch (error) {
    console.error('获取BOM列表失败:', error);
    ElMessage.error('获取BOM列表失败');
  } finally {
    loading.value = false;
  }
};

const fetchStats = async () => {
  try {
    const res = await bomApi.getBomStats();
    const statsData = parseDataObject(res);
    if (statsData) {
      Object.assign(stats, statsData);
    }
  } catch {
    // ignore
  }
};

onMounted(() => {
  fetchData();
});

// 操作处理
const handleSearch = () => {
  currentPage.value = 1;
  fetchData();
};

const resetSearch = () => {
  searchForm.productId = '';
  searchForm.version = '';
  searchForm.approved = '';
  handleSearch();
};

const handleAdd = () => {
  dialogTitle.value = '新增BOM';
  currentEditBom.value = null;
  dialogVisible.value = true;
};

const handleEdit = async (row) => {
  dialogTitle.value = '编辑BOM';
  // 需要获取详情，包括明细
  try {
    const detail = await bomApi.getBom(row.id);
    currentEditBom.value = parseDataObject(detail);
    dialogVisible.value = true;
  } catch {
    ElMessage.error('获取详情失败');
  }
};

// 升版操作：先审核当前BOM，再打开编辑（后端自动触发版本升级+历史保留）
const handleUpgrade = async (row) => {
  try {
    // 先审核当前草稿
    await bomApi.approveBom(row.id);
    ElMessage.success('已审核当前版本，正在进入升版编辑...');
    
    // 审核后再调用编辑（后端检测到已审核状态，会自动走升版分支）
    const detail = await bomApi.getBom(row.id);
    const bomData = parseDataObject(detail);
    dialogTitle.value = 'BOM升版';
    currentEditBom.value = bomData;
    dialogVisible.value = true;
  } catch (error) {
    ElMessage.error(error.message || '升版操作失败');
  }
};

const handleView = async (row) => {
  try {
    let detail = await bomApi.getBom(row.id);
    detail = parseDataObject(detail);
    // 处理 children 树形结构用于查看
    if (detail.details) {
      const map = new Map();
      detail.details.forEach(d => {
        d.children = [];
        map.set(d.id, d);
      });
      const tree = [];
      detail.details.forEach(d => {
        if (d.parent_id && map.get(d.parent_id)) {
          map.get(d.parent_id).children.push(d);
        } else {
          tree.push(d);
        }
      });
      detail.details = tree; // 替换为树形
    }
    
    currentViewBom.value = detail;
    viewDialogVisible.value = true;
  } catch {
    ElMessage.error('获取详情失败');
  }
};

const handleDelete = async (row) => {
  try {
    await bomApi.deleteBom(row.id);
    ElMessage.success('删除成功');
    fetchData();
  } catch (error) {
    ElMessage.error(error.message || '删除失败');
  }
};

const handleApprove = async (row) => {
  try {
    await bomApi.approveBom(row.id);
    ElMessage.success('审核成功');
    fetchData();
  } catch (error) {
    ElMessage.error(error.message || '审核失败');
  }
};

const handleUnapprove = async (row) => {
  try {
    await bomApi.unapproveBom(row.id);
    ElMessage.success('反审成功');
    fetchData();
  } catch (error) {
    ElMessage.error(error.message || '反审失败');
  }
};

const handleSelectionChange = (selection) => {
  selectedRows.value = selection;
};

const handleMoreCommand = async (command) => {
  switch (command) {
    case 'toggleSelect':
      selectionMode.value = !selectionMode.value;
      break;
    case 'exportBom':
      await handleExportBom();
      break;
    case 'importBom':
      handleImportBom();
      break;
    case 'locatePart':
      await handleLocatePart();
      break;
    case 'copyBom':
      await handleCopyBom();
      break;
    case 'replaceBom':
      await handleReplaceBom();
      break;
    case 'compareBom':
      compareDialogVisible.value = true;
      break;
    default:
      ElMessage.info('未知操作');
  }
};

// 导出BOM
const handleExportBom = async () => {
  try {
    const response = await bomApi.exportBoms(searchForm);
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BOM_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    ElMessage.success('BOM导出成功');
  } catch (error) {
    console.error('导出BOM失败:', error);
    ElMessage.error('导出BOM失败');
  }
};

// 导入BOM
const handleImportBom = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await bomApi.importBoms(formData);
      const result = response.data?.data || response.data || {};
      ElMessage.success(`导入完成：成功 ${result.success || 0} 条，失败 ${result.failed || 0} 条`);
      fetchData();
    } catch (error) {
      console.error('导入BOM失败:', error);
      ElMessage.error(error.response?.data?.message || '导入BOM失败');
    }
  };
  input.click();
};

// 定位零部件（结果在弹窗中展示）
const handleLocatePart = async () => {
  try {
    const { value } = await ElMessageBox.prompt('请输入零部件编码', '零部件定位', {
      confirmButtonText: '搜索',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '请输入有效的编码'
    });
    
    const keyword = value.trim();
    const response = await bomApi.locatePart(keyword);
    const result = parseListData(response);
    const bomList = Array.isArray(result) ? result : [result];
    
    locateKeyword.value = keyword;
    locateResults.value = bomList;
    locateDialogVisible.value = true;
  } catch (error) {
    if (error !== 'cancel') {
      console.error('定位零部件失败:', error);
      ElMessage.error('定位零部件失败');
    }
  }
};

// 搜索供复制BOM的目标产品
const searchProductsForCopy = async (query) => {
  if (query) {
    loadingProductsForCopy.value = true;
    try {
      const res = await materialApi.getMaterials({ keyword: query, page: 1, pageSize: 20 });
      copyProductOptions.value = parseListData(res);
    } catch (error) {
      console.error('搜索产品失败:', error);
      copyProductOptions.value = [];
    } finally {
      loadingProductsForCopy.value = false;
    }
  } else {
    copyProductOptions.value = [];
  }
};

// 复制BOM - 打开选择弹窗
const handleCopyBom = () => {
  if (tableData.value.length === 0) {
    ElMessage.warning('暂无BOM数据可复制');
    return;
  }
  // 如果已选中行，默认选中第一行
  if (selectedRows.value.length > 0) {
    copySelectedBomId.value = selectedRows.value[0].id;
  } else {
    copySelectedBomId.value = null;
  }
  copyTargetProductId.value = null;
  copyTargetVersion.value = 'V1.0';
  copyProductOptions.value = [];
  copyDialogVisible.value = true;
};

// 执行复制BOM
const executeCopyBom = async () => {
  if (!copySelectedBomId.value) {
    ElMessage.warning('请选择要复制的源BOM');
    return;
  }
  if (!copyTargetProductId.value) {
    ElMessage.warning('请选择目标产品');
    return;
  }
  if (!copyTargetVersion.value) {
    ElMessage.warning('请输入目标版本号');
    return;
  }
  
  copyLoading.value = true;
  try {
    const bomId = copySelectedBomId.value;
    // 获取原BOM详情
    const bomResponse = await bomApi.getBom(bomId);
    const bomData = parseDataObject(bomResponse);
    
    // 创建副本给新产品
    const newBom = {
      product_id: copyTargetProductId.value,
      version: copyTargetVersion.value,
      remark: `复制自 BOM #${bomId} (${bomData.product_code || ''} ${bomData.version || ''})`
    };
    
    const details = Array.isArray(bomData.details) ? bomData.details.map(d => ({
      material_id: d.material_id,
      quantity: d.quantity,
      unit_id: d.unit_id,
      remark: d.remark,
      level: d.level || 1,
      parent_id: d.parent_id || 0
    })) : [];
    
    await bomApi.createBom({ ...newBom, details });
    
    ElMessage.success('BOM复制成功');
    copyDialogVisible.value = false;
    fetchData();
  } catch (error) {
    console.error('复制BOM失败:', error);
    ElMessage.error(error.response?.data?.message || error.message || '复制BOM失败');
  } finally {
    copyLoading.value = false;
  }
};

// 替换BOM中的物料
const handleReplaceBom = async () => {
  try {
    const { value: oldCode } = await ElMessageBox.prompt(
      '请输入要被替换的物料编码', '替换物料 (1/2)',
      { confirmButtonText: '下一步', cancelButtonText: '取消' }
    );
    
    const { value: newCode } = await ElMessageBox.prompt(
      '请输入替换后的物料编码', '替换物料 (2/2)',
      { confirmButtonText: '执行替换', cancelButtonText: '取消' }
    );
    
    await bomApi.replaceBom({
      oldMaterialCode: oldCode.trim(),
      newMaterialCode: newCode.trim()
    });
    
    ElMessage.success(`已将物料 "${oldCode}" 替换为 "${newCode}"`);
    fetchData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('替换物料失败:', error);
      ElMessage.error(error.response?.data?.message || '替换物料失败');
    }
  }
};

</script>

<style scoped>
.bom-management-container {
  padding: 20px;
}
.header-card {
  margin-bottom: 20px;
}
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.search-card {
  margin-bottom: 20px;
}
.data-card {
  margin-bottom: 20px;
}
.pagination-container {
  margin-top: 15px;
  display: flex;
  justify-content: flex-end;
}
</style>