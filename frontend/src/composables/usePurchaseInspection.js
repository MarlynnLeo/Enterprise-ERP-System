/**
 * usePurchaseInspection.js
 * @description 采购检验相关的组合式函数
 * @date 2025-11-12
 * @updated 2025-11-13 - 优化日志输出和数据解析
 */
import { ElMessage } from 'element-plus';
import { qualityApi, supplierApi } from '@/services/api';
import { generateBatchNumber } from '@/utils/inspectionHelpers';
import {
  
  getGeneralTemplateQueryParams
} from '@/constants/inspection';
import { parseListData, isResponseSuccess } from '@/utils/responseParser';
import { createLogger } from '@/utils/devLogger';
// 创建日志工具
const logger = createLogger('🔍 采购检验');
/**
 * 采购检验组合式函数
 */
export const usePurchaseInspection = () => {
  /**
   * 获取物料的检验模板
   * @param {number} materialId - 物料ID
   * @returns {Object|null} 检验模板数据
   */
  const getMaterialTemplate = async (materialId) => {
    try {
      const response = await qualityApi.getMaterialDefaultTemplate(materialId);
      const respData = response?.data;
      // ResponseHandler 格式: { success: true, data: [...] }
      if (respData?.success && respData?.data?.length > 0) {
        return respData.data[0].id;
      }
      // 直接数组格式: [...]
      if (Array.isArray(respData) && respData.length > 0) {
        return respData[0].id;
      }
      // 直接分页格式: { list: [...], total: 1 }
      if (respData?.list?.length > 0) {
        return respData.list[0].id;
      }
      return null;
    } catch (err) {
      logger.warn('获取物料专用模板失败:', err);
      return null;
    }
  };
  /**
   * 获取通用检验模板
   * @param {string} inspectionType - 检验类型 ('incoming' | 'process' | 'final')
   * @returns {number|null} 模板ID
   */
  const getGeneralTemplate = async (inspectionType = 'incoming') => {
    try {
      // 使用统一配置,避免硬编码
      const queryParams = getGeneralTemplateQueryParams(inspectionType);
      logger.log('开始查询通用检验模板...');
      logger.debug('查询参数:', queryParams);
      const response = await qualityApi.getTemplates(queryParams);
      logger.debug('📦 后端返回数据:', response.data);
      // 使用统一的数据解析工具
      if (!isResponseSuccess(response)) {
        logger.warn('❌ 后端返回失败:', response.data);
        return null;
      }
      const generalTemplates = parseListData(response, '📋 通用模板');
      logger.log(`📊 找到 ${generalTemplates.length} 个通用模板`);
      if (generalTemplates.length > 0) {
        logger.log('✅ 使用通用模板:', generalTemplates[0]);
        return generalTemplates[0].id;
      }
      logger.warn('❌ 未找到来料通用模板');
      logger.warn('💡 请检查:');
      logger.warn('  1. 数据库中是否有 is_general=TRUE 的来料检验模板');
      logger.warn('  2. 通用模板的状态是否为 active');
      logger.warn('  3. inspection_templates 表是否有 is_general 字段');
      return null;
    } catch (err) {
      logger.error('❌ 获取通用模板失败:', err);
      logger.error('错误详情:', err.response?.data || err.message);
      return null;
    }
  };
  /**
   * 获取模板详情
   * @param {number} templateId - 模板ID
   * @returns {Object} 模板详情
   */
  const getTemplateDetail = async (templateId) => {
    const templateDetailResponse = await qualityApi.getTemplate(templateId);
    // 支持多种响应格式
    const respData = templateDetailResponse?.data;
    if (!respData) {
      throw new Error('获取模板详情失败');
    }
    // ResponseHandler 格式: { success: true, data: {...} }
    if (respData.success && respData.data) {
      return respData.data;
    }
    // 直接数据格式: { id: ..., template_name: ..., InspectionItems: [...] }
    if (respData.id || respData.template_name || respData.InspectionItems) {
      return respData;
    }
    throw new Error('获取模板详情失败');
  };
  /**
   * 转换模板数据格式
   * @param {Object} templateDetail - 模板详情
   * @returns {Object} 转换后的模板数据
   */
  const transformTemplateData = (templateDetail) => {
    if (!templateDetail.InspectionItems || templateDetail.InspectionItems.length === 0) {
      throw new Error('模板没有检验项目');
    }
    
    return {
      id: templateDetail.id,
      name: templateDetail.template_name,
      items: templateDetail.InspectionItems.map(item => ({
        item_id: item.id || null,
        item_name: item.item_name,
        standard: item.standard || '',
        lower_limit: item.lower_limit || null,
        upper_limit: item.upper_limit || null,
        type: item.type || 'qualitative',
        is_critical: item.is_critical === true || item.is_critical === 1 ? 1 : 0,
        inspection_method: item.inspection_method || '',
        remark: item.remark || '',
        dimension_value: item.dimension_value || null,
        tolerance_upper: item.tolerance_upper || null,
        tolerance_lower: item.tolerance_lower || null,
        result: '',
        actual_value: ''
      }))
    };
  };
  /**
   * 获取检验模板 (统一入口)
   * @param {number} materialId - 物料ID
   * @returns {Object|null} 检验模板
   */
  const getInspectionTemplate = async (materialId) => {
    try {
      logger.log(`开始获取物料 ${materialId} 的检验模板...`);
      // 1. 先尝试获取物料专用模板
      let templateId = await getMaterialTemplate(materialId);
      logger.debug(`📋 物料专用模板ID: ${templateId || '无'}`);
      // 2. 如果没有专用模板,获取通用模板
      if (!templateId) {
        logger.log('🔄 物料没有专用模板,尝试获取通用模板...');
        templateId = await getGeneralTemplate();
        logger.debug(`📋 通用模板ID: ${templateId || '无'}`);
      }
      // 3. 如果还是没有模板,返回null
      if (!templateId) {
        logger.error(`❌ 物料 ${materialId} 没有可用的检验模板`);
        return null;
      }
      // 4. 获取模板详情
      logger.debug(`📥 获取模板 ${templateId} 的详情...`);
      const templateDetail = await getTemplateDetail(templateId);
      logger.debug('✅ 模板详情获取成功:', templateDetail);
      // 5. 转换数据格式
      const transformedData = transformTemplateData(templateDetail);
      logger.log('✅ 模板数据转换成功,检验项数量:', transformedData.items?.length || 0);
      return transformedData;
    } catch (error) {
      logger.error(`❌ 获取物料 ${materialId} 的检验模板失败:`, error);
      logger.error('错误详情:', error.response?.data || error.message);
      throw error;
    }
  };
  /**
   * 为采购订单创建来料检验单
   * @param {Object} orderData - 订单数据
   * @param {Array} items - 物料项目列表 (可选,默认使用orderData.items)
   * @param {string} source - 来源标识 ('receive'|'complete'|'quick')
   * @returns {Object} 创建结果 {successCount, failedCount, skippedCount}
   */
  const createInspectionForOrder = async (orderData, items = null) => {
    const itemsToProcess = items || orderData.items;
    // 如果没有物料项，跳过
    if (!itemsToProcess || itemsToProcess.length === 0) {
      return { successCount: 0, failedCount: 0, skippedCount: 0 };
    }
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    // 遍历每个物料项创建检验单
    for (const item of itemsToProcess) {
      try {
        // 获取检验模板
        const inspectionTemplate = await getInspectionTemplate(item.material_id);
        if (!inspectionTemplate) {
          skippedCount++;
          ElMessage.warning(`物料 ${item.material_name || item.name} 没有检验模板，跳过创建`);
          continue;
        }
        if (!orderData.supplier_id) {
          skippedCount++;
          ElMessage.warning(`物料 ${item.material_name || item.name} 缺少供应商信息，跳过创建`);
          continue;
        }

        let supplierCode = '';
        try {
          const supplierResponse = await supplierApi.getSupplier(orderData.supplier_id);
          if (supplierResponse.data && supplierResponse.data.code) {
            supplierCode = supplierResponse.data.code;
          }
        } catch (err) {
          logger.error('获取供应商编码失败:', err);
        }

        if (!supplierCode) {
          skippedCount++;
          ElMessage.warning(`物料 ${item.material_name || item.name} 无法获取供应商编码，跳过创建`);
          continue;
        }

        // 生成批次号 - 传递正确的参数类型
        const batchNo = await generateBatchNumber(supplierCode, orderData.supplier_id, qualityApi);
        // 构造提交数据
        const submitData = {
          inspection_type: 'incoming',
          material_id: item.material_id,
          material_code: item.material_code || item.code,
          material_name: item.material_name || item.name,
          supplier_id: orderData.supplier_id,
          supplier_name: orderData.supplier_name,
          batch_no: batchNo,
          quantity: item.quantity || item.received_quantity || 0,
          reference_id: orderData.id,
          reference_no: orderData.order_no,
          unit: item.unit_name || item.unit || '个',
          unit_id: item.unit_id,
          planned_date: new Date().toISOString().split('T')[0],
          actual_date: null,
          status: 'pending',
          note: `自动创建的来料检验单 - 供应商: ${orderData.supplier_name}`,
          items: inspectionTemplate.items
        };
        // 创建检验单
        const response = await qualityApi.createIncomingInspection(submitData);
        // 拦截器已解包，如果请求成功则 response.data 就是业务数据
        // 如果业务失败，拦截器会抛出错误
        if (response.data) {
          successCount++;
        } else {
          failedCount++;
          ElMessage.error(`来料检验单创建失败: ${item.material_name || item.name}`);
        }
      } catch (createErr) {
        failedCount++;
        logger.error('创建来料检验单失败:', createErr);
        ElMessage.error(`来料检验单创建失败: ${item.material_name || item.name} - ${createErr.message}`);
      }
    }
    // 返回创建结果
    return { successCount, failedCount, skippedCount };
  };
  /**
   * 显示检验单创建结果消息
   * @param {Object} result - 创建结果 {successCount, failedCount, skippedCount}
   */
  const showInspectionResult = (result) => {
    const { successCount, failedCount, skippedCount } = result;
    if (successCount > 0 && failedCount === 0 && skippedCount === 0) {
      ElMessage.success(`所有来料检验单创建成功,共 ${successCount} 个`);
    } else if (successCount > 0) {
      const messages = [`成功 ${successCount} 个`];
      if (failedCount > 0) messages.push(`失败 ${failedCount} 个`);
      if (skippedCount > 0) messages.push(`跳过 ${skippedCount} 个`);
      ElMessage.warning(`部分来料检验单创建成功: ${messages.join(', ')}`);
    } else if (skippedCount > 0) {
      ElMessage.info(`未创建来料检验单(${skippedCount} 个物料没有可用的检验模板)`);
    } else if (failedCount > 0) {
      ElMessage.error(`来料检验单创建失败,共 ${failedCount} 个`);
    }
  };
  return {
    getInspectionTemplate,
    createInspectionForOrder,
    showInspectionResult
  };
};
export default usePurchaseInspection;
