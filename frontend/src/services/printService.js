/**
 * printService.js
 * @description 服务层文件
  * @date 2025-08-27
 * @version 1.0.0
 */

import 'axios'
import { printApi } from '@/api/print'
import { systemApi } from '@/api/system'
import {
  decodeHtmlEntities as decodeEntities,
  escapeHtml,
  sanitizePrintHtml,
} from '@/utils/htmlSecurity'
import { getCssTokenValue } from '@/utils/designTokens'
import { parseResponseData } from '@/utils/responseParser'
import { renderPrintTemplate } from '@/utils/cspSafePrintRenderer'

const getPrintTokens = () => ({
  border: getCssTokenValue('textPrimary'),
  headerBg: getCssTokenValue('page')
})

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

  const payload = parseResponseData(response, null);
  let template = null;

  if (payload?.content) {
    template = payload;
  } else if (payload?.list?.[0]) {
    template = payload.list[0];
  } else if (Array.isArray(payload) && payload[0]) {
    template = payload[0];
  }

  if (template?.content && (template.content.includes('&lt;') || template.content.includes('&gt;'))) {
    template.content = decodeHtmlEntities(template.content);
  }

  return template;
}
export function normalizeTemplateListResponse(response) {
  const payload = response?.data ?? response;

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;

  return [];
}

export function normalizeSystemSettings(response) {
  const payload = response?.data ?? response;

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.data)) return payload.data;

  return [];
}

function getSettingValue(settings, key) {
  const item = settings.find((setting) => setting.key === key || setting.setting_key === key);
  return item?.value ?? item?.setting_value ?? '';
}

/**
 * camelCase → snake_case（打印模板历史占位多为 snake）
 * 例：outboundNo → outbound_no，materialCode → material_code
 */
function camelToSnakeKey(key) {
  if (typeof key !== 'string' || !key) return key;
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * 打印数据归一：业务侧只传 camel，模板仍可读 snake 占位。
 * - 已有 snake 键不覆盖
 * - 递归 items / 嵌套对象
 */
export function normalizePrintData(data) {
  if (data == null || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map((item) => normalizePrintData(item));
  }

  const out = {};
  for (const [key, value] of Object.entries(data)) {
    const normalizedValue =
      value != null && typeof value === 'object' ? normalizePrintData(value) : value;
    out[key] = normalizedValue;

    const snake = camelToSnakeKey(key);
    if (snake !== key && out[snake] === undefined) {
      out[snake] = normalizedValue;
    }
  }
  return out;
}

// 打印服务
const printService = {
  /**
   * 获取打印设置列表
   * @param {Object} params - 查询参数
   * @returns {Promise} - 返回打印设置列表
   */
  getPrintSettings(params) {
    return printApi.getSettings(params)
  },

  /**
   * 获取打印设置详情
   * @param {Number} id - 打印设置ID
   * @returns {Promise} - 返回打印设置详情
   */
  getPrintSettingById(id) {
    return printApi.getSetting(id)
  },

  /**
   * 创建打印设置
   * @param {Object} data - 打印设置数据
   * @returns {Promise} - 返回创建结果
   */
  createPrintSetting(data) {
    return printApi.createSetting(data)
  },

  /**
   * 更新打印设置
   * @param {Number} id - 打印设置ID
   * @param {Object} data - 打印设置数据
   * @returns {Promise} - 返回更新结果
   */
  updatePrintSetting(id, data) {
    return printApi.updateSetting(id, data)
  },

  /**
   * 删除打印设置
   * @param {Number} id - 打印设置ID
   * @returns {Promise} - 返回删除结果
   */
  deletePrintSetting(id) {
    return printApi.deleteSetting(id)
  },

  /**
   * 获取打印模板列表
   * @param {Object} params - 查询参数
   * @returns {Promise} - 返回打印模板列表
   */
  getPrintTemplates(params) {
    return printApi.getTemplates(params)
  },

  /**
   * 获取打印模板详情
   * @param {Number} id - 打印模板ID
   * @returns {Promise} - 返回打印模板详情
   */
  getPrintTemplateById(id) {
    return printApi.getTemplate(id)
  },

  /**
   * 获取默认打印模板
   * @param {String} module - 模块名称
   * @param {String} type - 模板类型
   * @returns {Promise} - 返回默认打印模板
   */
  getDefaultTemplate(module, type) {
    return printApi.getDefaultTemplate(module, type)
  },

  async getDefaultTemplateData(module, type) {
    const response = await this.getDefaultTemplate(module, type)
    const template = parseTemplateResponse(response)
    if (!template?.content) {
      throw new Error(`未找到 ${module}/${type} 默认打印模板，请在系统管理-打印管理中配置`)
    }
    return template
  },

  async getCompanyInfo() {
    const response = await systemApi.getSettings()
    const settings = normalizeSystemSettings(response)

    return {
      company_name: getSettingValue(settings, 'company_name'),
      company_phone: getSettingValue(settings, 'company_phone'),
      company_fax: getSettingValue(settings, 'company_fax'),
      company_address: getSettingValue(settings, 'company_address')
    }
  },

  /**
   * 创建打印模板
   * @param {Object} data - 打印模板数据
   * @returns {Promise} - 返回创建结果
   */
  createPrintTemplate(data) {
    return printApi.createTemplate(data)
  },

  /**
   * 更新打印模板
   * @param {Number} id - 打印模板ID
   * @param {Object} data - 打印模板数据
   * @returns {Promise} - 返回更新结果
   */
  updatePrintTemplate(id, data) {
    return printApi.updateTemplate(id, data)
  },

  /**
   * 删除打印模板
   * @param {Number} id - 打印模板ID
   * @returns {Promise} - 返回删除结果
   */
  deletePrintTemplate(id) {
    return printApi.deleteTemplate(id)
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

      // CSP-safe renderer（不使用 Handlebars.compile / new Function）
      const content = renderPrintTemplate(
        templateContent,
        normalizePrintData(data || {})
      );

      // 构建打印样式
      const printTokens = getPrintTokens()
      const mt = template.margin_top || 10
      const mr = template.margin_right || 10
      const mb = template.margin_bottom || 10
      const ml = template.margin_left || 10
      const style = `
        <style>
          @page {
            size: ${template.paper_size || 'A4'} ${template.orientation || 'portrait'};
            margin: 0;
          }
          body {
            font-family: Arial, 'Microsoft YaHei', sans-serif;
            font-size: 12pt;
            margin: 0;
            padding: ${mt}mm ${mr}mm ${mb}mm ${ml}mm;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page-break {
            page-break-after: always;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid ${printTokens.border};
            padding: 5px;
          }
          th {
            background-color: ${printTokens.headerBg};
          }
        </style>
      `;

      const docTitle = template.name || data?.title || '打印文档'
      return sanitizePrintHtml(`<!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${docTitle}</title>
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
      const printTokens = getPrintTokens()
      const mt = template.margin_top || 10
      const mr = template.margin_right || 10
      const mb = template.margin_bottom || 10
      const ml = template.margin_left || 10
      const style = `
        <style>
          @page {
            size: ${template.paper_size || 'A4'} ${template.orientation || 'portrait'};
            margin: 0;
          }
          body {
            font-family: Arial, 'Microsoft YaHei', sans-serif;
            font-size: 12pt;
            margin: 0;
            padding: ${mt}mm ${mr}mm ${mb}mm ${ml}mm;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page-break {
            page-break-after: always;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid ${printTokens.border};
            padding: 5px;
          }
          th {
            background-color: ${printTokens.headerBg};
          }
        </style>
      `;

      const docTitle = template.name || data?.title || '打印文档'
      return sanitizePrintHtml(`<!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${docTitle}</title>
            ${style}
          </head>
          <body>
            ${content}
          </body>
        </html>
      `);
    }
  },

  async generateByDefaultTemplate(module, type, data) {
    const template = await this.getDefaultTemplateData(module, type)
    let companyInfo = {}

    try {
      companyInfo = await this.getCompanyInfo()
    } catch {
      companyInfo = {}
    }

    // 业务 camel + 模板 snake 别名（SSOT：调用方只传 camel）
    const printData = normalizePrintData({ ...companyInfo, ...(data || {}) })
    return this.generatePrintContent(template, printData)
  },

  async previewByDefaultTemplate(module, type, data) {
    const html = await this.generateByDefaultTemplate(module, type, data)
    return this.previewDocument(html)
  },

  async printByDefaultTemplate(module, type, data) {
    const html = await this.generateByDefaultTemplate(module, type, data)
    return this.printDocument(html)
  },

  printCurrentPage() {
    window.print()
  },

  /**
   * 通过隐藏 iframe 打印 HTML 文档
   * 不打开新窗口、不显示 about:blank，直接弹出浏览器打印对话框
   * @param {String} html - 打印内容 HTML
   * @returns {Promise} - 打印完成后 resolve
   */
  printDocument(html) {
    return new Promise((resolve) => {
      // 移除上一次可能残留的打印 iframe
      const existingFrame = document.getElementById('__erp_print_frame__')
      if (existingFrame) {
        existingFrame.remove()
      }

      // 创建隐藏 iframe
      const iframe = document.createElement('iframe')
      iframe.id = '__erp_print_frame__'
      iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:0;height:0;border:none;'
      document.body.appendChild(iframe)

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
      iframeDoc.open()
      iframeDoc.write(html)
      iframeDoc.close()

      // 等待 iframe 渲染完成后触发打印
      const triggerPrint = () => {
        try {
          iframe.contentWindow.focus()
          iframe.contentWindow.print()
        } catch (e) {
          console.warn('打印调用失败:', e)
        }

        // 打印完成或取消后清理 iframe
        const cleanup = () => {
          setTimeout(() => {
            iframe.remove()
            resolve()
          }, 100)
        }

        // 优先使用 onafterprint 事件，兼容直接延迟清理
        if ('onafterprint' in iframe.contentWindow) {
          iframe.contentWindow.onafterprint = cleanup
        } else {
          // Safari 不支持 onafterprint，延迟清理
          setTimeout(cleanup, 3000)
        }
      }

      // iframe 使用 document.write 后 load 事件在部分浏览器不触发
      // 用 requestAnimationFrame + setTimeout 确保渲染完成
      setTimeout(triggerPrint, 300)
    })
  },

  /**
   * 打印预览（等同于打印，统一使用隐藏 iframe）
   * @param {String} html - 打印内容 HTML
   * @returns {Promise}
   */
  previewDocument(html) {
    return this.printDocument(html)
  }
}

export default printService
