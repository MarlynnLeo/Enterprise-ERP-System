<!--
/**
 * ProductionPlan.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<script setup>
import dayjs from 'dayjs'
import { ref, onMounted, reactive, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { productionApi, purchaseApi, baseDataApi } from '@/services/api'
import { bomApi } from '@/api/bom'
import axios from '@/services/api'
import { Plus } from '@element-plus/icons-vue'
import { parseQuantity, formatQuantity } from '@/utils/helpers/quantity'
import { SEARCH_CONFIG, searchMaterials, mapMaterialData } from '@/utils/searchConfig'
import { useAuthStore } from '@/stores/auth'
import { parseListData } from '@/utils/responseParser'
import { useFormKeyboardNav } from '@/composables/useFormKeyboardNav'

// 权限store
const authStore = useAuthStore()
const router = useRouter()

// ✅ 键盘导航：Enter 跳转下一字段，最后一个字段按 Enter 自动提交
const { onFormKeydown: planFormKeydown } = useFormKeyboardNav(() => handleModalOk())

// 数据定义
const loading = ref(false)
const planList = ref([])
const productOptions = ref([])
const loadingProducts = ref(false)
const materialList = ref([])
const searchForm = ref({
  keyword: '',  // 合并的搜索关键词（计划编号/合同编码/产品）
  status: '',
  dateRange: []  // 时间范围
})

// 添加响应式分页对象
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})

// 表单相关
const modalVisible = ref(false)
const modalTitle = ref('新建生产计划')
const formRef = ref()
const formData = ref({
  code: '',
  name: '',
  startDate: null,
  endDate: null,
  productId: undefined,
  quantity: 1,
  bomId: null,
  contract_code: ''  // 合同编码
})

const isManualCode = ref(false)

// 生成计划编号 (调用后端API获取完整编号)
const generateCode = async () => {
  try {
    // 调用后端API获取今天的最大序号
    const response = await productionApi.getTodayMaxSequence()

    // 优先使用后端返回的完整编号
    if (response && response.data && response.data.fullCode) {
      return response.data.fullCode
    } else if (response && response.data && response.data.sequence) {
      // 兼容旧版本API，手动拼接
      const now = dayjs()
      const dateStr = now.format('YYMMDD')
      return `PP${dateStr}${response.data.sequence}`
    } else {
      // 如果API返回格式不对，生成默认001编号
      const now = dayjs()
      const dateStr = now.format('YYMMDD')
      return `PP${dateStr}001`
    }
  } catch (error) {
    console.error('生成计划编号失败:', error)
    // 出错时生成默认001编号
    const now = dayjs()
    const dateStr = now.format('YYMMDD')
    return `PP${dateStr}001`
  }
}

// 计划详情相关
const planDetailVisible = ref(false)
const planDetailLoading = ref(false)
const currentPlan = ref(null)

// 表单弹窗相关加载
const modalLoading = ref(false)

// 表单验证规则
const rules = {
  code: [{ required: true, message: '请输入计划编号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入计划名称', trigger: 'blur' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  endDate: [{ required: true, message: '请选择结束日期', trigger: 'change' }],
  productId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  quantity: [{ required: true, message: '请输入计划数量', trigger: 'change' }]
}

import { getProductionStatusText, getProductionStatusColor } from '@/constants/systemConstants'

// 获取状态样式
const getStatusType = (status) => {
  return getProductionStatusColor(status)
}

// 获取状态文本
const getStatusText = (status) => {
  return getProductionStatusText(status)
}

// 获取状态自定义样式类
const getStatusClass = (status) => {
  if (status === 'in_progress') return 'status-in-progress'
  if (status === 'inspection') return 'status-inspection'
  return ''
}

// 添加计划统计数据
const planStats = ref({
  total: 0,
  draft: 0,
  preparing: 0,
  materialIssued: 0,
  inProgress: 0,
  inspection: 0,
  warehousing: 0,
  completed: 0,
  cancelled: 0
});

// 搜索方法
const searchPlans = () => {
  pagination.currentPage = 1;
  fetchPlanList();
};

// 重置搜索方法
const resetSearch = () => {
  searchForm.value.keyword = '';
  searchForm.value.status = '';
  searchForm.value.dateRange = [];
  searchPlans();
};

// 处理分页大小变化
const handleSizeChange = (val) => {
  pagination.pageSize = val;
  pagination.currentPage = 1; // 重置到第一页
  fetchPlanList();
};

// 处理页码变化
const handleCurrentChange = (val) => {
  pagination.currentPage = val;
  fetchPlanList();
};

// 更新统计数据（从后端返回的数据中获取）
const updatePlanStats = (statistics) => {
  if (statistics) {
    planStats.value = {
      total: Number(statistics.total) || 0,
      draft: Number(statistics.draft) || 0,
      preparing: Number(statistics.preparing) || 0,
      materialIssued: Number(statistics.materialIssued) || 0,
      inProgress: Number(statistics.inProgress) || 0,
      inspection: Number(statistics.inspection) || 0,
      warehousing: Number(statistics.warehousing) || 0,
      completed: Number(statistics.completed) || 0,
      cancelled: Number(statistics.cancelled) || 0
    };
  }
};

// 格式化日期
// formatDate 已统一引用公共实现;

// 日期格式化
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
};

// 层级标签颜色 - L1蓝色, L2橙色, L3+紫色
const getLevelTagType = (level) => {
  const l = level || 1;
  if (l === 1) return 'primary';
  if (l === 2) return 'warning';
  return 'danger';
};

const getLevelTagStyle = (level) => {
  const l = level || 1;
  if (l === 2) return { backgroundColor: '#e6a23c', borderColor: '#e6a23c', color: '#fff' };
  if (l >= 3) return { backgroundColor: '#7c3aed', borderColor: '#7c3aed', color: '#fff' };
  return {};
};

// 通用工具函数：获取规格信息
const getSpecification = (item) => {
  if (!item) return '';
  return item.specs || item.specification || item.material_specs || item.spec || item.standard || '';
};

// 通用工具函数：设置规格信息到对象的所有可能字段
const setSpecification = (obj, specValue) => {
  if (!specValue || !obj) return obj;
  obj.specs = specValue;
  obj.specification = specValue;
  obj.material_specs = specValue;
  obj.spec = specValue;
  obj.standard = specValue;
  return obj;
};

// 通用工具函数：获取活跃的BOM
const fetchActiveBom = async (productId) => {
  try {
    // 使用 bomApi 查询BOM（不过滤status，只按product_id查询）
    const response = await bomApi.getBoms({
      productId: productId,
      pageSize: 10
    });

    const bomList = parseListData(response, { enableLog: false });

    if (bomList.length > 0) {
      // 优先选择已审核的BOM，如果没有则选择第一个
      const activeBom = bomList.find(bom => bom.approved || bom.approved_by) || bomList[0];
      return activeBom;
    }

    return null;
  } catch (error) {
    throw error;
  }
};

// 辅助函数：标准化物料数据
const standardizeMaterialData = (material, materialInfo = null) => {
  if (!material) {
    console.warn('物料对象为空，无法标准化');
    return {};
  }
  
  // 尝试从物料信息中获取规格
  let specs = '';
  if (materialInfo && materialInfo.specs) {
    specs = materialInfo.specs;
  }
  
  // 使用通用函数获取规格信息
  const specValue = specs || getSpecification(material);
  
  // 提取库存数量和需求数量，确保为数字类型
  const stockQty = parseQuantity(material.stock_quantity || material.stockQuantity || 0);
  const requiredQty = parseQuantity(material.required_quantity || material.requiredQuantity || 0);
  
  
  // 基础字段标准化
  const result = {
    ...material,
    // ID字段标准化 - 确保所有可能的ID字段都有值
    id: material.materialId || material.material_id || material.id,
    materialId: material.materialId || material.material_id || material.id,
    material_id: material.materialId || material.material_id || material.id,
    // 规格字段标准化 - 确保所有可能的规格字段都有相同的值
    specs: specValue,
    specification: specValue,
    material_specs: specValue,
    spec: specValue,
    standard: specValue,
    // 数量字段标准化 - 确保存储为数字类型
    required_quantity: requiredQty,
    requiredQuantity: requiredQty,
    stock_quantity: stockQty,
    stockQuantity: stockQty
  };
  
  
  return result;
};

// 获取生产计划列表 - 优化版本
const fetchPlanList = async (force = false) => {
  if (loading.value && !force) return // 防止重复请求，除非强制刷新

  loading.value = true

  try {
    const params = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize,
      keyword: searchForm.value.keyword,
      status: searchForm.value.status
    }

    // 添加时间范围参数
    if (searchForm.value.dateRange && searchForm.value.dateRange.length === 2) {
      params.startDate = searchForm.value.dateRange[0]
      params.endDate = searchForm.value.dateRange[1]
    }

    const response = await productionApi.getProductionPlans(params)

    // 使用统一解析器处理数据
    const plans = parseListData(response, { enableLog: false });

    // 处理计划列表数据
    planList.value = plans.map(plan => ({
      ...plan,
      productName: plan.productName || '未知产品',
      productCode: plan.product_code || '',
      specification: plan.specification || '',
      unit: plan.unit || ''
    }));

    // 设置分页总数，确保解析为整数
    pagination.total = Number(response.data?.total) || plans.length;

    // 更新统计数据（使用后端返回的统计信息）
    updatePlanStats(response.data?.statistics);

  } catch (error) {
    console.error('获取计划列表失败:', error)
    ElMessage.error('获取计划列表失败')

    // 确保即使出错也有默认值
    pagination.total = 0;
  } finally {
    loading.value = false
  }
}

// ===== 产品搜索相关函数 =====
// 防抖函数
import { debounce } from '@/utils/commonHelpers'

// 搜索产品状态记录
let currentSearchId = 0

// 搜索产品函数 - 使用统一搜索配置
const searchProducts = async (query) => {
  const searchId = ++currentSearchId; // 记录当前请求ID
  loadingProducts.value = true

  try {
    if (!query || query.trim().length < SEARCH_CONFIG.MIN_SEARCH_LENGTH) {
      // 搜索词太短时，从API加载默认产品列表
      try {
        const defaultResults = await searchMaterials(baseDataApi, '', {
          pageSize: 10,
          category: 'product',
          includeAll: true
        })
        if (searchId === currentSearchId) {
          productOptions.value = mapMaterialData(defaultResults)
        }
      } catch (e) {
        console.warn('加载默认产品列表失败:', e)
        if (searchId === currentSearchId) {
          productOptions.value = []
        }
      }
      return
    }

    const searchTerm = query.trim()

    // 使用统一的搜索函数
    const searchResults = await searchMaterials(baseDataApi, searchTerm, {
      pageSize: SEARCH_CONFIG.REMOTE_SEARCH_PAGE_SIZE,
      category: 'product',
      includeAll: true
    })

    // 仅当当前请求ID未被更新请求覆盖时，才更新结果
    if (searchId === currentSearchId) {
      // 映射搜索结果
      const mappedResults = mapMaterialData(searchResults)
      productOptions.value = mappedResults
    }

  } catch (error) {
    console.error('搜索产品失败:', error)
    if (searchId === currentSearchId) {
      productOptions.value = []
    }
  } finally {
    if (searchId === currentSearchId) {
      loadingProducts.value = false
    }
  }
}

// 带防抖的搜索产品函数
const debouncedSearchProducts = debounce(searchProducts, 300)

// 处理产品选择框焦点 - 取消默认搜索以避免性能问题和误查
const handleProductSelectFocus = () => {
  // 不再触发空搜索，避免大量无用数据并降低竞态可能
}

// 处理下拉框显示/隐藏
const handleSelectVisibleChange = (visible) => {
  // 不再触发空搜索
}

// 处理粘贴事件，针对复制粘贴偶尔不触发远程搜索的问题
const handlePasteSearch = (e) => {
  const pasteText = (e.clipboardData || window.clipboardData).getData('text')
  if (pasteText) {
    // 稍微延迟，以便与Element Plus内部事件协调
    setTimeout(() => {
      debouncedSearchProducts(pasteText)
    }, 50)
  }
}

// 处理计划数量输入（限制为最多5位正整数）
const handleQuantityInput = (val) => {
  if (val === null || val === undefined) return
  const numStr = String(val).replace(/[^0-9]/g, '').slice(0, 5)
  formData.value.quantity = numStr === '' ? '' : Number(numStr)
}

// 计算物料需求
const calculateMaterials = async () => {
  if (!formData.value?.productId || !formData.value?.quantity) {
    ElMessage.warning('请先选择产品并输入数量')
    return
  }

  const selectedProduct = productOptions.value.find(p => p.id === formData.value.productId)

  if (!formData.value.bomId) {
    ElMessage.warning('未找到有效的BOM，请确保产品已关联BOM')
    return
  }

  try {
    modalLoading.value = true
    
    // 1. 先获取BOM详情，包含规格信息
    const bomDetailResponse = await axios.get(`/baseData/boms/${formData.value.bomId}`);
    // 2. 计算物料需求（已包含智能分析）
    const response = await axios.post('/production/calculate-materials', {
      productId: formData.value.productId,
      bomId: formData.value.bomId,
      quantity: formData.value.quantity
    })
    
    if (Array.isArray(response.data)) {
      let materials = response.data;
      // 从BOM详情中提取物料规格信息
      const bomDetails = bomDetailResponse.data?.details || [];

      // 创建物料编码到规格的映射
      const bomMaterialSpecMap = {};
      if (bomDetails.length > 0) {
        bomDetails.forEach(detail => {
          if (detail.material_code && detail.specification) {
            bomMaterialSpecMap[detail.material_code] = detail.specification;
            }
        });
      }
      
      // 获取物料ID列表
      const materialIds = materials
        .filter(mat => mat.materialId || mat.id)
        .map(mat => mat.materialId || mat.id);
      
      if (materialIds.length > 0) {
        try {
          // 批量获取物料信息以获取规格
          const materialsResponse = await axios.get('/baseData/materials', {
            params: { ids: materialIds.join(',') }
          });

          // 创建物料ID映射
          const materialsMap = {};
          const materialsData = parseListData(materialsResponse, { enableLog: false });

          // 构建映射
          materialsData.forEach(mat => {
            if (mat.id) {
              materialsMap[mat.id] = mat;
            }
          });
          
          // 更新物料的规格信息 - 优化版本
          for (const mat of materials) {
            const materialId = mat.materialId || mat.id;
            const materialCode = mat.code || mat.material_code;
            
            // 1. 首先尝试从BOM详情中获取规格信息
            if (materialCode && bomMaterialSpecMap[materialCode]) {
              setSpecification(mat, bomMaterialSpecMap[materialCode]);
              continue;
            }
            
            // 2. 尝试从物料映射中获取规格
            if (materialId && materialsMap[materialId]) {
              const materialInfo = materialsMap[materialId];
              const specValue = getSpecification(materialInfo) || getSpecification(mat);
              if (specValue) {
                setSpecification(mat, specValue);
                continue;
              }
            }
            
            // 3. 使用已有的规格信息
            const existingSpec = getSpecification(mat);
            if (existingSpec) {
              setSpecification(mat, existingSpec);
              continue;
            }
            
            // 4. 设置为空字符串
            setSpecification(mat, '');
          }
          
          // 然后处理其他属性，保持智能分析的结果
          materials = materials.map(mat => {
            const materialId = mat.materialId || mat.id;
            let materialInfo = materialId && materialsMap[materialId] ? materialsMap[materialId] : null;

            return standardizeMaterialData(mat, materialInfo);
          });
          
          } catch (error) {
          console.error('获取物料规格信息失败:', error);
        }
      }
      
      materialList.value = materials;
    } else {
      materialList.value = []
      console.warn('物料需求计算返回的不是数组:', response.data)
    }
  } catch (error) {
    console.error('计算物料需求失败:', error)
    ElMessage.error('计算物料需求失败: ' + (error.response?.data?.message || error.message))
    materialList.value = []
  } finally {
    modalLoading.value = false
  }
}

// 在script部分，改进申请状态跟踪对象，添加localStorage持久化
const purchaseRequestStatus = ref({});

// 添加localStorage存取函数
const savePurchaseRequestStatus = () => {
  try {
    const planId = currentPlan.value?.id;
    if (planId) {
      localStorage.setItem(`purchaseRequestStatus_${planId}`, JSON.stringify(purchaseRequestStatus.value));
      }
  } catch (e) {
    console.error('保存采购申请状态失败:', e);
  }
};

const loadPurchaseRequestStatus = (planId) => {
  try {
    if (planId) {
      const savedStatus = localStorage.getItem(`purchaseRequestStatus_${planId}`);
      if (savedStatus) {
        purchaseRequestStatus.value = JSON.parse(savedStatus);
        } else {
        purchaseRequestStatus.value = {};
      }
    } else {
      purchaseRequestStatus.value = {};
    }
  } catch (e) {
    console.error('加载采购申请状态失败:', e);
    purchaseRequestStatus.value = {};
  }
};

// 查看计划详情 - 优化版本
const viewPlanDetail = async (row) => {
  planDetailVisible.value = true;
  planDetailLoading.value = true;
  try {
    // 性能监控
    const startTime = performance.now();

    // 使用现有API获取计划详情
    const response = await productionApi.getProductionPlan(row.id);

    // 创建当前计划对象的副本以避免引用原始对象
    currentPlan.value = JSON.parse(JSON.stringify(response.data));

    // 加载该计划的采购申请状态（异步，不阻塞弹窗显示）
    loadPurchaseRequestStatus(row.id);
    
    // 简化产品名称设置
    currentPlan.value.productName = row.productName || currentPlan.value.product_name || '未知产品';

    // 简化规格设置
    currentPlan.value.specification = currentPlan.value.specification || currentPlan.value.specs || '';
    
    // 如果物料需求为空，尝试从BOM计算物料需求
    if (!currentPlan.value.materials || currentPlan.value.materials.length === 0) {
      try {
        const bom = await fetchActiveBom(currentPlan.value.product_id || row.product_id);
        if (bom) {
          const calcResponse = await axios.get(`/production/calculate-materials/${bom.id}`, {
            params: { quantity: currentPlan.value.quantity || 1 }
          });
          
          if (calcResponse.data?.materials && calcResponse.data.materials.length > 0) {
            currentPlan.value.materials = calcResponse.data.materials;
          }
        }
      } catch (error) {
        console.error('计算物料需求失败:', error);
        // 继续执行，不阻塞详情显示
      }
    }
    
    // 获取智能物料需求分析数据
    if (currentPlan.value.materials && currentPlan.value.materials.length > 0) {
      // 如果计划已完成，使用简单格式化
      if (currentPlan.value.status === 'completed') {
        currentPlan.value.materials = currentPlan.value.materials.map(material => {
          const reqQty = material.requiredQuantity || material.required_quantity || 0;
          const stockQty = material.stockQuantity || material.stock_quantity || 0;
          return {
            ...formatMaterialForDisplay(material),
            stockStatus: stockQty >= reqQty ? 'sufficient' : 'shortage'
          };
        });
      } else {
        // 对于未完成的计划，使用智能分析API获取准确的物料状态
        try {
          const materialsResponse = await axios.get(`/production/plans/${row.id}/materials`);
          if (materialsResponse.data && materialsResponse.data.length > 0) {
            currentPlan.value.materials = materialsResponse.data.map(material => {
              const reqQty = material.requiredQuantity || material.required_quantity || 0;
              const stockQty = material.stockQuantity || material.stock_quantity || 0;
              return {
                ...formatMaterialForDisplay(material),
                substitutionInfo: material.substitutionInfo,
                availableQuantity: material.availableQuantity,
                stockStatus: stockQty >= reqQty ? 'sufficient' : 'shortage'
              };
            });
          }
        } catch (materialError) {
          console.error('获取智能物料分析失败:', materialError);
          // 降级到简单格式化
          currentPlan.value.materials = currentPlan.value.materials.map(material => {
            const reqQty = material.requiredQuantity || material.required_quantity || 0;
            const stockQty = material.stockQuantity || material.stock_quantity || 0;
            return {
              ...formatMaterialForDisplay(material),
              stockStatus: stockQty >= reqQty ? 'sufficient' : 'shortage'
            };
          });
        }
      }
    }

  } catch (error) {
    console.error('获取计划详情失败:', error);
    ElMessage.error('获取计划详情失败');
  } finally {
    planDetailLoading.value = false;
  }
};

// 事件处理函数

const handleExport = async () => {
  try {
    const response = await productionApi.exportProductionData(searchForm.value)
    // 处理文件下载
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', '生产计划数据.xlsx')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

const showCreateModal = async () => {
  modalTitle.value = '新建生产计划'
  formData.value = {
    code: await generateCode(),
    name: '',
    startDate: null,
    endDate: null,
    productId: undefined,
    quantity: 1,
    bomId: null,
    contract_code: ''
  }
  isManualCode.value = false
  materialList.value = []
  modalVisible.value = true
}

const handleProductChange = async () => {
  // 从搜索选项中查找选中的产品
  const selectedProduct = productOptions.value.find(p => p.id === formData.value.productId)

  if (!selectedProduct) {
    formData.value.bomId = null
    materialList.value = []
    return
  }

  // 给用户反馈选择的产品
  ElMessage.success(`已选择产品: ${selectedProduct.code} - ${selectedProduct.name}`)

  // ✅ 审计修复: 自动生成计划名称（仅在名称为空时，不覆盖用户输入）
  if (!formData.value.name) {
    const today = dayjs().format('YYYYMMDD')
    formData.value.name = `${selectedProduct.name}_${today}`
  }

  try {
    modalLoading.value = true

    // 直接查询BOM API检查是否存在BOM（不过滤status，只按product_id查询）
    const bomResponse = await bomApi.getBoms({
      productId: selectedProduct.id,  // 使用 productId 而不是 product_id
      pageSize: 10
    })

    const bomList = parseListData(bomResponse, { enableLog: false });

    if (bomList.length > 0) {
      // 优先选择已审核的BOM，如果没有则选择第一个
      const activeBom = bomList.find(bom => bom.approved || bom.approved_by) || bomList[0]
      formData.value.bomId = activeBom.id
      
      // 获取产品规格信息
      let specification = selectedProduct.specification || selectedProduct.specs || '';

      // 如果产品对象中没有规格信息，尝试从API获取
      if (!specification) {
        try {
          const materialResponse = await baseDataApi.getMaterials({
            id: selectedProduct.id
          })
          const materialData = parseListData(materialResponse, { enableLog: false });

          if (materialData.length > 0) {
            const material = materialData[0];
            specification = getSpecification(material);
            if (specification) {
              selectedProduct.specification = specification;
            }
          }
        } catch (error) {
          console.warn('获取产品规格失败:', error)
        }
      }
      
      // 如果仍然没有获取到规格，尝试直接从API获取
      if (!specification) {
        try {
          const productDetailResponse = await axios.get(`/baseData/materials/${selectedProduct.id}`);
          if (productDetailResponse.data) {
            const productDetail = productDetailResponse.data;
            specification = productDetail.specs || productDetail.specification || productDetail.material_specs || productDetail.spec || productDetail.standard || '';
            if (specification) {
              selectedProduct.specification = specification;
            }
          }
        } catch (error) {
          console.error('获取产品规格详情失败:', error);
        }
      }
      
      // 计算物料需求
      await calculateMaterials()
    } else {
      ElMessage({
        message: `产品 ${selectedProduct.code} 没有关联的BOM，请先在BOM管理中创建BOM`,
        type: 'warning',
        duration: 5000
      })
      formData.value.bomId = null
      materialList.value = []
      return
    }
  } catch (error) {
    console.error('处理产品选择失败:', error)
    ElMessage.error('获取产品BOM失败')
    formData.value.bomId = null
    materialList.value = []
  } finally {
    modalLoading.value = false
  }
}

const handleModalOk = async () => {
  if (!formData.value) return

  try {
    modalLoading.value = true
    const { name, startDate, endDate, productId, quantity } = formData.value

    // 新建计划时检查是否选择了产品和BOM
    if (modalTitle.value === '新建生产计划') {
      if (!productId) {
        ElMessage.warning('请选择产品')
        modalLoading.value = false
        return
      }
      
      if (!formData.value.bomId) {
        ElMessage({
          message: '所选产品没有关联的BOM配置，无法创建生产计划。请先在"基础数据 > BOM管理"中为该产品创建BOM。',
          type: 'error',
          duration: 8000,
          showClose: true
        })
        modalLoading.value = false
        return
      }
    }

    // 格式化日期为 YYYY-MM-DD 格式
    const start_date = startDate ? (typeof startDate === 'object' && startDate.format ? startDate.format('YYYY-MM-DD') : dayjs(startDate).format('YYYY-MM-DD')) : null
    const end_date = endDate ? (typeof endDate === 'object' && endDate.format ? endDate.format('YYYY-MM-DD') : dayjs(endDate).format('YYYY-MM-DD')) : null

    // 基础数据对象
    const data = {
      name,
      start_date,
      end_date,
      productId,
      quantity,
      bomId: formData.value.bomId,
      contract_code: formData.value.contract_code || null
    }

    // 如果是新建模式，且code不为空且不是临时预览编号，才添加code字段
    // 临时预览编号（包含'xxx'或'自动生成'）不提交，让后端自动生成真实编号
    if (modalTitle.value === '新建生产计划' && formData.value.code &&
        !formData.value.code.includes('xxx') && !formData.value.code.includes('自动生成')) {
      data.code = formData.value.code
    }
    // 否则不传code字段，后端会自动生成PP开头的准确编号

    if (modalTitle.value === '编辑生产计划') {
      // 编辑现有计划
      const planId = formData.value.id
      await axios.put(`/production/plans/${planId}`, data)
      ElMessage.success('生产计划更新成功')
        } else {
      // 创建新计划
      await productionApi.createProductionPlan(data)
      ElMessage.success('生产计划创建成功')
    }

    modalVisible.value = false

    // 重置loading状态，然后强制刷新列表
    modalLoading.value = false
    await fetchPlanList(true)
        } catch (error) {
    console.error('保存生产计划失败:', error)
    console.error('错误详情:', error.response?.data)
    
    // 获取详细的错误信息
    const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || '未知错误'
    
    ElMessage.error({
      message: `保存生产计划失败: ${errorMessage}`,
      duration: 5000,
      showClose: true
    })
    
    modalLoading.value = false
  }
}

const handleModalCancel = () => {
  modalVisible.value = false
}

const handleEdit = async (row) => {
  modalTitle.value = '编辑生产计划'
  formData.value = {
    ...row,
    code: row.code,
    startDate: row.start_date ? row.start_date : null,
    endDate: row.end_date ? row.end_date : null,
    productId: row.product_id,
    bomId: null,
    contract_code: row.contract_code || ''
  }

  // 编辑模式下锁定编号，不允许修改
  isManualCode.value = true

  // 立即清空物料列表，避免显示上次的数据
  materialList.value = []

  // 将当前产品添加到选项列表中，以便el-select能够显示产品编码和名称
  if (row.product_id) {
    productOptions.value = [{
      id: row.product_id,
      code: row.productCode || row.product_code || '',
      name: row.productName || row.product_name || '',
      specification: row.specification || row.specs || '',
      hasBom: true
    }]
  }

  // 先显示对话框，然后异步加载BOM和物料信息
  modalVisible.value = true

  // 异步获取产品的活跃 BOM，不阻塞对话框显示
  // 使用 nextTick 确保对话框已经渲染
  nextTick(async () => {
    try {
      modalLoading.value = true
      const bom = await fetchActiveBom(row.product_id)

      if (bom) {
        formData.value.bomId = bom.id
        // 计算物料需求
        try {
          await calculateMaterials()
        } catch (error) {
          console.error('计算物料需求失败:', error)
          ElMessage.error('计算物料需求失败')
        }
      } else {
        ElMessage.warning('未找到该产品的活跃BOM，请确保产品已关联并激活BOM')
        materialList.value = []
      }
    } catch (error) {
      console.error('获取BOM失败:', error)
      ElMessage.error('获取产品BOM失败')
      materialList.value = []
    } finally {
      modalLoading.value = false
    }
  })
}

const handleDelete = async (row) => {
  try {
    await productionApi.deleteProductionPlan(row.id)
    ElMessage.success('删除成功')
    await fetchPlanList(true)
  } catch (error) {
    ElMessage.error('删除失败')
  }
}

const handleStatusChange = async (row, targetStatus) => {
  const statusNames = {
    'draft': '草稿', 'preparing': '备料中', 'material_issued': '已发料',
    'in_progress': '生产中', 'inspection': '待检验', 'warehousing': '待入库',
    'completed': '已完成', 'cancelled': '已取消'
  }
  try {
    await axios.put(`/production/plans/${row.id}/status`, { status: targetStatus })
    ElMessage.success(`状态已变更为「${statusNames[targetStatus]}」`)
    await fetchPlanList(true)
  } catch (error) {
    const msg = error.response?.data?.message || error.message || '状态变更失败'
    ElMessage.error(msg)
  }
}

const handleCancelPlan = async (row) => {
  try {
    await axios.put(`/production/plans/${row.id}/status`, { status: 'cancelled' })
    ElMessage.success('生产计划已取消')
    await fetchPlanList(true)
  } catch (error) {
    const msg = error.response?.data?.message || error.message || '取消失败'
    ElMessage.error(msg)
  }
}

// 下推对话框相关
const pushDownDialogVisible = ref(false);
const pushDownPlan = ref(null);
const pushDownQuantity = ref(null);
const pushDownType = ref('full'); // 'full' 或 'partial'

// 下推生成生产任务
const handlePushDown = async (row) => {
  pushDownPlan.value = row;
  pushDownQuantity.value = row.quantity;
  pushDownType.value = 'full';
  pushDownDialogVisible.value = true;
};

// 确认下推
const confirmPushDown = async () => {
  try {
    const row = pushDownPlan.value;
    const remainingQuantity = (row.quantity || 0) - (row.pushed_quantity || 0);
    
    // 检查剩余数量
    if (remainingQuantity <= 0) {
      ElMessage.warning('该计划已全部下推完成');
      return;
    }
    
    // 验证部分下推时的数量
    if (pushDownType.value === 'partial') {
      if (!pushDownQuantity.value || pushDownQuantity.value <= 0) {
        ElMessage.warning('请输入有效的下推数量');
        return;
      }
      if (pushDownQuantity.value > remainingQuantity) {
        ElMessage.warning(`下推数量不能超过剩余数量${remainingQuantity}`);
        return;
      }
    }
    
    pushDownDialogVisible.value = false;
    loading.value = true;

    // 确定下推数量（全部下推时使用剩余数量）
    const taskQuantity = pushDownType.value === 'full' ? remainingQuantity : pushDownQuantity.value;

    // 获取产品关联的物料生产组
    let productionGroupName = '未分配';
    try {
      // 获取产品详情（产品数据存储在materials表中）
      const productResponse = await axios.get(`/baseData/materials/${row.product_id}`);
      const product = productResponse.data;

      // 产品本身就是物料，直接使用其production_group_id
      if (product && product.production_group_id) {
        // 获取生产组（部门）信息
        const deptResponse = await axios.get('/system/departments');
        const departments = parseListData(deptResponse, { enableLog: false });

        // 找到对应的生产组
        const productionGroup = departments.find(dept => dept.id === product.production_group_id);

        if (productionGroup) {
          productionGroupName = productionGroup.name;
        }
      }
    } catch (error) {
      // 如果获取失败，使用默认值
    }

    // 1. 生成生产任务
    const taskData = {
      plan_id: row.id,
      product_id: row.product_id,
      quantity: taskQuantity,
      start_date: row.start_date || dayjs().format('YYYY-MM-DD'),
      expected_end_date: row.end_date || dayjs().add(7, 'day').format('YYYY-MM-DD'),
      manager: productionGroupName,
      remarks: pushDownType.value === 'full'
        ? `由生产计划 ${row.code} 全部下推`
        : `由生产计划 ${row.code} 部分下推（${taskQuantity}/${row.quantity}）`
    };

    // 2. 调用API创建生产任务
    const response = await productionApi.createProductionTask(taskData);

    // 拦截器已解包，response.data 就是业务数据
    // 如果业务失败，拦截器会抛出错误
    // 3. 更新生产计划的已下推数量
    try {
      await productionApi.updateProductionPlan(row.id, {
        pushed_quantity: (row.pushed_quantity || 0) + taskQuantity
      });
    } catch (updateError) {
      console.error('更新已下推数量失败:', updateError);
    }

    // 4. 不再直接更新生产计划状态，让后端根据任务状态自动同步
    // 生产计划状态会根据任务状态自动更新：
    // - 当有任务在分配中时 → 计划状态为"preparing"
    // - 当有任务在生产中时 → 计划状态为"in_progress"
    // - 当所有任务都已发料时 → 计划状态为"material_issued"
    const newRemaining = remainingQuantity - taskQuantity;
    const taskCode = response.data?.code || '';
    const message = pushDownType.value === 'full'
      ? `生产任务 ${taskCode} 生成成功（全部下推）`
      : `生产任务 ${taskCode} 生成成功（下推 ${taskQuantity}，剩余 ${newRemaining}）`;

    // ✅ 审计修复: 下推成功后提供跳转链接
    loading.value = false;
    await fetchPlanList(true);

    try {
      await ElMessageBox.confirm(
        `${message}\n\n是否跳转到生产任务页面查看?`,
        '下推成功',
        {
          confirmButtonText: '查看任务',
          cancelButtonText: '留在当前页',
          type: 'success',
        }
      )
      router.push('/production/task')
    } catch {
      // 用户选择留在当前页
    }

  } catch (error) {
    console.error('下推生成生产任务失败:', error);
    ElMessage.error('下推失败: ' + (error.response?.data?.message || error.message || '未知错误'));
    loading.value = false;
  }
};

// 更新结束日期
const updateEndDate = () => {
  if (formData.value.startDate) {
    // 确保startDate是日期对象
    const startDate = typeof formData.value.startDate === 'string' 
      ? dayjs(formData.value.startDate) 
      : dayjs(formData.value.startDate);
    
    // 设置结束日期为开始日期后的4周
    formData.value.endDate = startDate.add(4, 'week').toDate();
  }
}

// 禁用开始日期之前的日期
const disableBeforeStartDate = (time) => {
  if (!formData.value.startDate) {
    return false
  }
  // 确保startDate是日期对象
  const startDate = typeof formData.value.startDate === 'string' 
    ? dayjs(formData.value.startDate) 
    : dayjs(formData.value.startDate);
  
  return dayjs(time).isBefore(startDate, 'day')
}

// 创建物料规格缓存
const materialSpecCache = ref({});

// 通用的获取物料规格函数
const getMaterialSpecification = async (materialId, materialCode) => {
  try {
    // 先检查缓存
    if (materialId && materialSpecCache.value[`id_${materialId}`]) {
      return materialSpecCache.value[`id_${materialId}`];
    }
    
    if (materialCode && materialSpecCache.value[`code_${materialCode}`]) {
      return materialSpecCache.value[`code_${materialCode}`];
    }
    
    // 根据ID查询
    if (materialId) {
      try {
        const response = await axios.get(`/baseData/materials/${materialId}`);
        if (response.data) {
          const material = response.data;
          const specValue = getSpecification(material);
          if (specValue) {
            // 保存到缓存
            materialSpecCache.value[`id_${materialId}`] = specValue;
            if (material.code) {
              materialSpecCache.value[`code_${material.code}`] = specValue;
            }
            return specValue;
          }
        }
      } catch (err) {
        console.error(`通过ID ${materialId} 获取规格失败:`, err);
      }
    }
    
    // 根据编码查询
    if (materialCode) {
      try {
        const response = await axios.get('/baseData/materials', {
          params: { code: materialCode }
        });

        // 拦截器已解包，response.data 就是业务数据
        const materialsData = response.data?.list || response.data || [];
        if (Array.isArray(materialsData) && materialsData.length > 0) {
          const material = materialsData[0];
          const specValue = getSpecification(material);
          if (specValue) {
            // 保存到缓存
            materialSpecCache.value[`code_${materialCode}`] = specValue;
            if (material.id) {
              materialSpecCache.value[`id_${material.id}`] = specValue;
            }
            return specValue;
          }
        }
      } catch (err) {
        console.error(`通过编码 ${materialCode} 获取规格失败:`, err);
      }
    }

    return '';
  } catch (err) {
    console.error('获取物料规格失败:', err);
    return '';
  }
};

// 预加载物料规格信息
const preloadMaterialSpecs = async () => {
  try {

    const response = await axios.get('/baseData/materials', {
      params: { page: 1, pageSize: 100 }
    });

    // 拦截器已解包，response.data 就是业务数据
    const materialsData = response.data?.list || response.data || [];
    if (Array.isArray(materialsData)) {
      const materials = materialsData;
      
      materials.forEach(material => {
        if (material.id && (material.specs || material.specification)) {
          const specValue = getSpecification(material);
          if (specValue) {
            materialSpecCache.value[`id_${material.id}`] = specValue;
            if (material.code) {
              materialSpecCache.value[`code_${material.code}`] = specValue;
            }
          }
        }
      });
      
      
    }
  } catch (err) {
    console.error('预加载物料规格信息失败:', err);
  }
};

// 生命周期钩子
onMounted(() => {
  
  // 确保分页参数有默认值
  pagination.currentPage = 1;
  pagination.pageSize = 10;
  pagination.total = 0;
  
  // 预加载物料规格信息
  preloadMaterialSpecs();
  
  fetchPlanList();
});

// 智能采购申请处理函数
const handleCreatePurchaseRequest = async (material) => {
  // 修复：正确获取物料ID，包括materialId字段
  const materialId = material.materialId || material.material_id || material.id;
  const materialName = material.name || material.material_name || '未知物料';
  const materialCode = material.code || material.material_code || '';

  // 检查是否有缺料的子物料需要采购
  if (material.substitutionInfo && material.substitutionInfo.missingMaterials && material.substitutionInfo.missingMaterials.length > 0) {
    // 有缺料的子物料，应该采购子物料而不是父物料

    for (const missingMaterial of material.substitutionInfo.missingMaterials) {
      await createPurchaseRequestForMaterial({
        materialId: missingMaterial.materialId,
        code: missingMaterial.code,
        name: missingMaterial.name,
        stockQuantity: missingMaterial.stockQuantity,
        requiredQuantity: missingMaterial.requiredQuantity,
        shortage: missingMaterial.shortage
      });
    }
    return;
  }

  // 如果该物料已申请，阻止重复操作
  if (getMaterialRequestStatus(material)) {
    ElMessage.warning(`物料 [${materialCode}] ${materialName} 已申请采购，请勿重复操作`);
    return;
  }

  // 没有子物料缺料，直接采购当前物料
  await createPurchaseRequestForMaterial(material);
};

// 为具体物料创建采购申请的函数
const createPurchaseRequestForMaterial = async (material) => {
  const materialId = material.materialId || material.material_id || material.id;
  const materialName = material.name || material.material_name || '未知物料';
  const materialCode = material.code || material.material_code || '';
  const specification = getSpecification(material);
  const unit = material.unit_name || material.unit || '';
  const unitId = material.unit_id || null;
  const stockQty = parseQuantity(material.stock_quantity || material.stockQuantity || 0);
  const requiredQty = parseQuantity(material.required_quantity || material.requiredQuantity || material.shortage || 0);

  if (getMaterialRequestStatus(material)) {
    ElMessage.warning(`物料 [${materialCode}] ${materialName} 已申请采购，请勿重复操作`);
    return;
  }

  try {
    modalLoading.value = true;

    // 先获取物料详情，包括最小库存信息
    let minStock = 0;
    try {
      const materialDetailResponse = await axios.get(`/baseData/materials/${materialId}`);
      // 使用统一解析方式获取物料数据
      const materialData = materialDetailResponse.data?.data || materialDetailResponse.data;
      if (materialData && typeof materialData.min_stock !== 'undefined') {
        minStock = parseQuantity(materialData.min_stock);
      } else {
        console.warn(`未找到物料 [${materialCode}] 的最小库存值，使用默认值0`);
      }
    } catch (detailError) {
      console.error('获取物料详情失败:', detailError);
      ElMessage.warning(`无法获取物料 [${materialCode}] 的详细信息，将使用默认最小库存0`);
    }
    
    // 计算需要采购的数量：
    // 1. 首先满足生产需求的不足量
    // 2. 如果库存低于最小库存，补充到最小库存
    let needQty = requiredQty - stockQty > 0 ? requiredQty - stockQty : 0;
    
    // 如果当前库存量加上已确定的采购量仍然低于最小库存，增加采购量
    if ((stockQty + needQty) < minStock) {
      const additionalQty = minStock - (stockQty + needQty);
      needQty += additionalQty;
      }
    
    // 如果没有需要采购的数量，给出提示
    if (needQty <= 0) {
      ElMessage.info(`物料 [${materialCode}] ${materialName} 当前库存充足，无需创建采购`);
      return;
    }
    
    // 准备采购申请数据
    const requestData = {
      requestDate: new Date().toISOString().split('T')[0],
      remarks: `从生产计划${currentPlan.value?.code || ''}自动生成的采购申请，考虑最小库存${minStock}`,
      materials: [
        {
          materialId,
          materialCode,
          materialName,
          specification,
          unit,
          unitId,
          quantity: needQty
        }
      ]
    };
    
    try {
      // 直接创建采购申请
      const response = await purchaseApi.createRequisition(requestData);
      
      ElMessage.success(`已成功创建采购申请: ${response.requisition_number || '采购'}`);
      // 更新申请状态
      purchaseRequestStatus.value[materialId] = {
        requested: true,
        requestTime: new Date(),
        requestNumber: response.requisition_number || null
      };
      // 保存状态到localStorage
      savePurchaseRequestStatus();
    } catch (apiError) {
      console.error('采购申请API错误:', apiError);
      
      // 检查是否是主键重复错误
      if (apiError.response && 
          apiError.response.data && 
          (apiError.response.data.sqlMessage?.includes('Duplicate entry') || 
           apiError.response.data.error?.includes('Duplicate entry') ||
           apiError.response.data.code === 'ER_DUP_ENTRY')) {
        
        // 这是重复申请，可能是多次点击或者已有申请
        ElMessage.info(`物料 [${materialCode}] ${materialName} 的采购申请已经存在，无需重复申请`);
        
        // 标记为已申请
        purchaseRequestStatus.value[materialId] = {
          requested: true,
          requestTime: new Date(),
          requestNumber: '已存在申请'
        };
        // 保存状态到localStorage
        savePurchaseRequestStatus();
        return;
      }
      
      // 其他错误
      throw apiError;
    }
    
  } catch (error) {
    console.error('创建采购申请失败:', error);
    ElMessage.error('创建采购申请失败: ' + (error.response?.data?.message || error.message));
  } finally {
    modalLoading.value = false;
  }
};

// 在script部分添加一个安全的状态获取函数
const getMaterialRequestStatus = (material) => {
  if (!material) return false;

  // 修复：正确获取物料ID，包括materialId字段
  const materialId = material.materialId || material.material_id || material.id;

  // 如果ID不存在，返回false
  if (!materialId) return false;

  // 返回该ID的申请状态，确保返回布尔值
  return Boolean(purchaseRequestStatus.value && purchaseRequestStatus.value[materialId]);
};

// 判断是否应该显示采购按钮
const shouldShowPurchaseButton = (material) => {
  // 如果物料库存不足，显示采购按钮
  const stockQty = parseQuantity(material.stock_quantity || material.stockQuantity || 0);
  const requiredQty = parseQuantity(material.required_quantity || material.requiredQuantity || 0);

  if (stockQty < requiredQty) {
    return true;
  }

  // 如果有缺料的子物料，也显示采购按钮
  if (material.substitutionInfo && material.substitutionInfo.missingMaterials && material.substitutionInfo.missingMaterials.length > 0) {
    return true;
  }

  return false;
};

// 获取采购按钮的文本
const getPurchaseButtonText = (material) => {
  // 如果有缺料的子物料，显示"采购子料"
  if (material.substitutionInfo && material.substitutionInfo.missingMaterials && material.substitutionInfo.missingMaterials.length > 0) {
    return '采购子料';
  }

  return '采购';
};

// 通用函数：格式化物料显示数据
const formatMaterialForDisplay = (material) => {
  return {
    ...material,
    name: material.name || material.material_name || '未知物料',
    code: material.code || material.material_code || '',
    specs: getSpecification(material),
    specification: getSpecification(material),
    unit: material.unit || material.unit_name || ''
  };
};

</script>

<template>
  <div class="production-plan-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>生产计划管理</h2>
          <p class="subtitle">统筹产能排期与物料协调</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="showCreateModal" v-permission="'production:plans:create'">新建生产计划</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="查询">
          <el-input
            v-model="searchForm.keyword"
            placeholder="计划编号/合同编码/产品"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"

            clearable
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="状态" clearable>
            <el-option label="草稿" value="draft" />
            <el-option label="备料中" value="preparing" />
            <el-option label="已发料" value="material_issued" />
            <el-option label="生产中" value="in_progress" />
            <el-option label="待检验" value="inspection" />
            <el-option label="待入库" value="warehousing" />
            <el-option label="已完成" value="completed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchPlans" v-permission="'production:plans:view'">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
          <el-button type="success" @click="handleExport" v-permission="'production:plans:export'">
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ planStats.total || 0 }}</div>
        <div class="stat-label">计划总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ planStats.draft || 0 }}</div>
        <div class="stat-label">草稿</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ (planStats.preparing || 0) + (planStats.materialIssued || 0) }}</div>
        <div class="stat-label">备料/发料</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ planStats.inProgress || 0 }}</div>
        <div class="stat-label">生产中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ planStats.inspection || 0 }}</div>
        <div class="stat-label">待检验</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ planStats.completed || 0 }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
    </div>
    
    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="planList"
        border
        style="width: 100%"
        v-loading="loading"
        row-key="id"
      >
        <!-- 展开详情列 -->
        <el-table-column type="expand" width="50">
          <template #default="props">
            <div class="plan-detail">
              <el-descriptions :column="3" border>
                <el-descriptions-item label="计划编号">{{ props.row.code }}</el-descriptions-item>
                <el-descriptions-item label="计划名称">{{ props.row.name || '-' }}</el-descriptions-item>
                <el-descriptions-item label="状态">
                  <el-tag
                    :type="getStatusType(props.row.status)"
                    :class="getStatusClass(props.row.status)"
                  >
                    {{ getStatusText(props.row.status) }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="产品名称">{{ props.row.productName }}</el-descriptions-item>
                <el-descriptions-item label="物料编码">{{ props.row.productCode || '-' }}</el-descriptions-item>
                <el-descriptions-item label="型号规格">{{ getSpecification(props.row) || '-' }}</el-descriptions-item>
                <el-descriptions-item label="合同编码">{{ props.row.contract_code || '-' }}</el-descriptions-item>
                <el-descriptions-item label="BOM版本">
                  <el-tag v-if="props.row.bom_version" size="small" type="info">{{ props.row.bom_version }}</el-tag>
                  <span v-else>-</span>
                </el-descriptions-item>
                <el-descriptions-item label="开始日期">{{ formatDate(props.row.start_date) }}</el-descriptions-item>
                <el-descriptions-item label="结束日期">{{ formatDate(props.row.end_date) }}</el-descriptions-item>
                <el-descriptions-item label="计划数量">{{ formatQuantity(props.row.quantity) }}</el-descriptions-item>
                <el-descriptions-item label="已下推数量">
                  <span style="color: var(--color-success);">{{ props.row.pushed_quantity || 0 }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="剩余数量">
                  <span style="font-weight: 600; color: var(--color-primary);">
                    {{ (props.row.quantity || 0) - (props.row.pushed_quantity || 0) }}
                  </span>
                </el-descriptions-item>
                <el-descriptions-item label="库存状态">
                  <el-tag v-if="props.row.material_stock_status === 'shortage'" type="danger">缺料</el-tag>
                  <el-tag v-else-if="props.row.material_stock_status === 'sufficient'" type="success">充足</el-tag>
                  <el-tag v-else type="info">未知</el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="备注" :span="2">{{ props.row.remarks || '无' }}</el-descriptions-item>
              </el-descriptions>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="code" label="计划编号" width="120"></el-table-column>
        <el-table-column prop="contract_code" label="合同编码" width="110">
          <template #default="scope">
            {{ scope.row.contract_code || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="productCode" label="物料编码" width="130"></el-table-column>
        <el-table-column prop="productName" label="产品名称" width="140"></el-table-column>
        <el-table-column prop="specification" label="型号规格" width="160">
          <template #default="scope">
            <!-- 优先使用specification字段，然后才是specs字段 -->
            <el-tooltip
              v-if="getSpecification(scope.row)"
              class="box-item"
              effect="dark"
              :content="getSpecification(scope.row)"
              placement="top-start"
            >
              <span class="specs-text">{{ getSpecification(scope.row) }}</span>
            </el-tooltip>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column label="开始日期" width="100">
          <template #default="scope">
            {{ formatDate(scope.row.start_date) }}
          </template>
        </el-table-column>
        <el-table-column label="结束日期" width="100">
          <template #default="scope">
            {{ formatDate(scope.row.end_date) }}
          </template>
        </el-table-column>
        <el-table-column label="计划数量" width="80">
          <template #default="scope">
            {{ formatQuantity(scope.row.quantity) }}
          </template>
        </el-table-column>
        <el-table-column label="已下推" width="70">
          <template #default="scope">
            <span style="color: var(--color-success);">
              {{ scope.row.pushed_quantity || 0 }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="剩余" width="65">
          <template #default="scope">
            <span style="font-weight: 600; color: var(--color-primary);">
              {{ (scope.row.quantity || 0) - (scope.row.pushed_quantity || 0) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="91">
          <template #default="scope">
            <el-tag
              :type="getStatusType(scope.row.status)"
              :class="getStatusClass(scope.row.status)"
            >
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="库存" width="75">
          <template #default="scope">
            <div v-if="scope.row.status !== 'completed'">
              <el-tag v-if="scope.row.material_stock_status === 'shortage'" type="danger">
                缺料
              </el-tag>
              <el-tag v-else-if="scope.row.material_stock_status === 'sufficient'" type="success">
                充足
              </el-tag>
              <el-tag v-else type="info">
                未知
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="250" fixed="right">
          <template #default="scope">
            <el-button size="small" @click="viewPlanDetail(scope.row)" v-permission="'production:plans:view'">查看</el-button>
            <el-button
              size="small"
              type="primary"
              @click="handleEdit(scope.row)"
              v-if="scope.row.status === 'draft'"
              v-permission="'production:plans:update'"
            >
              编辑
            </el-button>
            <el-button
              size="small"
              type="success"
              @click="handlePushDown(scope.row)"
              v-if="['draft', 'preparing', 'material_issued', 'in_progress'].includes(scope.row.status) && (scope.row.quantity || 0) - (scope.row.pushed_quantity || 0) > 0"
              v-permission="'production:plans:pushdown'"
            >
              下推
            </el-button>
            <el-popconfirm
              title="确认取消此生产计划？"
              @confirm="handleCancelPlan(scope.row)"
              v-if="['draft', 'preparing', 'material_issued', 'in_progress'].includes(scope.row.status)"
            >
              <template #reference>
                <el-button size="small" type="danger" v-permission="'production:plans:update'">取消</el-button>
              </template>
            </el-popconfirm>

          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.pageSize"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
        >
        </el-pagination>
      </div>
    </el-card>
    
    <!-- 对话框 -->
    <el-dialog
      v-model="modalVisible"
      :title="modalTitle"
      width="55%"
      @close="handleModalCancel"
    >
      <div v-loading="modalLoading" style="min-height: 100px;">
      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-width="100px"
        @keydown="planFormKeydown"
      >
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="计划编号" prop="code">
              <el-input
                v-model="formData.code"
                placeholder="请输入计划编号或留空自动生成"
                :disabled="modalTitle === '编辑生产计划'"
                :readonly="modalTitle === '编辑生产计划'"
              />
              <small v-if="modalTitle === '编辑生产计划'" class="text-muted">
                编辑模式下不能修改计划编号
              </small>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="计划日期" prop="startDate" required>
              <el-date-picker
                v-model="formData.startDate"
                type="date"
                placeholder="开始日期"
                style="width: 100%"
                @change="updateEndDate"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="物料编码" prop="productId">
              <el-select
                v-model="formData.productId"
                placeholder="请选择产品或输入关键词搜索"
                filterable
                remote
                reserve-keyword
                default-first-option
                :remote-method="debouncedSearchProducts"
                :loading="loadingProducts"
                style="width: 100%"
                @change="handleProductChange"
                @focus="handleProductSelectFocus"
                @visible-change="handleSelectVisibleChange"
                @paste="handlePasteSearch"
                clearable
                no-data-text="没有找到匹配的产品"
                loading-text="搜索中..."
                no-match-text="没有匹配的选项"
              >
                <el-option
                  v-for="product in productOptions"
                  :key="product.id"
                  :label="product.code + ' - ' + product.name"
                  :value="product.id"
                  :disabled="!product.hasBom"
                >
                  <span :class="{ 'no-bom': !product.hasBom }">{{ product.code }} - {{ product.name }}</span>
                  <el-tag v-if="!product.hasBom" type="danger" size="small" style="margin-left: 8px">
                    无BOM
                  </el-tag>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="6">
            <el-form-item label="计划名称" prop="name">
              <el-input v-model="formData.name" placeholder="请输入计划名称" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="合同编码">
              <el-input v-model="formData.contract_code" placeholder="关联合同编码" />
            </el-form-item>
          </el-col>
          <el-col :span="7">
            <el-form-item label="结束日期" prop="endDate">
              <el-date-picker
                v-model="formData.endDate"
                type="date"
                placeholder="结束日期"
                style="width: 100%"
                :disabled-date="disableBeforeStartDate"
              />
            </el-form-item>
          </el-col>
          <el-col :span="5">
            <el-form-item label="计划数量" prop="quantity">
              <el-input
                v-model="formData.quantity"
                type="text"
                maxlength="5"
                style="width: 100%"
                placeholder="请输入"
                @input="handleQuantityInput"
                @change="calculateMaterials"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider>原材料需求</el-divider>

        <el-table
          :data="materialList"
          border
          style="width: 100%"
        >
          <el-table-column label="层级" width="70">
            <template #default="scope">
              <el-tag size="small" :type="getLevelTagType(scope.row.level)" :style="getLevelTagStyle(scope.row.level)">L{{ scope.row.level || 1 }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="code" label="物料编码" width="120" />
          <el-table-column label="物料名称" width="180">
            <template #default="scope">
              <el-tooltip
                v-if="scope.row.name"
                class="box-item"
                effect="dark"
                :content="scope.row.name"
                placement="top-start"
              >
                <span class="specs-text text-nowrap">{{ scope.row.name }}</span>
              </el-tooltip>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="规格型号" width="276">
            <template #default="scope">
              <el-tooltip
                v-if="getSpecification(scope.row)"
                class="box-item"
                effect="dark"
                :content="getSpecification(scope.row)"
                placement="top-start"
              >
                <span class="specs-text text-nowrap">{{ getSpecification(scope.row) }}</span>
              </el-tooltip>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="需求" width="80">
            <template #default="scope">
              {{ formatQuantity(scope.row.requiredQuantity || scope.row.required_quantity || 0) }}
            </template>
          </el-table-column>
          <el-table-column prop="unit" label="单位" width="55" />
          <el-table-column label="当前库存" width="110">
            <template #default="scope">
              <span :class="{ 'text-danger': (scope.row.stock_quantity || scope.row.stockQuantity || 0) < (scope.row.required_quantity || scope.row.requiredQuantity || 0) }">
                {{ formatQuantity(scope.row.stock_quantity || scope.row.stockQuantity || 0) }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="操作" width="80">
            <template #default="scope">
              <el-button
                v-if="shouldShowPurchaseButton(scope.row) && currentPlan && currentPlan.status !== 'completed'"
                :type="getMaterialRequestStatus(scope.row) ? 'success' : 'primary'"
                size="small"
                :disabled="getMaterialRequestStatus(scope.row)"
                @click="handleCreatePurchaseRequest(scope.row)"
              >
                {{ getMaterialRequestStatus(scope.row) ? '已申请' : getPurchaseButtonText(scope.row) }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleModalCancel">取消</el-button>
          <el-button v-permission="'production:productionplan:update'" type="primary" @click="handleModalOk" :loading="modalLoading">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 计划详情对话框 -->
    <el-dialog
      v-model="planDetailVisible"
      title="生产计划详情"
      width="55%"
      destroy-on-close
    >
      <div v-loading="planDetailLoading">
        <template v-if="currentPlan">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="计划编号">{{ currentPlan.code }}</el-descriptions-item>
            <el-descriptions-item label="计划名称">{{ currentPlan.name }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="currentPlan.status === 'completed' ? 'success' : currentPlan.status === 'in_progress' ? 'warning' : currentPlan.status === 'cancelled' ? 'danger' : 'info'">
                {{ { draft: '草稿', material_preparation: '备料/发料', in_progress: '生产中', pending_inspection: '待检验', completed: '已完成', cancelled: '已取消' }[currentPlan.status] || currentPlan.status }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="产品名称">{{ currentPlan.productName || currentPlan.product_name }}</el-descriptions-item>
            <el-descriptions-item label="型号规格">{{ currentPlan.specification || '-' }}</el-descriptions-item>
            <el-descriptions-item label="计划数量">{{ currentPlan.quantity }}</el-descriptions-item>
            <el-descriptions-item label="合同编码">{{ currentPlan.contract_code || '-' }}</el-descriptions-item>
            <el-descriptions-item label="开始日期">{{ currentPlan.startDate || currentPlan.start_date || '-' }}</el-descriptions-item>
            <el-descriptions-item label="结束日期">{{ currentPlan.endDate || currentPlan.end_date || '-' }}</el-descriptions-item>
            <el-descriptions-item label="已下推数量">{{ currentPlan.pushed_quantity || 0 }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ currentPlan.remark || '-' }}</el-descriptions-item>
          </el-descriptions>

          <!-- 物料需求 -->
          <el-divider content-position="left">物料需求</el-divider>
          <el-table :data="currentPlan.materials || []" border style="width: 100%" max-height="350">
            <el-table-column prop="code" label="物料编码" width="130" show-overflow-tooltip>
              <template #default="{ row }">{{ row.code || row.material_code || '-' }}</template>
            </el-table-column>
            <el-table-column prop="name" label="物料名称" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.name || row.material_name || '-' }}</template>
            </el-table-column>
            <el-table-column prop="specification" label="规格" width="200" show-overflow-tooltip />
            <el-table-column label="需求数量" width="100" align="center">
              <template #default="{ row }">{{ formatQuantity(row.requiredQuantity || row.quantity || 0) }}</template>
            </el-table-column>
            <el-table-column prop="unit_name" label="单位" width="70" align="center" />
            <el-table-column label="库存状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.stockStatus === 'sufficient'" type="success" size="small">充足</el-tag>
                <el-tag v-else-if="row.stockStatus === 'shortage'" type="danger" size="small">缺料</el-tag>
                <el-tag v-else type="info" size="small">{{ row.stockStatus || '-' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
          </el-table>
        </template>
        <el-empty v-else-if="!planDetailLoading" description="暂无数据" />
      </div>
      <template #footer>
        <el-button @click="planDetailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 下推数量选择对话框 -->
    <el-dialog
      v-model="pushDownDialogVisible"
      title="下推生产任务"
      width="500px"
    >
      <div v-if="pushDownPlan">
        <el-alert
          title="计划信息"
          type="info"
          :closable="false"
          style="margin-bottom: 20px;"
        >
          <div style="line-height: 1.8;">
            <div><strong>计划编号：</strong>{{ pushDownPlan.code }}</div>
            <div><strong>产品名称：</strong>{{ pushDownPlan.productName }}</div>
            <div><strong>计划数量：</strong>{{ pushDownPlan.quantity }} 只</div>
            <div><strong>已下推：</strong><span style="color: var(--color-success);">{{ pushDownPlan.pushed_quantity || 0 }} 只</span></div>
            <div><strong>剩余可推：</strong><span style="color: var(--color-primary); font-weight: 600;">{{ (pushDownPlan.quantity || 0) - (pushDownPlan.pushed_quantity || 0) }} 只</span></div>
          </div>
        </el-alert>

        <el-radio-group v-model="pushDownType" style="margin-bottom: 20px;">
          <el-radio value="full" size="large">
            <span style="font-size: 15px;">全部下推（{{ (pushDownPlan.quantity || 0) - (pushDownPlan.pushed_quantity || 0) }} 只）</span>
          </el-radio>
          <el-radio value="partial" size="large">
            <span style="font-size: 15px;">部分下推</span>
          </el-radio>
        </el-radio-group>

        <el-form v-if="pushDownType === 'partial'" label-width="100px">
          <el-form-item label="下推数量">
            <el-input-number
              v-model="pushDownQuantity"
              :min="1"
              :max="(pushDownPlan.quantity || 0) - (pushDownPlan.pushed_quantity || 0)"
              :step="1"

              placeholder="请输入数量"
            />
            <span style="margin-left: 10px; color: #909399;">
              / {{ (pushDownPlan.quantity || 0) - (pushDownPlan.pushed_quantity || 0) }} 只（剩余）
            </span>
          </el-form-item>
          <el-form-item>
            <el-alert
              type="warning"
              :closable="false"
              show-icon
            >
              <template #title>
                剩余数量将保留在计划中，可稍后继续下推
              </template>
            </el-alert>
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="pushDownDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmPushDown" :loading="loading">
            确认下推
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

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

.text-danger {
  color: var(--color-danger);
}

.task-detail {
  padding: 20px;
}

.specs-text {
  display: inline-block;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-nowrap {
  white-space: nowrap;
}

/* 增强型号规格的显示 */
.el-table .specs-text {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

/* 确保工具提示有足够的宽度 */
:deep(.el-tooltip__popper) {
  max-width: 500px;
  word-break: break-word;
}

/* 操作列样式 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}

/* 产品搜索选项样式 */
.no-bom {
  color: var(--color-text-secondary) !important;
}

/* 表格单元格内容不换行，超出省略 */
:deep(.el-table .cell) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 确保表格列宽度限制 */
:deep(.el-table th.el-table__cell),
:deep(.el-table td.el-table__cell) {
  overflow: hidden;
}

/* 详情对话框长文本处理 */
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

/* 自定义状态标签颜色 */
/* 生产中 - 深蓝色 */
.status-in-progress {
  --el-tag-bg-color: #1e40af !important;
  --el-tag-border-color: #1e40af !important;
  --el-tag-text-color: #ffffff !important;
  background-color: #1e40af !important;
  border-color: #1e40af !important;
  color: #ffffff !important;
}

/* 待检验 - 紫色 */
.status-inspection {
  --el-tag-bg-color: #7c3aed !important;
  --el-tag-border-color: #7c3aed !important;
  --el-tag-text-color: #ffffff !important;
  background-color: #7c3aed !important;
  border-color: #7c3aed !important;
  color: #ffffff !important;
}
</style>