const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');

const customerService = {
  async getAllCustomers(page = 1, pageSize = 10, filters = {}) {
    try {
      const safePage = Math.max(1, parseInt(page, 10) || 1);
      const safePageSize = Math.max(1, Math.min(10000, parseInt(pageSize, 10) || 10));
      const offset = (safePage - 1) * safePageSize;
      let whereClause = 'deleted_at IS NULL';
      const params = [];

      if (filters.code) {
        whereClause += ' AND code LIKE ?';
        params.push(`%${filters.code}%`);
      }
      if (filters.name) {
        whereClause += ' AND name LIKE ?';
        params.push(`%${filters.name}%`);
      }
      if (filters.customer_type) {
        whereClause += ' AND customer_type = ?';
        params.push(filters.customer_type);
      }
      // 支持通用搜索参数，搜索客户名称
      if (filters.search) {
        whereClause += ' AND name LIKE ?';
        params.push(`%${filters.search}%`);
      }
      if (filters.status !== undefined && filters.status !== '') {
        whereClause += ' AND status = ?';
        // 处理字符串状态值，将其转换为对应的数字或保持字符串
        if (filters.status === 'active') {
          params.push('active');
        } else if (filters.status === 'inactive') {
          params.push('inactive');
        } else {
          // 如果是数字字符串，转换为数字
          const numStatus = parseInt(filters.status);
          params.push(isNaN(numStatus) ? filters.status : numStatus);
        }
      }

      // 获取总记录数
      const [countResult] = await pool.query(
        `SELECT COUNT(*) as total FROM customers WHERE ${whereClause}`,
        params
      );
      const total = countResult[0].total;

      // 获取分页数据
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const [rows] = await pool.query(
        `SELECT * FROM customers WHERE ${whereClause} ORDER BY id DESC LIMIT ${safePageSize} OFFSET ${offset}`,
        params
      );

      return {
        items: rows,
        total,
        page,
        pageSize,
      };
    } catch (error) {
      logger.error('获取客户列表失败:', error);
      throw error;
    }
  },

  async getCustomerById(id) {
    try {
      const [rows] = await pool.query('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [id]);
      return rows[0];
    } catch (error) {
      logger.error(`获取客户详情失败 (ID: ${id}):`, error);
      throw error;
    }
  },

  async createCustomer(data) {
    try {
      const {
        code,
        name,
        contact_person,
        contact_phone,
        email,
        address,
        status,
        remark,
        customer_type = 'direct',
        credit_limit = 0,
      } = data;

      // 如果没有提供客户编码，自动生成一个
      let customerCode = code;
      if (!customerCode) {
        // 生成客户编码：KH + 年月 + 4位序号
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0');

        // 查询当月最大序号
        const [maxResult] = await pool.query(
          'SELECT MAX(CAST(SUBSTRING(code, 7) AS UNSIGNED)) as max_seq FROM customers WHERE code LIKE ?',
          [`KH${year}${month}%`]
        );

        const sequence = ((maxResult[0]?.max_seq || 0) + 1).toString().padStart(4, '0');
        customerCode = `KH${year}${month}${sequence}`;
      }

      const sql = `
        INSERT INTO customers
        (code, name, contact_person, contact_phone, email, address, status, remark, customer_type, credit_limit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const [result] = await pool.query(sql, [
        customerCode,
        name,
        contact_person || null,
        contact_phone || null,
        email || null,
        address || null,
        status === undefined || status === '' ? 1 : status, // 默认为1（启用）
        remark || null,
        customer_type || 'direct',
        credit_limit || 0,
      ]);

      // 获取插入的完整记录
      const [newCustomer] = await pool.query('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [
        result.insertId,
      ]);
      return newCustomer[0];
    } catch (error) {
      logger.error('创建客户失败:', error);
      throw error;
    }
  },

  async updateCustomer(id, data) {
    try {
      // 验证客户是否存在
      const [existing] = await pool.query('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!existing || existing.length === 0) {
        throw new Error('客户不存在');
      }

      // 定义允许更新的字段及其值
      const validFields = {
        code: data.code,
        name: data.name,
        contact_person: data.contact_person,
        contact_phone: data.contact_phone,
        email: data.email,
        address: data.address,
        status: data.status === undefined || data.status === '' ? undefined : data.status,
        remark: data.remark,
        customer_type: data.customer_type,
        credit_limit: data.credit_limit === undefined ? undefined : data.credit_limit || 0,
      };

      // 过滤掉未定义的字段
      const updateFields = Object.entries(validFields)
        .filter(([_, value]) => value !== undefined)
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});

      if (Object.keys(updateFields).length === 0) {
        return existing[0];
      }

      // 构建 SQL 更新语句
      const fields = Object.keys(updateFields)
        .map((key) => `${key} = ?`)
        .join(', ');
      const values = [...Object.values(updateFields), id];

      // 执行更新
      await pool.query(`UPDATE customers SET ${fields} WHERE id = ?`, values);

      // 获取并返回更新后的完整数据
      const [updated] = await pool.query('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [id]);
      return updated[0];
    } catch (error) {
      logger.error('更新客户失败:', error);
      throw error;
    }
  },

  async deleteCustomer(id) {
    try {
      // 检查是否有关联的销售订单
      const [orders] = await pool.query(
        'SELECT COUNT(*) as count FROM sales_orders WHERE customer_id = ?',
        [id]
      );
      if (orders[0].count > 0) {
        throw new Error('该客户有关联的销售订单，不能删除');
      }

      // ✅ 软删除替代硬删除
      await softDelete(pool, 'customers', 'id', id);
      return true;
    } catch (error) {
      logger.error('删除客户失败:', error);
      throw error;
    }
  },

  // 获取客户统计数据（避免全量加载）
  async getCustomerStats() {
    try {
      const [rows] = await pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 1 OR status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 0 OR status = 'inactive' THEN 1 ELSE 0 END) as inactive,
          COALESCE(SUM(credit_limit), 0) as totalCredit
        FROM customers
      `);
      return rows[0];
    } catch (error) {
      logger.error('获取客户统计失败:', error);
      throw error;
    }
  },

  // ========== 统一命名别名 - 保持向后兼容 ==========
  getAll(page = 1, pageSize = 10, filters = {}) {
    return this.getAllCustomers(page, pageSize, filters);
  },
  getById(id) {
    return this.getCustomerById(id);
  },
  create(data) {
    return this.createCustomer(data);
  },
  update(id, data) {
    return this.updateCustomer(id, data);
  },
  delete(id) {
    return this.deleteCustomer(id);
  },
};

module.exports = customerService;
