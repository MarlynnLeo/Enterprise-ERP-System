/**
 * salesDao.js
 * @description 销售与客户模块数据访问对象 (DAO)
 * 专职处理原混杂在 db.js 中的业务数据 CRUD 逻辑
 */
const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { calculateLines, normalizeTaxRate } = require('../utils/money');
const { financeConfig } = require('../config/financeConfig');

class SalesDao {
  // ==========================================
  // 客户查询 (Customers)
  // ==========================================
  static async getCustomers() {
    const [rows] = await pool.execute('SELECT id, code, name, contact_person, phone, email, address, credit_limit, status, created_at, updated_at, contact_phone, remark, customer_type, deleted_at FROM customers');
    return rows;
  }

  static async getCustomer(id) {
    const [rows] = await pool.execute('SELECT id, code, name, contact_person, phone, email, address, credit_limit, status, created_at, updated_at, contact_phone, remark, customer_type, deleted_at FROM customers WHERE id = ?', [id]);
    return rows[0];
  }

  static async createCustomer(customer) {
    const [result] = await pool.execute(
      'INSERT INTO customers (name, contact_person, phone, email, address, status) VALUES (?, ?, ?, ?, ?, ?)',
      [
        customer.name,
        customer.contactPerson,
        customer.phone,
        customer.email,
        customer.address,
        customer.status,
      ]
    );
    return { id: result.insertId, ...customer };
  }

  static async updateCustomer(id, customer) {
    await pool.execute(
      'UPDATE customers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, status = ? WHERE id = ?',
      [
        customer.name,
        customer.contactPerson,
        customer.phone,
        customer.email,
        customer.address,
        customer.status,
        id,
      ]
    );
    return { id, ...customer };
  }

  // ==========================================
  // 销售报价单 (Sales Quotations)
  // ==========================================
  static async getSalesQuotations() {
    const [rows] = await pool.execute(`
      SELECT sq.*, c.name as customer_name, COALESCE(NULLIF(TRIM(u.real_name), ''), u.username) as created_by_name
      FROM sales_quotations sq
      JOIN customers c ON sq.customer_id = c.id
      JOIN users u ON sq.created_by = u.id
    `);
    return rows;
  }

  static async getSalesQuotation(id) {
    const [quotation] = await pool.execute(`
      SELECT sq.*, c.name as customer_name, COALESCE(NULLIF(TRIM(u.real_name), ''), u.username) as created_by_name
      FROM sales_quotations sq
      JOIN customers c ON sq.customer_id = c.id
      JOIN users u ON sq.created_by = u.id
      WHERE sq.id = ?
    `, [id]);

    const [items] = await pool.execute(`
      SELECT sqi.*, i.name as product_name
      FROM sales_quotation_items sqi
      JOIN materials i ON sqi.product_id = i.id
      WHERE sqi.quotation_id = ?
    `, [id]);

    return { ...quotation[0], items };
  }

  static async createSalesQuotation(quotation, items) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const quotationAmounts = calculateLines(Array.isArray(items) ? items : [], {
        defaultTaxRate: quotation.taxRate ?? quotation.tax_rate ?? 0,
      });

      const [result] = await connection.execute(
        'INSERT INTO sales_quotations (quotation_no, customer_id, total_amount, validity_date, status, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [quotation.quotationNo, quotation.customerId, quotationAmounts.totalAmount, quotation.validityDate, quotation.status, quotation.remarks, quotation.createdBy]
      );
      const quotationId = result.insertId;

      for (const item of quotationAmounts.items) {
        await connection.execute(
          'INSERT INTO sales_quotation_items (quotation_id, product_id, quantity, unit_price, discount_percent, tax_percent, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [quotationId, item.productId ?? item.product_id, item.quantity, item.unit_price, item.discountPercent ?? item.discount_percent ?? 0, item.tax_percent, item.total_price]
        );
      }

      await connection.commit();
      return { id: quotationId, ...quotation, totalAmount: quotationAmounts.totalAmount, items: quotationAmounts.items };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==========================================
  // 销售订单 (Sales Orders)
  // ==========================================
  static async getLastOrderNoOfDay(dateStr) {
    const [rows] = await pool.execute(`
      SELECT order_no
      FROM sales_orders
      WHERE order_no LIKE ?
      ORDER BY order_no DESC
      LIMIT 1
    `, [`DD${dateStr}%`]);
    return rows[0]?.order_no;
  }

  static async getSalesOrders() {
    try {
      const [orders] = await pool.execute(`
        SELECT so.*, c.name as customer_name, c.contact_person, c.contact_phone, c.address as delivery_address
        FROM sales_orders so
        JOIN customers c ON so.customer_id = c.id
      `);

      if (orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        const [allItems] = await pool.execute(`
          SELECT soi.*, COALESCE(m.code, '') as material_code, m.name as material_name,
                 m.specs as specification, u.name as unit_name,
                 CASE WHEN m.id IS NULL THEN 0 ELSE 1 END as material_exists
          FROM sales_order_items soi
          LEFT JOIN materials m ON soi.material_id = m.id
          LEFT JOIN units u ON m.unit_id = u.id
          WHERE soi.order_id IN (?)
        `, [orderIds]);

        const itemsByOrder = {};
        allItems.forEach(item => {
          if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
          itemsByOrder[item.order_id].push(item);
        });

        orders.forEach(order => {
          order.items = itemsByOrder[order.id] || [];
        });
      }
      return orders;
    } catch (error) {
      logger.error('Error in getSalesOrders:', error);
      return [];
    }
  }

  static async getSalesOrder(id) {
    const [order] = await pool.execute(`
      SELECT so.*, c.id as customer_id, c.name as customer_name, c.contact_person, c.contact_phone,
             c.address as delivery_address, COALESCE(NULLIF(TRIM(u.real_name), ''), u.username) as created_by_name
      FROM sales_orders so
      JOIN customers c ON so.customer_id = c.id
      JOIN users u ON so.created_by = u.id
      WHERE so.id = ?
    `, [id]);

    const [items] = await pool.execute(`
      SELECT soi.*, COALESCE(m.code, '') as material_code, m.name as material_name,
             m.specs as specification, u.name as unit_name,
             CASE WHEN m.id IS NULL THEN 0 ELSE 1 END as material_exists
      FROM sales_order_items soi
      LEFT JOIN materials m ON soi.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE soi.order_id = ?
    `, [id]);

    return { ...order[0], items };
  }

  static async createSalesOrder(order, items) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        'INSERT INTO sales_orders (order_no, customer_id, quotation_id, contract_code, total_amount, tax_rate, tax_amount, subtotal, payment_terms, delivery_date, status, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [order.orderNo, order.customerId, order.quotationId, order.contractCode, order.totalAmount, normalizeTaxRate(order.taxRate, financeConfig.get('tax.defaultVATRate', 0.13)), order.taxAmount || 0, order.subtotal || 0, order.paymentTerms, order.deliveryDate, order.status, order.remarks, order.createdBy]
      );
      const orderId = result.insertId;

      for (const item of items) {
        // 注意: sales_order_items 使用 tax_percent 字段（等价于 purchase_order_items.tax_rate）
        // 两者含义相同（小数制，0.13 = 13%），仅字段名不同，历史原因保留
        await connection.execute(
          'INSERT INTO sales_order_items (order_id, material_id, quantity, unit_price, amount, tax_percent, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [orderId, item.material_id, item.quantity, item.unit_price, item.amount, item.tax_percent !== undefined ? item.tax_percent : financeConfig.get('tax.defaultVATRate', 0.13), item.remark]
        );
      }

      await connection.commit();
      return { id: orderId, ...order, items };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateSalesOrder(id, order, items, existingConnection = null) {
    const connection = existingConnection || (await pool.getConnection());
    const ownsConnection = !existingConnection;
    try {
      if (ownsConnection) await connection.beginTransaction();

      const remarks = order.notes || order.remarks || '';
      const orderAmounts = calculateLines(items || [], {
        defaultTaxRate: order.tax_rate !== undefined ? order.tax_rate : financeConfig.get('tax.defaultVATRate', 0.13),
      });
      const totalAmount = orderAmounts.totalAmount;
      const taxRate = normalizeTaxRate(order.tax_rate !== undefined ? order.tax_rate : orderAmounts.taxRate, financeConfig.get('tax.defaultVATRate', 0.13));
      const subtotal = orderAmounts.subtotal;
      const taxAmount = orderAmounts.taxAmount;

      await connection.execute(
        'UPDATE sales_orders SET customer_id = ?, contract_code = ?, total_amount = ?, tax_rate = ?, tax_amount = ?, subtotal = ?, payment_terms = ?, delivery_date = ?, status = ?, remarks = ?, updated_at = NOW() WHERE id = ?',
        [order.customer_id, order.contract_code || '', totalAmount, taxRate, taxAmount, subtotal, order.payment_terms || null, order.delivery_date || null, order.status || 'pending', remarks, id]
      );

      await connection.execute('DELETE FROM sales_order_items WHERE order_id = ?', [id]);

      for (const item of orderAmounts.items) {
        const qty = item.quantity;
        const price = item.unit_price;
        await connection.execute(
          'INSERT INTO sales_order_items (order_id, material_id, quantity, unit_price, amount, tax_percent, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, item.material_id, qty, price, item.amount, item.tax_percent, item.remark || '']
        );
      }

      if (ownsConnection) await connection.commit();
      return { id, ...order, total_amount: totalAmount, items: orderAmounts.items };
    } catch (error) {
      if (ownsConnection) await connection.rollback();
      throw error;
    } finally {
      if (ownsConnection) connection.release();
    }
  }

  static async updateSalesOrderStatus(orderId, status) {
    await pool.execute('UPDATE sales_orders SET status = ?, updated_at = NOW() WHERE id = ?', [status, orderId]);
    return true;
  }
}

module.exports = SalesDao;
