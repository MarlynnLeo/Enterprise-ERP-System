const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');

const locationService = {
  async getWarehouses() {
    try {
      const query = `
        SELECT
          id,
          name,
          code,
          type
        FROM locations
        WHERE (type = 'warehouse' OR type IS NULL) AND deleted_at IS NULL
        ORDER BY name
      `;
      const [rows] = await pool.query(query);

      // 如果没有找到仓库，尝试不带type条件再查一次
      if (rows.length === 0) {
        const fallbackQuery = `
          SELECT
            id,
            name,
            code,
            type
          FROM locations
          WHERE deleted_at IS NULL
          ORDER BY name
        `;
        const [fallbackRows] = await pool.query(fallbackQuery);

        return {
          data: fallbackRows,
          total: fallbackRows.length,
        };
      }

      return {
        data: rows,
        total: rows.length,
      };
    } catch (error) {
      logger.error('获取仓库列表失败:', error);
      throw error;
    }
  },

  async getAllLocations(filters = {}, page = 1, pageSize = 10) {
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

      let query = 'SELECT * FROM locations WHERE ' + conditions.join(' AND ');
      query += ' ORDER BY id DESC LIMIT ?, ?';

      params.push(offset, pageSizeNum);

      const [rows] = await pool.query(query, params);

      const countQuery = 'SELECT COUNT(*) as total FROM locations WHERE ' + conditions.join(' AND ');

      const countParams = params.slice(0, -2);
      const [countResult] = await pool.query(countQuery, countParams);
      const total = countResult[0].total;

      return {
        items: rows,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
      };
    } catch (error) {
      logger.error('获取库位列表失败:', error);
      throw error;
    }
  },

  async getLocationById(id) {
    try {
      const [rows] = await pool.query('SELECT * FROM locations WHERE id = ? AND deleted_at IS NULL', [Number(id)]);
      return rows[0];
    } catch (error) {
      logger.error(`获取库位详情失败 (ID: ${id}):`, error);
      throw error;
    }
  },

  async createLocation(data) {
    try {
      const requiredFields = ['code', 'name'];
      const missingFields = requiredFields.filter((field) => !data[field]);

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      const [existingCode] = await pool.query('SELECT id FROM locations WHERE code = ? AND deleted_at IS NULL', [
        data.code,
      ]);
      if (existingCode.length > 0) {
        throw new Error(`Location code '${data.code}' already exists`);
      }

      const locationData = { ...data };
      if (locationData.id === '' || locationData.id === undefined || locationData.id === null) {
        delete locationData.id;
      }

      const filteredData = {};
      for (const [key, value] of Object.entries(locationData)) {
        if (value !== '' || value === 0) {
          filteredData[key] = value;
        }
      }

      if (filteredData.status !== undefined) {
        filteredData.status = Number(filteredData.status);
      }

      const fields = Object.keys(filteredData).join(', ');
      const placeholders = Object.keys(filteredData)
        .map(() => '?')
        .join(', ');
      const values = Object.values(filteredData);

      const query = `INSERT INTO locations (${fields}) VALUES (${placeholders})`;
      const [result] = await pool.query(query, values);
      return result.insertId;
    } catch (error) {
      logger.error('创建库位失败:', error);
      throw error;
    }
  },

  async updateLocation(id, data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 检查库位是否存在
      const [oldLocation] = await connection.query('SELECT * FROM locations WHERE id = ?', [
        Number(id),
      ]);

      if (!oldLocation[0]) {
        throw new Error(`Location with id ${id} not found`);
      }

      // 只在更新完整信息时才验证必填字段，更新状态时不需要
      const isStatusOnlyUpdate = Object.keys(data).length === 1 && data.status !== undefined;

      if (!isStatusOnlyUpdate) {
        const requiredFields = ['code', 'name'];
        const missingFields = requiredFields.filter((field) => !data[field]);

        if (missingFields.length > 0) {
          throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }
      }

      const locationData = { ...data };
      if (locationData.status !== undefined) {
        locationData.status = Number(locationData.status);
      }

      if (locationData.location_name !== undefined) {
        delete locationData.location_name;
      }

      const setClause = Object.keys(locationData)
        .map((key) => `${key} = ?`)
        .join(', ');
      const values = [...Object.values(locationData), Number(id)];

      const query = `UPDATE locations SET ${setClause} WHERE id = ?`;
      const [result] = await connection.query(query, values);

      await connection.commit();
      return result.affectedRows;
    } catch (error) {
      await connection.rollback();
      logger.error('更新库位失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  async deleteLocation(id) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 检查是否有关联的物料
      const [materials] = await connection.query(
        'SELECT COUNT(*) as count FROM materials WHERE location_id = ?',
        [Number(id)]
      );
      if (materials[0].count > 0) {
        throw new Error('该库位下有关联的物料，不能删除');
      }

      // ✅ 软删除替代硬删除
      const affected = await softDelete(connection, 'locations', 'id', Number(id));
      const result = { affectedRows: affected };

      await connection.commit();
      return result.affectedRows;
    } catch (error) {
      await connection.rollback();
      logger.error('删除库位失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========== 统一命名别名 - 保持向后兼容 ==========
  getAll(page = 1, pageSize = 10, filters = {}) {
    return this.getAllLocations(filters, page, pageSize);
  },
  getById(id) {
    return this.getLocationById(id);
  },
  create(data) {
    return this.createLocation(data);
  },
  update(id, data) {
    return this.updateLocation(id, data);
  },
  delete(id) {
    return this.deleteLocation(id);
  },
};

module.exports = locationService;
