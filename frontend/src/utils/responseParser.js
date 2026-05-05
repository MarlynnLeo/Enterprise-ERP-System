import { devLogger } from '@/utils/devLogger';
/**
 * 响应数据解析工具
 * @description 统一处理API响应数据的解析逻辑
 * @date 2025-11-25
 * @updated 2025-11-28 - axios拦截器已统一解包ResponseHandler格式
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 重要说明 - 数据流说明
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 后端 ResponseHandler.paginated() 返回格式：
 * {
 *   success: true,
 *   message: '查询成功',
 *   data: {
 *     list: [...],      // 数据列表
 *     total: 100,       // 总记录数
 *     page: 1,          // 当前页码
 *     pageSize: 20,     // 每页大小
 *     totalPages: 5     // 总页数
 *   },
 *   timestamp: '...'
 * }
 *
 * axios 拦截器 (axiosInstance.js) 解包后：
 * response.data = {
 *   list: [...],
 *   total: 100,
 *   page: 1,
 *   pageSize: 20,
 *   totalPages: 5
 * }
 *
 * 前端组件使用 parsePaginatedData 解析：
 * const { list, total, page, pageSize } = parsePaginatedData(response);
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * API 层规范（重要！）
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * API 层（如 bom.js, material.js）不应该再次修改 response.data！
 * 应直接返回 axios 响应，让组件使用 parsePaginatedData 或 parseListData 解析。
 *
 * 正确写法：
 *   getBoms: (params) => api.get('/baseData/boms', { params })
 *
 * 错误写法：
 *   getBoms: async (params) => {
 *     const response = await api.get('/baseData/boms', { params });
 *     response.data = { items: response.data.list, ... };  // ❌ 不要这样做！
 *     return response;
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// 默认关闭解析跟踪，需要时可在调用处手动启用 enableLog: true
const isDev = import.meta.env.DEV && import.meta.env.VITE_ENABLE_RESPONSE_LOG === 'true';

/**
 * 递归规范化数据中的布尔型字段为整数
 * MySQL TINYINT(1) 被 mysql2 驱动解析为 boolean，前端统一使用 0/1 整数
 * @param {Array|Object} data - 待处理的数据
 * @returns {Array|Object} 处理后的数据
 */
const normalizeBooleanFields = (data) => {
  if (Array.isArray(data)) {
    return data.map(item => normalizeBooleanFields(item));
  }
  if (data && typeof data === 'object') {
    const result = { ...data };
    for (const key of Object.keys(result)) {
      if (typeof result[key] === 'boolean') {
        // 将布尔值转为整数 0/1
        result[key] = result[key] ? 1 : 0;
      } else if (Array.isArray(result[key])) {
        // 递归处理子数组（如 children、items 等嵌套结构）
        result[key] = normalizeBooleanFields(result[key]);
      }
    }
    return result;
  }
  return data;
};

/**
 * 解析列表数据（增强版）
 * 注意：axios 拦截器已解包 ResponseHandler 格式，response.data 就是业务数据
 *
 * @param {Object} response - API响应对象
 * @param {Object} options - 配置选项
 * @param {string} options.logPrefix - 日志前缀
 * @param {boolean} options.enableLog - 是否启用日志（默认：开发环境启用）
 * @returns {Array} 解析后的列表数组
 *
 * @example
 * const response = await api.getList();
 * const list = parseListData(response, { logPrefix: '📋 模板列表' });
 */
export const parseListData = (response, options = {}) => {
  const { logPrefix = '', enableLog = isDev } = options;

  let result = [];

  // 拦截器已解包，response.data 就是业务数据
  // 优先级1: response.data.list (分页格式)
  if (response?.data?.list && Array.isArray(response.data.list)) {
    enableLog && devLogger.debug(`${logPrefix}✅ 数据格式: data.list`);
    result = response.data.list;
  }
  // 优先级2: response.data.items
  else if (response?.data?.items && Array.isArray(response.data.items)) {
    enableLog && devLogger.debug(`${logPrefix}✅ 数据格式: data.items`);
    result = response.data.items;
  }
  // 优先级3: response.data.rows
  else if (response?.data?.rows && Array.isArray(response.data.rows)) {
    enableLog && devLogger.debug(`${logPrefix}✅ 数据格式: data.rows`);
    result = response.data.rows;
  }
  // 优先级3.5: response.data.data (嵌套 data 格式，如退货接口 { data: [...], pagination: {...} })
  else if (response?.data?.data && Array.isArray(response.data.data)) {
    enableLog && devLogger.debug(`${logPrefix}✅ 数据格式: data.data`);
    result = response.data.data;
  }
  // 优先级4: response.data (数组)
  else if (response?.data && Array.isArray(response.data)) {
    enableLog && devLogger.debug(`${logPrefix}✅ 数据格式: data (Array)`);
    result = response.data;
  }
  // 优先级5: response (数组)
  else if (Array.isArray(response)) {
    enableLog && devLogger.debug(`${logPrefix}✅ 数据格式: response (Array)`);
    result = response;
  }
  // 未知格式
  else {
    enableLog && devLogger.warn(`${logPrefix}⚠️ 数据格式未知:`, response);
    return [];
  }

  // 统一出口：递归规范化布尔字段 (status 等) 为整数 0/1
  return normalizeBooleanFields(result);
};

/**
 * 解析单个数据对象
 * 注意：axios 拦截器已解包 ResponseHandler 格式，response.data 就是业务数据
 *
 * @param {Object} response - API响应对象
 * @param {Object} options - 配置选项
 * @returns {Object|null} 解析后的数据对象
 *
 * @example
 * const response = await api.getDetail(id);
 * const detail = parseDataObject(response);
 */
export const parseDataObject = (response, options = {}) => {
  const { logPrefix = '', enableLog = isDev } = options;

  // 拦截器已解包，response.data 就是业务数据
  if (response?.data && typeof response.data === 'object') {
    enableLog && devLogger.debug(`${logPrefix}✅ 数据格式: data (直接对象)`);
    return normalizeBooleanFields(response.data);
  }

  // response (直接对象)
  if (response && typeof response === 'object' && !response.data) {
    enableLog && devLogger.debug(`${logPrefix}✅ 数据格式: response (直接对象)`);
    return normalizeBooleanFields(response);
  }

  enableLog && devLogger.warn(`${logPrefix}⚠️ 无法解析数据对象`);
  return null;
};

/**
 * 检查响应是否成功
 * 注意：axios 拦截器已解包 ResponseHandler 格式
 * 如果业务失败，拦截器会抛出错误，所以这里只需要检查是否有数据
 *
 * @param {Object} response - API响应对象
 * @returns {boolean} 是否成功
 *
 * @example
 * const response = await api.create(data);
 * if (isResponseSuccess(response)) {
 *   devLogger.debug('创建成功');
 * }
 */
export const isResponseSuccess = (response) => {
  // 拦截器已解包，如果请求成功，response.data 就是业务数据
  // 如果业务失败，拦截器会抛出错误

  // 1. 有数据就认为成功
  if (response?.data !== undefined && response?.data !== null) {
    return true;
  }

  // 2. 直接数组格式
  if (Array.isArray(response)) {
    return true;
  }

  return false;
};

/**
 * 获取响应错误消息
 * @param {Object} response - API响应对象
 * @param {string} defaultMessage - 默认错误消息
 * @returns {string} 错误消息
 * 
 * @example
 * const response = await api.create(data);
 * if (!isResponseSuccess(response)) {
 *   const errorMsg = getResponseError(response, '创建失败');
 *   console.error(errorMsg);
 * }
 */
export const getResponseError = (response, defaultMessage = '操作失败') => {
  return response?.data?.message ||
    response?.data?.error ||
    defaultMessage;
};

/**
 * 解析分页数据（增强版）
 * 注意：axios 拦截器已解包 ResponseHandler 格式，response.data 就是业务数据
 *
 * @param {Object} response - API响应对象
 * @param {Object} options - 配置选项
 * @param {string} options.logPrefix - 日志前缀
 * @param {boolean} options.enableLog - 是否启用日志
 * @returns {Object} 分页数据 {list, total, page, pageSize, totalPages, statistics, extra}
 *
 * @example
 * const response = await api.getList({ page: 1, pageSize: 20 });
 * const { list, total, page, pageSize, statistics } = parsePaginatedData(response, { logPrefix: '📋 列表' });
 */
export const parsePaginatedData = (response, options = {}) => {
  const { logPrefix = '', enableLog = isDev } = options;

  // 拦截器已解包，response.data 就是业务数据
  if (response?.data && typeof response.data === 'object') {
    const data = response.data;
    const pag = data.pagination || {}; // 兼容 { data: [...], pagination: { total } } 格式
    const list = parseListData(response, { logPrefix, enableLog });
    // 确保 total, page, pageSize 是数字类型，避免 Element Plus 类型警告
    const total = Number(data.total || data.totalCount || pag.total || pag.totalCount || list.length) || 0;
    const page = Number(data.page || data.currentPage || pag.page || pag.current || 1) || 1;
    const pageSize = Number(data.pageSize || data.limit || data.size || pag.pageSize || pag.limit || 20) || 20;
    const totalPages = Number(data.totalPages || pag.totalPages) || Math.ceil(total / pageSize);
    const statistics = data.statistics || null;
    const extra = data.extra || null;

    enableLog && devLogger.debug(`${logPrefix}📊 分页信息:`, { total, page, pageSize, totalPages });

    return { list, total, page, pageSize, totalPages, statistics, extra };
  }

  // 默认返回空数据
  enableLog && devLogger.warn(`${logPrefix}⚠️ 无法解析分页数据`);
  return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0, statistics: null, extra: null };
};

/**
 * 解析响应数据 (通用方法)
 * @param {Object} response - API响应对象
 * @param {Object} options - 解析选项
 * @param {string} options.type - 数据类型 ('list' | 'object' | 'paginated')
 * @param {string} options.logPrefix - 日志前缀
 * @returns {*} 解析后的数据
 * 
 * @example
 * const response = await api.getData();
 * const data = parseResponse(response, { type: 'list', logPrefix: '📋 数据' });
 */
export const parseResponse = (response, options = {}) => {
  const { type = 'object', logPrefix = '' } = options;

  switch (type) {
    case 'list':
      return parseListData(response, logPrefix);
    case 'paginated':
      return parsePaginatedData(response);
    case 'object':
    default:
      return parseDataObject(response);
  }
};

/**
 * 解析 API 响应（统一入口）
 * 自动处理 ResponseHandler 格式和直接数据格式
 * @param {Object} response - axios 响应对象
 * @returns {Object} { success, data, message, error }
 *
 * @example
 * const response = await axios.get('/api/data');
 * const result = parseApiResponse(response);
 * if (result.success) {
 *   devLogger.debug('数据:', result.data);
 * } else {
 *   console.error('错误:', result.message);
 * }
 */
export const parseApiResponse = (response) => {
  // 拦截器已解包，response.data 就是业务数据
  // 如果业务失败，拦截器会抛出错误
  if (response?.data !== undefined) {
    return {
      success: true,
      data: response.data,
      message: response._message || '',
      error: null
    };
  }

  // 无法解析
  return {
    success: false,
    data: null,
    message: '',
    error: '无法解析响应'
  };
};

export default {
  parseListData,
  parseDataObject,
  isResponseSuccess,
  getResponseError,
  parsePaginatedData,
  parseResponse,
  parseApiResponse
};
