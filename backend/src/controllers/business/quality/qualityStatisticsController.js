/**
 * qualityStatisticsController.js
 * @description 质量统计报表控制器（统一）
 * @date 2026-03-03
 *
 * 合并原 qualityStatController + qualityStatisticsController
 * 职责：检验统计概览、不合格项、质量趋势、处理方式统计、供应商分析、物料缺陷、成本分析
 */

const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const db = require('../../../config/db');
const pool = db.pool;

// ==================== 检验统计（原 qualityStatController） ====================

/**
 * 获取质量统计数据（来料/过程/成品检验概览）
 */
const getQualityStatistics = async (req, res) => {
  try {
    const {  startDate, endDate } = req.query;

    let dateFilter = '';
    let dateParams = [];

    if (startDate && endDate) {
      dateFilter = 'AND qi.created_at BETWEEN ? AND ?';
      dateParams = [startDate, endDate];
    } else {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      dateFilter = 'AND qi.created_at >= ?';
      dateParams = [lastMonth.toISOString().split('T')[0]];
    }

    const [incomingStats] = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN qi.status = 'passed' THEN 1 END) as passed,
              COUNT(CASE WHEN qi.status = 'failed' THEN 1 END) as failed,
              COUNT(CASE WHEN qi.status = 'pending' THEN 1 END) as pending
            FROM quality_inspections qi
            WHERE qi.inspection_type = 'incoming' ${dateFilter}`,
      dateParams
    );

    const [processStats] = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN qi.status = 'passed' THEN 1 END) as passed,
              COUNT(CASE WHEN qi.status = 'failed' THEN 1 END) as failed,
              COUNT(CASE WHEN qi.status = 'pending' THEN 1 END) as pending
            FROM quality_inspections qi
            WHERE qi.inspection_type = 'process' ${dateFilter}`,
      dateParams
    );

    const [finalStats] = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN qi.status = 'passed' THEN 1 END) as passed,
              COUNT(CASE WHEN qi.status = 'failed' THEN 1 END) as failed,
              COUNT(CASE WHEN qi.status = 'pending' THEN 1 END) as pending
            FROM quality_inspections qi
            WHERE qi.inspection_type = 'final' ${dateFilter}`,
      dateParams
    );

    const [defectStats] = await pool.query(
      `SELECT COUNT(*) as total_defects,
              COUNT(DISTINCT qi.id) as defect_inspections,
              COUNT(DISTINCT CASE WHEN qii.result LIKE '%不合格%' THEN qii.item_name END) as defect_types
            FROM quality_inspections qi
            LEFT JOIN quality_inspection_items qii ON qi.id = qii.inspection_id
            WHERE qi.status = 'failed' ${dateFilter}`,
      dateParams
    );

    const calcRate = (s) => {
      const t = s.total || 0, p = s.passed || 0;
      return t > 0 ? ((p / t) * 100).toFixed(1) + '%' : '0%';
    };

    const statistics = {
      incoming: { ...incomingStats[0], passRate: calcRate(incomingStats[0]) },
      process: { ...processStats[0], passRate: calcRate(processStats[0]) },
      final: { ...finalStats[0], passRate: calcRate(finalStats[0]) },
      defects: {
        total: defectStats[0].total_defects || 0,
        inspections: defectStats[0].defect_inspections || 0,
        types: defectStats[0].defect_types || 0,
      },
    };

    ResponseHandler.success(res, statistics, '获取质量统计数据成功');
  } catch (error) {
    logger.error('获取质量统计数据失败:', error);
    ResponseHandler.error(res, '获取质量统计数据失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取不合格项目列表
 */
const getDefectItems = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, keyword, startDate, endDate } = req.query;

    const whereConds = ["qi.status = 'failed'"];
    const params = [];

    if (keyword) {
      whereConds.push(`(qi.inspection_no LIKE ? OR qi.product_name LIKE ? OR qi.product_code LIKE ? OR qii.remark LIKE ?)`);
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw);
    }
    if (startDate && endDate) {
      whereConds.push('qi.created_at BETWEEN ? AND ?');
      params.push(startDate, endDate);
    }

    const where = 'WHERE ' + whereConds.join(' AND ');

    const [countResult] = await pool.query(
      `SELECT COUNT(DISTINCT qi.id) as total
            FROM quality_inspections qi
            LEFT JOIN quality_inspection_items qii ON qi.id = qii.inspection_id
            ${where}`, params
    );

    const ps = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * ps;
    const [rows] = await pool.query(
      `SELECT DISTINCT qi.id, qi.inspection_no as inspectionNo, qi.inspection_type as inspectionType,
              qi.product_name as materialName, qi.product_code as materialCode,
              DATE_FORMAT(qi.created_at, '%Y-%m-%d') as inspectionDate,
              qi.quantity as defectQty,
              GROUP_CONCAT(DISTINCT CASE WHEN qii.result LIKE '%不合格%' OR COALESCE(qii.remark, '') != '' THEN COALESCE(NULLIF(qii.remark, ''), qii.item_name) ELSE qii.item_name END SEPARATOR ', ') as defectReason,
              CASE WHEN qi.status = 'completed' THEN '已处理'
                   WHEN qi.status = 'pending' THEN '待处理' ELSE '处理中' END as processResult
            FROM quality_inspections qi
            LEFT JOIN quality_inspection_items qii ON qi.id = qii.inspection_id
            ${where}
            GROUP BY qi.id ORDER BY qi.created_at DESC
            LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}`, params
    );

    ResponseHandler.paginated(res, rows, countResult[0].total || 0, parseInt(page), ps);
  } catch (error) {
    logger.error('获取不合格项目列表失败:', error);
    ResponseHandler.error(res, '获取不合格项目列表失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取质量趋势数据
 */
const getQualityTrends = async (req, res) => {
  try {
    const { months = 6 } = req.query;

    const [trendData] = await pool.query(
      `SELECT DATE_FORMAT(qi.created_at, '%Y-%m') as month, qi.inspection_type,
              COUNT(*) as total, COUNT(CASE WHEN qi.status = 'passed' THEN 1 END) as passed
            FROM quality_inspections qi
            WHERE qi.created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
            GROUP BY month, qi.inspection_type ORDER BY month DESC`,
      [parseInt(months)]
    );

    const [defectTypes] = await pool.query(
      `SELECT qii.item_name as defect_type, COUNT(*) as count
            FROM quality_inspection_items qii
            JOIN quality_inspections qi ON qii.inspection_id = qi.id
            WHERE qi.status = 'failed'
              AND qi.created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
              AND qii.result LIKE '%不合格%'
            GROUP BY qii.item_name ORDER BY count DESC LIMIT 10`,
      [parseInt(months)]
    );

    res.json({ success: true, data: { trends: trendData, defectTypes } });
  } catch (error) {
    logger.error('获取质量趋势数据失败:', error);
    ResponseHandler.error(res, '获取质量趋势数据失败', 'SERVER_ERROR', 500, error);
  }
};

// ==================== 不合格品统计（原 qualityStatisticsController） ====================

/**
 * 获取不合格品处理方式统计
 */
const getDispositionStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateCondition = '', subQueryDateCondition = '', queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'WHERE ncp.created_at BETWEEN ? AND ?';
      subQueryDateCondition = 'WHERE created_at BETWEEN ? AND ?';
      queryParams = [startDate, `${endDate} 23:59:59`];
    }

    const [rows] = await pool.query(
      `SELECT ncp.disposition, COUNT(*) as count, SUM(ncp.quantity) as total_quantity,
              ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM nonconforming_products ${subQueryDateCondition}), 2) as percentage
            FROM nonconforming_products ncp ${dateCondition}
            GROUP BY ncp.disposition ORDER BY count DESC`,
      dateCondition ? [...queryParams, ...queryParams] : []
    );

    return ResponseHandler.success(res, rows, '获取处理方式统计成功');
  } catch (error) {
    logger.error('获取处理方式统计失败:', error);
    return ResponseHandler.error(res, '获取处理方式统计失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 获取不合格品趋势分析
 */
const getTrendAnalysis = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    const formatMap = { month: '%Y-%m', week: '%Y-%u', day: '%Y-%m-%d' };
    const dateFormat = formatMap[groupBy] || '%Y-%m-%d';

    let dateCondition = '', queryParams = [];
    if (startDate && endDate) {
      dateCondition = 'WHERE created_at BETWEEN ? AND ?';
      queryParams = [startDate, `${endDate} 23:59:59`];
    }

    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(created_at, ?) as period, COUNT(*) as total_count,
              SUM(quantity) as total_quantity,
              SUM(CASE WHEN disposition = 'return' THEN 1 ELSE 0 END) as return_count,
              SUM(CASE WHEN disposition = 'replacement' THEN 1 ELSE 0 END) as replacement_count,
              SUM(CASE WHEN disposition = 'rework' THEN 1 ELSE 0 END) as rework_count,
              SUM(CASE WHEN disposition = 'scrap' THEN 1 ELSE 0 END) as scrap_count,
              SUM(CASE WHEN disposition = 'use_as_is' THEN 1 ELSE 0 END) as use_as_is_count
            FROM nonconforming_products ${dateCondition}
            GROUP BY period ORDER BY period ASC`,
      [dateFormat, ...queryParams]
    );

    return ResponseHandler.success(res, rows, '获取趋势分析成功');
  } catch (error) {
    logger.error('获取趋势分析失败:', error);
    return ResponseHandler.error(res, '获取趋势分析失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 获取供应商质量分析
 */
const getSupplierQualityAnalysis = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateCondition = '', queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'AND ncp.created_at BETWEEN ? AND ?';
      queryParams = [startDate, `${endDate} 23:59:59`];
    }

    const [rows] = await pool.query(
      `SELECT ncp.supplier_name, COUNT(*) as ncp_count,
              SUM(ncp.quantity) as total_defect_quantity,
              COUNT(DISTINCT ncp.material_code) as affected_materials,
              SUM(CASE WHEN ncp.disposition = 'return' THEN 1 ELSE 0 END) as return_count,
              SUM(CASE WHEN ncp.disposition = 'replacement' THEN 1 ELSE 0 END) as replacement_count,
              SUM(CASE WHEN ncp.disposition = 'scrap' THEN 1 ELSE 0 END) as scrap_count
            FROM nonconforming_products ncp
            WHERE ncp.supplier_name IS NOT NULL ${dateCondition}
            GROUP BY ncp.supplier_name ORDER BY ncp_count DESC LIMIT 20`,
      queryParams
    );

    return ResponseHandler.success(res, rows, '获取供应商质量分析成功');
  } catch (error) {
    logger.error('获取供应商质量分析失败:', error);
    return ResponseHandler.error(res, '获取供应商质量分析失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 获取物料缺陷分析
 */
const getMaterialDefectAnalysis = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateCondition = '', queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'WHERE created_at BETWEEN ? AND ?';
      queryParams = [startDate, `${endDate} 23:59:59`];
    }

    const [rows] = await pool.query(
      `SELECT material_code, material_name, COUNT(*) as ncp_count,
              SUM(quantity) as total_defect_quantity,
              GROUP_CONCAT(DISTINCT defect_type) as defect_types
            FROM nonconforming_products ${dateCondition}
            GROUP BY material_code, material_name ORDER BY ncp_count DESC LIMIT 20`,
      queryParams
    );

    return ResponseHandler.success(res, rows, '获取物料缺陷分析成功');
  } catch (error) {
    logger.error('获取物料缺陷分析失败:', error);
    return ResponseHandler.error(res, '获取物料缺陷分析失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 获取成本分析
 */
const getCostAnalysis = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateCondition = '', queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'WHERE created_at BETWEEN ? AND ?';
      queryParams = [startDate, `${endDate} 23:59:59`];
    }

    const [reworkResult] = await pool.query(
      `SELECT COALESCE(SUM(rework_cost), 0) as total_rework_cost, COUNT(*) as rework_count
            FROM rework_tasks ${dateCondition}`, queryParams
    );

    const [scrapResult] = await pool.query(
      `SELECT COALESCE(SUM(scrap_cost), 0) as total_scrap_cost, COUNT(*) as scrap_count
            FROM scrap_records ${dateCondition}`, queryParams
    );

    return ResponseHandler.success(res, {
      rework_cost: reworkResult[0].total_rework_cost,
      rework_count: reworkResult[0].rework_count,
      scrap_cost: scrapResult[0].total_scrap_cost,
      scrap_count: scrapResult[0].scrap_count,
      total_cost: parseFloat(reworkResult[0].total_rework_cost) + parseFloat(scrapResult[0].total_scrap_cost),
    }, '获取成本分析成功');
  } catch (error) {
    logger.error('获取成本分析失败:', error);
    return ResponseHandler.error(res, '获取成本分析失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 获取综合统计概览
 */
const getOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateCondition = '', queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'WHERE created_at BETWEEN ? AND ?';
      queryParams = [startDate, `${endDate} 23:59:59`];
    }

    const [ncpResult] = await pool.query(
      `SELECT COUNT(*) as total_ncp, SUM(quantity) as total_defect_quantity
            FROM nonconforming_products ${dateCondition}`, queryParams
    );

    const [dispositionResult] = await pool.query(
      `SELECT
              SUM(CASE WHEN disposition = 'return' THEN 1 ELSE 0 END) as return_count,
              SUM(CASE WHEN disposition = 'replacement' THEN 1 ELSE 0 END) as replacement_count,
              SUM(CASE WHEN disposition = 'rework' THEN 1 ELSE 0 END) as rework_count,
              SUM(CASE WHEN disposition = 'scrap' THEN 1 ELSE 0 END) as scrap_count,
              SUM(CASE WHEN disposition = 'use_as_is' THEN 1 ELSE 0 END) as use_as_is_count,
              SUM(CASE WHEN disposition = 'pending' THEN 1 ELSE 0 END) as pending_count
            FROM nonconforming_products ${dateCondition}`, queryParams
    );

    return ResponseHandler.success(res, { ...ncpResult[0], ...dispositionResult[0] }, '获取综合统计概览成功');
  } catch (error) {
    logger.error('获取综合统计概览失败:', error);
    return ResponseHandler.error(res, '获取综合统计概览失败', 'OPERATION_ERROR', 500, error);
  }
};

module.exports = {
  // 检验统计（原 qualityStatController）
  getQualityStatistics,
  getDefectItems,
  getQualityTrends,
  // 不合格品统计
  getDispositionStatistics,
  getTrendAnalysis,
  getSupplierQualityAnalysis,
  getMaterialDefectAnalysis,
  getCostAnalysis,
  getOverview,
};
