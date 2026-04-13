/**
 * 成品销售追溯控制器
 * 处理成品从生产到销售的完整追溯链路
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const ProductSalesTraceabilityService = require('../../../services/business/ProductSalesTraceabilityService');
const db = require('../../../config/db');

const productSalesTraceabilityController = {
  /**
   * 获取成品的完整追溯链路
   * 从原材料批次 → 生产 → 成品批次 → 销售 → 客户
   */
  async getProductFullTraceability(req, res) {
    try {
      const { productCode, batchNumber } = req.params;

      if (!productCode || !batchNumber) {
        return ResponseHandler.error(res, '产品编码和批次号不能为空', 'BAD_REQUEST', 400);
      }

      const result = await ProductSalesTraceabilityService.getProductFullTraceability(
        productCode,
        batchNumber
      );

      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      logger.error('获取成品完整追溯失败:', error);
      ResponseHandler.error(res, '获取成品完整追溯失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 反向追溯：根据客户查找使用的原材料批次
   */
  async getCustomerMaterialTraceability(req, res) {
    try {
      const { customerId } = req.params;
      const { productCode } = req.query;

      if (!customerId) {
        return ResponseHandler.error(res, '客户ID不能为空', 'BAD_REQUEST', 400);
      }

      const result = await ProductSalesTraceabilityService.getCustomerMaterialTraceability(
        parseInt(customerId),
        productCode
      );

      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      logger.error('获取客户原材料追溯失败:', error);
      ResponseHandler.error(res, '获取客户原材料追溯失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取所有客户列表（用于追溯查询）
   */
  async getCustomerList(req, res) {
    try {
      const connection = await db.pool.getConnection();
      try {
        const [customers] = await connection.execute(`
          SELECT 
            c.id,
            c.name,
            c.contact_person,
            c.phone,
            COUNT(DISTINCT pst.outbound_id) as order_count,
            MAX(pst.delivery_date) as last_delivery_date
          FROM customers c
          LEFT JOIN product_sales_traceability pst ON c.id = pst.customer_id
          GROUP BY c.id, c.name, c.contact_person, c.phone
          ORDER BY last_delivery_date DESC, c.name ASC
        `);
        ResponseHandler.success(res, customers, '操作成功');
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('获取客户列表失败:', error);
      ResponseHandler.error(res, '获取客户列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取成品销售统计信息
   */
  async getProductSalesStatistics(req, res) {
    try {
      const connection = await db.pool.getConnection();
      try {
        const [salesStats] = await connection.execute(`
          SELECT 
            COUNT(DISTINCT pst.customer_id) as total_customers,
            COUNT(DISTINCT pst.outbound_no) as total_outbound_orders,
            COUNT(DISTINCT pst.product_code) as total_products,
            SUM(pst.allocated_quantity) as total_quantity_sold,
            COUNT(*) as total_traceability_records
          FROM product_sales_traceability pst
        `);

        const [recentSales] = await connection.execute(`
          SELECT 
            pst.outbound_no,
            pst.customer_name,
            pst.product_code,
            pst.product_name,
            pst.allocated_quantity,
            pst.delivery_date
          FROM product_sales_traceability pst
          ORDER BY pst.delivery_date DESC, pst.created_at DESC
          LIMIT 10
        `);

        const [topProducts] = await connection.execute(`
          SELECT 
            pst.product_code,
            pst.product_name,
            SUM(pst.allocated_quantity) as total_sold,
            COUNT(DISTINCT pst.customer_id) as customer_count
          FROM product_sales_traceability pst
          GROUP BY pst.product_code, pst.product_name
          ORDER BY total_sold DESC
          LIMIT 10
        `);

        res.json({
          success: true,
          data: {
            statistics: salesStats[0] || {},
            recent_sales: recentSales,
            top_products: topProducts,
          },
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('获取销售统计失败:', error);
      ResponseHandler.error(res, '获取销售统计失败', 'SERVER_ERROR', 500, error);
    }
  },



  /**
   * 获取原材料到客户的完整追溯链路
   */
  async getMaterialToCustomerTrace(req, res) {
    try {
      const { materialCode, batchNumber } = req.params;

      if (!materialCode || !batchNumber) {
        return ResponseHandler.error(res, '原材料编码和批次号不能为空', 'BAD_REQUEST', 400);
      }

      const connection = await db.pool.getConnection();
      let traceChain;
      try {
        [traceChain] = await connection.execute(
          `
          SELECT 
            m1.code as raw_material_code,
            m1.name as raw_material_name,
            br.parent_batch_number as raw_material_batch,
            source_vbs.supplier_name,
            source_vbs.receipt_date,
            m2.code as product_code,
            m2.name as product_name,
            br.child_batch_number as product_batch,
            target_vbs.production_date,
            pst.customer_name,
            pst.outbound_no,
            pst.allocated_quantity,
            pst.delivery_date,
            br.consumed_quantity as consumed_quantity
          FROM batch_relationships br
          LEFT JOIN v_batch_stock source_vbs ON br.parent_batch_number = source_vbs.batch_number
          LEFT JOIN materials m1 ON source_vbs.material_id = m1.id
          LEFT JOIN v_batch_stock target_vbs ON br.child_batch_number = target_vbs.batch_number  
          LEFT JOIN materials m2 ON target_vbs.material_id = m2.id
          LEFT JOIN product_sales_traceability pst ON br.child_batch_number = pst.product_batch_number
          WHERE m1.code = ? 
          AND br.parent_batch_number = ?
          AND br.relationship_type = 'consume'
          ORDER BY target_vbs.production_date ASC, pst.delivery_date ASC
        `,
          [materialCode, batchNumber]
        );
      } finally {
        connection.release();
      }

      if (traceChain.length === 0) {
        return res.status(404).json({
          success: false,
          message: `未找到原材料 ${materialCode} - ${batchNumber} 的追溯记录`,
        });
      }

      // 按成品批次分组
      const groupedTrace = {};
      traceChain.forEach((record) => {
        const key = `${record.product_code}-${record.product_batch}`;
        if (!groupedTrace[key]) {
          groupedTrace[key] = {
            raw_material: {
              code: record.raw_material_code,
              name: record.raw_material_name,
              batch: record.raw_material_batch,
              supplier: record.supplier_name,
              receipt_date: record.receipt_date,
              consumed_quantity: record.consumed_quantity,
            },
            product: {
              code: record.product_code,
              name: record.product_name,
              batch: record.product_batch,
              production_date: record.production_date,
            },
            sales: [],
          };
        }

        if (record.customer_name) {
          groupedTrace[key].sales.push({
            customer_name: record.customer_name,
            outbound_no: record.outbound_no,
            quantity: record.allocated_quantity,
            delivery_date: record.delivery_date,
          });
        }
      });

      res.json({
        success: true,
        data: {
          material_info: {
            code: materialCode,
            batch: batchNumber,
          },
          trace_chain: Object.values(groupedTrace),
          summary: {
            products_produced: Object.keys(groupedTrace).length,
            total_customers: new Set(
              traceChain.filter((r) => r.customer_name).map((r) => r.customer_name)
            ).size,
            total_sales: traceChain
              .filter((r) => r.allocated_quantity)
              .reduce((sum, r) => sum + parseFloat(r.allocated_quantity), 0),
          },
        },
      });
    } catch (error) {
      logger.error('获取原材料到客户追溯失败:', error);
      ResponseHandler.error(res, '获取原材料到客户追溯失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = productSalesTraceabilityController;
