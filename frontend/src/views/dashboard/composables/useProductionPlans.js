/**
 * useProductionPlans.js
 * @description 生产计划数据的组合式函数（从 Dashboard.vue 抽取）
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'
import { productionApi, baseDataApi } from '../../../services/api'
import { parseListData } from '@/utils/responseParser'
import { ElMessage } from 'element-plus'

export function useProductionPlans() {
  const router = useRouter()
  const authStore = useAuthStore()

  // 预警列表数据（生产计划）
  const warningList = ref([])

  // === 全局状态常量映射字典 ===
  const WARNING_STYLE_MAP = {
    'draft': 'warning-notice',
    'preparing': 'warning-notice',
    'material_issuing': 'warning-document',
    'material_issued': 'warning-document',
    'in_progress': 'warning-activity',
    'inspection': 'warning-course',
    'warehousing': 'warning-accommodation',
    'completed': 'warning-completed',
    'cancelled': 'warning-cancelled'
  }

  const WARNING_TAG_MAP = {
    'draft': 'info',
    'preparing': 'warning',
    'material_issuing': 'warning',
    'material_issued': 'primary',
    'in_progress': 'primary',
    'inspection': 'warning',
    'warehousing': 'success',
    'completed': 'success',
    'cancelled': 'danger'
  }

  const PLAN_STATUS_TEXT_MAP = {
    draft: '未开始',
    allocated: '分配中',
    preparing: '配料中',
    material_issuing: '发料中',
    material_issued: '已发料',
    in_progress: '生产中',
    inspection: '待检验',
    warehousing: '入库中',
    completed: '已完成',
    cancelled: '已取消'
  }

  const getWarningTypeClass = (status) => WARNING_STYLE_MAP[status] || 'warning-notice'
  const getWarningTagType = (status) => WARNING_TAG_MAP[status] || 'info'
  const getStatusText = (status) => PLAN_STATUS_TEXT_MAP[status] || status

  // 加载生产计划数据
  const loadProductionPlans = async () => {
    try {
      // 检查登录状态
      if (!authStore.isAuthenticated) {
        console.warn('用户未登录，无法加载生产计划')
        return 0
      }

      const params = {
        page: 1,
        limit: 20, // 增加到20条，确保表格有足够内容
        sort: 'created_at',
        order: 'desc' // 最新的生产计划优先
      }

      // 获取生产计划列表 - 使用仪表盘专用接口，所有用户都可访问
      const response = await productionApi.getDashboardProductionPlans(params)
      const plans = parseListData(response, { enableLog: false });

      if (plans.length > 0) {
        // 获取所有产品ID，用于批量获取物料信息
        const productIds = plans
          .filter(plan => plan.product_id)
          .map(plan => plan.product_id);

        // 创建物料映射表
        const materialsMap = {};

        // 如果有产品ID，尝试批量获取物料信息
        if (productIds.length > 0) {
          try {
            // 使用baseDataApi获取物料信息
            const materialsResponse = await baseDataApi.getMaterials({
              page: 1,
              pageSize: 1000,
              ids: productIds.join(',')
            });

            const materialsData = parseListData(materialsResponse, { enableLog: false });

            // 将物料信息转换为映射表
            materialsData.forEach(material => {
              materialsMap[material.id] = material;
            });
          } catch (error) {
            console.error('批量获取物料信息失败:', error);
          }
        }

        // 直接使用批量获取的映射表填充规格信息（不再逐条请求）
        const processedPlans = plans.map(plan => {
          let specification = plan.specification || plan.specs || '';

          // 从批量获取的映射表中获取规格
          if (!specification && plan.product_id && materialsMap[plan.product_id]) {
            specification = materialsMap[plan.product_id].specs || '';
          }

          return {
            ...plan,
            specification: specification
          };
        });

        // 转换为仪表盘显示格式
        warningList.value = processedPlans.map(plan => {
          const specValue = plan.specification || plan.specs || plan.material_specs || plan.spec || plan.standard || '';

          return {
            studentId: plan.code || '无编号', // 使用计划编号
            name: plan.productName || plan.product_name || plan.name || '未命名', // 使用产品名称
            studentType: specValue || '无规格', // 使用产品规格，增加更多可能的字段
            protectionId: `${plan.quantity || 0}${plan.unit || '个'}`, // 显示计划数量
            warningType: getStatusText(plan.status || 'draft'), // 显示计划状态
            status: plan.status || 'draft', // 原始状态值
            id: plan.id, // 保存ID用于后续操作
            startDate: plan.start_date || plan.startDate,
            endDate: plan.end_date || plan.endDate
          };
        });

        return plans.length
      } else {
        // 如果没有数据
        console.warn('未找到生产计划数据')
        return 0
      }
    } catch (error) {
      console.error('加载生产计划失败:', error)
      if (error.response && error.response.status === 401) {
        ElMessage.error('登录已过期，请重新登录')
      } else {
        ElMessage.error('获取生产计划数据失败')
      }
      return 0
    }
  }

  // 查看生产计划详情
  const viewProductionPlan = (id) => {
    if (!id) return
    router.push(`/production/plan?id=${id}`)
  }

  return {
    warningList,
    getWarningTypeClass,
    getWarningTagType,
    getStatusText,
    loadProductionPlans,
    viewProductionPlan
  }
}
