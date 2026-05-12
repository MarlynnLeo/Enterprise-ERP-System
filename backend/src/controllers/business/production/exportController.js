/**
 * exportController.js
 * @description 生产数据导出控制器
 * @date 2025-10-16
 * @version 1.0.0
 */

const { logger } = require('../../../utils/logger');
const { pool } = require('../../../config/db');
const { handleError } = require('./shared/errorHandler');
const ExcelJS = require('exceljs');

/**
 * 导出生产数据
 */
exports.exportProductionData = async (req, res) => {
  try {
    const { type = 'plans', startDate, endDate, status } = req.query;

    let query = '';
    const params = [];
    let sheetName = '';
    let columns = [];

    if (type === 'plans') {
      sheetName = '生产计划';
      columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: '计划编号', key: 'code', width: 15 },
        { header: '计划名称', key: 'name', width: 20 },
        { header: '产品编码', key: 'product_code', width: 15 },
        { header: '产品名称', key: 'product_name', width: 20 },
        { header: '规格', key: 'specification', width: 20 },
        { header: '单位', key: 'unit', width: 10 },
        { header: '数量', key: 'quantity', width: 10 },
        { header: '状态', key: 'status', width: 12 },
        { header: '开始日期', key: 'start_date', width: 15 },
        { header: '结束日期', key: 'end_date', width: 15 },
        { header: '任务编号', key: 'task_codes', width: 30 },
        { header: '创建时间', key: 'created_at', width: 20 },
      ];

      const conditions = [];
      if (startDate) {
        conditions.push('pp.start_date >= ?');
        params.push(startDate);
      }
      if (endDate) {
        conditions.push('pp.end_date <= ?');
        params.push(endDate);
      }
      if (status) {
        conditions.push('pp.status = ?');
        params.push(status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      query = `
        SELECT
          pp.id,
          pp.code,
          pp.name,
          pp.start_date,
          pp.end_date,
          pp.status,
          pp.created_at,
          pp.updated_at,
          m.name as product_name,
          m.code as product_code,
          m.specs as specification,
          u.name as unit,
          pp.quantity,
          GROUP_CONCAT(DISTINCT pt.code ORDER BY pt.code SEPARATOR ', ') as task_codes
        FROM production_plans pp
        LEFT JOIN materials m ON pp.product_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN production_tasks pt ON pp.id = pt.plan_id
        ${whereClause}
        GROUP BY pp.id, pp.code, pp.name, pp.start_date, pp.end_date,
                 pp.status, pp.created_at, pp.updated_at,
                 m.name, m.code, m.specs, u.name, pp.quantity
        ORDER BY pp.created_at DESC
      `;
    } else if (type === 'tasks') {
      sheetName = '生产任务';
      columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: '任务编号', key: 'code', width: 15 },
        { header: '计划名称', key: 'plan_name', width: 20 },
        { header: '产品名称', key: 'product_name', width: 20 },
        { header: '数量', key: 'quantity', width: 10 },
        { header: '状态', key: 'status', width: 12 },
        { header: '进度', key: 'progress', width: 10 },
        { header: '负责人', key: 'manager', width: 15 },
        { header: '开始日期', key: 'start_date', width: 15 },
        { header: '预计完成日期', key: 'expected_end_date', width: 15 },
        { header: '实际完成日期', key: 'actual_end_date', width: 15 },
        { header: '备注', key: 'remarks', width: 30 },
      ];

      const conditions = [];
      if (startDate) {
        conditions.push('pt.start_date >= ?');
        params.push(startDate);
      }
      if (endDate) {
        conditions.push('pt.expected_end_date <= ?');
        params.push(endDate);
      }
      if (status) {
        conditions.push('pt.status = ?');
        params.push(status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      query = `
        SELECT
          pt.id,
          pt.code,
          pp.name as plan_name,
          m.name as product_name,
          pt.quantity,
          pt.status,
          pt.progress,
          pt.manager,
          pt.start_date,
          pt.expected_end_date,
          pt.actual_end_date,
          pt.remarks
        FROM production_tasks pt
        LEFT JOIN production_plans pp ON pt.plan_id = pp.id
        LEFT JOIN materials m ON pt.product_id = m.id
        ${whereClause}
        ORDER BY pt.created_at DESC
      `;
    }

    const [data] = await pool.query(query, params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = columns;
    worksheet.addRows(data);

    // 设置表头样式
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(sheetName)}_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('导出生产数据失败:', error);
    handleError(res, error);
  }
};
