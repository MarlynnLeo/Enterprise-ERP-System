/**
 * ordersController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');

const { orders } = require('../../config/db');

const getOrders = (req, res) => {
  res.json(orders);
};

const createOrder = (req, res) => {
  const { customer_id, order_date, delivery_date, total_amount, status, remark, items } = req.body;

  const newOrder = {
    id: orders.length + 1,
    customer_id,
    order_date,
    delivery_date,
    total_amount,
    status: status || 'pending',
    remark,
    items: items.map((item) => ({
      material_code: item.material_code,
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount: item.amount,
    })),
    createdAt: new Date().toISOString().split('T')[0],
  };

  orders.push(newOrder);
  ResponseHandler.success(res, newOrder, '创建成功', 201);
};

const updateOrder = (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const order = orders.find((o) => o.id === parseInt(id));

  if (!order) {
    return ResponseHandler.error(res, 'Order not found', 'NOT_FOUND', 404);
  }

  order.status = status || order.status;
  res.json(order);
};

module.exports = {
  getOrders,
  createOrder,
  updateOrder,
};
