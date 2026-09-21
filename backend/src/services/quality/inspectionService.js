const { pool } = require('../../config/db');
const businessConfig = require('../../config/businessConfig');
const InspectionClosureService = require('./InspectionClosureService');
const QualityInspection = require('../../models/qualityInspection');
const InspectionLockService = require('./InspectionLockService');
// 从统一的业务配置获取检验状态常量（原 utils/constants.js 不存在，已修正）
const STATUS = { QUALITY: businessConfig.status.inspection };

class InspectionService {
  /**
   * 更新检验单状态，并在同一个事务中处理追溯链路与关联单据的更新
   */
  async updateInspectionStatusAndTrace(
    id,
    {
      status,
      remarks,
      qualified_quantity,
      unqualified_quantity,
      is_aql,
      aql_standard_id,
      aql_level,
      accept_limit,
      reject_limit,
    }
  ) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const inspection = await InspectionLockService.getForUpdate(connection, id);

      // 如果传了 AQL 数据，自动介入判定逻辑
      let finalStatus = status;
      const finalUnqualified = Number(unqualified_quantity ?? inspection.unqualified_quantity ?? 0);
      if (
        !Number.isFinite(finalUnqualified) ||
        finalUnqualified < 0 ||
        (qualified_quantity !== undefined &&
          (!Number.isFinite(Number(qualified_quantity)) || Number(qualified_quantity) < 0))
      ) {
        throw Object.assign(new Error('合格数量和不合格数量必须是有效的非负数字'), {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

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
      };
      if (remarks !== undefined) updateData.note = remarks;
      if (qualified_quantity !== undefined) updateData.qualified_quantity = qualified_quantity;
      if (unqualified_quantity !== undefined) updateData.unqualified_quantity = finalUnqualified;

      // 追加 AQL 快照数据
      if (is_aql !== undefined) updateData.is_aql = is_aql ? 1 : 0;
      if (aql_standard_id) updateData.aql_standard_id = aql_standard_id;
      if (aql_level) updateData.aql_level = aql_level;
      if (accept_limit !== undefined) updateData.accept_limit = accept_limit;
      if (reject_limit !== undefined) updateData.reject_limit = reject_limit;

      // 状态接口与完整编辑使用相同的模型约束及来料闭环，并共享当前事务。
      const updatedData = await QualityInspection.updateInspection(id, updateData, connection);

      const traceErrorMsg = null;

      // 如果检验结束且有了结论，统一执行质检闭环
      if (
        inspection.inspection_type !== 'incoming' &&
        InspectionClosureService.isTerminalStatus(finalStatus)
      ) {
        const closureResult = await InspectionClosureService.closeIfTerminal(
          inspection,
          { ...updateData, id },
          connection
        );
        Object.assign(updatedData, closureResult);
      }

      await connection.commit();

      return {
        success: true,
        traceError: traceErrorMsg,
        updatedData,
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
