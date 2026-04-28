/**
 * InventoryAlertService.js
 * @description 库存预警服务 - 自动采购申请生成、预警通知、批次过期预警
 * @date 2025-12-11
 * @version 1.0.0
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');

class InventoryAlertService {
  /**
   * 检查低库存并自动生成采购申请
   * @param {Object} options - 配置选项
   * @param {boolean} options.autoCreate - 是否自动创建采购申请 (默认true)
   * @param {string} options.operator - 操作人
   * @returns {Promise<Object>} 检查结果
   */
  static async checkLowStockAndCreateRequisition(options = {}) {
    const { autoCreate = true, operator = 'system' } = options;
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. 获取低库存物料列表
      const [lowStockItems] = await connection.execute(`
        SELECT 
          m.id as material_id,
          m.code as material_code,
          m.name as material_name,
          m.specs as specification,
          m.unit_id,
          u.name as unit_name,
          m.min_stock as safety_stock,
          m.location_id,
          COALESCE(stock.current_quantity, 0) as current_quantity,
          (m.min_stock - COALESCE(stock.current_quantity, 0)) as shortage_quantity,
          m.supplier_id
        FROM materials m
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN (
          SELECT il.material_id, SUM(il.quantity) as current_quantity
          FROM inventory_ledger il
          JOIN materials mat ON il.material_id = mat.id
          WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
          GROUP BY il.material_id
        ) stock ON m.id = stock.material_id
        WHERE m.min_stock > 0 
          AND m.status = 1
          AND (COALESCE(stock.current_quantity, 0) < m.min_stock)
        ORDER BY (m.min_stock - COALESCE(stock.current_quantity, 0)) DESC
      `);

      if (lowStockItems.length === 0) {
        await connection.commit();
        return {
          success: true,
          message: '没有发现低库存物料',
          lowStockCount: 0,
          requisitionCreated: false,
        };
      }

      logger.info(`📦 发现 ${lowStockItems.length} 个低库存物料`);

      // 2. 检查已有待处理的采购申请中各物料的在途数量（精确数量级扣减，避免与销售订单自动化重复）
      const materialIds = lowStockItems.map((item) => item.material_id);
      const [existingItems] = await connection.execute(
        `
        SELECT pri.material_id, SUM(pri.quantity) as pending_quantity
        FROM purchase_requisition_items pri
        INNER JOIN purchase_requisitions pr ON pri.requisition_id = pr.id
        WHERE pr.status IN ('draft', 'pending', 'approved')
          AND pri.material_id IN (${materialIds.map(() => '?').join(',')})
        GROUP BY pri.material_id
      `,
        materialIds
      );

      // 构建已有采购数量映射
      const pendingQuantityMap = new Map(
        existingItems.map((item) => [item.material_id, parseFloat(item.pending_quantity) || 0])
      );

      // 精确过滤：已有采购数量 >= 缺口量则跳过，否则只补差额
      const newLowStockItems = [];
      for (const item of lowStockItems) {
        const pendingQty = pendingQuantityMap.get(item.material_id) || 0;
        if (pendingQty >= item.shortage_quantity) {
          // 已有采购申请完全覆盖缺口，跳过
          logger.info(`  ⏭️  跳过物料 ${item.material_code} ${item.material_name}: 已有在途采购 ${pendingQty} >= 缺口 ${item.shortage_quantity}`);
          continue;
        }
        // 只补差额
        const adjustedShortage = item.shortage_quantity - pendingQty;
        if (pendingQty > 0) {
          logger.info(`  📉 物料 ${item.material_code} ${item.material_name}: 缺口 ${item.shortage_quantity} - 已有在途 ${pendingQty} = 实际补充 ${adjustedShortage}`);
        }
        newLowStockItems.push({
          ...item,
          shortage_quantity: adjustedShortage, // 使用调整后的缺口量
          original_shortage: item.shortage_quantity, // 保留原始缺口量
        });
      }

      if (newLowStockItems.length === 0) {
        await connection.commit();
        return {
          success: true,
          message: '所有低库存物料已有待处理的采购申请覆盖',
          lowStockCount: lowStockItems.length,
          requisitionCreated: false,
          alreadyInRequisition: lowStockItems.length,
        };
      }

      if (!autoCreate) {
        await connection.commit();
        return {
          success: true,
          message: `发现 ${newLowStockItems.length} 个需要采购的低库存物料`,
          lowStockCount: lowStockItems.length,
          newItems: newLowStockItems,
          requisitionCreated: false,
        };
      }

      // 3. 生成采购申请单号
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      const [maxNoResult] = await connection.execute(
        'SELECT MAX(requisition_number) as max_no FROM purchase_requisitions WHERE requisition_number LIKE ?',
        [`PR${dateStr}%`]
      );
      const maxNo = maxNoResult[0].max_no || `PR${dateStr}000`;
      const requisitionNo = `PR${dateStr}${(parseInt(maxNo.slice(-3)) + 1).toString().padStart(3, '0')}`;

      // 4. 创建采购申请
      const [requisitionResult] = await connection.execute(
        `
        INSERT INTO purchase_requisitions 
        (requisition_number, request_date, requester, real_name, remarks, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'draft', NOW(), NOW())
      `,
        [
          requisitionNo,
          today.toISOString().split('T')[0],
          operator,
          '系统自动',
          `库存预警自动生成 - 共${newLowStockItems.length}个物料低于安全库存`,
        ]
      );

      const requisitionId = requisitionResult.insertId;

      // 5. 添加采购申请物料明细
      for (const item of newLowStockItems) {
        // 建议采购量 = 缺货量 * 1.2 (多采购20%作为缓冲)
        const suggestedQuantity = Math.ceil(item.shortage_quantity * 1.2);

        await connection.execute(
          `
          INSERT INTO purchase_requisition_items 
          (requisition_id, material_id, material_code, material_name, specification, unit, unit_id, quantity)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            requisitionId,
            item.material_id,
            item.material_code,
            item.material_name,
            item.specification || '',
            item.unit_name || '',
            item.unit_id,
            suggestedQuantity,
          ]
        );
      }

      await connection.commit();

      logger.info(`✅ 自动创建采购申请 ${requisitionNo}，包含 ${newLowStockItems.length} 个物料`);

      // 6. 发送系统通知
      await this.sendLowStockNotification(newLowStockItems, requisitionNo);

      return {
        success: true,
        message: `成功创建采购申请 ${requisitionNo}`,
        lowStockCount: lowStockItems.length,
        requisitionCreated: true,
        requisitionId,
        requisitionNo,
        itemCount: newLowStockItems.length,
        items: newLowStockItems.map((item) => ({
          materialCode: item.material_code,
          materialName: item.material_name,
          currentQuantity: item.current_quantity,
          safetyStock: item.safety_stock,
          shortageQuantity: item.shortage_quantity,
        })),
      };
    } catch (error) {
      await connection.rollback();
      logger.error('检查低库存并创建采购申请失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 发送低库存预警通知
   * @param {Array} lowStockItems - 低库存物料列表
   * @param {string} requisitionNo - 采购申请单号（可选）
   */
  static async sendLowStockNotification(lowStockItems, requisitionNo = null) {
    try {
      const itemList = lowStockItems
        .slice(0, 5)
        .map(
          (item) =>
            `${item.material_code} ${item.material_name}: 当前${item.current_quantity}, 安全库存${item.safety_stock}`
        )
        .join('\n');

      const moreText = lowStockItems.length > 5 ? `\n...等共${lowStockItems.length}个物料` : '';

      const content = requisitionNo
        ? `系统已自动生成采购申请 ${requisitionNo}\n\n低库存物料:\n${itemList}${moreText}`
        : `发现${lowStockItems.length}个低库存物料:\n${itemList}${moreText}`;

      // 保存到系统通知表
      await db.pool.execute(
        `
        INSERT INTO notifications (title, content, type, priority, created_at)
        VALUES (?, ?, 'inventory_alert', 1, NOW())
      `,
        ['库存预警通知', content]
      );

      logger.info('📢 低库存预警通知已发送');
    } catch (error) {
      logger.error('发送低库存通知失败:', error);
      // 不抛出异常，通知失败不影响主流程
    }
  }

  /**
   * 检查批次过期预警
   * @param {number} daysBeforeExpiry - 提前几天预警 (默认30天)
   * @returns {Promise<Object>} 检查结果
   */
  static async checkBatchExpiry(daysBeforeExpiry = 30) {
    try {
      // ✅ 单表架构：从 v_batch_stock 视图查询
      const [expiringBatches] = await db.pool.execute(
        `
        SELECT
          vbs.batch_number,
          m.code as material_code,
          m.name as material_name,
          vbs.current_quantity,
          u.name as unit,
          vbs.expiry_date,
          vbs.warehouse_name,
          DATEDIFF(vbs.expiry_date, CURDATE()) as days_until_expiry
        FROM v_batch_stock vbs
        LEFT JOIN materials m ON vbs.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE vbs.current_quantity > 0
          AND vbs.expiry_date IS NOT NULL
          AND vbs.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY vbs.expiry_date ASC
      `,
        [daysBeforeExpiry]
      );

      if (expiringBatches.length === 0) {
        return {
          success: true,
          message: '没有发现即将过期的批次',
          expiringCount: 0,
        };
      }

      // 分类：已过期 vs 即将过期
      const expired = expiringBatches.filter((b) => b.days_until_expiry < 0);
      const expiringSoon = expiringBatches.filter((b) => b.days_until_expiry >= 0);

      // 发送通知
      if (expiringBatches.length > 0) {
        await this.sendBatchExpiryNotification(expired, expiringSoon);
      }

      logger.info(`📦 批次过期检查: ${expired.length}个已过期, ${expiringSoon.length}个即将过期`);

      return {
        success: true,
        message: `检查完成: ${expired.length}个已过期, ${expiringSoon.length}个即将过期`,
        expiringCount: expiringBatches.length,
        expired: expired.map((b) => ({
          batchNumber: b.batch_number,
          materialCode: b.material_code,
          materialName: b.material_name,
          quantity: b.current_quantity,
          expiryDate: b.expiry_date,
          daysOverdue: Math.abs(b.days_until_expiry),
        })),
        expiringSoon: expiringSoon.map((b) => ({
          batchNumber: b.batch_number,
          materialCode: b.material_code,
          materialName: b.material_name,
          quantity: b.current_quantity,
          expiryDate: b.expiry_date,
          daysUntilExpiry: b.days_until_expiry,
        })),
      };
    } catch (error) {
      logger.error('检查批次过期失败:', error);
      throw error;
    }
  }

  /**
   * 发送批次过期预警通知
   */
  static async sendBatchExpiryNotification(expired, expiringSoon) {
    try {
      let content = '';

      if (expired.length > 0) {
        content += `⚠️ 已过期批次 (${expired.length}个):\n`;
        content += expired
          .slice(0, 3)
          .map(
            (b) => `${b.batch_number} - ${b.material_name}: 过期${Math.abs(b.days_until_expiry)}天`
          )
          .join('\n');
        if (expired.length > 3) content += `\n...等${expired.length}个批次`;
        content += '\n\n';
      }

      if (expiringSoon.length > 0) {
        content += `⏰ 即将过期批次 (${expiringSoon.length}个):\n`;
        content += expiringSoon
          .slice(0, 3)
          .map((b) => `${b.batch_number} - ${b.material_name}: ${b.days_until_expiry}天后过期`)
          .join('\n');
        if (expiringSoon.length > 3) content += `\n...等${expiringSoon.length}个批次`;
      }

      await db.pool.execute(
        `
        INSERT INTO notifications (title, content, type, priority, created_at)
        VALUES (?, ?, 'batch_expiry', ?, NOW())
      `,
        ['批次过期预警', content, expired.length > 0 ? 2 : 1]
      );

      logger.info('📢 批次过期预警通知已发送');
    } catch (error) {
      logger.error('发送批次过期通知失败:', error);
    }
  }

  /**
   * 库存变动后检查预警（在库存更新后调用）
   * @param {number} materialId - 物料ID
   * @param {number} newQuantity - 变动后的库存数量
   */
  static async checkStockAfterChange(materialId, newQuantity) {
    try {
      // 获取物料的安全库存设置
      const [materials] = await db.pool.execute(
        'SELECT id, code, name, min_stock FROM materials WHERE id = ? AND min_stock > 0',
        [materialId]
      );

      if (materials.length === 0) return;

      const material = materials[0];

      // 如果库存低于安全库存，记录预警
      if (newQuantity < material.min_stock) {
        logger.warn(
          `⚠️ 物料 ${material.code} ${material.name} 库存预警: 当前${newQuantity}, 安全库存${material.min_stock}`
        );

        // 可以在这里触发即时通知或记录预警日志
        await db.pool.execute(
          `
          INSERT INTO notifications (title, content, type, priority, created_at)
          VALUES (?, ?, 'inventory_alert', 1, NOW())
          ON DUPLICATE KEY UPDATE content = VALUES(content), created_at = NOW()
        `,
          [
            '库存预警',
            `物料 ${material.code} ${material.name} 库存不足: 当前${newQuantity}, 安全库存${material.min_stock}`,
          ]
        );
      }
    } catch (error) {
      logger.error('库存变动后检查预警失败:', error);
      // 不抛出异常，预警检查失败不影响主流程
    }
  }
}

module.exports = InventoryAlertService;

