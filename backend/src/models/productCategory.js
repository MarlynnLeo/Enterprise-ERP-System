/**
 * productCategory.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');
const pool = require('../config/db');

/**
 * 产品大类模型
 */
const productCategoryModel = {
  /**
   * 获取所有产品大类（树形结构，支持分页）
   */
  async getAllProductCategories(filters = {}, page = 1, limit = 20) {
    try {
      const result = await this.getFilteredProductCategories(filters, page, limit);
      // 构建树形结构
      const treeData = this.buildTree(result.data, 0);
      result.data = treeData;
      return result;
    } catch (error) {
      logger.error('获取产品大类失败:', error);
      throw error;
    }
  },

  /**
   * 获取过滤后的产品大类（平铺结构，支持分页）   */
  async getFilteredProductCategories(filters = {}, page = 1, limit = 20) {
    try {
      let query = `
        SELECT
          pc.id,
          pc.parent_id,
          pc.name,
          pc.code,
          pc.level,
          pc.sort,
          pc.status,
          pc.created_at,
          pc.updated_at,
          parent.name as parent_name
        FROM categories pc
        LEFT JOIN categories parent ON pc.parent_id = parent.id
        WHERE pc.deleted_at IS NULL
      `;


      let whereConditions = '';
      const queryParams = [];

      if (filters.name) {
        whereConditions += ' AND pc.name LIKE ?';
        queryParams.push(`%${filters.name}%`);
      }
      if (filters.code) {
        whereConditions += ' AND pc.code LIKE ?';
        queryParams.push(`%${filters.code}%`);
      }
      if (filters.status !== undefined) {
        whereConditions += ' AND pc.status = ?';
        queryParams.push(filters.status);
      }

      // 获取总数
      const countQuery =
        `
        SELECT COUNT(*) as total
        FROM categories pc
        LEFT JOIN categories parent ON pc.parent_id = parent.id
        WHERE 1=1
      ` + whereConditions;
      const countResult = await pool.query(countQuery, queryParams);

      // 构建主查询
      query += whereConditions;

      let total = 0;
      if (Array.isArray(countResult)) {
        total = countResult[0][0].total; // MySQL2 格式
      } else if (countResult && countResult.rows) {
        total = countResult.rows[0].total; // 自定义格式
      } else {
        total = countResult[0].total;
      }

      // 添加排序和分页
      query += ' ORDER BY pc.sort ASC, pc.id ASC';
      const offset = (page - 1) * limit;
      query += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

      const result = await pool.query(query, queryParams);

      let rows;
      if (Array.isArray(result)) {
        rows = result[0]; // MySQL2 格式 [rows, fields]
      } else if (result && result.rows) {
        rows = result.rows; // 自定义格式{rows: [...]}
      } else {
        rows = result; // 其他格式
      }


      const data = Array.isArray(rows) ? rows : [];

      return {
        data: data,
        total: total,
        page: page,
        limit: limit,
      };
    } catch (error) {
      logger.error('获取过滤产品大类失败:', error);
      throw error;
    }
  },

  /**
   * 构建树形结构
   */
  buildTree(data, parentId = 0) {
    const tree = [];
    for (const item of data) {
      if (item.parent_id === parentId) {
        const children = this.buildTree(data, item.id);
        if (children.length > 0) {
          item.children = children;
        }
        tree.push(item);
      }
    }
    return tree;
  },

  /**
   * 根据ID获取产品大类
   */
  async getProductCategoryById(id) {
    try {
      const query = `
        SELECT id, parent_id, name, code, level, sort, status, created_at, updated_at
        FROM categories
        WHERE id = ?
      `;
      const result = await pool.query(query, [id]);

      let rows;
      if (Array.isArray(result)) {
        rows = result[0]; // MySQL2 格式
      } else if (result && result.rows) {
        rows = result.rows; // 自定义格式
      } else {
        rows = result;
      }

      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error('获取产品大类详情失败:', error);
      throw error;
    }
  },

  /**
   * 创建产品大类
   */
  async createProductCategory(categoryData) {
    try {
      const { parent_id = 0, name, code, sort = 0, status = 1 } = categoryData;

      // 计算层级
      let level = 1;
      if (parent_id > 0) {
        const parentCategory = await this.getProductCategoryById(parent_id);
        if (parentCategory) {
          level = parentCategory.level + 1;
        }
      }

      const query = `
        INSERT INTO categories (parent_id, name, code, level, sort, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const queryResult = await pool.query(query, [
        parent_id,
        name,
        code,
        level,
        sort,
        status,
      ]);

      let result;
      if (Array.isArray(queryResult)) {
        result = queryResult[0]; // MySQL2 格式
      } else if (queryResult && queryResult.rows) {
        result = queryResult; // 自定义格式，直接使用
      } else {
        result = queryResult;
      }

      return {
        id: result.insertId,
        parent_id,
        name,
        code,
        level,
        sort,
        status,
      };
    } catch (error) {
      logger.error('创建产品大类失败:', error);
      throw error;
    }
  },

  /**
   * 更新产品大类
   */
  async updateProductCategory(id, categoryData) {
    try {
      const { parent_id, name, code, sort, status } = categoryData;

      // 计算层级
      let level = 1;
      if (parent_id > 0) {
        const parentCategory = await this.getProductCategoryById(parent_id);
        if (parentCategory) {
          level = parentCategory.level + 1;
        }
      }

      const query = `
        UPDATE categories 
        SET parent_id = ?, name = ?, code = ?, level = ?, sort = ?, status = ?
        WHERE id = ?
      `;
      await pool.query(query, [parent_id, name, code, level, sort, status, id]);

      return await this.getProductCategoryById(id);
    } catch (error) {
      logger.error('更新产品大类失败:', error);
      throw error;
    }
  },

  /**
   * 删除产品大类
   */
  async deleteProductCategory(id) {
    try {
      // 检查是否有子分类
      const childQuery = 'SELECT COUNT(*) as count FROM categories WHERE parent_id = ? AND deleted_at IS NULL';
      const childResult = await pool.query(childQuery, [id]);

      let childRows;
      if (Array.isArray(childResult)) {
        childRows = childResult[0];
      } else if (childResult && childResult.rows) {
        childRows = childResult.rows;
      } else {
        childRows = childResult;
      }

      if (Array.isArray(childRows) && childRows.length > 0 && childRows[0].count > 0) {
        throw new Error('该分类下存在子分类，无法删除');
      }

      // 检查是否有关联的产品
      try {
        const productQuery = 'SELECT COUNT(*) as count FROM materials WHERE category_id = ?';
        const productResult = await pool.query(productQuery, [id]);

        let productRows;
        if (Array.isArray(productResult)) {
          productRows = productResult[0];
        } else if (productResult && productResult.rows) {
          productRows = productResult.rows;
        } else {
          productRows = productResult;
        }

        if (Array.isArray(productRows) && productRows.length > 0 && productRows[0]?.count > 0) {
          throw new Error('该分类下存在产品，无法删除');
        }
      } catch (productError) {
        // 如果表不存在，忽略这个检查
        if (productError.code !== 'ER_NO_SUCH_TABLE') {
          throw productError;
        }
      }

      // ✅ 软删除替代硬删除
      await softDelete(pool, 'categories', 'id', id);

      return true;
    } catch (error) {
      logger.error('删除产品大类失败:', error);
      throw error;
    }
  },

  /**
   * 获取产品大类选项（用于下拉框）   */
  async getProductCategoryOptions() {
    try {
      const query = `
        SELECT id, parent_id, name, code, level
        FROM categories
        WHERE status = 1
        ORDER BY sort ASC, id ASC
      `;
      const result = await pool.query(query, []);

      let rows;
      if (Array.isArray(result)) {
        rows = result[0];
      } else if (result && result.rows) {
        rows = result.rows;
      } else {
        rows = result;
      }

      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      logger.error('获取产品大类选项失败:', error);
      throw error;
    }
  },

  /**
   * 获取统计信息（优化版：单次查询获取所有统计数据）
   */
  async getStatistics() {
    try {

      const query = `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN parent_id = 0 THEN 1 ELSE 0 END) as parentCategories,
          SUM(CASE WHEN parent_id > 0 THEN 1 ELSE 0 END) as childCategories,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as inactive
        FROM categories
      `;

      const result = await pool.query(query, []);

      // 处理查询结果
      let rows;
      if (Array.isArray(result)) {
        rows = result[0]; // MySQL2 格式 [rows, fields]
      } else if (result && result.rows) {
        rows = result.rows; // 自定义格式{rows: [...]}
      } else {
        rows = result; // 其他格式
      }


      const data = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};

      return {
        total: parseInt(data.total) || 0,
        parentCategories: parseInt(data.parentCategories) || 0,
        childCategories: parseInt(data.childCategories) || 0,
        active: parseInt(data.active) || 0,
        inactive: parseInt(data.inactive) || 0,
      };
    } catch (error) {
      logger.error('获取产品大类统计信息失败:', error);
      throw error;
    }
  },
};

module.exports = productCategoryModel;
