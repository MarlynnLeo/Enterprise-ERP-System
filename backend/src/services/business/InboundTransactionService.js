/**
 * InboundTransactionService.js
 * @description 入库核心事务服务，用于抽离Controller中庞大复杂的入库确认逻辑
 */

const { logger } = require('../../utils/logger');
const InventoryService = require('../InventoryService');
const { ENABLE_TRACEABILITY } = require('../../config/features');
const { qualityApi } = require('./QualityService');
const db = require('../../config/db');
const NonconformingProduct = require('../../models/nonconformingProduct');

const DLQService = require('./DLQService');
const AsyncTaskService = require('./AsyncTaskService');
class InboundTransactionService {
  /**
   * 执行完整的入库确认逻辑
   * @param {Object} connection 数据库连接事务对象
   * @param {Number} inboundId 入库单ID
   * @param {String} operator 操作人
   * @param {Object} inboundData 入库主表数据
   */
  static async confirmInbound(connection, inboundId, operator, inboundData) {
    logger.info(`开始分离核心入库处理，入库单ID: ${inboundId}`);

    // 获取入库单信息
    const [inboundInfo] = await connection.execute(
      'SELECT * FROM inventory_inbound WHERE id = ?',
      [inboundId]
    );

    // 获取入库单明细
    const [inboundItems] = await connection.execute(
      `SELECT ii.*, m.code as material_code, m.name as material_name
       FROM inventory_inbound_items ii
       LEFT JOIN materials m ON ii.material_id = m.id
       WHERE ii.inbound_id = ?`,
      [inboundId]
    );

    const inspection_id = inboundInfo.length > 0 ? inboundInfo[0].inspection_id : null;

    if (inspection_id) {
      // 查询检验单，找到相关联的生产任务
      const [inspectionInfo] = await connection.execute(
        'SELECT reference_id, reference_no FROM quality_inspections WHERE id = ?',
        [inspection_id]
      );

      if (inspectionInfo.length > 0 && inspectionInfo[0].reference_id) {
        const taskId = inspectionInfo[0].reference_id;
        const [taskInfo] = await connection.execute(
          'SELECT plan_id FROM production_tasks WHERE id = ?',
          [taskId]
        );

        if (taskInfo.length > 0 && taskInfo[0].plan_id) {
          // 这里原有个巨大的坑，后来在Controller里被注释去掉了，此处同样留空保持原功能一致
        }
      }
    }

    // 查询明细补充项
    const [items] = await connection.execute(
      'SELECT id, material_id, quantity, unit_id, batch_number, location_id FROM inventory_inbound_items WHERE inbound_id = ?',
      [inboundId]
    );

    if (items.length === 0) {
      logger.error('入库单没有物料项, ID:', inboundId);
      throw new Error('入库单没有物料项');
    }

    // 根据入库类型确定库存交易类型
    const inboundType = inboundData.inbound_type || 'other';
    const transactionTypeMap = {
      purchase: 'purchase_inbound',
      production: 'production_inbound',
      production_return: 'production_return',
      outsourced: 'outsourced_inbound',
      sales_return: 'sales_return',
      defective_return: 'defective_return',
      other: 'inbound',
    };
    const transactionType = transactionTypeMap[inboundType] || 'inbound';
    
    logger.info('入库交易类型:', { inbound_type: inboundType, transaction_type: transactionType });

    for (const item of items) {
      if (!item.material_id) {
        logger.error('物料ID为空');
        throw new Error('物料ID为空');
      }

      // 获取物料的基础信息单位和仓库
      const matInfo = await InventoryService.getMaterialInfo(item.material_id, connection);
      const unitId = item.unit_id || matInfo.unitId;
      const itemLocationId = item.location_id || inboundData.location_id || matInfo.locationId;

      if (!unitId) {
        logger.error(`物料 ${item.material_id} 没有单位`);
        throw new Error(`物料 ${item.material_id} 没有单位`);
      }

      const currentStock = await InventoryService.getCurrentStock(
        item.material_id, itemLocationId, connection, false, false
      );

      let beforeQuantity = currentStock;
      let afterQuantity = beforeQuantity + parseFloat(item.quantity);

      // 处理批次溯源：判断是否产线退料或不良退回，追溯原始批次
      let finalBatchNumber = item.batch_number;
      if (!finalBatchNumber) {
        if (['defective_return', 'production_return'].includes(inboundType) && inboundData.reference_id) {
          try {
            const [ledgerRows] = await connection.execute(
              `SELECT batch_number 
               FROM inventory_ledger 
               WHERE reference_type = 'production_outbound' 
                 AND reference_id = ? 
                 AND material_id = ? 
                 AND transaction_type = 'outbound'
                 AND batch_number IS NOT NULL
                 AND batch_number != ''
               ORDER BY created_at DESC 
               LIMIT 1`,
              [inboundData.reference_id, item.material_id]
            );
            if (ledgerRows.length > 0) {
              finalBatchNumber = ledgerRows[0].batch_number;
              logger.info(`🔄 [批次号溯源成功] 找回原物料发料批次号: ${finalBatchNumber}`);
            } else {
              logger.warn(`⚠️ [批次号溯源失败] 未找到任务 ${inboundData.reference_id} 对物料 ${item.material_id} 的发料记录`);
            }
          } catch (traceErr) {
            logger.error(`❌ [批次号溯源报错] `, traceErr);
          }
        }

        // 系统兜底
        if (!finalBatchNumber) {
          finalBatchNumber = `PWH-${inboundData.inbound_no}-${item.material_id}`;
        }

        // 回写明细
        await connection.execute(
          'UPDATE inventory_inbound_items SET batch_number = ? WHERE id = ?',
          [finalBatchNumber, item.id]
        );
      }

      logger.info('入库库存变动:', {
        material_id: item.material_id,
        location_id: itemLocationId,
        before: beforeQuantity,
        add: item.quantity,
        after: afterQuantity,
      });

      // 记录库存台账
      await InventoryService.updateStock({
        materialId: item.material_id,
        locationId: itemLocationId,
        quantity: parseFloat(item.quantity),
        transactionType: transactionType,
        referenceNo: inboundData.inbound_no,
        referenceType: 'inbound',
        operator: operator,
        remark: inboundData.remark || '',
        unitId: unitId,
        batchNumber: finalBatchNumber,
        allowNegativeStock: true,
      }, connection);

      // 追溯数据载荷
      const tracePayload = {
        inbound_no: inboundData.receipt_no,
        material_id: item.material_id,
        quantity: parseFloat(item.quantity),
        batch_no: finalBatchNumber,
        source_type: 'purchase',
        operator
      };

      // 采用死信队列包裹器处理
      DLQService.runWithRetry(
        `CreateTraceability_${item.material_id}`,
        tracePayload,
        async () => {
          logger.info(`🔄 异步触发追溯记录构建 - 入库单: ${inboundData.receipt_no}`);
          await AsyncTaskService.createTraceabilityAsync('inbound', tracePayload);
        }
      );
    }

    // 异步创建成品入库追溯记录及NCP生成（无阻塞副流）
    this._handleSideEffects(inboundId, inboundInfo[0], inboundItems, inspection_id);
  }

  /**
   * 异步处理周边的副作用：如追溯链创建，及不良品NCP单自动生成
   */
  static _handleSideEffects(inboundId, inboundData, inboundItems, inspection_id) {
    const shouldCreateTrace =
      ENABLE_TRACEABILITY &&
      inspection_id &&
      inboundItems.length > 0 &&
      inboundItems[0].material_id;

    if (shouldCreateTrace) {
      DLQService.runWithRetry(`产品入库追溯记录创建-${inboundData.inbound_no}`, { inboundId, inboundData, inspection_id }, async () => {
        try {
          for (const item of inboundItems) {
            try {
              let productCode = item.material_code;
              let productName = item.material_name;

              if (!productCode || !productName) {
                const conn = await db.pool.getConnection();
                try {
                  const [materialInfo] = await conn.execute(
                    'SELECT code, name FROM materials WHERE id = ?',
                    [item.material_id]
                  );
                  if (materialInfo.length > 0) {
                    productCode = materialInfo[0].code;
                    productName = materialInfo[0].name;
                  } else {
                    continue;
                  }
                } finally {
                  conn.release();
                }
              }

              const batchNumber = item.batch_number || `PWH-${inboundData.inbound_no}-${item.material_id}`;

              await qualityApi.autoCreateTraceability('product_warehouse', {
                location_id: inboundId,
                product_id: item.material_id,
                product_code: productCode,
                product_name: productName,
                quantity: item.quantity,
                batch_number: batchNumber,
              });

              if (inspection_id) {
                const conn = await db.pool.getConnection();
                try {
                  await conn.execute(
                    'UPDATE quality_inspections SET traceability_batch = ? WHERE id = ?',
                    [batchNumber, inspection_id]
                  );
                } finally {
                  conn.release();
                }
              }
            } catch (itemTraceError) {
              logger.error(`为物料 ${item.material_id} 创建入库追溯记录失败:`, itemTraceError);
            }
          }
        } catch (traceError) {
          logger.error('异步创建产品入库追溯记录失败:', traceError);
          throw traceError;
        }
      });
    }

    // ✅ 处理生产入库的生产单据状态更新（异步）+ 建立原料→成品批次追溯关系
    if (inboundData.inbound_type === 'production' && inspection_id) {
      DLQService.runWithRetry(`生产单据状态更新-${inboundData.inbound_no}`, { inboundData, inspection_id }, async () => {
        const connection = await db.pool.getConnection();
        try {
          // 查找绑定的成品质检单，获取关联的生产任务ID
          const [inspections] = await connection.query(
            "SELECT reference_id FROM quality_inspections WHERE id = ? AND inspection_type = 'final'",
            [inspection_id]
          );
          if (inspections.length > 0 && inspections[0].reference_id) {
            const taskId = inspections[0].reference_id;
            const dbStatus = 'completed'; // 入库完成

            // 查找生产任务和计划
            const [taskResult] = await connection.query(
              'SELECT id, plan_id, code FROM production_tasks WHERE id = ?',
              [taskId]
            );

            if (taskResult.length > 0) {
              const planId = taskResult[0].plan_id;
              const taskCode = taskResult[0].code;

              // 更新生产任务状态为已完成
              await connection.execute('UPDATE production_tasks SET status = ? WHERE id = ?', [
                dbStatus,
                taskId,
              ]);

              // 同步更新生产过程状态
              await connection.execute(
                'UPDATE production_processes SET status = ? WHERE task_id = ?',
                [dbStatus, taskId]
              );

              if (planId) {
                // 检查该计划下所有有效任务状态
                const [taskStats] = await connection.query(
                  `SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as target_count,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
                   FROM production_tasks
                   WHERE plan_id = ?`,
                  [dbStatus, planId]
                );

                const stats = taskStats[0] || {};
                const totalTasks = Number(stats.total) || 0;
                const targetCount = Number(stats.target_count) || 0;
                const cancelledCount = Number(stats.cancelled_count) || 0;

                // 若所有有效任务都达到目标状态，则更新计划状态
                if (totalTasks > 0 && targetCount === totalTasks - cancelledCount) {
                  await connection.execute(
                    'UPDATE production_plans SET status = ? WHERE id = ?',
                    [dbStatus, planId]
                  );
                }
              }

              // ✅ 建立原料 → 成品的 batch_relationships 追溯消耗关系
              // 思路：生产入库时成品已有批次号，从 inventory_ledger 查该生产任务
              //       对应的 production_outbound 台账，即可得到实际领用的原料批次
              try {
                for (const inboundItem of inboundItems) {
                  const productBatchNo = inboundItem.batch_number;
                  if (!productBatchNo) continue;

                  // 查询该生产任务下实际领用的原料批次（来自对应的生产出库单领料）
                  // 1. 获取该生产任务对应的所有出库单号
                  const [outbounds] = await connection.query(
                    `SELECT outbound_no FROM inventory_outbound 
                     WHERE production_task_id = ? OR (reference_type = 'production_task' AND reference_id = ?)`,
                    [taskId, taskId]
                  );
                  
                  let consumedRows = [];
                  if (outbounds.length > 0) {
                    const outNos = outbounds.map(o => o.outbound_no);
                    const placeholders = outNos.map(() => '?').join(',');
                    
                    // 2. 查询这些出库单在台账中的扣减明细
                    const [ledgerRows] = await connection.query(
                      `SELECT 
                         il.material_id,
                         il.batch_number    as raw_batch_number,
                         m.code             as raw_material_code,
                         ABS(SUM(il.quantity)) as consumed_quantity
                       FROM inventory_ledger il
                       JOIN materials m ON il.material_id = m.id
                       WHERE il.transaction_type IN ('production_outbound', 'outbound')
                         AND il.reference_no IN (${placeholders})
                         AND il.quantity < 0
                         AND il.batch_number IS NOT NULL
                         AND il.batch_number != ''
                       GROUP BY il.material_id, il.batch_number, m.code`,
                      outNos
                    );
                    consumedRows = ledgerRows;
                  }

                  // 若出库单没查到或台账没查到，再尝试历史老办法兜底（按任务号或者入库单号查台账）
                  if (consumedRows.length === 0) {
                    const fallbackNos = [];
                    if (taskCode) fallbackNos.push(taskCode);
                    if (inboundData.inbound_no) fallbackNos.push(inboundData.inbound_no);
                    
                    if (fallbackNos.length > 0) {
                        const fallPlaceholders = fallbackNos.map(() => '?').join(',');
                        const [fallbackRows] = await connection.query(
                          `SELECT 
                             il.material_id,
                             il.batch_number    as raw_batch_number,
                             m.code             as raw_material_code,
                             ABS(SUM(il.quantity)) as consumed_quantity
                           FROM inventory_ledger il
                           JOIN materials m ON il.material_id = m.id
                           WHERE il.transaction_type IN ('production_outbound', 'outbound')
                             AND il.reference_no IN (${fallPlaceholders})
                             AND il.quantity < 0
                             AND il.batch_number IS NOT NULL
                             AND il.batch_number != ''
                           GROUP BY il.material_id, il.batch_number, m.code`,
                          fallbackNos
                        );
                        consumedRows.push(...fallbackRows);
                    }
                  }

                  const producedQty = parseFloat(inboundItem.quantity) || 1;

                  for (const raw of consumedRows) {
                    // 避免重复写入（幂等保护）
                    const [existing] = await connection.query(
                      `SELECT id FROM batch_relationships 
                       WHERE parent_batch_number = ? AND child_batch_number = ? 
                         AND parent_material_code = ? AND relationship_type = 'consume'
                       LIMIT 1`,
                      [raw.raw_batch_number, productBatchNo, raw.raw_material_code]
                    );
                    if (existing.length > 0) continue;

                    await connection.execute(
                      `INSERT INTO batch_relationships (
                         parent_batch_id, child_batch_id,
                         parent_material_code, child_material_code,
                         parent_batch_number,  child_batch_number,
                         relationship_type,    consumed_quantity, produced_quantity,
                         conversion_ratio,     process_type,
                         reference_type,       reference_id,  reference_no,
                         operator,             remarks,       created_at
                       ) VALUES (NULL, NULL, ?, ?, ?, ?, 'consume', ?, ?, ?, 'production',
                                 'production_task', ?, ?, ?, ?, NOW())`,
                      [
                        raw.raw_material_code,
                        inboundItem.material_code || '',
                        raw.raw_batch_number,
                        productBatchNo,
                        parseFloat(raw.consumed_quantity),
                        producedQty,
                        producedQty > 0 ? parseFloat(raw.consumed_quantity) / producedQty : 1,
                        taskId,
                        taskCode || inboundData.inbound_no,
                        inboundData.operator || 'system',
                        `生产任务 ${taskCode || taskId} 原料消耗追溯`
                      ]
                    );
                  }

                  if (consumedRows.length > 0) {
                    logger.info(
                      `[追溯] 成品批次 ${productBatchNo} 已建立 ${consumedRows.length} 条原料消耗关系`
                    );
                  } else {
                    logger.warn(
                      `[追溯] 生产任务 ${taskId}(${taskCode}) 未找到对应的原料领用台账，batch_relationships 未写入`
                    );
                  }
                }
              } catch (traceErr) {
                logger.error('建立生产批次消耗追溯关系失败:', traceErr);
              }
            }
          }
        } catch (err) {
          logger.error('异步更新生产单据状态(入库后)失败:', err);
          throw err;
        } finally {
          connection.release();
        }
      });
    }


    // 处理缺陷退货直接生成NCP
    if (inboundData.inbound_type === 'defective_return') {
      DLQService.runWithRetry(`生成退料不良NCP单-${inboundData.inbound_no}`, { inboundItems, inbound_no: inboundData.inbound_no }, async () => {
        const connection = await db.pool.getConnection();
        try {
          await connection.beginTransaction();
          for (const item of inboundItems) {
            const ncpNo = await NonconformingProduct.generateNcpNo();
            let unitName = 'pcs';
            if (item.unit_id) {
              const [unitRows] = await connection.execute('SELECT name FROM units WHERE id = ? AND deleted_at IS NULL', [item.unit_id]);
              if (unitRows.length > 0 && unitRows[0].name) unitName = unitRows[0].name;
            }

            let locationName = '隔离区';
            if (inboundData.location_id) {
              const [locRows] = await connection.execute('SELECT name FROM locations WHERE id = ? AND deleted_at IS NULL', [inboundData.location_id]);
              if (locRows.length > 0) locationName = locRows[0].name;
            }

            let supplierId = null;
            let supplierName = null;
            try {
              const [supplierRows] = await connection.query(`
                SELECT r.supplier_id, COALESCE(s.name, r.supplier_name) AS supplier_name
                FROM purchase_receipts r
                JOIN purchase_receipt_items ri ON r.id = ri.receipt_id
                LEFT JOIN suppliers s ON r.supplier_id = s.id
                WHERE ri.material_id = ?
                ORDER BY r.created_at DESC
                LIMIT 1
              `, [item.material_id]);
              if (supplierRows.length > 0) {
                supplierId = supplierRows[0].supplier_id;
                supplierName = supplierRows[0].supplier_name;
              }
            } catch (err) { logger.warn('查询供应商信息失败:', err.message); }

            await connection.query(`
              INSERT INTO nonconforming_products (
                ncp_no, inspection_id, inspection_no, material_id, material_code, material_name,
                batch_no, quantity, unit, defect_type, defect_description, severity,
                supplier_id, supplier_name, disposition, current_location, isolation_area,
                responsible_party, note, created_by, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              ncpNo, null, null, item.material_id, item.material_code || '', item.material_name || '',
              null, item.quantity, unitName, 'incoming_defect',
              `【自动登记】产线退回来料不良。退库单 ${inboundData.inbound_no}，原始流: ${inboundData.reference_no || '无'}`,
              'minor', supplierId, supplierName, 'pending', locationName, locationName,
              supplierId ? 'supplier' : 'unknown',
              `退料不良自动单-入库: ${inboundData.inbound_no}`,
              inboundData.operator || 'system', 'pending'
            ]);
            
            logger.info(`✅ [流程引擎] 退料入库单 ${inboundData.inbound_no} 直接生成NCP记录: ${ncpNo}`);
          }
          await connection.commit();
        } catch (e) {
          await connection.rollback();
          logger.error(`退料入库单生成NCP失败:`, e);
          throw e;
        } finally {
          connection.release();
        }
      });
    }
  }
}

module.exports = InboundTransactionService;
