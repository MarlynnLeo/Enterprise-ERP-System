const db = require('../config/db');
const logger = require('../utils/logger');
const CodeGeneratorService = require('../services/business/CodeGeneratorService');

class NonconformingProduct {
  /**
   * 生成不合格品编号
   */
  static async generateNcpNo() {
    return await CodeGeneratorService.nextCode('nonconforming_product');
  }

  /**
   * Create nonconforming product
   */
  static async create(ncpData) {
    let connection;
    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const ncpNo = await this.generateNcpNo();

      // ✅ 如果物料名称/编码为空但有物料ID，从物料表获取
      let materialName = ncpData.material_name;
      let materialCode = ncpData.material_code;
      if ((!materialName || !materialCode) && ncpData.material_id) {
        const [materialRows] = await connection.query(
          'SELECT code, name FROM materials WHERE id = ?',
          [ncpData.material_id]
        );
        if (materialRows.length > 0) {
          materialName = materialName || materialRows[0].name;
          materialCode = materialCode || materialRows[0].code;
          logger.info(`✅ 自动填充物料信息: ${materialCode} - ${materialName}`);
        }
      }

      // ✅ 全自动防呆溯源逻辑：从生产线发送的不合格品，利用传来的工单编号自动反查历史挂靠供应商
      if (ncpData.source_task_no && (!ncpData.batch_no || !ncpData.supplier_id)) {
        try {
          logger.info(`🔍 [血缘追溯] 捕获生产线退料，任务号:${ncpData.source_task_no} 物料:${ncpData.material_id}，启动跨表溯源...`);
          // 1. 在 `inventory_ledger` 与 `inventory_outbound` 联合查找该物料在此工单领料的最新批次号
          const [ledgerRows] = await connection.query(`
            SELECT il.batch_number 
            FROM inventory_ledger il
            JOIN inventory_outbound o ON il.reference_no = o.outbound_no
            WHERE o.production_task_id = ? 
              AND il.material_id = ? 
              AND il.batch_number IS NOT NULL
            ORDER BY il.created_at DESC 
            LIMIT 1
          `, [ncpData.source_task_id, ncpData.material_id]);

          if (ledgerRows.length > 0 && ledgerRows[0].batch_number) {
            ncpData.batch_no = ledgerRows[0].batch_number;
            logger.info(`✅ [血缘追溯] 第1跳: 提取到工单原始领料的有效批次号 => ${ncpData.batch_no}`);

            // 2. 拿着批次号反查采购入库记录拿到供应商（JOIN suppliers 表取权威名称）
            const [receiptRows] = await connection.query(`
              SELECT r.supplier_id, COALESCE(s.name, r.supplier_name) AS supplier_name
              FROM purchase_receipts r
              JOIN purchase_receipt_items ri ON r.id = ri.receipt_id
              LEFT JOIN suppliers s ON r.supplier_id = s.id
              WHERE ri.batch_number = ? AND ri.material_id = ?
              LIMIT 1
            `, [ncpData.batch_no, ncpData.material_id]);

            if (receiptRows.length > 0) {
              ncpData.supplier_id = receiptRows[0].supplier_id;
              ncpData.supplier_name = receiptRows[0].supplier_name;
              ncpData.responsible_party = 'supplier';
              logger.info(`✅ [血缘追溯] 第2跳: 完美匹配采购入库的责任供货商 => ${ncpData.supplier_name}`);
            } else {
              // 备用：从 inventory_ledger 查该批次最初的采购入库(inbound)交易记录
              const [inboundLedgerRows] = await connection.query(`
                SELECT reference_no
                FROM inventory_ledger
                WHERE transaction_type = 'inbound' 
                  AND reference_type = 'purchase_receipt'
                  AND batch_number = ?
                  AND material_id = ?
                LIMIT 1
              `, [ncpData.batch_no, ncpData.material_id]);

              if (inboundLedgerRows.length > 0) {
                 const receiptNo = inboundLedgerRows[0].reference_no;
                 const [suppRows] = await connection.query(`
                    SELECT r.supplier_id, COALESCE(s.name, r.supplier_name) AS supplier_name
                    FROM purchase_receipts r
                    LEFT JOIN suppliers s ON r.supplier_id = s.id
                    WHERE r.receipt_no = ?
                    LIMIT 1
                 `, [receiptNo]);
                 if (suppRows.length > 0) {
                    ncpData.supplier_id = suppRows[0].supplier_id;
                    ncpData.supplier_name = suppRows[0].supplier_name;
                    ncpData.responsible_party = 'supplier';
                    logger.info(`✅ [血缘追溯] 第2跳(备用): 由台账穿透至源头入库单的责任人 => ${ncpData.supplier_name}`);
                 }
              } else {
                 logger.warn('[血缘追溯] 未在采购收货侧查获批号来源，已转入人工核验。');
              }
            }
          } else {
            logger.warn(`⚠️ [血缘追溯] 追踪断环: 无库中领料记录（该料可能是脏数据创建的退料）。待下发人工核验。`);
          }
        } catch (traceError) {
          logger.error('❌ [血缘追溯] 核心智能系统遭遇异常 (已接管，转人工):', traceError);
        }
      }

      const query = `
        INSERT INTO nonconforming_products (
          ncp_no, inspection_id, inspection_no, material_id, material_code, material_name,
          batch_no, quantity, unit, defect_type, defect_description, severity,
          supplier_id, supplier_name, disposition, disposition_reason, disposition_by,
          disposition_date, current_location, isolation_area, responsible_party,
          responsible_person, note, created_by, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        ncpNo,
        ncpData.inspection_id || null,
        ncpData.inspection_no || null,
        ncpData.material_id || null,
        materialCode || null, // ✅ 使用处理后的物料编码
        materialName || null, // ✅ 使用处理后的物料名称
        ncpData.batch_no || null,
        ncpData.quantity,
        ncpData.unit || null,
        ncpData.defect_type || null,
        ncpData.defect_description || null,
        ncpData.severity || 'minor',
        ncpData.supplier_id || null,
        ncpData.supplier_name || null,
        ncpData.disposition || 'pending',
        ncpData.disposition_reason || null,
        ncpData.disposition_by || null,
        ncpData.disposition_date || null,
        ncpData.current_location || null,
        ncpData.isolation_area || null,
        ncpData.responsible_party || 'unknown',
        ncpData.responsible_person || null,
        ncpData.note || null,
        ncpData.created_by || null,
        ncpData.status || 'pending',
      ];

      const [result] = await connection.query(query, values);

      // Create action record
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
         VALUES (?, 'create', ?, ?)`,
        [result.insertId, `Created NCP ${ncpNo}`, ncpData.created_by || 'system']
      );

      await connection.commit();

      logger.info(`Created nonconforming product: ${ncpNo}`);
      return { id: result.insertId, ncp_no: ncpNo };
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error('Failed to create nonconforming product:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Get NCP list with pagination
   */
  static async getList(params = {}) {
    const {
      page = 1,
      pageSize = 10,
      status,
      disposition,
      severity,
      material_id,
      inspection_id,
      keyword,
      startDate,
      endDate,
    } = params;

    const offset = (page - 1) * pageSize;
    let query = `
      SELECT
        ncp.*,
        COALESCE(m.code, ncp.material_code) as material_code,
        ROUND((ncp.quantity / NULLIF(qi.quantity, 0)) * 100, 2) as unqualified_rate,
        COUNT(*) OVER() as total_count
      FROM nonconforming_products ncp
      LEFT JOIN materials m ON ncp.material_id = m.id
      LEFT JOIN quality_inspections qi ON ncp.inspection_id = qi.id
      WHERE 1=1
    `;
    const queryParams = [];

    // 关键字搜索
    if (keyword) {
      query +=
        ' AND (ncp.ncp_no LIKE ? OR ncp.material_name LIKE ? OR m.code LIKE ? OR ncp.material_code LIKE ?)';
      const keywordPattern = `%${keyword}%`;
      queryParams.push(keywordPattern, keywordPattern, keywordPattern, keywordPattern);
    }

    if (status) {
      query += ' AND ncp.status = ?';
      queryParams.push(status);
    }

    if (disposition) {
      query += ' AND ncp.disposition = ?';
      queryParams.push(disposition);
    }

    if (severity) {
      query += ' AND ncp.severity = ?';
      queryParams.push(severity);
    }

    if (material_id) {
      query += ' AND ncp.material_id = ?';
      queryParams.push(material_id);
    }

    if (inspection_id) {
      query += ' AND ncp.inspection_id = ?';
      queryParams.push(inspection_id);
    }

    if (startDate) {
      query += ' AND ncp.created_at >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND ncp.created_at <= ?';
      queryParams.push(endDate);
    }

    // 直接拼接LIMIT（参数已验证）
    query += ` ORDER BY ncp.created_at DESC LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)}`;

    const [rows] = await db.pool.query(query, queryParams);
    const totalCount = rows.length > 0 ? parseInt(rows[0].total_count) : 0;

    return {
      items: rows,
      total: totalCount,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(totalCount / pageSize),
    };
  }

  /**
   * Get NCP by ID
   */
  static async getById(id) {
    const query = `
      SELECT ncp.*, 
        ROUND((ncp.quantity / NULLIF(qi.quantity, 0)) * 100, 2) as unqualified_rate
      FROM nonconforming_products ncp
      LEFT JOIN quality_inspections qi ON ncp.inspection_id = qi.id
      WHERE ncp.id = ?
    `;
    const [rows] = await db.pool.query(query, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get NCP by inspection ID
   */
  static async getByInspectionId(inspectionId) {
    const query =
      'SELECT * FROM nonconforming_products WHERE inspection_id = ? ORDER BY created_at DESC';
    const [rows] = await db.pool.query(query, [inspectionId]);
    return rows;
  }

  /**
   * Update NCP
   */
  static async update(id, updateData) {
    let connection;
    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const fields = [];
      const values = [];

      const allowedFields = [
        'defect_type',
        'defect_description',
        'severity',
        'disposition',
        'disposition_reason',
        'disposition_by',
        'disposition_date',
        'handled_quantity',
        'handling_cost',
        'status',
        'current_location',
        'isolation_area',
        'responsible_party',
        'responsible_person',
        'note',
        'updated_by',
      ];

      allowedFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          fields.push(`${field} = ?`);
          values.push(updateData[field]);
        }
      });

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      values.push(id);
      const query = `UPDATE nonconforming_products SET ${fields.join(', ')} WHERE id = ?`;
      await connection.query(query, values);

      await connection.commit();
      logger.info(`Updated nonconforming product: ${id}`);
      return true;
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error('Failed to update nonconforming product:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Update disposition
   */
  static async updateDisposition(id, dispositionData) {
    let connection;
    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const query = `
        UPDATE nonconforming_products
        SET disposition = ?, disposition_reason = ?, disposition_by = ?,
            disposition_date = ?, status = ?, updated_by = ?,
            responsible_party = COALESCE(?, responsible_party),
            supplier_id = COALESCE(?, supplier_id),
            supplier_name = COALESCE(?, supplier_name)
        WHERE id = ?
      `;

      await connection.query(query, [
        dispositionData.disposition,
        dispositionData.disposition_reason || null,
        dispositionData.disposition_by || null,
        dispositionData.disposition_date || new Date(),
        'processing',
        dispositionData.updated_by || null,
        dispositionData.responsible_party || null,
        dispositionData.supplier_id || null,
        dispositionData.supplier_name || null,
        id,
      ]);

      // Add action record
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
         VALUES (?, 'dispose', ?, ?)`,
        [
          id,
          `Disposition: ${dispositionData.disposition}`,
          dispositionData.disposition_by || 'system',
        ]
      );

      await connection.commit();
      logger.info(`Updated disposition for NCP: ${id}`);
      return true;
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error('Failed to update disposition:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Get action history
   */
  static async getActions(ncpId) {
    const query = `
      SELECT * FROM nonconforming_product_actions
      WHERE ncp_id = ?
      ORDER BY action_date DESC
    `;
    const [rows] = await db.pool.query(query, [ncpId]);
    return rows;
  }

  /**
   * Delete NCP
   */
  static async delete(id) {
    const query = 'DELETE FROM nonconforming_products WHERE id = ?';
    const [result] = await db.pool.query(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Get statistics
   */
  static async getStatistics(params = {}) {
    const { startDate, endDate } = params;
    let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_count,
        SUM(CASE WHEN disposition = 'return' THEN 1 ELSE 0 END) as return_count,
        SUM(CASE WHEN disposition = 'rework' THEN 1 ELSE 0 END) as rework_count,
        SUM(CASE WHEN disposition = 'scrap' THEN 1 ELSE 0 END) as scrap_count,
        SUM(quantity) as total_quantity,
        SUM(handling_cost) as total_cost
      FROM nonconforming_products
      WHERE 1=1
    `;
    const queryParams = [];

    if (startDate) {
      query += ' AND created_at >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND created_at <= ?';
      queryParams.push(endDate);
    }

    const [rows] = await db.pool.query(query, queryParams);
    return rows[0];
  }
}

module.exports = NonconformingProduct;
