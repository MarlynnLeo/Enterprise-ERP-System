/**
 * 成品销售追溯服务
 * 实现从原材料批次到客户的完整追溯链路
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');

class ProductSalesTraceabilityService {
  /**
   * 处理成品销售出库时的追溯记录
   * @param {Object} salesData - 销售出库数据
   */
  /**
   * 处理成品销售出库时的追溯记录
   * @param {Object} salesData - 销售出库数据
   * @param {Object} [externalConnection] - 外部数据库连接（可选）
   */
  static async handleProductSalesOutbound(salesData, externalConnection = null) {
    const connection = externalConnection || (await db.pool.getConnection());
    const shouldRelease = !externalConnection;

    try {
      if (shouldRelease) {
        await connection.beginTransaction();
      }

      const {
        outbound_id,
        outbound_no,
        order_id,
        customer_id,
        delivery_date,
        items, // 销售的产品明细
        operator,
      } = salesData;

      logger.info(`🚚 处理成品销售出库追溯: ${outbound_no}, 客户ID: ${customer_id}`);

      // 为每个销售的产品建立追溯关系
      for (const item of items) {
        await this.createProductSalesTraceability(connection, {
          outbound_id,
          outbound_no,
          order_id,
          customer_id,
          delivery_date,
          product_id: item.product_id,
          quantity: item.quantity,
          operator,
        });
      }

      if (shouldRelease) {
        await connection.commit();
      }

      return {
        success: true,
        outbound_no,
        traced_items: items.length,
      };
    } catch (error) {
      if (shouldRelease) {
        await connection.rollback();
      }
      logger.error('处理成品销售追溯失败:', error);
      throw error;
    } finally {
      if (shouldRelease) {
        connection.release();
      }
    }
  }

  /**
   * 为单个产品创建销售追溯关系 (单表架构版本)
   */
  static async createProductSalesTraceability(connection, data) {
    try {
      const {
        outbound_id,
        outbound_no,
        order_id,
        customer_id,
        delivery_date,
        product_id,
        quantity,
        operator,
      } = data;

      // 1. 获取产品信息
      const [productResult] = await connection.execute(
        `
        SELECT code, name FROM materials WHERE id = ?
      `,
        [product_id]
      );

      if (!productResult || productResult.length === 0) {
        throw new Error(`未找到产品ID: ${product_id}`);
      }

      const product = productResult[0];

      // 2. 获取客户信息
      const [customerResult] = await connection.execute(
        `
        SELECT name, contact_person FROM customers WHERE id = ? AND deleted_at IS NULL
      `,
        [customer_id]
      );

      const customer = customerResult[0] || { name: '未知客户', contact_person: '' };

      // 3. 使用FIFO原则获取成品批次
      const usedBatches = await this.allocateProductBatchesFIFO(connection, product_id, quantity);

      // 4. 为每个使用的成品批次创建销售追溯记录
      const InventoryService = require('../InventoryService');

      for (const batch of usedBatches) {
        // 创建成品销售追溯记录
        await connection.execute(
          `
          INSERT INTO product_sales_traceability (
            outbound_id, outbound_no, order_id, customer_id, customer_name,
            product_id, product_code, product_name, product_batch_number,
            allocated_quantity, delivery_date, operator, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
          [
            outbound_id,
            outbound_no,
            order_id,
            customer_id,
            customer.name,
            product_id,
            product.code,
            product.name,
            batch.batch_number,
            batch.allocated_quantity,
            delivery_date,
            operator,
          ]
        );

        // ✅ 使用 InventoryService 更新库存
        await InventoryService.updateStock(
          {
            materialId: product_id,
            locationId: batch.location_id,
            quantity: -batch.allocated_quantity,
            transactionType: 'sales_outbound',
            referenceNo: outbound_no,
            referenceType: 'sales_outbound',
            operator: operator || 'system',
            remark: `销售出库给客户: ${customer.name}`,
            batchNumber: batch.batch_number,
          },
          connection
        );
      }
    } catch (error) {
      logger.error('创建产品销售追溯失败:', error);
      throw error;
    }
  }

  /**
   * 使用FIFO原则分配成品批次 (单表架构版本)
   */
  static async allocateProductBatchesFIFO(connection, productId, requiredQuantity) {
    try {
      // ✅ 从 v_batch_stock 视图获取FIFO批次
      const [availableBatches] = await connection.execute(
        `
        SELECT
          batch_number,
          current_quantity as available_quantity,
          location_id,
          receipt_date
        FROM v_batch_stock
        WHERE material_id = ?
          AND current_quantity > 0
        ORDER BY receipt_date ASC
          `,
        [productId]
      );

      const allocatedBatches = [];
      let remainingQuantity = requiredQuantity;

      for (const batch of availableBatches) {
        if (remainingQuantity <= 0) break;

        const allocatedQuantity = Math.min(batch.available_quantity, remainingQuantity);

        allocatedBatches.push({
          batch_number: batch.batch_number,
          location_id: batch.location_id,
          allocated_quantity: allocatedQuantity,
          before_quantity: batch.available_quantity,
        });

        remainingQuantity -= allocatedQuantity;
      }

      if (remainingQuantity > 0) {
        throw new Error(`成品库存不足，产品ID: ${productId}, 缺少数量: ${remainingQuantity}`);
      }

      return allocatedBatches;
    } catch (error) {
      logger.error('FIFO分配成品批次失败:', error);
      throw error;
    }
  }

  /**
   * 获取成品的完整追溯链路 (单表架构版本)
   * @param {string} productCode - 产品编码
   * @param {string} batchNumber - 成品批次号
   */
  static async getProductFullTraceability(productCode, batchNumber) {
    const connection = await db.pool.getConnection();

    try {
      // ✅ 从 v_batch_stock 视图获取成品批次信息
      const [productBatch] = await connection.execute(
        `
        SELECT 
          vbs.*,
          m.code as material_code,
          m.name as material_name
        FROM v_batch_stock vbs
        LEFT JOIN materials m ON vbs.material_id = m.id
        WHERE m.code = ? AND vbs.batch_number = ?
          `,
        [productCode, batchNumber]
      );

      if (!productBatch || productBatch.length === 0) {
        throw new Error(`未找到成品批次: ${productCode} - ${batchNumber}`);
      }

      const batch = productBatch[0];

      // ✅ 获取原材料（基于 batch_relationships，使用 batch_number）
      const [rawMaterials] = await connection.execute(
        `
        SELECT 
          m.code as raw_material_code,
          m.name as raw_material_name,
          br.parent_batch_number as raw_material_batch,
          vbs.supplier_name,
          vbs.receipt_date,
          br.consumed_quantity as consumed_quantity
        FROM batch_relationships br
        LEFT JOIN v_batch_stock vbs ON br.parent_batch_number = vbs.batch_number
        LEFT JOIN materials m ON vbs.material_id = m.id
        WHERE br.child_batch_number = ? AND br.relationship_type = 'consume'
        ORDER BY vbs.receipt_date ASC
          `,
        [batchNumber]
      );

      // 获取销售记录（使用batch_number）
      const [salesRecords] = await connection.execute(
        `
        SELECT 
          pst.outbound_no,
          pst.customer_name,
          pst.allocated_quantity,
          pst.delivery_date,
          pst.created_at as sales_created_at,
          so.order_no,
          c.contact_person
        FROM product_sales_traceability pst
        LEFT JOIN sales_orders so ON pst.order_id = so.id
        LEFT JOIN customers c ON pst.customer_id = c.id
        WHERE pst.product_batch_number = ?
          ORDER BY pst.created_at DESC
          `,
        [batchNumber]
      );

      return {
        success: true,
        data: {
          product_batch: batch,
          raw_materials: rawMaterials,
          production_info: null,
          sales_records: salesRecords,
          traceability_summary: {
            raw_material_batches: rawMaterials.length,
            total_sales: salesRecords.reduce(
              (sum, record) => sum + parseFloat(record.allocated_quantity),
              0
            ),
            customers_count: new Set(salesRecords.map((r) => r.customer_name)).size,
            remaining_quantity: batch.current_quantity,
          },
        },
      };
    } catch (error) {
      logger.error('获取成品完整追溯失败:', error);
      return {
        success: false,
        message: error.message,
      };
    } finally {
      connection.release();
    }
  }

  /**
   * 反向追溯：根据客户查找使用的原材料批次 (单表架构版本)
   * @param {number} customerId - 客户ID
   * @param {string} productCode - 产品编码（可选）
   */
  static async getCustomerMaterialTraceability(customerId, productCode = null) {
    const connection = await db.pool.getConnection();

    try {
      let productFilter = '';
      const params = [customerId];

      if (productCode) {
        productFilter = 'AND pst.product_code = ?';
        params.push(productCode);
      }

      // ✅ 使用 batch_number 进行关联查询
      const [traceabilityData] = await connection.execute(
        `
        SELECT 
          pst.customer_name,
          pst.outbound_no,
          pst.delivery_date,
          pst.product_code,
          pst.product_name,
          pst.product_batch_number,
          pst.allocated_quantity,
          m.code as raw_material_code,
          m.name as raw_material_name,
          br.parent_batch_number as raw_material_batch,
          vbs.supplier_name,
          vbs.receipt_date,
          br.consumed_quantity as consumed_quantity
        FROM product_sales_traceability pst
        LEFT JOIN batch_relationships br ON pst.product_batch_number = br.child_batch_number AND br.relationship_type = 'consume'
        LEFT JOIN v_batch_stock vbs ON br.parent_batch_number = vbs.batch_number
        LEFT JOIN materials m ON vbs.material_id = m.id
        WHERE pst.customer_id = ? ${productFilter}
        ORDER BY pst.delivery_date DESC, vbs.receipt_date ASC
          `,
        params
      );

      // 按出库单分组整理数据
      const groupedData = {};
      traceabilityData.forEach((record) => {
        const key = record.outbound_no;
        if (!groupedData[key]) {
          groupedData[key] = {
            outbound_no: record.outbound_no,
            customer_name: record.customer_name,
            delivery_date: record.delivery_date,
            product_code: record.product_code,
            product_name: record.product_name,
            product_batch_number: record.product_batch_number,
            allocated_quantity: record.allocated_quantity,
            raw_materials: [],
          };
        }

        groupedData[key].raw_materials.push({
          material_code: record.raw_material_code,
          material_name: record.raw_material_name,
          batch_number: record.raw_material_batch,
          supplier_name: record.supplier_name,
          receipt_date: record.receipt_date,
          consumed_quantity: record.consumed_quantity,
        });
      });

      return {
        success: true,
        data: Object.values(groupedData),
      };
    } catch (error) {
      logger.error('获取客户原材料追溯失败:', error);
      return {
        success: false,
        message: error.message,
      };
    } finally {
      connection.release();
    }
  }
}

module.exports = ProductSalesTraceabilityService;
