const db = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { getCurrentUserName } = require('../../../utils/userHelper');

const standardCostVersionController = {
  /**
   * 获取版本列表
   */
  getVersions: async (req, res) => {
    try {
      const { page = 1, pageSize = 20, status } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);

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
         LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}`,
        params
      );

      ResponseHandler.success(res, {
        list,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      });
    } catch (error) {
      logger.error('获取成本版本列表失败:', error);
      ResponseHandler.error(res, '获取成本版本列表失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 创建新版本
   */
  createVersion: async (req, res) => {
    try {
      const { version_no, version_name, effective_date, expiry_date, remark } = req.body;
      const created_by = await getCurrentUserName(req);

      if (!version_no || !version_name || !effective_date) {
        return ResponseHandler.error(res, '版本号、版本名、生效日期为必填项', 'VALIDATION_ERROR', 400);
      }

      const [existing] = await db.pool.execute(
        'SELECT id FROM standard_cost_versions WHERE version_no = ?',
        [version_no]
      );
      if (existing.length > 0) {
        return ResponseHandler.error(res, '该版本号已存在', 'VALIDATION_ERROR', 400);
      }

      await db.pool.execute(
        `INSERT INTO standard_cost_versions 
         (version_no, version_name, status, effective_date, expiry_date, remark, created_by)
         VALUES (?, ?, 'draft', ?, ?, ?, ?)`,
        [version_no, version_name, effective_date, expiry_date || null, remark || '', created_by]
      );

      ResponseHandler.success(res, { message: '版本创建成功' });
    } catch (error) {
      logger.error('创建版本失败:', error);
      ResponseHandler.error(res, '创建版本失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 提交版本进行审批
   */
  submitVersion: async (req, res) => {
    try {
      const { id } = req.params;
      const [version] = await db.pool.execute('SELECT status FROM standard_cost_versions WHERE id = ?', [id]);
      
      if (version.length === 0) return ResponseHandler.error(res, '版本不存在', 'NOT_FOUND', 404);
      if (version[0].status !== 'draft') return ResponseHandler.error(res, '仅草稿状态可提交', 'VALIDATION_ERROR', 400);

      await db.pool.execute('UPDATE standard_cost_versions SET status = "pending" WHERE id = ?', [id]);
      ResponseHandler.success(res, { message: '版本已提交审批' });
    } catch (error) {
      logger.error('提交审批失败:', error);
      ResponseHandler.error(res, '提交审批失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 审批通过版本（激活该版本，并归档其他活动版本）
   */
  approveVersion: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const { id } = req.params;
      const approved_by = await getCurrentUserName(req);

      const [version] = await connection.execute('SELECT status, effective_date FROM standard_cost_versions WHERE id = ?', [id]);
      if (version.length === 0) throw new Error('版本不存在');
      if (version[0].status !== 'pending') throw new Error('版本不在待审批状态');

      // 归档当前处于 active 的版本及其底层明细
      await connection.execute(`UPDATE standard_cost_versions SET status = 'archived' WHERE status = 'active'`);
      await connection.execute(`UPDATE standard_costs SET status = 'archived', is_active = 0 WHERE status = 'active'`);

      // 激活本版本及其底层明细
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
      ResponseHandler.success(res, { message: '审批通过，新标准成本版本已生效' });
    } catch (error) {
      await connection.rollback();
      logger.error('审批版本失败:', error);
      ResponseHandler.error(res, error.message || '审批失败', 'SERVER_ERROR', 500);
    } finally {
      connection.release();
    }
  },

  /**
   * 智能提取采购入库均价（针对某版本）
   */
  generateCostsFromPurchase: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const { id } = req.params;
      const operator = await getCurrentUserName(req);

      const [version] = await connection.execute('SELECT status FROM standard_cost_versions WHERE id = ?', [id]);
      if (version.length === 0) throw new Error('版本不存在');
      if (version[0].status !== 'draft') throw new Error('只有草稿状态的版本可以生成数据');

      // 1. 先清理该版本的历史草稿
      await connection.execute('DELETE FROM standard_costs WHERE version_id = ?', [id]);

      // 2. 获取所有启用的物料的基础采购价
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
          isCalculating: false // 用于检测循环依赖
        });
      });

      // 3. 获取所有启用的 BOM（状态为 1 或已审核）
      const [boms] = await connection.execute(`
        SELECT bm.id as bom_id, bm.product_id, bd.material_id as component_id, bd.quantity
        FROM bom_masters bm
        JOIN bom_details bd ON bm.id = bd.bom_id
        WHERE bm.status = 1 OR bm.approved_by IS NOT NULL
      `);

      // 挂载 BOM 子件
      boms.forEach(row => {
        const parent = materialGraph.get(row.product_id);
        if (parent) {
          parent.components.push({
            id: row.component_id,
            quantity: parseFloat(row.quantity) || 0
          });
        }
      });

      // 4. 定义递归计算成本的函数
      const calculateCost = (matId) => {
        const mat = materialGraph.get(matId);
        if (!mat) return 0; // 物料不存在或被停用
        if (mat.calculatedPrice !== null) return mat.calculatedPrice; // 已计算过缓存
        if (mat.isCalculating) {
          // 发现循环依赖，退回基础成本避免死循环死锁
          logger.warn(`BOM循环依赖检测到: 物料 ID ${matId}`);
          return mat.basePrice;
        }

        mat.isCalculating = true;

        if (mat.components.length === 0) {
          // 底层采购件
          mat.calculatedPrice = mat.basePrice;
        } else {
          // 自制或组装件通过子件相加卷算 (Rollup)
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

      // 5. 遍历所有物料执行计算和批量插入
      let inserted = 0;
      for (const [matId, mat] of materialGraph.entries()) {
        const finalCost = calculateCost(matId);
        
        // 过滤掉没有成本的项
        if (finalCost <= 0) continue;

        const sourceType = mat.components.length > 0 ? 'rollup' : 'purchase_average';

        await connection.execute(`
          INSERT INTO standard_costs (version_id, material_id, cost_element, standard_price, effective_date, status, is_active, source_type, operator)
          VALUES (?, ?, 'material', ?, CURDATE(), 'draft', 0, ?, ?)
        `, [id, matId, finalCost, sourceType, operator]);
        
        inserted++;
      }

      await connection.commit();
      ResponseHandler.success(res, { message: `成功智能生成 ${inserted} 条基础物料挂账草稿（包含多级BOM树状卷算）` });
    } catch (error) {
      await connection.rollback();
      logger.error('智能提取卷算失败:', error);
      ResponseHandler.error(res, error.message || '系统智能取价卷算失败', 'SERVER_ERROR', 500);
    } finally {
      connection.release();
    }
  }
};

module.exports = standardCostVersionController;
