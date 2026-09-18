'use strict';
const db = require('../../../config/db');
const ScopeGuard = require('../../../authorization/ScopeGuard');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const CreditNoteRefundService = require('../../../services/finance/CreditNoteRefundService');

const refund = kind => async (req, res) => {
  try {
    if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, `${kind}_invoice`, req.body.invoiceId, '无权操作该红字发票'))) return;
    const result = await CreditNoteRefundService.create(kind, req.body, getAuthenticatedUserId(req));
    return ResponseHandler.success(res, result, '退款已登记，银行流水及凭证已生成', result.replayed ? 200 : 201);
  } catch (error) {
    return ResponseHandler.error(res, error.message || '退款登记失败', 'VALIDATION_ERROR', 400);
  }
};
const RedLetterTaxService = require('../../../services/finance/RedLetterTaxService');
const redLetter = action => async (req, res) => {
  try {
    const data = action === 'originals' ? req.query : req.body;
    if (!['ar', 'ap'].includes(data.kind)) return ResponseHandler.error(res, '发票类型无效', 'VALIDATION_ERROR', 400);
    if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, `${data.kind}_invoice`, data.invoiceId, '无权操作该红字发票'))) return;
    const result = action === 'originals' ? await RedLetterTaxService.originals(data.kind, data.invoiceId) : await RedLetterTaxService.create(data, getAuthenticatedUserId(req));
    return ResponseHandler.success(res, result, '操作成功', action === 'originals' || result.replayed ? 200 : 201);
  } catch (error) { return ResponseHandler.error(res, error.message || '红字税票操作失败', 'VALIDATION_ERROR', 400); }
};
module.exports = { refundAR: refund('ar'), refundAP: refund('ap'), redLetterOriginals: redLetter('originals'), createRedLetter: redLetter('create') };
