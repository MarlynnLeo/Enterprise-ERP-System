import { writeSafeHtmlDocument } from '@/utils/htmlSecurity';

/**
 * purchaseOrderPrintHelper.js
 * @description 采购订单打印辅助函数
 * @date 2025-10-21
 */

/**
 * 处理采购订单打印数据
 * @param {Object} order - 订单对象
 * @returns {Object} - 处理后的打印数据
 */
export function preparePurchaseOrderPrintData(order) {
  if (!order) {
    throw new Error('订单数据不能为空');
  }

  // 基本信息
  const printData = {
    // 订单信息
    order_number: order.order_number || order.code || '',
    order_date: formatDate(order.order_date || order.created_at),
    
    // 公司信息
    company_name: order.company_name || '韩国自动制御集团',
    company_name_en: order.company_name_en || 'KACON',
    company_phone: order.company_phone || '',
    company_fax: order.company_fax || '',
    company_address: order.company_address || '',
    
    // 联系人信息
    contact_person: order.contact_person || order.supplier_contact || '',
    contact_phone: order.contact_phone || order.supplier_phone || '',
    
    // 金额信息
    subtotal: formatCurrency(order.subtotal || order.total_amount || 0),
    tax_amount: formatCurrency(order.tax_amount || 0),
    total_amount: formatCurrency(order.total_amount || order.amount || 0),
    total_quantity: order.total_quantity || 0,
    
    // 备注
    notes: order.notes || order.remarks || '',
    
    // 物料列表
    items: processOrderItems(order.items || order.order_items || [])
  };

  return printData;
}

/**
 * 处理订单物料列表
 * @param {Array} items - 物料列表
 * @returns {Array} - 处理后的物料列表
 */
function processOrderItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => ({
    // 序号会由模板的 @index 处理
    material_name: item.material_name || item.product_name || item.name || '',
    material_code: item.material_code || item.code || item.drawing_no || '',
    specification: item.specification || item.specs || item.model || '',
    unit: item.unit || item.unit_name || '个',
    quantity: formatNumber(item.quantity || 0),
    price: formatCurrency(item.price || item.unit_price || 0),
    total_price: formatCurrency(item.total_price || item.amount || (item.quantity * item.price) || 0),
    delivery_date: formatDate(item.delivery_date || item.expected_date || '')
  }));
}

/**
 * 格式化数字
 * @param {Number} value - 数值
 * @param {Number} decimals - 小数位数
 * @returns {String} - 格式化后的字符串
 */
function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return '0.00';
  const num = parseFloat(value);
  return isNaN(num) ? '0.00' : num.toFixed(decimals);
}

/**
 * 格式化货币
 * @param {Number} value - 数值
 * @returns {String} - 格式化后的货币字符串
 */
function formatCurrency(value) {
  const num = parseFloat(value) || 0;
  return '¥' + num.toFixed(2);
}

/**
 * 格式化日期
 * @param {String|Date} date - 日期
 * @returns {String} - 格式化后的日期 (yyyy-MM-dd)
 */
function formatDate(date) {
  if (!date) return '';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * 处理模板循环块
 * @param {String} template - 模板内容
 * @param {Array} items - 物料列表
 * @returns {String} - 处理后的模板
 */
export function processTemplateLoop(template, items) {
  if (!Array.isArray(items) || items.length === 0) {
    // 移除循环块
    return template
      .replace(/{{#each\s+items}}[\s\S]*?{{\/each}}/g, '')
      .replace(/{{#items}}[\s\S]*?{{\/items}}/g, '');
  }

  // 提取循环内容
  let loopContent = '';
  let loopMatch = template.match(/{{#each\s+items}}([\s\S]*?){{\/each}}/);
  
  if (!loopMatch) {
    loopMatch = template.match(/{{#items}}([\s\S]*?){{\/items}}/);
  }

  if (loopMatch) {
    loopContent = loopMatch[1];
  } else {
    return template;
  }

  // 生成循环内容
  const renderedItems = items.map((item, index) => {
    let itemContent = loopContent;
    
    // 替换序号
    itemContent = itemContent.replace(/{{@index}}/g, index + 1);
    itemContent = itemContent.replace(/{{@number}}/g, index + 1);
    
    // 替换物料字段
    Object.keys(item).forEach(key => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      itemContent = itemContent.replace(regex, item[key] || '');
    });
    
    return itemContent;
  }).join('');

  // 替换循环块
  return template
    .replace(/{{#each\s+items}}[\s\S]*?{{\/each}}/g, renderedItems)
    .replace(/{{#items}}[\s\S]*?{{\/items}}/g, renderedItems);
}

/**
 * 替换模板变量
 * @param {String} template - 模板内容
 * @param {Object} data - 数据对象
 * @returns {String} - 替换后的内容
 */
export function replaceTemplateVariables(template, data) {
  let content = template;

  if (!data || typeof data !== 'object') {
    return content;
  }

  // 替换所有变量
  Object.keys(data).forEach(key => {
    if (typeof data[key] !== 'object' || data[key] === null) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      const value = data[key] !== undefined ? data[key] : '';
      content = content.replace(regex, value);
    }
  });

  // 清理未替换的变量
  content = content.replace(/{{[^}]*}}/g, '');

  return content;
}

/**
 * 完整的模板渲染
 * @param {String} template - 模板内容
 * @param {Object} data - 数据对象
 * @returns {String} - 渲染后的内容
 */
export function renderTemplate(template, data) {
  let content = template;

  // 处理循环块
  if (data.items && Array.isArray(data.items)) {
    content = processTemplateLoop(content, data.items);
  }

  // 替换变量
  content = replaceTemplateVariables(content, data);

  return content;
}

/**
 * 生成打印HTML
 * @param {String} content - 内容
 * @param {Object} options - 选项
 * @returns {String} - 完整的HTML
 */
export function generatePrintHTML(content, options = {}) {
  const {
    title = '采购订单',
    paperSize = 'A4',
    orientation = 'portrait',
    marginTop = 10,
    marginRight = 10,
    marginBottom = 10,
    marginLeft = 10
  } = options;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @page {
      size: ${paperSize} ${orientation};
      margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: "SimSun", "Microsoft YaHei", Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border: 1px solid #000;
      padding: 5px;
      text-align: left;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
      text-align: center;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
}

/**
 * 打开打印预览
 * @param {String} html - HTML内容
 * @returns {Window} - 预览窗口
 */
export function openPrintPreview(html) {
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) {
    throw new Error('无法打开打印窗口，请检查浏览器是否阻止弹出窗口');
  }
  writeSafeHtmlDocument(previewWindow, html);
  return previewWindow;
}

/**
 * 打印文档
 * @param {String} html - HTML内容
 */
export function printDocument(html) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('无法打开打印窗口，请检查浏览器是否阻止弹出窗口');
  }
  
  writeSafeHtmlDocument(printWindow, html);
  
  printWindow.onload = function() {
    printWindow.print();
    printWindow.onafterprint = function() {
      printWindow.close();
    };
  };
}
