/**
 * printService.js
 * @description 服务层文件
  * @date 2025-08-27
 * @version 1.0.0
 */

import 'axios'
import { api } from './api'
import Handlebars from 'handlebars'
import {
  decodeHtmlEntities as decodeEntities,
  escapeHtml,
  sanitizePrintHtml,
  writeSafeHtmlDocument,
} from '@/utils/htmlSecurity'

/**
 * 解码 HTML 实体（如果模板内容被转义了）
 * @param {string} text - 可能包含 HTML 实体的文本
 * @returns {string} - 解码后的文本
 */
export function decodeHtmlEntities(text) {
  return decodeEntities(text);
}

/**
 * 解析打印模板响应，适配多种响应格式
 * @param {Object} response - API 响应对象
 * @returns {Object|null} - 模板对象或 null
 */
export function parseTemplateResponse(response) {
  if (!response) return null;

  let template = null;

  // 格式1: { code: 200, data: {...} } - 传统格式
  if (response.data?.data?.content) {
    template = response.data.data;
  }
  // 格式2: { success: true, data: {...} } - ResponseHandler 格式（已被拦截器解包）
  else if (response.data?.content) {
    template = response.data;
  }
  // 格式3: { code: 200, data: { list: [...] } } - 列表格式
  else if (response.data?.data?.list?.[0]) {
    template = response.data.data.list[0];
  }
  // 格式4: { data: [...] } - 数组格式
  else if (Array.isArray(response.data?.data) && response.data.data[0]) {
    template = response.data.data[0];
  }

  // 解码 HTML 实体
  if (template?.content && (template.content.includes('&lt;') || template.content.includes('&gt;'))) {
    template.content = decodeHtmlEntities(template.content);
  }

  return template;
}

// 打印服务
const printService = {
  /**
   * 获取打印设置列表
   * @param {Object} params - 查询参数
   * @returns {Promise} - 返回打印设置列表
   */
  getPrintSettings(params) {
    return api.get('/print/settings', { params })
  },

  /**
   * 获取打印设置详情
   * @param {Number} id - 打印设置ID
   * @returns {Promise} - 返回打印设置详情
   */
  getPrintSettingById(id) {
    return api.get(`/print/settings/${id}`)
  },

  /**
   * 创建打印设置
   * @param {Object} data - 打印设置数据
   * @returns {Promise} - 返回创建结果
   */
  createPrintSetting(data) {
    return api.post('/print/settings', data)
  },

  /**
   * 更新打印设置
   * @param {Number} id - 打印设置ID
   * @param {Object} data - 打印设置数据
   * @returns {Promise} - 返回更新结果
   */
  updatePrintSetting(id, data) {
    return api.put(`/print/settings/${id}`, data)
  },

  /**
   * 删除打印设置
   * @param {Number} id - 打印设置ID
   * @returns {Promise} - 返回删除结果
   */
  deletePrintSetting(id) {
    return api.delete(`/print/settings/${id}`)
  },

  /**
   * 获取打印模板列表
   * @param {Object} params - 查询参数
   * @returns {Promise} - 返回打印模板列表
   */
  getPrintTemplates(params) {
    return api.get('/print/templates', { params })
  },

  /**
   * 获取打印模板详情
   * @param {Number} id - 打印模板ID
   * @returns {Promise} - 返回打印模板详情
   */
  getPrintTemplateById(id) {
    return api.get(`/print/templates/${id}`)
  },

  /**
   * 获取默认打印模板
   * @param {String} module - 模块名称
   * @param {String} type - 模板类型
   * @returns {Promise} - 返回默认打印模板
   */
  getDefaultTemplate(module, type) {
    return api.get('/print/templates/default', { params: { module, template_type: type } })
  },

  /**
   * 创建打印模板
   * @param {Object} data - 打印模板数据
   * @returns {Promise} - 返回创建结果
   */
  createPrintTemplate(data) {
    return api.post('/print/templates', data)
  },

  /**
   * 更新打印模板
   * @param {Number} id - 打印模板ID
   * @param {Object} data - 打印模板数据
   * @returns {Promise} - 返回更新结果
   */
  updatePrintTemplate(id, data) {
    return api.put(`/print/templates/${id}`, data)
  },

  /**
   * 删除打印模板
   * @param {Number} id - 打印模板ID
   * @returns {Promise} - 返回删除结果
   */
  deletePrintTemplate(id) {
    return api.delete(`/print/templates/${id}`)
  },

  /**
   * 生成打印内容
   * @param {Object} template - 打印模板
   * @param {Object} data - 打印数据
   * @returns {String} - 返回生成的HTML内容
   */
  generatePrintContent(template, data) {
    // 验证模板对象
    if (!template) {
      throw new Error('打印模板为空');
    }

    // 验证模板内容
    if (!template.content) {
      throw new Error('打印模板内容为空，请先配置打印模板');
    }

    try {
      // 解码 HTML 实体（如果模板内容被转义了）
      let templateContent = template.content;
      if (templateContent && (templateContent.includes('&lt;') || templateContent.includes('&gt;'))) {
        templateContent = decodeHtmlEntities(templateContent);
      }

      // 使用Handlebars编译模板
      const compiledTemplate = Handlebars.compile(templateContent);

      // 使用数据渲染模板
      const content = compiledTemplate(data);

      // 构建打印样式
      const style = `
        <style>
          @page {
            size: ${template.paper_size || 'A4'} ${template.orientation || 'portrait'};
            margin: ${template.margin_top || 10}mm ${template.margin_right || 10}mm ${template.margin_bottom || 10}mm ${template.margin_left || 10}mm;
          }
          body {
            font-family: Arial, sans-serif;
            font-size: 12pt;
          }
          .page-break {
            page-break-after: always;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #000;
            padding: 5px;
          }
          th {
            background-color: #f0f0f0;
          }
        </style>
      `;

      return sanitizePrintHtml(`<!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>打印文档</title>
            ${style}
          </head>
          <body>
            ${content}
          </body>
        </html>
      `);
    } catch {
      // 如果Handlebars不可用或出错，回退到简单的变量替换
      let content = template.content;

      // 验证内容是否存在
      if (!content) {
        throw new Error('模板内容为空，无法生成打印内容');
      }

      // 解码 HTML 实体
      if (content && (content.includes('&lt;') || content.includes('&gt;'))) {
        content = decodeHtmlEntities(content);
      }

      // 替换变量占位符
      if (data) {
        Object.keys(data).forEach(key => {
          // 只替换简单变量，不处理复杂的模板标签
          if (typeof data[key] !== 'object' && key !== 'items') {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            content = content.replace(regex, escapeHtml(data[key] || ''));
          }
        });
      }

      // 构建打印样式
      const style = `
        <style>
          @page {
            size: ${template.paper_size || 'A4'} ${template.orientation || 'portrait'};
            margin: ${template.margin_top || 10}mm ${template.margin_right || 10}mm ${template.margin_bottom || 10}mm ${template.margin_left || 10}mm;
          }
          body {
            font-family: Arial, sans-serif;
            font-size: 12pt;
          }
          .page-break {
            page-break-after: always;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #000;
            padding: 5px;
          }
          th {
            background-color: #f0f0f0;
          }
        </style>
      `;

      return sanitizePrintHtml(`<!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>打印文档</title>
            ${style}
          </head>
          <body>
            ${content}
          </body>
        </html>
      `);
    }
  },

  /**
   * 打印文档
   * @param {String} html - 打印内容HTML
   */
  printDocument(html) {
    // 创建打印窗口
    const printWindow = window.open('', '_blank')
    writeSafeHtmlDocument(printWindow, html)
    
    // 等待资源加载完成后打印
    printWindow.onload = function() {
      printWindow.print()
      // 打印完成后关闭窗口
      printWindow.onafterprint = function() {
        printWindow.close()
      }
    }
  },

  /**
   * 打印预览
   * @param {String} html - 打印内容HTML
   * @returns {Window} - 返回预览窗口
   */
  previewDocument(html) {
    const previewWindow = window.open('', '_blank')
    return writeSafeHtmlDocument(previewWindow, html)
  }
}

export default printService 
