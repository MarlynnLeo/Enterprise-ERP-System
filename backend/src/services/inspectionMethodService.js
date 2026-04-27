const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');

const inspectionMethodService = {
  /**
   * 获取所有检验方式
   */
  async getAllInspectionMethods(filters = {}, page = 1, pageSize = 10) {
    try {
      const pageNum = Number(page);
      const pageSizeNum = Number(pageSize);
      const offset = (pageNum - 1) * pageSizeNum;

      const conditions = ['deleted_at IS NULL'];
      const params = [];

      if (filters.name && filters.name.trim() !== '') {
        conditions.push('name LIKE ?');
        params.push(`%${filters.name}%`);
      }

      if (filters.code && filters.code.trim() !== '') {
        conditions.push('code LIKE ?');
        params.push(`%${filters.code}%`);
      }

      if (
        filters.status !== undefined &&
        filters.status !== null &&
        filters.status !== '' &&
        !isNaN(filters.status)
      ) {
        conditions.push('status = ?');
        params.push(Number(filters.status));
      }

      let query = 'SELECT * FROM inspection_methods WHERE ' + conditions.join(' AND ');
      query += ' ORDER BY sort ASC, id DESC LIMIT ?, ?';

      params.push(offset, pageSizeNum);

      const [rows] = await pool.query(query, params);

      // 获取总数
      let countQuery = 'SELECT COUNT(*) as total FROM inspection_methods WHERE ' + conditions.join(' AND ');
      const [countResult] = await pool.query(countQuery, params.slice(0, -2));
      const total = countResult[0].total;

      return {
        items: rows,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
      };
    } catch (error) {
      logger.error('getAllInspectionMethods error:', error);
      throw error;
    }
  },

  /**
   * 根据ID获取检验方式
   */
  async getInspectionMethodById(id) {
    try {
      const [rows] = await pool.query('SELECT * FROM inspection_methods WHERE id = ?', [id]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error('getInspectionMethodById error:', error);
      throw error;
    }
  },

  /**
   * 创建检验方式
   */
  async createInspectionMethod(data) {
    try {
      const { name, code, sort, status, description } = data;
      const sql = `
                INSERT INTO inspection_methods (name, code, sort, status, description)
                VALUES (?, ?, ?, ?, ?)
            `;
      const [result] = await pool.query(sql, [
        name,
        code,
        sort || 0,
        status !== undefined ? status : 1,
        description || null,
      ]);
      return { id: result.insertId, ...data };
    } catch (error) {
      logger.error('createInspectionMethod error:', error);
      throw error;
    }
  },

  /**
   * 更新检验方式
   */
  async updateInspectionMethod(id, data) {
    try {
      const { name, code, sort, status, description } = data;
      const sql = `
                UPDATE inspection_methods
                SET name = ?, code = ?, sort = ?, status = ?, description = ?
                WHERE id = ?
            `;
      await pool.query(sql, [name, code, sort, status, description, id]);
      return { id, ...data };
    } catch (error) {
      logger.error('updateInspectionMethod error:', error);
      throw error;
    }
  },

  /**
   * 删除检验方式
   */
  async deleteInspectionMethod(id) {
    try {
      // 检查是否有物料使用此检验方式
      const [materials] = await pool.query(
        'SELECT COUNT(*) as count FROM materials WHERE inspection_method_id = ?',
        [id]
      );
      if (materials[0].count > 0) {
        throw new Error('该检验方式已被物料绑定，不能删除');
      }

      // ✅ 软删除替代硬删除
      await softDelete(pool, 'inspection_methods', 'id', id);
      return true;
    } catch (error) {
      logger.error('deleteInspectionMethod error:', error);
      throw error;
    }
  },

  // ========== 统一命名别名 - 保持向后兼容 ==========
  getAll(page = 1, pageSize = 10, filters = {}) {
    return this.getAllInspectionMethods(filters, page, pageSize);
  },
  getById(id) {
    return this.getInspectionMethodById(id);
  },
  create(data) {
    return this.createInspectionMethod(data);
  },
  update(id, data) {
    return this.updateInspectionMethod(id, data);
  },
  delete(id) {
    return this.deleteInspectionMethod(id);
  },
};

module.exports = inspectionMethodService;
