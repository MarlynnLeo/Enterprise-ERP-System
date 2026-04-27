<!--
/**
 * PurchaseOrderForm.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="order-form-container">
    <div class="page-header">
      <h2>{{ isEdit ? '编辑采购订单' : '新建采购订单' }}</h2>
      <div>
        <el-button @click="goBack">返回</el-button>
        <el-button v-permission="'purchase:orders:update'" type="primary" @click="saveOrder" :loading="saveLoading">保存</el-button>
        <el-button v-permission="'purchase:orders:update'" 
          v-if="isEdit && formData.status === 'draft'" 
          type="success" 
          @click="submitOrder"
        >提交审批</el-button>
      </div>
    </div>
    
    <el-card class="data-card">
      <el-form ref="orderForm" :model="formData" :rules="rules" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="订单编号" prop="order_number">
              <el-input v-model="formData.order_number" placeholder="系统自动生成" disabled></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="订单日期" prop="order_date">
              <el-date-picker
                v-model="formData.order_date"
                type="date"
                placeholder="选择订单日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              ></el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="预计到货日期" prop="expected_delivery_date">
              <el-date-picker
                v-model="formData.expected_delivery_date"
                type="date"
                placeholder="选择预计到货日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="供应商" prop="supplier_id">
              <el-select
                v-model="formData.supplier_id"
                filterable
                placeholder="选择供应商"
                style="width: 100%"
                @change="handleSupplierChange"
              >
                <el-option
                  v-for="item in suppliers"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                >
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="联系人" prop="contact_person">
              <el-input v-model="formData.contact_person" placeholder="供应商联系人"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话" prop="contact_phone">
              <el-input v-model="formData.contact_phone" placeholder="联系电话"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="备注" prop="remarks">
              <el-input v-model="formData.remarks" type="textarea" :rows="1" placeholder="备注信息"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <!-- 物料列表 -->
        <el-divider content-position="left">物料列表</el-divider>

        <div class="material-list-header">
          <el-button type="primary" @click="openRequisitionDialog">选择采购申请</el-button>
        </div>
        
        <el-table :data="formData.items" border style="width: 100%; margin-top: 15px;">
          <el-table-column label="序号" type="index" width="60" align="center"></el-table-column>
          <el-table-column prop="material_code" label="物料编码" width="120"></el-table-column>
          <el-table-column prop="material_name" label="物料名称" width="180"></el-table-column>
          <el-table-column prop="specification" label="规格" width="150"></el-table-column>
          <el-table-column prop="unit" label="单位" width="80"></el-table-column>
          <el-table-column prop="quantity" label="数量" width="100">
            <template #default="scope">
              <el-input-number
                v-model="scope.row.quantity"
                :min="0.01"
                :precision="2"
                controls-position="right"
                style="width: 100%"
                @change="recalculatePrice(scope.row)"
              ></el-input-number>
            </template>
          </el-table-column>
          <el-table-column prop="price" label="单价" width="100">
            <template #default="scope">
              <el-input-number
                v-model="scope.row.price"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
                @change="recalculatePrice(scope.row)"
              ></el-input-number>
            </template>
          </el-table-column>
          <el-table-column prop="total_price" label="总价" width="120">
            <template #default="scope">
              <span>{{ (scope.row.quantity * scope.row.price).toFixed(2) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center">
            <template #default="scope">
              <el-button type="danger" icon="el-icon-delete" circle @click="removeItem(scope.$index)"></el-button>
            </template>
          </el-table-column>
        </el-table>
        
        <!-- 合计金额 -->
        <div class="total-price">
          <span>订单总金额: ¥{{ calculateTotalAmount() }}</span>
        </div>
      </el-form>
    </el-card>
  </div>
  
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
      <el-table-column prop="code" label="物料编码" width="120"></el-table-column>
      <el-table-column prop="name" label="物料名称" width="180"></el-table-column>
      <el-table-column prop="specification" label="规格" width="150"></el-table-column>
      <el-table-column prop="unit_name" label="单位" width="80"></el-table-column>
      <el-table-column label="数量" width="120">
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
      <el-table-column label="单价" width="120">
        <template #default="scope">
          <el-input-number
            v-model="scope.row.price"
            :min="0"
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
  
  <!-- 采购申请选择对话框 -->
  <el-dialog
    title="选择采购申请"
    v-model="requisitionDialogVisible"
    width="70%"
  >
    <div class="requisition-search">
      <el-input 
        v-model="requisitionSearchKeyword"
        placeholder="输入采购申请编号搜索"
        clearable
        @keyup.enter="searchRequisitions" >
        <template #append>
          <el-button @click="searchRequisitions">搜索</el-button>
        </template>
      </el-input>
    </div>
    
    <el-table
      :data="requisitionList.filter(item => item.status === 'approved')"
      border
      style="width: 100%; margin-top: 15px;"
      @row-click="handleRequisitionSelection"
    >
      <el-table-column prop="requisition_number" label="申请编号" width="150"></el-table-column>
      <el-table-column prop="request_date" label="申请日期" width="120"></el-table-column>
      <el-table-column prop="requester" label="申请人" width="120"></el-table-column>
      <el-table-column prop="status_text" label="状态" width="100">
        <template #default="scope">
          <el-tag :type="getStatusType(scope.row.status)">{{ getStatusText(scope.row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remarks" label="备注" show-overflow-tooltip></el-table-column>
    </el-table>
    
    <div class="pagination-container">
      <el-pagination
        @size-change="handleRequisitionSizeChange"
        @current-change="handleRequisitionCurrentChange"
        :current-page="requisitionPagination.current"
        :page-sizes="[10, 20, 50, 100]"
        :page-size="requisitionPagination.size"
        layout="total, sizes, prev, pager, next, jumper"
        :total="requisitionPagination.total"
      >
      </el-pagination>
    </div>
    
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="requisitionDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmRequisitionSelection">确定</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRouter, useRoute } from 'vue-router';
import { purchaseApi, materialApi, supplierApi } from '@/services/api';
import { parsePaginatedData } from '@/utils/responseParser'


const router = useRouter();
const route = useRoute();

// 加载状态
const saveLoading = ref(false);

// 判断是否为编辑模式
const isEdit = computed(() => !!route.params.id);

// 表单数据
const formData = reactive({
  order_number: '',
  order_date: new Date().toISOString().split('T')[0], // 默认今天
  expected_delivery_date: '',
  supplier_id: '',
  supplier_name: '',
  contact_person: '',
  contact_phone: '',
  remarks: '',
  requisition_id: null,
  requisition_number: '',
  status: 'draft', // 订单状态
  items: []
});

// 表单验证规则
const rules = {
  order_date: [{ required: true, message: '请选择订单日期', trigger: 'blur' }],
  expected_delivery_date: [{ required: true, message: '请选择预计到货日期', trigger: 'blur' }],
  supplier_id: [{ required: true, message: '请选择供应商', trigger: 'change' }],
  items: [{ required: true, type: 'array', min: 1, message: '至少添加一个物料', trigger: 'change' }]
};

const orderForm = ref(null);
const suppliers = ref([]);
const materialDialogVisible = ref(false);
const materialSearchKeyword = ref('');
const materialList = ref([]);
const selectedMaterials = ref([]);
const loading = ref(false);

const requisitionDialogVisible = ref(false);
const requisitionSearchKeyword = ref('');
const requisitionList = ref([]);
const selectedRequisition = ref(null);

// 物料分页
const materialPagination = reactive({
  current: 1,
  size: 10,
  total: 0
});

// 采购申请分页
const requisitionPagination = reactive({
  current: 1,
  size: 10,
  total: 0
});

// 加载供应商列表
const loadSuppliers = async () => {
  try {
    const res = await supplierApi.getSuppliers({ page: 1, pageSize: 10000 });
    
    if (res.data && res.data.list) {
      suppliers.value = res.data.list;
      } else if (res.list) {
      // 处理不同的返回格式
      suppliers.value = res.list;
      } else if (Array.isArray(res)) {
      // 处理直接返回数组的情况
      suppliers.value = res;
      } else if (res.data && Array.isArray(res.data)) {
      // 处理data字段直接是数组的情况
      suppliers.value = res.data;
      } else {
      console.warn('供应商数据格式不符合预期:', res);
      suppliers.value = [];
    }
  } catch (error) {
    console.error('获取供应商列表失败:', error);
    ElMessage.error('获取供应商列表失败');
  }
};

// 处理供应商变更
const handleSupplierChange = (supplierId) => {
  const supplier = suppliers.value.find(s => s.id === supplierId);
  if (supplier) {
    formData.supplier_name = supplier.name;
    formData.contact_person = supplier.contact_person || '';
    formData.contact_phone = supplier.contact_phone || '';
  }
};

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
    
    let materialData = [];
    let totalCount = 0;
    
    if (res.data && res.data.list) {
      materialData = res.data.list;
      totalCount = res.data.total || 0;
    } else if (res.list) {
      materialData = res.list;
      totalCount = res.total || res.list.length;
    } else if (Array.isArray(res)) {
      materialData = res;
      totalCount = res.length;
    } else if (res.data && Array.isArray(res.data)) {
      materialData = res.data;
      totalCount = res.data.length;
    } else {
      console.warn('物料数据格式不符合预期:', res);
    }
    
    materialList.value = materialData.map(item => ({
      ...item,
      id: item.id,
      code: item.code || item.material_code,
      name: item.name || item.material_name,
      specification: item.specification || '',
      unit_name: item.unit_name || item.unit || '',
      unit_id: item.unit_id || item.unit || '',
      quantity: 1, // 默认数量
      price: item.price || 0, // 默认单价
      selected: false
    }));
    
    materialPagination.total = totalCount;
    } catch (error) {
    console.error('获取物料列表失败:', error);
    ElMessage.error('获取物料列表失败');
  } finally {
    loading.value = false;
  }
};

// 采购申请搜索和分页
const searchRequisitions = async () => {
  loading.value = true;
  try {
    const params = {
      page: requisitionPagination.current,
      limit: requisitionPagination.size,
      keyword: requisitionSearchKeyword.value,
      status: ['completed'] // 只显示已完成的采购申请
    };
    
    const res = await purchaseApi.getOrderRequisitions(params);

    // 使用统一解析器处理分页数据
    const { list: requisitions, total } = parsePaginatedData(res, { enableLog: false });

    // 严格过滤，只显示approved状态
    const filteredRequisitions = requisitions.filter(item => {
      return item.status === 'approved';
    });
    requisitionList.value = filteredRequisitions;
    requisitionPagination.total = filteredRequisitions.length;
  } catch (error) {
    console.error('获取采购申请列表失败:', error);
    ElMessage.error('获取采购申请列表失败');
  } finally {
    loading.value = false;
  }
};

// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    'draft': '草稿',
    'submitted': '已提交',
    'approved': '已批准',
    'rejected': '已拒绝',
    'completed': '已完成',
    'cancelled': '已取消'
  };
  return statusMap[status] || status;
};

// 获取状态类型（用于标签颜色）
const getStatusType = (status) => {
  const statusTypeMap = {
    'draft': 'info',
    'submitted': 'warning',
    'approved': 'success',
    'rejected': 'danger',
    'completed': 'success',
    'cancelled': 'info'
  };
  return statusTypeMap[status] || '';
};

// 处理分页变化
const handleSizeChange = (val) => {
  materialPagination.size = val;
  materialPagination.current = 1;
  searchMaterials();
};

const handleCurrentChange = (val) => {
  materialPagination.current = val;
  searchMaterials();
};

const handleRequisitionSizeChange = (val) => {
  requisitionPagination.size = val;
  requisitionPagination.current = 1;
  searchRequisitions();
};

const handleRequisitionCurrentChange = (val) => {
  requisitionPagination.current = val;
  searchRequisitions();
};

// 物料选择
const handleMaterialSelectionChange = (selection) => {
  selectedMaterials.value = selection;
};

// 采购申请选择
const handleRequisitionSelection = (row) => {
  selectedRequisition.value = row;
};

// 打开对话框
const openMaterialDialog = () => {
  materialDialogVisible.value = true;
  searchMaterials();
};

const openRequisitionDialog = () => {
  requisitionDialogVisible.value = true;
  searchRequisitions();
};

// 确认物料选择
const confirmMaterialSelection = () => {
  if (selectedMaterials.value.length === 0) {
    ElMessage.warning('请至少选择一个物料');
    return;
  }
  
  // 添加选中的物料到表单
  selectedMaterials.value.forEach(material => {
    // 检查是否已存在相同物料
    const existingIndex = formData.items.findIndex(item => item.material_id === material.id);
    
    if (existingIndex >= 0) {
      // 如果已存在，增加数量
      formData.items[existingIndex].quantity += material.quantity;
      // 重新计算总价
      recalculatePrice(formData.items[existingIndex]);
    } else {
      // 否则，添加新物料
      const newItem = {
        material_id: material.id,
        material_code: material.code,
        material_name: material.name,
        specification: material.specification,
        unit: material.unit_name,
        unit_id: material.unit_id,
        quantity: material.quantity,
        price: material.price || 0,
        total_price: (material.quantity * (material.price || 0))
      };
      formData.items.push(newItem);
    }
  });
  
  materialDialogVisible.value = false;
  ElMessage.success('物料添加成功');
};

// 确认采购申请选择
const confirmRequisitionSelection = async () => {
  if (!selectedRequisition.value) {
    ElMessage.warning('请选择一个采购申请');
    return;
  }
  
  try {
    // 获取采购申请详细信息
    const res = await purchaseApi.getOrderRequisition(selectedRequisition.value.id);
    if (res.data) {
      // 设置关联的采购申请
      formData.requisition_id = res.data.id;
      formData.requisition_number = res.data.requisition_number;
      
      // 添加采购申请中的物料到订单
      if (res.data.items && res.data.items.length > 0) {
        // 清空现有的物料
        const keepExistingItems = await ElMessageBox.confirm(
          '是否保留当前已添加的物料？',
          '提示',
          {
            confirmButtonText: '是',
            cancelButtonText: '否',
            type: 'warning'
          }
        ).then(() => true).catch(() => false);
        
        if (!keepExistingItems) {
          formData.items = [];
        }
        
        // 添加采购申请中的物料
        res.data.items.forEach(item => {
          // 检查是否已存在相同物料
          const existingIndex = formData.items.findIndex(i => i.material_id === item.material_id);
          
          if (existingIndex >= 0) {
            // 如果已存在，询问是否更新数量
            formData.items[existingIndex].quantity = item.quantity;
            recalculatePrice(formData.items[existingIndex]);
          } else {
            // 否则，添加新物料
            formData.items.push({
              material_id: item.material_id,
              material_code: item.material_code,
              material_name: item.material_name,
              specification: item.specification,
              unit: item.unit,
              unit_id: item.unit_id,
              quantity: item.quantity,
              price: 0,
              total_price: 0
            });
          }
        });
      }
      
      requisitionDialogVisible.value = false;
      ElMessage.success('采购申请关联成功');
    }
  } catch (error) {
    console.error('获取采购申请详情失败:', error);
    ElMessage.error('获取采购申请详情失败');
  }
};

// 移除关联的采购申请
const removeRequisition = () => {
  ElMessageBox.confirm('确定要移除关联的采购申请吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    formData.requisition_id = null;
    formData.requisition_number = '';
    ElMessage.success('已移除关联的采购申请');
  }).catch(() => {});
};

// 移除物料项
const removeItem = (index) => {
  formData.items.splice(index, 1);
};

// 重新计算价格
const recalculatePrice = (item) => {
  if (item.quantity <= 0) {
    ElMessage.warning('数量必须大于0');
    item.quantity = 0.01;
  }
  item.total_price = item.quantity * item.price;
};

// 计算总金额
const calculateTotalAmount = () => {
  return formData.items.reduce((total, item) => total + (item.quantity * item.price), 0).toFixed(2);
};

// 返回列表页
const goBack = () => {
  ElMessageBox.confirm('确定返回？未保存的数据将丢失！', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    router.push('/purchase/orders');
  }).catch(() => {});
};

// 保存采购订单
const saveOrder = async () => {
  if (formData.items.length === 0) {
    ElMessage.warning('请至少添加一个物料');
    return;
  }
  
  try {
    saveLoading.value = true;
    await orderForm.value.validate();
    
    const formDataToSubmit = {
      ...formData,
      status: formData.status || 'draft', // 保持原状态或默认草稿
      total_amount: parseFloat(calculateTotalAmount())
    };
    
    if (route.params.id) {
      // 更新
      await purchaseApi.updateOrder(route.params.id, formDataToSubmit);
      ElMessage.success('采购订单更新成功');
    } else {
      // 创建
      await purchaseApi.createOrder(formDataToSubmit);
      ElMessage.success('采购订单创建成功');
    }
    
    router.push('/purchase/orders');
  } catch (error) {
    console.error('保存失败:', error);
    ElMessage.error(error.message || '保存失败，请检查表单');
  } finally {
    saveLoading.value = false;
  }
};

// 提交审批
const submitOrder = async () => {
  if (formData.items.length === 0) {
    ElMessage.warning('请至少添加一个物料');
    return;
  }
  
  try {
    saveLoading.value = true;
    await orderForm.value.validate();
    
    const formDataToSubmit = {
      ...formData,
      status: 'submitted', // 提交审批状态
      total_amount: parseFloat(calculateTotalAmount())
    };
    
    await purchaseApi.updateOrder(route.params.id, formDataToSubmit);
    ElMessage.success('已提交审批');
    router.push('/purchase/orders');
  } catch (error) {
    console.error('提交审批失败:', error);
    ElMessage.error(error.message || '提交审批失败');
  } finally {
    saveLoading.value = false;
  }
};

// 初始化
onMounted(async () => {
  // 加载供应商列表
  loadSuppliers();
  
  // 如果是编辑模式，加载数据
  if (route.params.id) {
    try {
      const res = await purchaseApi.getOrder(route.params.id);
      if (res.data) {
        Object.assign(formData, {
          order_number: res.data.order_number,
          order_date: res.data.order_date,
          expected_delivery_date: res.data.expected_delivery_date,
          supplier_id: res.data.supplier_id,
          supplier_name: res.data.supplier_name,
          contact_person: res.data.contact_person,
          contact_phone: res.data.contact_phone,
          remarks: res.data.remarks,
          requisition_id: res.data.requisition_id,
          requisition_number: res.data.requisition_number,
          status: res.data.status || 'draft', // 保留原有状态
          items: res.data.items || []
        });
      }
    } catch (error) {
      console.error('获取采购订单详情失败:', error);
      ElMessage.error('获取采购订单详情失败');
    }
  }
});
</script>

<style scoped>

.material-list-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.form-actions {
  margin-top: 30px;
  text-align: right;
}

.material-search, .requisition-search {
  margin-bottom: 15px;
}


.total-price {
  margin-top: 15px;
  text-align: right;
  font-size: 16px;
  font-weight: bold;
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