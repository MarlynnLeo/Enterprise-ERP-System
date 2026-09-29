const NonconformingProductService = require('../../../services/business/NonconformingProductService');
const NonconformingProduct = require('../../../models/nonconformingProduct');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const { mapKeysToSnake } = require('../../../utils/fieldMap');

/**
 * Get NCP list
 */
const getList = async (req, res) => {
  try {
    // HTTP query camel → service filters
    const params = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 10,
      status: req.query.status,
      disposition: req.query.disposition,
      severity: req.query.severity,
      material_id: req.query.materialId || req.query.material_id,
      inspection_id: req.query.inspectionId || req.query.inspection_id,
      keyword: req.query.keyword,
      startDate: req.query.startDate || req.query.start_date,
      endDate: req.query.endDate || req.query.end_date,
    };

    const result = await NonconformingProductService.getList(params);
    return ResponseHandler.success(res, result);
  } catch (error) {
    logger.error('Failed to get NCP list:', error);
    return ResponseHandler.error(res, '获取不合格品列表失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * Get NCP details
 */
const getDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await NonconformingProductService.getDetails(id);
    return ResponseHandler.success(res, result);
  } catch (error) {
    logger.error('Failed to get NCP details:', error);
    if (error?.code === 'NCP_NOT_FOUND' || error?.message === 'NCP not found') {
      return ResponseHandler.notFound(res, '不合格品单不存在或已被删除');
    }
    return ResponseHandler.error(res, '获取不合格品详情失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * Create NCP
 */
const create = async (req, res) => {
  try {
    const ncpData = mapKeysToSnake(req.body || {});

    let result;
    if (ncpData.inspection_id) {
      result = await NonconformingProductService.createFromInspection(
        ncpData.inspection_id,
        ncpData
      );
    } else {
      result = await NonconformingProduct.create(ncpData);
    }

    return ResponseHandler.success(res, result, '不合格品单创建成功');
  } catch (error) {
    logger.error('Failed to create NCP:', error);
    return ResponseHandler.error(res, '创建不合格品单失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * Update NCP
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = mapKeysToSnake(req.body || {});

    await NonconformingProduct.update(id, updateData);
    return ResponseHandler.success(res, null, '不合格品单更新成功');
  } catch (error) {
    logger.error('Failed to update NCP:', error);
    return ResponseHandler.error(res, '更新不合格品单失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * Update disposition
 */
const updateDisposition = async (req, res) => {
  try {
    const { id } = req.params;
    const dispositionData = mapKeysToSnake(req.body || {});

    await NonconformingProductService.processDisposition(id, dispositionData);
    return ResponseHandler.success(res, null, '不合格品处置结果更新成功');
  } catch (error) {
    logger.error('Failed to update disposition:', error);
    return ResponseHandler.error(
      res,
      error.message || '更新不合格品处置结果失败',
      'OPERATION_ERROR',
      500,
      error
    );
  }
};

/**
 * Complete handling
 */
const completeHandling = async (req, res) => {
  try {
    const { id } = req.params;
    const completionData = mapKeysToSnake(req.body || {});

    await NonconformingProductService.completeHandling(id, completionData);
    return ResponseHandler.success(res, null, '不合格品处理完成');
  } catch (error) {
    logger.error('Failed to complete handling:', error);
    return ResponseHandler.error(
      res,
      error.message || '完成不合格品处理失败',
      'OPERATION_ERROR',
      500,
      error
    );
  }
};

/**
 * Delete NCP
 */
const deleteNcp = async (req, res) => {
  try {
    const { id } = req.params;
    await NonconformingProduct.delete(id);
    return ResponseHandler.success(res, null, '不合格品单删除成功');
  } catch (error) {
    logger.error('Failed to delete NCP:', error);
    return ResponseHandler.error(res, '删除不合格品单失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * Get statistics
 */
const getStatistics = async (req, res) => {
  try {
    const params = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const result = await NonconformingProduct.getStatistics(params);
    return ResponseHandler.success(res, result);
  } catch (error) {
    logger.error('Failed to get statistics:', error);
    return ResponseHandler.error(res, '获取不合格品统计失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * Get NCPs by inspection ID
 */
const getByInspectionId = async (req, res) => {
  try {
    const { inspectionId } = req.params;
    const result = await NonconformingProduct.getByInspectionId(inspectionId);
    return ResponseHandler.success(res, result);
  } catch (error) {
    logger.error('Failed to get NCPs by inspection:', error);
    return ResponseHandler.error(
      res,
      '获取检验单关联的不合格品失败',
      'OPERATION_ERROR',
      500,
      error
    );
  }
};

/**
 * Get auto disposition config
 */
const getAutoDispositionConfig = async (req, res) => {
  try {
    const config = NonconformingProductService.getAutoDispositionConfig();
    return ResponseHandler.success(res, config, '获取自动处理配置成功');
  } catch (error) {
    logger.error('Failed to get auto disposition config:', error);
    return ResponseHandler.error(res, '获取自动处理配置失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * Update auto disposition config
 */
const updateAutoDispositionConfig = async (req, res) => {
  try {
    const config = mapKeysToSnake(req.body || {});
    const result = NonconformingProductService.updateAutoDispositionConfig(config);
    return ResponseHandler.success(res, result, '更新自动处理配置成功');
  } catch (error) {
    logger.error('Failed to update auto disposition config:', error);
    return ResponseHandler.error(res, '更新自动处理配置失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 申请特采
 */
const applyConcession = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Retrieve applicant from authenticated user
    const applicant = await getCurrentUserName(req);

    if (!reason) {
      return ResponseHandler.error(res, '请提供特采申请理由', 'VALIDATION_ERROR', 400);
    }

    await NonconformingProductService.applyConcession(id, { reason, applicant });
    return ResponseHandler.success(res, null, '特采申请提交成功');
  } catch (error) {
    logger.error('Failed to apply concession:', error);
    return ResponseHandler.error(
      res,
      error.message || '特采申请失败',
      'OPERATION_ERROR',
      500,
      error
    );
  }
};

/**
 * 审批特采
 */
const approveConcession = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    // Retrieve approver from authenticated user
    const approverName = await getCurrentUserName(req);

    if (!['approved', 'rejected'].includes(status)) {
      return ResponseHandler.error(
        res,
        '审批状态必须为 approved 或 rejected',
        'VALIDATION_ERROR',
        400
      );
    }

    const approverId = getAuthenticatedUserId(req);
    await NonconformingProductService.approveConcession(id, { status, approverId, approverName });
    return ResponseHandler.success(
      res,
      null,
      `特采审批已${status === 'approved' ? '通过' : '驳回'}`
    );
  } catch (error) {
    logger.error('Failed to approve concession:', error);
    return ResponseHandler.error(
      res,
      error.message || '特采审批失败',
      'OPERATION_ERROR',
      500,
      error
    );
  }
};

module.exports = {
  getList,
  getDetails,
  create,
  update,
  updateDisposition,
  completeHandling,
  deleteNcp,
  getStatistics,
  getByInspectionId,
  getAutoDispositionConfig,
  updateAutoDispositionConfig,
  applyConcession,
  approveConcession,
};
