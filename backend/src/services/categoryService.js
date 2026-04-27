const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');

const categoryService = {
  async getAllCategories(filters = {}) {
    let sql = 'SELECT * FROM categories WHERE deleted_at IS NULL';
    const params = [];

    if (filters.parent_id !== undefined && filters.parent_id !== '') {
      const parentId = parseInt(filters.parent_id);
      if (!isNaN(parentId)) {
        sql += ' AND parent_id = ?';
        params.push(parentId);
      }
    }
    if (filters.name) {
      sql += ' AND name LIKE ?';
      params.push(`%${filters.name}%`);
    }
    if (filters.code) {
      sql += ' AND code LIKE ?';
      params.push(`%${filters.code}%`);
    }
    if (filters.status !== undefined && filters.status !== '') {
      const status = parseInt(filters.status);
      if (!isNaN(status)) {
        sql += ' AND status = ?';
        params.push(status);
      }
    }

    sql += ' ORDER BY sort ASC, id ASC';

    try {
      const [categories] = await pool.query(sql, params);

      // 如果没有指定parent_id或者请求的是树结构，则构建树形结构返回
      if (filters.tree === 'true' || filters.parent_id === undefined) {
        // 构建分类树结构
        const categoryMap = {};
        const rootCategories = [];

        // 首先将所有分类映射到 id
        categories.forEach((category) => {
          categoryMap[category.id] = { ...category, children: [] };
        });

        // 然后构建树结构
        categories.forEach((category) => {
          if (category.parent_id && categoryMap[category.parent_id]) {
            categoryMap[category.parent_id].children.push(categoryMap[category.id]);
          } else {
            rootCategories.push(categoryMap[category.id]);
          }
        });

        return rootCategories;
      }

      return categories;
    } catch (error) {
      logger.error('获取分类列表失败:', error);
      throw error;
    }
  },

  async getCategoryById(id) {
    try {
      const [rows] = await pool.query('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL', [id]);
      return rows[0] || null;
    } catch (error) {
      logger.error(`获取分类详情失败 (ID: ${id}):`, error);
      throw error;
    }
  },

  async getCategoryByCode(code) {
    try {
      const [rows] = await pool.query('SELECT * FROM categories WHERE code = ? AND deleted_at IS NULL', [code]);
      return rows[0] || null;
    } catch (error) {
      logger.error(`根据编码获取分类失败 (Code: ${code}):`, error);
      throw error;
    }
  },

  async createCategory(data) {
    try {
      // 处理父级分类
      let level = 1;
      if (data.parent_id) {
        const [parentRows] = await pool.query('SELECT level FROM categories WHERE id = ? AND deleted_at IS NULL', [
          data.parent_id,
        ]);
        if (parentRows.length > 0) {
          level = parentRows[0].level + 1;
        }
      }

      const categoryData = {
        name: data.name,
        code: data.code,
        parent_id: data.parent_id || 0,
        level: level,
        sort: data.sort || 0,
        status: data.status !== undefined ? data.status : 1,
        remark: data.remark || '',
      };

      const [result] = await pool.query(
        'INSERT INTO categories (name, code, parent_id, level, sort, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          categoryData.name,
          categoryData.code,
          categoryData.parent_id,
          categoryData.level,
          categoryData.sort,
          categoryData.status,
          categoryData.remark,
        ]
      );

      return { id: result.insertId, ...categoryData };
    } catch (error) {
      logger.error('创建分类失败:', error);
      throw error;
    }
  },

  async updateCategory(id, data) {
    try {
      // 检查分类是否存在
      const [existing] = await pool.query('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!existing || existing.length === 0) {
        throw new Error('分类不存在');
      }

      // 处理父级分类变化导致的层级变化
      let level = existing[0].level;
      if (data.parent_id !== undefined && data.parent_id != existing[0].parent_id) {
        if (data.parent_id == 0) {
          level = 1;
        } else {
          const [parentRows] = await pool.query('SELECT level FROM categories WHERE id = ?', [
            data.parent_id,
          ]);
          if (parentRows.length > 0) {
            level = parentRows[0].level + 1;
          }
        }
      }

      const updateData = {
        name: data.name,
        code: data.code,
        parent_id: data.parent_id,
        level: level,
        sort: data.sort,
        status: data.status,
        remark: data.remark,
      };

      // 过滤掉undefined字段
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

      await pool.query(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values);

      const [updated] = await pool.query('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL', [id]);
      return updated[0];
    } catch (error) {
      logger.error('更新分类失败:', error);
      throw error;
    }
  },

  async deleteCategory(id) {
    try {
      // 检查是否有子分类
      const [children] = await pool.query(
        'SELECT COUNT(*) as count FROM categories WHERE parent_id = ? AND deleted_at IS NULL',
        [id]
      );
      if (children[0].count > 0) {
        throw new Error('该分类下有子分类，不能删除');
      }

      // 检查是否有关联的物料
      const [materials] = await pool.query(
        'SELECT COUNT(*) as count FROM materials WHERE category_id = ?',
        [id]
      );
      if (materials[0].count > 0) {
        throw new Error('该分类下有关联的物料，不能删除');
      }

      // ✅ 软删除替代硬删除
      await softDelete(pool, 'categories', 'id', id);
      return true;
    } catch (error) {
      logger.error('删除分类失败:', error);
      throw error;
    }
  },

  // ========== 统一命名别名 - 保持向后兼容 ==========
  getAll(page = 1, pageSize = 10, filters = {}) {
    // 分类不分页，忽略page和pageSize参数
    return this.getAllCategories(filters);
  },
  getById(id) {
    return this.getCategoryById(id);
  },
  create(data) {
    return this.createCategory(data);
  },
  update(id, data) {
    return this.updateCategory(id, data);
  },
  delete(id) {
    return this.deleteCategory(id);
  },
};

module.exports = categoryService;
