/**
 * 错误处理工具
 * @description 统一处理API错误和异常
 */

import { ElMessage } from 'element-plus'

/**
 * 解析错误信息
 * @param {Error} error - 错误对象
 * @returns {string} 解析后的错误信息
 */
const parseErrorMessage = (error) => {
  let errorMsg = error.message || '未知错误'
  
  // 从响应中提取错误信息
  if (error.response?.data) {
    const responseData = error.response.data
    
    // 优先使用 error 字段
    if (responseData.error) {
      errorMsg = String(responseData.error)
    }
    // 其次使用 message 字段
    else if (responseData.message) {
      errorMsg = String(responseData.message)
    }
    // 最后使用 msg 字段
    else if (responseData.msg) {
      errorMsg = String(responseData.msg)
    }
  }
  
  // 识别特定错误类型并提供友好提示
  if (errorMsg.includes('Duplicate entry') || errorMsg.includes('unique violation')) {
    return '数据重复，请检查输入内容'
  }
  
  if (errorMsg.includes('foreign key constraint') || errorMsg.includes('violates foreign key')) {
    return '存在关联数据，无法删除'
  }
  
  if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
    return '请求超时，请检查网络连接后重试'
  }
  
  if (errorMsg.includes('Network Error') || errorMsg.includes('ERR_NETWORK')) {
    return '网络连接失败，请检查网络设置'
  }
  
  if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
    return '登录已过期，请重新登录'
  }
  
  if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
    return '没有权限执行此操作'
  }
  
  if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
    return '请求的资源不存在'
  }
  
  if (errorMsg.includes('500') || errorMsg.includes('Internal Server Error')) {
    return '服务器内部错误，请稍后重试'
  }
  
  return errorMsg
}

/**
 * 统一的错误处理函数
 * @param {Error} error - 错误对象
 * @param {string} context - 错误上下文（如 "创建模板"、"删除记录" 等）
 * @param {Object} options - 配置选项
 * @param {boolean} options.showMessage - 是否显示消息提示，默认 true
 * @param {boolean} options.logError - 是否在控制台记录错误，默认 true
 * @param {number} options.duration - 消息显示时长（毫秒），默认 3000
 * @returns {string} 错误信息
 */
export const handleApiError = (error, context = '操作', options = {}) => {
  const {
    showMessage = true,
    logError = true,
    duration = 3000
  } = options
  
  // 控制台记录完整错误信息（开发排障用）
  if (logError) {
    console.error(`${context}失败:`, error)
    if (error.response) {
      console.error('错误详情:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      })
    }
  }
  
  // 解析错误信息
  const errorMsg = parseErrorMessage(error)
  
  // 显示用户友好的错误提示
  if (showMessage) {
    ElMessage.error({
      message: `${context}失败: ${errorMsg}`,
      duration,
      showClose: true
    })
  }
  
  return errorMsg
}

/**
 * 处理成功消息
 * @param {string} message - 成功消息
 * @param {number} duration - 显示时长（毫秒）
 */
export const handleSuccess = (message, duration = 2000) => {
  ElMessage.success({
    message,
    duration
  })
}

/**
 * 处理警告消息
 * @param {string} message - 警告消息
 * @param {number} duration - 显示时长（毫秒）
 */
export const handleWarning = (message, duration = 3000) => {
  ElMessage.warning({
    message,
    duration,
    showClose: true
  })
}

/**
 * 处理信息消息
 * @param {string} message - 信息消息
 * @param {number} duration - 显示时长（毫秒）
 */
export const handleInfo = (message, duration = 2000) => {
  ElMessage.info({
    message,
    duration
  })
}
