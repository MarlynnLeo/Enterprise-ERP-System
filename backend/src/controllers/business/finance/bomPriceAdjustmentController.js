const { getConnection } = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const logger = require('../../../utils/logger');
const { AuditService, AuditAction, AuditModule } = require('../../../services/AuditService');
const { getAuthenticatedUserId } = require('../../../utils/authContext');

/**
 * 获取产品BOM物料的价格调整列表(当前生效的)
 */
exports.getAdjustments = async (req, res) => {
  let connection;
  try {
    const { productId } = req.params;

    connection = await getConnection();

    const [adjustments] = await connection.query(
      `
            SELECT 
                a.*,
                m.code as material_code,
                m.name as material_name,
                m.specs as material_specs,
                u.username as created_by_name
            FROM bom_material_price_adjustments a
            LEFT JOIN materials m ON a.material_id = m.id
            LEFT JOIN users u ON a.created_by = u.id
            WHERE a.product_id = ? AND a.is_active = 1
            ORDER BY a.created_at DESC
        `,
      [productId]
    );

    ResponseHandler.success(res, adjustments);
  } catch (error) {
    logger.error('获取价格调整列表失败:', error);
    ResponseHandler.error(res, '获取价格调整列表失败');
  } finally {
    if (connection) connection.release();
  }
};

/**
 * 保存/更新价格调整
 */
exports.saveAdjustment = async (req, res) => {
  let connection;
  try {
    const { product_id, bom_id, material_id, original_price, adjusted_price, adjustment_reason } =
      req.body;

    // 参数验证
    if (!product_id || !bom_id || !material_id) {
      return ResponseHandler.error(res, '产品ID、BOM ID和物料ID不能为空', 'BAD_REQUEST', 400);
    }

    if (adjusted_price === null || adjusted_price === undefined || adjusted_price < 0) {
      return ResponseHandler.error(res, '调整后价格必须大于等于0', 'BAD_REQUEST', 400);
    }

    if (!adjustment_reason || adjustment_reason.trim() === '') {
      return ResponseHandler.error(res, '调整原因不能为空', 'BAD_REQUEST', 400);
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // 查询当前是否已有生效的调整记录
    const [existing] = await connection.query(
      `
            SELECT * FROM bom_material_price_adjustments 
            WHERE product_id = ? AND material_id = ? AND is_active = 1
        `,
      [product_id, material_id]
    );

    let newVersion = 1;

    if (existing.length > 0) {
      // 如果已有调整记录,将其标记为历史
      await connection.query(
        `
                UPDATE bom_material_price_adjustments 
                SET is_active = 0 
                WHERE product_id = ? AND material_id = ? AND is_active = 1
            `,
        [product_id, material_id]
      );

      newVersion = existing[0].version + 1;
    }

    // 插入新的调整记录
    const [result] = await connection.query(
      `
            INSERT INTO bom_material_price_adjustments 
            (product_id, bom_id, material_id, original_price, adjusted_price, adjustment_reason, version, is_active, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `,
      [
        product_id,
        bom_id,
        material_id,
        original_price,
        adjusted_price,
        adjustment_reason,
        newVersion,
        getAuthenticatedUserId(req),
      ]
    );

    await connection.commit();

    // 记录审计日志
    await AuditService.logFromRequest(
      req,
      AuditModule.PRICING,
      AuditAction.UPDATE,
      'bom_material_price_adjustments',
      String(result.insertId),
      null,
      {
        product_id,
        material_id,
        original_price,
        adjusted_price,
        adjustment_reason,
        version: newVersion,
      }
    );

    ResponseHandler.success(res, { id: result.insertId, version: newVersion }, '价格调整保存成功');
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('保存价格调整失败:', error);
    ResponseHandler.error(res, '保存价格调整失败');
  } finally {
    if (connection) connection.release();
  }
};

/**
 * 获取某物料的价格调整历史
 */
exports.getAdjustmentHistory = async (req, res) => {
  let connection;
  try {
    const { productId, materialId } = req.params;

    connection = await getConnection();

    const [history] = await connection.query(
      `
            SELECT 
                a.*,
                u.username as created_by_name
            FROM bom_material_price_adjustments a
            LEFT JOIN users u ON a.created_by = u.id
            WHERE a.product_id = ? AND a.material_id = ?
            ORDER BY a.version DESC, a.created_at DESC
        `,
      [productId, materialId]
    );

    ResponseHandler.success(res, history);
  } catch (error) {
    logger.error('获取价格调整历史失败:', error);
    ResponseHandler.error(res, '获取价格调整历史失败');
  } finally {
    if (connection) connection.release();
  }
};

/**
 * 删除价格调整(将当前生效的调整删除,回退到上一个版本)
 */
exports.deleteAdjustment = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();
    await connection.beginTransaction();

    // 获取要删除的调整记录
    const [adjustment] = await connection.query(
      'SELECT * FROM bom_material_price_adjustments WHERE id = ?',
      [id]
    );

    if (adjustment.length === 0) {
      return ResponseHandler.error(res, '调整记录不存在', 'NOT_FOUND', 404);
    }

    const record = adjustment[0];

    // 删除当前记录
    await connection.query('DELETE FROM bom_material_price_adjustments WHERE id = ?', [id]);

    // 如果有上一个版本,激活它
    if (record.version > 1) {
      await connection.query(
        `
                UPDATE bom_material_price_adjustments 
                SET is_active = 1 
                WHERE product_id = ? AND material_id = ? AND version = ?
            `,
        [record.product_id, record.material_id, record.version - 1]
      );
    }

    await connection.commit();

    // 记录审计日志
    await AuditService.logFromRequest(
      req,
      AuditModule.PRICING,
      AuditAction.DELETE,
      'bom_material_price_adjustments',
      String(id),
      record,
      null
    );

    ResponseHandler.success(res, null, '价格调整删除成功');
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('删除价格调整失败:', error);
    ResponseHandler.error(res, '删除价格调整失败');
  } finally {
    if (connection) connection.release();
  }
};
