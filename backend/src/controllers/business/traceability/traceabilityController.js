/**
 * traceabilityController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');

const getTraceabilityRecords = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // 处理过滤条件
    const filters = {};
    if (req.query.productCode) filters.productCode = req.query.productCode;
    if (req.query.productName) filters.productName = req.query.productName;
    if (req.query.batchNumber) filters.batchNumber = req.query.batchNumber;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;
    if (req.query.supplier) filters.supplier = req.query.supplier;

    const result = await Traceability.getTraceabilityRecords(
      filters,
      parseInt(page),
      parseInt(limit)
    );

    ResponseHandler.success(res, {
      records: result.records,
      total: result.total,
      page: parseInt(page),
      limit: parseInt(limit),
    }, '获取追溯记录列表成功');
  } catch (error) {
    logger.error('获取追溯记录列表失败:', error);
    ResponseHandler.error(res, '获取追溯记录列表失败', 'SERVER_ERROR', 500, error);
  }
};
