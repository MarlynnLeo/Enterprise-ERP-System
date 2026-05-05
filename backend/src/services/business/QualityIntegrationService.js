/**
 * 质量管理集成服务
 * @description 处理不合格品与库存、成本等模块的深度集成
 */

const { logger } = require('../../utils/logger');
const InventoryService = require('../InventoryService');


class QualityIntegrationService {
  /**
   * 报废完成时自动扣减库存
   * @param {Object} scrapRecord - 报废记录
   * @param {Object} connection - 数据库连接
   */
  static async handleScrapInventory(scrapRecord, connection) {
    try {
      logger.info(
        `处理报废库存扣减: 报废单号=${scrapRecord.scrap_no}, 物料=${scrapRecord.material_code}, 数量=${scrapRecord.quantity}`
      );

      // 获取物料信息
      const [materials] = await connection.query(
        'SELECT id, default_location_id FROM materials WHERE code = ?',
        [scrapRecord.material_code]
      );

      if (materials.length === 0) {
        logger.warn(`物料不存在: ${scrapRecord.material_code}`);
        return;
      }

      const material = materials[0];
      // 通过统一服务获取物料的默认仓库
      const locationId = await InventoryService.getMaterialLocation(material.id, connection);

      // 扣减库存
      await InventoryService.updateStock(
        {
          materialId: material.id,
          locationId: locationId,
          quantity: -scrapRecord.quantity,
          transactionType: 'scrap',
          referenceNo: scrapRecord.scrap_no,
          referenceType: 'scrap_record',
          operator: scrapRecord.created_by || 'system',
          remark: `报废扣减库存 - ${scrapRecord.scrap_reason || ''}`,
          unitId: null,
        },
        connection
      );

      logger.info(`报废库存扣减成功: ${scrapRecord.scrap_no}`);
    } catch (error) {
      logger.error('报废库存扣减失败:', error);
      throw error;
    }
  }


  /**
   * 记录质量成本
   * @param {Object} params - 成本参数
   * @param {Object} connection - 数据库连接
   */
  static async recordQualityCost(params, connection) {
    try {
      const {
        costType, // 'rework' | 'scrap' | 'return' | 'replacement'
        referenceNo, // 参考单号
        materialCode, // 物料编码
        quantity, // 数量
        cost, // 成本金额
        operator, // 操作员
      } = params;

      logger.info(`记录质量成本: 类型=${costType}, 单号=${referenceNo}, 金额=${cost}`);

      // 注意：quality_costs 表已迁移至 Knex migration 管理

      // 插入成本记录
      await connection.query(
        `INSERT INTO quality_costs (
          cost_type, reference_no, material_code, quantity, cost, operator, cost_date
        ) VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
        [costType, referenceNo, materialCode, quantity, cost, operator]
      );

      logger.info(`质量成本记录成功: ${referenceNo}`);
    } catch (error) {
      logger.error('记录质量成本失败:', error);
      throw error;
    }
  }
}

module.exports = QualityIntegrationService;
