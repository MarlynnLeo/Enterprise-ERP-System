const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');

const materialSourceService = {
  /**
   * 获取所有物料来源
   */
  async getAllMaterialSources(filters = {}, page = 1, pageSize = 10) {
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

      if (filters.type && filters.type.trim() !== '') {
        conditions.push('type = ?');
        params.push(filters.type);
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

      let query = 'SELECT * FROM material_sources WHERE ' + conditions.join(' AND ');
      query += ' ORDER BY sort ASC, id DESC LIMIT ?, ?';

      params.push(offset, pageSizeNum);

      const [rows] = await pool.query(query, params);

      // 获取总数
      const countQuery = 'SELECT COUNT(*) as total FROM material_sources WHERE ' + conditions.join(' AND ');
      const [countResult] = await pool.query(countQuery, params.slice(0, -2));
      const total = countResult[0].total;

      return {
        items: rows,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
      };
    } catch (error) {
      logger.error('getAllMaterialSources error:', error);
      throw error;
    }
  },

  /**
   * 根据ID获取物料来源
   */
  async getMaterialSourceById(id) {
    try {
      const [rows] = await pool.query('SELECT * FROM material_sources WHERE id = ?', [id]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error('getMaterialSourceById error:', error);
      throw error;
    }
  },

  /**
   * 创建物料来源
   */
  async createMaterialSource(data) {
    try {
      const { name, code, type, sort, status, description } = data;
      const sql = `
                INSERT INTO material_sources (name, code, type, sort, status, description)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
      const [result] = await pool.query(sql, [
        name,
        code,
        type || 'external',
        sort || 0,
        status !== undefined ? status : 1,
        description || null,
      ]);
      return { id: result.insertId, ...data };
    } catch (error) {
      logger.error('createMaterialSource error:', error);
      throw error;
    }
  },

  /**
   * 更新物料来源
   */
  async updateMaterialSource(id, data) {
    try {
      const { name, code, type, sort, status, description } = data;
      const sql = `
                UPDATE material_sources
                SET name = ?, code = ?, type = ?, sort = ?, status = ?, description = ?
                WHERE id = ?
            `;
      await pool.query(sql, [name, code, type, sort, status, description, id]);
      return { id, ...data };
    } catch (error) {
      logger.error('updateMaterialSource error:', error);
      throw error;
    }
  },

  /**
   * 删除物料来源
   */
  async deleteMaterialSource(id) {
    try {
      // 检查是否有物料使用此来源
      const [materials] = await pool.query(
        'SELECT COUNT(*) as count FROM materials WHERE material_source_id = ?',
        [id]
      );
      if (materials[0].count > 0) {
        throw new Error('该物料来源正在被使用，不能删除');
      }

      // ✅ 软删除替代硬删除
      await softDelete(pool, 'material_sources', 'id', id);
      return true;
    } catch (error) {
      logger.error('deleteMaterialSource error:', error);
      throw error;
    }
  },

  /**
   * 获取统计信息
   */
  async getStatistics() {
    try {
      const [stats] = await pool.query(`
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as inactive,
                    SUM(CASE WHEN type = 'internal' THEN 1 ELSE 0 END) as internal,
                    SUM(CASE WHEN type = 'external' THEN 1 ELSE 0 END) as external
                FROM material_sources
            `);
      return stats[0];
    } catch (error) {
      logger.error('getMaterialSourceStatistics error:', error);
      throw error;
    }
  },

  // ========== 统一命名别名 - 保持向后兼容 ==========
  getAll(page = 1, pageSize = 10, filters = {}) {
    return this.getAllMaterialSources(filters, page, pageSize);
  },
  getById(id) {
    return this.getMaterialSourceById(id);
  },
  create(data) {
    return this.createMaterialSource(data);
  },
  update(id, data) {
    return this.updateMaterialSource(id, data);
  },
  delete(id) {
    return this.deleteMaterialSource(id);
  },
};

module.exports = materialSourceService;
