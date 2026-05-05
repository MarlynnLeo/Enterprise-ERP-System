/**
 * 库存检查服务
 * 统一处理库存检查、验证和警告信息
 */

const { logger } = require('../../utils/logger');
const DBManager = require('../../utils/dbManager');

class InventoryCheckService {
  /**
   * 检查物料库存是否充足
   * @param {Array} materials - 物料列表 [{material_id, quantity, ...}]
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<Object>} 检查结果
   */
  static async checkMaterialsInventory(materials, connection = null) {
    if (!materials || materials.length === 0) {
      return {
        sufficient: true,
        insufficientItems: [],
        warnings: [],
      };
    }

    const useConnection = connection || (await DBManager.getConnection());

    try {
      const results = {
        sufficient: true,
        insufficientItems: [],
        warnings: [],
      };

      // 批量查询库存
      const materialIds = materials.map((item) => item.material_id || item.product_id);
      const stockData = await this.getBatchInventoryStock(materialIds, useConnection);

      // 创建库存映射
      const stockMap = new Map();
      stockData.forEach((item) => {
        stockMap.set(item.material_id, item.total_stock || 0);
      });

      // 检查每个物料
      for (const material of materials) {
        const materialId = material.material_id || material.product_id;
        const requiredQuantity = parseFloat(material.quantity) || 0;
        const availableStock = stockMap.get(materialId) || 0;

        if (availableStock < requiredQuantity) {
          results.sufficient = false;
          results.insufficientItems.push({
            material_id: materialId,
            material_code: material.material_code || '',
            material_name: material.material_name || material.product_name || '',
            required_quantity: requiredQuantity,
            available_stock: availableStock,
            shortage: requiredQuantity - availableStock,
          });
        }

        // 生成警告信息
        if (availableStock === 0) {
          results.warnings.push(`物料 ${material.material_code || materialId} 库存为零`);
        } else if (availableStock < requiredQuantity) {
          results.warnings.push(
            `物料 ${material.material_code || materialId} 库存不足，需要 ${requiredQuantity}，可用 ${availableStock}`
          );
        }
      }

      return results;
    } catch (error) {
      logger.error('库存检查失败:', error);
      throw new Error('库存检查失败: ' + error.message, { cause: error });
    } finally {
      if (!connection && useConnection) {
        useConnection.release();
      }
    }
  }

  /**
   * 批量获取物料库存
   * @param {Array} materialIds - 物料ID数组
   * @param {Object} connection - 数据库连接
   * @returns {Promise<Array>} 库存数据
   */
  static async getBatchInventoryStock(materialIds, connection) {
    if (!materialIds || materialIds.length === 0) {
      return [];
    }

    const placeholders = materialIds.map(() => '?').join(',');
    const sql = `
      SELECT 
        material_id,
        SUM(total_by_location) as total_stock
      FROM (
        SELECT 
          material_id,
          location_id,
          SUM(quantity) as total_by_location
        FROM inventory_ledger 
        WHERE material_id IN (${placeholders})
        GROUP BY material_id, location_id
        HAVING SUM(quantity) > 0
      ) location_stock
      GROUP BY material_id
    `;

    const [rows] = await connection.query(sql, materialIds);
    return rows;
  }

  /**
   * 获取单个物料的详细库存信息
   * @param {number} materialId - 物料ID
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<Object>} 库存详情
   */
  static async getMaterialInventoryDetail(materialId, connection = null) {
    const useConnection = connection || (await DBManager.getConnection());

    try {
      const sql = `
        SELECT 
          il.material_id,
          m.code as material_code,
          m.name as material_name,
          m.specs as specification,
          u.name as unit_name,
          il.location_id,
          l.name as location_name,
          SUM(il.quantity) as location_stock,
          (
            SELECT SUM(quantity) 
            FROM inventory_ledger 
            WHERE material_id = il.material_id 
            AND quantity > 0
          ) as total_stock
        FROM inventory_ledger il
        LEFT JOIN materials m ON il.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN locations l ON il.location_id = l.id
        WHERE il.material_id = ?
        GROUP BY il.material_id, il.location_id
        HAVING SUM(il.quantity) > 0
        ORDER BY location_stock DESC
      `;

      const [rows] = await useConnection.query(sql, [materialId]);

      if (rows.length === 0) {
        return {
          material_id: materialId,
          total_stock: 0,
          locations: [],
        };
      }

      return {
        material_id: materialId,
        material_code: rows[0].material_code,
        material_name: rows[0].material_name,
        specification: rows[0].specification,
        unit_name: rows[0].unit_name,
        total_stock: rows[0].total_stock || 0,
        locations: rows.map((row) => ({
          location_id: row.location_id,
          location_name: row.location_name,
          stock: row.location_stock,
        })),
      };
    } catch (error) {
      logger.error('获取物料库存详情失败:', error);
      throw error;
    } finally {
      if (!connection && useConnection) {
        useConnection.release();
      }
    }
  }

  /**
   * 格式化库存不足警告信息
   * @param {Array} insufficientItems - 库存不足的物料列表
   * @returns {string} 格式化的警告信息
   */
  static formatInventoryWarnings(insufficientItems) {
    if (!insufficientItems || insufficientItems.length === 0) {
      return '';
    }

    const warnings = insufficientItems.map((item) => {
      const code = item.material_code || item.material_id;
      const name = item.material_name || '';
      const required = item.required_quantity || 0;
      const available = item.available_stock || 0;
      const shortage = item.shortage || 0;

      return `${code}${name ? ` (${name})` : ''}: 需要${required}, 可用${available}, 缺少${shortage}`;
    });

    return `以下物料库存不足:\n${warnings.join('\n')}`;
  }

  /**
   * 检查是否有足够的库存用于出库
   * @param {Array} outboundItems - 出库明细
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<Object>} 检查结果
   */
  static async checkOutboundInventory(outboundItems, connection = null) {
    const materials = outboundItems.map((item) => ({
      material_id: item.material_id || item.product_id,
      material_code: item.material_code,
      material_name: item.material_name || item.product_name,
      quantity: item.quantity,
    }));

    return await this.checkMaterialsInventory(materials, connection);
  }
}

module.exports = InventoryCheckService;
