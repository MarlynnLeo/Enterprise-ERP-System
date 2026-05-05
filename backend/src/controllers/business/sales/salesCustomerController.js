/**
 * salesCustomerController.js
 * @description 销售客户控制器
 * @date 2025-08-27
 * @version 1.1.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const SalesDao = require('../../../database/salesDao');
const customerService = require('../../../services/customerService');
const materialService = require('../../../services/materialService');

exports.getCustomersList = async (req, res) => {
  try {
    // 获取所有客户，不分页
    const result = await customerService.getAllCustomers(1, 1000);

    // 返回客户列表，直接返回items数组
    res.json(result.items || []);
  } catch (error) {
    logger.error('Error getting customers list:', error);
    ResponseHandler.error(res, 'Error getting customers list', 'SERVER_ERROR', 500, error);
  }
};


exports.getProductsList = async (req, res) => {
  try {
    // 不使用type过滤，获取所有物料
    const products = await materialService.getAllMaterials(1, 1000);

    // materialService.getAllMaterials 返回 { data, pagination }
    const items = products?.data || products?.list || products?.items || [];
    res.json(items);
  } catch (error) {
    logger.error('Error getting products list:', error);
    ResponseHandler.error(res, 'Error getting products list', 'SERVER_ERROR', 500, error);
  }
};

// Customer Controllers

exports.getCustomers = async (req, res) => {
  try {
    const { keyword, limit = 50 } = req.query;

    let query =
      'SELECT id, name, code, contact_person, contact_phone, address FROM customers WHERE deleted_at IS NULL';
    const params = [];

    // 如果有搜索关键词，添加搜索条件
    if (keyword && keyword.trim()) {
      query += ' AND (name LIKE ? OR code LIKE ?)';
      const searchTerm = `%${keyword.trim()}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY name ASC';

    // 添加限制条数
    if (limit) {
      const safeLimit = parseInt(limit, 10) || 100;
      query += ` LIMIT ${safeLimit}`;
    }

    const { getConnection } = require('../../../config/db');
    const connection = await getConnection();

    try {
      const [customers] = await connection.query(query, params);

      // 格式化返回数据
      const formattedCustomers = customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        code: customer.code,
        contact_person: customer.contact_person,
        contact: customer.contact_person, // 兼容字段
        contact_phone: customer.contact_phone,
        phone: customer.contact_phone, // 兼容字段
        delivery_address: customer.delivery_address,
        address: customer.delivery_address, // 兼容字段
      }));

      ResponseHandler.success(res, formattedCustomers, '操作成功');
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Error getting customers:', error);
    ResponseHandler.error(res, 'Error getting customers', 'SERVER_ERROR', 500, error);
  }
};


exports.getCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;

    const { getConnection } = require('../../../config/db');
    const connection = await getConnection();

    try {
      const [customers] = await connection.query(
        'SELECT id, name, code, contact_person, contact_phone, delivery_address FROM customers WHERE id = ? AND deleted_at IS NULL',
        [customerId]
      );

      if (customers.length === 0) {
        return ResponseHandler.error(res, 'Customer not found', 'NOT_FOUND', 404);
      }

      const customer = customers[0];

      // 格式化返回数据
      const formattedCustomer = {
        id: customer.id,
        name: customer.name,
        code: customer.code,
        contact_person: customer.contact_person,
        contact: customer.contact_person, // 兼容字段
        contact_phone: customer.contact_phone,
        phone: customer.contact_phone, // 兼容字段
        delivery_address: customer.delivery_address,
        address: customer.delivery_address, // 兼容字段
      };

      ResponseHandler.success(res, formattedCustomer, '操作成功');
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Error getting customer:', error);
    ResponseHandler.error(res, 'Error getting customer', 'SERVER_ERROR', 500, error);
  }
};


exports.createCustomer = async (req, res) => {
  try {
    const customer = await SalesDao.createCustomer(req.body);
    ResponseHandler.success(res, customer, '创建成功', 201);
  } catch (error) {
    logger.error('Error creating customer:', error);
    ResponseHandler.error(res, 'Error creating customer', 'SERVER_ERROR', 500, error);
  }
};


exports.updateCustomer = async (req, res) => {
  try {
    const customer = await SalesDao.updateCustomer(req.params.id, req.body);
    res.json(customer);
  } catch (error) {
    logger.error('Error updating customer:', error);
    ResponseHandler.error(res, 'Error updating customer', 'SERVER_ERROR', 500, error);
  }
};

// Sales Quotation Controllers

exports.getCustomerOrderProducts = async (req, res) => {
  let connection;
  try {
    const { customerId } = req.params;
    const { search } = req.query; // 获取搜索参数

    if (!customerId) {
      return ResponseHandler.error(res, '客户ID不能为空', 'BAD_REQUEST', 400);
    }

    connection = await db.pool.getConnection();

    // 构建搜索条件
    let searchCondition = '';
    const queryParams = [customerId];

    if (search && search.trim()) {
      // 支持合同编码、产品编码、产品规格搜索
      searchCondition = ` AND(
    so.contract_code LIKE ? OR 
        m.code LIKE ? OR 
        m.name LIKE ? OR 
        m.specs LIKE ?
      )`;
      const searchTerm = `%${search.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // 获取客户所有订单的产品明细，包含每个订单的详细信息
    const [rawProducts] = await connection.query(
      `
  SELECT
  so.id as order_id,
    so.order_no,
    so.contract_code,
    soi.material_id,
    m.code as material_code,
    m.name as material_name,
    m.specs as specification,
    u.name as unit_name,
    m.unit_id,
    soi.quantity as ordered_quantity,
    soi.unit_price,
    soi.amount,
    COALESCE(shipped.shipped_quantity, 0) as shipped_quantity,
    (soi.quantity - COALESCE(shipped.shipped_quantity, 0)) as remaining_quantity,
    COALESCE(stock.total_stock, 0) as stock_quantity,
    CASE 
          WHEN COALESCE(shipped.shipped_quantity, 0) = 0 THEN 'unshipped'
          WHEN COALESCE(shipped.shipped_quantity, 0) >= soi.quantity THEN 'fully_shipped'
          ELSE 'partial_shipped'
  END as shipping_status
      FROM sales_orders so
      INNER JOIN sales_order_items soi ON so.id = soi.order_id
      LEFT JOIN materials m ON soi.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN(
    SELECT 
          soi2.material_id,
    soi2.order_id,
    SUM(sobi.quantity) as shipped_quantity
        FROM sales_order_items soi2
        INNER JOIN sales_outbound_items sobi ON soi2.material_id = sobi.product_id
        INNER JOIN sales_outbound sob ON sobi.outbound_id = sob.id
        WHERE sob.status IN('completed', 'processing')
          AND(
      --单订单出库：直接匹配order_id
            sob.order_id = soi2.order_id
            OR
            --多订单出库：检查related_orders字段
      (sob.is_multi_order = 1 AND sob.related_orders IS NOT NULL
             AND(
        JSON_CONTAINS(sob.related_orders, CAST(soi2.order_id AS JSON))
               OR sob.related_orders LIKE CONCAT('%', soi2.order_id, '%')
      ))
    )
        GROUP BY soi2.material_id, soi2.order_id
  ) shipped ON soi.material_id = shipped.material_id AND soi.order_id = shipped.order_id
      LEFT JOIN(
    SELECT \n          material_id,\n    SUM(total_by_location) as total_stock\n        FROM(\n      SELECT \n            il.material_id,\n      il.location_id,\n      SUM(il.quantity) as total_by_location\n          FROM inventory_ledger il\n          JOIN materials mat ON il.material_id = mat.id\n          WHERE mat.location_id IS NULL OR il.location_id = mat.location_id\n          GROUP BY il.material_id, il.location_id\n          HAVING SUM(il.quantity) > 0\n    ) location_stock\n        GROUP BY material_id
  ) stock ON soi.material_id = stock.material_id
      WHERE so.customer_id = ?
    AND so.status IN('confirmed', 'in_production', 'ready_to_ship', 'partial_shipped')
  AND(soi.quantity - COALESCE(shipped.shipped_quantity, 0)) > 0
        ${searchCondition}
      ORDER BY material_code, so.order_no
    `,
      queryParams
    );

    // 按物料合并，但保留每个订单的详细信息
    const materialMap = new Map();

    rawProducts.forEach((item) => {
      const key = item.material_id;
      if (!materialMap.has(key)) {
        materialMap.set(key, {
          material_id: item.material_id,
          material_code: item.material_code,
          material_name: item.material_name,
          specification: item.specification,
          unit_name: item.unit_name,
          unit_id: item.unit_id,
          unit_price: item.unit_price,
          stock_quantity: item.stock_quantity,
          total_ordered_quantity: 0,
          total_shipped_quantity: 0,
          total_remaining_quantity: 0,
          orders: [],
          order_ids: [],
          order_nos: [],
          contract_codes: [], // 添加合同编码数组
        });
      }

      const material = materialMap.get(key);
      material.total_ordered_quantity += parseFloat(item.ordered_quantity) || 0;
      material.total_shipped_quantity += parseFloat(item.shipped_quantity) || 0;
      material.total_remaining_quantity += parseFloat(item.remaining_quantity) || 0;

      // 保存每个订单的详细信息
      material.orders.push({
        order_id: item.order_id,
        order_no: item.order_no,
        contract_code: item.contract_code,
        ordered_quantity: item.ordered_quantity,
        shipped_quantity: item.shipped_quantity,
        remaining_quantity: item.remaining_quantity,
        shipping_status: item.shipping_status,
      });

      material.order_ids.push(item.order_id);
      material.order_nos.push(item.order_no);
      if (item.contract_code) {
        material.contract_codes.push(item.contract_code);
      }
    });

    // 转换为数组并格式化
    const products = Array.from(materialMap.values()).map((material) => ({
      material_id: material.material_id,
      material_code: material.material_code,
      material_name: material.material_name,
      specification: material.specification,
      unit_name: material.unit_name,
      unit_id: material.unit_id,
      unit_price: material.unit_price,
      stock_quantity: material.stock_quantity,
      ordered_quantity: material.total_ordered_quantity,
      shipped_quantity: material.total_shipped_quantity,
      remaining_quantity: material.total_remaining_quantity,
      shipping_status:
        material.total_shipped_quantity === 0
          ? 'unshipped'
          : material.total_shipped_quantity >= material.total_ordered_quantity
            ? 'fully_shipped'
            : 'partial_shipped',
      // 保留原有格式的字段
      order_ids: material.order_ids.join(','),
      order_nos: material.order_nos.join(', '),
      contract_codes: material.contract_codes.join(', '), // 添加合同编码字段
      // 新增详细订单信息
      order_details: material.orders,
    }));

    ResponseHandler.success(res, products, '操作成功');
  } catch (error) {
    logger.error('获取客户订单产品失败:', error);
    ResponseHandler.error(res, '获取客户订单产品失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * 获取指定物料的销售出库历史
 * GET /api/sales/outbound/material/:materialId
 */
