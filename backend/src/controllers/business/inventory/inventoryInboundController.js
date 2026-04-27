/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const InventoryService = require('../../../services/InventoryService');
const businessConfig = require('../../../config/businessConfig');
const { CodeGenerators } = require('../../../utils/codeGenerator');

// 统一库存查询子查询（基于 inventory_ledger 单表架构聚合计算当前库存）
const STOCK_SUBQUERY = `(SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity, MAX(created_at) as updated_at FROM inventory_ledger GROUP BY material_id, location_id)`;

// 引入重构后的入库处理服务
const InboundTransactionService = require('../../../services/business/InboundTransactionService');

const STATUS = {
  OUTBOUND: businessConfig.status.outbound,
  INBOUND: businessConfig.status.inbound,
  PRODUCTION_TASK: businessConfig.status.productionTask,
  PRODUCTION_PLAN: businessConfig.status.productionPlan,
  APPROVAL: businessConfig.status.approval,
  TRANSFER: businessConfig.status.transfer,
};

/** 入库单状态文本映射 */
const INBOUND_STATUS_TEXT = {
  draft: '草稿',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
};
const getStatusText = (status) => INBOUND_STATUS_TEXT[status] || status || '未知';

/**
 * 获取物料的批次号（FIFO原则）
 * @param {object} connection - 数据库连接
 * @param {number} materialId - 物料ID
 * @param {number} locationId - 库位ID（可选）
 * @param {string} defaultBatchNo - 默认批次号（如果查询失败）
 * @returns {Promise<string>} 批次号
 */

const getInboundList = async (req, res) => {
  const startTime = Date.now();
  const connection = await db.pool.getConnection();
  try {
    const {
      page = 1,
      pageSize = 10,
      inboundNo,
      startDate,
      endDate,
      locationId,
      inboundType,
    } = req.query;

    // 开始查询入库单列表

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (inboundNo) {
      whereClause += ' AND i.inbound_no LIKE ?';
      params.push(`%${inboundNo}%`);
    }

    if (startDate) {
      whereClause += ' AND i.inbound_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND i.inbound_date <= ?';
      params.push(endDate);
    }

    if (locationId) {
      whereClause += ' AND i.location_id = ?';
      params.push(parseInt(locationId));
    }

    if (inboundType) {
      whereClause += ' AND i.inbound_type = ?';
      params.push(inboundType);
    }

    // 计算分页
    const pageNum = Math.max(1, parseInt(page));
    const pageSizeNum = Math.max(1, parseInt(pageSize));
    const offset = (pageNum - 1) * pageSizeNum;

    // 获取总记录数
    const [totalResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM inventory_inbound i ${whereClause}`,
      params
    );

    // 获取分页数据 - 优化查询，添加物料信息
    const query = `
      SELECT
        i.id,
        i.inbound_no,
        DATE_FORMAT(i.inbound_date, '%Y-%m-%d') as inbound_date,
        i.inbound_type,
        i.reference_type,
        i.reference_id,
        i.reference_no,
        i.location_id,
        l.name as location_name,
        i.status,
        i.operator,
        CASE
          WHEN i.operator = 'system' THEN '系统'
          ELSE COALESCE(
            (SELECT u.real_name FROM users u WHERE u.username = i.operator LIMIT 1),
            (SELECT u.username FROM users u WHERE u.username = i.operator LIMIT 1),
            i.operator
          )
        END as operator_name,
        i.remark,
        DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') as created_at,
        DATE_FORMAT(i.updated_at, '%Y-%m-%d %H:%i:%s') as updated_at,
        COALESCE(stats.items_count, 0) as items_count,
        COALESCE(stats.total_quantity, 0) as total_quantity,
        first_item.material_code,
        first_item.material_name,
        first_item.material_specs,
        first_item.first_item_quantity
       FROM inventory_inbound i
       LEFT JOIN locations l ON i.location_id = l.id
       LEFT JOIN (
         SELECT
           inbound_id,
           COUNT(*) as items_count,
           COALESCE(SUM(quantity), 0) as total_quantity
         FROM inventory_inbound_items
         GROUP BY inbound_id
       ) stats ON i.id = stats.inbound_id
       LEFT JOIN (
         SELECT
           ii.inbound_id,
           m.code as material_code,
           m.name as material_name,
           m.specs as material_specs,
           ii.quantity as first_item_quantity,
           ROW_NUMBER() OVER (PARTITION BY ii.inbound_id ORDER BY ii.id ASC) as rn
         FROM inventory_inbound_items ii
         LEFT JOIN materials m ON ii.material_id = m.id
       ) first_item ON i.id = first_item.inbound_id AND first_item.rn = 1
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
    `;

    const [rows] = await connection.execute(query, params);

    // 处理状态显示
    const items = rows.map((item) => ({
      ...item,
      status_text: getStatusText(item.status),
    }));

    const endTime = Date.now();
    const _queryTime = endTime - startTime;

    ResponseHandler.paginated(
      res,
      items,
      totalResult[0].total,
      pageNum,
      pageSizeNum,
      '获取入库单列表成功'
    );
  } catch (error) {
    logger.error('获取入库单列表失败:', error);
    ResponseHandler.error(res, '获取入库单列表失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取入库单详情 - 优化版本

const getInboundDetail = async (req, res) => {
  const startTime = Date.now();
  const connection = await db.pool.getConnection();
  try {
    const { id } = req.params;

    // 查询入库单详情

    // 获取入库单主表信息
    const [inboundResult] = await connection.execute(
      `SELECT
        i.*,
        l.name as location_name,
        DATE_FORMAT(i.inbound_date, '%Y-%m-%d') as inbound_date,
        DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') as created_at,
        DATE_FORMAT(i.updated_at, '%Y-%m-%d %H:%i:%s') as updated_at
       FROM inventory_inbound i
       LEFT JOIN locations l ON i.location_id = l.id
       WHERE i.id = ?`,
      [id]
    );

    if (inboundResult.length === 0) {
      return ResponseHandler.error(res, '入库单不存在', 'NOT_FOUND', 404);
    }

    // 获取入库单明细
    const [itemsResult] = await connection.execute(
      `SELECT
        ii.*,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        u.name as unit_name,
        COALESCE(s.quantity, 0) as stock_quantity
       FROM inventory_inbound_items ii
       LEFT JOIN materials m ON ii.material_id = m.id
       LEFT JOIN units u ON ii.unit_id = u.id
       LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id AND s.location_id = ?
       WHERE ii.inbound_id = ?`,
      [inboundResult[0].location_id, id]
    );

    const inboundDetail = {
      ...inboundResult[0],
      items: itemsResult,
      status_text: getStatusText(inboundResult[0].status),
    };

    const endTime = Date.now();
    const _queryTime = endTime - startTime;

    ResponseHandler.success(res, inboundDetail, '获取入库单详情成功');
  } catch (error) {
    logger.error('获取入库单详情失败:', error);
    ResponseHandler.error(res, '获取入库单详情失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 创建入库单

const createInbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      inbound_date,
      location_id,
      status,
      operator,
      remark = null,
      items,
      // 新增字段：入库类型和关联单据
      inbound_type = 'other',
      reference_type = null,
      reference_id = null,
      reference_no = null,
    } = req.body;

    // 使用统一的字段名：location_id
    const warehouseId = location_id;

    // 验证必填字段
    if (!inbound_date || !warehouseId || !status || !operator || !items || items.length === 0) {
      throw new Error('缺少必填字段：入库日期、仓库、状态、操作员、物料项不能为空');
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(inbound_date);
    if (!inventoryCheck.allowed) {
      throw new Error(inventoryCheck.message);
    }
    // ===== 年度结存校验结束 =====

    // 生产退料必须关联生产任务或出库单
    if (inbound_type === 'production_return' && !reference_id && !reference_no) {
      throw new Error('生产退料必须关联生产任务或原出库单');
    }

    // ✅ 使用统一编码规则引擎生成入库单号
    const inbound_no = await CodeGenerators.generateInboundCode(connection);

    // 插入入库单主表（包含入库类型和关联信息）
    const [inboundResult] = await connection.execute(
      `INSERT INTO inventory_inbound
       (inbound_no, inbound_date, inbound_type, reference_type, reference_id, reference_no, location_id, status, operator, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        inbound_no,
        inbound_date,
        inbound_type,
        reference_type,
        reference_id,
        reference_no,
        warehouseId,
        status,
        operator,
        remark,
      ]
    );

    const inboundId = inboundResult.insertId;

    // 批量预取所有物料信息（消除循环内 N+1 查询）
    const inboundMaterialIds = items.map(i => i.material_id);
    const inboundMaterialInfoMap = await InventoryService.getBatchMaterialInfo(inboundMaterialIds, connection);

    // 插入入库单明细
    for (const item of items) {
      if (!item.material_id || !item.quantity || item.quantity <= 0) {
        throw new Error('物料信息不完整或数量无效');
      }

      // 从批量预取结果获取物料的默认单位和仓库
      const matInfo = inboundMaterialInfoMap.get(item.material_id);
      const unitId = item.unit_id || matInfo.unitId;
      // 核心破案：修复强制用物料默认库位覆盖手工选定隔离区库位的终极 Bug
      const itemLocationId = item.location_id || warehouseId || matInfo.locationId;

      await connection.execute(
        'INSERT INTO inventory_inbound_items (inbound_id, material_id, quantity, unit_id, location_id, batch_number, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          inboundId,
          item.material_id,
          item.quantity,
          unitId,
          itemLocationId,
          item.batch_number || null,
          item.remark || null,
        ]
      );

      // 更新库存
      if (status === STATUS.INBOUND.COMPLETED) {
        // 检查库存是否存在
        const [stockResult] = await connection.execute(
          'SELECT material_id, location_id, SUM(il.quantity) as quantity FROM inventory_ledger il JOIN materials mat ON il.material_id = mat.id WHERE il.material_id = ? AND il.location_id = ? AND (mat.location_id IS NULL OR il.location_id = mat.location_id) GROUP BY material_id, location_id HAVING SUM(quantity) > 0',
          [item.material_id, itemLocationId]
        );

        let beforeQuantity = 0;
        let afterQuantity = 0;

        if (stockResult.length === 0) {
          // 创建新的库存记录
          beforeQuantity = 0;
          afterQuantity = parseFloat(item.quantity);

          await connection.execute(
            'INSERT INTO inventory_ledger (material_id, location_id, quantity) VALUES (?, ?, ?)',
            [item.material_id, itemLocationId, afterQuantity]
          );
        } else {
          // 更新现有库存
          beforeQuantity = parseFloat(stockResult[0].quantity);
          afterQuantity = beforeQuantity + parseFloat(item.quantity);

          await connection.execute('UPDATE inventory_ledger SET quantity = ? WHERE id = ?', [
            afterQuantity,
            stockResult[0].id,
          ]);
        }

        // 从批量预取结果获取物料价格（消除循环内 N+1 查询）
        const unitPrice = matInfo.price || 0;
        const _itemAmount = parseFloat(item.quantity) * unitPrice;

        await _insertInventoryLedgerLocal(connection, {
          material_id: item.material_id,
          location_id: itemLocationId, // 修复 Bug: 把 inboundId 或表头 location_id 强转为 itemLocationId
          transaction_type: inbound_type === 'production_return' ? 'production_return' : (inbound_type.includes('_') ? inbound_type : `${inbound_type}_inbound`),
          quantity: parseFloat(item.quantity),
          unit_id: unitId,
          reference_no: inbound_no,
          reference_type: 'inbound',
          operator: operator,
          beforeQuantity: beforeQuantity,
          afterQuantity: afterQuantity,
        });
      }
    }

    await connection.commit();
    ResponseHandler.success(
      res,
      {
        message: '入库单创建成功',
        data: {
          id: inboundId,
          inboundNo: inbound_no,
        },
      },
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建入库单失败:', error);
    ResponseHandler.error(res, '创建入库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 从质检单创建入库单

const createInboundFromQuality = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { inbound_date, location_id, operator, remark, items, inspection_id, inspection_no } =
      req.body;

    // 验证必填字段
    if (!inbound_date || !location_id || !operator || !items || items.length === 0) {
      return ResponseHandler.error(res, '缺少必填字段', 'BAD_REQUEST', 400);
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(inbound_date);
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return res.status(400).json({ error: inventoryCheck.message });
    }
    // ===== 年度结存校验结束 =====

    // 检查质检单状态是否合格
    if (inspection_id) {
      const [inspectionResult] = await connection.execute(
        'SELECT id, status, inspection_no FROM quality_inspections WHERE id = ?',
        [inspection_id]
      );

      if (inspectionResult.length === 0) {
        await connection.rollback();
        return ResponseHandler.notFound(res, '质检单不存在');
      }

      if (inspectionResult[0].status !== 'passed') {
        await connection.rollback();
        return ResponseHandler.error(res, '只有质检合格的单据才能生成入库单', 'BAD_REQUEST', 400);
      }
    }

    // ✅ 使用统一编码规则引擎生成入库单号
    const inbound_no = await CodeGenerators.generateInboundCode(connection);

    // 创建入库单
    const [inboundResult] = await connection.execute(
      'INSERT INTO inventory_inbound (inbound_no, inbound_date, location_id, operator, status, remark, inspection_id, inspection_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [
        inbound_no,
        inbound_date,
        location_id,
        operator,
        'draft',
        remark || null,
        inspection_id || null,
        inspection_no || null,
      ]
    );

    const inbound_id = inboundResult.insertId;

    // 从质检单获取产品信息
    let productId = null;
    let productCode = null;
    let productName = null;

    if (inspection_id) {
      const [inspectionInfo] = await connection.execute(
        'SELECT inspection_type, product_id, product_name, product_code, quantity, qualified_quantity, unit FROM quality_inspections WHERE id = ?',
        [inspection_id]
      );

      if (inspectionInfo.length > 0) {
        const inspectionType = inspectionInfo[0].inspection_type;
        productId = inspectionInfo[0].product_id || null;
        productCode = inspectionInfo[0].product_code || '';
        productName = inspectionInfo[0].product_name || '';
        // ✅ 使用合格数量而不是检验数量
        const inspectionQuantity =
          inspectionInfo[0].qualified_quantity || inspectionInfo[0].quantity || 0;
        const _inspectionUnit = inspectionInfo[0].unit || '';

        // 如果是成品检验，直接使用product_id作为物料ID
        if (inspectionType === 'final' && productId) {
          // 检查物料表中是否存在该产品ID的记录，同时获取物料的location_id
          const [materialInfo] = await connection.execute(
            'SELECT id, location_id, unit_id FROM materials WHERE id = ?',
            [productId]
          );

          // 如果物料存在，使用items中传入的物料信息创建入库单明细
          if (materialInfo.length > 0) {
            // 成品入库应该使用物料表中定义的库位，而不是请求中的库位
            const materialLocationId = materialInfo[0].location_id;
            const materialUnitId = materialInfo[0].unit_id;

            // 如果物料有指定库位，使用物料的库位；否则使用请求中的库位
            const useLocationId = materialLocationId || location_id;

            // 更新入库单的库位，与物料保持一致
            if (materialLocationId && materialLocationId !== location_id) {
              await connection.execute(
                'UPDATE inventory_inbound SET location_id = ? WHERE id = ?',
                [materialLocationId, inbound_id]
              );
            }

            // 获取合适的单位ID
            let unitId = materialUnitId;

            // 验证传入的明细数量
            const totalItemsQuantity = items.reduce(
              (sum, item) => sum + parseFloat(item.quantity || 0),
              0
            );

            // 如果items中的数量与质检单数量相差太大，使用质检单的数量
            if (
              Math.abs(totalItemsQuantity - inspectionQuantity) > 0.01 ||
              totalItemsQuantity <= 0
            ) {
              // 根据请求项取第一个项目的单位ID
              unitId =
                items.length > 0 && items[0].unit_id ? items[0].unit_id : materialUnitId;

              // 创建一个入库明细，使用质检单的数量
              await connection.execute(
                'INSERT INTO inventory_inbound_items (inbound_id, material_id, unit_id, quantity, batch_number, remark, location_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [inbound_id, productId, unitId, inspectionQuantity, null, null, useLocationId]
              );
            } else {
              // 使用items中的信息创建入库明细
              for (const item of items) {
                const { unit_id, quantity, batch_no, remark: itemRemark } = item;

                // 确保必填字段都存在
                if (!unit_id || !quantity || quantity <= 0) {
                  await connection.rollback();
                  return ResponseHandler.error(res, '物料明细字段不完整或无效', 'BAD_REQUEST', 400);
                }

                await connection.execute(
                  'INSERT INTO inventory_inbound_items (inbound_id, material_id, unit_id, quantity, batch_number, remark, location_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  [
                    inbound_id,
                    productId,
                    unit_id,
                    quantity,
                    batch_no || null,
                    itemRemark || null,
                    useLocationId,
                  ]
                );
              }
            }

            await connection.commit();

            return ResponseHandler.success(
              res,
              {
                success: true,
                message: '入库单创建成功',
                data: {
                  id: inbound_id,
                  inbound_no,
                },
              },
              '创建成功',
              201
            );
          }
        }
      }
    }

    // 如果无法直接使用产品ID或者不是成品检验，按照原来的逻辑处理
    // 插入入库物料明细
    for (const item of items) {
      const { material_id, unit_id, quantity, batch_no, remark: itemRemark } = item;

      // 确保所有必填字段都存在
      if (!material_id || !unit_id || !quantity || quantity <= 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '物料明细字段不完整或无效', 'BAD_REQUEST', 400);
      }

      // 检查material_id是否存在于materials表中
      const [materialCheck] = await connection.execute('SELECT id FROM materials WHERE id = ?', [
        material_id,
      ]);

      // 每个物料项都有自己的物料ID，默认使用请求中的material_id
      let validMaterialId = material_id;
      let foundMaterial = false;

      // 如果物料ID不存在，尝试查找对应的产品物料关联
      if (materialCheck.length === 0) {
        // 尝试用质检单的product_code查找物料
        if (productCode) {
          // 先尝试使用产品代码查找物料code字段
          const [materialByCode] = await connection.execute(
            'SELECT id FROM materials WHERE code = ?',
            [productCode]
          );

          if (materialByCode.length > 0) {
            validMaterialId = materialByCode[0].id;

            foundMaterial = true;
          } else if (productCode || productName) {
            // 如果在code字段中找不到，尝试在specs字段中查找
            const [materialBySpecs] = await connection.execute(
              'SELECT id FROM materials WHERE specs = ? OR name = ?',
              [productCode, productName]
            );

            if (materialBySpecs.length > 0) {
              validMaterialId = materialBySpecs[0].id;

              foundMaterial = true;
            }
          }
        }

        // 只有在没有找到对应产品代码的物料时才执行这一部分
        if (!foundMaterial) {
          // 如果没有找到对应的产品代码或通过产品代码找不到物料，尝试通过名称或编码前缀查找
          const [defaultMaterial] = await connection.execute(
            'SELECT id FROM materials WHERE name LIKE ? OR code LIKE ? OR code LIKE ? LIMIT 1',
            ['%成品%', '%FP%', '%CP%']
          );

          if (defaultMaterial.length > 0) {
            validMaterialId = defaultMaterial[0].id;
          } else {
            // 如果找不到特定命名的物料，使用系统中的任意物料
            const [anyMaterial] = await connection.execute('SELECT id FROM materials LIMIT 1');

            if (anyMaterial.length > 0) {
              validMaterialId = anyMaterial[0].id;
            } else {
              await connection.rollback();
              return res.status(400).json({
                error: `物料ID ${material_id} 不存在，且无法找到替代物料`,
              });
            }
          }
        }
      }

      await connection.execute(
        'INSERT INTO inventory_inbound_items (inbound_id, material_id, unit_id, quantity, batch_number, remark, location_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          inbound_id,
          validMaterialId,
          unit_id,
          quantity,
          batch_no || null,
          itemRemark || null,
          item.location_id || location_id, // 优先使用前台明确传来的明细级存放仓位（例如退回死料区的仓位）
        ]
      );
    }

    await connection.commit();

    return ResponseHandler.success(
      res,
      {
        success: true,
        message: '入库单创建成功',
        data: {
          id: inbound_id,
          inbound_no,
        },
      },
      '创建成功',
      201
    );
  } catch (err) {
    await connection.rollback();
    logger.error('创建入库单错误:', err);
    return ResponseHandler.error(res, '服务器错误', 'SERVER_ERROR', 500);
  } finally {
    connection.release();
  }
};

// 更新入库单状态

const updateInboundStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { newStatus } = req.body;

    // 验证入库单ID是否为有效数字
    if (!id || isNaN(parseInt(id))) {
      logger.error('无效的入库单ID:', id);
      throw new Error('无效的入库单ID');
    }

    // 验证状态值
    const validStatuses = ['draft', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      logger.error('无效的状态值:', newStatus);
      throw new Error('无效的状态值');
    }

    // 获取当前入库单信息
    const [inboundData] = await connection.execute('SELECT * FROM inventory_inbound WHERE id = ?', [
      id,
    ]);

    if (inboundData.length === 0) {
      logger.error('入库单不存在, ID:', id);
      throw new Error(`入库单不存在 (ID: ${id})`);
    }

    const currentStatus = inboundData[0].status;

    // 检查状态转换是否有效
    const validTransitions = {
      draft: ['confirmed', 'cancelled'],
      confirmed: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus].includes(newStatus) && currentStatus !== newStatus) {
      logger.error('无效的状态转换:', { from: currentStatus, to: newStatus });
      throw new Error(`无法从 "${currentStatus}" 状态转换为 "${newStatus}" 状态`);
    }

    // 更新状态
    await connection.execute('UPDATE inventory_inbound SET status = ? WHERE id = ?', [
      newStatus,
      id,
    ]);

    // 如果状态变更为已完成，更新库存
    if (newStatus === STATUS.INBOUND.COMPLETED) {
      // 调用抽离好的服务完成核心入库逻辑以及所有副产物（如NCP生成、批次溯源等）
      await InboundTransactionService.confirmInbound(
        connection, 
        id, 
        inboundData[0].operator || 'system', 
        inboundData[0]
      );

    }

    await connection.commit();
    ResponseHandler.success(res, null, '入库单状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新入库单状态失败:', error);
    ResponseHandler.error(res, '更新入库单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取物料列表 - 从baseData获取


module.exports = {
  getInboundList,
  getInboundDetail,
  createInbound,
  createInboundFromQuality,
  updateInboundStatus,
};
