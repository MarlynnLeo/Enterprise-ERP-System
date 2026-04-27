/**
 * locations.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');
const db = require('../config/db');

const Locations = {
  // 获取所有仓库列表
  getWarehouses: async () => {
    try {
      const query = `
        SELECT
          id,
          name,
          code,
          type
        FROM locations
        WHERE type = 'warehouse' OR type IS NULL
        ORDER BY name
      `;
      const [rows] = await db.pool.query(query);

      // 如果没有找到仓库，尝试不带type条件再查一次
      if (rows.length === 0) {
        const fallbackQuery = `
          SELECT
            id,
            name,
            code,
            type
          FROM locations
          ORDER BY name
        `;
        const [fallbackRows] = await db.pool.query(fallbackQuery);

        // 返回符合前端期望的格式
        return {
          data: fallbackRows,
          total: fallbackRows.length,
        };
      }

      // 返回符合前端期望的格式
      return {
        data: rows,
        total: rows.length,
      };
    } catch (error) {
      logger.error('获取仓库列表失败:', error);
      throw error;
    }
  },

  // 获取所有库位
  getAll: async (queryParams = {}, page = 1, pageSize = 10) => {
    try {
      // 确保页码和分页大小是数字
      const pageNum = Number(page);
      const pageSizeNum = Number(pageSize);
      const offset = (pageNum - 1) * pageSizeNum;

      // 处理查询参数

      // 构建查询条件
      const conditions = ['deleted_at IS NULL'];
      const params = [];

      // 处理查询参数
      if (queryParams.name) {
        conditions.push('name LIKE ?');
        params.push(`%${queryParams.name}%`);
      }

      if (queryParams.code) {
        conditions.push('code LIKE ?');
        params.push(`%${queryParams.code}%`);
      }

      if (queryParams.type) {
        conditions.push('type = ?');
        params.push(queryParams.type);
      }

      // 安全处理状态参数
      if (
        queryParams.status !== undefined &&
        queryParams.status !== null &&
        !isNaN(queryParams.status)
      ) {
        conditions.push('status = ?');
        params.push(Number(queryParams.status));
      }

      // 构建查询语句
      let query = 'SELECT * FROM locations WHERE ' + conditions.join(' AND ');
      // 使用参数化LIMIT，顺序: LIMIT offset, count
      query += ' ORDER BY id DESC LIMIT ?, ?';
      params.push(offset, pageSizeNum);

      // 执行查询
      const [rows] = await db.pool.query(query, params);

      // 构建计数查询
      let countQuery = 'SELECT COUNT(*) as total FROM locations WHERE ' + conditions.join(' AND ');

      // 移除分页参数
      const countParams = params.slice(0, -2);

      // 获取总数
      const [countResult] = await db.pool.query(countQuery, countParams);
      const total = countResult[0].total;

      return {
        items: rows,
        total,
      };
    } catch (error) {
      logger.error('Error in getAll locations:', error);
      throw error;
    }
  },

  // 获取单个库位
  getById: async (id) => {
    try {
      const [rows] = await db.pool.query('SELECT * FROM locations WHERE id = ? AND deleted_at IS NULL', [Number(id)]);
      return rows[0];
    } catch (error) {
      logger.error('Error in getById location:', error);
      throw error;
    }
  },

  // 创建库位
  create: async (locationData) => {
    try {
      // 验证必要字段
      const requiredFields = ['code', 'name'];
      const missingFields = requiredFields.filter((field) => !locationData[field]);

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // 检查code是否已存在
      const [existingCode] = await db.pool.query('SELECT id FROM locations WHERE code = ? AND deleted_at IS NULL', [
        locationData.code,
      ]);
      if (existingCode.length > 0) {
        throw new Error(`Location code '${locationData.code}' already exists`);
      }

      // 删除id字段，让数据库自动生成
      if (locationData.id === '' || locationData.id === undefined || locationData.id === null) {
        delete locationData.id;
      }

      // 过滤掉空字符串的字段，但保留数字0
      const filteredData = {};
      for (const [key, value] of Object.entries(locationData)) {
        // 保留数字0值，但过滤空字符串
        if (value !== '' || value === 0) {
          filteredData[key] = value;
        }
      }

      // 确保状态字段是数字类型
      if (filteredData.status !== undefined) {
        filteredData.status = Number(filteredData.status);
      }

      // 构建插入语句
      const fields = Object.keys(filteredData).join(', ');
      const placeholders = Object.keys(filteredData)
        .map(() => '?')
        .join(', ');
      const values = Object.values(filteredData);

      logger.info('即将插入数据:', filteredData);
      const query = `INSERT INTO locations (${fields}) VALUES (${placeholders})`;
      const [result] = await db.pool.query(query, values);
      return result.insertId;
    } catch (error) {
      logger.error('Error in create location:', error);
      throw error;
    }
  },

  // 更新库位
  update: async (id, locationData) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 验证必要字段
      const requiredFields = ['code', 'name'];
      const missingFields = requiredFields.filter((field) => !locationData[field]);

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // 获取原始库位数据
      const [oldLocation] = await connection.query('SELECT * FROM locations WHERE id = ? AND deleted_at IS NULL', [
        Number(id),
      ]);

      if (!oldLocation[0]) {
        throw new Error(`Location with id ${id} not found`);
      }

      // 确保状态字段是数字类型
      if (locationData.status !== undefined) {
        locationData.status = Number(locationData.status);
      }

      logger.info('更新库位数据:', locationData);

      // 移除可能存在的location_name字段 - 这不是locations表的字段
      if (locationData.location_name !== undefined) {
        delete locationData.location_name;
      }

      // 构建更新语句
      const setClause = Object.keys(locationData)
        .map((key) => `${key} = ?`)
        .join(', ');
      const values = [...Object.values(locationData), Number(id)];

      // 更新库位表
      const query = `UPDATE locations SET ${setClause} WHERE id = ?`;
      const [result] = await connection.query(query, values);

      // 如果库位名称发生变化，尝试更新关联表
      try {
        if (oldLocation[0] && locationData.name && oldLocation[0].name !== locationData.name) {
          // 这里我们不再尝试更新materials表中的location_name字段
          // 因为该字段可能不存在，导致错误
          logger.info('库位名称已更改，但不再尝试更新关联表');
        }
      } catch (err) {
        logger.warn('尝试更新关联表失败，但不影响主要操作:', err.message);
        // 不影响主操作，继续提交事务
      }

      await connection.commit();
      return result.affectedRows;
    } catch (error) {
      await connection.rollback();
      logger.error('Error in update location:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  // 删除库位
  delete: async (id) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 获取要删除的库位信息
      const [location] = await connection.query('SELECT * FROM locations WHERE id = ? AND deleted_at IS NULL', [
        Number(id),
      ]);

      if (location[0]) {
        // 尝试更新关联表中的库位引用
        try {
          // 这里我们不再尝试更新materials表中的location_name字段
          // 因为该字段可能不存在，导致错误
          logger.info('删除库位操作，但不再尝试更新关联表');
        } catch (err) {
          logger.warn('尝试更新关联表失败，但不影响主要操作:', err.message);
          // 不影响主操作，继续处理
        }
      }

      // 删除库位
      // ✅ 软删除替代硬删除
      const affected = await softDelete(connection, 'locations', 'id', Number(id));
      const result = { affectedRows: affected };

      await connection.commit();
      return result.affectedRows;
    } catch (error) {
      await connection.rollback();
      logger.error('Error in delete location:', error);
      throw error;
    } finally {
      connection.release();
    }
  },
};

module.exports = Locations;
