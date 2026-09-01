/**
 * DocxInspectionTemplateParser.js
 * @description 质量检验记录单 Word (.docx) 模板解析器服务
 * @version 1.0.0
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { logger } = require('../../../utils/logger');

class DocxInspectionTemplateParser {
  /**
   * 纯 Node 原生解压提取 docx 中的 word/document.xml (基于标准 PKZip 规范)
   * @param {Buffer} buffer - docx 文件 Buffer
   * @returns {string} document.xml 文本内容
   */
  static extractDocxDocumentXml(buffer) {
    if (!buffer || buffer.length < 30) {
      throw new Error('无效的 Word (.docx) 文件');
    }

    let offset = 0;
    while (offset < buffer.length - 4) {
      // 匹配 Local File Header 魔数 0x04034b50 (PK\x03\x04)
      if (buffer.readUInt32LE(offset) === 0x04034b50) {
        const compression = buffer.readUInt16LE(offset + 8);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const fileNameLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const fileName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLen);
        const fileDataOffset = offset + 30 + fileNameLen + extraLen;

        if (fileName === 'word/document.xml') {
          const compressedData = buffer.subarray(fileDataOffset, fileDataOffset + compressedSize);
          if (compression === 8) {
            return zlib.inflateRawSync(compressedData).toString('utf8');
          } else if (compression === 0) {
            return compressedData.toString('utf8');
          } else {
            throw new Error(`不支持的 ZIP 压缩方式: ${compression}`);
          }
        }
        offset = fileDataOffset + compressedSize;
      } else {
        offset++;
      }
    }

    throw new Error('未在 docx 文件中找到 word/document.xml，请确认文件是否有效');
  }

  /**
   * 解析检验记录单 Word 文档
   * @param {Buffer} buffer - Word 文件 Buffer
   * @param {string} fileName - 原始文件名
   * @returns {Object} 结构化检验模板数据
   */
  static parseQualityInspectionDocx(buffer, fileName = '') {
    const xml = this.extractDocxDocumentXml(buffer);

    // 提取所有表格数据
    const tableRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
    let tblMatch;
    const tables = [];

    while ((tblMatch = tableRegex.exec(xml)) !== null) {
      const tblXml = tblMatch[0];
      const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
      let trMatch;
      const rows = [];
      while ((trMatch = rowRegex.exec(tblXml)) !== null) {
        const trXml = trMatch[0];
        const cellRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
        let tcMatch;
        const cells = [];
        while ((tcMatch = cellRegex.exec(trXml)) !== null) {
          const tcXml = tcMatch[0];
          const textMatches = tcXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
          const text = textMatches.map((t) => t.replace(/<w:t[^>]*>|<\/w:t>/g, '')).join('');
          cells.push(text.trim());
        }
        rows.push(cells);
      }
      tables.push(rows);
    }

    if (tables.length === 0) {
      throw new Error('Word 文档中未识别到检验记录表格，请确保文档包含标准检验记录单表格');
    }

    const table = tables[0];
    const meta = {
      partName: '',
      spec: '',
      materialCode: '',
      supplier: '',
      materialGrade: '',
      inspectionStandard: '',
      samplingPlan: '',
      isAql: false,
      aqlLevel: '',
    };

    // 从文件名提取物料编码（如 3011001001...）
    if (fileName) {
      const codeMatch = fileName.match(/^(\d{8,12})/);
      if (codeMatch) {
        meta.materialCode = codeMatch[1];
      }
    }

    let itemsHeaderIndex = -1;
    const items = [];

    for (let r = 0; r < table.length; r++) {
      const row = table[r];
      const rowText = row.join(' ');

      // 提取表头字段
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (['零件名称', '物料名称', '品名', '产品名称'].includes(cell)) {
          if (row[c + 1]) meta.partName = row[c + 1];
        } else if (['规格型号', '规格', '型号'].includes(cell)) {
          if (row[c + 1]) meta.spec = row[c + 1];
        } else if (['物料编码', '物料代码', '物料编号', '编码'].includes(cell)) {
          if (row[c + 1]) meta.materialCode = row[c + 1];
        } else if (['供应商', '供方'].includes(cell)) {
          if (row[c + 1]) meta.supplier = row[c + 1];
        } else if (['材质', '材料'].includes(cell)) {
          if (row[c + 1]) meta.materialGrade = row[c + 1];
        }
      }

      // 检验依据
      if (rowText.includes('检验依据') || rowText.includes('检验标准') || rowText.includes('检验规范')) {
        meta.inspectionStandard = rowText.replace(/^.*(?:检验依据|检验标准|检验规范)[：:]\s*/, '').trim();
      }

      // 抽样方案 / AQL
      if (rowText.includes('抽样方案') || rowText.includes('AQL') || rowText.includes('GB/T 2828')) {
        meta.samplingPlan = rowText.replace(/^.*抽样方案[：:]\s*/, '').trim();
        meta.isAql = true;
        if (meta.samplingPlan.includes('GB/T 2828')) {
          meta.aqlLevel = 'GB/T 2828.1 II';
        } else {
          meta.aqlLevel = 'II';
        }
      }

      // 识别检验项目表头行
      const isHeaderRow =
        row.some((c) => /检验项目|项目名称|^项目$/.test(c)) ||
        (row.some((c) => c.includes('项目')) &&
          row.some((c) => c.includes('标准') || c.includes('要求') || c.includes('方法') || c.includes('器具')));
      if (isHeaderRow) {
        itemsHeaderIndex = r;
        break;
      }
    }

    // 解析检验项目
    if (itemsHeaderIndex >= 0) {
      const headerRow = table[itemsHeaderIndex] || [];
      let itemColIndex = -1;
      let standardColIndex = -1;
      let methodColIndex = -1;

      for (let c = 0; c < headerRow.length; c++) {
        const hText = (headerRow[c] || '').trim();
        if (
          itemColIndex === -1 &&
          (/检验项目|项目名称|^项目$/.test(hText) ||
            (hText.includes('项目') && !hText.includes('数') && !hText.includes('结论') && !hText.includes('明细')))
        ) {
          itemColIndex = c;
        } else if (
          standardColIndex === -1 &&
          (/检验要求|技术要求|检验标准|技术标准|标准|要求/.test(hText) && !hText.includes('项目'))
        ) {
          standardColIndex = c;
        } else if (
          methodColIndex === -1 &&
          (/检测方法|检验方法|检测器具|检验器具|检测工具|检验工具|量具|仪器|^方法$/.test(hText))
        ) {
          methodColIndex = c;
        }
      }

      // 兜底列索引
      if (itemColIndex === -1) itemColIndex = 0;
      if (standardColIndex === -1) standardColIndex = itemColIndex + 1;
      if (methodColIndex === -1) methodColIndex = standardColIndex + 1;

      let dataStartRow = itemsHeaderIndex + 1;
      // 跳过实测值次级表头（1#, 2#, ...）
      if (dataStartRow < table.length) {
        const nextRow = table[dataStartRow];
        if (nextRow.some((c) => c.includes('1#') || c.includes('#'))) {
          dataStartRow++;
        }
      }

      for (let r = dataStartRow; r < table.length; r++) {
        const row = table[r];
        if (row.length === 0) continue;

        const firstCell = (row[0] || '').trim();
        // 遇到不合格品处置/结论等行时停止
        if (
          firstCell.includes('不合格') ||
          firstCell.includes('处置') ||
          firstCell.includes('不良数') ||
          firstCell.includes('结论') ||
          firstCell.includes('判定') ||
          firstCell.includes('备注') ||
          firstCell.includes('检验员')
        ) {
          break;
        }

        let itemName = (row[itemColIndex] || '').trim();
        let standard = (row[standardColIndex] || '').trim();
        let method = (row[methodColIndex] || '').trim();

        // 兼容序号列：若第一列是纯数字序号，则自动从下一列提取实际项目名称
        if (/^\d+$/.test(itemName) && itemColIndex === 0 && row.length > 1) {
          itemName = (row[1] || '').trim();
          standard = (row[2] || '').trim();
          method = (row[3] || '').trim();
        }

        if (!itemName || itemName === '—' || itemName === '-' || itemName.length > 60) continue;

        // 智能分类与公差解析
        let type = 'other';
        let dimension_value = null;
        let tolerance_upper = null;
        let tolerance_lower = null;
        let is_critical = false;

        const lowerMethod = method.toLowerCase();
        const textForType = `${itemName} ${standard} ${method}`;

        if (
          lowerMethod.includes('卡尺') ||
          lowerMethod.includes('千分尺') ||
          lowerMethod.includes('量规') ||
          itemName.includes('径') ||
          itemName.includes('长') ||
          itemName.includes('宽') ||
          itemName.includes('高') ||
          itemName.includes('厚') ||
          itemName.includes('尺寸') ||
          standard.includes('mm') ||
          standard.includes('～') ||
          standard.includes('~') ||
          standard.includes('±')
        ) {
          type = 'dimension';
          // 尝试解析尺寸公差
          const rangeMatch = standard.match(/([0-9.]+)\s*[～~至-]\s*([0-9.]+)\s*mm?/);
          if (rangeMatch) {
            const min = parseFloat(rangeMatch[1]);
            const max = parseFloat(rangeMatch[2]);
            if (!isNaN(min) && !isNaN(max)) {
              const nominal = (min + max) / 2;
              dimension_value = parseFloat(nominal.toFixed(3));
              tolerance_upper = parseFloat((max - nominal).toFixed(3));
              tolerance_lower = parseFloat((min - nominal).toFixed(3));
            }
          } else {
            const plusMinusMatch = standard.match(/([0-9.]+)\s*±\s*([0-9.]+)/);
            if (plusMinusMatch) {
              const nominal = parseFloat(plusMinusMatch[1]);
              const tol = parseFloat(plusMinusMatch[2]);
              if (!isNaN(nominal) && !isNaN(tol)) {
                dimension_value = nominal;
                tolerance_upper = tol;
                tolerance_lower = -tol;
              }
            }
          }
        } else if (
          textForType.includes('目测') ||
          textForType.includes('目视') ||
          textForType.includes('外观') ||
          textForType.includes('包装') ||
          textForType.includes('标识') ||
          textForType.includes('混料') ||
          textForType.includes('表面处理')
        ) {
          type = 'visual';
        } else if (
          textForType.includes('通规') ||
          textForType.includes('止规') ||
          textForType.includes('通止') ||
          textForType.includes('螺纹')
        ) {
          type = 'function';
        } else if (
          textForType.includes('扭矩') ||
          textForType.includes('盐雾') ||
          textForType.includes('硬度') ||
          textForType.includes('拉力') ||
          textForType.includes('疲劳') ||
          textForType.includes('绝缘') ||
          textForType.includes('耐压')
        ) {
          type = 'performance';
        }

        if (
          textForType.includes('关键') ||
          textForType.includes('破坏扭矩') ||
          textForType.includes('材质') ||
          textForType.includes('材质要求')
        ) {
          is_critical = true;
        }

        const methodVal = method || '目测';
        items.push({
          itemName: itemName,
          item_name: itemName,
          standard: standard || '符合要求',
          method: methodVal,
          inspectionMethod: methodVal,
          inspection_method: methodVal,
          type,
          isCritical: is_critical,
          is_critical,
          dimensionValue: dimension_value,
          dimension_value,
          toleranceUpper: tolerance_upper,
          tolerance_upper,
          toleranceLower: tolerance_lower,
          tolerance_lower,
        });
      }
    }

    // 组合模板名称
    let templateName;
    if (meta.partName && meta.spec) {
      templateName = `${meta.partName} (${meta.spec}) 检验记录单`;
    } else if (meta.partName) {
      templateName = `${meta.partName} 检验记录单`;
    } else if (fileName) {
      templateName = fileName.replace(/\.docx$/i, '');
    } else {
      templateName = '检验记录单模板';
    }

    return {
      templateName,
      inspectionType: 'incoming', // 默认来料检验
      version: '1.0',
      description: [
        meta.inspectionStandard ? `检验依据: ${meta.inspectionStandard}` : '',
        meta.samplingPlan ? `抽样方案: ${meta.samplingPlan}` : '',
        meta.supplier ? `供应商: ${meta.supplier}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
      materialCode: meta.materialCode,
      spec: meta.spec,
      partName: meta.partName,
      isAql: meta.isAql,
      aqlLevel: meta.aqlLevel || 'GB/T 2828.1 II',
      priority: 100,
      items,
    };
  }

  /**
   * 在数据库中查找匹配物料
   * @param {Object} parsedMeta - 解析出的元信息
   * @param {Object} db - Sequelize 数据库实例
   * @returns {Promise<Object>} 匹配的物料信息
   */
  static async matchMaterials(parsedMeta, db) {
    const { materialCode, partName, spec } = parsedMeta;
    let matchedMaterials = [];

    // 1. 优先按物料编码精确查询
    if (materialCode) {
      const [exactRows] = await db.sequelize.query(
        'SELECT id, code, name, specs FROM materials WHERE code = ? LIMIT 10',
        { replacements: [materialCode] }
      );
      if (exactRows.length > 0) {
        matchedMaterials = exactRows;
      }
    }

    // 2. 如果精确编码未找到，或编码部分匹配，尝试前缀或品名规格匹配
    if (matchedMaterials.length === 0 && materialCode) {
      const [prefixRows] = await db.sequelize.query(
        'SELECT id, code, name, specs FROM materials WHERE code LIKE ? LIMIT 10',
        { replacements: [`${materialCode}%`] }
      );
      if (prefixRows.length > 0) {
        matchedMaterials = prefixRows;
      }
    }

    if (matchedMaterials.length === 0 && (partName || spec)) {
      const conditions = [];
      const params = [];
      if (partName) {
        conditions.push('name LIKE ?');
        params.push(`%${partName}%`);
      }
      if (spec) {
        conditions.push('specs LIKE ?');
        params.push(`%${spec}%`);
      }

      if (conditions.length > 0) {
        const [fuzzyRows] = await db.sequelize.query(
          `SELECT id, code, name, specs FROM materials WHERE ${conditions.join(' AND ')} LIMIT 10`,
          { replacements: params }
        );
        matchedMaterials = fuzzyRows;
      }
    }

    return {
      materialIds: matchedMaterials.map((m) => m.id),
      matchedMaterials,
    };
  }

  /**
   * 扫描系统根目录及 docs/ 下预置的检验记录单 Word 文档
   * @param {string} rootDir - 根目录路径
   * @returns {Array<Object>} 预置文档列表
   */
  static getPresetDocxList(rootDir = 'f:/ERP') {
    const presetFiles = [];
    const searchDirs = [rootDir, path.join(rootDir, 'docs')];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (
            file.endsWith('.docx') &&
            (file.includes('检验') || file.includes('3011001001') || file.includes('QRZK'))
          ) {
            const fullPath = path.join(dir, file);
            const stats = fs.statSync(fullPath);
            presetFiles.push({
              fileName: file,
              fullPath,
              size: stats.size,
              updatedAt: stats.mtime,
            });
          }
        }
      } catch (err) {
        logger.warn(`扫描预置文档目录 ${dir} 失败:`, err.message);
      }
    }

    return presetFiles;
  }
}

module.exports = DocxInspectionTemplateParser;
