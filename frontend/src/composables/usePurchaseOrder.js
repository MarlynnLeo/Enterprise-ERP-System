/**
 * usePurchaseOrder.js
 * @description 采购订单组合式函数 - 统一业务逻辑处理
 * @date 2025-09-29
 * @version 1.0.0
 */

import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  formatOrderData,
  formatOrderDataList,
  handleApiError,
  validateOrderForm,
  calculateOrderTotal,
  getCountdownDisplay,
  debounce,
  StatusMapper
} from '@/utils/commonHelpers'
import { parsePaginatedData } from '@/utils/responseParser'
import { purchaseApi, supplierApi } from '@/services/api'

// 使用 StatusMapper 的 getStatusDisplay 方法
const getStatusDisplay = (status) => {
  return {
    text: StatusMapper.getText('purchase', status),
    type: StatusMapper.getType('purchase', status),
    color: '' // 颜色由 type 决定
  };
}

/**
 * 采购订单管理组合式函数
 * @param {Object} options - 配置选项
 * @returns {Object} 响应式数据和方法
 */
export const usePurchaseOrder = (options = {}) => {
  const {
    autoLoad = true,
    pageSize = 10
  } = options;

  // 响应式数据
  const loading = ref(false);
  const orders = ref([]);
  const currentOrder = ref(null);
  const suppliers = ref([]);
  
  // 搜索表单
  const searchForm = reactive({
    order_no: '',
    status: '',
    supplier_id: '',
    date_range: []
  });
  
  // 分页信息
  const pagination = reactive({
    current: 1,
    size: pageSize,
    total: 0
  });
  
  // 订单表单
  const orderForm = reactive({
    order_number: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    supplier_id: '',
    supplier_name: '',
    contact_person: '',
    contact_phone: '',
    notes: '',
    requisition_id: null,
    requisition_number: '',
    status: 'draft',
    items: []
  });
  
  // 计算属性
  const formattedOrders = computed(() => formatOrderDataList(orders.value));
  
  const orderTotal = computed(() => calculateOrderTotal(orderForm.items));
  
  const hasSelectedItems = computed(() => orderForm.items && orderForm.items.length > 0);
  
  // 防抖搜索
  const debouncedSearch = debounce(loadOrders, 300);
  
  /**
   * 加载订单列表
   */
  const loadOrders = async () => {
    loading.value = true;
    try {
      const params = {
        page: pagination.current,
        pageSize: pagination.size,
        ...searchForm
      };
      
      // 处理日期范围
      if (searchForm.date_range && searchForm.date_range.length === 2) {
        params.startDate = searchForm.date_range[0];
        params.endDate = searchForm.date_range[1];
      }
      
      const response = await purchaseApi.getOrders(params);

      // 使用统一解析器处理分页数据
      const { list, total } = parsePaginatedData(response, { enableLog: false });
      orders.value = list;
      pagination.total = total;
    } catch (error) {
      handleApiError(error, '加载订单列表');
      orders.value = [];
      pagination.total = 0;
    } finally {
      loading.value = false;
    }
  };
  
  /**
   * 搜索订单
   */
  const searchOrders = () => {
    pagination.current = 1;
    debouncedSearch();
  };
  
  /**
   * 重置搜索
   */
  const resetSearch = () => {
    Object.assign(searchForm, {
      order_no: '',
      status: '',
      supplier_id: '',
      date_range: []
    });
    pagination.current = 1;
    loadOrders();
  };
  
  /**
   * 分页改变
   */
  const handlePageChange = (page) => {
    pagination.current = page;
    loadOrders();
  };
  
  /**
   * 分页大小改变
   */
  const handleSizeChange = (size) => {
    pagination.size = size;
    pagination.current = 1;
    loadOrders();
  };
  
  /**
   * 加载供应商列表
   */
  const loadSuppliers = async () => {
    try {
      const response = await supplierApi.getSuppliers();
      if (response.success) {
        suppliers.value = response.data || [];
      }
    } catch (error) {
      handleApiError(error, '加载供应商列表');
    }
  };
  
  /**
   * 重置订单表单
   */
  const resetOrderForm = () => {
    // 计算三周后的日期
    const threeWeeksLater = new Date();
    threeWeeksLater.setDate(threeWeeksLater.getDate() + 21);
    
    Object.assign(orderForm, {
      order_number: '',
      order_date: new Date().toISOString().split('T')[0],
      expected_delivery_date: threeWeeksLater.toISOString().split('T')[0],
      supplier_id: '',
      supplier_name: '',
      contact_person: '',
      contact_phone: '',
      notes: '',
      requisition_id: null,
      requisition_number: '',
      status: 'draft',
      items: []
    });
  };
  
  /**
   * 加载订单详情
   */
  const loadOrderDetails = async (orderId) => {
    loading.value = true;
    try {
      const response = await purchaseApi.getOrder(orderId);
      if (response.success) {
        currentOrder.value = formatOrderData(response.data);
        return currentOrder.value;
      } else {
        throw new Error(response.message || '加载订单详情失败');
      }
    } catch (error) {
      handleApiError(error, '加载订单详情');
      return null;
    } finally {
      loading.value = false;
    }
  };
  
  /**
   * 提交订单表单
   */
  const submitOrderForm = async (isEdit = false) => {
    // 验证表单
    const validation = validateOrderForm(orderForm);
    if (!validation.valid) {
      ElMessage.error(validation.errors[0]);
      return { success: false, errors: validation.errors };
    }
    
    loading.value = true;
    try {
      const formData = {
        ...orderForm,
        total_amount: orderTotal.value
      };
      
      let response;
      if (isEdit && currentOrder.value) {
        response = await purchaseApi.updateOrder(currentOrder.value.id, formData);
      } else {
        response = await purchaseApi.createOrder(formData);
      }
      
      if (response.success) {
        ElMessage.success(isEdit ? '订单更新成功' : '订单创建成功');
        loadOrders(); // 重新加载列表
        return { success: true, data: response.data };
      } else {
        throw new Error(response.message || '提交订单失败');
      }
    } catch (error) {
      handleApiError(error, '提交订单');
      return { success: false, error: error.message };
    } finally {
      loading.value = false;
    }
  };
  
  /**
   * 删除订单
   */
  const deleteOrder = async (orderId, orderNo) => {
    try {
      await ElMessageBox.confirm(
        `确定要删除订单 ${orderNo} 吗？此操作不可撤销。`,
        '确认删除',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }
      );
      
      loading.value = true;
      const response = await purchaseApi.deleteOrder(orderId);
      
      if (response.success) {
        ElMessage.success('订单删除成功');
        loadOrders(); // 重新加载列表
        return { success: true };
      } else {
        throw new Error(response.message || '删除订单失败');
      }
    } catch (error) {
      if (error !== 'cancel') {
        handleApiError(error, '删除订单');
      }
      return { success: false };
    } finally {
      loading.value = false;
    }
  };
  
  /**
   * 更新订单状态
   */
  const updateOrderStatus = async (orderId, newStatus, orderNo) => {
    try {
      await ElMessageBox.confirm(
        `确定要将订单 ${orderNo} 的状态更新为 ${getStatusDisplay(newStatus).text} 吗？`,
        '确认状态更新',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }
      );
      
      loading.value = true;
      const response = await purchaseApi.updateOrderStatus(orderId, { status: newStatus });
      
      if (response.success) {
        ElMessage.success('状态更新成功');
        loadOrders(); // 重新加载列表
        return { success: true };
      } else {
        throw new Error(response.message || '状态更新失败');
      }
    } catch (error) {
      if (error !== 'cancel') {
        handleApiError(error, '状态更新');
      }
      return { success: false };
    } finally {
      loading.value = false;
    }
  };
  
  /**
   * 添加物料到订单
   */
  const addMaterialToOrder = (material) => {
    const existingIndex = orderForm.items.findIndex(
      item => item.material_id === material.material_id
    );
    
    if (existingIndex >= 0) {
      // 如果物料已存在，累加数量
      orderForm.items[existingIndex].quantity += material.quantity || 1;
      orderForm.items[existingIndex].total = 
        orderForm.items[existingIndex].quantity * orderForm.items[existingIndex].price;
    } else {
      // 添加新物料
      orderForm.items.push({
        ...formatOrderData(material),
        quantity: material.quantity || 1,
        total: (material.quantity || 1) * (material.price || 0)
      });
    }
  };
  
  /**
   * 从订单中移除物料
   */
  const removeMaterialFromOrder = (index) => {
    if (index >= 0 && index < orderForm.items.length) {
      orderForm.items.splice(index, 1);
    }
  };
  
  /**
   * 重新计算订单金额
   */
  const recalculateOrderTotal = () => {
    orderForm.items.forEach(item => {
      item.total = (item.quantity || 0) * (item.price || 0);
    });
  };
  
  // 初始化
  if (autoLoad) {
    loadOrders();
    loadSuppliers();
  }
  
  return {
    // 响应式数据
    loading,
    orders,
    currentOrder,
    suppliers,
    searchForm,
    pagination,
    orderForm,
    
    // 计算属性
    formattedOrders,
    orderTotal,
    hasSelectedItems,
    
    // 方法
    loadOrders,
    searchOrders,
    resetSearch,
    handlePageChange,
    handleSizeChange,
    loadSuppliers,
    resetOrderForm,
    loadOrderDetails,
    submitOrderForm,
    deleteOrder,
    updateOrderStatus,
    addMaterialToOrder,
    removeMaterialFromOrder,
    recalculateOrderTotal,
    
    // 工具方法
    getStatusDisplay,
    getCountdownDisplay,
    formatOrderData
  };
};

export default usePurchaseOrder;
