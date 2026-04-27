const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const ExcelJS = require('exceljs');
const { softDelete } = require('../utils/softDelete');

const materialService = {
  async getAllMaterials(page = 1, pageSize = 10, filters = {}) {
    try {
      const validPage = Math.max(1, parseInt(page) || 1);
      const validPageSize = Math.max(1, parseInt(pageSize) || 10);
      const offset = (validPage - 1) * validPageSize;

      logger.debug('🔍 getAllMaterials 查询参数:', {
        page: validPage,
        pageSize: validPageSize,
        filters,
      });

      let sql = `
        SELECT
          m.id, m.code, m.name, m.specs, m.status, m.remark,
          m.category_id, m.product_category_id, m.unit_id,
          m.material_source_id, m.inspection_method_id,
          m.supplier_id, m.location_id, m.production_group_id, m.manager_id,
          m.min_stock, m.max_stock, m.material_type, m.deleted_at,
          m.created_at, m.updated_at,
          c.name as category_name,
          pc.name as product_category_name,
          u.name as unit_name,
          ms.name as material_source_name,
          im.name as inspection_method_name,
          s.name as supplier_name,
          l.name as location_name,
          pg.name as production_group_name,
          mgr.real_name as manager_name,
          mgr.username as manager_username,
          COALESCE((
            SELECT SUM(il.quantity)
            FROM inventory_ledger il
            WHERE il.material_id = m.id
              AND (m.location_id IS NULL OR il.location_id = m.location_id)
          ), 0) as stock_quantity,
          CASE WHEN EXISTS (
            SELECT 1 FROM bom_masters bm WHERE bm.product_id = m.id AND bm.status = 1
          ) THEN 1 ELSE 0 END as has_bom,
          (SELECT MAX(bm.id) FROM bom_masters bm WHERE bm.product_id = m.id AND bm.status = 1) as bom_id
        FROM materials m
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN categories pc ON m.product_category_id = pc.id
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN material_sources ms ON m.material_source_id = ms.id
        LEFT JOIN inspection_methods im ON m.inspection_method_id = im.id
        LEFT JOIN suppliers s ON m.supplier_id = s.id
        LEFT JOIN locations l ON m.location_id = l.id
        LEFT JOIN departments pg ON m.production_group_id = pg.id
        LEFT JOIN users mgr ON m.manager_id = mgr.id
      `;

      // 构建WHERE子句
      const whereConditions = [];
      const params = [];

      // 搜索条件 - 支持search和keyword通用搜索
      const searchKeyword = filters.search || filters.keyword;
      if (searchKeyword) {
        const searchTerm = searchKeyword.trim();
        if (searchTerm) {
          const searchConditions = ['m.name LIKE ?', 'm.code LIKE ?', 'm.specs LIKE ?'];
          const keywordParam = `%${searchTerm}%`;
          params.push(keywordParam, keywordParam, keywordParam);
          whereConditions.push(`(${searchConditions.join(' OR ')})`);
          logger.debug('📝 添加搜索条件:', { searchTerm, keywordParam });
        }
      } else if (filters.name || filters.code || filters.specs) {
        // 单独搜索条件（向后兼容）
        const searchConditions = [];
        if (filters.name) {
          searchConditions.push('m.name LIKE ?');
          params.push(`%${filters.name}%`);
        }
        if (filters.code) {
          searchConditions.push('m.code LIKE ?');
          params.push(`%${filters.code}%`);
        }
        if (filters.specs) {
          searchConditions.push('m.specs LIKE ?');
          params.push(`%${filters.specs}%`);
        }
        if (searchConditions.length > 0) {
          whereConditions.push(`(${searchConditions.join(' OR ')})`);
        }
      }

      // 分类条件（兼容 category_id 和 categoryId 两种传参方式）
      const categoryIdParam = filters.category_id || filters.categoryId;
      if (categoryIdParam) {
        const categoryId = parseInt(categoryIdParam);
        if (!isNaN(categoryId)) {
          whereConditions.push('m.category_id = ?');
          params.push(categoryId);
        }
      }

      // 状态条件
      if (filters.status !== undefined && filters.status !== '') {
        const status = parseInt(filters.status);
        if (!isNaN(status)) {
          whereConditions.push('m.status = ?');
          params.push(status);
        }
      }

      // ✅ 软删除过滤
      whereConditions.unshift('m.deleted_at IS NULL');

      // 组合WHERE子句
      sql += ' WHERE ' + whereConditions.join(' AND ');

      // 获取总数
      const countSql = `
        SELECT COUNT(*) as total
        FROM materials m
        WHERE ${whereConditions.join(' AND ')}
      `;
      const [countResult] = await pool.query(countSql, params);
      const total = countResult[0].total;

      logger.debug('📊 查询总数:', total);

      // 添加排序和分页      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入SQL
      sql += ` ORDER BY m.id DESC LIMIT ${Number(validPageSize)} OFFSET ${Number(offset)}`;

      logger.debug('🔍 执行SQL查询...');
      const [data] = await pool.query(sql, params);

      logger.debug('的查询结果:', data.length, '条记录');

      // BOM信息已在主查询的LEFT JOIN中获取，无需额外处理

      return {
        data,
        pagination: {
          total,
          page: validPage,
          pageSize: validPageSize,
          totalPages: Math.ceil(total / validPageSize),
        },
      };
    } catch (error) {
      logger.error('getAllMaterials error:', error);
      throw error;
    }
  },

  async getMaterialById(id) {
    try {
      const sql = `
        SELECT
          m.*,
          c.name as category_name,
          pc.name as product_category_name,
          u.name as unit_name,
          ms.name as material_source_name,
          im.name as inspection_method_name,
          s.name as supplier_name,
          l.name as location_name,
          pg.name as production_group_name,
          mgr.real_name as manager_name,
          mgr.username as manager_username
        FROM materials m
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN categories pc ON m.product_category_id = pc.id
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN material_sources ms ON m.material_source_id = ms.id
        LEFT JOIN inspection_methods im ON m.inspection_method_id = im.id
        LEFT JOIN suppliers s ON m.supplier_id = s.id
        LEFT JOIN locations l ON m.location_id = l.id
        LEFT JOIN departments pg ON m.production_group_id = pg.id
        LEFT JOIN users mgr ON m.manager_id = mgr.id
        WHERE m.id = ? AND m.deleted_at IS NULL
      `;
      const [rows] = await pool.execute(sql, [id]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error('getMaterialById error:', error);
      throw error;
    }
  },

  async createMaterial(data) {
    try {
      // 过滤非id 字段
      const materialData = { ...data };
      delete materialData.id;
      delete materialData.created_at;
      delete materialData.updated_at;

      // 将空字符串转换为 null
      Object.keys(materialData).forEach((key) => {
        if (materialData[key] === '') {
          materialData[key] = null;
        }
      });

      const keys = Object.keys(materialData);
      const values = Object.values(materialData);

      const sql = `INSERT INTO materials (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
      const [result] = await pool.execute(sql, values);

      return { id: result.insertId, ...materialData };
    } catch (error) {
      logger.error('createMaterial error:', error);
      throw error;
    }
  },

  async updateMaterial(id, data) {
    try {
      // 检查物料是否存在
      const [existing] = await pool.query('SELECT * FROM materials WHERE id = ?', [id]);
      if (!existing || existing.length === 0) {
        throw new Error('物料不存在');
      }

      const materialData = { ...data };
      delete materialData.created_at;
      delete materialData.updated_at;

      // 将空字符串转换为 null
      Object.keys(materialData).forEach((key) => {
        if (materialData[key] === '') {
          materialData[key] = null;
        }
      });

      const keys = Object.keys(materialData);
      const values = Object.values(materialData);

      const sql = `UPDATE materials SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`;
      await pool.execute(sql, [...values, id]);

      return { id, ...materialData };
    } catch (error) {
      logger.error('updateMaterial error:', error);
      throw error;
    }
  },

  async deleteMaterial(id) {
    try {
      // 检查BOM引用
      const [bomDetails] = await pool.query(
        'SELECT COUNT(*) as count FROM bom_details WHERE material_id = ?',
        [id]
      );
      if (bomDetails[0].count > 0) {
        throw new Error('该物料被BOM引用，不能删除');
      }

      // 检查BOM主表引用 (作为产品)
      const [bomMasters] = await pool.query(
        'SELECT COUNT(*) as count FROM bom_masters WHERE product_id = ?',
        [id]
      );
      if (bomMasters[0].count > 0) {
        throw new Error('该物料有对应的BOM，不能删除');
      }

      // 检查库存引用
      const [inventory] = await pool.query(
        'SELECT COUNT(*) as count FROM inventory_ledger WHERE material_id = ?',
        [id]
      );
      if (inventory[0].count > 0) {
        throw new Error('该物料有库存记录，不能删除');
      }

      // ✅ 软删除替代硬删除
      await softDelete(pool, 'materials', 'id', id);
      return true;
    } catch (error) {
      logger.error('deleteMaterial error:', error);
      throw error;
    }
  },

  async getNextMaterialSequence(prefix) {
    try {
      const query = `
        SELECT code
        FROM materials
        WHERE code LIKE ? AND LENGTH(code) = ?
        ORDER BY code DESC
        LIMIT 1
      `;

      // 物料编码格式：前缀(可变长度) + 3位序号      // 例如：001 + 001 = 1001001
      const expectedLength = prefix.length + 3;
      const [rows] = await pool.query(query, [`${prefix}%`, expectedLength]);

      if (!rows || rows.length === 0) {
        return 1;
      }

      const lastCode = rows[0].code;
      // 提取序列号
      const sequencePart = lastCode.substring(prefix.length);
      const sequence = parseInt(sequencePart);

      if (!isNaN(sequence)) {
        return sequence + 1;
      }

      return 1;
    } catch (error) {
      logger.error('getNextMaterialSequence error:', error);
      throw error;
    }
  },

  async importMaterials(materials) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const results = {
        success: [],
        errors: [],
      };

      for (let i = 0; i < materials.length; i++) {
        const material = materials[i];
        try {

          // 简单验证
          if (!material.code || !material.name) {
            throw new Error('物料编码和名称不能为空');
          }

          // 检查是否存在
          const [existing] = await connection.query('SELECT id FROM materials WHERE code = ?', [
            material.code,
          ]);

          if (existing.length > 0) {
            // 更新
            const updateData = { ...material };
            delete updateData.code;
            const keys = Object.keys(updateData);
            const values = Object.values(updateData);

            await connection.query(
              `UPDATE materials SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
              [...values, existing[0].id]
            );

            results.success.push({ code: material.code, action: 'updated' });
          } else {
            // 新增
            const keys = Object.keys(material);
            const values = Object.values(material);
            const placeholders = keys.map(() => '?').join(', ');

            await connection.query(
              `INSERT INTO materials (${keys.join(', ')}) VALUES (${placeholders})`,
              values
            );

            results.success.push({ code: material.code, action: 'created' });
          }
        } catch (error) {
          results.errors.push({
            row: i + 1,
            code: material.code,
            error: error.message,
          });
        }
      }

      await connection.commit();
      return results;
    } catch (error) {
      await connection.rollback();
      logger.error('importMaterials error:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  async exportMaterials(filters = {}) {
    try {
      const { data } = await this.getAllMaterials(1, 10000, filters);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Materials');

      // 设置列
      worksheet.columns = [
        { header: '物料编码', key: 'code', width: 15 },
        { header: '物料名称', key: 'name', width: 25 },
        { header: '规格型号', key: 'specs', width: 20 },
        { header: '分类', key: 'category_name', width: 15 },
        { header: '单位', key: 'unit_name', width: 10 },
        { header: '库存数量', key: 'stock_quantity', width: 12 },
        { header: '状态', key: 'status', width: 10 },
        { header: '备注', key: 'remark', width: 30 },
      ];

      // 添加数据
      data.forEach((item) => {
        worksheet.addRow({
          code: item.code,
          name: item.name,
          specs: item.specs,
          category_name: item.category_name,
          unit_name: item.unit_name,
          stock_quantity: item.stock_quantity,
          status: item.status === 1 ? '启用' : '禁用',
          remark: item.remark,
        });
      });

      // 生成 Buffer
      return await workbook.xlsx.writeBuffer();
    } catch (error) {
      logger.error('exportMaterials error:', error);
      throw error;
    }
  },

  // ========== 统一命名别名 - 保持向后兼容 ==========
  // 注意：参数顺序统一为page, pageSize, filters)
  getAll(page = 1, pageSize = 10, filters = {}) {
    return this.getAllMaterials(page, pageSize, filters);
  },
  getById(id) {
    return this.getMaterialById(id);
  },
  create(data) {
    return this.createMaterial(data);
  },
  update(id, data) {
    return this.updateMaterial(id, data);
  },
  delete(id) {
    return this.deleteMaterial(id);
  },

  // 获取物料附件列表
  async getMaterialAttachments(materialId) {
    try {
      const sql =
        'SELECT * FROM material_attachments WHERE material_id = ? ORDER BY upload_time DESC';
      const [rows] = await pool.execute(sql, [materialId]);
      return rows;
    } catch (error) {
      logger.error('getMaterialAttachments error:', error);
      throw error;
    }
  },

  // 添加物料附件
  async addMaterialAttachment(data) {
    try {
      const sql = `INSERT INTO material_attachments
                (material_id, file_name, file_path, file_type, file_size, description, uploader_id, uploader_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const [result] = await pool.execute(sql, [
        data.material_id,
        data.file_name,
        data.file_path,
        data.file_type,
        data.file_size,
        data.description,
        data.uploader_id,
        data.uploader_name,
      ]);
      return { id: result.insertId, ...data };
    } catch (error) {
      logger.error('addMaterialAttachment error:', error);
      throw error;
    }
  },

  // 删除物料附件
  async deleteMaterialAttachment(attachmentId) {
    try {
      const sql = 'DELETE FROM material_attachments WHERE id = ?';
      await pool.execute(sql, [attachmentId]);
      return true;
    } catch (error) {
      logger.error('deleteMaterialAttachment error:', error);
      throw error;
    }
  },

  async updateStatus(id, status) {
    try {
      const [result] = await pool.execute('UPDATE materials SET status = ? WHERE id = ?', [
        status,
        id,
      ]);
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('updateStatus error:', error);
      throw error;
    }
  },

  // 🔥 获取物料价格历史
  async getMaterialPriceHistory(materialId, priceType = null) {
    try {
      let sql = `
                SELECT 
                    mph.*,
                    u.real_name as created_by_name
                FROM material_price_history mph
                LEFT JOIN users u ON mph.created_by = u.id
                WHERE mph.material_id = ?
            `;
      const params = [materialId];

      if (priceType) {
        sql += ' AND mph.price_type = ?';
        params.push(priceType);
      }

      sql += ' ORDER BY mph.created_at DESC LIMIT 50';

      const [rows] = await pool.execute(sql, params);
      return rows;
    } catch (error) {
      logger.error('getMaterialPriceHistory error:', error);
      throw error;
    }
  },
};

module.exports = materialService;

