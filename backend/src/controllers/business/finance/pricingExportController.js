const ExcelJS = require('exceljs');
const { getConnection } = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const logger = require('../../../utils/logger');

// 导出产品定价列表为 Excel
exports.exportPricingList = async (req, res) => {
  let connection;
  try {
    const { search, filterType } = req.query;

    connection = await getConnection();

    let whereClause = '1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (m.name LIKE ? OR m.code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // 筛选条件
    if (filterType === 'low_margin') {
      whereClause += ' AND pp.profit_margin < 15 AND pp.profit_margin IS NOT NULL';
    } else if (filterType === 'no_pricing') {
      whereClause += ' AND pp.id IS NULL';
    }

    // 查询数据
    const query = `
            SELECT 
                m.code as product_code,
                m.name as product_name,
                m.specs as product_specs,
                pp.cost_price,
                COALESCE(pp.suggested_price, m.price) as suggested_price,
                pp.profit_margin,
                pp.effective_date,
                pp.remarks,
                u.username as created_by_name,
                pp.created_at
            FROM materials m
            LEFT JOIN product_pricing pp ON m.id = pp.product_id AND pp.is_active = 1
            LEFT JOIN users u ON pp.created_by = u.id
            WHERE ${whereClause}
            ORDER BY 
                CASE WHEN pp.id IS NOT NULL THEN 0 ELSE 1 END ASC,
                m.code ASC
        `;

    const [rows] = await connection.query(query, params);

    // 创建 Excel 工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('产品定价表');

    // 设置列
    worksheet.columns = [
      { header: '产品编码', key: 'product_code', width: 15 },
      { header: '产品名称', key: 'product_name', width: 25 },
      { header: '规格型号', key: 'product_specs', width: 20 },
      { header: 'BOM成本', key: 'cost_price', width: 12 },
      { header: '建议售价', key: 'suggested_price', width: 12 },
      { header: '利润率(%)', key: 'profit_margin', width: 12 },
      { header: '生效日期', key: 'effective_date', width: 15 },
      { header: '备注', key: 'remarks', width: 30 },
      { header: '创建人', key: 'created_by_name', width: 12 },
    ];

    // 设置表头样式
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    // 添加数据
    rows.forEach((row) => {
      worksheet.addRow({
        product_code: row.product_code,
        product_name: row.product_name,
        product_specs: row.product_specs,
        cost_price: parseFloat(row.cost_price || 0).toFixed(2),
        suggested_price: parseFloat(row.suggested_price || 0).toFixed(2),
        profit_margin: row.profit_margin ? parseFloat(row.profit_margin).toFixed(2) : '-',
        effective_date: row.effective_date || '-',
        remarks: row.remarks || '',
        created_by_name: row.created_by_name || '-',
      });
    });

    // 设置响应头
    const fileName = `产品定价表_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="pricing-list.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    // 写入响应
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('导出定价列表失败:', error);
    ResponseHandler.error(res, '导出失败');
  } finally {
    if (connection) connection.release();
  }
};
