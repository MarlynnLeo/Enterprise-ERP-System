<!--
/**
 * Materials.vue
 * @description 前端界面组件文件 (Refactored)
 * @date 2026-01-23
 * @version 2.0.0
 */
-->
<template>
  <div class="purchase-requisitions-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>{{ $t('page.baseData.materials.title') }}</h2>
          <p class="subtitle">管理物料基础信息</p>
        </div>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleAdd">{{ $t('page.baseData.materials.add') }}</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item :label="$t('page.baseData.materials.keywordSearch')">
          <el-input  v-model="searchForm.keyword" :placeholder="$t('page.baseData.materials.keywordPlaceholder')" clearable ></el-input>
        </el-form-item>
        <el-form-item :label="$t('page.baseData.materials.category')">
          <el-select v-model="searchForm.categoryId" :placeholder="$t('page.baseData.materials.categoryPlaceholder')" clearable>
            <el-option
              v-for="item in categoryOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id">
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('common.status')">
          <el-select  v-model="searchForm.status" :placeholder="$t('page.baseData.materials.statusPlaceholder')" clearable>
            <el-option :value="1" :label="$t('page.baseData.materials.enabled')"></el-option>
            <el-option :value="0" :label="$t('page.baseData.materials.disabled')"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" class="action-btn" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> {{ $t('page.baseData.materials.query') }}
          </el-button>
          <el-button @click="resetSearch" class="action-btn" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> {{ $t('page.baseData.materials.reset') }}
          </el-button>
          <el-dropdown @command="handleMoreCommand" v-if="canExport || canImport" style="margin-left: 8px;">
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
        </el-form-item>
      </el-form>
    </el-card>

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
      v-if="dialogVisible"
      v-model="dialogVisible"
      :title="dialogTitle"
      :editData="currentEditMaterial"
      :productCategoryOptions="productCategoryOptions"
      :categoryOptions="categoryOptions"
      :inspectionMethodOptions="inspectionMethodOptions"
      :materialSourceOptions="materialSourceOptions"
      :unitOptions="unitOptions"
      :locationOptions="locationOptions"
      :productionGroupOptions="productionGroupOptions"
      :managerOptions="managerOptions"
      @search-suppliers="searchSuppliers"
      @success="fetchData"
    />

    <!-- 查看对话框 -->
    <MaterialViewDialog
      v-if="viewDialogVisible"
      v-model="viewDialogVisible"
      :viewData="currentViewMaterial"
      :canViewCost="canViewCost"
      :canViewPrice="canViewPrice"
    />

    <!-- 导入对话框 -->
    <el-dialog title="导入物料" v-model="importDialogVisible" width="520px">
      <div style="margin-bottom: 16px;">
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
        <div style="margin-top: 8px;">将文件拖到此处，或<em>点击上传</em></div>
        <template #tip>
          <div class="el-upload__tip">仅支持 .xlsx / .xls 格式</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="importLoading" :disabled="!importFile" @click="handleImportSubmit">开始导入</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus, Download, Upload, DocumentCopy, ArrowDown } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { materialApi } from '@/api/material';
import { baseDataApi } from '@/api/baseData';
import { systemApi } from '@/api/system';
import { commonApi } from '@/api/common';
import { parsePaginatedData, parseListData, parseDataObject } from '@/utils/responseParser';

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
// 🔒 敏感数据查看权限（成本/价格）
const canViewCost = computed(() => authStore.hasPermission('basedata:materials:view_cost'));
const canViewPrice = computed(() => authStore.hasPermission('basedata:materials:view_price'));

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

const searchForm = reactive({
  keyword: '',
  categoryId: '',
  status: ''
});

const stats = reactive({
  total: 0,
  active: 0,
  inactive: 0,
  lowStock: 0
});

// 选项数据
const categoryOptions = ref([]);
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
    const itemParentId = item.parent_id || 0;
    if (itemParentId === parentId) {
      // 显示名称格式：编码 - 名称（如 "1001 - EQ1开关电源"）
      const displayName = item.code ? `${item.code} - ${item.name}` : item.name;
      
      const node = {
        id: item.id,
        name: item.name,
        code: item.code,
        parent_id: item.parent_id,
        displayName: displayName, // 用于 TreeSelect 显示和搜索
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
const OPTIONS_CACHE_KEY = '__material_options_cache__';
const OPTIONS_CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 加载基础数据（带内存缓存）
const loadOptions = async () => {
  try {
    // 检查缓存是否有效
    const cached = window[OPTIONS_CACHE_KEY];
    if (cached && Date.now() - cached.timestamp < OPTIONS_CACHE_TTL) {
      categoryOptions.value = cached.categories;
      inspectionMethodOptions.value = cached.inspections;
      materialSourceOptions.value = cached.sources;
      unitOptions.value = cached.units;
      locationOptions.value = cached.locations;
      productCategoryOptions.value = cached.productCategories;
      productionGroupOptions.value = cached.groups;
      managerOptions.value = cached.managers;
      return;
    }

    // 并行请求所有需要的选项数据
    const [cats, sources, units, locs, pCatOptions, groups, users, inspections] = await Promise.all([
      baseDataApi.getCategories(), // 替换 getDictionary('material_category')
      baseDataApi.getMaterialSources(), // 替换 getDictionary('material_source')
      baseDataApi.getUnits(),
      baseDataApi.getLocations(),
      baseDataApi.getProductCategoryOptions(), // 使用树形选项API
      commonApi.getEnums('production_group'), // 尝试使用 commonApi 获取生产组枚举
      systemApi.getUsersList(), // 使用无权限隔离的轻量级下拉列表接口
      baseDataApi.getInspectionMethods() // 获取检验方式数据
    ]);

    // 使用 parseListData 正确解析响应数据
    categoryOptions.value = parseListData(cats, { enableLog: false });
    inspectionMethodOptions.value = parseListData(inspections, { enableLog: false });
    materialSourceOptions.value = parseListData(sources, { enableLog: false });
    unitOptions.value = parseListData(units, { enableLog: false });
    locationOptions.value = parseListData(locs, { enableLog: false });
    
    // 产品大类需要构建树形结构
    const pCatList = parseListData(pCatOptions, { enableLog: false });
    productCategoryOptions.value = buildProductCategoryTree(pCatList);
    
    productionGroupOptions.value = parseListData(groups, { enableLog: false });
    
    // 用户列表可能需要特殊处理
    const userRes = parseListData(users, { enableLog: false });
    managerOptions.value = userRes.map(u => ({
      id: u.id,
      username: u.username,
      real_name: u.real_name || u.nickname || u.username
    }));

    // 写入缓存
    window[OPTIONS_CACHE_KEY] = {
      timestamp: Date.now(),
      categories: categoryOptions.value,
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
  searchForm.categoryId = '';
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

const handleView = async (row) => {
  try {
     // 详情和附件并行请求
     const [detail, attachRes] = await Promise.all([
       materialApi.getMaterial(row.id),
       materialApi.getMaterialAttachments(row.id).catch(() => null)
     ]);
     const data = parseDataObject(detail);
     data.attachments = attachRes ? parseListData(attachRes) : [];
     currentViewMaterial.value = data;
     viewDialogVisible.value = true;
  } catch {
    ElMessage.error('获取详情失败');
  }
};

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
    copyData.name = (copyData.name || '') + ' (副本)';
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
    const timestamp = new Date().toISOString().slice(0, 10);
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
  if (!query) {
    callback([]);
    return;
  }
  try {
    const res = await baseDataApi.getSuppliers({ keyword: query, page: 1, pageSize: 20 });
    // parseListData 返回的是数组，不是 {list}
    const list = parseListData(res);
    callback(list);
  } catch (e) {
    console.error('供应商搜索失败:', e);
    callback([]);
  }
};

</script>

<style scoped>
.purchase-requisitions-container {
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
</style>
