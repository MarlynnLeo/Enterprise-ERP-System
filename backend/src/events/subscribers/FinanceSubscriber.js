/**
 * FinanceSubscriber.js
 * @description 监听领域发出的各类业务事件，安全、优雅、独立地执行后续集成记账。
 *              每个处理器包含幂等性校验，确保同一源单据不会重复生成财务数据。
 * @date 2025-03-07
 */

const EventBus = require('../EventBus');
const FinanceIntegrationService = require('../../services/external/FinanceIntegrationService');
const { logger } = require('../../utils/logger');

class FinanceSubscriber {
    constructor() {
        this.registerListeners();
        logger.info('🎧 [FinanceSubscriber] 已挂载财务集成事件监听器');
    }

    registerListeners() {
        // 监听出库单完成事件
        EventBus.on('SALES_OUTBOUND_COMPLETED', this.handleSalesOutboundCompleted.bind(this));
        // 监听采购入库单完成事件
        EventBus.on('PURCHASE_RECEIPT_COMPLETED', this.handlePurchaseReceiptCompleted.bind(this));
        // 监听生产任务完工事件（将原任务控制器的核算逻辑解耦至此）
        EventBus.on('PRODUCTION_TASK_COMPLETED', this.handleProductionTaskCompleted.bind(this));
    }

    /**
     * 幂等性检查：检查指定源单据是否已生成过对应的财务记录
     * @param {string} table - 目标表名 (ar_invoices / ap_invoices / gl_entries / tax_invoices)
     * @param {string} sourceType - 源单据类型
     * @param {number|string} sourceId - 源单据ID
     * @param {string} [extraField] - 额外检查字段名 (如 document_number)
     * @param {string} [extraValue] - 额外检查字段值
     * @returns {Promise<boolean>} true = 已存在，应跳过
     */
    async checkDuplicate(table, sourceType, sourceId, extraField = null, extraValue = null) {
        const db = require('../../config/db');
        try {
            let query, params;
            if (extraField && extraValue) {
                query = `SELECT id FROM ${table} WHERE ${extraField} = ? LIMIT 1`;
                params = [extraValue];
            } else {
                query = `SELECT id FROM ${table} WHERE source_type = ? AND source_id = ? LIMIT 1`;
                params = [sourceType, sourceId];
            }
            const [rows] = await db.pool.execute(query, params);
            return rows.length > 0;
        } catch (error) {
            // 表不存在或字段不存在时不阻塞主流程
            logger.warn(`[FinanceSubscriber] 幂等性检查异常 (${table}): ${error.message}`);
            return false;
        }
    }

    /**
     * 处理采购入库完成通知
     * 对接财务凭证：自动生成应付发票、进项发票
     * 包含幂等性校验，防止重复事件触发导致重复生成
     */
    async handlePurchaseReceiptCompleted(payload) {
        const { receiptId, currentUserId } = payload;
        const db = require('../../config/db');

        logger.info(`[FinanceSubscriber] 收到入库完工广播，开始串行生成财务发票 - 入库单ID: ${receiptId}`);

        try {
            const [receiptData] = await db.pool.execute(
                `SELECT pr.*, s.name as supplier_name
                 FROM purchase_receipts pr
                 LEFT JOIN suppliers s ON pr.supplier_id = s.id
                 WHERE pr.id = ?`,
                [receiptId]
            );

            if (receiptData.length > 0) {
                const receipt = receiptData[0];
                const receiptNo = receipt.receipt_no;

                // 1. 生成应付发票（幂等检查）
                try {
                    const apExists = await this.checkDuplicate('ap_invoices', 'purchase_receipt', receiptId);
                    if (apExists) {
                        logger.info(`⏭️ [FinanceSubscriber] 入库单 ${receiptNo} 已生成过应付发票，跳过`);
                    } else {
                        await FinanceIntegrationService.generateAPInvoiceFromPurchaseReceipt(
                            receipt,
                            currentUserId
                        );
                        logger.info(`✅ [FinanceSubscriber] 应付发票自动生成成功 - 入库单: ${receiptNo}`);
                    }
                } catch (invoiceError) {
                    logger.warn(`⚠️ [FinanceSubscriber] 应付发票自动生成失败: ${invoiceError.message}`);
                }

                // 2. 生成进项发票（幂等检查）
                try {
                    const taxExists = await this.checkDuplicate(
                        'tax_invoices', null, null,
                        'related_document_id', receiptId
                    );
                    if (taxExists) {
                        logger.info(`⏭️ [FinanceSubscriber] 入库单 ${receiptNo} 已生成过进项发票，跳过`);
                    } else {
                        await FinanceIntegrationService.generateInputTaxInvoiceFromPurchaseReceipt(
                            receipt,
                            currentUserId
                        );
                        logger.info(`✅ [FinanceSubscriber] 进项发票自动生成成功 - 入库单: ${receiptNo}`);
                    }
                } catch (taxError) {
                    logger.warn(`⚠️ [FinanceSubscriber] 进项发票自动生成失败: ${taxError.message}`);
                }
            }
        } catch (criticalError) {
            logger.error(`❌ [FinanceSubscriber] 致命错误！导致入库单 ${receiptId} 财务处理中断:`, criticalError);
        }
    }

    /**
     * 处理销售出库完成通知
     * 当销售控制器真正 Commit 后，向总线播报，触发本方法。
     * 此方法内采用严格串行队列，从微观上保障没有跨表死锁风险。
     * 包含幂等性校验，防止重复事件触发导致重复生成
     */
    async handleSalesOutboundCompleted(payload) {
        const { salesOrder, outboundData, currentUserId } = payload;
        const outboundNo = outboundData.outbound_no;

        logger.info(`[FinanceSubscriber] 收到出库完工广播，开始串行生成财务数据 - 出库单: ${outboundNo}`);

        try {
            // 1. 生成应收发票（幂等检查）
            if (salesOrder) {
                try {
                    const arExists = await this.checkDuplicate('ar_invoices', 'sales_order', salesOrder.id);
                    if (arExists) {
                        logger.info(`⏭️ [FinanceSubscriber] 订单 ${salesOrder.order_no} 已生成过应收发票，跳过`);
                    } else {
                        await FinanceIntegrationService.generateARInvoiceFromSalesOrder(
                            salesOrder,
                            currentUserId
                        );
                        logger.info(`✅ [FinanceSubscriber] 应收发票自动生成成功 - 订单: ${salesOrder.order_no}`);
                    }
                } catch (invoiceError) {
                    logger.warn(`⚠️ [FinanceSubscriber] 应收发票自动生成失败（不影响主业务）: ${invoiceError.message}`);
                }
            }

            // 2. 结转销售成本（幂等检查：检查 gl_entries 是否已有此出库单的成本分录）
            try {
                const costExists = await this.checkDuplicate(
                    'gl_entries', 'sales_outbound', outboundData.id,
                    'document_number', outboundNo
                );
                if (costExists) {
                    logger.info(`⏭️ [FinanceSubscriber] 出库单 ${outboundNo} 已生成过成本分录，跳过`);
                } else {
                    await FinanceIntegrationService.generateCostEntryFromSalesOutbound(
                        outboundData,
                        currentUserId
                    );
                    logger.info(`✅ [FinanceSubscriber] 销售成本分录自动生成成功 - 出库单: ${outboundNo}`);
                }
            } catch (costError) {
                logger.warn(`⚠️ [FinanceSubscriber] 销售成本分录自动生成失败（不影响主业务）: ${costError.message}`);
            }

            // 3. 生成销项发票（幂等检查）
            try {
                const taxExists = await this.checkDuplicate(
                    'tax_invoices', null, null,
                    'related_document_id', outboundData.id
                );
                if (taxExists) {
                    logger.info(`⏭️ [FinanceSubscriber] 出库单 ${outboundNo} 已生成过销项发票，跳过`);
                } else {
                    await FinanceIntegrationService.generateOutputTaxInvoiceFromSalesOutbound(
                        outboundData,
                        currentUserId
                    );
                    logger.info(`✅ [FinanceSubscriber] 销项发票自动生成成功 - 出库单: ${outboundNo}`);
                }
            } catch (taxError) {
                logger.warn(`⚠️ [FinanceSubscriber] 销项发票自动生成失败（不影响主业务）: ${taxError.message}`);
            }

            logger.info(`[FinanceSubscriber] 🎉 出库单 ${outboundNo} 相关的财务流转已全部按序完成！`);

        } catch (criticalError) {
            // 顶层防御，确保订阅者的崩溃绝对不抛给上层发布者
            logger.error(`❌ [FinanceSubscriber] 致命错误！导致部分出库 ${outboundNo} 财务处理中断:`, criticalError);
        }
    }

    /**
     * 处理生产任务完工通知
     * 对接财务凭证：根据物料清单流转情况同步执行成本核算
     */
    async handleProductionTaskCompleted(payload) {
        const { taskId, taskCode, isFullComplete } = payload;
        
        logger.info(`[FinanceSubscriber] 收到生产完工广播，由于 SSOT 解耦架构限制，开始后台成本核算 - 任务ID: ${taskId}, 任务号: ${taskCode}`);

        try {
            if (isFullComplete) {
                const CostAccountingService = require('../../services/business/CostAccountingService');
                await CostAccountingService.calculateActualCost(taskId);
                logger.info(`✅ [FinanceSubscriber] 任务 ${taskCode} 实际成本自动核算与 GL 分录生成成功`);
            } else {
                logger.info(`ℹ️ [FinanceSubscriber] 任务 ${taskCode} 本次为部分完工，将在全部完工后统筹生成成本凭证`);
            }
        } catch (costError) {
            // 在独立的订阅者上下文中进行捕获，不再污染请求核心链路
            logger.warn(`⚠️ [FinanceSubscriber] 成本核算因主数据缺失挂起，未影响生产流转: ${costError.message}`);
        }
    }
}

module.exports = new FinanceSubscriber();
