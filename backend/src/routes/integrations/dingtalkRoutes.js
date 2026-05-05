/**
 * dingtalkRoutes.js
 * @description 钉钉回调路由
 * @date 2026-02-02
 */

const express = require('express');
const router = express.Router();
const dingtalkService = require('../../services/integrations/dingtalkService');
const expenseModel = require('../../models/expense');
const { logger } = require('../../utils/logger');
const { authenticateToken } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/requirePermission');

/**
 * 钉钉事件订阅回调
 * POST /api/dingtalk/callback
 */
router.post('/callback', async (req, res) => {
  try {
    const { signature, timestamp, nonce } = req.query;
    const { encrypt } = req.body;

    logger.info('[Dingtalk Callback] 收到回调请求');

    // 验证签名 (如果配置了Token)
    if (!dingtalkService.verifyCallback(signature, timestamp, nonce, encrypt)) {
      logger.warn('[Dingtalk Callback] 签名验证失败');
      return res.status(403).json({ errcode: 403, errmsg: '签名验证失败' });
    }

    // 解密数据
    let callbackData = req.body;
    if (encrypt) {
      callbackData = dingtalkService.decryptCallback(encrypt);
      if (!callbackData) {
        return res.status(400).json({ errcode: 400, errmsg: '解密失败' });
      }
    }

    logger.info('[Dingtalk Callback] 回调数据:', JSON.stringify(callbackData));

    // 处理不同事件类型
    const { EventType } = callbackData;

    if (EventType === 'check_url') {
      // 钉钉验证回调URL
      logger.info('[Dingtalk Callback] 回调URL验证成功');
      return res.json({
        msg_signature: signature,
        timeStamp: timestamp,
        nonce,
        encrypt: 'success',
      });
    }

    if (EventType === 'bpms_instance_change') {
      // 审批实例状态变更
      await handleApprovalStatusChange(callbackData);
    }

    // 返回成功响应
    res.json({ errcode: 0, errmsg: 'success' });
  } catch (error) {
    logger.error('[Dingtalk Callback] 处理回调失败:', error);
    res.status(500).json({ errcode: 500, errmsg: error.message });
  }
});

/**
 * 处理审批状态变更
 */
async function handleApprovalStatusChange(callbackData) {
  try {
    const { processInstanceId, result, type } = callbackData;

    // type: start(开始) / finish(结束) / terminate(终止)
    // result: agree(同意) / refuse(拒绝) - 仅在finish时有值

    logger.info(
      `[Dingtalk] 审批状态变更: instanceId=${processInstanceId}, type=${type}, result=${result}`
    );

    if (type === 'finish' || type === 'terminate') {
      // 查找对应的费用记录
      const expense = await expenseModel.getExpenseByDingtalkInstanceId(processInstanceId);

      if (!expense) {
        logger.warn(`[Dingtalk] 未找到对应的费用记录: instanceId=${processInstanceId}`);
        return;
      }

      // 根据审批结果更新费用状态
      let newStatus;

      if (type === 'terminate') {
        newStatus = 'cancelled';
      } else if (result === 'agree') {
        newStatus = 'approved';
      } else if (result === 'refuse') {
        newStatus = 'rejected';
      }

      if (newStatus) {
        await expenseModel.updateExpenseFromDingtalk(expense.id, {
          status: newStatus,
          dingtalk_status: type === 'finish' ? 'COMPLETED' : 'TERMINATED',
          dingtalk_result: result || type,
          approved_at: new Date(),
        });

        logger.info(`[Dingtalk] 费用记录已同步: expenseId=${expense.id}, status=${newStatus}`);
      }
    }
  } catch (error) {
    logger.error('[Dingtalk] 处理审批状态变更失败:', error);
    throw error;
  }
}

/**
 * 手动同步审批状态
 * POST /api/dingtalk/sync/:instanceId
 */
router.post(
  '/sync/:instanceId',
  authenticateToken,
  requirePermission('finance:expenses:update'),
  async (req, res) => {
    try {
      const { instanceId } = req.params;

      // 查询钉钉审批详情
      const detail = await dingtalkService.getApprovalDetail(instanceId);

      // 查找对应的费用记录
      const expense = await expenseModel.getExpenseByDingtalkInstanceId(instanceId);

      if (!expense) {
        return res.status(404).json({ success: false, message: '未找到对应的费用记录' });
      }

      // 更新状态
      let newStatus = expense.status;
      if (detail.status === 'COMPLETED') {
        newStatus = detail.result === 'agree' ? 'approved' : 'rejected';
      } else if (detail.status === 'TERMINATED') {
        newStatus = 'cancelled';
      }

      await expenseModel.updateExpenseFromDingtalk(expense.id, {
        status: newStatus,
        dingtalk_status: detail.status,
        dingtalk_result: detail.result,
      });

      res.json({
        success: true,
        message: '同步成功',
        data: {
          expenseId: expense.id,
          dingtalkStatus: detail.status,
          dingtalkResult: detail.result,
          newStatus,
        },
      });
    } catch (error) {
      logger.error('[Dingtalk] 手动同步失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/**
 * 从钉钉拉取审批到ERP
 * POST /api/dingtalk/import
 *
 * 请求体:
 * - days: 查询最近多少天的审批 (默认7天)
 */
router.post(
  '/import',
  authenticateToken,
  requirePermission('finance:expenses:update'),
  async (req, res) => {
    try {
      const { days = 7 } = req.body;

      const now = Date.now();
      const startTime = now - days * 24 * 60 * 60 * 1000;

      logger.info(`[Dingtalk] 开始从钉钉导入审批，最近 ${days} 天`);

      const result = await dingtalkService.syncFromDingtalk({ startTime, endTime: now });

      res.json({
        success: true,
        message: `导入完成: 新增${result.imported}, 更新${result.updated}, 跳过${result.skipped}`,
        data: result,
      });
    } catch (error) {
      logger.error('[Dingtalk] 从钉钉导入失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

module.exports = router;
