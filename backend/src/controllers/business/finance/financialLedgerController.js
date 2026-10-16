const FinancialLedgerService = require('../../../services/business/FinancialLedgerService');
const { ResponseHandler } = require('../../../utils/responseHandler');
const BusinessError = require('../../../utils/BusinessError');
const { logger } = require('../../../utils/logger');

module.exports = {
  async getLedger(req, res) {
    try {
      const report = await FinancialLedgerService.getLedger(req.params.type, req.query);
      return ResponseHandler.success(res, report, '账簿查询成功');
    } catch (error) {
      if (!BusinessError.is(error)) logger.error('财务账簿查询失败:', error);
      return BusinessError.handleError(res, error, '财务账簿查询失败，请稍后重试', ResponseHandler);
    }
  },

  async getOptions(req, res) {
    try {
      return ResponseHandler.success(
        res,
        await FinancialLedgerService.getOptions(req.query),
        '筛选选项查询成功'
      );
    } catch (error) {
      if (!BusinessError.is(error)) logger.error('财务账簿筛选选项查询失败:', error);
      return BusinessError.handleError(res, error, '筛选选项查询失败，请稍后重试', ResponseHandler);
    }
  },
};
