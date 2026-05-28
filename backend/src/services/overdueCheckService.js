/**
 * 逾期发票检查服务
 * 定期检查AR和AP逾期发票并发送提醒
 *
 * 修复：
 * - 使用正确的 notifications 表字段（link, link_params, priority, source_type, source_id）
 * - 增加去重机制：同一张发票同一天不重复通知
 * - 合并 AR/AP 重复逻辑为通用函数（DRY 原则）
 * - 按逾期天数自动设置 priority（>90天=紧急, >30天=重要, 其他=普通）
 */

const arModel = require('../models/ar');
const apModel = require('../models/ap');
const logger = require('../utils/logger');
const NotificationService = require('./NotificationService');

/**
 * 获取拥有指定权限（或 admin 角色）的用户 ID 列表
 */
async function getNotificationUsers(permissionCodes) {
  try {
    return await NotificationService.getUserIdsByPermissions(permissionCodes, { includeAdmins: true });
  } catch (error) {
    logger.error('[逾期检查] 获取通知用户失败:', error);
    return [];
  }
}

/**
 * 根据逾期天数计算通知优先级
 * @param {number} overdueDays - 逾期天数
 * @returns {number} 0=普通, 1=重要, 2=紧急
 */
function getOverduePriority(overdueDays) {
  if (overdueDays >= 90) return 2;  // 紧急
  if (overdueDays >= 30) return 1;  // 重要
  return 0;                          // 普通
}

/**
 * 计算逾期天数
 */
function calculateOverdueDays(dueDate, today) {
  const due = new Date(dueDate);
  const now = new Date(today);
  const diffTime = now - due;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

/**
 * 通用逾期发票检查函数（AR/AP 共用）
 * @param {object} params - 参数对象
 * @param {object} params.model - 数据模型（arModel 或 apModel）
 * @param {string} params.type - 发票类型标识（'ar' 或 'ap'）
 * @param {string} params.label - 发票类型中文标签（'应收' 或 '应付'）
 * @param {string} params.counterpartyField - 对方名称字段（'customer_name' 或 'supplier_name'）
 * @param {string} params.counterpartyLabel - 对方角色标签（'客户' 或 '供应商'）
 */
async function checkOverdueInvoices({ model, type, label, counterpartyField, counterpartyLabel }) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 查询逾期发票
    const overdueInvoices = await model.getOverdueInvoices(today);
    logger.info(`[逾期检查] 发现 ${overdueInvoices.length} 张逾期${label}发票`);

    if (overdueInvoices.length === 0) {
      return { success: true, count: 0, invoices: [] };
    }

    // 获取有权限接收通知的用户
    const notifyUserIds = await getNotificationUsers([
      'finance:overdue:notify',
      type === 'ar' ? 'finance:ar:view' : 'finance:ap:view',
    ]);
    if (notifyUserIds.length === 0) {
      logger.warn('[逾期检查] 没有配置通知接收人，跳过发送');
      return { success: true, count: overdueInvoices.length, invoices: overdueInvoices };
    }

    const notificationJobs = overdueInvoices.map((invoice) => {
      const overdueDays = calculateOverdueDays(invoice.due_date, today);
      const priority = getOverduePriority(overdueDays);
      const counterpartyName = invoice[counterpartyField] || '未知';
      const title = `${label}发票逾期提醒`;
      const content = `[逾期提醒] ${type.toUpperCase()}发票 ${invoice.invoice_number} 已逾期 ${overdueDays} 天，${counterpartyLabel}: ${counterpartyName}, 余额: ¥${invoice.balance_amount}`;

      logger.warn(content);

      return {
        userIds: notifyUserIds,
        notification: {
          type: 'overdue_invoice',
          title,
          content,
          link: `/finance/${type}/invoices`,
          linkParams: { invoice_id: invoice.id },
          priority,
          sourceType: 'overdue_invoice',
          sourceId: invoice.id,
        },
      };
    });

    const notifyResult = await NotificationService.notifyMany(notificationJobs);
    logger.info(
      `[逾期检查] ${label}逾期通知发送完成 inserted=${notifyResult.inserted}, skipped=${notifyResult.skipped}`
    );

    return {
      success: true,
      count: overdueInvoices.length,
      invoices: overdueInvoices,
    };
  } catch (error) {
    logger.error(`[逾期检查] ${label}发票检查失败:`, error);
    throw error;
  }
}

/**
 * 检查逾期的应收发票
 */
async function checkOverdueARInvoices() {
  return checkOverdueInvoices({
    model: arModel,
    type: 'ar',
    label: '应收',
    counterpartyField: 'customer_name',
    counterpartyLabel: '客户',
  });
}

/**
 * 检查逾期的应付发票
 */
async function checkOverdueAPInvoices() {
  return checkOverdueInvoices({
    model: apModel,
    type: 'ap',
    label: '应付',
    counterpartyField: 'supplier_name',
    counterpartyLabel: '供应商',
  });
}

/**
 * 执行所有逾期检查
 */
async function runOverdueCheck() {
  logger.info('[逾期检查] 开始执行定时检查');

  try {
    const arResult = await checkOverdueARInvoices();
    const apResult = await checkOverdueAPInvoices();

    logger.info(`[逾期检查] 完成 - AR: ${arResult.count}张, AP: ${apResult.count}张`);

    return {
      success: true,
      ar: arResult,
      ap: apResult,
    };
  } catch (error) {
    logger.error('[逾期检查] 执行失败:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  checkOverdueARInvoices,
  checkOverdueAPInvoices,
  runOverdueCheck,
};
