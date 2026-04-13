<!--
/**
 * PurchaseRequisitionForm.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="requisition-form-container">
    <div class="page-header">
      <h2>{{ isEdit ? '编辑采购申请' : '新建采购申请' }}</h2>
      <div>
        <el-button @click="goBack">返回</el-button>
        <el-button v-permission="'purchase:purchaserequisitionform:update'" type="primary" @click="saveRequisition" :loading="saveLoading">保存</el-button>
        <el-button v-permission="'purchase:purchaserequisitionform:approve'" 
          v-if="isEdit && requisitionForm.status === 'draft'" 
          type="success" 
          @click="submitRequisition"
        >提交审批</el-button>
      </div>
    </div>
    
    <el-card class="data-card">
      <el-form 
        ref="requisitionFormRef" 
        :model="requisitionForm" 
        :rules="requisitionRules" 
        label-width="120px"
        :disabled="formDisabled"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="申请编号" prop="requisition_number">
              <el-input v-model="requisitionForm.requisition_number" placeholder="系统自动生成" disabled></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="申请日期" prop="request_date">
              <el-date-picker
                v-model="requisitionForm.request_date"
                type="date"
                placeholder="选择申请日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              ></el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="申请人" prop="requester">
              <el-input v-model="requisitionForm.requester" placeholder="请输入申请人"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注" prop="remarks">
              <el-input v-model="requisitionForm.remarks" type="textarea" :rows="1" placeholder="请输入备注信息"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <!-- 物料列表 -->
        <el-divider content-position="left">物料列表</el-divider>
        
        <div class="material-list-header">
          <el-button v-permission="'purchase:purchaserequisitionform:create'" type="primary" @click="openMaterialDialog">添加物料</el-button>
        </div>
        
        <el-table :data="requisitionForm.items" border style="width: 100%; margin-top: 15px;">
          <el-table-column label="序号" type="index" width="60" align="center"></el-table-column>
          <el-table-column prop="material_code" label="物料编码" width="120" show-overflow-tooltip></el-table-column>
          <el-table-column prop="material_name" label="物料名称" width="180" show-overflow-tooltip></el-table-column>
          <el-table-column prop="specification" label="规格" width="150" show-overflow-tooltip></el-table-column>
          <el-table-column prop="unit" label="单位" width="80" show-overflow-tooltip></el-table-column>
          <el-table-column prop="quantity" label="数量" width="120" show-overflow-tooltip>
            <template #default="scope">
              <el-input-number
                v-model="scope.row.quantity"
                :min="0.01"
                :precision="2"
                controls-position="right"
                style="width: 100%"
                @change="updateItem(scope.$index, scope.row)"
              ></el-input-number>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="center">
            <template #default="scope">
              <el-button
                link
                class="delete-text-btn"
                @click="removeItem(scope.$index)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>
    </el-card>
    
    <!-- 物料选择对话框 -->
    <el-dialog
      title="选择物料"
      v-model="materialDialogVisible"
      width="70%"
    >
      <div class="material-search">
        <el-input 
          v-model="materialSearchKeyword"
          placeholder="输入物料编码或名称搜索"
          clearable
          @keyup.enter="searchMaterials" >
          <template #append>
            <el-button @click="searchMaterials">搜索</el-button>
          </template>
        </el-input>
      </div>
      
      <el-table
        :data="materialList"
        border
        style="width: 100%; margin-top: 15px;"
        @selection-change="handleMaterialSelectionChange"
      >
        <el-table-column type="selection" width="55"></el-table-column>
        <el-table-column prop="code" label="物料编码" width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="name" label="物料名称" width="180" show-overflow-tooltip></el-table-column>
        <el-table-column prop="specification" label="规格" width="150" show-overflow-tooltip></el-table-column>
        <el-table-column prop="unit_name" label="单位" width="80" show-overflow-tooltip></el-table-column>
        <el-table-column label="数量" width="120" show-overflow-tooltip>
          <template #default="scope">
            <el-input-number
              v-model="scope.row.quantity"
              :min="0.01"
              :precision="2"
              controls-position="right"
              style="width: 100%"
            ></el-input-number>
          </template>
        </el-table-column>
      </el-table>
      
      <div class="pagination-container">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="materialPagination.current"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="materialPagination.size"
          layout="total, sizes, prev, pager, next, jumper"
          :total="materialPagination.total"
        >
        </el-pagination>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="materialDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmMaterialSelection">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRouter, useRoute } from 'vue-router';
import { purchaseApi, materialApi } from '@/services/api';

const router = useRouter();
const route = useRoute();

// 加载状态
const saveLoading = ref(false);

// 判断是否为编辑模式
const isEdit = computed(() => !!route.params.id);

// 表单是否禁用
const formDisabled = computed(() => requisitionForm.status && requisitionForm.status !== 'draft');

// 表单数据
const requisitionForm = reactive({
  requisition_number: '',
  request_date: new Date().toISOString().split('T')[0], // 默认今天
  requester: '',
  remarks: '',
  items: []
});

// 表单验证规则
const requisitionRules = {
  request_date: [{ required: true, message: '请选择申请日期', trigger: 'blur' }],
  requester: [{ required: true, message: '请输入申请人', trigger: 'blur' }],
  items: [{ required: true, type: 'array', min: 1, message: '至少添加一个物料', trigger: 'change' }]
};

const requisitionFormRef = ref(null);
const materialDialogVisible = ref(false);
const materialSearchKeyword = ref('');
const materialList = ref([]);
const selectedMaterials = ref([]);
const loading = ref(false);

// 物料分页
const materialPagination = reactive({
  current: 1,
  size: 10,
  total: 0
});

// 物料搜索和分页
const searchMaterials = async () => {
  loading.value = true;
  try {
    const params = {
      page: materialPagination.current,
      limit: materialPagination.size,
      keyword: materialSearchKeyword.value
    };
    
    const res = await materialApi.getMaterials(params);
    if (res.data && res.data.list) {
      materialList.value = res.data.list.map(item => ({
        ...item,
        quantity: 1, // 默认数量
        selected: false
      }));
      materialPagination.total = res.data.total;
    }
  } catch (error) {
    console.error('获取物料列表失败:', error);
    ElMessage.error('获取物料列表失败');
  } finally {
    loading.value = false;
  }
};

const handleSizeChange = (val) => {
  materialPagination.size = val;
  materialPagination.current = 1;
  searchMaterials();
};

const handleCurrentChange = (val) => {
  materialPagination.current = val;
  searchMaterials();
};

const handleMaterialSelectionChange = (selection) => {
  selectedMaterials.value = selection;
};

const openMaterialDialog = () => {
  materialDialogVisible.value = true;
  searchMaterials(); // 打开对话框时加载物料
};

const confirmMaterialSelection = () => {
  if (selectedMaterials.value.length === 0) {
    ElMessage.warning('请至少选择一个物料');
    return;
  }
  
  // 添加选中的物料到表单
  selectedMaterials.value.forEach(material => {
    // 检查是否已存在相同物料
    const existingIndex = requisitionForm.items.findIndex(item => item.material_id === material.id);
    
    if (existingIndex >= 0) {
      // 如果已存在，增加数量
      requisitionForm.items[existingIndex].quantity += material.quantity;
    } else {
      // 否则，添加新物料
      requisitionForm.items.push({
        material_id: material.id,
        material_code: material.code,
        material_name: material.name,
        specification: material.specification,
        unit: material.unit_name,
        unit_id: material.unit_id,
        quantity: material.quantity
      });
    }
  });
  
  materialDialogVisible.value = false;
  ElMessage.success('物料添加成功');
};

// 移除物料项
const removeItem = (index) => {
  requisitionForm.items.splice(index, 1);
};

// 更新物料项
const updateItem = (index, row) => {
  if (row.quantity <= 0) {
    ElMessage.warning('数量必须大于0');
    row.quantity = 0.01;
  }
};

// 返回列表页
const goBack = () => {
  ElMessageBox.confirm('确定返回？未保存的数据将丢失！', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    router.push('/purchase/requisitions');
  }).catch(() => {});
};

// 保存采购申请
const saveRequisition = async () => {
  if (requisitionForm.items.length === 0) {
    ElMessage.warning('请至少添加一个物料');
    return;
  }
  
  try {
    saveLoading.value = true;
    await requisitionFormRef.value.validate();
    
    const formDataToSubmit = {
      ...requisitionForm,
      status: requisitionForm.status || 'draft' // 保持原状态或默认草稿
    };
    
    if (route.params.id) {
      // 更新
      await purchaseApi.updateRequisition(route.params.id, formDataToSubmit);
      ElMessage.success('采购申请更新成功');
    } else {
      // 创建
      await purchaseApi.createRequisition(formDataToSubmit);
      ElMessage.success('采购申请创建成功');
    }
    
    router.push('/purchase/requisitions');
  } catch (error) {
    console.error('保存失败:', error);
    ElMessage.error(error.message || '保存失败，请检查表单');
  } finally {
    saveLoading.value = false;
  }
};

// 提交审批
const submitRequisition = async () => {
  if (requisitionForm.items.length === 0) {
    ElMessage.warning('请至少添加一个物料');
    return;
  }
  
  try {
    saveLoading.value = true;
    await requisitionFormRef.value.validate();
    
    const formDataToSubmit = {
      ...requisitionForm,
      status: 'submitted' // 提交审批状态
    };
    
    await purchaseApi.updateRequisition(route.params.id, formDataToSubmit);
    ElMessage.success('已提交审批');
    router.push('/purchase/requisitions');
  } catch (error) {
    console.error('提交审批失败:', error);
    ElMessage.error(error.message || '提交审批失败');
  } finally {
    saveLoading.value = false;
  }
};

// 初始化
onMounted(async () => {
  // 如果是编辑模式，加载数据
  if (route.params.id) {
    try {
      const res = await purchaseApi.getRequisition(route.params.id);
      if (res.data) {
        Object.assign(requisitionForm, {
          requisition_number: res.data.requisition_number,
          request_date: res.data.request_date,
          requester: res.data.requester,
          remarks: res.data.remarks,
          items: res.data.items || []
        });
      }
    } catch (error) {
      console.error('获取采购申请详情失败:', error);
      ElMessage.error('获取采购申请详情失败');
    }
  }
});
</script>

<style scoped>
.requisition-form-container {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #fff;
}

.page-header .el-button {
  margin-left: 10px;
}

.page-header .el-button--default {
  background: rgba(255, 255, 255, 0.9);
  border-color: transparent;
  color: #667eea;
}

.page-header .el-button--default:hover {
  background: #fff;
  color: #764ba2;
}

.data-card {
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.data-card :deep(.el-card__body) {
  padding: 24px;
}

.material-list-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.material-search {
  margin-bottom: 15px;
}

/* 表格样式优化 */
:deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
}

:deep(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover);
  color: var(--color-text-regular);
  font-weight: 600;
}

/* 删除按钮样式 */
.delete-text-btn {
  color: var(--color-danger) !important;
  font-weight: 500;
}

.delete-text-btn:hover {
  color: #f78989 !important;
}

/* 分页容器 */
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 对话框样式优化 */
:deep(.el-dialog) {
  border-radius: 12px;
}

:deep(.el-dialog__header) {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-lighter);
}

:deep(.el-dialog__body) {
  padding: 20px;
}

/* 分割线样式 */
:deep(.el-divider__text) {
  font-weight: 600;
  color: var(--color-text-primary);
  background-color: #fff;
}

/* 表单项标签优化 */
:deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--color-text-regular);
}

/* 输入框禁用状态优化 */
:deep(.el-input.is-disabled .el-input__wrapper) {
  background-color: var(--color-bg-hover);
}
</style>