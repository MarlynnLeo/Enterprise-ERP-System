const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const ExcelJS = require('exceljs');

const supplierService = {
  async getAllSuppliers(page = 1, pageSize = 10, filters = {}) {
    try {
      const safePage = Math.max(1, parseInt(page, 10) || 1);
      const safePageSize = Math.max(1, Math.min(10000, parseInt(pageSize, 10) || 10));
      const offset = (safePage - 1) * safePageSize;
      let whereClause = '1=1';
      const params = [];

      // 关键字搜索（同时搜索编码和名称）
      if (filters.keyword) {
        whereClause += ' AND (code LIKE ? OR name LIKE ?)';
        params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
      }
      if (filters.code) {
        whereClause += ' AND code LIKE ?';
        params.push(`%${filters.code}%`);
      }
      if (filters.name) {
        whereClause += ' AND name LIKE ?';
        params.push(`%${filters.name}%`);
      }
      if (filters.status !== undefined && filters.status !== '') {
        const status = parseInt(filters.status);
        if (!isNaN(status)) {
          whereClause += ' AND status = ?';
          params.push(status);
        }
      }

      // 获取总记录数
      const [countResult] = await pool.query(
        `SELECT COUNT(*) as total FROM suppliers WHERE ${whereClause}`,
        params
      );
      const total = countResult[0].total;

      // 获取分页数据
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const [rows] = await pool.query(
        `SELECT * FROM suppliers WHERE ${whereClause} ORDER BY id DESC LIMIT ${safePageSize} OFFSET ${offset}`,
        params
      );

      return {
        list: rows,
        total,
        page,
        pageSize,
      };
    } catch (error) {
      logger.error('获取供应商列表失败:', error);
      throw error;
    }
  },

  async getSupplierById(id) {
    try {
      const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
      return rows[0];
    } catch (error) {
      logger.error(`获取供应商详情失败 (ID: ${id}):`, error);
      throw error;
    }
  },

  async createSupplier(data) {
    try {
      // 生成供应商编码
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const [maxCodeResult] = await pool.query(
        'SELECT MAX(code) as maxCode FROM suppliers WHERE code LIKE ?',
        [`GYS${year}${month}%`]
      );

      let sequence = '001';
      if (maxCodeResult[0].maxCode) {
        const currentSequence = parseInt(maxCodeResult[0].maxCode.slice(-3));
        sequence = (currentSequence + 1).toString().padStart(3, '0');
      }

      const code = `GYS${year}${month}${sequence}`;

      const [result] = await pool.query(
        'INSERT INTO suppliers (code, name, contact_person, contact_phone, email, address, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          code,
          data.name,
          data.contact_person,
          data.contact_phone,
          data.email,
          data.address,
          data.status,
          data.remark,
        ]
      );

      return {
        id: result.insertId,
        code,
        ...data,
      };
    } catch (error) {
      logger.error('创建供应商失败:', error);
      throw error;
    }
  },

  async updateSupplier(id, data) {
    try {
      // 验证供应商是否存在
      const [existingSuppliers] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
      if (!existingSuppliers || existingSuppliers.length === 0) {
        throw new Error('供应商不存在');
      }

      // 定义允许更新的字段及其值
      const validFields = {
        name: data.name,
        contact_person: data.contact_person,
        contact_phone: data.contact_phone,
        email: data.email,
        address: data.address,
        status: data.status !== undefined ? Number(data.status) : undefined,
        remark: data.remark,
      };

      // 过滤掉未定义的字段
      const updateFields = Object.entries(validFields)
        .filter(([_, value]) => value !== undefined)
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});

      if (Object.keys(updateFields).length === 0) {
        return existingSuppliers[0];
      }

      // 构建 SQL 更新语句
      const fields = Object.keys(updateFields)
        .map((key) => `${key} = ?`)
        .join(', ');
      const values = [...Object.values(updateFields), id];

      // 执行更新
      await pool.query(`UPDATE suppliers SET ${fields} WHERE id = ?`, values);

      // 获取并返回更新后的完整数据
      const [updatedSupplier] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
      return updatedSupplier[0];
    } catch (error) {
      logger.error('更新供应商失败:', error);
      throw error;
    }
  },

  async deleteSupplier(id) {
    try {
      // 检查供应商是否有关联数据
      const [purchaseOrders] = await pool.query(
        'SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = ?',
        [id]
      );

      if (purchaseOrders[0].count > 0) {
        throw new Error(`无法删除供应商,存在 ${purchaseOrders[0].count} 个关联的采购订单`);
      }

      const [purchaseReceipts] = await pool.query(
        'SELECT COUNT(*) as count FROM purchase_receipts WHERE supplier_id = ?',
        [id]
      );

      if (purchaseReceipts[0].count > 0) {
        throw new Error(`无法删除供应商,存在 ${purchaseReceipts[0].count} 个关联的采购收货单`);
      }

      const [apRecords] = await pool.query(
        'SELECT COUNT(*) as count FROM ap_invoices WHERE supplier_id = ?',
        [id]
      );

      if (apRecords[0].count > 0) {
        throw new Error(`无法删除供应商,存在 ${apRecords[0].count} 个关联的应付账款记录`);
      }

      // 如果没有关联数据,执行删除
      await pool.query('DELETE FROM suppliers WHERE id = ?', [id]);
      return true;
    } catch (error) {
      logger.error('删除供应商失败:', error);
      throw error;
    }
  },

  async importSuppliers(suppliers) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const results = {
        success: [],
        errors: [],
      };

      for (let i = 0; i < suppliers.length; i++) {
        const supplier = suppliers[i];

        try {
          // 验证必填字段
          if (!supplier.code || !supplier.name) {
            results.errors.push({
              row: i + 1,
              data: supplier,
              error: '供应商编码和供应商名称为必填项',
            });
            continue;
          }

          // 为空的联系人和联系电话提供默认值
          if (!supplier.contact_person) {
            supplier.contact_person = '待完善';
          }
          if (!supplier.contact_phone) {
            supplier.contact_phone = '待完善';
          }

          // 检查供应商编码是否已存在
          const [existingSuppliers] = await connection.query(
            'SELECT id FROM suppliers WHERE code = ?',
            [supplier.code]
          );

          if (existingSuppliers.length > 0) {
            // 更新
            const updateData = {
              name: supplier.name,
              contact_person: supplier.contact_person,
              contact_phone: supplier.contact_phone,
              email: supplier.email || '',
              address: supplier.address || '',
              status: supplier.status !== undefined ? Number(supplier.status) : 1,
              remark: supplier.remark || '',
            };

            const fields = Object.keys(updateData)
              .map((key) => `${key} = ?`)
              .join(', ');
            const values = [...Object.values(updateData), existingSuppliers[0].id];

            await connection.query(`UPDATE suppliers SET ${fields} WHERE id = ?`, values);

            results.success.push({
              id: existingSuppliers[0].id,
              code: supplier.code,
              name: supplier.name,
              action: 'updated',
            });
          } else {
            // 新增
            const insertData = {
              code: supplier.code,
              name: supplier.name,
              contact_person: supplier.contact_person,
              contact_phone: supplier.contact_phone,
              email: supplier.email || '',
              address: supplier.address || '',
              status: supplier.status !== undefined ? Number(supplier.status) : 1,
              remark: supplier.remark || '',
            };

            const fields = Object.keys(insertData).join(', ');
            const placeholders = Object.keys(insertData)
              .map(() => '?')
              .join(', ');
            const values = Object.values(insertData);

            const [insertResult] = await connection.query(
              `INSERT INTO suppliers (${fields}) VALUES (${placeholders})`,
              values
            );

            results.success.push({
              id: insertResult.insertId,
              code: supplier.code,
              name: supplier.name,
              action: 'created',
            });
          }
        } catch (itemError) {
          results.errors.push({
            row: i + 1,
            data: supplier,
            error: itemError.message,
          });
        }
      }

      await connection.commit();

      return {
        success: true,
        message: `导入完成，成功 ${results.success.length} 条，失败 ${results.errors.length} 条`,
        successCount: results.success.length,
        errorCount: results.errors.length,
        successData: results.success,
        errors: results.errors,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('供应商导入失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  async exportSuppliers(filters = {}) {
    try {
      let sql = `
        SELECT
          code as '供应商编码',
          name as '供应商名称',
          contact_person as '联系人',
          contact_phone as '联系电话',
          email as '电子邮箱',
          address as '地址',
          status as '状态',
          remark as '备注'
        FROM suppliers
        WHERE 1=1
      `;

      const params = [];

      if (filters.code) {
        sql += ' AND code LIKE ?';
        params.push(`%${filters.code}%`);
      }

      if (filters.name) {
        sql += ' AND name LIKE ?';
        params.push(`%${filters.name}%`);
      }

      if (filters.status !== undefined && filters.status !== '') {
        sql += ' AND status = ?';
        params.push(filters.status);
      }

      sql += ' ORDER BY code';

      const [rows] = await pool.execute(sql, params);

      // 使用 ExcelJS 创建工作簿
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('供应商数据');

      // 设置列
      worksheet.columns = [
        { header: '供应商编码', key: 'code', width: 15 },
        { header: '供应商名称', key: 'name', width: 30 },
        { header: '联系人', key: 'contact_person', width: 15 },
        { header: '联系电话', key: 'contact_phone', width: 15 },
        { header: '电子邮箱', key: 'email', width: 25 },
        { header: '地址', key: 'address', width: 30 },
        { header: '状态', key: 'status', width: 10 },
        { header: '备注', key: 'remark', width: 30 },
      ];

      // 添加数据行
      rows.forEach((row) => {
        worksheet.addRow({
          code: row['供应商编码'],
          name: row['供应商名称'],
          contact_person: row['联系人'],
          contact_phone: row['联系电话'],
          email: row['电子邮箱'],
          address: row['地址'],
          status: row['状态'] === 1 ? '启用' : '禁用',
          remark: row['备注'],
        });
      });

      // 生成 Buffer
      return await workbook.xlsx.writeBuffer();
    } catch (error) {
      logger.error('导出供应商失败:', error);
      throw error;
    }
  },

  // ========== 统一命名别名 - 保持向后兼容 ==========
  getAll(page = 1, pageSize = 10, filters = {}) {
    return this.getAllSuppliers(page, pageSize, filters);
  },
  getById(id) {
    return this.getSupplierById(id);
  },
  create(data) {
    return this.createSupplier(data);
  },
  update(id, data) {
    return this.updateSupplier(id, data);
  },
  delete(id) {
    return this.deleteSupplier(id);
  },
};

module.exports = supplierService;
