/**
 * glEntryValidation.js
 * @description 总账分录相关路由的 express-validator 验证中间件
 * @date 2026-06-15
 * @version 1.0.0
 */

const { body, param, query } = require('express-validator');

/**
 * 创建会计分录验证
 */
const createEntryValidation = [
  body('entry_date')
    .notEmpty()
    .withMessage('凭证日期不能为空')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('凭证日期格式必须为 YYYY-MM-DD'),

  body('document_type')
    .optional()
    .isLength({ max: 50 })
    .withMessage('单据类型不能超过50个字符'),

  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('摘要不能超过500个字符'),

  body('items')
    .isArray({ min: 2 })
    .withMessage('分录明细至少需要两行（一借一贷）'),

  body('items.*.account_id')
    .isInt({ min: 1 })
    .withMessage('科目ID必须是正整数'),

  body('items.*.debit_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('借方金额不能为负数'),

  body('items.*.credit_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('贷方金额不能为负数'),

  body('items.*.description')
    .optional()
    .isLength({ max: 200 })
    .withMessage('明细摘要不能超过200个字符'),
];

/**
 * 过账验证
 */
const postEntryValidation = [
  param('id').isInt({ min: 1 }).withMessage('凭证ID必须是正整数'),
];

/**
 * 冲销验证
 */
const reverseEntryValidation = [
  param('id').isInt({ min: 1 }).withMessage('凭证ID必须是正整数'),

  body('entry_date')
    .notEmpty()
    .withMessage('冲销日期为必填项')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('冲销日期格式必须为 YYYY-MM-DD'),

  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('冲销摘要不能超过500个字符'),
];

/**
 * 删除验证
 */
const deleteEntryValidation = [
  param('id').isInt({ min: 1 }).withMessage('凭证ID必须是正整数'),
];

/**
 * 查询验证
 */
const getEntriesValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('每页数量必须是1-100之间的整数'),
  query('start_date')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('开始日期格式不正确'),
  query('end_date')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('结束日期格式不正确'),
  query('status')
    .optional()
    .isIn(['draft', 'posted', 'reversed'])
    .withMessage('状态必须是 draft, posted 或 reversed'),
];

module.exports = {
  createEntryValidation,
  postEntryValidation,
  reverseEntryValidation,
  deleteEntryValidation,
  getEntriesValidation,
};
