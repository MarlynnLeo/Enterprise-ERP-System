/**
 * AsyncTaskService.js
 * @description 异步任务处理服务 - 处理非关键业务逻辑,提升性能
 * @date 2025-11-12
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');
const businessConfig = require('../../config/businessConfig');
const db = require('../../config/db');
const { apiStatusToDbStatus } = require('../../utils/statusMapper');
const NotificationService = require('../NotificationService');
const { resolveActorUserId } = require('../../utils/userUtils');

class AsyncTaskService {
  /**
   * 异步创建成本分录
   * @param {Object} transactionData - 交易数据
   */
  static async createCostEntryAsync(transactionData) {
    if (!businessConfig.performance.asyncCostCalculation) {
      return; // 如果未启用异步成本核算,直接返回
    }

    if (transactionData?.transaction_type === 'production_outbound') {
      logger.debug(
        `[async task] skip generic inventory cost entry for production issue: ${transactionData.reference_no}`
      );
      return;
    }
    if (
      transactionData?.transaction_type === 'sales_outbound' ||
      transactionData?.reference_type === 'sales_outbound'
    ) {
      logger.debug(
        `[async task] skip generic inventory cost entry for sales outbound: ${transactionData.reference_no}`
      );
      return;
    }

    setImmediate(async () => {
      try {
        logger.debug(`[异步任务] 开始创建成本分录: ${transactionData.reference_no}`);

        const InventoryCostService = require('./InventoryCostService');
        const InventoryPostingService = require('../InventoryPostingService');

        const postingConnection = await db.pool.getConnection();
        try {
          await InventoryPostingService.requireApprovedForTransaction(
            postingConnection,
            transactionData
          );
        } finally {
          postingConnection.release();
        }

        // 如果 material_id 为空，需要从出库单/入库单获取物料列表
        if (!transactionData.material_id) {
          // ✅ 放宽出库类型匹配条件：支持 outbound / production_outbound / sales_outbound 等
          const isOutboundType =
            transactionData.transaction_type &&
            (transactionData.transaction_type === 'outbound' ||
              transactionData.transaction_type.endsWith('_outbound'));
          const isOutboundRef = transactionData.reference_type === 'outbound';
          if (isOutboundType && isOutboundRef) {
            // 从出库单获取所有物料
            const outboundItemsResult = await db.query(
              `
              SELECT ioi.material_id, ioi.actual_quantity as quantity
              FROM inventory_outbound_items ioi
              JOIN inventory_outbound io ON ioi.outbound_id = io.id
              WHERE io.outbound_no = ?
              AND ioi.actual_quantity > 0
            `,
              [transactionData.reference_no]
            );

            if (outboundItemsResult.rows && outboundItemsResult.rows.length > 0) {
              // 为每个物料创建成本分录
              for (const item of outboundItemsResult.rows) {
                try {
                  const context = {
                    userId: await resolveActorUserId(null, transactionData.operator),
                    periodId: null, // 自动获取当前期间
                  };
                  await InventoryCostService.generateOutboundCostEntry(
                    {
                      ...transactionData,
                      material_id: item.material_id,
                      quantity: item.quantity,
                    },
                    context
                  );
                  logger.debug(`[异步任务] 物料 ${item.material_id} 成本分录创建成功`);
                } catch (itemError) {
                  logger.error(
                    `[异步任务] 物料 ${item.material_id} 成本分录创建失败: ${itemError.message}`
                  );
                }
              }
              logger.debug(`[异步任务] 成本分录创建完成: ${transactionData.reference_no}`);
            } else {
              logger.warn(`[异步任务] 未找到出库物料: ${transactionData.reference_no}`);
            }
            return;
          } else {
            logger.warn(
              `[异步任务] 不生成成本分录 - material_id 为空且非出库单: ${transactionData.reference_no}`
            );
            return;
          }
        }

        // 准备上下文信息
        const context = {
          userId: await resolveActorUserId(null, transactionData.operator),
          periodId: null, // 自动获取当前期间
        };

        // 使用正确的方法名: generateOutboundCostEntry / generateInboundCostEntry
        if (['outbound', 'purchase_return'].includes(transactionData.transaction_type)) {
          await InventoryCostService.generateOutboundCostEntry(transactionData, context);
        } else if (transactionData.transaction_type === 'inbound') {
          await InventoryCostService.generateInboundCostEntry(transactionData, context);
        }

        logger.debug(`[异步任务] 成本分录创建成功: ${transactionData.reference_no}`);
      } catch (error) {
        logger.error(`[异步任务] 成本分录创建失败: ${error.message}`, {
          transactionData,
          error: error.stack,
        });
      }
    });
  }

  /**
   * 异步创建追溯记录
   * @param {string} triggerType - 触发类型 (outbound, inspection, production等)
   * @param {Object} data - 追溯数据
   */
  static async createTraceabilityAsync(triggerType, data) {
    if (!businessConfig.performance.asyncTraceability) {
      return; // 如果未启用异步追溯,直接返回
    }

    setImmediate(async () => {
      let connection;
      try {
        logger.debug(
          `[异步任务] 开始创建追溯记录: 类型=${triggerType}, 单号=${data.outbound_no || data.inspection_no || 'N/A'}`
        );

        connection = await db.pool.getConnection();
        await connection.beginTransaction();

        const Traceability = require('../../models/traceability');
        await Traceability.handleAutoTraceability(triggerType, data);

        await connection.commit();
        logger.debug(`[异步任务] 追溯记录创建成功: 类型=${triggerType}`);
      } catch (error) {
        if (connection) {
          await connection.rollback();
        }
        logger.error(`[异步任务] 追溯记录创建失败: ${error.message}`, {
          triggerType,
          data,
          error: error.stack,
        });
      } finally {
        if (connection) {
          connection.release();
        }
      }
    });
  }

  /**
   * 异步更新生产任务状态
   * @param {number} taskId - 任务ID
   * @param {string} newStatus - 新状态（API格式）
   */
  static async updateProductionTaskAsync(taskId, newStatus) {
    setImmediate(async () => {
      let connection;
      try {
        logger.debug(`[异步任务] 开始更新生产任务状态: 任务ID=${taskId}, API状态=${newStatus}`);

        connection = await db.pool.getConnection();

        // 将API状态转换为数据库ENUM状态
        const dbStatus = apiStatusToDbStatus(newStatus, 'productionTask');
        logger.debug(`[异步任务] 状态转换: API=${newStatus}, 数据库=${dbStatus}`);

        await connection.execute(
          'UPDATE production_tasks SET status = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL',
          [dbStatus, taskId]
        );

        logger.debug(`[异步任务] 生产任务状态更新成功: 任务ID=${taskId}, 数据库状态=${dbStatus}`);
      } catch (error) {
        logger.error(`[异步任务] 生产任务状态更新失败: ${error.message}`, {
          taskId,
          newStatus,
          error: error.stack,
        });
      } finally {
        if (connection) {
          connection.release();
        }
      }
    });
  }

  /**
   * 异步发送通知
   * @param {string} type - 通知类型
   * @param {Object} data - 通知数据
   */
  static async sendNotificationAsync(type, data) {
    setImmediate(async () => {
      try {
        logger.debug(`[异步任务] 发送通知: 类型=${type}`, data);

        // 根据通知类型构建标题和内容
        const notificationMap = {
          inspection_failed: {
            title: '质检不合格通知',
            content: `物料 ${data.materialCode || ''} ${data.materialName || ''} 质检不合格，检验单号: ${data.inspectionNo || 'N/A'}，不合格数量: ${data.rejectedQty || 0}。请及时处理。`,
            priority: 2,
          },
          low_stock: {
            title: '库存不足预警',
            content: `物料 ${data.materialCode || ''} ${data.materialName || ''} 当前库存 ${data.currentStock || 0}，低于安全库存 ${data.safetyStock || 0}，请及时补货。`,
            priority: 1,
          },
          order_completed: {
            title: '工单完成通知',
            content: `工单 ${data.orderNo || 'N/A'} 已完成，产品: ${data.productName || ''}，完成数量: ${data.completedQty || 0}。`,
            priority: 0,
          },
          purchase_return: {
            title: '采购退货通知',
            content: `退货单 ${data.returnNo || 'N/A'} 已创建，供应商: ${data.supplierName || '未知'}，物料: ${data.materialName || ''}，退货数量: ${data.quantity || 0}。`,
            priority: 1,
          },
          ncp_created: {
            title: '不合格品通知',
            content: `不合格品 ${data.ncpNo || 'N/A'} 已创建，物料: ${data.materialName || ''}，缺陷描述: ${data.defectDescription || '无'}。请及时处理。`,
            priority: 2,
          },
        };

        const notification = notificationMap[type] || {
          title: `系统通知 - ${type}`,
          content: JSON.stringify(data),
          priority: 0,
        };

        const permissionMap = {
          inspection_failed: ['quality:incoming', 'quality:inspections:view'],
          low_stock: ['inventory:stock', 'purchase:requisitions'],
          order_completed: ['production:tasks'],
          purchase_return: ['purchase:returns'],
          ncp_created: ['quality:nonconforming'],
        };

        await NotificationService.notifyByPermissions(
          permissionMap[type] || ['system:notifications'],
          {
            type,
            title: notification.title,
            content: notification.content,
            priority: notification.priority,
            sourceType: type,
            sourceId:
              Number(
                data.id || data.inspectionId || data.materialId || data.returnId || data.ncpId
              ) || null,
          },
          { dedupeByDay: true }
        );

        logger.debug(`[异步任务] 通知已写入: ${notification.title}`);
      } catch (error) {
        logger.error(`[异步任务] 通知发送失败: ${error.message}`, {
          type,
          data,
          error: error.stack,
        });
      }
    });
  }

  /**
   * 批量异步任务处理
   * @param {Array} tasks - 任务列表
   */
  static async processBatchAsync(tasks) {
    setImmediate(async () => {
      for (const task of tasks) {
        try {
          await task.handler(task.data);
        } catch (error) {
          logger.error(`[异步任务] 批量任务处理失败: ${error.message}`, {
            task,
            error: error.stack,
          });
        }
      }
    });
  }
}

module.exports = AsyncTaskService;
