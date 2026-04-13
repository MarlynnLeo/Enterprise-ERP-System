/**
 * salesController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const businessConfig = require('../../../config/businessConfig');

// 状态常量
const STATUS = {
  SALES_ORDER: {
    DRAFT: 'draft',
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    READY_TO_SHIP: 'ready_to_ship',
    IN_PRODUCTION: 'in_production',
    IN_PROCUREMENT: 'in_procurement',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
  OUTBOUND: businessConfig.status.outbound,
  SALES_RETURN: {
    DRAFT: 'draft',
    PENDING: 'pending',
    APPROVED: 'approved',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  },
  EXCHANGE: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
};

// 移除了废弃的 ensureSalesExchangeTablesExist, createSalesExchangeTablesDirectly, 和 updateSalesExchangeTableStructure
// 使用统一的编号生成服务 - 替代原 generateTransactionNo 函数
async function generateTransactionNo(connection) {
  return await CodeGenerators.generateTransactionCode(connection);
}

// Import the connection pool from db
// 注意: 改名为 connectionPool 避免与函数内局部变量 connection 产生遮蔽
const connectionPool = db.pool;

// 统一的连接管理函数
const getConnection = async () => {
  return await connectionPool.getConnection();
};

// 带事务的连接管理函数
const getConnectionWithTransaction = async () => {
  const conn = await connectionPool.getConnection();
  await conn.beginTransaction();
  return conn;
};

// 统一的销售订单编号生成函数 - 替代所有重复的生成函数
const generateSalesOrderNo = async (connection) => {
  return CodeGenerators.generateSalesOrderCode(connection);
};

// 保持向后兼容的别名函数
const generateOrderNo = generateSalesOrderNo;

// 添加新的控制器方法

exports.getPackingLists = async (req, res) => {
  try {

    const {
      page = 1,
      pageSize = 20,
      search = '',
      status = '',
      startDate = '',
      endDate = '',
      customerId = '',
    } = req.query;

    // 确保分页参数是有效的数字
    const currentPage = Math.max(1, parseInt(page) || 1);
    const currentPageSize = Math.max(1, Math.min(10000, parseInt(pageSize) || 20));
    const offset = (currentPage - 1) * currentPageSize;

    const whereConditions = [];
    const queryParams = [];

    // 搜索条件
    if (search) {
      whereConditions.push(
        '(pl.packing_list_no LIKE ? OR pl.customer_name LIKE ? OR pl.sales_order_no LIKE ?)'
      );
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // 状态筛选
    if (status) {
      whereConditions.push('pl.status = ?');
      queryParams.push(status);
    }

    // 客户筛选
    if (customerId) {
      whereConditions.push('pl.customer_id = ?');
      queryParams.push(parseInt(customerId));
    }

    // 日期范围筛选
    if (startDate) {
      whereConditions.push('pl.packing_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereConditions.push('pl.packing_date <= ?');
      queryParams.push(endDate);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')} ` : '';

    // 使用字符串拼接避免参数绑定问题
    const sql = `
      SELECT
      pl.*,
        COALESCE(pl.customer_name, '') as customer_name,
        COALESCE(pl.sales_order_no, '') as sales_order_no
      FROM packing_lists pl
      ${whereClause}
      ORDER BY pl.created_at DESC
      LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
      `;

    logger.info('查询参数:', queryParams);

    const [rows] =
      queryParams.length > 0 ? await db.pool.execute(sql, queryParams) : await db.pool.execute(sql);

    // 获取总数
    const countSql = `
      SELECT COUNT(*) as total
      FROM packing_lists pl
      LEFT JOIN customers c ON pl.customer_id = c.id
      LEFT JOIN sales_orders so ON pl.sales_order_id = so.id
      ${whereClause}
      `;

    const [countResult] =
      queryParams.length > 0
        ? await db.pool.execute(countSql, queryParams)
        : await db.pool.execute(countSql);

    // 获取统计数据
    const [statsResult] = await db.pool.execute(`
      SELECT
      COUNT(*) as total_lists,
        COALESCE(SUM(total_boxes), 0) as total_boxes,
        COALESCE(SUM(total_quantity), 0) as total_quantity,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
        SUM(CASE WHEN status = 'packing' THEN 1 ELSE 0 END) as packing_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
      FROM packing_lists pl
        `);

    res.json({
      data: rows,
      total: countResult[0].total,
      page: currentPage,
      pageSize: currentPageSize,
      statistics: statsResult[0],
    });
  } catch (error) {
    logger.error('获取装箱单列表失败:', error);
    ResponseHandler.error(res, '获取装箱单列表失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取装箱单详情
 */

exports.getPackingList = async (req, res) => {
  try {

    const { id } = req.params;

    // 获取装箱单基本信息
    const [packingListRows] = await db.pool.execute(
      `
      SELECT
      pl.*,
        c.name as customer_name,
        so.order_no as sales_order_no
      FROM packing_lists pl
      LEFT JOIN customers c ON pl.customer_id = c.id
      LEFT JOIN sales_orders so ON pl.sales_order_id = so.id
      WHERE pl.id = ?
        `,
      [id]
    );

    if (packingListRows.length === 0) {
      return ResponseHandler.error(res, '装箱单不存在', 'NOT_FOUND', 404);
    }

    const packingList = packingListRows[0];

    // 获取装箱单明细
    const [detailRows] = await db.pool.execute(
      `
      SELECT
      pld.*,
        u.name as unit_name
      FROM packing_list_details pld
      LEFT JOIN units u ON pld.unit_id = u.id
      WHERE pld.packing_list_id = ?
        ORDER BY pld.id
          `,
      [id]
    );

    packingList.details = detailRows;

    res.json(packingList);
  } catch (error) {
    logger.error('获取装箱单详情失败:', error);
    ResponseHandler.error(res, '获取装箱单详情失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 创建装箱单
 */

exports.createPackingList = async (req, res) => {
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();

    const { customer_id, sales_order_id, packing_date, remark, details = [] } = req.body;

    // 验证必填字段
    if (!customer_id) {
      return ResponseHandler.error(res, '客户ID不能为空', 'BAD_REQUEST', 400);
    }
    if (!packing_date) {
      return ResponseHandler.error(res, '装箱日期不能为空', 'BAD_REQUEST', 400);
    }

    // 获取客户信息
    const [customerRows] = await connection.execute('SELECT id, name FROM customers WHERE id = ?', [
      customer_id,
    ]);
    if (customerRows.length === 0) {
      return ResponseHandler.error(res, '客户不存在', 'BAD_REQUEST', 400);
    }
    const customer = customerRows[0];

    // 获取销售订单信息（如果有）
    let salesOrder = null;
    if (sales_order_id) {
      const [orderRows] = await connection.execute(
        'SELECT id, order_no FROM sales_orders WHERE id = ?',
        [sales_order_id]
      );
      if (orderRows.length > 0) {
        salesOrder = orderRows[0];
      }
    }

    // 生成装箱单号
    const packing_list_no = await generatePackingListNo(connection);

    // 计算总数量和总箱数
    const total_quantity = details.reduce(
      (sum, detail) => sum + (parseFloat(detail.quantity) || 0),
      0
    );
    const total_boxes = details.length; // 每个明细项算一箱

    // 插入装箱单主表
    const [result] = await connection.execute(
      `
      INSERT INTO packing_lists(
            packing_list_no, customer_id, customer_name, sales_order_id, sales_order_no,
            packing_date, total_boxes, total_quantity, remark, created_by, status
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
            `,
      [
        packing_list_no,
        customer_id,
        customer.name,
        sales_order_id || null,
        salesOrder ? salesOrder.order_no : null,
        packing_date,
        total_boxes,
        total_quantity,
        remark || '',
        req.user?.username || 'system',
      ]
    );

    const packingListId = result.insertId;

    // 插入装箱单明细
    if (details && details.length > 0) {
      for (let i = 0; i < details.length; i++) {
        const detail = details[i];

        // 获取产品信息
        let product = null;
        if (detail.product_id) {
          const [productRows] = await connection.execute(
            'SELECT id, code, name, specs, unit_id FROM materials WHERE id = ?',
            [detail.product_id]
          );
          if (productRows.length > 0) {
            product = productRows[0];
          }
        }

        // 获取单位信息
        let unit = null;
        const unitId = detail.unit_id || (product ? product.unit_id : null);
        if (unitId) {
          const [unitRows] = await connection.execute('SELECT id, name FROM units WHERE id = ?', [
            unitId,
          ]);
          if (unitRows.length > 0) {
            unit = unitRows[0];
          }
        }

        await connection.execute(
          `
          INSERT INTO packing_list_details(
              packing_list_id, product_id, product_code, product_name,
              product_specs, quantity, unit_id, unit_name, item_no,
              box_no, weight, volume, remark
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            packingListId,
            detail.product_id || null,
            detail.product_code || (product ? product.code : ''),
            detail.product_name || (product ? product.name : ''),
            detail.product_specs || (product ? product.specs : ''),
            detail.quantity || 0,
            unitId,
            detail.unit_name || (unit ? unit.name : ''),
            detail.item_no || '',
            detail.box_no || `BOX${String(i + 1).padStart(3, '0')} `,
            detail.weight || null,
            detail.volume || null,
            detail.remark || '',
          ]
        );
      }
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        id: packingListId,
        packing_list_no,
        message: '装箱单创建成功',
      },
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建装箱单失败:', error);
    ResponseHandler.error(res, '创建装箱单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新装箱单
 */

exports.updatePackingList = async (req, res) => {
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { customer_id, sales_order_id, packing_date, status, remark, details = [] } = req.body;

    // 计算总箱数
    const total_boxes = details.reduce((sum, detail) => sum + (parseInt(detail.quantity) || 0), 0);

    // 更新装箱单主表
    await connection.execute(
      `
      UPDATE packing_lists SET
      customer_id = ?,
        sales_order_id = ?,
        packing_date = ?,
        status = ?,
        total_boxes = ?,
        remark = ?,
        updated_by = ?
          WHERE id = ?
            `,
      [
        customer_id,
        sales_order_id || null,
        packing_date,
        status || 'draft',
        total_boxes,
        remark || '',
        req.user?.username || 'system',
        id,
      ]
    );

    // 删除原有明细
    await connection.execute('DELETE FROM packing_list_details WHERE packing_list_id = ?', [id]);

    // 插入新明细
    if (details && details.length > 0) {
      for (const detail of details) {
        await connection.execute(
          `
          INSERT INTO packing_list_details(
              packing_list_id, product_id, product_code, product_name,
              product_specs, quantity, unit_id, item_no, remark
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            id,
            detail.product_id,
            detail.product_code || '',
            detail.product_name || '',
            detail.product_specs || '',
            detail.quantity || 0,
            detail.unit_id || null,
            detail.item_no || '',
            detail.remark || '',
          ]
        );
      }
    }

    await connection.commit();

    res.json({
      id: parseInt(id),
      message: '装箱单更新成功',
    });
  } catch (error) {
    await connection.rollback();
    logger.error('更新装箱单失败:', error);
    ResponseHandler.error(res, '更新装箱单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 删除装箱单
 */

exports.deletePackingList = async (req, res) => {
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查装箱单是否存在
    const [packingListRows] = await connection.execute(
      'SELECT id, status FROM packing_lists WHERE id = ?',
      [id]
    );

    if (packingListRows.length === 0) {
      return ResponseHandler.error(res, '装箱单不存在', 'NOT_FOUND', 404);
    }

    const packingList = packingListRows[0];

    // 检查是否可以删除（只有草稿状态可以删除）
    if (packingList.status !== 'draft') {
      return ResponseHandler.error(res, '只有草稿状态的装箱单可以删除', 'BAD_REQUEST', 400);
    }

    // 删除装箱单明细（由于外键约束，会自动删除）
    await connection.execute('DELETE FROM packing_list_details WHERE packing_list_id = ?', [id]);

    // 删除装箱单主表
    await connection.execute('DELETE FROM packing_lists WHERE id = ?', [id]);

    await connection.commit();

    res.json({
      message: '装箱单删除成功',
    });
  } catch (error) {
    await connection.rollback();
    logger.error('删除装箱单失败:', error);
    ResponseHandler.error(res, '删除装箱单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新装箱单状态
 */

exports.updatePackingListStatus = async (req, res) => {
  try {

    const { id } = req.params;
    const { status, remark } = req.body;

    // 验证状态值
    const validStatuses = ['draft', 'confirmed', 'packing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    // 检查装箱单是否存在
    const [packingListRows] = await db.pool.execute(
      'SELECT id, status, packing_list_no FROM packing_lists WHERE id = ?',
      [id]
    );

    if (packingListRows.length === 0) {
      return ResponseHandler.error(res, '装箱单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = packingListRows[0].status;

    // 状态转换验证
    const statusTransitions = {
      draft: ['confirmed', 'cancelled'],
      confirmed: ['packing', 'cancelled'],
      packing: ['completed', 'cancelled'],
      completed: [], // 已完成不能转换到其他状态
      cancelled: ['draft'], // 已取消可以重新开始
    };

    if (!statusTransitions[currentStatus].includes(status)) {
      return res.status(400).json({
        message: `不能从状态 "${currentStatus}" 转换到 "${status}"`,
      });
    }

    // 更新状态
    await db.pool.execute(
      `
      UPDATE packing_lists SET
      status = ?,
        remark = COALESCE(?, remark),
        updated_by = ?
          WHERE id = ?
            `,
      [status, remark, req.user?.username || 'system', id]
    );

    res.json({
      id: parseInt(id),
      status,
      message: '状态更新成功',
    });
  } catch (error) {
    logger.error('更新装箱单状态失败:', error);
    ResponseHandler.error(res, '更新装箱单状态失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 导出销售订单
 */

exports.getPackingListStatistics = async (req, res) => {
  try {
    await ensurePackingListTablesExist();

    const { startDate, endDate } = req.query;

    let dateCondition = '';
    let queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'WHERE packing_date BETWEEN ? AND ?';
      queryParams = [startDate, endDate];
    } else if (startDate) {
      dateCondition = 'WHERE packing_date >= ?';
      queryParams = [startDate];
    } else if (endDate) {
      dateCondition = 'WHERE packing_date <= ?';
      queryParams = [endDate];
    }

    // 获取基础统计
    const [basicStats] = await db.pool.execute(
      `
  SELECT
  COUNT(*) as total_lists,
    SUM(total_boxes) as total_boxes,
    SUM(total_quantity) as total_quantity,
    SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
    SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
    SUM(CASE WHEN status = 'packing' THEN 1 ELSE 0 END) as packing_count,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
      FROM packing_lists
      ${dateCondition}
  `,
      queryParams
    );

    // 获取每日统计
    const [dailyStats] = await db.pool.execute(
      `
  SELECT
  DATE(packing_date) as date,
    COUNT(*) as count,
    SUM(total_boxes) as boxes,
    SUM(total_quantity) as quantity
      FROM packing_lists
      ${dateCondition}
      GROUP BY DATE(packing_date)
      ORDER BY date DESC
      LIMIT 30
    `,
      queryParams
    );

    // 获取客户统计
    const [customerStats] = await db.pool.execute(
      `
  SELECT
  customer_name,
    COUNT(*) as count,
    SUM(total_boxes) as boxes,
    SUM(total_quantity) as quantity
      FROM packing_lists
      ${dateCondition}
      GROUP BY customer_id, customer_name
      ORDER BY count DESC
      LIMIT 10
    `,
      queryParams
    );

    res.json({
      basic: basicStats[0],
      daily: dailyStats,
      customers: customerStats,
    });
  } catch (error) {
    logger.error('获取装箱单统计失败:', error);
    ResponseHandler.error(res, '获取装箱单统计失败', 'SERVER_ERROR', 500, error);
  }
};

// 计算并插入生产计划的物料需求
async function calculateAndInsertMaterialsForPlan(connection, planId, productId, quantity) {
  try {
    // 获取产品最新的已审核BOM
    const [bomMasters] = await connection.query(
      `
      SELECT id
      FROM bom_masters
      WHERE product_id = ? AND approved_by IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [productId]
    );

    if (bomMasters.length === 0) {
      const [products] = await connection.query(
        `
        SELECT code, name FROM materials WHERE id = ?
    `,
        [productId]
      );

      const productInfo =
        products.length > 0 ? `${products[0].code} - ${products[0].name} ` : `ID: ${productId} `;
      throw new Error(`产品 ${productInfo} 未找到有效的BOM配置`);
    }

    const bomId = bomMasters[0].id;

    // 获取BOM明细（只获取一级物料）
    const [bomDetails] = await connection.query(
      `
  SELECT
  bd.material_id,
    bd.quantity,
    m.code,
    m.name,
    COALESCE(s.quantity, 0) as stock_quantity
      FROM bom_details bd
      LEFT JOIN materials m ON bd.material_id = m.id
      LEFT JOIN(
      SELECT il.material_id, SUM(il.quantity) as quantity
        FROM inventory_ledger il
        JOIN materials mat ON il.material_id = mat.id
        WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
        GROUP BY il.material_id
    ) s ON m.id = s.material_id
      WHERE bd.bom_id = ? AND(bd.level = 1 OR bd.level IS NULL)
      ORDER BY bd.id ASC
    `,
      [bomId]
    );

    if (bomDetails.length === 0) {
      throw new Error(`BOM ID ${bomId} 中没有物料明细`);
    }

    // 插入物料需求记录
    for (const detail of bomDetails) {
      const requiredQuantity = Number(detail.quantity) * Number(quantity);
      const stockQuantity = Number(detail.stock_quantity) || 0;

      await connection.query(
        `
        INSERT INTO production_plan_materials
    (plan_id, material_id, required_quantity, stock_quantity)
  VALUES(?, ?, ?, ?)
      `,
        [planId, detail.material_id, requiredQuantity, stockQuantity]
      );
    }

    logger.info(`    📦 已为生产计划 ${planId} 计算并保存 ${bomDetails.length} 个物料需求`);
  } catch (error) {
    logger.error('计算生产计划物料需求失败:', error);
    throw error;
  }
}

// 生成生产计划和采购申请的统一函数
async function generateProductionAndPurchasePlans(
  connection,
  salesOrderId,
  insufficientItems,
  userInfo
) {
  try {
    // 首先查询销售订单号和合同编码
    let salesOrderNo = salesOrderId; // 默认使用ID
    let contractCode = ''; // 合同编码
    try {
      const [orderRows] = await connection.execute(
        'SELECT order_no, contract_code FROM sales_orders WHERE id = ?',
        [salesOrderId]
      );
      if (orderRows && orderRows.length > 0) {
        salesOrderNo = orderRows[0].order_no;
        contractCode = orderRows[0].contract_code || '';
      }
    } catch (queryError) {
      logger.error('查询销售订单信息失败:', queryError);
      // 继续使用ID作为备用
    }

    // 分离自产和外购物料
    const internalMaterials = insufficientItems.filter((item) => item.source_type === 'internal');
    const externalMaterials = insufficientItems.filter((item) => item.source_type === 'external');

    // 处理自产物料 - 逐个生成生产计划
    if (internalMaterials.length > 0) {
      try {
        logger.info(`📝 开始为 ${internalMaterials.length} 个自产物料生成生产计划`);

        // 逐个创建生产计划
        for (let i = 0; i < internalMaterials.length; i++) {
          const item = internalMaterials[i];
          const { material_id, material_name, material_code, shortage } = item;

          // 使用统一的编号生成器逐个生成编号（保证唯一性和并发安全）
          const planNo = await CodeGenerators.generatePlanCode(connection);

          try {
            // 计算预计开始和结束日期
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(startDate.getDate() + 7); // 假设生产周期为7天

            const insertQuery = `
              INSERT INTO production_plans
    (code, name, product_id, quantity, start_date, end_date, status, remark, contract_code)
  VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            // 构建备注内容
            const remarkText = contractCode
              ? `由销售订单${salesOrderNo}（合同编码：${contractCode}）自动生成`
              : `由销售订单${salesOrderNo} 自动生成`;

            const [insertResult] = await connection.execute(insertQuery, [
              planNo,
              `${material_name || material_code} 生产计划`,
              material_id,
              shortage,
              startDate.toISOString().split('T')[0],
              endDate.toISOString().split('T')[0],
              'draft',
              remarkText,
              contractCode || null,
            ]);

            const planId = insertResult.insertId;

            // 计算并插入物料需求
            try {
              await calculateAndInsertMaterialsForPlan(connection, planId, material_id, shortage);
              logger.info(
                `  ✅ 生产计划创建成功: ${planNo} (物料: ${material_name}, 数量: ${shortage}，已计算物料需求)`
              );
            } catch (bomError) {
              logger.warn(
                `  ⚠️  生产计划创建成功: ${planNo}，但计算物料需求失败: ${bomError.message} `
              );
              // 不影响计划创建，但记录警告
            }
          } catch (planError) {
            logger.error(`  ❌ 生产计划创建失败(物料: ${material_name}): `, planError.message);
          }
        }

        logger.info(`✅ 共创建 ${internalMaterials.length} 个生产计划`);
      } catch (batchError) {
        logger.error('❌ 批量生成生产计划编号失败:', batchError.message);
      }
    }

    // 处理外购物料 - 合并到一个采购申请中
    if (externalMaterials.length > 0) {
      try {
        const reqNo = await generatePurchaseRequisitionNo(connection);

        // 计算预计需求日期
        const requiredDate = new Date();
        requiredDate.setDate(requiredDate.getDate() + 3); // 假设3天后需要

        // 创建采购申请主记录（添加合同编码字段）
        const insertReqQuery = `
          INSERT INTO purchase_requisitions
    (requisition_number, request_date, requester, contract_code, real_name, remarks, status, created_at)
  VALUES(?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        logger.info('📝 创建采购申请，包含', externalMaterials.length, '个外购物料');

        // 构建备注内容（简化版，因为合同编码已独立）
        const requisitionRemark = `由销售订单${salesOrderNo} 自动生成`;

        // 使用当前用户信息，并从数据库查询真实姓名
        const requester = userInfo.username || 'system';
        let realName = userInfo.real_name || '系统';

        // 如果userInfo中没有real_name，尝试从数据库查询
        if (!userInfo.real_name && userInfo.username && userInfo.username !== 'system') {
          try {
            const [userRows] = await connection.execute(
              'SELECT real_name FROM users WHERE username = ?',
              [userInfo.username]
            );
            if (userRows.length > 0 && userRows[0].real_name) {
              realName = userRows[0].real_name;
              logger.info(`✅ 从数据库查询到用户真实姓名: ${realName} `);
            }
          } catch (err) {
            logger.error('查询用户真实姓名失败:', err);
          }
        }

        logger.info(
          `📝 采购申请人信息 - 用户名: ${requester}, 姓名: ${realName}, 合同编码: ${contractCode || '无'} `
        );

        const [reqResult] = await connection.execute(insertReqQuery, [
          reqNo,
          requiredDate.toISOString().split('T')[0],
          requester,
          contractCode || null, // 合同编码单独保存
          realName,
          requisitionRemark,
          'draft',
        ]);

        const requisitionId = reqResult.insertId;

        // 批量创建采购申请明细
        for (const item of externalMaterials) {
          const { material_id, material_name, material_code, shortage } = item;

          const insertItemQuery = `
            INSERT INTO purchase_requisition_items
    (requisition_id, material_id, material_code, material_name, quantity, created_at)
  VALUES(?, ?, ?, ?, ?, NOW())
          `;

          await connection.execute(insertItemQuery, [
            requisitionId,
            material_id,
            material_code || '',
            material_name || '',
            shortage,
          ]);

          logger.info(`  ✅ 添加物料: ${material_name} (数量: ${shortage})`);
        }

        logger.info(`✅ 采购申请创建成功: ${reqNo} (包含${externalMaterials.length}个物料)`);
      } catch (reqError) {
        logger.error('❌ 采购申请创建失败:', reqError.message);
      }
    }

    logger.info(`✅ 销售订单 ${salesOrderId} 的生产计划和采购申请生成完成`);
  } catch (error) {
    logger.error('生成生产计划和采购申请失败:', error);
    throw error;
  }
}

/**
 * 获取订单的未完全发货物料明细
 * @description 用于创建出库单时，只显示未发货或部分发货的物料
 */

