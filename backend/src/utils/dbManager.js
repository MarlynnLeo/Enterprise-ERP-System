/**
 * 数据库连接管理器
 * 统一管理数据库连接和事务处理
 */

const logger = require('./logger');
const db = require('../config/db');

class DBManager {
  /**
   * 获取数据库连接
   * @returns {Promise<Connection>} 数据库连接
   */
  static async getConnection() {
    try {
      return await db.pool.getConnection();
    } catch (error) {
      logger.error('获取数据库连接失败:', error);
    throw new Error('数据库连接失败', { cause: error });
    }
  }

  /**
   * 执行事务
   * @param {Function} callback - 事务回调函数，接收connection参数
   * @returns {Promise<any>} 事务执行结果
   */
  static async executeTransaction(callback) {
    const connection = await this.getConnection();

    try {
      await connection.beginTransaction();
      logger.debug('🔄 开始数据库事务');

      const result = await callback(connection);

      await connection.commit();
      logger.debug('✅ 数据库事务提交成功');

      return result;
    } catch (error) {
      await connection.rollback();
      logger.error('❌ 数据库事务回滚:', error.message);
      throw error;
    } finally {
      connection.release();
      logger.debug('🔗 数据库连接已释放');
    }
  }

  /**
   * 执行查询（自动管理连接）
   * @param {string} sql - SQL语句
   * @param {Array} params - 参数数组
   * @returns {Promise<Array>} 查询结果
   */
  static async query(sql, params = []) {
    const connection = await this.getConnection();

    try {
      const [rows] = await connection.query(sql, params);
      return rows;
    } catch (error) {
      logger.error('数据库查询失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 执行插入操作（自动管理连接）
   * @param {string} table - 表名
   * @param {Object} data - 插入数据
   * @returns {Promise<Object>} 插入结果 {insertId, affectedRows}
   */
  static async insert(table, data) {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = fields.map(() => '?').join(', ');

    const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;

    const connection = await this.getConnection();

    try {
      const [result] = await connection.query(sql, values);
      return {
        insertId: result.insertId,
        affectedRows: result.affectedRows,
      };
    } catch (error) {
      logger.error(`插入数据到表 ${table} 失败:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 执行更新操作（自动管理连接）
   * @param {string} table - 表名
   * @param {Object} data - 更新数据
   * @param {Object} where - 条件
   * @returns {Promise<number>} 影响的行数
   */
  static async update(table, data, where) {
    const setFields = Object.keys(data)
      .map((field) => `${field} = ?`)
      .join(', ');
    const whereFields = Object.keys(where)
      .map((field) => `${field} = ?`)
      .join(' AND ');

    const sql = `UPDATE ${table} SET ${setFields} WHERE ${whereFields}`;
    const params = [...Object.values(data), ...Object.values(where)];

    const connection = await this.getConnection();

    try {
      const [result] = await connection.query(sql, params);
      return result.affectedRows;
    } catch (error) {
      logger.error(`更新表 ${table} 失败:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 执行删除操作（自动管理连接）
   * @param {string} table - 表名
   * @param {Object} where - 条件
   * @returns {Promise<number>} 影响的行数
   */
  static async delete(table, where) {
    const whereFields = Object.keys(where)
      .map((field) => `${field} = ?`)
      .join(' AND ');
    const sql = `DELETE FROM ${table} WHERE ${whereFields}`;
    const params = Object.values(where);

    const connection = await this.getConnection();

    try {
      const [result] = await connection.query(sql, params);
      return result.affectedRows;
    } catch (error) {
      logger.error(`删除表 ${table} 数据失败:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 批量插入操作
   * @param {string} table - 表名
   * @param {Array<Object>} dataArray - 数据数组
   * @returns {Promise<Object>} 插入结果
   */
  static async batchInsert(table, dataArray) {
    if (!dataArray || dataArray.length === 0) {
      return { insertId: 0, affectedRows: 0 };
    }

    const fields = Object.keys(dataArray[0]);
    const placeholders = fields.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;

    return await this.executeTransaction(async (connection) => {
      let totalAffectedRows = 0;
      let firstInsertId = 0;

      for (let i = 0; i < dataArray.length; i++) {
        const values = fields.map((field) => dataArray[i][field]);
        const [result] = await connection.query(sql, values);

        if (i === 0) {
          firstInsertId = result.insertId;
        }
        totalAffectedRows += result.affectedRows;
      }

      return {
        insertId: firstInsertId,
        affectedRows: totalAffectedRows,
      };
    });
  }

  /**
   * 检查表是否存在
   * @param {string} tableName - 表名
   * @returns {Promise<boolean>} 是否存在
   */
  static async tableExists(tableName) {
    const sql = `
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = ?
    `;

    try {
      const rows = await this.query(sql, [tableName]);
      return rows[0].count > 0;
    } catch (error) {
      logger.error(`检查表 ${tableName} 是否存在失败:`, error);
      return false;
    }
  }

  /**
   * 检查字段是否存在
   * @param {string} tableName - 表名
   * @param {string} columnName - 字段名
   * @returns {Promise<boolean>} 是否存在
   */
  static async columnExists(tableName, columnName) {
    const sql = `
      SELECT COUNT(*) as count 
      FROM information_schema.columns 
      WHERE table_schema = DATABASE() 
      AND table_name = ? 
      AND column_name = ?
    `;

    try {
      const rows = await this.query(sql, [tableName, columnName]);
      return rows[0].count > 0;
    } catch (error) {
      logger.error(`检查字段 ${tableName}.${columnName} 是否存在失败:`, error);
      return false;
    }
  }

  /**
   * 获取连接池状态
   * @returns {Object} 连接池状态信息
   */
  static getPoolStatus() {
    return {
      totalConnections: db.pool.pool._allConnections.length,
      freeConnections: db.pool.pool._freeConnections.length,
      usedConnections: db.pool.pool._allConnections.length - db.pool.pool._freeConnections.length,
      acquiringConnections: db.pool.pool._acquiringConnections.length,
    };
  }

  /**
   * 格式化日期为MySQL日期格式
   * @param {Date|string} date - 日期
   * @returns {string|null} MySQL日期格式字符串
   */
  static formatDateToMySQL(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }

  /**
   * 格式化日期时间为MySQL格式
   * @param {Date|string} datetime - 日期时间
   * @returns {string|null} MySQL日期时间格式字符串
   */
  static formatDateTimeToMySQL(datetime) {
    if (!datetime) return null;
    const d = new Date(datetime);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
}

module.exports = DBManager;
