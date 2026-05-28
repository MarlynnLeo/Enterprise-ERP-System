const { pool } = require('../../config/db');
const businessConfig = require('../../config/businessConfig');
const InspectionClosureService = require('./InspectionClosureService');
// 从统一的业务配置获取检验状态常量（原 utils/constants.js 不存在，已修正）
const STATUS = { QUALITY: businessConfig.status.inspection };

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
            await connection.beginTransaction();

            // 获取并锁定检验单，避免并发重复提交导致数量重复累计
            const [inspectionRows] = await connection.query(
                'SELECT * FROM quality_inspections WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
                [id]
            );
            if (!inspectionRows || inspectionRows.length === 0) {
                throw new Error('检验单不存在');
            }
            const inspection = inspectionRows[0];
            const [items] = await connection.query(
                'SELECT * FROM quality_inspection_items WHERE inspection_id = ? ORDER BY id',
                [id]
            );
            inspection.items = items;

            // 如果传了 AQL 数据，自动介入判定逻辑
            let finalStatus = status;
            const numericUnqualified = Number(unqualified_quantity);
            const finalUnqualified = Number.isFinite(numericUnqualified) ? numericUnqualified : 0;

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
            };
            if (qualified_quantity !== undefined) updateData.qualified_quantity = qualified_quantity;
            if (unqualified_quantity !== undefined) updateData.unqualified_quantity = finalUnqualified;

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

            // 如果检验结束且有了结论，统一执行质检闭环
            if (InspectionClosureService.isTerminalStatus(finalStatus)) {
                const closureResult = await InspectionClosureService.closeIfTerminal(
                    inspection,
                    { ...updateData, id },
                    connection
                );
                Object.assign(updateData, closureResult);
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
