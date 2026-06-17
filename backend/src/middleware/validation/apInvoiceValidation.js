/**
 * apInvoiceValidation.js
 * @description 应付发票相关路由的 express-validator 验证中间件
 * @date 2026-06-15
 * @version 1.0.0
 */

const { body, param, query } = require('express-validator');

/**
 * 创建应付发票验证
 */
const createAPInvoiceValidation = [
  body('supplier_id')
    .isInt({ min: 1 })
    .withMessage('供应商ID必须是正整数'),

  body('invoice_date')
    .notEmpty()
    .withMessage('发票日期不能为空')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('发票日期格式必须为 YYYY-MM-DD'),

  body('due_date')
    .notEmpty()
    .withMessage('到期日期不能为空')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('到期日期格式必须为 YYYY-MM-DD')
    .custom((value, { req }) => {
      if (req.body.invoice_date && value < req.body.invoice_date) {
        throw new Error('到期日期不能早于发票日期');
      }
      return true;
    }),

  body('total_amount')
    .isFloat({ min: 0.01 })
    .withMessage('发票金额必须大于0')
    .custom((value) => {
      if (value > 999999999.99) {
        throw new Error('发票金额不能超过999,999,999.99');
      }
      return true;
    }),

  body('items')
    .optional()
    .isArray()
    .withMessage('发票明细必须是数组'),

  body('items.*.product_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('产品ID必须是正整数'),

  body('items.*.quantity')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('数量必须大于0'),

  body('items.*.unit_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('单价不能为负数'),

  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('备注不能超过500个字符'),
];

/**
 * 更新应付发票验证
 */
const updateAPInvoiceValidation = [
  param('id').isInt({ min: 1 }).withMessage('发票ID必须是正整数'),
  ...createAPInvoiceValidation,
];

/**
 * 创建付款验证
 */
const createPaymentValidation = [
  body('invoiceId')
    .isInt({ min: 1 })
    .withMessage('发票ID必须是正整数'),

  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('付款金额必须大于0'),

  body('paymentDate')
    .notEmpty()
    .withMessage('付款日期不能为空')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('付款日期格式必须为 YYYY-MM-DD'),

  body('paymentMethod')
    .notEmpty()
    .withMessage('付款方式不能为空')
    .isLength({ max: 50 })
    .withMessage('付款方式不能超过50个字符'),

  body('bankAccountId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('银行账户ID必须是正整数'),
];

/**
 * 查询应付发票验证
 */
const getAPInvoicesValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('每页数量必须是1-100之间的整数'),
  query('status')
    .optional()
    .isIn(['草稿', '已确认', '部分付款', '已付款', '已逾期', '已取消'])
    .withMessage('发票状态不正确'),
  query('start_date')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('开始日期格式不正确'),
  query('end_date')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('结束日期格式不正确'),
];

module.exports = {
  createAPInvoiceValidation,
  updateAPInvoiceValidation,
  createPaymentValidation,
  getAPInvoicesValidation,
};
