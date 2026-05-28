const db = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { getCurrentUserName } = require('../../../utils/userHelper');
const CodeGeneratorService = require('../../../services/business/CodeGeneratorService');

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
  const messages = ['not found', 'status', 'cannot', 'only', 'exists', 'length cannot exceed'];
  return messages.some((message) => error.message?.includes(message));
}

const standardCostVersionController = {
  /**
   * 鑾峰彇鐗堟湰鍒楄〃
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
        `SELECT * FROM standard_cost_versions
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
      logger.error('鑾峰彇鎴愭湰鐗堟湰鍒楄〃澶辫触:', error);
      ResponseHandler.error(res, '鑾峰彇鎴愭湰鐗堟湰鍒楄〃澶辫触', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 鍒涘缓鏂扮増鏈?
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

      ResponseHandler.success(res, { id: result.insertId, version_no, message: '鐗堟湰鍒涘缓鎴愬姛' });
    } catch (error) {
      logger.error('鍒涘缓鐗堟湰澶辫触:', error);
      ResponseHandler.error(
        res,
        error.message || '鍒涘缓鐗堟湰澶辫触',
        isBusinessError(error) ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isBusinessError(error) ? 400 : 500
      );
    }
  },

  /**
   * 鎻愪氦鐗堟湰杩涜瀹℃壒
   */
  submitVersion: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const { id } = req.params;
      const [version] = await connection.execute('SELECT status FROM standard_cost_versions WHERE id = ? FOR UPDATE', [id]);
      if (version.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, 'Version not found', 'NOT_FOUND', 404);
      }
      if (version[0].status !== 'draft') {
        await connection.rollback();
        return ResponseHandler.error(res, 'Only draft versions can be submitted', 'VALIDATION_ERROR', 400);
      }
      await connection.execute('UPDATE standard_cost_versions SET status = "pending" WHERE id = ?', [id]);
      await connection.commit();
      ResponseHandler.success(res, { message: 'Version submitted for approval' });
    } catch (error) {
      await connection.rollback();
      logger.error('鎻愪氦瀹℃壒澶辫触:', error);
      ResponseHandler.error(res, '鎻愪氦瀹℃壒澶辫触', 'SERVER_ERROR', 500);
    } finally {
      connection.release();
    }
  },

  /**
   * 瀹℃壒閫氳繃鐗堟湰锛堟縺娲昏鐗堟湰锛屽苟褰掓。鍏朵粬娲诲姩鐗堟湰锛?
   */
  approveVersion: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const { id } = req.params;
      const approved_by = await getCurrentUserName(req);

      const [version] = await connection.execute('SELECT status, effective_date FROM standard_cost_versions WHERE id = ? FOR UPDATE', [id]);
      if (version.length === 0) throw new Error('Version not found');
      if (version[0].status !== 'pending') throw new Error('Version is not pending approval');

      const [[costCount]] = await connection.execute(
        'SELECT COUNT(*) as count FROM standard_costs WHERE version_id = ?',
        [id]
      );
      if (costCount.count === 0) {
        throw new Error('鐗堟湰鏈敓鎴愭爣鍑嗘垚鏈暟鎹紝涓嶈兘瀹℃壒鐢熸晥');
      }

      // 褰掓。褰撳墠澶勪簬 active 鐨勭増鏈強鍏跺簳灞傛槑缁?
      await connection.execute(`SELECT id FROM standard_cost_versions WHERE status = 'active' FOR UPDATE`);
      await connection.execute(`UPDATE standard_cost_versions SET status = 'archived' WHERE status = 'active'`);
      await connection.execute(`UPDATE standard_costs SET status = 'archived', is_active = 0 WHERE status = 'active'`);

      // 婵€娲绘湰鐗堟湰鍙婂叾搴曞眰鏄庣粏
      await connection.execute(`
        UPDATE standard_cost_versions
        SET status = 'active', approved_by = ?, approved_at = NOW()
        WHERE id = ?
      `, [approved_by, id]);

      await connection.execute(`
        UPDATE standard_costs
        SET status = 'active', is_active = 1, effective_date = ?
        WHERE version_id = ?
      `, [version[0].effective_date, id]);

      await connection.commit();
      ResponseHandler.success(res, { message: 'Version approved and activated' });
    } catch (error) {
      await connection.rollback();
      logger.error('瀹℃壒鐗堟湰澶辫触:', error);
      ResponseHandler.error(
        res,
        error.message || '瀹℃壒澶辫触',
        isBusinessError(error) ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isBusinessError(error) ? 400 : 500
      );
    } finally {
      connection.release();
    }
  },

  /**
   * 鏅鸿兘鎻愬彇閲囪喘鍏ュ簱鍧囦环锛堥拡瀵规煇鐗堟湰锛?
   */
  generateCostsFromPurchase: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const { id } = req.params;
      const operator = await getCurrentUserName(req);

      const [version] = await connection.execute('SELECT status FROM standard_cost_versions WHERE id = ? FOR UPDATE', [id]);
      if (version.length === 0) throw new Error('Version not found');
      if (version[0].status !== 'draft') throw new Error('Only draft versions can generate cost rows');

      // 1. 鍏堟竻鐞嗚鐗堟湰鐨勫巻鍙茶崏绋?
      await connection.execute('DELETE FROM standard_costs WHERE version_id = ?', [id]);

      // 2. 鑾峰彇鎵€鏈夊惎鐢ㄧ殑鐗╂枡鐨勫熀纭€閲囪喘浠?
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
          isCalculating: false // 鐢ㄤ簬妫€娴嬪惊鐜緷璧?
        });
      });

      // 3. 鑾峰彇鎵€鏈夊惎鐢ㄧ殑 BOM锛堢姸鎬佷负 1 鎴栧凡瀹℃牳锛?
      const [boms] = await connection.execute(`
        SELECT bm.id as bom_id, bm.product_id, bd.material_id as component_id, bd.quantity
        FROM bom_masters bm
        JOIN bom_details bd ON bm.id = bd.bom_id
        WHERE bm.status = 1 OR bm.approved_by IS NOT NULL
      `);

      // 鎸傝浇 BOM 瀛愪欢
      boms.forEach(row => {
        const parent = materialGraph.get(row.product_id);
        if (parent) {
          parent.components.push({
            id: row.component_id,
            quantity: parseFloat(row.quantity) || 0
          });
        }
      });

      // 4. 瀹氫箟閫掑綊璁＄畻鎴愭湰鐨勫嚱鏁?
      const calculateCost = (matId) => {
        const mat = materialGraph.get(matId);
        if (!mat) return 0; // 鐗╂枡涓嶅瓨鍦ㄦ垨琚仠鐢?
        if (mat.calculatedPrice !== null) return mat.calculatedPrice; // 宸茶绠楄繃缂撳瓨
        if (mat.isCalculating) {
          // 鍙戠幇寰幆渚濊禆锛岄€€鍥炲熀纭€鎴愭湰閬垮厤姝诲惊鐜閿?
          logger.warn(`BOM寰幆渚濊禆妫€娴嬪埌: 鐗╂枡 ID ${matId}`);
          return mat.basePrice;
        }

        mat.isCalculating = true;

        if (mat.components.length === 0) {
          // 搴曞眰閲囪喘浠?
          mat.calculatedPrice = mat.basePrice;
        } else {
          // 鑷埗鎴栫粍瑁呬欢閫氳繃瀛愪欢鐩稿姞鍗风畻 (Rollup)
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

      // 5. 閬嶅巻鎵€鏈夌墿鏂欐墽琛岃绠楀拰鎵归噺鎻掑叆
      let inserted = 0;
      for (const [matId, mat] of materialGraph.entries()) {
        const finalCost = calculateCost(matId);

        // 杩囨护鎺夋病鏈夋垚鏈殑椤?
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
      logger.error('鏅鸿兘鎻愬彇鍗风畻澶辫触:', error);
      ResponseHandler.error(
        res,
        error.message || '绯荤粺鏅鸿兘鍙栦环鍗风畻澶辫触',
        isBusinessError(error) ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isBusinessError(error) ? 400 : 500
      );
    } finally {
      connection.release();
    }
  }
};

module.exports = standardCostVersionController;
