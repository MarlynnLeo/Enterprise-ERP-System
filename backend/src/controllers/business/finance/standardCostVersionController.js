const db = require('../../../config/db');
const { safeParseId } = require('../../../utils/safeParseId');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { getCurrentUserName } = require('../../../utils/userHelper');
const CodeGeneratorService = require('../../../services/business/CodeGeneratorService');
const BusinessError = require('../../../utils/BusinessError');

/**
 * 标准成本版本状态常量
 */
const COST_VERSION_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
};

function parsePositiveInteger(value, fallback, max = 1000) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function assertMaxLength(fieldName, value, maxLength) {
  if (value !== null && value !== undefined && String(value).length > maxLength) {
    throw new Error(`${fieldName} length cannot exceed ${maxLength} characters`);
  }
}

function isBusinessError(error) {
  return BusinessError.is(error)
    || ['not found', 'status', 'cannot', 'only', 'exists', 'length cannot exceed'].some(
      (message) => error.message?.includes(message)
    );
}

const standardCostVersionController = {
  /**
   * ????????
   */
  getVersions: async (req, res) => {
    try {
      const { page = 1, pageSize = 20, status } = req.query;
      const pageNumber = parsePositiveInteger(page, 1);
      const pageSizeNumber = parsePositiveInteger(pageSize, 20, 100);
      const offset = (pageNumber - 1) * pageSizeNumber;

      let whereClause = '1=1';
      const params = [];
      if (status) {
        whereClause += ' AND status = ?';
        params.push(status);
      }

      const [countResult] = await db.pool.execute(
        `SELECT COUNT(*) as total FROM standard_cost_versions WHERE ${whereClause}`,
        params
      );

      const [list] = await db.pool.execute(
        `SELECT id, version_no, version_name, status, effective_date, expiry_date, remark, created_by, approved_by, approved_at, created_at, updated_at FROM standard_cost_versions
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT ${pageSizeNumber} OFFSET ${offset}`,
        params
      );

      ResponseHandler.success(res, {
        list,
        total: countResult[0].total,
        page: pageNumber,
        pageSize: pageSizeNumber
      });
    } catch (error) {
      logger.error('??????????:', error);
      ResponseHandler.error(res, '??????????', 'SERVER_ERROR', 500);
    }
  },

  /**
   * ?????
   */
  createVersion: async (req, res) => {
    try {
      const { version_name, effective_date, expiry_date, remark } = req.body;
      let { version_no } = req.body;
      const created_by = await getCurrentUserName(req);

      if (!version_name || !effective_date) {
        return ResponseHandler.error(res, 'Version name and effective date are required', 'VALIDATION_ERROR', 400);
      }

      version_no = version_no || await CodeGeneratorService.nextCode('cost_version');
      assertMaxLength('version_no', version_no, 50);
      assertMaxLength('version_name', version_name, 100);
      assertMaxLength('remark', remark, 255);

      const [existing] = await db.pool.execute(
        'SELECT id FROM standard_cost_versions WHERE version_no = ?',
        [version_no]
      );
      if (existing.length > 0) {
        return ResponseHandler.error(res, 'Version number already exists', 'VALIDATION_ERROR', 400);
      }

      const [result] = await db.pool.execute(
        `INSERT INTO standard_cost_versions
         (version_no, version_name, status, effective_date, expiry_date, remark, created_by)
         VALUES (?, ?, 'draft', ?, ?, ?, ?)`,
        [version_no, version_name, effective_date, expiry_date || null, remark || '', created_by]
      );

      ResponseHandler.success(res, { id: result.insertId, version_no, message: '??????' });
    } catch (error) {
      logger.error('??????:', error);
      ResponseHandler.error(
        res,
        error.message || '??????',
        isBusinessError(error) ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isBusinessError(error) ? 400 : 500
      );
    }
  },

  /**
   * ????????
   */
  submitVersion: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const id = safeParseId(req.params.id, '版本ID');
      const [version] = await connection.execute('SELECT status FROM standard_cost_versions WHERE id = ? FOR UPDATE', [id]);
      if (version.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, 'Version not found', 'NOT_FOUND', 404);
      }
      if (version[0].status !== COST_VERSION_STATUS.DRAFT) {
        await connection.rollback();
        return ResponseHandler.error(res, 'Only draft versions can be submitted', 'VALIDATION_ERROR', 400);
      }
      await connection.execute('UPDATE standard_cost_versions SET status = ? WHERE id = ?', [COST_VERSION_STATUS.PENDING, id]);
      await connection.commit();
      ResponseHandler.success(res, { message: 'Version submitted for approval' });
    } catch (error) {
      await connection.rollback();
      logger.error('??????:', error);
      ResponseHandler.error(res, '??????', 'SERVER_ERROR', 500);
    } finally {
      connection.release();
    }
  },

  /**
   * ???????????????????????
   */
  approveVersion: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const id = safeParseId(req.params.id, '版本ID');
      const approved_by = await getCurrentUserName(req);

      const [version] = await connection.execute('SELECT status, effective_date, created_by FROM standard_cost_versions WHERE id = ? FOR UPDATE', [id]);
      if (version.length === 0) throw new Error('Version not found');
      if (version[0].status !== COST_VERSION_STATUS.PENDING) throw new Error('Version is not pending approval');
      if (String(version[0].created_by || '') === String(approved_by || '')) {
        throw new Error('标准成本版本制单人与审批人必须分离');
      }

      const [[costCount]] = await connection.execute(
        'SELECT COUNT(*) as count FROM standard_costs WHERE version_id = ?',
        [id]
      );
      if (costCount.count === 0) {
        throw new Error('??????????????????');
      }

      // ?????? active ??????????
      await connection.execute('SELECT id FROM standard_cost_versions WHERE status = ? FOR UPDATE', [COST_VERSION_STATUS.ACTIVE]);
      await connection.execute('UPDATE standard_cost_versions SET status = ? WHERE status = ?', [COST_VERSION_STATUS.ARCHIVED, COST_VERSION_STATUS.ACTIVE]);
      await connection.execute('UPDATE standard_costs SET status = ?, is_active = 0 WHERE status = ?', [COST_VERSION_STATUS.ARCHIVED, COST_VERSION_STATUS.ACTIVE]);

      // 将当前版本设为 active
      const [approvalUpdate] = await connection.execute(
        'UPDATE standard_cost_versions SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ? AND status = ?',
        [COST_VERSION_STATUS.ACTIVE, approved_by, id, COST_VERSION_STATUS.PENDING]
      );
      if (approvalUpdate.affectedRows !== 1) {
        throw new Error('标准成本版本状态已变更，请刷新后重试');
      }

      await connection.execute(
        'UPDATE standard_costs SET status = ?, is_active = 1, effective_date = ? WHERE version_id = ?',
        [COST_VERSION_STATUS.ACTIVE, version[0].effective_date, id]
      );

      await connection.commit();
      ResponseHandler.success(res, { message: 'Version approved and activated' });
    } catch (error) {
      await connection.rollback();
      logger.error('??????:', error);
      ResponseHandler.error(
        res,
        error.message || '????',
        isBusinessError(error) ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isBusinessError(error) ? 400 : 500
      );
    } finally {
      connection.release();
    }
  },

  /**
   * ?????????????????
   */
  generateCostsFromPurchase: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const id = safeParseId(req.params.id);
      const operator = await getCurrentUserName(req);

      const [version] = await connection.execute('SELECT status FROM standard_cost_versions WHERE id = ? FOR UPDATE', [id]);
      if (version.length === 0) throw new Error('Version not found');
      if (version[0].status !== COST_VERSION_STATUS.DRAFT) throw new Error('Only draft versions can generate cost rows');

      // 1. ????????????
      await connection.execute('DELETE FROM standard_costs WHERE version_id = ?', [id]);

      // 2. ???????????????
      const [materials] = await connection.execute(`
        SELECT m.id, m.code, m.name, COALESCE(
          (SELECT AVG(poi.price) FROM purchase_order_items poi
           JOIN purchase_orders po ON poi.order_id = po.id
           WHERE poi.material_id = m.id AND po.status = 'completed'
           AND po.created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)),
          m.cost_price,
          m.price,
          0
        ) as suggested_price
        FROM materials m WHERE m.status = 1
      `);

      const materialGraph = new Map();
      materials.forEach(m => {
        materialGraph.set(m.id, {
          id: m.id,
          code: m.code,
          basePrice: parseFloat(m.suggested_price) || 0,
          calculatedPrice: null,
          components: [],
          isCalculating: false // ????????
        });
      });

      // 3. ??????? BOM???? 1 ??????
      const [boms] = await connection.execute(`
        SELECT bm.id as bom_id, bm.product_id, bd.material_id as component_id, bd.quantity
        FROM bom_masters bm
        JOIN bom_details bd ON bm.id = bd.bom_id
        WHERE bm.status = 1 OR bm.approved_by IS NOT NULL
      `);

      // ?? BOM ???
      boms.forEach(row => {
        const parent = materialGraph.get(row.product_id);
        if (parent) {
          parent.components.push({
            id: row.component_id,
            quantity: parseFloat(row.quantity) || 0
          });
        }
      });

      // 4. ???????????
      const calculateCost = (matId) => {
        const mat = materialGraph.get(matId);
        if (!mat) return 0; // ?????????
        if (mat.calculatedPrice !== null) return mat.calculatedPrice; // ??????
        if (mat.isCalculating) {
          // ????????????????????
          logger.warn(`??? BOM ????: ?? ID ${matId}`);
          return mat.basePrice;
        }

        mat.isCalculating = true;

        if (mat.components.length === 0) {
          // ??????
          mat.calculatedPrice = mat.basePrice;
        } else {
          // ???????????????
          let totalCost = 0;
          for (const comp of mat.components) {
            const compCost = calculateCost(comp.id);
            totalCost += compCost * comp.quantity;
          }
          mat.calculatedPrice = totalCost;
        }

        mat.isCalculating = false;
        return mat.calculatedPrice;
      };

      // 5. ????????????????
      let inserted = 0;
      for (const [matId, mat] of materialGraph.entries()) {
        const finalCost = calculateCost(matId);

        // ???????????
        if (finalCost <= 0) continue;

        const sourceType = mat.components.length > 0 ? 'rollup' : 'purchase_average';

        await connection.execute(`
          INSERT INTO standard_costs (version_id, material_id, cost_element, standard_price, effective_date, status, is_active, source_type, operator)
          VALUES (?, ?, 'material', ?, CURDATE(), 'draft', 0, ?, ?)
        `, [id, matId, finalCost, sourceType, operator]);

        inserted++;
      }

      await connection.commit();
      ResponseHandler.success(res, { message: `Generated ${inserted} standard cost draft rows` });
    } catch (error) {
      await connection.rollback();
      logger.error('????????:', error);
      ResponseHandler.error(
        res,
        error.message || '??????????',
        isBusinessError(error) ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isBusinessError(error) ? 400 : 500
      );
    } finally {
      connection.release();
    }
  }
};

module.exports = standardCostVersionController;
