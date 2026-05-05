/**
 * Excel导入导出工具类
 * @description 提供统一的Excel导入导出功能
 * @date 2025-11-24
 */

const ExcelJS = require('exceljs');
const { logger } = require('./logger');

class ExcelHelper {
  /**
   * 生成Excel模板
   * @param {Array} columns - 列定义 [{header: '列名', key: 'key', width: 15}]
   * @param {Array} templateRows - 模板行（可选）
   * @param {String} sheetName - 工作表名称
   * @returns {ExcelJS.Workbook}
   */
  static createTemplate(columns, templateRows = [], sheetName = 'Sheet1') {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    // 设置列
    worksheet.columns = columns;

    // 设置表头样式
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    worksheet.getRow(1).font.color = { argb: 'FFFFFFFF' };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 25;

    // 添加示例数据
    if (templateRows.length > 0) {
      worksheet.addRows(templateRows);

      // 设置示例数据样式
      for (let i = 2; i <= templateRows.length + 1; i++) {
        worksheet.getRow(i).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' },
        };
      }
    }

    // 冻结首行
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    return workbook;
  }

  /**
   * 导出数据到Excel
   * @param {Array} data - 要导出的数据
   * @param {Array} columns - 列定义
   * @param {String} sheetName - 工作表名称
   * @returns {ExcelJS.Workbook}
   */
  static exportData(data, columns, sheetName = 'Data') {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    // 设置列
    worksheet.columns = columns;

    // 设置表头样式
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    worksheet.getRow(1).font.color = { argb: 'FFFFFFFF' };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 25;

    // 添加数据
    worksheet.addRows(data);

    // 设置数据行样式（斑马纹）
    for (let i = 2; i <= data.length + 1; i++) {
      if (i % 2 === 0) {
        worksheet.getRow(i).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9F9F9' },
        };
      }
    }

    // 冻结首行
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    return workbook;
  }

  /**
   * 从Excel文件读取数据
   * @param {Buffer} fileBuffer - 文件Buffer
   * @param {Number} sheetIndex - 工作表索引（默认第一个）
   * @returns {Promise<Array>} 返回数据数组
   */
  static async readExcel(fileBuffer, sheetIndex = 0) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer);

      const worksheet = workbook.worksheets[sheetIndex];
      if (!worksheet) {
        throw new Error('工作表不存在');
      }

      const data = [];
      const headers = [];

      // 读取表头（第一行）
      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = cell.value;
      });

      // 读取数据行（从第二行开始）
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // 跳过表头

        const rowData = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });

        // 只添加非空行
        if (Object.keys(rowData).length > 0) {
          data.push(rowData);
        }
      });

      return data;
    } catch (error) {
      logger.error('读取Excel文件失败:', error);
      throw new Error(`读取Excel文件失败: ${error.message}`, { cause: error });
    }
  }
}

module.exports = ExcelHelper;
