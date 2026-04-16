<!--
/**
 * EditCheck.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="page-container">
    <NavBar
      title="编辑盘点单"
      left-arrow
      @click-left="onClickLeft"
    />
    
    <div class="content-container">
      <div v-if="loading" class="loading-container">
        <Loading type="spinner" color="#1989fa" />
        <p class="loading-text">加载中...</p>
      </div>
      
      <template v-else>
        <!-- 基本信息 -->
        <CellGroup inset title="基本信息">
          <Cell title="盘点单号" :value="checkForm.check_no" />
          <Cell title="盘点日期" :value="checkForm.check_date" />
          <Cell title="盘点类型" :value="getCheckTypeText(checkForm.check_type)" />
          <Cell title="仓库/库区" :value="checkForm.warehouse" />
        </CellGroup>
        
        <!-- 描述 -->
        <CellGroup inset title="描述与备注">
          <Field
            v-model="checkForm.description"
            label="盘点描述"
            type="textarea"
            rows="2"
            autosize
            placeholder="请输入盘点描述"
          />
          <Field
            v-model="checkForm.remarks"
            label="备注"
            type="textarea"
            rows="2"
            autosize
            placeholder="请输入备注信息"
          />
        </CellGroup>
        
        <!-- 物料列表 -->
        <div class="material-list-container">
          <div class="material-list-header">
            <div class="header-title">物料明细({{ checkForm.items.length }})</div>
            <div class="header-actions">
              <Button type="primary" size="small" icon="plus" @click="showMaterialPicker = true">添加物料</Button>
            </div>
          </div>
          
          <div v-if="checkForm.items.length === 0" class="empty-tips">
            <Empty description="暂无物料，请添加物料" />
          </div>
          
          <div v-else class="material-list">
            <SwipeCell
              v-for="(item, index) in checkForm.items"
              :key="index"
              :disabled="!editableMaterials"
            >
              <div class="material-card">
                <div class="material-header">
                  <span class="material-code">{{ item.material_code }}</span>
                  <span 
                    class="diff-quantity" 
                    :class="getDiffClass(item.book_qty, item.actual_qty)"
                  >
                    {{ getDiffText(item.book_qty, item.actual_qty) }}
                  </span>
                </div>
                
                <div class="material-name">{{ item.material_name }}</div>
                
                <div class="material-quantities">
                  <div class="qty-item">
                    <span class="qty-label">账面数量</span>
                    <span class="qty-value">{{ item.book_qty }} {{ item.unit_name }}</span>
                  </div>
                  <div class="qty-item">
                    <span class="qty-label">实盘数量</span>
                    <span class="qty-input">
                      <Stepper
                        v-model="item.actual_qty"
                        theme="round"
                        button-size="22"
                        :min="0"
                        :step="1"
                        :precision="2"
                      />
                    </span>
                  </div>
                </div>
                
                <div class="material-remark">
                  <Field
                    v-model="item.remarks"
                    placeholder="备注信息"
                    size="small"
                  />
                </div>
              </div>
              
              <template #right>
                <Button
                  square
                  type="danger"
                  text="删除"
                  class="delete-button"
                  @click="removeItem(index)"
                />
              </template>
            </SwipeCell>
          </div>
        </div>
        
        <!-- 底部操作栏 -->
        <div class="bottom-actions">
          <Button round block type="primary" @click="submitCheckForm" :loading="submitting">
            保存盘点单
          </Button>
        </div>
      </template>
    </div>
    
    <!-- 物料选择器 -->
    <Popup
      v-model:show="showMaterialPicker"
      position="bottom"
      round
      closeable
      style="height: 70%"
    >
      <div class="material-picker">
        <div class="picker-header">
          <div class="picker-title">选择物料</div>
        </div>
        
        <div class="picker-search">
          <Search
            v-model="materialSearch"
            placeholder="搜索物料名称或编码"
            @search="onSearchMaterial"
          />
        </div>
        
        <div class="picker-content">
          <List
            v-model:loading="loadingMaterials"
            :finished="materialListFinished"
            finished-text="没有更多物料"
            @load="loadMaterials"
          >
            <Cell
              v-for="material in materialList"
              :key="material.id"
              :title="material.name"
              :label="material.code"
              clickable
              @click="selectMaterial(material)"
            />
          </List>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { 
  NavBar, 
  Loading, 
  CellGroup, 
  Cell, 
  Field, 
  Button, 
  Empty, 
  SwipeCell, 
  Stepper,
  Popup,
  Search,
  List,
  showToast 
} from 'vant';
import { inventoryApi } from '@/services/api';

const router = useRouter();
const route = useRoute();
const loading = ref(true);
const submitting = ref(false);
const showMaterialPicker = ref(false);
const loadingMaterials = ref(false);
const materialListFinished = ref(false);
const materialSearch = ref('');
const materialList = ref([]);
const editableMaterials = ref(true); // 是否可编辑物料（只有草稿状态下可以编辑）

// 盘点单表单
const checkForm = ref({
  id: '',
  check_no: '',
  check_date: '',
  check_type: '',
  warehouse_id: '',
  warehouse: '',
  description: '',
  remarks: '',
  items: []
});

// 物料分页
const materialPagination = ref({
  page: 1,
  limit: 20,
  total: 0
});

// 返回上一页
const onClickLeft = () => {
  router.push(`/inventory/check/${checkForm.value.id}`);
};

// 获取盘点类型文本
const getCheckTypeText = (type) => {
  const typeMap = {
    'cycle': '周期盘点',
    'random': '随机盘点',
    'full': '全面盘点',
    'special': '专项盘点'
  };
  return typeMap[type] || type;
};

// 计算数量差异
const getDiffText = (bookQty, actualQty) => {
  if (bookQty === undefined || actualQty === undefined) return '0';
  const diff = actualQty - bookQty;
  return diff > 0 ? `+${diff}` : `${diff}`;
};

// 获取差异样式
const getDiffClass = (bookQty, actualQty) => {
  if (bookQty === undefined || actualQty === undefined) return '';
  
  const diff = actualQty - bookQty;
  if (diff > 0) return 'profit-text';
  if (diff < 0) return 'loss-text';
  return '';
};

// 移除物料项
const removeItem = (index) => {
  checkForm.value.items.splice(index, 1);
};

// 搜索物料
const onSearchMaterial = () => {
  materialPagination.value.page = 1;
  materialList.value = [];
  materialListFinished.value = false;
  loadMaterials();
};

// 加载物料列表
const loadMaterials = async () => {
  if (loadingMaterials.value) return;
  
  loadingMaterials.value = true;
  try {
    const params = {
      page: materialPagination.value.page,
      limit: materialPagination.value.limit,
      search: materialSearch.value || undefined
    };
    
    const response = await inventoryApi.getAllMaterials(params);
    
    if (response.data && Array.isArray(response.data.items)) {
      materialList.value = [...materialList.value, ...response.data.items];
      materialPagination.value.total = response.data.total || 0;
      
      materialListFinished.value = materialList.value.length >= materialPagination.value.total;
      
      if (response.data.items.length > 0) {
        materialPagination.value.page++;
      } else {
        materialListFinished.value = true;
      }
    } else {
      materialListFinished.value = true;
    }
  } catch (error) {
    console.error('加载物料列表失败:', error);
    showToast('加载物料列表失败');
    materialListFinished.value = true;
  } finally {
    loadingMaterials.value = false;
  }
};

// 选择物料
const selectMaterial = async (material) => {
  try {
    // 检查是否已存在该物料
    const exists = checkForm.value.items.some(item => item.material_id === material.id);
    if (exists) {
      showToast('该物料已添加');
      return;
    }
    
    // 获取该物料在仓库的库存
    const stockResponse = await inventoryApi.getMaterialStock(material.id, checkForm.value.warehouse_id);
    
    const quantity = stockResponse.data && stockResponse.data.quantity !== undefined
      ? parseFloat(stockResponse.data.quantity) 
      : 0;
    
    // 添加物料
    checkForm.value.items.push({
      material_id: material.id,
      material_code: material.code,
      material_name: material.name,
      specs: material.specs || '',
      book_qty: quantity,
      actual_qty: quantity,
      unit_name: material.unit_name || '',
      remarks: ''
    });
    
    showToast('物料已添加');
    showMaterialPicker.value = false;
  } catch (error) {
    console.error('获取物料库存失败:', error);
    showToast('获取物料库存失败');
  }
};

// 提交表单
const submitCheckForm = async () => {
  try {
    submitting.value = true;
    
    // 提交表单
    await inventoryApi.updateCheck(checkForm.value.id, checkForm.value);
    
    showToast('盘点单保存成功');
    router.push(`/inventory/check/${checkForm.value.id}`);
  } catch (error) {
    console.error('保存盘点单失败:', error);
    showToast('保存盘点单失败：' + (error.message || '未知错误'));
  } finally {
    submitting.value = false;
  }
};

// 加载盘点单详情
const loadCheckDetail = async () => {
  try {
    loading.value = true;
    const id = route.params.id;
    
    const response = await inventoryApi.getCheckDetail(id);
    
    if (response && response.data) {
      const checkData = response.data;
      
      // 填充表单数据
      checkForm.value.id = checkData.id;
      checkForm.value.check_no = checkData.check_no;
      checkForm.value.check_date = checkData.check_date;
      checkForm.value.check_type = checkData.check_type;
      checkForm.value.warehouse_id = checkData.warehouse_id;
      checkForm.value.warehouse = checkData.warehouse;
      checkForm.value.description = checkData.description || '';
      checkForm.value.remarks = checkData.remarks || '';
      
      // 填充物料明细
      if (checkData.items && checkData.items.length > 0) {
        checkForm.value.items = checkData.items.map(item => ({
          id: item.id,
          material_id: item.material_id,
          material_code: item.material_code,
          material_name: item.material_name,
          specs: item.specs || '',
          book_qty: parseFloat(item.book_qty) || 0,
          actual_qty: parseFloat(item.actual_qty) || 0,
          unit_name: item.unit_name || '',
          remarks: item.remarks || ''
        }));
      }
      
      // 只有草稿状态下可以编辑物料
      editableMaterials.value = checkData.status === 'draft';
      
      if (checkData.status !== 'draft') {
        showToast('非草稿状态下只能编辑实盘数量和备注');
      }
    } else {
      showToast('获取盘点单详情失败');
      router.push('/inventory/check');
    }
  } catch (error) {
    console.error('获取盘点单详情失败:', error);
    showToast('获取盘点单详情失败');
    router.push('/inventory/check');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadCheckDetail();
});
</script>

<style lang="scss" scoped>
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.loading-text {
  margin-top: $margin-sm;
  color: var(--text-secondary);
}

.material-list-container {
  margin-top: $margin-md;
}

.material-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 $padding-md $padding-sm;
}

.header-title {
  font-size: 14px;
  font-weight: bold;
}

.empty-tips {
  padding: $padding-lg 0;
}

.material-list {
  padding: 0 $padding-sm;
}

.material-card {
  background-color: white;
  border-radius: $border-radius-md;
  padding: $padding-md;
  margin-bottom: $margin-sm;
  box-shadow: none;
}

.material-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $margin-xs;
}

.material-code {
  font-size: 12px;
  color: var(--text-secondary);
}

.diff-quantity {
  font-weight: bold;
}

.material-name {
  font-weight: bold;
  margin-bottom: $margin-sm;
}

.material-quantities {
  display: flex;
  justify-content: space-between;
  margin-bottom: $margin-sm;
}

.qty-item {
  flex: 1;
  
  &:first-child {
    margin-right: $margin-md;
  }
}

.qty-label {
  display: block;
  font-size: 10px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.qty-value {
  color: var(--text-primary);
}

.qty-input {
  display: flex;
}

.material-remark {
  margin-top: $margin-sm;
}

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: $padding-md;
  background-color: white;
  box-shadow: none;
  z-index: 10;
}

.delete-button {
  height: 100%;
}

.material-picker {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.picker-header {
  padding: $padding-md;
  border-bottom: 1px solid var(--van-border-color);
}

.picker-title {
  font-size: 16px;
  font-weight: bold;
  text-align: center;
}

.picker-search {
  padding: $padding-sm;
}

.picker-content {
  flex: 1;
  overflow-y: auto;
}
</style> 