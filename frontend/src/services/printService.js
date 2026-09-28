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
  writeSafeHtmlDocument,
} from '@/utils/htmlSecurity'
import { parseResponseData } from '@/utils/responseParser'
import { renderPrintTemplate } from '@/utils/cspSafePrintRenderer'
import { autoFitPrintDocument } from '@/utils/printAutoFit'
import { getAppFontFamily } from '@/utils/typography'
import { SPPLM_FONT_FACE_CSS } from '@/assets/fonts/signatureFont'
import { resolveSignatureCode } from '@/constants/signatureConstants'

const getTemplateField = (template, snakeKey, camelKey, fallback = undefined) => {
  if (template?.[snakeKey] !== undefined && template?.[snakeKey] !== null) return template[snakeKey]
  if (template?.[camelKey] !== undefined && template?.[camelKey] !== null) return template[camelKey]
  return fallback
}

async function waitForPrintAssets(printDocument) {
  let timeout
  try {
    const ready = async () => {
      if (printDocument.fonts) {
        // Force layout to discover template fonts before observing FontFaceSet.ready.
        printDocument.body.getBoundingClientRect()
        const signatures = Array.from(printDocument.querySelectorAll('.signature-handwritten, .signature-font'))
          .map(element => element.textContent).join('')
        if (signatures.trim()) await printDocument.fonts.load('24pt SPPLMFONT', signatures)
        await printDocument.fonts.ready
      }
      await Promise.all(Array.from(printDocument.images, image => {
        if (image.complete) {
          return image.naturalWidth ? undefined : Promise.reject(new Error('打印图片加载失败'))
        }
        return new Promise((resolve, reject) => {
          image.onload = resolve
          image.onerror = () => reject(new Error('打印图片加载失败'))
        })
      }))
    }
    await Promise.race([
      ready(),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('打印字体或图片加载超时，请重试')), 15000) }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

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

  for (const role of ['inspector', 'reviewer', 'technical', 'approver']) {
    const code = resolveSignatureCode(out[`${role}_signature_code`] ?? out[`${role}_signature`])
    if (code || Object.hasOwn(out, `${role}_signature`) || Object.hasOwn(out, `${role}_signature_code`)) {
      out[`${role}_signature`] = code
      out[`${role}_signature_code`] = code
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

    let templateContent = template.content
    if (templateContent.includes('&lt;') || templateContent.includes('&gt;')) {
      templateContent = decodeHtmlEntities(templateContent)
    }
    // Rendering errors must reach the caller. Partial placeholder replacement can silently
    // omit inspection rows and conditionals from an otherwise plausible report.
    const content = renderPrintTemplate(templateContent, normalizePrintData(data || {}))
    const mt = getTemplateField(template, 'margin_top', 'marginTop', 10)
    const mr = getTemplateField(template, 'margin_right', 'marginRight', 10)
    const mb = getTemplateField(template, 'margin_bottom', 'marginBottom', 10)
    const ml = getTemplateField(template, 'margin_left', 'marginLeft', 10)
    const paperSize = getTemplateField(template, 'paper_size', 'paperSize', 'A4')
    const orientation = getTemplateField(template, 'orientation', 'orientation', 'portrait')
    const docTitle = escapeHtml(template.name || data?.title || '打印文档')
    return sanitizePrintHtml(`<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${docTitle}</title>
          <style id="erp-print-spplmfont">${SPPLM_FONT_FACE_CSS}</style>
          <style>
            @page { size: ${paperSize} ${orientation}; margin: 0; }
            body {
              font-family: ${getAppFontFamily()};
              font-size: 12pt;
              color: #111;
              background: #fff;
              margin: 0;
              padding: ${mt}mm ${mr}mm ${mb}mm ${ml}mm;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page-break { page-break-after: always; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #333; padding: 5px; }
            th { background-color: #fff; }
          </style>
        </head>
        <body>${content}</body>
      </html>`)
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
  async printDocument(html) {
    if (document.getElementById('__erp_print_frame__')) {
      throw new Error('已有打印任务正在进行，请关闭当前打印对话框后重试')
    }
    const iframe = document.createElement('iframe')
    iframe.id = '__erp_print_frame__'
    iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:210mm;height:297mm;border:none;'
    document.body.appendChild(iframe)
    const printWindow = iframe.contentWindow
    let fallbackTimer
    try {
      writeSafeHtmlDocument(printWindow, html)
      const printDocument = printWindow.document
      await waitForPrintAssets(printDocument)
      autoFitPrintDocument(printDocument)
      await new Promise((resolve, reject) => {
        // Some browsers dispatch afterprint before print() returns.
        const supportsAfterPrint = 'onafterprint' in printWindow
        printWindow.onafterprint = resolve
        try {
          printWindow.focus()
          printWindow.print()
          if (!supportsAfterPrint) fallbackTimer = setTimeout(resolve, 3000)
        } catch (error) {
          reject(error)
        }
      })
    } finally {
      clearTimeout(fallbackTimer)
      printWindow.onafterprint = null
      iframe.remove()
    }
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
