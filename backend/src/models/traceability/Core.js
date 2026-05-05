/**
 * traceability/Core.js
 * @description 追溯管理核心CRUD模型
 * @date 2026-01-23
 * @version 1.0.0
 */

const logger = require('../../utils/logger');
const db = require('../../config/db');

class TraceabilityCore {
  /**
   * 获取追溯记录列表
   * @param {Object} filters - 过滤条件
   * @param {number} page - 页码
   * @param {number} pageSize - 每页记录数
   * @returns {Promise<Object>} - 包含records和total的对象
   */
  static async getTraceabilityRecords(filters = {}, page = 1, pageSize = 10) {
    let retries = 3; // 最多重试3次
    let lastError = null;

    while (retries > 0) {
      try {
        // 确保页码和每页记录数是数字类型
        const pageNum = parseInt(page, 10) || 1;
        const pageSizeNum = parseInt(pageSize, 10) || 10;
        const offset = (pageNum - 1) * pageSizeNum;

        let query = `
          SELECT 
            t.id, 
            t.product_code AS "productCode", 
            t.product_name AS "productName", 
            t.batch_number AS "batchNumber", 
            t.production_date AS "productionDate", 
            s.name AS supplier, 
            t.status,
            t.remarks,
            (SELECT COUNT(*) FROM traceability_process WHERE traceability_id = t.id) AS "processCount",
            (SELECT COUNT(*) FROM traceability_material WHERE traceability_id = t.id) AS "materialCount",
            (SELECT COUNT(*) FROM quality_inspections qi WHERE (qi.product_name = t.product_name OR qi.batch_no = t.batch_number OR qi.product_code = t.product_code)) AS "qualityCount"
          FROM 
            traceability t
          LEFT JOIN 
            suppliers s ON t.supplier_id = s.id
          WHERE 1=1
        `;

        const queryParams = [];

        // 应用过滤条件
        if (filters.productCode) {
          query += ' AND t.product_code LIKE ?';
          queryParams.push(`%${filters.productCode}%`);
        }

        if (filters.batchNumber) {
          query += ' AND t.batch_number LIKE ?';
          queryParams.push(`%${filters.batchNumber}%`);
        }

        if (filters.startDate) {
          query += ' AND t.production_date >= ?';
          queryParams.push(filters.startDate);
        }

        if (filters.endDate) {
          query += ' AND t.production_date <= ?';
          queryParams.push(filters.endDate);
        }

        if (filters.status) {
          query += ' AND t.status = ?';
          queryParams.push(filters.status);
        }

        // 获取总记录数
        const countQuery = `
          SELECT COUNT(*) as count FROM (${query}) AS count_query
        `;

        // 使用连接池直接获取连接
        const connection = await db.getClient();
        try {
          // 执行计数查询
          const countResult = await connection.query(countQuery, queryParams);
          const countRows = countResult.rows || [];
          const total = countRows.length > 0 ? parseInt(countRows[0].count || 0) : 0;

          // 添加排序和分页
          query += ` ORDER BY t.production_date DESC LIMIT ${pageSizeNum} OFFSET ${offset}`;

          // 执行数据查询
          const rowsResult = await connection.query(query, queryParams);
          const rows = rowsResult.rows || [];

          // 释放连接
          connection.release();

          return {
            records: rows,
            total,
          };
        } catch (error) {
          // 确保在错误情况下也释放连接
          connection.release();
          throw error;
        }
      } catch (error) {
        lastError = error;
        logger.error('获取追溯记录列表失败:', error);

        // 如果是连接丢失错误，尝试重试
        if (error.code === 'PROTOCOL_CONNECTION_LOST') {
          logger.info(`追溯记录查询连接丢失，剩余重试次数: ${retries - 1}`);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 等待1秒后重试
          retries--;
          continue; // 继续下一次循环尝试
        } else {
          // 其他错误直接抛出
          throw error;
        }
      }
    }

    // 如果重试后仍然失败，抛出最后一个错误
    if (lastError) {
      throw lastError;
    }

    throw new Error('获取追溯记录列表失败，原因未知');
  }

  /**
   * 根据ID获取追溯记录详情
   * @param {number} id - 追溯记录ID
   * @returns {Promise<Object>} - 追溯记录详情
   */
  static async getTraceabilityById(id) {
    try {
      const query = `
        SELECT 
          t.id, 
          t.product_code AS "productCode", 
          t.product_name AS "productName", 
          t.batch_number AS "batchNumber", 
          t.production_date AS "productionDate", 
          t.supplier_id AS "supplierId",
          s.name AS supplier, 
          t.status,
          t.remarks,
          t.created_at AS "createdAt",
          t.updated_at AS "updatedAt"
        FROM 
          traceability t
        LEFT JOIN 
          suppliers s ON t.supplier_id = s.id
        WHERE 
          t.id = ?
      `;

      const result = await db.query(query, [id]);
      const rows = result.rows || [];

      if (rows.length === 0) {
        return null;
      }

      return rows[0];
    } catch (error) {
      logger.error('获取追溯记录详情失败:', error);
      throw error;
    }
  }

  /**
   * 创建追溯记录
   * @param {Object} data - 追溯记录数据
   * @returns {Promise<Object>} - 创建的追溯记录
   */
  static async createTraceability(data) {
    try {
      const query = `
        INSERT INTO traceability(
          product_code, 
          product_name, 
          batch_number, 
          production_date, 
          supplier_id, 
          status, 
          remarks,
          created_at,
          updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      const values = [
        data.productCode,
        data.productName,
        data.batchNumber,
        data.productionDate,
        data.supplier,
        data.status || 'in_production',
        data.remarks || '',
      ];

      const result = await db.query(query, values);
      const insertId = result.rows && result.rows.insertId ? result.rows.insertId : 0;

      return this.getTraceabilityById(insertId);
    } catch (error) {
      logger.error('创建追溯记录失败:', error);
      throw error;
    }
  }

  /**
   * 更新追溯记录
   * @param {number} id - 追溯记录ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} - 更新后的追溯记录
   */
  static async updateTraceability(id, data) {
    try {
      // 首先检查记录是否存在
      const existing = await this.getTraceabilityById(id);
      if (!existing) {
        throw new Error('追溯记录不存在');
      }

      const query = `
        UPDATE traceability SET
          product_code = ?,
          product_name = ?,
          batch_number = ?,
          production_date = ?,
          supplier_id = ?,
          status = ?,
          remarks = ?,
          updated_at = NOW()
        WHERE id = ?
      `;

      const values = [
        data.productCode || existing.productCode,
        data.productName || existing.productName,
        data.batchNumber || existing.batchNumber,
        data.productionDate || existing.productionDate,
        data.supplier || existing.supplierId,
        data.status || existing.status,
        data.remarks || existing.remarks,
        id,
      ];

      await db.query(query, values);

      return this.getTraceabilityById(id);
    } catch (error) {
      logger.error('更新追溯记录失败:', error);
      throw error;
    }
  }

  /**
   * 删除追溯记录
   * @param {number} id - 追溯记录ID
   * @returns {Promise<boolean>} - 是否删除成功
   */
  static async deleteTraceability(id) {
    try {
      // 首先删除关联的工序记录
      await db.query('DELETE FROM traceability_process WHERE traceability_id = ?', [id]);

      // 删除关联的物料记录
      await db.query('DELETE FROM traceability_material WHERE traceability_id = ?', [id]);

      // 更新关联的质检记录，将traceability_id和traceability_batch字段设为NULL
      await db.query(
        'UPDATE quality_inspections SET traceability_id = NULL, traceability_batch = NULL WHERE traceability_id = ?',
        [id]
      );

      // 最后删除追溯记录
      const result = await db.query('DELETE FROM traceability WHERE id = ?', [id]);
      const affectedRows = result.rows && result.rows.affectedRows ? result.rows.affectedRows : 0;

      return affectedRows > 0;
    } catch (error) {
      logger.error('删除追溯记录失败:', error);
      throw error;
    }
  }

  /**
   * 获取工序记录
   * @param {number} traceabilityId - 追溯记录ID
   * @returns {Promise<Array>} - 工序记录列表
   */
  static async getProcessRecords(traceabilityId) {
    try {
      // 确保ID是数字
      const id = parseInt(traceabilityId, 10);

      const query = `
        SELECT 
          id,
          process_name AS "processName",
          operator,
          start_time AS "startTime",
          end_time AS "endTime",
          duration,
          status,
          remarks,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM 
          traceability_process
        WHERE 
          traceability_id = ${id}
        ORDER BY 
          id
      `;

      const result = await db.query(query, []);
      return result.rows || [];
    } catch (error) {
      logger.error('获取工序记录失败:', error);
      throw error;
    }
  }

  /**
   * 获取物料记录
   * @param {number} traceabilityId - 追溯记录ID
   * @returns {Promise<Array>} - 物料记录列表
   */
  static async getMaterialRecords(traceabilityId) {
    try {
      // 确保ID是数字
      const id = parseInt(traceabilityId, 10);

      const query = `
        SELECT 
          tm.id,
          tm.material_code AS "materialCode",
          tm.batch_number AS "batchNumber",
          tm.quantity,
          s.name AS "supplier",
          tm.usage_time AS "usageTime",
          tm.remarks,
          tm.created_at AS "createdAt",
          tm.updated_at AS "updatedAt"
        FROM 
          traceability_material tm
        LEFT JOIN
          suppliers s ON tm.supplier_id = s.id
        WHERE 
          tm.traceability_id = ${id}
        ORDER BY 
          tm.id
      `;

      const result = await db.query(query, []);

      return result.rows || [];
    } catch (error) {
      logger.error('获取物料记录失败:', error);
      throw error;
    }
  }

  /**
   * 获取质检记录
   * @param {number} traceabilityId - 追溯记录ID
   * @returns {Promise<Array>} - 质检记录列表
   */
  static async getQualityRecords(traceabilityId) {
    // 首先查找直接关联到此追溯记录的质检记录
    const directQuery = `
      SELECT 
        qi.id,
        qi.inspection_no,
        qi.inspection_type,
        qi.batch_no AS "batchNumber",
        qi.inspector_name AS "inspector",
        qi.actual_date AS "checkTime",
        qi.status AS "result",
        qi.note AS "remarks",
        qi.created_at AS "createdAt",
        qi.updated_at AS "updatedAt"
      FROM 
        quality_inspections qi
      WHERE 
        qi.traceability_id = ?
      ORDER BY 
        qi.actual_date DESC
    `;

    const directResult = await db.query(directQuery, [traceabilityId]);
    const directRecords = directResult.rows || [];

    // 如果找到直接关联的质检记录，则返回
    if (directRecords && directRecords.length > 0) {
      return directRecords;
    }

    // 如果没有直接关联的记录，则尝试通过产品代码和批次号查找
    const traceabilityQuery = `
      SELECT 
        id,
        product_code,
        product_name,
        batch_number
      FROM 
        traceability
      WHERE 
        id = ?
    `;

    const traceResult = await db.query(traceabilityQuery, [traceabilityId]);
    const traceData =
      traceResult.rows && traceResult.rows.length > 0 ? traceResult.rows[0] : null;

    if (!traceData) {
      return [];
    }

    // 使用产品名称、产品代码或批次号查询quality_inspections表
    const fallbackQuery = `
      SELECT 
        qi.id,
        qi.inspection_no,
        qi.inspection_type,
        qi.batch_no AS "batchNumber",
        qi.inspector_name AS "inspector",
        qi.actual_date AS "checkTime",
        qi.status AS "result",
        qi.note AS "remarks",
        qi.created_at AS "createdAt",
        qi.updated_at AS "updatedAt"
      FROM 
        quality_inspections qi
      WHERE 
        (qi.traceability_id IS NULL OR qi.traceability_id = ?)
        AND (
          qi.product_code = ?
          OR qi.batch_no = ?
          OR qi.product_name = ?
        )
      ORDER BY 
        qi.actual_date DESC
      LIMIT 1
    `;

    const fallbackResult = await db.query(fallbackQuery, [
      traceabilityId,
      traceData.product_code,
      traceData.batch_number,
      traceData.product_name,
    ]);

    return fallbackResult.rows || [];
  }
}

module.exports = TraceabilityCore;
