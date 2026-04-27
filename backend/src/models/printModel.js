/**
 * printModel.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');
const { pool } = require('../config/db');
const { parsePagination, appendPaginationSQL } = require('../utils/safePagination');

// 打印模块模型
const printModel = {
  // 打印设置管理
  async getAllPrintSettings(page = 1, pageSize = 10, filters = {}) {
    // ✅ 安全修复: 使用安全分页工具 + 修复 params 未传入分页查询的 bug
    const { limit: safeLimit, offset: safeOffset, page: safePage, pageSize: safePageSize } = parsePagination(page, pageSize);
    let whereClause = 'deleted_at IS NULL';
    const params = [];

    if (filters.name) {
      whereClause += ' AND name LIKE ?';
      params.push(`%${filters.name}%`);
    }
    if (filters.status !== undefined && filters.status !== '') {
      whereClause += ' AND status = ?';
      params.push(parseInt(filters.status));
    }

    // 获取总记录数
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM print_settings WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // 获取分页数据
    const sql = appendPaginationSQL(
      `SELECT * FROM print_settings WHERE ${whereClause} ORDER BY id DESC`,
      safeLimit, safeOffset
    );
    const [rows] = await pool.execute(sql, params);

    return {
      list: rows,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  },

  async getPrintSettingById(id) {
    const [rows] = await pool.execute('SELECT * FROM print_settings WHERE id = ? AND deleted_at IS NULL', [id]);
    return rows.length > 0 ? rows[0] : null;
  },

  async createPrintSetting(data) {
    const [result] = await pool.execute(
      `INSERT INTO print_settings (
        name, default_paper_size, default_orientation, 
        default_margin_top, default_margin_right, default_margin_bottom, default_margin_left,
        header_content, footer_content, company_logo, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.default_paper_size || 'A4',
        data.default_orientation || 'portrait',
        data.default_margin_top || 10,
        data.default_margin_right || 10,
        data.default_margin_bottom || 10,
        data.default_margin_left || 10,
        data.header_content || null,
        data.footer_content || null,
        data.company_logo || null,
        data.status !== undefined ? data.status : 1,
        data.created_by || null,
      ]
    );
    return { id: result.insertId, ...data };
  },

  async updatePrintSetting(id, data) {
    const [result] = await pool.execute(
      `UPDATE print_settings SET
        name = ?,
        default_paper_size = ?,
        default_orientation = ?,
        default_margin_top = ?,
        default_margin_right = ?,
        default_margin_bottom = ?,
        default_margin_left = ?,
        header_content = ?,
        footer_content = ?,
        company_logo = ?,
        status = ?,
        updated_by = ?
      WHERE id = ?`,
      [
        data.name,
        data.default_paper_size,
        data.default_orientation,
        data.default_margin_top,
        data.default_margin_right,
        data.default_margin_bottom,
        data.default_margin_left,
        data.header_content,
        data.footer_content,
        data.company_logo,
        data.status,
        data.updated_by,
        id,
      ]
    );
    return result.affectedRows > 0;
  },

  async deletePrintSetting(id) {
    // ✅ 软删除替代硬删除
    const affected = await softDelete(pool, 'print_settings', 'id', id);
    return affected > 0;
  },

  // 打印模板管理
  async getAllPrintTemplates(page = 1, pageSize = 10, filters = {}) {
    try {
      // ✅ 安全修复: 使用安全分页工具替代模板字符串拼接
      const { limit: safeLimit, offset: safeOffset, page: pageNum, pageSize: pageSizeNum } = parsePagination(page, pageSize);

      // 构建查询条件
      let whereClause = 'deleted_at IS NULL';
      const params = [];

      if (filters.name) {
        whereClause += ' AND name LIKE ?';
        params.push(`%${filters.name}%`);
      }

      if (filters.module) {
        whereClause += ' AND module = ?';
        params.push(filters.module);
      }

      if (filters.template_type) {
        whereClause += ' AND template_type = ?';
        params.push(filters.template_type);
      }

      if (filters.status !== undefined && filters.status !== '') {
        whereClause += ' AND status = ?';
        params.push(Number(filters.status));
      }

      if (filters.is_default !== undefined && filters.is_default !== '') {
        whereClause += ' AND is_default = ?';
        params.push(Number(filters.is_default));
      }

      // 获取总记录数
      const countSql = `SELECT COUNT(*) as total FROM print_templates WHERE ${whereClause}`;
      const [countResult] = await pool.execute(countSql, params);
      const total = countResult[0].total;

      // 分页查询 — 使用安全分页工具
      const sql = appendPaginationSQL(
        `SELECT * FROM print_templates WHERE ${whereClause} ORDER BY id DESC`,
        safeLimit, safeOffset
      );

      // 执行查询
      const [rows] = await pool.execute(sql, params);

      return {
        list: rows,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
      };
    } catch (error) {
      logger.error('获取打印模板列表错误:', error);
      throw error;
    }
  },

  async getPrintTemplateById(id) {
    const [rows] = await pool.execute('SELECT * FROM print_templates WHERE id = ? AND deleted_at IS NULL', [id]);
    return rows.length > 0 ? rows[0] : null;
  },

  async getDefaultTemplateByType(module, templateType) {
    const [rows] = await pool.execute(
      'SELECT * FROM print_templates WHERE module = ? AND template_type = ? AND is_default = 1 AND status = 1 AND deleted_at IS NULL LIMIT 1',
      [module, templateType]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  async createPrintTemplate(data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 如果设置为默认模板，先将同类型的其他模板设置为非默认
      if (data.is_default === 1) {
        await connection.execute(
          'UPDATE print_templates SET is_default = 0 WHERE module = ? AND template_type = ?',
          [data.module, data.template_type]
        );
      }

      // 插入新模板
      const [result] = await connection.execute(
        `INSERT INTO print_templates (
          name, module, template_type, content, paper_size, orientation,
          margin_top, margin_right, margin_bottom, margin_left,
          is_default, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.name,
          data.module,
          data.template_type,
          data.content,
          data.paper_size || 'A4',
          data.orientation || 'portrait',
          data.margin_top || 10,
          data.margin_right || 10,
          data.margin_bottom || 10,
          data.margin_left || 10,
          data.is_default || 0,
          data.status !== undefined ? data.status : 1,
          data.created_by || null,
        ]
      );

      await connection.commit();
      return { id: result.insertId, ...data };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updatePrintTemplate(id, data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 如果设置为默认模板，先将同类型的其他模板设置为非默认
      if (data.is_default === 1) {
        await connection.execute(
          'UPDATE print_templates SET is_default = 0 WHERE module = ? AND template_type = ? AND id <> ?',
          [data.module, data.template_type, id]
        );
      }

      // 更新模板
      const [result] = await connection.execute(
        `UPDATE print_templates SET
          name = ?,
          content = ?,
          paper_size = ?,
          orientation = ?,
          margin_top = ?,
          margin_right = ?,
          margin_bottom = ?,
          margin_left = ?,
          is_default = ?,
          status = ?,
          updated_by = ?,
          updated_at = NOW()
        WHERE id = ?`,
        [
          data.name,
          data.content,
          data.paper_size,
          data.orientation,
          data.margin_top,
          data.margin_right,
          data.margin_bottom,
          data.margin_left,
          data.is_default,
          data.status,
          data.updated_by,
          id,
        ]
      );

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('更新模板失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  async deletePrintTemplate(id) {
    // ✅ 软删除替代硬删除
    const affected = await softDelete(pool, 'print_templates', 'id', id);
    return affected > 0;
  },
};

module.exports = printModel;
