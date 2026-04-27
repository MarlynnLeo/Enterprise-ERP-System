/**
 * CodeGeneratorService.js
 * @description 统一编码规则引擎 — 并发安全的单据编号生成
 * @date 2026-04-21
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const dayjs = require('dayjs');

class CodeGeneratorService {

  /**
   * 生成下一个编号（并发安全）
   * @param {string} businessType - 业务类型（对应 coding_rules.business_type）
   * @param {Object} [conn] - 可选的数据库连接（用于事务内调用）
   * @returns {Promise<string>} 生成的编号
   */
  async nextCode(businessType, conn = null) {
    const db = conn || pool;

    // 1. 获取编码规则
    const [[rule]] = await db.query(
      'SELECT * FROM coding_rules WHERE business_type = ? AND is_active = 1',
      [businessType]
    );

    if (!rule) {
      throw new Error(`编码规则未配置: ${businessType}，请先在「系统管理 → 编码规则」中添加该业务类型的编码规则`);
    }

    // 2. 计算周期键
    const periodKey = this._getPeriodKey(rule.reset_cycle, rule.date_format);

    // 3. 原子递增（使用 INSERT ... ON DUPLICATE KEY UPDATE 保证并发安全）
    await db.query(
      `INSERT INTO coding_sequences (business_type, period_key, current_value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE current_value = current_value + ?`,
      [businessType, periodKey, rule.initial_value, rule.step]
    );

    // 4. 读取当前值
    const [[seq]] = await db.query(
      'SELECT current_value FROM coding_sequences WHERE business_type = ? AND period_key = ?',
      [businessType, periodKey]
    );

    const currentVal = seq.current_value;

    // 5. 组装编号
    return this._formatCode(rule, currentVal);
  }

  /**
   * 预览编号格式（不消耗序列号）
   */
  async previewCode(businessType) {
    const [[rule]] = await pool.query(
      'SELECT * FROM coding_rules WHERE business_type = ? AND is_active = 1',
      [businessType]
    );
    if (!rule) return null;

    const periodKey = this._getPeriodKey(rule.reset_cycle, rule.date_format);
    const [[seq]] = await pool.query(
      'SELECT current_value FROM coding_sequences WHERE business_type = ? AND period_key = ?',
      [businessType, periodKey]
    );
    const nextVal = (seq?.current_value || 0) + rule.step;
    return this._formatCode(rule, nextVal);
  }

  // ==================== 规则 CRUD ====================

  async getRules(params = {}) {
    const { keyword, page = 1, pageSize = 50 } = params;
    let where = 'WHERE 1=1';
    const values = [];

    if (keyword) {
      where += ' AND (business_type LIKE ? OR name LIKE ?)';
      values.push(`%${keyword}%`, `%${keyword}%`);
    }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM coding_rules ${where}`, values);
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
      `SELECT * FROM coding_rules ${where} ORDER BY business_type LIMIT ? OFFSET ?`,
      [...values, Number(pageSize), offset]
    );
    return { list: rows, total };
  }

  async getRuleById(id) {
    const [[rule]] = await pool.query('SELECT * FROM coding_rules WHERE id = ?', [id]);
    return rule || null;
  }

  async updateRule(id, data) {
    await pool.query(
      'UPDATE coding_rules SET name = ?, prefix = ?, date_format = ?, `separator` = ?, sequence_length = ?, reset_cycle = ?, initial_value = ?, step = ?, description = ?, is_active = ? WHERE id = ?',
      [data.name, data.prefix, data.date_format || '', data.separator || '-',
       data.sequence_length || 4, data.reset_cycle || 'yearly',
       data.initial_value || 1, data.step || 1, data.description || null,
       data.is_active ?? 1, id]
    );
    return this.getRuleById(id);
  }

  async createRule(data) {
    const [result] = await pool.query(
      'INSERT INTO coding_rules (business_type, name, prefix, date_format, `separator`, sequence_length, reset_cycle, initial_value, step, description, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.business_type, data.name, data.prefix || '', data.date_format || '',
       data.separator || '-', data.sequence_length || 4, data.reset_cycle || 'yearly',
       data.initial_value || 1, data.step || 1, data.description || null, data.is_active ?? 1]
    );
    return this.getRuleById(result.insertId);
  }

  async deleteRule(id) {
    // 同时清理关联的序列
    const rule = await this.getRuleById(id);
    if (rule) {
      await pool.query('DELETE FROM coding_sequences WHERE business_type = ?', [rule.business_type]);
    }
    await pool.query('DELETE FROM coding_rules WHERE id = ?', [id]);
    return { success: true };
  }

  async resetSequence(businessType, periodKey) {
    if (periodKey) {
      await pool.query(
        'DELETE FROM coding_sequences WHERE business_type = ? AND period_key = ?',
        [businessType, periodKey]
      );
    } else {
      await pool.query(
        'DELETE FROM coding_sequences WHERE business_type = ?',
        [businessType]
      );
    }
    return { success: true };
  }

  /** 获取某条规则关联的序列信息 */
  async getSequences(businessType) {
    const [rows] = await pool.query(
      'SELECT * FROM coding_sequences WHERE business_type = ? ORDER BY period_key DESC',
      [businessType]
    );
    return rows;
  }

  // ==================== 内部方法 ====================

  _getPeriodKey(resetCycle, dateFormat) {
    const now = dayjs();
    switch (resetCycle) {
      case 'daily':   return now.format('YYYYMMDD');
      case 'monthly': return now.format('YYYYMM');
      case 'yearly':  return now.format('YYYY');
      case 'none':
      default:        return 'default';
    }
  }

  _formatCode(rule, sequenceValue) {
    const parts = [];
    const sep = rule.separator || '';

    // 前缀
    if (rule.prefix) parts.push(rule.prefix);

    // 日期部分
    if (rule.date_format) {
      const now = dayjs();
      const dateStr = now.format(rule.date_format);
      parts.push(dateStr);
    }

    // 流水号
    const seqStr = String(sequenceValue).padStart(rule.sequence_length, '0');
    parts.push(seqStr);

    return parts.join(sep);
  }
}

module.exports = new CodeGeneratorService();
