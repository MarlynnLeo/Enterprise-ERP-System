/**
 * qualityInspection.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');
const db = require('../config/db');
const { apiStatusToDbStatus } = require('../utils/statusMapper');
const { appendPaginationSQL } = require('../utils/safePagination');
const businessConfig = require('../config/businessConfig');
const CodeGeneratorService = require('../services/business/CodeGeneratorService');

// 从统一配置获取状态常量
const STATUS = {
  PRODUCTION_TASK: businessConfig.status.productionTask,
};

/**
 * 质量检验模型类
 */
class QualityInspection {
  /**
   * 获取所有检验单列表
   * @param {string} type 检验类型: incoming, process, final
   * @param {object} filters 筛选条件
   * @param {number} page 页码
   * @param {number} pageSize 每页条数
   * @returns {Promise<{rows: Array, total: number}>} 检验单列表和总数
   */
  static async getInspections(type, filters = {}, page = 1, pageSize = 20) {
    const limit = parseInt(pageSize, 10) || 20;
    const offset = (parseInt(page, 10) - 1) * limit || 0;

    // 根据传入的额外参数决定是否加载供应商和参考数据
    const includeSupplier = filters.include_supplier === true;


    // 构建基础查询
    let query = `
      SELECT
        qi.*,
        CASE
          WHEN qi.inspection_type = 'incoming' THEN m.name
          WHEN qi.inspection_type = 'final' AND task_m.name IS NOT NULL THEN task_m.name
          WHEN qi.product_name IS NOT NULL AND qi.product_name != '' THEN qi.product_name
          ELSE proc_m.name
        END AS item_name,
        CASE
          WHEN qi.inspection_type = 'incoming' THEN m.code
          WHEN qi.inspection_type = 'final' AND task_m.code IS NOT NULL THEN task_m.code
          WHEN qi.product_code IS NOT NULL AND qi.product_code != '' THEN qi.product_code
          ELSE proc_m.code
        END AS item_code,
        CASE
          WHEN qi.inspection_type = 'incoming' THEN m.specs
          WHEN qi.inspection_type = 'final' AND task_m.specs IS NOT NULL THEN task_m.specs
          ELSE proc_m.specs
        END AS item_specs,
        COALESCE((SELECT COUNT(*) FROM process_inspection_punch_records WHERE inspection_id = qi.id), 0) AS punch_count,
        pt.status AS task_status

    `;

    // 根据选项添加额外字段
    if (includeSupplier) {
      query += `,
        s.id as supplier_id,
        s.name as supplier_name,
        s.contact_person as supplier_contact
      `;
    }

    query += `
      FROM quality_inspections qi
      LEFT JOIN materials m ON qi.inspection_type = 'incoming' AND qi.material_id = m.id
      LEFT JOIN materials proc_m ON qi.inspection_type IN('process', 'final') AND qi.product_id = proc_m.id
      LEFT JOIN production_tasks pt ON qi.inspection_type IN('process', 'final') AND qi.reference_id = pt.id
      LEFT JOIN materials task_m ON pt.product_id = task_m.id
      `;

    // 根据选项添加供应商连接
    if (includeSupplier) {
      query += `
        LEFT JOIN purchase_orders po ON qi.inspection_type = 'incoming' AND qi.reference_no = po.order_no
        LEFT JOIN suppliers s ON po.supplier_id = s.id
      `;
    }

    query += 'WHERE qi.deleted_at IS NULL AND qi.inspection_type = ?';

    const sqlParams = [type];

    // 添加筛选条件
    if (filters.keyword) {
      const keyword = `%${filters.keyword}%`;
      query += ' AND (qi.inspection_no LIKE ? OR qi.reference_no LIKE ? OR qi.batch_no LIKE ?)';
      sqlParams.push(keyword, keyword, keyword);
    }

    if (filters.status) {
      query += ' AND qi.status = ?';
      sqlParams.push(filters.status);
    }

    if (filters.startDate && filters.endDate) {
      query += ' AND qi.planned_date BETWEEN ? AND ?';
      sqlParams.push(filters.startDate, filters.endDate);
    }

    // 获取总数的查询 - 单独构建COUNT查询，避免子查询干扰
    let countQuery = `
      SELECT COUNT(*) as total
      FROM quality_inspections qi
      LEFT JOIN materials m ON qi.inspection_type = 'incoming' AND qi.material_id = m.id
      LEFT JOIN materials proc_m ON qi.inspection_type IN('process', 'final') AND qi.product_id = proc_m.id
      LEFT JOIN production_tasks pt ON qi.inspection_type IN('process', 'final') AND qi.reference_id = pt.id
      LEFT JOIN materials task_m ON pt.product_id = task_m.id
      `;

    if (includeSupplier) {
      countQuery += `
        LEFT JOIN purchase_orders po ON qi.inspection_type = 'incoming' AND qi.reference_no = po.order_no
        LEFT JOIN suppliers s ON po.supplier_id = s.id
      `;
    }

    countQuery += ' WHERE qi.deleted_at IS NULL AND qi.inspection_type = ?';

    // 添加筛选条件（与主查询相同）
    if (filters.keyword) {
      countQuery +=
        ' AND (qi.inspection_no LIKE ? OR qi.reference_no LIKE ? OR qi.batch_no LIKE ?)';
    }
    if (filters.status) {
      countQuery += ' AND qi.status = ?';
    }
    if (filters.startDate && filters.endDate) {
      countQuery += ' AND DATE(qi.created_at) BETWEEN ? AND ?';
    }

    // 直接使用connection执行查询
    const connection = await db.pool.getConnection();

    try {
      // 执行总数查询
      const [countRows] = await connection.query(countQuery, sqlParams);
      // 防止countRows[0]为undefined导致错误
      const total = countRows && countRows[0] ? parseInt(countRows[0].total) : 0;

      // 添加分页 — 使用安全分页工具
      query = appendPaginationSQL(query + ' ORDER BY qi.created_at DESC', limit, offset);

      // 使用 query 避免 LIMIT/OFFSET 参数化问题
      const [rows] = await connection.query(query, sqlParams);

      return {
        rows: rows || [], // 确保返回空数组而不是undefined
        total: total || 0, // 确保返回0而不是undefined
      };
    } finally {
      connection.release();
    }
  }

  /**
   * 根据ID获取检验单详情
   * @param {number} id 检验单ID
   * @param {object} options 选项
   * @returns {Promise<object>} 检验单详情
   */
  static async getInspectionById(id, options = {}) {
    try {
      if (!id) return null;

      const inspectionId = parseInt(id, 10);
      if (isNaN(inspectionId)) return null;

      // 默认加载供应商信息
      const includeSupplier = options.include_supplier !== false;

      const connection = await db.pool.getConnection();
      try {
        // 构建基础查询
        let query = `
      SELECT
      qi.*,
        CASE
              WHEN qi.inspection_type = 'incoming' THEN m.name
              WHEN qi.inspection_type = 'final' AND task_m.name IS NOT NULL THEN task_m.name
              WHEN qi.product_name IS NOT NULL AND qi.product_name != '' THEN qi.product_name
              ELSE proc_m.name
            END AS item_name,
        CASE
              WHEN qi.inspection_type = 'incoming' THEN m.code
              WHEN qi.inspection_type = 'final' AND task_m.code IS NOT NULL THEN task_m.code
              WHEN qi.product_code IS NOT NULL AND qi.product_code != '' THEN qi.product_code
              ELSE proc_m.code
            END AS item_code,
        CASE
              WHEN qi.inspection_type = 'incoming' THEN m.specs
              WHEN qi.inspection_type = 'final' AND task_m.specs IS NOT NULL THEN task_m.specs
              ELSE proc_m.specs
            END AS item_specs,
        it.template_code,
        it.template_name
          `;

        // 根据选项添加额外字段
        if (includeSupplier) {
          query += `,
        s.id as supplier_id,
        s.name as supplier_name,
        s.contact_person as supplier_contact
      `;
        }

        query += `
          FROM quality_inspections qi
          LEFT JOIN materials m ON qi.inspection_type = 'incoming' AND qi.material_id = m.id
          LEFT JOIN materials proc_m ON qi.inspection_type IN('process', 'final') AND qi.product_id = proc_m.id
          LEFT JOIN production_tasks pt ON qi.inspection_type = 'final' AND qi.reference_id = pt.id
          LEFT JOIN materials task_m ON pt.product_id = task_m.id
          LEFT JOIN inspection_templates it ON qi.template_id = it.id
        `;

        // 根据选项添加供应商连接
        if (includeSupplier) {
          query += `
            LEFT JOIN purchase_orders po ON qi.inspection_type = 'incoming' AND qi.reference_no = po.order_no
            LEFT JOIN suppliers s ON po.supplier_id = s.id
        `;
        }

        query += 'WHERE qi.deleted_at IS NULL AND qi.id = ?';

        // 执行查询
        const [rows] = await connection.query(query, [inspectionId]);
        if (rows.length === 0) {
          return null;
        }

        // 获取检验项
        const itemsQuery = `
      SELECT * FROM quality_inspection_items 
          WHERE inspection_id = ?
        ORDER BY id
        `;
        const [items] = await connection.query(itemsQuery, [inspectionId]);

        return {
          ...rows[0],
          items,
        };
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('获取检验单详情失败:', error);
      throw error;
    }
  }

  /**
   * 创建质量检验单
   * @param {object} inspection 检验单数据
   * @returns {Promise<object>} 创建结果
   */
  static async createInspection(inspection, externalConnection = null) {
    let connection;
    const useOwnConnection = !externalConnection;
    try {
      connection = externalConnection || await db.pool.getConnection();
      if (useOwnConnection) {
        await connection.beginTransaction();
      }

      // 生成检验单号
      let inspectionNo;
      if (inspection.inspection_no) {
        inspectionNo = inspection.inspection_no;
      } else {
        const prefix = this._getInspectionPrefix(inspection.inspection_type);
        inspectionNo = await this.generateInspectionNo(prefix, connection);
      }

      // 批次号必须来自采购、生产或前端显式录入，避免模型层生成不可追溯的业务编号
      if (!inspection.batch_no || String(inspection.batch_no).includes('默认')) {
        throw new Error('批次号不能为空，请从业务来源传入可追溯的批次号');
      }

      // ✅ 如果是来料检验,且reference_id为空但reference_no存在,自动查找采购订单ID
      if (
        inspection.inspection_type === 'incoming' &&
        !inspection.reference_id &&
        inspection.reference_no
      ) {
        try {
          const [orderRows] = await connection.query(
            'SELECT id FROM purchase_orders WHERE order_no = ?',
            [inspection.reference_no]
          );
          if (orderRows && orderRows.length > 0) {
            inspection.reference_id = orderRows[0].id;
            logger.info(
              `✅ 自动查找到采购订单ID: ${inspection.reference_id} (订单号: ${inspection.reference_no})`
            );
          } else {
            logger.warn(`⚠️ 未找到采购订单: ${inspection.reference_no} `);
          }
        } catch (error) {
          logger.error('查询采购订单ID失败:', error);
        }
      }

      // 如果product_id存在但product_code或product_name为空，从materials表查询
      if (inspection.product_id && (!inspection.product_code || !inspection.product_name)) {
        try {
          const [productRows] = await connection.query(
            'SELECT code, name FROM materials WHERE id = ?',
            [inspection.product_id]
          );
          if (productRows && productRows.length > 0) {
            inspection.product_code = inspection.product_code || productRows[0].code;
            inspection.product_name = inspection.product_name || productRows[0].name;
            logger.info(
              `从materials表查询到产品信息: code = ${inspection.product_code}, name = ${inspection.product_name} `
            );
          }
        } catch (error) {
          logger.warn('查询产品信息失败:', error.message);
        }
      }

      // 如果material_id存在但unit为空，从materials表查询
      if (inspection.material_id && !inspection.unit) {
        try {
          const [materialRows] = await connection.query(
            'SELECT unit_id FROM materials WHERE id = ?',
            [inspection.material_id]
          );
          if (materialRows && materialRows.length > 0 && materialRows[0].unit_id) {
            const [unitRows] = await connection.query('SELECT name FROM units WHERE id = ?', [
              materialRows[0].unit_id,
            ]);
            if (unitRows && unitRows.length > 0) {
              inspection.unit = unitRows[0].name;
            }
          }
        } catch (error) {
          logger.warn('查询单位信息失败:', error.message);
        }
      }

      // 【检验方式逻辑】查询当前物料的检验方式（免检/抽检/全检）
      let isExempt = false;
      let isSampling = false;
      if (inspection.material_id) {
        try {
          const [methodRows] = await connection.query(
            `SELECT im.code FROM materials m LEFT JOIN inspection_methods im ON m.inspection_method_id = im.id WHERE m.id = ?`,
            [inspection.material_id]
          );
          if (methodRows && methodRows.length > 0) {
            const methodCode = methodRows[0].code;
            if (methodCode === 'exempt') {
              isExempt = true;
              logger.info(`✅ 物料 ${inspection.material_id} 检测到免检验配置，将自动视为合格`);
              // 覆盖单据状态以自动合格
              inspection.status = 'passed';
              inspection.inspector_name = '系统(自动免检)';
              inspection.note = (inspection.note ? inspection.note + ' | ' : '') + '依据物料免检配置，系统自动判定合格';
            } else if (methodCode === 'sampling') {
              isSampling = true;
              logger.info(`📊 物料 ${inspection.material_id} 检测到抽检配置，将自动启用AQL抽样(默认0.65)`);
              // 自动开启AQL抽样，默认级别0.65
              inspection.is_aql = 1;
              inspection.aql_level = '0.65';
            }
          }
        } catch (err) {
          logger.warn('查询物料检验方式失败:', err.message);
        }
      }

      // 创建检验单
      const [result] = await connection.query(
        `
          INSERT INTO quality_inspections(
          inspection_no, inspection_type, reference_id, reference_no,
          material_id, product_id, product_name, product_code, task_id,
          batch_no, quantity, unit, standard_type, standard_no,
          planned_date, actual_date, note, inspector_name, status,
          is_aql, aql_level
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        [
          inspectionNo,
          inspection.inspection_type,
          inspection.reference_id,
          inspection.reference_no,
          inspection.material_id || null,
          inspection.product_id || null,
          inspection.product_name || null,
          inspection.product_code || null,
          inspection.task_id || inspection.reference_id || null,
          inspection.batch_no,
          inspection.quantity,
          inspection.unit,
          inspection.standard_type || null,
          inspection.standard_no || null,
          inspection.planned_date,
          isExempt ? new Date() : null, // 实际检验日期
          inspection.note,
          inspection.inspector_name || null, // 检验员姓名
          inspection.status || 'pending',
          inspection.is_aql || 0, // AQL抽样开关
          inspection.aql_level || null, // AQL级别
        ]
      );

      const inspectionId = result.insertId;

      // 如果有检验项目数据，则创建检验项目
      if (inspection.items && Array.isArray(inspection.items) && inspection.items.length > 0) {
        for (const item of inspection.items) {
          // 处理is_critical字段，确保它是0或1
          const isCritical = item.is_critical === true || item.is_critical === 1 ? 1 : 0;

          // 处理备注字段
          const remark = item.remarks || item.remark || null;

          // 确保type字段值有效
          const validTypes = [
            'visual',
            'dimension',
            'quantity',
            'function',
            'weight',
            'performance',
            'safety',
            'electrical',
            'qualitative',
            'other',
          ];
          let itemType = 'other'; // 默认为other类型

          if (item.type && validTypes.includes(item.type)) {
            itemType = item.type;
          }

          // 这里如果是免检我们自动赋予OK通过结果
          let itemResult = null;
          let actualValue = null;
          if (isExempt) {
            itemResult = 'OK';
            actualValue = '免检项自动合格';
          }

          // 插入检验项目（包含 result, actual_value, 和6次测量值字段）
          const [itemResultDb] = await connection.query(
            `
              INSERT INTO quality_inspection_items(
            inspection_id, item_name, standard, type, is_critical,
            dimension_value, tolerance_upper, tolerance_lower,
            result, actual_value, remark,
            measure_1, measure_2, measure_3, measure_4, measure_5, measure_6
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              inspectionId,
              item.item_name,
              item.standard,
              itemType,
              isCritical,
              item.dimension_value || null,
              item.tolerance_upper || null,
              item.tolerance_lower || null,
              itemResult,
              actualValue,
              remark,
              item.measure_1 || null,
              item.measure_2 || null,
              item.measure_3 || null,
              item.measure_4 || null,
              item.measure_5 || null,
              item.measure_6 || null,
            ]
          );

          // 同时写入动态测量子表 (quality_inspection_measurements)
          const insertedItemId = itemResultDb.insertId;
          const measurements = item.measurements || [];
          // 优先使用 measurements 数组，其次回退到 measure_1~6
          if (measurements.length > 0) {
            for (const m of measurements) {
              await connection.query(
                `INSERT INTO quality_inspection_measurements (item_id, sample_no, measured_value, measured_by)
                 VALUES (?, ?, ?, ?)`,
                [insertedItemId, m.sample_no, m.measured_value, m.measured_by || null]
              );
            }
          } else {
            // 回退: 从 measure_1~6 写入
            for (let si = 1; si <= 6; si++) {
              const val = item[`measure_${si}`];
              if (val !== null && val !== undefined) {
                await connection.query(
                  `INSERT INTO quality_inspection_measurements (item_id, sample_no, measured_value)
                   VALUES (?, ?, ?)`,
                  [insertedItemId, si, val]
                );
              }
            }
          }
        }
      }

      if (useOwnConnection) {
        await connection.commit();
      }

      return {
        id: inspectionId,
        inspection_no: inspectionNo,
        is_exempt: isExempt, // 向上层标志是否由系统免检生成
        is_sampling: isSampling, // 向上层标志是否由系统自动启用AQL抽样
        ...inspection,
      };
    } catch (error) {
      if (useOwnConnection && connection) {
        await connection.rollback();
      }
      logger.error('创建检验单失败:', error);
      throw error;
    } finally {
      if (useOwnConnection && connection) {
        connection.release();
      }
    }
  }

  /**
   * 更新检验单信息
   * @param {number} id 检验单ID
   * @param {object} data 更新数据
   * @returns {Promise<object>} 更新后的检验单
   */
  static async updateInspection(id, data) {
    let connection;
    try {
      logger.info('开始更新检验单，ID:', id);
      logger.info('更新数据:', JSON.stringify(data));

      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      try {
        // 获取当前检验单的信息
        const [currentInspection] = await connection.query(
          'SELECT * FROM quality_inspections WHERE id = ? AND deleted_at IS NULL',
          [id]
        );

        if (currentInspection.length === 0) {
          throw new Error('检验单不存在');
        }

        const inspection = currentInspection[0];

        // 更新检验单基本信息
        const updateFields = [];
        const updateValues = [];

        // 处理字段映射，将inspector映射为inspector_name
        const fieldMapping = {
          inspector: 'inspector_name',
        };

        for (const [key, value] of Object.entries(data)) {
          if (key !== 'items' && value !== undefined) {
            // 使用映射后的字段名
            const fieldName = fieldMapping[key] || key;
            updateFields.push(`${fieldName} = ?`);
            updateValues.push(value);
          }
        }

        if (updateFields.length > 0) {
          updateValues.push(id);

          await connection.execute(
            `UPDATE quality_inspections 
             SET ${updateFields.join(', ')} 
             WHERE id = ? `,
            updateValues
          );
        }

        // 如果有检验项，更新检验项
        if (data.items && data.items.length > 0) {
          // 先删除旧的检验项
          await connection.execute('DELETE FROM quality_inspection_items WHERE inspection_id = ?', [
            id,
          ]);

          // 插入新的检验项
          for (const item of data.items) {
            // 处理is_critical字段，确保它是0或1
            const isCritical = item.is_critical === true || item.is_critical === 1 ? 1 : 0;

            // 处理remarks和remark字段
            const remark = item.remarks || item.remark || null;

            // 确保type字段值有效，只接受预定义的类型
            const validTypes = [
              'visual',
              'dimension',
              'quantity',
              'function',
              'weight',
              'performance',
              'safety',
              'electrical',
              'other',
            ];
            let itemType = 'other'; // 默认为other类型

            // 如果type有值并且在有效类型列表中，则使用该值，否则使用other
            if (item.type && validTypes.includes(item.type)) {
              itemType = item.type;
            }

            const [updatedItemResult] = await connection.execute(
              `INSERT INTO quality_inspection_items(
            inspection_id, item_name, standard, type, is_critical,
            dimension_value, tolerance_upper, tolerance_lower,
            result, actual_value, remark,
            measure_1, measure_2, measure_3, measure_4, measure_5, measure_6
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                item.item_name,
                item.standard,
                itemType,
                isCritical,
                item.dimension_value || null,
                item.tolerance_upper || null,
                item.tolerance_lower || null,
                item.result || null,
                item.actual_value || null,
                remark,
                item.measure_1 || null,
                item.measure_2 || null,
                item.measure_3 || null,
                item.measure_4 || null,
                item.measure_5 || null,
                item.measure_6 || null,
              ]
            );

            // 同时写入动态测量子表
            const updatedItemId = updatedItemResult.insertId;
            const measurements = item.measurements || [];
            if (measurements.length > 0) {
              for (const m of measurements) {
                await connection.execute(
                  `INSERT INTO quality_inspection_measurements (item_id, sample_no, measured_value, measured_by)
                   VALUES (?, ?, ?, ?)`,
                  [updatedItemId, m.sample_no, m.measured_value, m.measured_by || null]
                );
              }
            } else {
              for (let si = 1; si <= 6; si++) {
                const val = item[`measure_${si}`];
                if (val !== null && val !== undefined) {
                  await connection.execute(
                    `INSERT INTO quality_inspection_measurements (item_id, sample_no, measured_value)
                     VALUES (?, ?, ?)`,
                    [updatedItemId, si, val]
                  );
                }
              }
            }
          }
        }

        // 如果是成品检验，根据检验单状态同步更新生产任务、计划和过程的状态
        // 成品检验的reference_id就是生产任务ID
        if (inspection.inspection_type === 'final' && inspection.reference_id && data.status) {
          try {
            const taskId = inspection.reference_id;
            const newInspectionStatus = data.status;

            // 查找生产任务和计划
            const [taskResult] = await connection.query(
              'SELECT id, plan_id FROM production_tasks WHERE id = ?',
              [taskId]
            );

            if (taskResult.length > 0) {
              const planId = taskResult[0].plan_id;

              // 根据检验单状态确定任务和计划的目标状态（API格式）
              let apiStatus = null;

              if (newInspectionStatus === 'in_progress') {
                // 检验中 → 任务、计划、过程都变为检验中
                apiStatus = STATUS.PRODUCTION_TASK.IN_PROGRESS;
                logger.info(
                  `检验单状态变为检验中，准备更新任务 ${taskId} 和计划 ${planId} 状态为检验中`
                );
              } else if (newInspectionStatus === 'passed') {
                // 检验合格 → 任务、计划、过程都变为入库中
                apiStatus = STATUS.PRODUCTION_TASK.WAREHOUSING;
                logger.info(
                  `检验单状态变为合格，准备更新任务 ${taskId} 和计划 ${planId} 状态为入库中`
                );
              }

              if (apiStatus) {
                // 将API状态转换为数据库ENUM状态
                const dbStatus = apiStatusToDbStatus(apiStatus, 'productionTask');
                logger.info(`状态转换: API = ${apiStatus}, 数据库 = ${dbStatus} `);

                // 更新生产任务状态
                await connection.execute('UPDATE production_tasks SET status = ? WHERE id = ?', [
                  dbStatus,
                  taskId,
                ]);
                logger.info(`生产任务 ${taskId} 状态已更新为 ${dbStatus} (API: ${apiStatus})`);

                // 更新生产过程状态
                await connection.execute(
                  'UPDATE production_processes SET status = ? WHERE task_id = ?',
                  [dbStatus, taskId]
                );
                logger.info(`生产任务 ${taskId} 的所有生产过程状态已更新为 ${dbStatus} `);

                if (planId) {
                  // 检查该计划下的所有任务是否都达到了目标状态
                  const [taskStats] = await connection.query(
                    `
      SELECT
      COUNT(*) as total,
        SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as target_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
                    FROM production_tasks
                    WHERE plan_id = ?
        `,
                    [dbStatus, planId]
                  );

                  const { total: totalTasks, target_count, cancelled_count } = taskStats[0];

                  // 转换为数字，避免类型问题
                  const totalTasksNum = Number(totalTasks) || 0;
                  const targetCountNum = Number(target_count) || 0;
                  const cancelledCountNum = Number(cancelled_count) || 0;

                  const allTasksReady = targetCountNum === totalTasksNum - cancelledCountNum;

                  // 只有当所有有效任务都达到目标状态时，才更新计划状态
                  if (allTasksReady && totalTasksNum > 0) {
                    await connection.execute(
                      'UPDATE production_plans SET status = ? WHERE id = ?',
                      [dbStatus, planId]
                    );
                    logger.info(`生产计划 ${planId} 状态已更新为 ${dbStatus} (API: ${apiStatus})`);
                  }
                }

                // 如果检验通过，自动创建入库单
                if (newInspectionStatus === 'passed') {
                  try {
                    // 获取任务和产品信息（包含物料的默认仓库）
                    const [taskInfo] = await connection.query(
                      `SELECT pt.id, pt.code, pt.product_id, pt.quantity,
        m.code as product_code, m.name as product_name,
        m.location_id as material_location_id
                       FROM production_tasks pt
                       LEFT JOIN materials m ON pt.product_id = m.id
                       WHERE pt.id = ? `,
                      [taskId]
                    );

                    if (taskInfo.length > 0) {
                      const task = taskInfo[0];

                      // 检查是否已经存在入库单
                      const [existingInbound] = await connection.query(
                        'SELECT id FROM inventory_inbound WHERE inspection_id = ?',
                        [id]
                      );

                      if (existingInbound.length === 0) {
                        // 优先使用物料的默认仓库
                        let locationId = task.material_location_id;

                        // 如果物料没有设置默认仓库，通过统一服务获取（会抛错提示配置）
                        if (!locationId) {
                          const InventoryService = require('../../../services/InventoryService');
                          locationId = await InventoryService.getMaterialLocation(task.product_id, connection);
                        }

                        if (!locationId) {
                          logger.warn('未找到默认仓库位置，无法自动创建入库单');
                        } else {
                          // 生成入库单号（统一使用 RK{日期}{3位序号} 格式）
                          // 使用 FOR UPDATE 加锁，防止并发时获取相同序号
                          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                          const [maxNoResult] = await connection.query(
                            'SELECT MAX(TRIM(inbound_no)) as max_no FROM inventory_inbound WHERE TRIM(inbound_no) LIKE ? FOR UPDATE',
                            [`RK${dateStr}%`]
                          );
                          const maxNo = (maxNoResult[0].max_no || `RK${dateStr}000`).trim();
                          const nextSeq = (parseInt(maxNo.slice(-3), 10) || 0) + 1;
                          const inboundNo = `RK${dateStr}${nextSeq.toString().padStart(3, '0')}`;

                          // 获取操作人（优先使用检验员姓名，否则使用系统）
                          const operator =
                            data.inspector_name || inspection.inspector_name || '系统';

                          // 创建入库单（包含操作人字段）
                          const [inboundResult] = await connection.execute(
                            `INSERT INTO inventory_inbound(
          inbound_no, inbound_type, inspection_id, location_id,
          inbound_date, status, operator, remark
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                              inboundNo,
                              'production',
                              id,
                              locationId,
                              new Date(),
                              'draft',
                              operator,
                              `检验单 ${inspection.inspection_no} 通过后自动创建`,
                            ]
                          );

                          const inboundId = inboundResult.insertId;

                          // 获取单位信息
                          const [unitInfo] = await connection.query(
                            'SELECT id FROM units WHERE name = ? LIMIT 1',
                            ['个']
                          );
                          const unitId = unitInfo.length > 0 ? unitInfo[0].id : null;

                          // ✅ 从源头确保入库单明细的批次号非空
                          // 若质检单本身未填写批次号，则在此生成一个有效批次号
                          // 并同步更新质检单的 batch_no 字段，保持数据一致性
                          let itemBatchNo = (inspection.batch_no || '').trim();
                          if (!itemBatchNo) {
                            itemBatchNo = `FQC-${inboundNo}-${task.product_id}`;
                            // 同步写回质检单，避免后续查询仍为空
                            await connection.execute(
                              'UPDATE quality_inspections SET batch_no = ? WHERE id = ?',
                              [itemBatchNo, id]
                            );
                            logger.warn(
                              `[批次号自动生成] 质检单 ${id} 未填写批次号，` +
                              `已自动生成批次号: ${itemBatchNo} 并同步写回质检单`
                            );
                          }

                          // 创建入库单明细（批次号已保证非空）
                          await connection.execute(
                            `INSERT INTO inventory_inbound_items(
          inbound_id, material_id, quantity, unit_id, location_id, batch_number, remark
        ) VALUES(?, ?, ?, ?, ?, ?, ?)`,
                            [
                              inboundId,
                              task.product_id,
                              data.qualified_quantity ?? inspection.qualified_quantity, // 取本次检验的合格数
                              unitId,
                              locationId,
                              itemBatchNo,
                              `生产任务 ${task.code}`,
                            ]
                          );

                          logger.info(
                            `检验单 ${id} 通过，自动创建入库单 ${inboundNo} (ID: ${inboundId})`
                          );
                        }
                      } else {
                        logger.info(`检验单 ${id} 已存在入库单，跳过创建`);
                      }
                    }
                  } catch (inboundError) {
                    logger.error(`检验单 ${id} 自动创建入库单失败: `, inboundError);
                    throw inboundError;
                  }
                }
              }
            }
          } catch (error) {
            logger.error('同步更新生产任务、计划和过程状态失败:', error);
            throw error;
          }
        }

        await connection.commit();
        logger.info('提交事务成功');

        return { id, ...data };
      } catch (error) {
        logger.error('更新检验单过程中出错:', error);
        if (connection) {
          await connection.rollback();
          logger.info('事务已回滚');
        }
        throw error;
      }
    } catch (error) {
      logger.error('更新检验单失败:', error.message);
      logger.error('错误堆栈:', error.stack);
      throw error;
    } finally {
      if (connection) {
        connection.release();
        logger.info('数据库连接已释放');
      }
    }
  }

  /**
   * 删除检验单
   * @param {number} id 检验单ID
   * @returns {Promise<boolean>} 删除结果
   */
  static async deleteInspection(id) {
    try {
      const connection = await db.pool.getConnection();
      await connection.beginTransaction();

      try {
        // 删除检验项
        await connection.execute('DELETE FROM quality_inspection_items WHERE inspection_id = ?', [
          id,
        ]);

        // 删除检验单
        // ✅ 软删除替代硬删除
        await softDelete(connection, 'quality_inspections', 'id', id);

        await connection.commit();
        return true;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('删除检验单失败:', error);
      throw error;
    }
  }

  /**
   * 获取检验相关的引用数据（物料、产品、工序等）
   * @param {string} type 检验类型
   * @returns {Promise<object>} 相关数据
   */
  static async getReferenceData(type) {
    const data = {};

    if (type === 'incoming') {
      // 获取采购单
      const [purchaseOrders] = await db.query(`
        SELECT po.id, po.order_no, po.supplier_id, s.name as supplier_name 
        FROM purchase_orders po
        JOIN suppliers s ON po.supplier_id = s.id
        WHERE po.status = 'approved'
        ORDER BY po.created_at DESC
        LIMIT 100
        `);

      data.purchaseOrders = purchaseOrders;

      // 获取物料
      if (purchaseOrders.length > 0) {
        const supplierIds = [...new Set(purchaseOrders.map((po) => po.supplier_id))];
        const [materials] = await db.query(
          `
          SELECT m.id, m.name, m.code, m.unit 
          FROM materials m
          JOIN supplier_materials sm ON m.id = sm.material_id
          WHERE sm.supplier_id IN(?)
        `,
          [supplierIds]
        );

        data.materials = materials;
      }
    } else {
      // 获取生产工单
      const [productionOrders] = await db.query(`
        SELECT pt.id, pt.code as order_no, pt.product_id, m.name as product_name, m.specs as unit
        FROM production_tasks pt
        JOIN materials m ON pt.product_id = m.id
        WHERE pt.status IN('in_progress', 'pending')
        ORDER BY pt.created_at DESC
        LIMIT 100
        `);

      data.productionOrders = productionOrders;

      if (type === 'process' && productionOrders.length > 0) {
        // 获取工序

        const [processes] = await db.query(
          `
          SELECT pp.id, pp.task_id, pp.process_name, pp.sequence, pp.status
          FROM production_processes pp
          WHERE pp.task_id IN(?)
          ORDER BY pp.sequence
        `,
          [productionOrders.map(po => po.id)]
        );

        data.processes = processes;
      }
    }

    return data;
  }

  /**
   * 获取检验标准数据
   * @param {string} type 检验类型
   * @param {number} targetId 目标ID (物料ID或产品ID)
   * @returns {Promise<Array>} 标准数据
   */
  static async getStandards(type, targetId) {
    const targetType = type === 'incoming' ? 'material' : 'product';

    const [standards] = await db.query(
      `
      SELECT s.*, COUNT(si.id) as item_count
      FROM quality_standards s
      LEFT JOIN quality_standard_items si ON s.id = si.standard_id
      WHERE s.target_type = ? AND s.target_id = ? AND s.is_active = 1
      GROUP BY s.id
      ORDER BY s.created_at DESC
        `,
      [targetType, targetId]
    );

    // 获取标准项
    if (standards.length > 0) {
      const standardIds = standards.map((s) => s.id);
      const [items] = await db.query(
        `
      SELECT * FROM quality_standard_items
        WHERE standard_id IN(?)
        ORDER BY sequence
      `,
        [standardIds]
      );

      // 组装数据
      standards.forEach((standard) => {
        standard.items = items.filter((item) => item.standard_id === standard.id);
      });
    }

    return standards;
  }

  /**
   * 根据检验类型获取检验单号前缀
   * @param {string} inspectionType 检验类型: incoming, process, final
   * @returns {string} 检验单号前缀
   * @private
   */
  static _getInspectionPrefix(inspectionType) {
    // 根据检验类型生成不同的前缀
    let prefix;
    if (inspectionType === 'incoming') {
      prefix = 'IQC'; // Incoming Quality Control
    } else if (inspectionType === 'process') {
      prefix = 'PQC'; // Process Quality Control
    } else if (inspectionType === 'final') {
      prefix = 'FQC'; // Final Quality Control
    } else {
      prefix = inspectionType.toUpperCase();
    }

    return prefix;
  }

  /**
   * 生成检验单号
   * @param {string} prefix 检验单号前缀
   * @returns {string} 生成的检验单号
   */
  static async generateInspectionNo(_prefix, connection = null) {
    try {
      return await CodeGeneratorService.nextCode('quality_inspection', connection);
    } catch (error) {
      logger.error('生成检验单号失败:', error);
      throw error;
    }
  }
}

module.exports = QualityInspection;
