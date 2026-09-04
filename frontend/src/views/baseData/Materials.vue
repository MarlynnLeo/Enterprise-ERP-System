<!--
/**
 * Materials.vue
 * @description 前端界面组件文件 (Refactored)
 * @date 2026-01-23
 * @version 2.0.0
 */
-->
<template>
  <div class="module-page materials-container">
    <PageHeader :title="$t('page.baseData.materials.title')" subtitle="管理物料基础信息">
      <template #actions>
<el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleAdd">{{ $t('page.baseData.materials.add') }}</el-button>
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
          <el-input  v-model="searchForm.keyword" placeholder="物料名称" clearable ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="物料类型">
          <el-select v-model="searchForm.materialType" placeholder="请选择物料类型" clearable>
            <el-option
              v-for="item in materialTypeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value">
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('common.status')">
          <el-select  v-model="searchForm.status" :placeholder="$t('page.baseData.materials.statusPlaceholder')" clearable>
            <el-option :value="1" :label="$t('page.baseData.materials.enabled')"></el-option>
            <el-option :value="0" :label="$t('page.baseData.materials.disabled')"></el-option>
          </el-select>
        </el-form-item>
      </template>
      <template #actions>
          <el-dropdown @command="handleMoreCommand" v-if="canExport || canImport" class="ml-sm">
            <el-button type="success" class="action-btn">
              更多操作<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="copy" :icon="DocumentCopy">复制物料</el-dropdown-item>
                <el-dropdown-item command="export" :icon="Download" v-if="canExport">导出物料</el-dropdown-item>
                <el-dropdown-item command="import" :icon="Upload" v-if="canImport">导入物料</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <MaterialStatCards :stats="stats" />

    <!-- 表格区域 -->
    <el-card class="data-card">
      <MaterialTable
        :tableData="tableData"
        :loading="loading"
        :total="total"
        v-model:currentPage="currentPage"
        v-model:pageSize="pageSize"
        :canUpdate="canUpdate"
        :canDelete="canDelete"
        :canViewCost="canViewCost"
        :canViewPrice="canViewPrice"
        @view="handleView"
        @edit="handleEdit"
        @delete="handleDelete"
        @enable="handleEnable"
        @disable="handleDisable"
        @update:currentPage="fetchData"
        @update:pageSize="fetchData"
      />
    </el-card>

    <!-- 新增/编辑对话框 -->
    <MaterialFormDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :editData="currentEditMaterial"
      :productCategoryOptions="productCategoryOptions"
      :inspectionMethodOptions="inspectionMethodOptions"
      :materialSourceOptions="materialSourceOptions"
      :unitOptions="unitOptions"
      :locationOptions="locationOptions"
      :productionGroupOptions="productionGroupOptions"
      :managerOptions="managerOptions"
      :can-maintain-price="canMaintainPrice"
      :can-view-price="canViewPrice"
      @search-suppliers="searchSuppliers"
      @success="fetchData"
    />

    <!-- 查看对话框 -->
    <MaterialViewDialog
      v-model="viewDialogVisible"
      :viewData="currentViewMaterial"
      :canViewCost="canViewCost"
      :canViewPrice="canViewPrice"
      :detail-navigation="materialViewNavigation"
    />

    <!-- 导入对话框 -->
    <AppDialog
      v-model="importDialogVisible"
      title="导入物料"
      mode="form"
      width="520px"
    >
      <div class="mb-md">
        <el-button type="primary" link @click="handleDownloadTemplate">
          <el-icon><Download /></el-icon> 下载导入模板
        </el-button>
      </div>
      <el-upload
        ref="importUploadRef"
        drag
        action="#"
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls"
        :on-change="handleImportFileChange"
        :on-remove="() => importFile = null"
      >
        <el-icon style="font-size: 40px; color: var(--el-color-primary);"><Upload /></el-icon>
        <div class="mt-sm">将文件拖到此处，或<em>点击上传</em></div>
        <template #tip>
          <div class="el-upload__tip">仅支持 .xlsx / .xls 格式</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="importLoading" :disabled="!importFile" @click="handleImportSubmit">开始导入</el-button>
      </template>
        </AppDialog>

  </div>
</template>

<script setup>
import { formatLocalDate } from '@/utils/format';
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { Plus, Download, Upload, DocumentCopy, ArrowDown } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { materialApi } from '@/api/material';
import { baseDataApi } from '@/api/baseData';
import { commonApi } from '@/api/common';
import { parsePaginatedData, parseListData, parseDataObject } from '@/utils/responseParser';
import { loadLocationOptions, loadUserListOptions } from '@/utils/optionLoaders';
import { canViewMaterialPrices, canMaintainMaterialPrices } from '@/utils/priceVisibility';
import { MATERIAL_TYPE_OPTIONS } from '@/utils/materialTypes';
import { useListDetailNavigation } from '@/composables/useListDetailNavigation';
// 引入新组件
import MaterialTable from './components/MaterialTable.vue';
import MaterialStatCards from './components/MaterialStatCards.vue';
import MaterialFormDialog from './components/MaterialFormDialog.vue';
import MaterialViewDialog from './components/MaterialViewDialog.vue';

const authStore = useAuthStore();
const canCreate = computed(() => authStore.hasPermission('basedata:materials:create'));
const canUpdate = computed(() => authStore.hasPermission('basedata:materials:update'));
const canDelete = computed(() => authStore.hasPermission('basedata:materials:delete'));
const canImport = computed(() => authStore.hasPermission('basedata:materials:import'));
const canExport = computed(() => authStore.hasPermission('basedata:materials:export'));
const canViewPrice = computed(() => canViewMaterialPrices((code) => authStore.hasPermission(code)));
const canViewCost = canViewPrice;
const canMaintainPrice = computed(() => canMaintainMaterialPrices((code) => authStore.hasPermission(code)));

// 状态
const loading = ref(false);
const tableData = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const dialogVisible = ref(false);
const viewDialogVisible = ref(false);
const dialogTitle = ref('新增物料');
const currentEditMaterial = ref(null);
const currentViewMaterial = ref(null);
const viewLoading = ref(false);
const {
  previousItem: previousViewMaterial,
  nextItem: nextViewMaterial,
  hasPrevious: hasPreviousViewMaterial,
  hasNext: hasNextViewMaterial,
  setCurrentItem: setCurrentViewMaterial
} = useListDetailNavigation(tableData);

const searchForm = reactive({
  keyword: '',
  materialType: '',
  status: ''
});

const stats = reactive({
  total: 0,
  active: 0,
  inactive: 0,
  lowStock: 0
});

// 选项数据
const materialTypeOptions = MATERIAL_TYPE_OPTIONS;
const inspectionMethodOptions = ref([]);
const materialSourceOptions = ref([]);
const unitOptions = ref([]);
const locationOptions = ref([]);
const productCategoryOptions = ref([]);
const productionGroupOptions = ref([]);
const managerOptions = ref([]);

// 将平铺数据转换为树形结构（用于物料大类选择器）
const buildProductCategoryTree = (flatData, parentId = 0) => {
  const tree = [];
  for (const item of flatData) {
    // 支持 parent_id 为 0、null 或 undefined 的情况
    const itemParentId = Number(item.parentId || 0);
    if (itemParentId === Number(parentId || 0)) {
      // 显示名称格式：编码 - 名称（如 "1001 - EQ1开关电源"）
      const displayName = item.code ? `${item.code} - ${item.name}` : item.name;

      const node = {
        id: Number(item.id),
        name: item.name,
        code: item.code,
        parentId: Number(itemParentId) || 0,
        displayName: displayName,
        children: buildProductCategoryTree(flatData, item.id)
      };

      // 如果没有子节点，删除 children 属性
      if (node.children.length === 0) {
        delete node.children;
      }

      tree.push(node);
    }
  }
  return tree;
};

// 基础选项数据缓存（分类/单位/来源等变更频率极低，缓存5分钟避免重复请求）
const OPTIONS_CACHE_KEY = '__material_options_cache_v2__';
const OPTIONS_CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 加载基础数据（带内存缓存）
const loadOptions = async () => {
  try {
    // 检查缓存是否有效
    const cached = window[OPTIONS_CACHE_KEY];
    if (cached && Date.now() - cached.timestamp < OPTIONS_CACHE_TTL) {
      inspectionMethodOptions.value = cached.inspections;
      materialSourceOptions.value = cached.sources;
      unitOptions.value = cached.units;
      locationOptions.value = cached.locations;
      productCategoryOptions.value = cached.productCategories;
      productionGroupOptions.value = cached.groups;
      managerOptions.value = cached.managers;
      return;
    }

    const [sources, units, locs, pCatOptions, groups, users, inspections] = await Promise.all([
      baseDataApi.getMaterialSources(),
      baseDataApi.getUnits(),
      loadLocationOptions(),
      baseDataApi.getProductCategoryOptions(),
      commonApi.getEnums('production_group'),
      loadUserListOptions(),
      baseDataApi.getInspectionMethods()
    ]);

    inspectionMethodOptions.value = parseListData(inspections, { enableLog: false });
    materialSourceOptions.value = parseListData(sources, { enableLog: false });
    unitOptions.value = parseListData(units, { enableLog: false });
    locationOptions.value = parseListData(locs, { enableLog: false });

    const pCatList = parseListData(pCatOptions, { enableLog: false });
    productCategoryOptions.value = buildProductCategoryTree(pCatList);

    productionGroupOptions.value = parseListData(groups, { enableLog: false });

    const userRes = parseListData(users, { enableLog: false });
    managerOptions.value = userRes.map(u => ({
      id: u.id,
      username: u.username,
      realName: u.realName || u.nickname || u.username
    }));

    window[OPTIONS_CACHE_KEY] = {
      timestamp: Date.now(),
      inspections: inspectionMethodOptions.value,
      sources: materialSourceOptions.value,
      units: unitOptions.value,
      locations: locationOptions.value,
      productCategories: productCategoryOptions.value,
      groups: productionGroupOptions.value,
      managers: managerOptions.value
    };

  } catch (e) {
    console.error('加载选项失败', e);
    ElMessage.error('部分基础数据加载失败');
  }
};

const fetchData = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      ...searchForm
    };

    // 列表请求与统计请求并行发送，避免串行等待
    const shouldFetchStats = authStore.hasPermission('basedata:materials:view');
    const [res, statsRes] = await Promise.all([
      materialApi.getMaterials(params),
      shouldFetchStats ? materialApi.getMaterialStats() : Promise.resolve(null)
    ]);

    const { list, total: t } = parsePaginatedData(res);
    tableData.value = list;
    total.value = t;

    // 更新统计数据
    if (statsRes) {
      const statsData = parseDataObject(statsRes);
      if (statsData) {
        Object.assign(stats, statsData);
      }
    }
  } catch {
    ElMessage.error('获取列表失败');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadOptions();
  fetchData();
});

const handleSearch = () => {
  currentPage.value = 1;
  fetchData();
};

const resetSearch = () => {
  searchForm.keyword = '';
  searchForm.materialType = '';
  searchForm.status = '';
  handleSearch();
};

const handleAdd = () => {
  dialogTitle.value = '新增物料';
  currentEditMaterial.value = null;
  dialogVisible.value = true;
};

const handleEdit = async (row) => {
  dialogTitle.value = '编辑物料';
  // 获取详情
  try {
     const detail = await materialApi.getMaterial(row.id);
     currentEditMaterial.value = parseDataObject(detail);
     dialogVisible.value = true;
  } catch {
    ElMessage.error('获取详情失败');
  }
};

const loadViewMaterial = async (row, { openDialog = false } = {}) => {
  if (row?.id === null || row?.id === undefined || viewLoading.value) return false;

  viewLoading.value = true;
  try {
    // 详情和附件并行请求
    const [detail, attachRes] = await Promise.all([
      materialApi.getMaterial(row.id),
      materialApi.getMaterialAttachments(row.id).catch(() => null)
    ]);
    const data = parseDataObject(detail);
    if (!data) throw new Error('物料详情为空');

    data.attachments = attachRes ? parseListData(attachRes) : [];
    currentViewMaterial.value = data;
    setCurrentViewMaterial(row);
    if (openDialog) viewDialogVisible.value = true;
    return true;
  } catch {
    ElMessage.error('获取详情失败');
    return false;
  } finally {
    viewLoading.value = false;
  }
};

const handleView = (row) => loadViewMaterial(row, { openDialog: true });

const handleViewPrevious = () => {
  if (previousViewMaterial.value) loadViewMaterial(previousViewMaterial.value);
};

const handleViewNext = () => {
  if (nextViewMaterial.value) loadViewMaterial(nextViewMaterial.value);
};

const materialViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewMaterial.value,
  hasNext: hasNextViewMaterial.value,
  loading: viewLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext
}));

const handleDelete = async (row) => {
  try {
    await materialApi.deleteMaterial(row.id);
    ElMessage.success('删除成功');
    fetchData();
  } catch {
    ElMessage.error('删除失败');
  }
};

const handleEnable = async (row) => {
  try {
    await materialApi.updateMaterialStatus(row.id, 1);
    ElMessage.success('启用成功');
    fetchData();
  } catch {
    ElMessage.error('操作失败');
  }
};

const handleDisable = async (row) => {
  try {
    await materialApi.updateMaterialStatus(row.id, 0);
    ElMessage.success('禁用成功');
    fetchData();
  } catch {
    ElMessage.error('操作失败');
  }
};

// 导入相关状态
const importDialogVisible = ref(false);
const importLoading = ref(false);
const importFile = ref(null);
const importUploadRef = ref(null);

// 更多操作命令分发
const handleMoreCommand = (command) => {
  switch (command) {
    case 'copy':
      handleCopyMaterial();
      break;
    case 'export':
      handleExportMaterials();
      break;
    case 'import':
      importDialogVisible.value = true;
      importFile.value = null;
      break;
    default:
      ElMessage.warning('未知操作命令');
  }
};

// 复制物料：输入编码 → 通过API全局搜索 → 获取完整详情 → 以新增模式打开
const handleCopyMaterial = async () => {
  try {
    const { value } = await ElMessageBox.prompt(
      '请输入要复制的物料编码（支持全局搜索）',
      '复制物料',
      { confirmButtonText: '复制', cancelButtonText: '取消', inputPlaceholder: '物料编码' }
    );
    if (!value?.trim()) return;

    // 通过API全局搜索物料（不受分页限制）
    ElMessage.info('正在查找物料...');
    const searchRes = await materialApi.getMaterials({ keyword: value.trim(), page: 1, pageSize: 10 });
    const { list } = parsePaginatedData(searchRes);
    // 精确匹配编码
    const sourceMaterial = list.find(m => m.code === value.trim());
    if (!sourceMaterial) {
      ElMessage.warning(`未找到编码为 "${value.trim()}" 的物料`);
      return;
    }

    // 通过API获取完整详情数据（包含所有关联字段）
    const detail = await materialApi.getMaterial(sourceMaterial.id);
    const fullData = parseDataObject(detail);
    if (!fullData) {
      ElMessage.error('获取物料详情失败');
      return;
    }

    // 构建复制数据：删除id使其走新增逻辑
    const copyData = { ...fullData };
    delete copyData.id;
    copyData.code = '';  // 清空编码，fillFormData 检测到复制模式会自动生成
    copyData.name = copyData.name || '';
    // 保留所有关联ID字段：product_category_id, category_id, unit_id,
    // supplier_id, location_id, inspection_method_id, material_source_id 等

    dialogTitle.value = '复制物料';
    currentEditMaterial.value = copyData;
    dialogVisible.value = true;
  } catch {
    // 用户取消
  }
};

// 导出物料
const handleExportMaterials = async () => {
  try {
    ElMessage.info('正在生成导出文件...');
    const res = await materialApi.exportMaterials(searchForm);
    // 处理 Blob 下载
    const blob = new Blob([res.data || res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = formatLocalDate(new Date());
    link.download = `物料数据_${timestamp}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  } catch (error) {
    console.error('导出失败:', error);
    ElMessage.error('导出失败，请稍后重试');
  }
};

// 下载导入模板
const handleDownloadTemplate = async () => {
  try {
    const res = await materialApi.downloadMaterialTemplate();
    const blob = new Blob([res.data || res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '物料导入模板.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('下载模板失败:', error);
    ElMessage.error('下载模板失败');
  }
};

// 导入文件变更
const handleImportFileChange = (file) => {
  importFile.value = file.raw;
};

// 提交导入
const handleImportSubmit = async () => {
  if (!importFile.value) {
    ElMessage.warning('请先选择文件');
    return;
  }
  importLoading.value = true;
  try {
    const formData = new FormData();
    formData.append('file', importFile.value);
    await materialApi.importMaterials(formData);
    ElMessage.success('导入成功');
    importDialogVisible.value = false;
    importFile.value = null;
    fetchData(); // 刷新列表
  } catch (error) {
    console.error('导入失败:', error);
    const msg = error.response?.data?.message || error.message || '导入失败，请检查文件格式';
    ElMessage.error(msg);
  } finally {
    importLoading.value = false;
  }
};

const searchSuppliers = async (query, callback) => {
  try {
    const res = await baseDataApi.getSuppliers({
      keyword: query || '',
      page: 1,
      pageSize: 20
    });
    callback(parseListData(res));
  } catch (e) {
    console.error('供应商搜索失败:', e);
    callback([]);
  }
};

</script>
