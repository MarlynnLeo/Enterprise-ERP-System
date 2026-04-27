/**
 * 基础服务类 - 提供通用的CRUD操作和业务逻辑
 */

const { getConnection } = require('../config/db');
const { validateData, cleanData } = require('../utils/validator');

class BaseService {
  /**
   * @param {string} tableName
   * @param {string} primaryKey
   * @param {Object} [options]
   * @param {boolean} [options.softDelete=true] - 是否启用软删除
   */
  constructor(tableName, primaryKey = 'id', options = {}) {
    this.tableName = tableName;
    this.primaryKey = primaryKey;
    this.softDelete = options.softDelete !== false; // 默认启用
  }

  /**
   * 软删除过滤条件（内部使用）
   */
  _softDeleteFilter() {
    return this.softDelete ? `${this.tableName}.deleted_at IS NULL` : null;
  }

  /**
   * 获取数据库连接
   */
  async getConnection() {
    return await getConnection();
  }

  /**
   * 构建WHERE子句
   */
  buildWhereClause(conditions = {}, params = []) {
    const cleanConditions = cleanData(conditions);
    const whereConditions = [];

    Object.keys(cleanConditions).forEach((key) => {
      const value = cleanConditions[key];
      if (value !== null && value !== undefined && value !== '') {
        if (typeof value === 'string' && value.includes('%')) {
          whereConditions.push(`${key} LIKE ?`);
        } else {
          whereConditions.push(`${key} = ?`);
        }
        params.push(value);
      }
    });

    return whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  }

  /**
   * 构建ORDER BY子句
   */
  buildOrderClause(sort = null, order = 'ASC') {
    if (!sort) return `ORDER BY ${this.primaryKey} DESC`;

    // 安全校验：排序字段只允许合法的列名字符（字母、数字、下划线、点号）
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(sort)) {
      return `ORDER BY ${this.primaryKey} DESC`;
    }

    const direction = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    return `ORDER BY ${sort} ${direction}`;
  }

  /**
   * 构建LIMIT子句
   */
  buildLimitClause(page = 1, pageSize = 10) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safePageSize = Math.max(1, Math.min(10000, parseInt(pageSize, 10) || 10));
    const offset = (safePage - 1) * safePageSize;
    return `LIMIT ${safePageSize} OFFSET ${offset}`;
  }

  /**
   * 查询列表数据
   */
  async findList(options = {}) {
    const {
      conditions = {},
      fields = '*',
      sort = null,
      order = 'ASC',
      page = 1,
      pageSize = 10,
      includePagination = true,
    } = options;

    const connection = await this.getConnection();
    const params = [];

    try {
      // 构建查询语句
      let whereClause = this.buildWhereClause(conditions, params);
      const orderClause = this.buildOrderClause(sort, order);

      // ✅ 软删除: 自动过滤已删除记录
      const sdFilter = this._softDeleteFilter();
      if (sdFilter) {
        whereClause = whereClause
          ? `${whereClause} AND ${sdFilter}`
          : `WHERE ${sdFilter}`;
      }

      let sql = `SELECT ${fields} FROM ${this.tableName} ${whereClause} ${orderClause}`;

      if (includePagination) {
        const limitClause = this.buildLimitClause(page, pageSize);
        sql += ` ${limitClause}`;
      }

      // 执行查询
      const [rows] = await connection.execute(sql, params);

      // 如果需要分页，获取总数
      let total = 0;
      if (includePagination) {
        const countSql = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
        // ✅ 修复: LIMIT/OFFSET 是直接拼入 SQL 的，不在 params 中
        // 所以 COUNT 查询应使用完整的 params，不需要 slice
        const [countResult] = await connection.execute(
          countSql,
          params
        );
        total = countResult[0].total;
      }

      return {
        items: rows,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: includePagination ? Math.ceil(total / pageSize) : 1,
      };
    } finally {
      connection.release();
    }
  }

  /**
   * 根据ID查询单条数据
   */
  async findById(id, fields = '*') {
    const connection = await this.getConnection();

    try {
      const sdFilter = this._softDeleteFilter();
      const sdClause = sdFilter ? ` AND ${sdFilter}` : '';
      const sql = `SELECT ${fields} FROM ${this.tableName} WHERE ${this.primaryKey} = ?${sdClause}`;
      const [rows] = await connection.execute(sql, [id]);

      return rows.length > 0 ? rows[0] : null;
    } finally {
      connection.release();
    }
  }

  /**
   * 根据条件查询单条数据
   */
  async findOne(conditions = {}, fields = '*') {
    const connection = await this.getConnection();
    const params = [];

    try {
      let whereClause = this.buildWhereClause(conditions, params);
      const sdFilter = this._softDeleteFilter();
      if (sdFilter) {
        whereClause = whereClause
          ? `${whereClause} AND ${sdFilter}`
          : `WHERE ${sdFilter}`;
      }
      const sql = `SELECT ${fields} FROM ${this.tableName} ${whereClause} LIMIT 1`;

      const [rows] = await connection.execute(sql, params);
      return rows.length > 0 ? rows[0] : null;
    } finally {
      connection.release();
    }
  }

  /**
   * 创建数据
   */
  async create(data, validationRules = null) {
    // 数据验证
    if (validationRules) {
      const validator = validateData(data, validationRules);
      if (validator.hasErrors()) {
        throw new Error(`数据验证失败: ${validator.getFirstError().message}`);
      }
    }

    const cleanedData = cleanData(data);
    const connection = await this.getConnection();

    try {
      await connection.beginTransaction();

      const fields = Object.keys(cleanedData);
      const placeholders = fields.map(() => '?').join(', ');
      const values = Object.values(cleanedData);

      const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
      const [result] = await connection.execute(sql, values);

      await connection.commit();

      return {
        [this.primaryKey]: result.insertId,
        ...cleanedData,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 更新数据
   */
  async update(id, data, validationRules = null) {
    // 数据验证
    if (validationRules) {
      const validator = validateData(data, validationRules);
      if (validator.hasErrors()) {
        throw new Error(`数据验证失败: ${validator.getFirstError().message}`);
      }
    }

    const cleanedData = cleanData(data);
    const connection = await this.getConnection();

    try {
      await connection.beginTransaction();

      // 检查记录是否存在
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error('记录不存在');
      }

      const fields = Object.keys(cleanedData);
      const setClause = fields.map((field) => `${field} = ?`).join(', ');
      const values = [...Object.values(cleanedData), id];

      const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${this.primaryKey} = ?`;
      await connection.execute(sql, values);

      await connection.commit();

      return {
        [this.primaryKey]: id,
        ...existing,
        ...cleanedData,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 删除数据
   */
  async delete(id) {
    const connection = await this.getConnection();

    try {
      await connection.beginTransaction();

      // 检查记录是否存在
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error('记录不存在');
      }

      // ✅ 软删除: UPDATE SET deleted_at 替代 DELETE FROM
      if (this.softDelete) {
        const sql = `UPDATE ${this.tableName} SET deleted_at = NOW() WHERE ${this.primaryKey} = ? AND deleted_at IS NULL`;
        await connection.execute(sql, [id]);
      } else {
        const sql = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
        await connection.execute(sql, [id]);
      }

      await connection.commit();
      return existing;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 批量删除
   */
  async batchDelete(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('ID列表不能为空');
    }

    const connection = await this.getConnection();

    try {
      await connection.beginTransaction();

      const placeholders = ids.map(() => '?').join(', ');
      // ✅ 软删除: UPDATE SET deleted_at 替代 DELETE FROM
      if (this.softDelete) {
        const sql = `UPDATE ${this.tableName} SET deleted_at = NOW() WHERE ${this.primaryKey} IN (${placeholders}) AND deleted_at IS NULL`;
        const [result] = await connection.execute(sql, ids);
        await connection.commit();
        return { deletedCount: result.affectedRows };
      } else {
        const sql = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} IN (${placeholders})`;
        const [result] = await connection.execute(sql, ids);
        await connection.commit();
        return { deletedCount: result.affectedRows };
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 统计数据
   */
  async count(conditions = {}) {
    const connection = await this.getConnection();
    const params = [];

    try {
      let whereClause = this.buildWhereClause(conditions, params);
      const sdFilter = this._softDeleteFilter();
      if (sdFilter) {
        whereClause = whereClause
          ? `${whereClause} AND ${sdFilter}`
          : `WHERE ${sdFilter}`;
      }
      const sql = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;

      const [rows] = await connection.execute(sql, params);
      return rows[0].total;
    } finally {
      connection.release();
    }
  }

  /**
   * 检查记录是否存在
   */
  async exists(conditions = {}) {
    const count = await this.count(conditions);
    return count > 0;
  }

  /**
   * 执行自定义SQL查询
   */
  async executeQuery(sql, params = []) {
    const connection = await this.getConnection();

    try {
      const [rows] = await connection.execute(sql, params);
      return rows;
    } finally {
      connection.release();
    }
  }

  /**
   * 执行事务
   */
  async executeTransaction(callback) {
    const connection = await this.getConnection();

    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = BaseService;
