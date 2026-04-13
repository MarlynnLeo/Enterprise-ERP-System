/**
 * 报废记录管理控制器
 * @description 处理报废记录的CRUD操作、审批流程、成本核算等
 */

const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const db = require('../../../config/db');
const pool = db.pool;
const QualityIntegrationService = require('../../../services/business/QualityIntegrationService');
const businessConfig = require('../../../config/businessConfig');

// 从统一配置获取状态常量
const STATUS = {
  SCRAP: businessConfig.status.scrap,
};

/**
 * 获取报废记录列表
 */
const getScrapRecords = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      scrapNo,
      ncpNo,
      materialCode,
      status,
      startDate,
      endDate,
    } = req.query;

    const offset = (page - 1) * pageSize;

    const whereConditions = [];
    const queryParams = [];

    if (scrapNo) {
      whereConditions.push('sr.scrap_no LIKE ?');
      queryParams.push(`%${scrapNo}%`);
    }

    if (ncpNo) {
      whereConditions.push('sr.ncp_no LIKE ?');
      queryParams.push(`%${ncpNo}%`);
    }

    if (materialCode) {
      whereConditions.push('sr.material_code LIKE ?');
      queryParams.push(`%${materialCode}%`);
    }

    if (status) {
      whereConditions.push('sr.status = ?');
      queryParams.push(status);
    }

    if (startDate) {
      whereConditions.push('sr.created_at >= ?');
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push('sr.created_at <= ?');
      queryParams.push(`${endDate} 23:59:59`);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM scrap_records sr
      ${whereClause}
    `;
    const [countResult] = await pool.query(countQuery, queryParams);
    const total = countResult[0].total;

    // 查询列表数据
    const dataQuery = `
      SELECT 
        sr.*,
        ncp.inspection_no,
        ncp.defect_description
      FROM scrap_records sr
      LEFT JOIN nonconforming_products ncp ON sr.ncp_id = ncp.id
      ${whereClause}
      ORDER BY sr.created_at DESC
      LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
    `;
    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const [rows] = await pool.query(dataQuery, queryParams);

    return ResponseHandler.success(res, {
      data: rows,
      pagination: {
        total,
        current: parseInt(page),
        pageSize: parseInt(pageSize),
      },
    }, '获取报废记录列表成功');
  } catch (error) {
    logger.error('获取报废记录列表失败:', error);
    return ResponseHandler.error(res, '获取报废记录列表失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 获取报废记录详情
 */
const getScrapRecordById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        sr.*,
        ncp.inspection_no,
        ncp.inspection_id,
        ncp.defect_description,
        ncp.quantity as defect_quantity
      FROM scrap_records sr
      LEFT JOIN nonconforming_products ncp ON sr.ncp_id = ncp.id
      WHERE sr.id = ?
    `;

    const [rows] = await pool.query(query, [id]);

    if (rows.length === 0) {
      return ResponseHandler.error(res, '报废记录不存在', 'NOT_FOUND', 404);
    }

    return ResponseHandler.success(res, rows[0], '获取报废记录详情成功');
  } catch (error) {
    logger.error('获取报废记录详情失败:', error);
    return ResponseHandler.error(res, '获取报废记录详情失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 更新报废记录
 */
const updateScrapRecord = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { scrap_cost, scrap_date } = req.body;

    // 检查报废记录是否存在
    const [checkResult] = await connection.query('SELECT status FROM scrap_records WHERE id = ?', [
      id,
    ]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '报废记录不存在', 'NOT_FOUND', 404);
    }

    if (checkResult[0].status === STATUS.SCRAP.COMPLETED) {
      await connection.rollback();
      return ResponseHandler.error(res, '已完成的报废记录不能修改', 'BAD_REQUEST', 400);
    }

    // 更新报废记录
    await connection.query(
      `UPDATE scrap_records
       SET scrap_cost = ?, scrap_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [scrap_cost, scrap_date, id]
    );

    await connection.commit();
    return ResponseHandler.success(res, null, '报废记录更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新报废记录失败:', error);
    return ResponseHandler.error(res, '更新报废记录失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 审批报废
 */
const approveScrap = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { approved, note, approver } = req.body;

    // 检查报废记录是否存在
    const [checkResult] = await connection.query('SELECT status FROM scrap_records WHERE id = ?', [
      id,
    ]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '报废记录不存在', 'NOT_FOUND', 404);
    }

    if (checkResult[0].status !== 'pending') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能审批待审批状态的报废记录', 'BAD_REQUEST', 400);
    }

    // 更新审批状态
    const newStatus = approved ? 'approved' : 'rejected';
    const approvalDate = approved ? new Date().toISOString().slice(0, 10) : null;

    await connection.query(
      `UPDATE scrap_records
       SET status = ?, approver = ?, approval_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newStatus, approver || 'system', approvalDate, id]
    );

    await connection.commit();
    return ResponseHandler.success(res, null, approved ? '审批通过' : '审批拒绝');
  } catch (error) {
    await connection.rollback();
    logger.error('审批报废失败:', error);
    return ResponseHandler.error(res, '审批报废失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 完成报废
 */
const completeScrap = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { scrap_cost, note } = req.body;

    // 获取报废记录信息
    const [records] = await connection.query('SELECT * FROM scrap_records WHERE id = ?', [id]);

    if (records.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '报废记录不存在', 'NOT_FOUND', 404);
    }

    const record = records[0];

    if (record.status === STATUS.SCRAP.COMPLETED) {
      await connection.rollback();
      return ResponseHandler.error(res, '该报废记录已完成', 'BAD_REQUEST', 400);
    }

    if (record.status === STATUS.SCRAP.PENDING) {
      await connection.rollback();
      return ResponseHandler.error(res, '待审批的报废记录不能直接完成', 'BAD_REQUEST', 400);
    }

    // 完成报废
    await connection.query(
      `UPDATE scrap_records
       SET scrap_cost = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [scrap_cost, id]
    );

    // 自动扣减库存
    try {
      await QualityIntegrationService.handleScrapInventory(record, connection);
    } catch (error) {
      logger.warn('报废库存扣减失败(继续完成报废):', error.message);
    }

    // 记录质量成本
    try {
      await QualityIntegrationService.recordQualityCost(
        {
          costType: 'scrap',
          referenceNo: record.scrap_no,
          materialCode: record.material_code,
          quantity: record.quantity,
          cost: scrap_cost,
          operator: record.created_by,
        },
        connection
      );
    } catch (error) {
      logger.warn('记录质量成本失败(继续完成报废):', error.message);
    }

    await connection.commit();
    return ResponseHandler.success(res, null, '报废完成');
  } catch (error) {
    await connection.rollback();
    logger.error('完成报废失败:', error);
    return ResponseHandler.error(res, '完成报废失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新报废状态
 */
const updateStatus = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    await connection.query(
      `UPDATE scrap_records
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, id]
    );

    await connection.commit();
    return ResponseHandler.success(res, null, '状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新报废状态失败:', error);
    return ResponseHandler.error(res, '更新报废状态失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取报废统计数据
 */
const getStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateCondition = '';
    let queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'WHERE created_at BETWEEN ? AND ?';
      queryParams = [startDate, `${endDate} 23:59:59`];
    }

    const query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(quantity) as total_quantity,
        SUM(scrap_cost) as total_cost
      FROM scrap_records
      ${dateCondition}
    `;

    const [rows] = await pool.query(query, queryParams);
    return ResponseHandler.success(res, rows[0], '获取报废统计数据成功');
  } catch (error) {
    logger.error('获取报废统计数据失败:', error);
    return ResponseHandler.error(res, '获取统计数据失败', 'OPERATION_ERROR', 500, error);
  }
};

module.exports = {
  getScrapRecords,
  getScrapRecordById,
  updateScrapRecord,
  approveScrap,
  completeScrap,
  updateStatus,
  getStatistics,
};
