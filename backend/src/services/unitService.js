const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');

const unitService = {
  async getAllUnits(filters = {}, page = 1, pageSize = 10) {
    try {
      let query = 'SELECT * FROM units WHERE deleted_at IS NULL';
      const queryParams = [];

      // 添加过滤条件
      if (filters.unitName) {
        query += ' AND name LIKE ?';
        queryParams.push(`%${filters.unitName}%`);
      }
      if (filters.status !== undefined) {
        query += ' AND status = ?';
        queryParams.push(filters.status);
      }

      // 获取总数
      const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
      const [countResult] = await pool.query(countQuery, queryParams);
      const total = parseInt(countResult[0].total) || 0;

      // 添加排序和分页
      query += ' ORDER BY id ASC';
      const offset = (page - 1) * pageSize;
      query += ` LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)}`;

      const [data] = await pool.query(query, queryParams);

      return {
        data: data,
        total: total,
        page: page,
        pageSize: pageSize,
      };
    } catch (error) {
      logger.error('获取单位列表失败:', error);
      throw error;
    }
  },

  async getUnitById(id) {
    try {
      const [rows] = await pool.query('SELECT * FROM units WHERE id = ? AND deleted_at IS NULL', [id]);
      return rows[0] || null;
    } catch (error) {
      logger.error(`获取单位详情失败 (ID: ${id}):`, error);
      throw error;
    }
  },

  async createUnit(data) {
    try {
      const unitData = {
        name: data.name,
        code: data.code || null,
        status: data.status !== undefined ? data.status : 1,
        remark: data.remark || '',
      };

      const [result] = await pool.query(
        'INSERT INTO units (name, code, status, remark) VALUES (?, ?, ?, ?)',
        [unitData.name, unitData.code, unitData.status, unitData.remark]
      );

      return { id: result.insertId, ...unitData };
    } catch (error) {
      logger.error('创建单位失败:', error);
      throw error;
    }
  },

  async updateUnit(id, data) {
    try {
      // 检查单位是否存在
      const [existing] = await pool.query('SELECT * FROM units WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!existing || existing.length === 0) {
        throw new Error('单位不存在');
      }

      const updateData = {
        name: data.name,
        code: data.code,
        status: data.status,
        remark: data.remark,
      };

      const fields = [];
      const values = [];
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(updateData[key]);
        }
      });

      if (fields.length === 0) {
        return existing[0];
      }

      values.push(id);

      await pool.query(`UPDATE units SET ${fields.join(', ')} WHERE id = ?`, values);

      const [updated] = await pool.query('SELECT * FROM units WHERE id = ? AND deleted_at IS NULL', [id]);
      return updated[0];
    } catch (error) {
      logger.error('更新单位失败:', error);
      throw error;
    }
  },

  async deleteUnit(id) {
    try {
      // 检查是否有关联的物料
      const [materials] = await pool.query(
        'SELECT COUNT(*) as count FROM materials WHERE unit_id = ?',
        [id]
      );
      if (materials[0].count > 0) {
        throw new Error('该单位下有关联的物料，不能删除');
      }

      // ✅ 软删除替代硬删除
      await softDelete(pool, 'units', 'id', id);
      return true;
    } catch (error) {
      logger.error('删除单位失败:', error);
      throw error;
    }
  },

  // ========== 统一命名别名 - 保持向后兼容 ==========
  getAll(page = 1, pageSize = 10, filters = {}) {
    return this.getAllUnits(filters, page, pageSize);
  },
  getById(id) {
    return this.getUnitById(id);
  },
  create(data) {
    return this.createUnit(data);
  },
  update(id, data) {
    return this.updateUnit(id, data);
  },
  delete(id) {
    return this.deleteUnit(id);
  },
};

module.exports = unitService;
