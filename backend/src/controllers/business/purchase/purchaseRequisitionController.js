/**
 * purchaseRequisitionController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const { softDelete } = require('../../../utils/softDelete');
const purchaseModel = require('../../../models/purchase');

// 获取采购申请列表
const getRequisitions = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      requisitionNo,
      contractCode,
      keyword,
      requester,
      startDate,
      endDate,
      status,
    } = req.query;
    const offset = (page - 1) * pageSize;

    let query = `
      SELECT r.*, u.real_name as user_real_name, COUNT(*) OVER() as total_count
      FROM purchase_requisitions r
      LEFT JOIN users u ON r.requester = u.username
      WHERE 1=1
    `;

    const queryParams = [];

    // 支持keyword参数同时搜索申请单号和合同编码
    if (keyword) {
      query += ' AND (r.requisition_number LIKE ? OR r.contract_code LIKE ?)';
      queryParams.push(`%${keyword}%`, `%${keyword}%`);
    } else {
      // 兼容旧的独立参数
      if (requisitionNo) {
        query += ' AND r.requisition_number LIKE ?';
        queryParams.push(`%${requisitionNo}%`);
      }

      if (contractCode) {
        query += ' AND r.contract_code LIKE ?';
        queryParams.push(`%${contractCode}%`);
      }
    }

    if (requester) {
      query += ' AND r.requester = ?';
      queryParams.push(requester);
    }

    if (startDate) {
      query += ' AND r.request_date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND r.request_date <= ?';
      queryParams.push(endDate);
    }

    if (status) {
      // 处理status[]形式的参数
      const statusArray = Array.isArray(status)
        ? status
        : typeof req.query['status[]'] !== 'undefined'
          ? Array.isArray(req.query['status[]'])
            ? req.query['status[]']
            : [req.query['status[]']]
          : status
            ? [status]
            : null;

      // 过滤掉值为'undefined'的状态
      const validStatusArray = statusArray ? statusArray.filter((s) => s !== 'undefined') : [];

      if (validStatusArray && validStatusArray.length > 0) {
        const placeholders = validStatusArray.map(() => '?').join(', ');
        query += ` AND r.status IN (${placeholders})`;
        validStatusArray.forEach((s) => queryParams.push(s));
      }
    }

    // 直接在查询字符串中嵌入LIMIT和OFFSET值
    const limitValue = Number(pageSize);
    const offsetValue = Number(offset);
    query += ` ORDER BY r.created_at DESC LIMIT ${limitValue} OFFSET ${offsetValue}`;

    const [rows] = await db.pool.execute(query, queryParams);

    // 获取申请单的物料详情
    const items = [];
    if (rows.length > 0) {
      const requisitionIds = rows.map((row) => row.id);

      // MySQL不支持ANY操作符，使用IN代替
      const placeholders = requisitionIds.map(() => '?').join(',');
      const itemsQuery = `
        SELECT * FROM purchase_requisition_items
        WHERE requisition_id IN (${placeholders})
        ORDER BY id
      `;

      const [itemsRows] = await db.pool.execute(itemsQuery, requisitionIds);
      items.push(...itemsRows);

      // 获取已订购数量统计（包括所有未取消的订单）
      const orderedQuery = `
        SELECT po.requisition_id, poi.material_code, SUM(poi.quantity) as ordered_qty
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.order_id = po.id
        WHERE po.requisition_id IN (${placeholders})
        AND po.requisition_id IS NOT NULL
        GROUP BY po.requisition_id, poi.material_code
      `;
      const [orderedRows] = await db.pool.execute(orderedQuery, requisitionIds);

      // 将已订购信息附加到items上
      items.forEach((item) => {
        const orderedInfo = orderedRows.find(
          (r) => r.requisition_id === item.requisition_id && r.material_code === item.material_code
        );
        item.ordered_quantity = orderedInfo ? parseFloat(orderedInfo.ordered_qty) : 0;
      });
    }

    // 整合申请单及其物料，并确保real_name有值
    const requisitions = rows.map((row) => {
      const requisitionItems = items.filter((item) => item.requisition_id === row.id);

      // 优先使用数据库中的real_name，如果为空则使用关联users表的real_name
      if ((!row.real_name || row.real_name === '') && row.user_real_name) {
        row.real_name = row.user_real_name;
      }

      // 移除查询辅助字段
      delete row.user_real_name;

      // 计算物料数量和总金额
      const materials_count = requisitionItems.length;
      const total_amount = requisitionItems.reduce((sum, item) => {
        return sum + parseFloat(item.estimated_price || 0) * parseFloat(item.quantity || 0);
      }, 0);

      const processedReq = {
        ...row,
        materials: requisitionItems,
        materials_count,
        total_amount: total_amount.toFixed(2),
        // 判断是否全部生成订单（所有物料都有采购订单，不管数量）
        is_fully_ordered:
          requisitionItems.length > 0 &&
          requisitionItems.every((item) => item.ordered_quantity > 0),
        // 判断是否部分生成订单（部分物料有订单，部分没有）
        is_partially_ordered: false, // 初始值，下面计算
      };

      // 计算部分订购状态：至少有一个物料有订单，且至少有一个物料没订单
      if (requisitionItems.length > 0 && !processedReq.is_fully_ordered) {
        const hasAnyOrdered = requisitionItems.some((item) => item.ordered_quantity > 0);
        processedReq.is_partially_ordered = hasAnyOrdered;
      }

      return processedReq;
    });

    const totalCount = rows.length > 0 ? parseInt(rows[0].total_count) : 0;

    const responseData = {
      items: requisitions,
      total: totalCount,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(totalCount / pageSize),
    };

    res.json(responseData);
  } catch (error) {
    logger.error('获取采购申请列表失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 获取采购申请详情
const getRequisition = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取申请单基本信息
    const query = 'SELECT * FROM purchase_requisitions WHERE id = ?';
    const [rows] = await db.pool.execute(query, [id]);

    if (rows.length === 0) {
      return ResponseHandler.notFound(res, '采购申请不存在');
    }

    const requisition = rows[0];

    // 获取申请单物料，同时获取物料表中的specs字段和供应商信息
    const itemsQuery = `
      SELECT 
        ri.*,
        m.specs as material_specs,
        m.supplier_id,
        s.name as supplier_name,
        u.name as unit_name
      FROM 
        purchase_requisition_items ri
        LEFT JOIN materials m ON ri.material_id = m.id
        LEFT JOIN suppliers s ON m.supplier_id = s.id
        LEFT JOIN units u ON m.unit_id = u.id
      WHERE 
        ri.requisition_id = ? 
      ORDER BY 
        ri.id
    `;
    const [itemsRows] = await db.pool.execute(itemsQuery, [id]);

    // 处理物料数据，优先使用物料表中的specs字段，并添加供应商信息
    requisition.materials = itemsRows.map((item) => ({
      ...item,
      specification: item.material_specs || item.specification || '',
      supplier_id: item.supplier_id || null,
      supplier_name: item.supplier_name || '暂无设置供应商',
      unit: item.unit || item.unit_name || '',
    }));

    res.json(requisition);
  } catch (error) {
    logger.error('获取采购申请详情失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 创建采购申请
const createRequisition = async (req, res) => {
  let connection;

  try {
    // 记录请求体

    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const {
      request_date,
      requestDate,
      contractCode,
      contract_code,
      remarks,
      materials,
      requester,
      real_name,
    } = req.body;

    // 使用请求中提供的requester或者从认证信息中获取
    const finalRequester = requester || req.user?.username || 'system';

    // 获取真实姓名：优先使用前端提供的，其次使用当前认证用户的，最后尝试从数据库中查询
    let finalRealName = real_name || req.user?.real_name || '';

    // 如果没有提供真实姓名但有用户名，尝试从数据库中获取
    if (!finalRealName && finalRequester) {
      const [userRows] = await connection.execute(
        'SELECT real_name FROM users WHERE username = ?',
        [finalRequester]
      );
      if (userRows.length > 0) {
        finalRealName = userRows[0].real_name || '';
      }
    }

    // 使用request_date或requestDate
    const finalRequestDate = request_date || requestDate || new Date().toISOString().split('T')[0];

    // 合同编码（支持两种命名格式）
    const finalContractCode = contractCode || contract_code || null;

    // 采购相关表由 migrations/20260312000007 管理，无需运行时建表


    // 生成申请单号
    const requisitionNo = await purchaseModel.generateRequisitionNo(connection);

    // 检查并修复备注中的销售订单ID
    let finalRemarks = remarks !== undefined ? remarks : '';
    if (finalRemarks && finalRemarks.includes('由销售订单') && finalRemarks.includes('自动生成')) {
      logger.debug('检测到自动生成的采购申请备注:', remarks);

      // 提取销售订单ID
      const match = remarks.match(/由销售订单\s*(\d+)\s*自动生成/);
      if (match) {
        const salesOrderId = match[1];
        logger.debug('提取到销售订单ID:', salesOrderId);

        try {
          // 查询对应的销售订单号
          const [orderRows] = await connection.execute(
            'SELECT order_no FROM sales_orders WHERE id = ?',
            [salesOrderId]
          );
          if (orderRows && orderRows.length > 0) {
            const salesOrderNo = orderRows[0].order_no;
            logger.info('✅ 查询到销售订单号:', salesOrderNo);

            // 替换备注中的ID为订单号
            finalRemarks = remarks.replace(
              /由销售订单\s*\d+\s*自动生成/,
              `由销售订单 ${salesOrderNo} 自动生成`
            );
            logger.info('🔧 修复后的备注:', finalRemarks);
          }
        } catch (queryError) {
          logger.error('❌ 查询销售订单号失败:', queryError);
        }
      }
    }

    // 创建采购申请（添加合同编码字段）
    const createQuery = `
      INSERT INTO purchase_requisitions
      (requisition_number, request_date, requester, contract_code, real_name, remarks, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    const [result] = await connection.execute(createQuery, [
      requisitionNo,
      finalRequestDate,
      finalRequester,
      finalContractCode,
      finalRealName,
      finalRemarks,
    ]);

    const requisitionId = result.insertId;

    // 创建采购申请物料项目
    if (materials && materials.length > 0) {
      // 记录原始物料数据

      // 处理物料数据并补充缺失信息
      const processedMaterials = [];

      for (const material of materials) {
        // 打印每个物料对象的类型和内容

        // 检查可能的字段名变体
        const materialId =
          material.materialId !== undefined
            ? material.materialId
            : material.material_id !== undefined
              ? material.material_id
              : null;

        let materialCode = material.materialCode || material.material_code || '';
        let materialName = material.materialName || material.material_name || '';
        let specification = material.specification || material.specs || '';
        let unit = material.unit || '';
        let unitId =
          material.unitId !== undefined
            ? material.unitId
            : material.unit_id !== undefined
              ? material.unit_id
              : null;
        const quantity = material.quantity !== undefined ? material.quantity : 0;

        // 如果提供了materialId，但没有其他信息，从数据库获取
        if (materialId && (!materialCode || !materialName)) {
          const [rows] = await connection.query(
            'SELECT code, name, specs, unit_id FROM materials WHERE id = ?',
            [materialId]
          );

          if (rows.length > 0) {
            const materialData = rows[0];
            materialCode = materialCode || materialData.code;
            materialName = materialName || materialData.name;
            specification = specification || materialData.specs || '';
            unitId = unitId !== undefined ? unitId : materialData.unit_id;
          }
        }

        // 如果unit为空但有unitId，从units表查询单位名称
        if (!unit && unitId) {
          const [unitRows] = await connection.query('SELECT name FROM units WHERE id = ? AND deleted_at IS NULL', [
            unitId,
          ]);
          if (unitRows.length > 0) {
            unit = unitRows[0].name;
          }
        }

        processedMaterials.push({
          materialId,
          materialCode,
          materialName,
          specification,
          unit,
          unitId,
          quantity,
        });
      }

      const insertItemsQuery = `
        INSERT INTO purchase_requisition_items 
        (requisition_id, material_id, material_code, material_name, specification, unit, unit_id, quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const material of processedMaterials) {
        // 确保所有参数都有值，避免undefined
        const params = [
          requisitionId,
          material.materialId === undefined ? null : material.materialId,
          material.materialCode || '',
          material.materialName || '',
          material.specification || '',
          material.unit || '',
          material.unitId === undefined ? null : material.unitId,
          material.quantity || 0,
        ];

        // 检查参数，确保没有undefined值
        if (params.some((param) => param === undefined)) {
          logger.error('检测到undefined参数值:', params);
          throw new Error('物料项目参数包含undefined值');
        }

        await connection.execute(insertItemsQuery, params);
      }
    }

    await connection.commit();

    // 获取完整的申请单信息
    const createdRequisition = await getRequisitionById(requisitionId);

    ResponseHandler.success(res, createdRequisition, '创建成功', 201);
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('创建采购申请失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  } finally {
    if (connection) connection.release();
  }
};

// 更新采购申请
const updateRequisition = async (req, res) => {
  let connection;

  try {
    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const { id } = req.params;
    const { requestDate, contractCode, contract_code, remarks, materials, requester, real_name } =
      req.body;

    // 使用请求中提供的requester和real_name，或者从认证信息中获取
    const finalRequester = requester || req.user?.username;

    // 获取真实姓名：优先使用前端提供的，其次使用当前认证用户的，最后尝试从数据库中查询
    let finalRealName = real_name || req.user?.real_name || '';

    // 如果没有提供真实姓名但有用户名，尝试从数据库中获取
    if (!finalRealName && finalRequester) {
      const [userRows] = await connection.execute(
        'SELECT real_name FROM users WHERE username = ?',
        [finalRequester]
      );
      if (userRows.length > 0) {
        finalRealName = userRows[0].real_name || '';
      }
    }

    // 合同编码（支持两种命名格式）
    const finalContractCode = contractCode || contract_code || null;

    // 检查申请单是否存在及其状态
    const checkQuery = 'SELECT status FROM purchase_requisitions WHERE id = ?';
    const [checkRows] = await connection.execute(checkQuery, [id]);

    if (checkRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '采购申请不存在');
    }

    const currentStatus = checkRows[0].status;
    if (currentStatus !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能编辑草稿状态的采购申请', 'BAD_REQUEST', 400);
    }

    // 更新采购申请基本信息（添加合同编码字段）
    const updateQuery = `
      UPDATE purchase_requisitions
      SET request_date = ?, contract_code = ?, remarks = ?, real_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await connection.execute(updateQuery, [
      requestDate,
      finalContractCode,
      remarks !== undefined ? remarks : '',
      finalRealName,
      id,
    ]);

    // 删除原有物料项目
    await connection.execute('DELETE FROM purchase_requisition_items WHERE requisition_id = ?', [
      id,
    ]);

    // 添加新的物料项目
    if (materials && materials.length > 0) {
      // 记录原始物料数据

      // 验证和处理物料数据
      const validatedMaterials = materials.map((material) => {
        // 检查可能的字段名变体
        const materialId =
          material.materialId !== undefined
            ? material.materialId
            : material.material_id !== undefined
              ? material.material_id
              : null;

        const materialCode = material.materialCode || material.material_code || '';
        const materialName = material.materialName || material.material_name || '';
        const specification = material.specification || material.specs || '';
        const unit = material.unit || '';
        const unitId =
          material.unitId !== undefined
            ? material.unitId
            : material.unit_id !== undefined
              ? material.unit_id
              : null;
        const quantity = material.quantity !== undefined ? material.quantity : 0;

        return {
          materialId,
          materialCode,
          materialName,
          specification,
          unit,
          unitId,
          quantity,
        };
      });

      const insertItemsQuery = `
        INSERT INTO purchase_requisition_items 
        (requisition_id, material_id, material_code, material_name, specification, unit, unit_id, quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const material of validatedMaterials) {
        // 确保所有参数都有值，避免undefined
        const params = [
          id,
          material.materialId === undefined ? null : material.materialId,
          material.materialCode || '',
          material.materialName || '',
          material.specification || '',
          material.unit || '',
          material.unitId === undefined ? null : material.unitId,
          material.quantity || 0,
        ];

        // 检查参数，确保没有undefined值
        if (params.some((param) => param === undefined)) {
          logger.error('检测到undefined参数值:', params);
          throw new Error('物料项目参数包含undefined值');
        }

        await connection.execute(insertItemsQuery, params);
      }
    }

    await connection.commit();

    // 获取更新后的申请单信息
    const updatedRequisition = await getRequisitionById(id);

    res.json(updatedRequisition);
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('更新采购申请失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  } finally {
    if (connection) connection.release();
  }
};

// 删除采购申请
const deleteRequisition = async (req, res) => {
  let connection;

  try {
    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查申请单是否存在及其状态
    const checkQuery = 'SELECT status FROM purchase_requisitions WHERE id = ?';
    const [checkRows] = await connection.execute(checkQuery, [id]);

    if (checkRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '采购申请不存在');
    }

    const currentStatus = checkRows[0].status;
    if (currentStatus !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能删除草稿状态的采购申请', 'BAD_REQUEST', 400);
    }

    // 删除申请单 (物料项目会通过外键CASCADE自动删除)
    // ✅ 软删除替代硬删除
    await softDelete(connection, 'purchase_requisitions', 'id', id);

    await connection.commit();

    res.json({ message: '采购申请删除成功' });
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('删除采购申请失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  } finally {
    if (connection) connection.release();
  }
};

// 更新采购申请状态
const updateRequisitionStatus = async (req, res) => {
  let connection;

  try {
    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const { id } = req.params;
    const { newStatus } = req.body;

    // 检查状态值是否有效
    const validStatuses = ['draft', 'submitted', 'approved', 'rejected', 'completed'];
    if (!validStatuses.includes(newStatus)) {
      await connection.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    // 检查申请单是否存在
    const checkQuery = 'SELECT status FROM purchase_requisitions WHERE id = ?';
    const [checkRows] = await connection.execute(checkQuery, [id]);

    if (checkRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '采购申请不存在');
    }

    const currentStatus = checkRows[0].status;

    // 检查状态变更是否有效
    if (currentStatus === newStatus) {
      await connection.rollback();
      return ResponseHandler.error(res, '当前已经是该状态', 'BAD_REQUEST', 400);
    }

    // ✅ 审批结果状态只能由工作流回调变更，前端不可直接设置
    if (['approved', 'rejected'].includes(newStatus)) {
      await connection.rollback();
      return ResponseHandler.error(res, '审批通过/拒绝只能通过工作流完成，请先提交审批(submitted)', 'BAD_REQUEST', 400);
    }

    // 状态流转规则（前端可操作的转换）
    const allowedTransitions = {
      draft:     ['submitted'],      // 草稿 → 提交审批
      submitted: [],                  // 已提交 → 等待工作流处理，前端不可操作
      approved:  [],                  // 已批准 → 由工作流管理，前端不可操作
      rejected:  ['draft'],           // 已拒绝 → 退回草稿重新编辑
      completed: [],                  // 已完成 → 终态
    };
    const allowed = allowedTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      await connection.rollback();
      return ResponseHandler.error(res, `不允许从 [${currentStatus}] 转换到 [${newStatus}]`, 'BAD_REQUEST', 400);
    }

    // 提交审批时发起工作流
    let finalStatus = newStatus;
    if (newStatus === 'submitted') {
      const WorkflowService = require('../../../services/business/WorkflowService');
      const userId = req.user?.userId || req.user?.id;
      const [reqInfo] = await connection.execute(
        'SELECT requisition_number FROM purchase_requisitions WHERE id = ?', [id]
      );
      const reqNo = reqInfo[0]?.requisition_number || id;
      const wfResult = await WorkflowService.tryStartWorkflow(
        'purchase_requisition', id, reqNo,
        `采购申请 ${reqNo} 审批`, userId
      );
      if (wfResult.auto_approved) {
        finalStatus = 'approved';
      }
    }

    // 更新状态
    const updateQuery = `
      UPDATE purchase_requisitions
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await connection.execute(updateQuery, [finalStatus, id]);


    // 如果状态变更为已批准，自动生成采购订单
    let generatedOrders = [];
    if (finalStatus === 'approved') {
      try {
        const { generateOrdersFromRequisition } = require('../../../services/business/RequisitionAutoOrderService');
        generatedOrders = await generateOrdersFromRequisition(id, connection);
      } catch (autoGenerateError) {
        logger.error('自动生成采购订单失败:', autoGenerateError);
        throw autoGenerateError;
      }
    }

    await connection.commit();

    // 获取更新后的完整记录
    const [updatedRows] = await db.pool.execute(
      'SELECT * FROM purchase_requisitions WHERE id = ?',
      [id]
    );

    // 如果生成了采购订单，在响应中包含生成的订单信息
    const response = {
      ...updatedRows[0],
      generated_orders: generatedOrders,
    };

    res.json(response);
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('更新采购申请状态失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  } finally {
    if (connection) connection.release();
  }
};

// 通过ID获取采购申请（内部使用）
const getRequisitionById = async (id) => {
  try {
    // 获取申请单基本信息
    const query = 'SELECT * FROM purchase_requisitions WHERE id = ?';
    const [rows] = await db.pool.execute(query, [id]);

    if (rows.length === 0) {
      return null;
    }

    const requisition = rows[0];

    // 获取申请单物料，同时获取物料表中的specs字段和供应商信息
    const itemsQuery = `
      SELECT 
        ri.*,
        m.specs as material_specs,
        m.supplier_id,
        s.name as supplier_name
      FROM 
        purchase_requisition_items ri
        LEFT JOIN materials m ON ri.material_id = m.id
        LEFT JOIN suppliers s ON m.supplier_id = s.id
      WHERE 
        ri.requisition_id = ? 
      ORDER BY 
        ri.id
    `;
    const [itemsRows] = await db.pool.execute(itemsQuery, [id]);

    // 处理物料数据，优先使用物料表中的specs字段，并添加供应商信息
    requisition.materials = itemsRows.map((item) => ({
      ...item,
      specification: item.material_specs || item.specification || '',
      supplier_id: item.supplier_id || null,
      supplier_name: item.supplier_name || '暂无设置供应商',
    }));

    return requisition;
  } catch (error) {
    logger.error('获取采购申请详情失败:', error);
    throw error;
  }
};

// 自动生成采购订单的函数


// 获取物料的最近采购信息
const _getRecentPurchaseInfo = async (connection, materialId) => {
  try {
    // 首先尝试获取有价格的最近采购记录
    const [rows] = await connection.execute(
      `
      SELECT
        po.supplier_id,
        s.name as supplier_name,
        s.contact_person,
        s.contact_phone,
        poi.price as unit_price,
        po.order_date
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.order_id = po.id
      JOIN suppliers s ON po.supplier_id = s.id
      WHERE poi.material_id = ?
      AND poi.price > 0
      AND po.status IN ('confirmed', 'completed', 'pending')
      ORDER BY po.order_date DESC
      LIMIT 1
    `,
      [materialId]
    );

    if (rows.length > 0) {
      return {
        supplier_id: rows[0].supplier_id,
        supplier: {
          id: rows[0].supplier_id,
          name: rows[0].supplier_name,
          contact_person: rows[0].contact_person,
          contact_phone: rows[0].contact_phone,
        },
        unit_price: rows[0].unit_price,
        order_date: rows[0].order_date,
      };
    }

    return null;
  } catch (error) {
    logger.error('获取最近采购信息失败:', error);
    return null;
  }
};

// 为特定供应商创建采购订单
const _createPurchaseOrderForSupplier = async (connection, requisition, group, supplierId) => {
  try {
    // 生成订单号（传入连接确保事务一致性）
    const orderNo = await purchaseModel.generateOrderNo(connection);

    // 计算总金额
    const totalAmount = group.items.reduce((sum, item) => sum + item.total, 0);

    // 计算交货日期（下单时间后推一周）
    const orderDate = new Date().toISOString().split('T')[0];
    const expectedDeliveryDate = new Date();
    expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 7);
    const deliveryDateStr = expectedDeliveryDate.toISOString().split('T')[0];

    // 创建采购订单（添加合同编码字段）
    const [orderResult] = await connection.execute(
      `
      INSERT INTO purchase_orders (
        order_no, order_date, supplier_id, supplier_name, contract_code,
        expected_delivery_date, contact_person, contact_phone,
        total_amount, remarks, status, requisition_id, requisition_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        orderNo,
        orderDate,
        supplierId,
        group.supplier.name,
        requisition.contract_code || null, // 从采购申请传递合同编码
        deliveryDateStr,
        group.supplier.contact_person,
        group.supplier.contact_phone,
        totalAmount,
        `由采购申请 ${requisition.requisition_number} 自动生成`,
        'pending',
        requisition.id,
        requisition.requisition_number,
      ]
    );

    const orderId = orderResult.insertId;

    // 创建订单物料项目
    for (const item of group.items) {
      await connection.execute(
        `
        INSERT INTO purchase_order_items (
          order_id, material_id, material_code, material_name,
          specification, unit, unit_id, price, quantity, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          orderId,
          item.material_id,
          item.material_code,
          item.material_name,
          item.specification,
          item.unit_name,
          item.unit_id,
          item.price,
          item.quantity,
          item.total,
        ]
      );
    }
  } catch (error) {
    logger.error('创建采购订单失败:', error);
    throw error;
  }
};

// 获取采购申请物料项目
const getRequisitionItems = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT ri.*, m.specs as material_specs
      FROM purchase_requisition_items ri
      LEFT JOIN materials m ON ri.material_id = m.id
      WHERE ri.requisition_id = ?
      ORDER BY ri.id
    `;

    const [rows] = await db.pool.execute(query, [id]);

    const items = rows.map((item) => ({
      ...item,
      specification: item.material_specs || item.specification || '',
    }));

    res.json(items);
  } catch (error) {
    logger.error('获取采购申请物料项目失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 创建采购申请物料项目
const createRequisitionItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { material_id, material_code, material_name, specification, unit, unit_id, quantity } =
      req.body;

    const query = `
      INSERT INTO purchase_requisition_items
      (requisition_id, material_id, material_code, material_name, specification, unit, unit_id, quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.pool.execute(query, [
      id,
      material_id,
      material_code,
      material_name,
      specification,
      unit,
      unit_id,
      quantity,
    ]);

    ResponseHandler.success(
      res,
      { id: result.insertId, message: '物料项目创建成功' },
      '创建成功',
      201
    );
  } catch (error) {
    logger.error('创建采购申请物料项目失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 更新采购申请物料项目
const updateRequisitionItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { material_id, material_code, material_name, specification, unit, unit_id, quantity } =
      req.body;

    const query = `
      UPDATE purchase_requisition_items
      SET material_id = ?, material_code = ?, material_name = ?, specification = ?, unit = ?, unit_id = ?, quantity = ?
      WHERE id = ?
    `;

    await db.pool.execute(query, [
      material_id,
      material_code,
      material_name,
      specification,
      unit,
      unit_id,
      quantity,
      itemId,
    ]);

    res.json({ message: '物料项目更新成功' });
  } catch (error) {
    logger.error('更新采购申请物料项目失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 删除采购申请物料项目
const deleteRequisitionItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    const query = 'DELETE FROM purchase_requisition_items WHERE id = ?';
    await db.pool.execute(query, [itemId]);

    res.json({ message: '物料项目删除成功' });
  } catch (error) {
    logger.error('删除采购申请物料项目失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

module.exports = {
  getRequisitions,
  getRequisition,
  createRequisition,
  updateRequisition,
  deleteRequisition,
  updateRequisitionStatus,
  getRequisitionItems,
  createRequisitionItem,
  updateRequisitionItem,
  deleteRequisitionItem,
};
