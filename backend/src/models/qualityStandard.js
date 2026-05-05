/**
 * qualityStandard.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const db = require('../config/db');

/**
 * 质量标准模型
 */
class QualityStandard {
  /**
   * 获取质量标准列表
   * @param {object} filters 筛选条件
   * @param {number} page 页码
   * @param {number} pageSize 每页条数
   * @returns {Promise<{rows: Array, total: number}>} 标准列表和总数
   */
  static async getStandards(filters = {}, page = 1, pageSize = 20) {
    let query = `
      SELECT qs.*,
        COUNT(qsi.id) as item_count,
        CASE
          WHEN qs.target_type = 'material' THEN m.name
          WHEN qs.target_type = 'product' THEN prod_m.name
          ELSE pr.name
        END as target_name
      FROM quality_standards qs
      LEFT JOIN quality_standard_items qsi ON qs.id = qsi.standard_id
      LEFT JOIN materials m ON qs.target_type = 'material' AND qs.target_id = m.id
      LEFT JOIN materials prod_m ON qs.target_type = 'product' AND qs.target_id = prod_m.id
      LEFT JOIN production_processes pr ON qs.target_type = 'process' AND qs.target_id = pr.id
      WHERE 1=1
    `;

    const queryParams = [];

    // 添加筛选条件
    if (filters.targetType) {
      query += ' AND qs.target_type = ?';
      queryParams.push(filters.targetType);
    }

    if (filters.standardType) {
      query += ' AND qs.standard_type = ?';
      queryParams.push(filters.standardType);
    }

    if (filters.keyword) {
      query += ` AND (qs.standard_no LIKE ? OR qs.standard_name LIKE ? OR
                CASE
                  WHEN qs.target_type = 'material' THEN m.name
                  WHEN qs.target_type = 'product' THEN prod_m.name
                  ELSE pr.name
                END LIKE ?)`;
      const keyword = `%${filters.keyword}%`;
      queryParams.push(keyword, keyword, keyword);
    }

    if (filters.isActive !== undefined) {
      query += ' AND qs.is_active = ?';
      queryParams.push(filters.isActive);
    }

    query += ' GROUP BY qs.id';

    // 获取总数
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as countTable`;
    const [countRows] = await db.query(countQuery, queryParams);
    const total = countRows[0].total;

    // 添加分页（直接拼接，已验证）
    const offset = (page - 1) * pageSize;
    query += ` ORDER BY qs.created_at DESC LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)}`;

    const [rows] = await db.query(query, queryParams);

    return {
      rows,
      total,
    };
  }

  /**
   * 根据ID获取标准详情
   * @param {number} id 标准ID
   * @returns {Promise<object>} 标准详情
   */
  static async getStandardById(id) {
    const query = `
      SELECT qs.*,
        CASE
          WHEN qs.target_type = 'material' THEN m.name
          WHEN qs.target_type = 'product' THEN prod_m.name
          ELSE pr.name
        END as target_name
      FROM quality_standards qs
      LEFT JOIN materials m ON qs.target_type = 'material' AND qs.target_id = m.id
      LEFT JOIN materials prod_m ON qs.target_type = 'product' AND qs.target_id = prod_m.id
      LEFT JOIN production_processes pr ON qs.target_type = 'process' AND qs.target_id = pr.id
      WHERE qs.id = ?
    `;

    const [rows] = await db.query(query, [id]);
    if (rows.length === 0) {
      return null;
    }

    // 获取标准项
    const itemsQuery = `
      SELECT * FROM quality_standard_items 
      WHERE standard_id = ? 
      ORDER BY sequence
    `;
    const [items] = await db.query(itemsQuery, [id]);

    return {
      ...rows[0],
      items,
    };
  }

  /**
   * 创建质量标准
   * @param {object} standard 标准数据
   * @returns {Promise<object>} 创建结果
   */
  static async createStandard(standard) {
    // 开始事务
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // 插入标准主表
      const { items, ...mainData } = standard;
      const [result] = await connection.query('INSERT INTO quality_standards SET ?', mainData);

      const standardId = result.insertId;

      // 如果有标准项，批量插入
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          await connection.query('INSERT INTO quality_standard_items SET ?', {
            ...items[i],
            standard_id: standardId,
            sequence: i + 1,
          });
        }
      }

      await connection.commit();

      return {
        id: standardId,
        standard_no: standard.standard_no,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 更新质量标准
   * @param {number} id 标准ID
   * @param {object} data 更新数据
   * @returns {Promise<boolean>} 更新结果
   */
  static async updateStandard(id, data) {
    // 开始事务
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // 更新主表
      const { items, ...mainData } = data;
      if (Object.keys(mainData).length > 0) {
        await connection.query('UPDATE quality_standards SET ? WHERE id = ?', [mainData, id]);
      }

      // 如果有标准项，先删除所有旧项，再重新插入
      if (items && items.length > 0) {
        await connection.query('DELETE FROM quality_standard_items WHERE standard_id = ?', [id]);

        for (let i = 0; i < items.length; i++) {
          await connection.query('INSERT INTO quality_standard_items SET ?', {
            ...items[i],
            standard_id: id,
            sequence: i + 1,
          });
        }
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 删除质量标准
   * @param {number} id 标准ID
   * @returns {Promise<boolean>} 删除结果
   */
  static async deleteStandard(id) {
    const [result] = await db.query('DELETE FROM quality_standards WHERE id = ?', [id]);

    return result.affectedRows > 0;
  }

  /**
   * 获取目标选项（物料/产品/工序）
   * @param {string} targetType 目标类型
   * @returns {Promise<Array>} 目标选项
   */
  static async getTargetOptions(targetType) {
    let query;

    switch (targetType) {
      case 'material':
        query = `
          SELECT id, name, code, unit 
          FROM materials 
          ORDER BY name
        `;
        break;
      case 'product':
        query = `
          SELECT id, name, code, specs as unit
          FROM materials
          ORDER BY name
        `;
        break;
      case 'process':
        query = `
          SELECT id, process_name as name, id as code
          FROM production_processes
          ORDER BY process_name
        `;
        break;
      default:
        return [];
    }

    const [rows] = await db.query(query);
    return rows;
  }
}

module.exports = QualityStandard;
