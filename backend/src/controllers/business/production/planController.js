/**
 * planController.js
 * @description 生产计划控制器
 * @date 2025-10-16
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const { pool } = require('../../../config/db');
const { handleError } = require('./shared/errorHandler');
const { softDelete } = require('../../../utils/softDelete');
const {
  calculateMaterialRequirementsWithStock,
  calculateAndInsertMaterials,
} = require('../../../services/business/MaterialCalculationService');
const { PRODUCTION_STATUS_KEYS, PRODUCTION_PLAN_STATUS_FLOW, getProductionStatusText } = require('../../../constants/systemConstants');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');

// 计划状态常量别名
const PLAN_STATUS = businessConfig.status.productionPlan;

/**
 * 获取当天的最大序号
 */
exports.getTodayMaxSequence = async (req, res) => {
  try {
    // 使用统一的编号生成工具（仅预览编号，不需要事务）
    const fullCode = await CodeGenerators.generatePlanCode(pool);

    // 提取序号部分（最后3位）
    const sequence = fullCode.slice(-3);

    // 返回完整编号和序号
    ResponseHandler.success(res, {
      sequence,
      fullCode,
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * 获取生产计划列表
 */
exports.getProductionPlans = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;
    const code = req.query.code || '';
    const contract_code = req.query.contract_code || '';
    const product = req.query.product || '';
    const keyword = req.query.keyword || ''; // 合并搜索关键词（计划编号/合同编码/产品）
    const startDate = req.query.startDate || '';
    const endDate = req.query.endDate || '';

    // 处理状态参数，确保它是一个非空数组或者为空数组
    let status = [];
    if (req.query.status) {
      if (Array.isArray(req.query.status)) {
        status = req.query.status.filter(Boolean);
      } else if (typeof req.query.status === 'string' && req.query.status.trim() !== '') {
        if (req.query.status.includes(',')) {
          status = req.query.status.split(',').filter(Boolean);
        } else {
          status = [req.query.status.trim()];
        }
      }
    }

    // 构建查询条件
    const conditions = [];
    const params = [];

    // 优先使用 keyword 参数（合并搜索）
    if (keyword) {
      conditions.push(
        '(pp.code LIKE ? OR pp.contract_code LIKE ? OR m.name LIKE ? OR m.code LIKE ? OR m.specs LIKE ?)'
      );
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    } else {
      // 兼容旧的分离搜索参数
      if (code) {
        conditions.push('pp.code LIKE ?');
        params.push(`%${code}%`);
      }

      if (contract_code) {
        conditions.push('pp.contract_code LIKE ?');
        params.push(`%${contract_code}%`);
      }

      if (product) {
        conditions.push('(m.name LIKE ? OR m.code LIKE ? OR m.specs LIKE ?)');
        params.push(`%${product}%`, `%${product}%`, `%${product}%`);
      }
    }

    if (startDate) {
      conditions.push('pp.start_date >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('pp.end_date <= ?');
      params.push(endDate);
    }

    if (status.length > 0) {
      conditions.push(`pp.status IN (${status.map(() => '?').join(',')})`);
      params.push(...status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countQuery = `SELECT COUNT(*) as total FROM production_plans pp
      LEFT JOIN materials m ON pp.product_id = m.id
      ${whereClause}`;
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    // 查询各状态的统计数据（基于搜索条件）
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pp.status = '${PRODUCTION_STATUS_KEYS.DRAFT}' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN pp.status = '${PRODUCTION_STATUS_KEYS.PREPARING}' THEN 1 ELSE 0 END) as preparing,
        SUM(CASE WHEN pp.status = '${PRODUCTION_STATUS_KEYS.MATERIAL_ISSUED}' THEN 1 ELSE 0 END) as materialIssued,
        SUM(CASE WHEN pp.status = '${PRODUCTION_STATUS_KEYS.IN_PROGRESS}' THEN 1 ELSE 0 END) as inProgress,
        SUM(CASE WHEN pp.status = '${PRODUCTION_STATUS_KEYS.INSPECTION}' THEN 1 ELSE 0 END) as inspection,
        SUM(CASE WHEN pp.status = '${PRODUCTION_STATUS_KEYS.WAREHOUSING}' THEN 1 ELSE 0 END) as warehousing,
        SUM(CASE WHEN pp.status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN pp.status = '${PRODUCTION_STATUS_KEYS.CANCELLED}' THEN 1 ELSE 0 END) as cancelled
      FROM production_plans pp
      LEFT JOIN materials m ON pp.product_id = m.id
      ${whereClause}
    `;
    const [statsResult] = await pool.query(statsQuery, params);
    const statistics = statsResult[0] || {
      total: 0,
      draft: 0,
      preparing: 0,
      materialIssued: 0,
      inProgress: 0,
      inspection: 0,
      warehousing: 0,
      completed: 0,
      cancelled: 0,
    };

    // 查询数据（添加库存状态检查）
    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const actualPageSize = parseInt(pageSize);
    const actualOffset = parseInt(offset);
    const query = `
      SELECT
        pp.id, pp.code, pp.name, pp.start_date, pp.end_date, pp.delivery_date,
        pp.quantity, pp.pushed_quantity, pp.status, pp.remark, pp.created_at, pp.updated_at,
        pp.product_id, pp.contract_code, pp.bom_id, pp.bom_version,
        m.name as productName,
        m.code as product_code,
        m.specs as specification,
        u.name as unit,
        ms.material_stock_status
      FROM production_plans pp
      LEFT JOIN materials m ON pp.product_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN (
        SELECT
          ppm.plan_id,
          CASE
            WHEN COUNT(ppm.id) = 0 THEN 'unknown'
            WHEN SUM(CASE WHEN ppm.required_quantity > COALESCE(inv.stock_qty, 0) THEN 1 ELSE 0 END) > 0 THEN 'shortage'
            ELSE 'sufficient'
          END as material_stock_status
        FROM production_plan_materials ppm
        LEFT JOIN (
          SELECT il.material_id, SUM(il.quantity) as stock_qty
          FROM inventory_ledger il
          JOIN materials mat ON il.material_id = mat.id
          WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
          GROUP BY il.material_id
        ) inv ON inv.material_id = ppm.material_id
        GROUP BY ppm.plan_id
      ) ms ON ms.plan_id = pp.id
      ${whereClause}
      ORDER BY pp.code DESC
      LIMIT ? OFFSET ?
    `;

    // ✅ 审计修复: LIMIT/OFFSET 参数化查询
    const paginatedParams = [...params, actualPageSize, actualOffset];
    const [plans] = await pool.query(query, paginatedParams);

    // 处理数据格式
    const formattedPlans = plans.map((plan) => ({
      ...plan,
      productName: plan.productName || '未知产品',
      productCode: plan.product_code || '',
      specification: plan.specification || '',
      unit: plan.unit || '',
    }));

    // 手动构建响应，额外包含统计数据（ResponseHandler.paginated 不支持扩展字段）
    res.status(200).json({
      success: true,
      message: '查询成功',
      data: {
        list: formattedPlans,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize),
        statistics,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('获取生产计划列表失败:', error);
    handleError(res, error);
  }
};

/**
 * 获取生产计划物料清单（包含智能分析）
 */
exports.getPlanMaterials = async (req, res) => {
  try {
    const { id } = req.params;

    // 验证生产计划存在并获取计划信息（不检查status，优先选择已审核的BOM）
    const [planCheck] = await pool.query(
      `
      SELECT pp.*, m.id as product_id,
        (SELECT bm2.id
         FROM bom_masters bm2
         WHERE bm2.product_id = m.id AND bm2.status != 2
         ORDER BY
           CASE WHEN bm2.approved_by IS NOT NULL THEN 0 ELSE 1 END,
           bm2.created_at DESC
         LIMIT 1) as bom_id
      FROM production_plans pp
      LEFT JOIN materials m ON pp.product_id = m.id
      WHERE pp.id = ?
    `,
      [id]
    );

    if (planCheck.length === 0) {
      return ResponseHandler.error(res, '生产计划不存在', 'NOT_FOUND', 404);
    }

    const plan = planCheck[0];

    if (!plan.bom_id) {
      // 如果没有BOM，返回存储的物料需求（实时查询库存）
      const [materials] = await pool.query(
        `
        SELECT
          ppm.id,
          ppm.material_id as materialId,
          m.code,
          m.name,
          m.specs as specification,
          m.unit_id,
          u.name as unit,
          ppm.level,
          ppm.required_quantity as requiredQuantity,
          COALESCE(
            (SELECT SUM(il.quantity) 
             FROM inventory_ledger il 
             WHERE il.material_id = m.id 
               AND (m.location_id IS NULL OR il.location_id = m.location_id)
            ),
            0
          ) as stockQuantity
        FROM production_plan_materials ppm
        JOIN materials m ON ppm.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE ppm.plan_id = ?
        ORDER BY ppm.level ASC, m.code
      `,
        [id]
      );

      return ResponseHandler.success(res, materials);
    }

    // 调用新的全链路MRP引擎实时核算剩余物料
    const materialRequirements = await calculateMaterialRequirementsWithStock(
      plan.product_id,
      plan.bom_id,
      plan.quantity,
      id
    );

    // 格式化返回数据
    const formattedMaterials = materialRequirements.map((material) => ({
      id: material.materialId,
      materialId: material.materialId,
      material_id: material.materialId,
      code: material.code,
      material_code: material.code,
      name: material.name,
      material_name: material.name,
      specification: material.specification,
      specs: material.specification,
      unit: material.unit,
      unit_name: material.unit,
      level: material.level,
      requiredQuantity: material.requiredQuantity,
      required_quantity: material.requiredQuantity,
      stockQuantity: material.stockQuantity,
      stock_quantity: material.stockQuantity,
      availableQuantity: material.availableQuantity,
      substitutionInfo: material.substitutionInfo,
    }));

    ResponseHandler.success(res, formattedMaterials);
  } catch (error) {
    logger.error('获取生产计划物料需求失败:', error);
    handleError(res, error);
  }
};

/**
 * 获取生产计划详情
 */
exports.getProductionPlanById = async (req, res) => {
  try {
    const { id } = req.params;

    // 查询计划基本信息，包含产品规格和合同编码
    const [plans] = await pool.query(
      `
      SELECT pp.*,
             m.name as productName,
             m.code as product_code,
             m.specs as specification,
             u.name as unit
      FROM production_plans pp
      LEFT JOIN materials m ON pp.product_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE pp.id = ?
    `,
      [id]
    );

    if (plans.length === 0) {
      return ResponseHandler.error(res, '生产计划不存在', 'NOT_FOUND', 404);
    }

    const plan = plans[0];

    // 查询计划的物料需求，包含规格信息
    const [materials] = await pool.query(
      `
      SELECT ppm.*,
             m.code,
             m.name,
             m.specs as specification,
             u.name as unit
      FROM production_plan_materials ppm
      LEFT JOIN materials m ON ppm.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE ppm.plan_id = ?
    `,
      [id]
    );

    ResponseHandler.success(res, {
      ...plan,
      materials,
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * 创建生产计划
 */
exports.createProductionPlan = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const {
      code: inputCode,
      name,
      start_date,
      end_date,
      delivery_date,
      productId,
      quantity,
      contract_code,
      bomId,
    } = req.body;
    let code = inputCode;

    // === 必填字段与业务规则校验 ===
    if (!productId) {
      await connection.rollback();
      return ResponseHandler.error(res, '产品ID为必填项', 'BAD_REQUEST', 400);
    }
    if (!quantity || Number(quantity) <= 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '生产数量必须大于0', 'BAD_REQUEST', 400);
    }
    if (!name || !name.trim()) {
      await connection.rollback();
      return ResponseHandler.error(res, '计划名称为必填项', 'BAD_REQUEST', 400);
    }
    // start_date 和 end_date 可选，排程后自动反写

    // 校验产品是否存在
    const [productCheck] = await connection.query(
      'SELECT id FROM materials WHERE id = ?',
      [productId]
    );
    if (productCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '指定的产品不存在', 'PRODUCT_NOT_FOUND', 400);
    }

    // 如果没有传code，使用统一的PP前缀生成
    if (!code) {
      code = await CodeGenerators.generatePlanCode(connection);
      logger.info(`自动生成生产计划编号: ${code}`);
    } else {
      // 如果传入了code，检查是否已存在
      const [existingPlan] = await connection.query(
        'SELECT id FROM production_plans WHERE code = ?',
        [code]
      );

      if (existingPlan.length > 0) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `生产计划编号 ${code} 已存在，请使用其他编号`,
          'DUPLICATE_CODE',
          400
        );
      }
    }

    const formattedStartDate = start_date ? new Date(start_date).toISOString().split('T')[0] : null;
    const formattedEndDate = end_date ? new Date(end_date).toISOString().split('T')[0] : null;
    const formattedDeliveryDate = delivery_date ? new Date(delivery_date).toISOString().split('T')[0] : null;

    // 插入生产计划
    const [result] = await connection.query(
      `
      INSERT INTO production_plans
      (code, name, start_date, end_date, delivery_date, product_id, quantity, contract_code, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `,
      [code, name, formattedStartDate, formattedEndDate, formattedDeliveryDate, productId, quantity, contract_code || null]
    );

    const planId = result.insertId;

    logger.info(`生产计划 ${code} 创建成功`);

    // 计算并插入物料需求，同时获取使用的 BOM 版本信息（优先使用前端传入的bomId）
    const bomInfo = await calculateAndInsertMaterials(connection, planId, productId, quantity, bomId);

    // 记录 BOM 版本快照到生产计划
    if (bomInfo && bomInfo.bomId) {
      await connection.query(
        'UPDATE production_plans SET bom_id = ?, bom_version = ? WHERE id = ?',
        [bomInfo.bomId, bomInfo.bomVersion, planId]
      );
    }

    // 记录创建日志
    const operator = await getCurrentUserName(req);
    await connection.query(
      `INSERT INTO production_plan_logs (plan_id, action, to_status, operator, remark)
       VALUES (?, 'create', 'draft', ?, ?)`,
      [planId, operator, `创建生产计划 ${code}`]
    );

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        id: planId,
        message: '生产计划创建成功',
      },
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建生产计划失败:', error);

    // 根据错误类型返回不同的错误信息
    if (error.code === 'ER_DUP_ENTRY') {
      // 提取重复的编号
      const match = error.message.match(/Duplicate entry '([^']+)'/);
      const duplicateCode = match ? match[1] : '';
      return ResponseHandler.error(
        res,
        `生产计划编号 ${duplicateCode} 已存在，请使用其他编号或留空自动生成`,
        'DUPLICATE_CODE',
        400
      );
    } else if (error.message.includes('未找到有效的BOM')) {
      return ResponseHandler.error(res, error.message, 'BOM_NOT_FOUND', 400);
    } else if (error.message.includes('BOM中没有物料明细')) {
      return ResponseHandler.error(res, error.message, 'BOM_EMPTY', 400);
    } else {
      handleError(res, error);
    }
  } finally {
    connection.release();
  }
};

/**
 * 更新生产计划
 */
exports.updateProductionPlan = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { name, start_date, end_date, delivery_date, productId, quantity, pushed_quantity, contract_code, bomId } = req.body;

    // 处理日期格式，确保是YYYY-MM-DD格式
    const formattedStartDate = start_date ? new Date(start_date).toISOString().split('T')[0] : null;
    const formattedEndDate = end_date ? new Date(end_date).toISOString().split('T')[0] : null;
    const formattedDeliveryDate = delivery_date ? new Date(delivery_date).toISOString().split('T')[0] : null;

    // 检查计划状态
    const [plans] = await connection.query('SELECT status, quantity FROM production_plans WHERE id = ?', [
      id,
    ]);

    if (plans.length === 0) {
      return ResponseHandler.error(res, '生产计划不存在', 'NOT_FOUND', 404);
    }

    // 如果只是更新pushed_quantity（下推数量追踪），允许任何状态
    if (pushed_quantity !== undefined && Object.keys(req.body).length === 1) {
      // 查询当前已下推数量和计划总数量
      const currentQuantity = Number(plans[0].quantity) || 0;
      const [currentPlan] = await connection.query(
        'SELECT pushed_quantity FROM production_plans WHERE id = ?',
        [id]
      );
      const currentPushed = Number(currentPlan[0]?.pushed_quantity) || 0;

      // pushed_quantity 为增量值时的目标值
      const targetPushed = Number(pushed_quantity);
      if (targetPushed < 0) {
        return ResponseHandler.error(res, '下推数量不能为负数', 'BAD_REQUEST', 400);
      }
      if (targetPushed > currentQuantity) {
        return ResponseHandler.error(
          res,
          `下推数量(${targetPushed})不能超过计划总数量(${currentQuantity})`,
          'EXCEEDED_QUANTITY',
          400
        );
      }

      await connection.query(
        'UPDATE production_plans SET pushed_quantity = ? WHERE id = ?',
        [targetPushed, id]
      );

      await connection.commit();
      return ResponseHandler.success(res, { pushed_quantity: targetPushed }, '已下推数量更新成功');
    }

    // 其他字段只能在草稿状态修改
    if (plans[0].status !== 'draft') {
      return ResponseHandler.error(res, '只能修改草稿状态的生产计划', 'BAD_REQUEST', 400);
    }

    // 更新生产计划，不更新编号
    await connection.query(
      `
      UPDATE production_plans 
      SET name = ?, start_date = ?, end_date = ?, delivery_date = ?, product_id = ?, quantity = ?, contract_code = ?
      WHERE id = ?
    `,
      [name, formattedStartDate, formattedEndDate, formattedDeliveryDate, productId, quantity, contract_code || null, id]
    );

    // 删除原有物料需求
    await connection.query('DELETE FROM production_plan_materials WHERE plan_id = ?', [id]);

    // 重新计算并插入物料需求，同时更新 BOM 版本快照（优先使用前端传入的bomId）
    const bomInfo = await calculateAndInsertMaterials(connection, id, productId, quantity, bomId);

    if (bomInfo && bomInfo.bomId) {
      await connection.query(
        'UPDATE production_plans SET bom_id = ?, bom_version = ? WHERE id = ?',
        [bomInfo.bomId, bomInfo.bomVersion, id]
      );
    }

    await connection.commit();

    ResponseHandler.success(res, null, '生产计划更新成功');
  } catch (error) {
    await connection.rollback();
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 删除生产计划
 */
exports.deleteProductionPlan = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查计划状态
    const [plans] = await connection.query('SELECT status FROM production_plans WHERE id = ?', [
      id,
    ]);

    if (plans.length === 0) {
      return ResponseHandler.error(res, '生产计划不存在', 'NOT_FOUND', 404);
    }

    if (plans[0].status !== 'draft') {
      return ResponseHandler.error(res, '只能删除草稿状态的生产计划', 'BAD_REQUEST', 400);
    }

    // 删除物料需求（子表硬删除）
    await connection.query('DELETE FROM production_plan_materials WHERE plan_id = ?', [id]);

    // ✅ 软删除生产计划主表
    await softDelete(connection, 'production_plans', 'id', id);

    await connection.commit();

    ResponseHandler.success(res, null, '生产计划删除成功');
  } catch (error) {
    await connection.rollback();
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新生产计划状态
 */
exports.updateProductionPlanStatus = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status } = req.body;

    // 验证状态值是否有效（使用统一状态流转规则的 key 集合）
    const validStatuses = Object.keys(PRODUCTION_PLAN_STATUS_FLOW);
    if (!validStatuses.includes(status)) {
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    // 检查生产计划是否存在（使用 FOR UPDATE 加行级锁防止并发）
    const [plans] = await connection.query(
      'SELECT id, status, version FROM production_plans WHERE id = ? FOR UPDATE',
      [id]
    );

    if (plans.length === 0) {
      return ResponseHandler.error(res, '生产计划不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = plans[0].status;
    const allowedTargets = PRODUCTION_PLAN_STATUS_FLOW[currentStatus] || [];

    if (!allowedTargets.includes(status)) {
      return ResponseHandler.error(
        res,
        `不允许从「${getProductionStatusText(currentStatus)}」变更为「${getProductionStatusText(status)}」`,
        'INVALID_STATE_TRANSITION',
        400
      );
    }
    // 手动推进时检查关联任务状态（给出警告但不阻止）
    if (status !== PLAN_STATUS.CANCELLED && status !== PLAN_STATUS.DRAFT) {
      const [taskStats] = await connection.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.INSPECTION}' THEN 1 ELSE 0 END) as inspection_count,
          SUM(CASE WHEN status IN ('${PRODUCTION_STATUS_KEYS.IN_PROGRESS}', 'inProgress') THEN 1 ELSE 0 END) as in_progress_count,
          SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.CANCELLED}' THEN 1 ELSE 0 END) as cancelled_count
        FROM production_tasks WHERE plan_id = ?`,
        [id]
      );

      const stats = taskStats[0];
      const activeTotal = stats.total - stats.cancelled_count;

      // ✅ 审计修复: 统一使用状态常量
      if (status === PRODUCTION_STATUS_KEYS.COMPLETED && activeTotal > 0 && stats.completed_count < activeTotal) {
        return ResponseHandler.error(
          res,
          `还有 ${activeTotal - stats.completed_count} 个任务未完成，无法将计划标记为已完成`,
          'TASK_NOT_READY',
          400
        );
      }
    }

    // 更新生产计划状态（乐观锁 + 版本号递增）
    const currentVersion = plans[0].version || 1;
    const [updateResult] = await connection.query(
      'UPDATE production_plans SET status = ?, version = version + 1 WHERE id = ? AND version = ?',
      [status, id, currentVersion]
    );

    if (updateResult.affectedRows === 0) {
      return ResponseHandler.error(
        res,
        '计划已被其他用户修改，请刷新后重试',
        'CONFLICT',
        409
      );
    }

    // 记录状态变更日志
    const operator = await getCurrentUserName(req);
    await connection.query(
      `INSERT INTO production_plan_logs (plan_id, action, from_status, to_status, operator, remark)
       VALUES (?, 'status_change', ?, ?, ?, ?)`,
      [id, currentStatus, status, operator, `状态变更: ${currentStatus} → ${status}`]
    );

    // 取消计划时，同步取消关联的未完成任务
    if (status === PLAN_STATUS.CANCELLED) {
      const [cancelResult] = await connection.query(
        `UPDATE production_tasks SET status = 'cancelled' 
         WHERE plan_id = ? AND status NOT IN ('completed', 'cancelled')`,
        [id]
      );
      if (cancelResult.affectedRows > 0) {
        logger.info(`计划 ${id} 取消，同步取消 ${cancelResult.affectedRows} 个关联任务`);
      }
    }

    // 如果状态更新为已发料，必须确保关联的出库单在仓库端已经全部完成
    if (status === PLAN_STATUS.MATERIAL_ISSUED) {
      const [outbounds] = await connection.query(
        'SELECT id, status, outbound_no FROM inventory_outbound WHERE reference_id = ? AND reference_type = "production_plan"',
        [id]
      );

      if (outbounds.length > 0) {
        // ✅ 审计修复: 统一使用状态常量
        const incompleteOutbounds = outbounds.filter((ob) => ob.status !== PRODUCTION_STATUS_KEYS.COMPLETED);

        if (incompleteOutbounds.length > 0) {
          await connection.rollback();
          const pns = incompleteOutbounds.map(ob => ob.outbound_no).join(', ');
          return ResponseHandler.error(
            res,
            `生产计划包含未完成的出库单 (${pns})，请先在库存模块完成出库操作后再重试变更状态！`,
            'INCOMPLETE_OUTBOUND',
            400
          );
        }
        // 如果全部完成，则允许状态推进，不做任何事情（剥离了原先危险的裸更新代码）
      }
    }

    await connection.commit();

    ResponseHandler.success(res, { status }, '生产计划状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新生产计划状态失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 仪表盘：获取生产计划列表（简化版）
 */
exports.getDashboardProductionPlans = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const safeLimit = parseInt(limit, 10) || 10;

    const query = `
      SELECT
        pp.id,
        pp.code,
        pp.name,
        pp.status,
        pp.start_date,
        pp.end_date,
        pp.quantity,
        pp.product_id,
        m.name as productName,
        m.code as productCode,
        m.specs as specification,
        u.name as unit
      FROM production_plans pp
      LEFT JOIN materials m ON pp.product_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE pp.status IN ('in_progress', 'preparing')
      ORDER BY pp.code DESC
      LIMIT ${safeLimit}
    `;

    const [plans] = await pool.query(query);
    ResponseHandler.success(res, plans);
  } catch (error) {
    logger.error('获取仪表盘生产计划失败:', error);
    handleError(res, error);
  }
};
