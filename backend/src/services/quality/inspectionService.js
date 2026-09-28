const { pool } = require('../../config/db');
const InspectionClosureService = require('./InspectionClosureService');
const QualityInspection = require('../../models/qualityInspection');
const InspectionLockService = require('./InspectionLockService');

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
      is_full_inspection,
      aql_standard_id,
      aql_level,
    }
  ) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const inspection = await InspectionLockService.getForUpdate(connection, id);

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

      // 1. 更新检验单状态
      const updateData = {};
      if (status !== undefined) updateData.status = status;
      if (remarks !== undefined) updateData.note = remarks;
      if (qualified_quantity !== undefined) updateData.qualified_quantity = qualified_quantity;
      if (unqualified_quantity !== undefined) updateData.unqualified_quantity = finalUnqualified;

      // 追加 AQL 快照数据
      if (is_aql !== undefined)
        updateData.is_aql = is_aql === true || is_aql === 1 || is_aql === '1' ? 1 : 0;
      if (is_full_inspection !== undefined)
        updateData.is_full_inspection =
          is_full_inspection === true || is_full_inspection === 1 || is_full_inspection === '1'
            ? 1
            : 0;
      if (aql_standard_id !== undefined) updateData.aql_standard_id = aql_standard_id;
      if (aql_level !== undefined) updateData.aql_level = aql_level;

      // 状态接口与完整编辑使用相同的模型约束及来料闭环，并共享当前事务。
      const updatedData = await QualityInspection.updateInspection(id, updateData, connection);

      const traceErrorMsg = null;

      // 如果检验结束且有了结论，统一执行质检闭环
      if (
        inspection.inspection_type !== 'incoming' &&
        InspectionClosureService.isTerminalStatus(updatedData.status)
      ) {
        const closureResult = await InspectionClosureService.closeIfTerminal(
          inspection,
          { ...updatedData, id },
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
