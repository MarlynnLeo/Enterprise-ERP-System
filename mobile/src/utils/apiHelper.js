/**
 * apiHelper.js
 * @description API 响应数据提取工具，统一处理后端响应格式差异
 * @date 2026-04-21
 * @version 1.0.0
 */

/**
 * 从 API 响应中安全提取业务数据
 * 兼容以下后端响应格式：
 *   - { data: { data: actualData } } （ResponseHandler 嵌套）
 *   - { data: actualData }           （拦截器已解包）
 *   - actualData                     （直接数据）
 *
 * @param {Object} res - axios 响应对象
 * @param {*} defaultValue - 提取失败时的默认值，默认 {}
 * @returns {*} 提取出的业务数据
 */
export const extractApiData = (res, defaultValue = {}) => {
  return res?.data?.data ?? res?.data ?? defaultValue
}

/**
 * 从 API 响应中提取列表数据
 * @param {Object} res - axios 响应对象
 * @returns {Array} 列表数据
 */
export const extractApiList = (res) => {
  const data = extractApiData(res, [])
  if (Array.isArray(data)) return data
  return data?.list || data?.rows || []
}

/**
 * 从 API 响应中提取分页数据
 * @param {Object} res - axios 响应对象
 * @returns {{ list: Array, total: number }}
 */
export const extractApiPaginated = (res) => {
  const data = extractApiData(res)
  const list = data?.list || data?.rows || (Array.isArray(data) ? data : [])
  const total = data?.total ?? list.length
  return { list, total }
}
