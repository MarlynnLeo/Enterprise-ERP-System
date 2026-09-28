const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const { appendPaginationSQL } = require('../../utils/safePagination');
const {
  validationError,
  validateAqlRule,
  isValidAqlLevel,
} = require('../../utils/quality/aqlValidation');

class AqlStandard {
  // Serialize rule changes, including inserts into a previously empty AQL range.
  // A check outside this transaction allows concurrent requests to create overlaps.
  static async withRuleWrite(callback) {
    const connection = await pool.getConnection();
    let locked = false;
    let begun = false;
    let reusable = true;
    try {
      const [[lock]] = await connection.query(
        "SELECT GET_LOCK(SHA2(CONCAT(DATABASE(), ':aql-standards'), 256), 10) AS acquired"
      );
      locked = Number(lock.acquired) === 1;
      if (!locked) throw validationError('抽样规则正在更新，请稍后重试', 'AQL_RULE_BUSY', 409);
      await connection.beginTransaction();
      begun = true;
      const result = await callback(connection);
      await connection.commit();
      begun = false;
      return result;
    } catch (error) {
      if (begun) await connection.rollback();
      throw error;
    } finally {
      if (locked) {
        try {
          await connection.query(
            "SELECT RELEASE_LOCK(SHA2(CONCAT(DATABASE(), ':aql-standards'), 256))"
          );
        } catch (error) {
          reusable = false;
          connection.destroy();
          logger.error('Error releasing AQL rule lock:', error);
        }
      }
      if (reusable) connection.release();
    }
  }

  static async assertNoOverlap(connection, rule, excludeId = null) {
    if ((rule.status ?? 'active') !== 'active') return;
    const values = [rule.aql_level, rule.batch_max, rule.batch_min];
    let sql = `SELECT id FROM quality_aql_standards
      WHERE status = 'active' AND aql_level = ? AND batch_min <= ? AND batch_max >= ?`;
    if (excludeId != null) {
      sql += ' AND id <> ?';
      values.push(excludeId);
    }
    const [rows] = await connection.query(`${sql} LIMIT 1 FOR UPDATE`, values);
    if (rows.length) {
      throw validationError(
        '相同 AQL 已有生效规则覆盖此批量区间，请消除重叠后保存',
        'AQL_RULE_CONFLICT',
        409
      );
    }
  }

  /**
   * 创建新的 AQL 标准
   * @param {Object} data AQL标准数据
   * @returns {Object} 刚创建的标准记录
   */
  static async create(data) {
    const {
      code,
      name,
      batch_min,
      batch_max,
      sample_size,
      aql_level,
      accept_limit,
      reject_limit,
      status = 'active',
      creator_id,
    } = data;

    return this.withRuleWrite(async (connection) => {
      validateAqlRule(data);
      await this.assertNoOverlap(connection, data);
      const [result] = await connection.query(
        `INSERT INTO quality_aql_standards
        (code, name, batch_min, batch_max, sample_size, aql_level, accept_limit, reject_limit, status, creator_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          name,
          batch_min,
          batch_max,
          sample_size,
          aql_level,
          accept_limit,
          reject_limit,
          status,
          creator_id,
        ]
      );

      return this.findById(result.insertId, connection);
    });
  }

  /**
   * 根据ID查找AQL标准
   */
  static async findById(id, connection = pool) {
    const [rows] = await connection.query(
      'SELECT id, code, name, batch_min, batch_max, sample_size, aql_level, accept_limit, reject_limit, status, creator_id, created_at, updated_at FROM quality_aql_standards WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  /**
   * 更新 AQL 标准
   */
  static async update(id, data) {
    const allowedFields = [
      'name',
      'batch_min',
      'batch_max',
      'sample_size',
      'aql_level',
      'accept_limit',
      'reject_limit',
      'status',
    ];
    const updateFields = [];
    const values = [];

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        values.push(value);
      }
    }

    return this.withRuleWrite(async (connection) => {
      const standard = await this.findById(id, connection);
      if (!standard) throw validationError('AQL Standard not found', 'NOT_FOUND', 404);
      const candidate = { ...standard, ...data, code: standard.code };
      validateAqlRule(candidate);
      await this.assertNoOverlap(connection, candidate, id);
      if (updateFields.length) {
        await connection.query(
          `UPDATE quality_aql_standards SET ${updateFields.join(', ')} WHERE id = ?`,
          [...values, id]
        );
      }
      return this.findById(id, connection);
    });
  }

  /**
   * 删除 AQL 标准
   */
  static async delete(id) {
    return this.withRuleWrite(async (connection) => {
      const [rules] = await connection.query(
        'SELECT id FROM quality_aql_standards WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!rules.length) throw validationError('AQL Standard not found', 'NOT_FOUND', 404);
      const [references] = await connection.query(
        'SELECT id FROM quality_inspections WHERE aql_standard_id = ? LIMIT 1',
        [id]
      );
      if (references.length) {
        throw validationError('该抽样标准已被检验单引用，请停用而非删除', 'AQL_RULE_IN_USE', 409);
      }
      const [result] = await connection.query('DELETE FROM quality_aql_standards WHERE id = ?', [
        id,
      ]);
      return result.affectedRows > 0;
    });
  }

  /**
   * 获取 AQL 标准列表 (支持简单过滤)
   */
  static async findAll(params = {}) {
    let query =
      'SELECT id, code, name, batch_min, batch_max, sample_size, aql_level, accept_limit, reject_limit, status, creator_id, created_at, updated_at FROM quality_aql_standards WHERE 1=1';
    const values = [];

    if (params.status) {
      query += ' AND status = ?';
      values.push(params.status);
    }

    if (params.keyword) {
      query += ' AND (code LIKE ? OR name LIKE ?)';
      values.push(`%${params.keyword}%`, `%${params.keyword}%`);
    }

    query += ' ORDER BY code ASC, aql_level ASC, batch_min ASC';

    // 分页
    if (params.limit && params.offset !== undefined) {
      query = appendPaginationSQL(query, Number(params.limit), Number(params.offset));
    }

    const [rows] = await pool.query(query, values);
    return rows;
  }

  /**
   * 统计总数
   */
  static async count(params = {}) {
    let query = 'SELECT COUNT(*) as total FROM quality_aql_standards WHERE 1=1';
    const values = [];

    if (params.status) {
      query += ' AND status = ?';
      values.push(params.status);
    }
    if (params.keyword) {
      query += ' AND (code LIKE ? OR name LIKE ?)';
      values.push(`%${params.keyword}%`, `%${params.keyword}%`);
    }

    const [rows] = await pool.query(query, values);
    return rows[0].total;
  }

  /**
   * 核心业务：根据 批量 和 AQL级别 自动推算检验参数
   * @param {number} batchSize 进料批量
   * @param {number|string} aqlLevel AQL等级 (如 0.65, 1.0)
   * @returns {Object} 抽样参数 { sample_size, accept_limit, reject_limit, aql_standard_id }
   */
  static async calculateSampling(batchSize, aqlLevel) {
    const numericBatch = Number(batchSize);
    if (
      !['number', 'string'].includes(typeof batchSize) ||
      !Number.isSafeInteger(numericBatch) ||
      numericBatch <= 0
    ) {
      throw validationError('批量必须为正整数');
    }
    if (!isValidAqlLevel(aqlLevel)) throw validationError('AQL 等级无效');

    try {
      const sql = `SELECT id as aql_standard_id, sample_size, accept_limit, reject_limit, code, name
         FROM quality_aql_standards
         WHERE status = 'active'
           AND aql_level = ?
           AND batch_min <= ?
           AND batch_max >= ?`;
      let [rows] = await pool.query(sql, [aqlLevel, numericBatch, numericBatch]);
      // Respect an explicitly configured one-unit range. Only absent such a
      // rule can a single-unit batch use the GB/T first range starting at two.
      if (!rows.length && numericBatch === 1) {
        [rows] = await pool.query(sql, [aqlLevel, 2, 2]);
      }

      if (rows.length > 1) {
        const error = new Error('检测到重复或重叠的 AQL 抽样规则配置，无法判定唯一抽样数');
        error.code = 'AQL_RULE_CONFLICT';
        error.statusCode = 409;
        throw error;
      }

      if (!rows[0]) return null;

      return rows[0];
    } catch (error) {
      logger.error('Error calculating AQL sampling:', error);
      throw error;
    }
  }
}

module.exports = AqlStandard;
