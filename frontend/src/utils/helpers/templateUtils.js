/**
 * templateUtils.js
 * @description 模板处理工具函数集合
 * @date 2025-08-27
 * @version 2.0.0 - 纯数据库化，移除硬编码模板
 */

import { PREVIEW_DATA } from '../../constants/printConstants';

/**
 * 获取预览数据
 * @param {string} templateType 模板类型
 * @returns {object} 预览数据
 */
export function getPreviewData(templateType) {
  return PREVIEW_DATA[templateType] || {};
}

/**
 * 处理模板变量替换
 * @param {string} content 模板内容
 * @param {object} data 数据对象
 * @returns {string} 处理后的内容
 */
export function processTemplate(content, data) {
  if (!content || !data) {
    return content || '';
  }

  let processedContent = content;

  // 替换基本变量
  Object.keys(data).forEach(key => {
    if (key !== 'items' && data[key] !== undefined) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processedContent = processedContent.replace(regex, String(data[key]));
    }
  });

  // 处理循环项（如items）
  if (data.items && Array.isArray(data.items)) {
    processedContent = processItemsLoop(processedContent, data.items);
  }

  return processedContent;
}

/**
 * 处理items循环
 * @param {string} content 模板内容
 * @param {array} items 项目数组
 * @returns {string} 处理后的内容
 */
function processItemsLoop(content, items) {
  // 支持多种循环格式：{{#items}}...{{/items}}、{{#each items}}...{{/each}}、{{#each}}...{{/each}}
  let itemStart = -1;
  let itemEnd = -1;
  let loopStartTag = '';
  let loopEndTag = '{{/each}}';

  // 尝试匹配 {{#items}}...{{/items}}
  itemStart = content.indexOf('{{#items}}');
  if (itemStart !== -1) {
    itemEnd = content.indexOf('{{/items}}', itemStart);
    loopStartTag = '{{#items}}';
    loopEndTag = '{{/items}}';
  }

  // 如果没找到，尝试匹配 {{#each items}}...{{/each}}
  if (itemStart === -1) {
    const match = content.match(/{{#each\s+items}}([\s\S]*?){{\/each}}/);
    if (match) {
      itemStart = content.indexOf(match[0]);
      itemEnd = itemStart + match[0].length - '{{/each}}'.length;
      loopStartTag = match[0].substring(0, match[0].indexOf(match[1]));
      loopEndTag = '{{/each}}';
    }
  }

  // 如果还是没找到，尝试匹配 {{#each}}...{{/each}}
  if (itemStart === -1) {
    itemStart = content.indexOf('{{#each}}');
    if (itemStart !== -1) {
      itemEnd = content.indexOf('{{/each}}', itemStart);
      loopStartTag = '{{#each}}';
      loopEndTag = '{{/each}}';
    }
  }

  if (itemStart === -1 || itemEnd === -1) {
    return content;
  }

  const itemTemplate = content.substring(itemStart + loopStartTag.length, itemEnd);
  let itemsHtml = '';

  items.forEach((item, index) => {
    let itemHtml = itemTemplate;

    // 替换序号
    itemHtml = itemHtml.replace(/{{@index}}/g, index + 1);
    itemHtml = itemHtml.replace(/{{index}}/g, index + 1);

    // 替换item中的所有属性
    Object.keys(item).forEach(key => {
      // 支持 {{property}} 和 {{item.property}} 两种格式
      const regex1 = new RegExp(`{{${key}}}`, 'g');
      const regex2 = new RegExp(`{{item\\.${key}}}`, 'g');
      const value = item[key] !== undefined && item[key] !== null ? String(item[key]) : '';
      itemHtml = itemHtml.replace(regex1, value);
      itemHtml = itemHtml.replace(regex2, value);
    });

    itemsHtml += itemHtml;
  });

  // 替换整个循环部分
  const fullLoopContent = content.substring(itemStart, itemEnd + loopEndTag.length);
  return content.replace(fullLoopContent, itemsHtml);
}

/**
 * 预览模板（使用示例数据填充变量）
 * @param {object} template 模板对象
 * @returns {string} 填充后的HTML内容
 */
export function previewTemplate(template) {
  if (!template || !template.content) {
    return '';
  }

  const previewData = getPreviewData(template.template_type);
  return processTemplate(template.content, previewData);
}

/**
 * 验证模板语法
 * @param {string} content 模板内容
 * @returns {object} { isValid: boolean, errors: string[] }
 */
export function validateTemplate(content) {
  const result = {
    isValid: true,
    errors: []
  };

  if (!content || content.trim() === '') {
    result.isValid = false;
    result.errors.push('模板内容不能为空');
    return result;
  }

  // 检查基本HTML结构
  if (!content.includes('<html') && !content.includes('<!DOCTYPE')) {
    result.errors.push('建议包含完整的HTML结构（<!DOCTYPE html>）');
  }

  // 检查未闭合的变量标签
  const openBraces = (content.match(/{{/g) || []).length;
  const closeBraces = (content.match(/}}/g) || []).length;

  if (openBraces !== closeBraces) {
    result.isValid = false;
    result.errors.push('变量标签不匹配，请检查 {{ 和 }} 是否成对');
  }

  // 检查循环语法
  const itemsStart = (content.match(/{{#items}}/g) || []).length;
  const itemsEnd = (content.match(/{{\/items}}/g) || []).length;

  if (itemsStart !== itemsEnd) {
    result.isValid = false;
    result.errors.push('循环语法不匹配，请检查 {{#items}} 和 {{/items}} 标签');
  }

  const eachStart = (content.match(/{{#each/g) || []).length;
  const eachEnd = (content.match(/{{\/each}}/g) || []).length;

  if (eachStart !== eachEnd) {
    result.isValid = false;
    result.errors.push('循环语法不匹配，请检查 {{#each}} 和 {{/each}} 标签');
  }

  return result;
}

/**
 * 获取模板中使用的变量列表
 * @param {string} content 模板内容
 * @returns {array} 变量列表
 */
export function extractTemplateVariables(content) {
  if (!content) return [];

  const variablePattern = /{{([^}#/]+)}}/g;
  const variables = [];
  let match;

  while ((match = variablePattern.exec(content)) !== null) {
    const variable = match[1].trim();
    if (!variables.includes(variable)) {
      variables.push(variable);
    }
  }

  return variables;
}

/**
 * 格式化模板内容（美化HTML）
 * @param {string} content 模板内容
 * @returns {string} 格式化后的内容
 */
export function formatTemplate(content) {
  if (!content) return '';

  // 简单的HTML格式化
  const formatted = content
    .replace(/></g, '>\n<')
    .replace(/^\s+|\s+$/gm, '')
    .split('\n')
    .filter(line => line.trim() !== '')
    .join('\n');

  return formatted;
}

/**
 * 通用空白模板
 */
const BLANK_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>打印模板</title>
  <style>
    body {
      font-family: "Microsoft YaHei", Arial, sans-serif;
      margin: 0;
      padding: 20px;
      font-size: 14px;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      border: 1px solid #333;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #f0f0f0;
      font-weight: bold;
    }
    .footer {
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
    }
    .signature-box {
      width: 30%;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{title}}</h1>
  </div>
  
  <div class="info">
    <p>单据编号：{{document_no}}</p>
    <p>日期：{{date}}</p>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>序号</th>
        <th>名称</th>
        <th>数量</th>
        <th>备注</th>
      </tr>
    </thead>
    <tbody>
      {{#items}}
      <tr>
        <td>{{index}}</td>
        <td>{{name}}</td>
        <td>{{quantity}}</td>
        <td>{{remark}}</td>
      </tr>
      {{/items}}
    </tbody>
  </table>
  
  <div class="footer">
    <div class="signature-box">制单人：________________</div>
    <div class="signature-box">审核人：________________</div>
    <div class="signature-box">日期：________________</div>
  </div>
</body>
</html>`;

/**
 * 创建默认模板数据
 * @param {string} templateType 模板类型
 * @param {string} module 模块
 * @returns {object} 默认模板数据
 */
export function createDefaultTemplateData(templateType, module) {
  return {
    name: `${templateType}默认模板`,
    module: module,
    template_type: templateType,
    content: BLANK_TEMPLATE,
    paper_size: 'A4',
    orientation: 'portrait',
    margin_top: 10,
    margin_right: 10,
    margin_bottom: 10,
    margin_left: 10,
    is_default: 1,
    status: 1
  };
}
