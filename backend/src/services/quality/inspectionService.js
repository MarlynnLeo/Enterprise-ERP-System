const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const QualityInspection = require('../../models/qualityInspection');
const businessConfig = require('../../config/businessConfig');
// 从统一的业务配置获取检验状态常量（原 utils/constants.js 不存在，已修正）
const STATUS = { QUALITY: businessConfig.status.inspection };

// 辅助函数: 更新采购订单的检验数据
const updatePurchaseOrderAfterInspection = async (
    connection,
    inspection,
    qualifiedQuantity,
    unqualifiedQuantity
) => {
    if (inspection.inspection_type !== 'incoming' || !inspection.source_no) return;

    try {

        // 查询采购订单ID
        const [orders] = await connection.query(
            'SELECT id FROM purchase_orders WHERE order_no = ?',
            [inspection.source_no]
        );

        if (orders.length > 0) {
            const orderId = orders[0].id;

            // 更新检验数据，此处使用事务内的 connection 而不是模型的全局 pool
            await connection.query(
                `UPDATE purchase_order_items 
         SET inspected_quantity = inspected_quantity + ?,
             qualified_quantity = qualified_quantity + ?,
             unqualified_quantity = unqualified_quantity + ?
         WHERE order_id = ? AND material_id = ?`,
                [
                    inspection.sampled_quantity,
                    qualifiedQuantity || 0,
                    unqualifiedQuantity || 0,
                    orderId,
                    inspection.material_id
                ]
            );

            // 在当前事务内同步采购订单明细的检验数量
            logger.info(`Updated purchase order items for order ${inspection.source_no} via transaction`);
        }
    } catch (error) {
        logger.error('更新采购订单检验数据失败:', error);
        throw error; // 让上层事务回滚
    }
};

class InspectionService {

    /**
     * 更新检验单状态，并在同一个事务中处理追溯链路与关联单据的更新
     */
    async updateInspectionStatusAndTrace(id, {
        status, result, remarks,
        qualified_quantity, unqualified_quantity,
        is_aql, aql_standard_id, aql_level, accept_limit, reject_limit
    }) {
        const connection = await pool.getConnection();

        try {
            // 获取检验单信息
            const inspection = await QualityInspection.getInspectionById(id);
            if (!inspection) {
                throw new Error('检验单不存在');
            }

            await connection.beginTransaction();

            // 如果传了 AQL 数据，自动介入判定逻辑
            let finalStatus = status;
            const finalUnqualified = unqualified_quantity || 0;

            if (is_aql && accept_limit !== undefined && reject_limit !== undefined) {
                if (finalUnqualified <= accept_limit) {
                    finalStatus = STATUS.QUALITY.PASSED;
                } else if (finalUnqualified >= reject_limit) {
                    finalStatus = STATUS.QUALITY.FAILED;
                }
            }

            // 1. 更新检验单状态
            const updateData = {
                status: finalStatus,
                result: result || inspection.result,
                remarks: remarks || inspection.remarks,
                qualified_quantity: qualified_quantity || 0,
                unqualified_quantity: finalUnqualified,
            };

            // 追加 AQL 快照数据
            if (is_aql !== undefined) updateData.is_aql = is_aql ? 1 : 0;
            if (aql_standard_id) updateData.aql_standard_id = aql_standard_id;
            if (aql_level) updateData.aql_level = aql_level;
            if (accept_limit !== undefined) updateData.accept_limit = accept_limit;
            if (reject_limit !== undefined) updateData.reject_limit = reject_limit;

            // 注意：这里不再调用 QualityInspection.updateInspection，因为那是独立连接
            // 我们在事务内执行 UPDATE
            const updateFields = [];
            const updateValues = [];
            for (const [key, value] of Object.entries(updateData)) {
                if (value !== undefined) {
                    updateFields.push(`${key} = ?`);
                    updateValues.push(value);
                }
            }
            updateValues.push(id);
            await connection.query(`UPDATE quality_inspections SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);

            const traceErrorMsg = null;

            // 如果检验结束且有了结论 (AQL判定、手动判定通过或不通过)
            if (finalStatus === STATUS.QUALITY.PASSED || finalStatus === STATUS.QUALITY.COMPLETED || finalStatus === STATUS.QUALITY.FAILED) {
                // 2. 更新采购订单状态（传入 transaction connection）
                await updatePurchaseOrderAfterInspection(
                    connection,
                    inspection,
                    updateData.qualified_quantity,
                    updateData.unqualified_quantity
                );

                // 3. 处理追溯逻辑已移除

                // 4. 自动创建不合格品记录
                if (updateData.unqualified_quantity > 0 || (inspection.unqualified_quantity > 0)) {
                    try {
                        const NonconformingProductService = require('../business/NonconformingProductService');
                        // 合并更新后的数量，调用生成不合格品台账
                        const ncpInspection = { ...inspection, ...updateData };
                        await NonconformingProductService.autoCreateFromInspection(ncpInspection);
                    } catch (ncpError) {
                        logger.error('Failed to auto-create NCP:', ncpError);
                        throw ncpError;
                    }
                }
            }

            await connection.commit();

            return {
                success: true,
                traceError: traceErrorMsg,
                updatedData: updateData
            };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

}

module.exports = new InspectionService();
