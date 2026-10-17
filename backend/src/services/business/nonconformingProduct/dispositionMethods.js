/**
 * NonconformingProductService — disposition methods (mixin)
 * @module nonconformingProduct/dispositionMethods
 */

const runtime = require('./runtime');
const {
  NonconformingProduct,
  logger,
  businessConfig,
  firstValidUserId,
  QualityIntegrationService,
  NotificationService,
  resolveActorLabel,
  STATUS,
  VALID_DISPOSITIONS,
  normalizeNumber,
  validateDispositionPayload,
} = runtime;

module.exports = {
  /**
   * Process disposition
   */
  async processDisposition(ncpId, dispositionData) {
    try {
      const ncp = await NonconformingProduct.getById(ncpId);
      if (!ncp) {
        throw new Error('不合格品单不存在或已被删除');
      }

      if (ncp.status === STATUS.NCP.COMPLETED || ncp.status === STATUS.NCP.CLOSED) {
        throw new Error('该不合格品单已完结，无法修改处置结果');
      }

      validateDispositionPayload(dispositionData);
      await NonconformingProduct.updateDisposition(ncpId, {
        ...dispositionData,
        disposition_reason: String(dispositionData.disposition_reason).trim(),
        disposition_by: await resolveActorLabel(
          null,
          dispositionData.disposition_by,
          dispositionData.updated_by
        ),
      });

      logger.info(`Processed disposition for NCP ${ncp.ncp_no}: ${dispositionData.disposition}`);
      return true;
    } catch (error) {
      logger.error('Failed to process disposition:', error);
      throw error;
    }
  },

  /**
   * Complete NCP handling
   * 完成不合格品处理,并根据处理方式自动执行后续流程
   */
  async completeHandling(ncpId, completionData) {
    const db = require('../../../config/db');
    let connection;

    try {
      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      await require('../PurchaseReceiptReleaseService').lockConcessionOrder(connection, ncpId);

      const [rows] = await connection.query(
        'SELECT id, ncp_no, inspection_id, inspection_no, material_id, material_code, material_name, batch_no, quantity, unit, defect_type, defect_description, severity, supplier_id, supplier_name, disposition, disposition_reason, disposition_by, disposition_date, handled_quantity, handling_cost, status, current_location, isolation_area, responsible_party, responsible_person, attachments, note, created_by, created_at, updated_by, updated_at, concession_reason, concession_approver_id, concession_approval_date, concession_status, deleted_at FROM nonconforming_products WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [ncpId]
      );
      if (rows.length === 0) {
        throw new Error('不合格品单不存在或已被删除');
      }

      const ncp = rows[0];
      if (ncp.status === STATUS.NCP.COMPLETED || ncp.status === STATUS.NCP.CLOSED) {
        throw new Error('该不合格品单已完结，无法完成处理');
      }
      if (!VALID_DISPOSITIONS.includes(ncp.disposition)) {
        throw new Error('请先确定不合格品处置方式，再完成处理');
      }
      // H13: 让步接收(use_as_is)= 特采放行，必须经特采审批通过(approveConcession)后才能入库。
      // 拦截"手动改判 use_as_is 后直接完成"绕过 applyConcession/approveConcession 审批闸门、
      // 把不合格品直接放行入库的路径；正规放行路径为特采申请→审批通过自动入库。
      if (ncp.disposition === 'use_as_is' && ncp.concession_status !== 'approved') {
        throw new Error('让步接收(特采)必须经特采审批通过后才能完成，请改用特采申请/审批流程');
      }

      const ncpQuantity = normalizeNumber(ncp.quantity, 0);
      const alreadyHandled = normalizeNumber(ncp.handled_quantity, 0);
      const handledQuantity = normalizeNumber(
        completionData.handled_quantity,
        ncpQuantity - alreadyHandled
      );
      if (handledQuantity <= 0) {
        throw new Error('处理数量必须大于0');
      }
      // 处置量闭环：累计处置不得超过 NCP 数量；一次完成要求全量处置
      const totalAfter = alreadyHandled + handledQuantity;
      if (totalAfter > ncpQuantity + 0.0001) {
        throw new Error(
          `处理数量不能超过不合格品数量，已处理${alreadyHandled}，本次${handledQuantity}，总数量${ncpQuantity}`
        );
      }
      if (Math.abs(totalAfter - ncpQuantity) > 0.0001 && completionData.force_partial !== true) {
        // 默认要求一次处置清零；允许显式 force_partial 保留部分（未来多段处置）
        if (handledQuantity < ncpQuantity - alreadyHandled - 0.0001) {
          throw new Error(
            `NCP 处置数量未闭环：需处置 ${ncpQuantity - alreadyHandled}，本次 ${handledQuantity}。请全量处置或分次时传 force_partial`
          );
        }
      }
      const finalHandledQuantity = Math.min(totalAfter, ncpQuantity);

      const updateData = {
        handling_cost: normalizeNumber(completionData.handling_cost, 0),
        status: STATUS.NCP.PROCESSING,
        note: completionData.note || ncp.note,
        updated_by: await resolveActorLabel(null, completionData.updated_by),
      };

      await NonconformingProduct.update(ncpId, updateData, connection);

      logger.info(`NCP handling completed: ncpNo=${ncp.ncp_no}, disposition=${ncp.disposition}`);

      // 🚀 根据处理方式自动执行后续流程
      // 将最新的 handling_cost 注入到 ncp 快照中，以便后续处理函数使用
      ncp.handling_cost = updateData.handling_cost;
      try {
        await QualityIntegrationService.linkQualityInspectionToNcp(ncp, connection);

        switch (ncp.disposition) {
          case 'use_as_is':
            // 让步接收 - 自动创建入库单(入库到物料默认仓库)
            await this.handleUseAsIs(
              ncp,
              handledQuantity,
              connection,
              completionData.user_id || ncp.concession_approver_id || ncp.created_by
            );
            break;

          case 'return':
            // 退货 - 自动创建供应商退货单
            await this.handleReturn(ncp, handledQuantity, connection);
            break;

          case 'replacement':
            // 换货 - 自动创建退货单和待收货记录
            await this.handleReplacement(ncp, handledQuantity, connection);
            break;

          case 'scrap':
            // 报废 - 自动创建报废记录
            await this.handleScrap(ncp, handledQuantity, connection);
            break;

          case 'rework':
            // 返工 - 自动创建返工任务
            await this.handleRework(ncp, handledQuantity, connection);
            break;

          default:
            logger.info(`No automatic action for disposition: ${ncp.disposition}`);
        }
      } catch (autoError) {
        logger.error(`自动处理流程失败 (${ncp.disposition}):`, autoError);
        throw autoError;
      }

      // 仅当累计处置量达到 NCP 数量时关单
      const canComplete = finalHandledQuantity + 0.0001 >= ncpQuantity;
      await NonconformingProduct.update(
        ncpId,
        {
          handled_quantity: finalHandledQuantity,
          handling_cost: updateData.handling_cost,
          status: canComplete ? STATUS.NCP.COMPLETED : STATUS.NCP.PROCESSING,
          note: updateData.note,
          updated_by: updateData.updated_by,
        },
        connection
      );

      await connection.commit();
      return true;
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error('Failed to complete handling:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  },

  /**
   * 处理让步接收 - 自动创建入库单(入库到物料默认仓库)
   */
  async handleUseAsIs(ncp, quantity, connection, actorId = null) {
    try {
      logger.info(
        `Processing NCP use-as-is disposition: ncpNo=${ncp.ncp_no}, quantity=${quantity}`
      );

      // 查询检验类型：来料 → 采购收货；过程/终检 → 其它入库（禁止错误建 PO 收货）
      let inspectionType = 'incoming';
      let inspection = {
        reference_id: null,
        reference_no: null,
        supplier_id: ncp.supplier_id || null,
        supplier_name: ncp.supplier_name || null,
        inspection_type: 'incoming',
      };

      if (ncp.inspection_id) {
        const [inspectionRows] = await connection.query(
          `SELECT qi.*, po.supplier_id, s.name as supplier_name
             FROM quality_inspections qi
             LEFT JOIN purchase_orders po ON qi.reference_id = po.id AND qi.inspection_type = 'incoming'
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             WHERE qi.id = ?`,
          [ncp.inspection_id]
        );
        if (inspectionRows.length > 0) {
          inspection = inspectionRows[0];
          inspectionType = String(inspection.inspection_type || 'incoming');
          inspection.supplier_id = inspection.supplier_id || ncp.supplier_id;
          inspection.supplier_name = inspection.supplier_name || ncp.supplier_name || null;
        } else {
          throw new Error(
            `不合格品 ${ncp.ncp_no} 关联的检验单 ${ncp.inspection_id} 不存在，不能继续生成让步接收入库单`
          );
        }
      } else {
        logger.info(`该不合格品 ${ncp.ncp_no} 无检验单关联, 执行无源让步接收建单`);
      }

      // 成品让步仍属于生产入库，保留原终检的不良证据并计入生产完成数量。
      if (inspectionType === 'final') {
        const ProductionInboundService = require('../ProductionInboundService');
        const result = await ProductionInboundService.createDraftFromFinalConcession(connection, {
          ncpId: ncp.id,
          quantity,
          createdBy: firstValidUserId(actorId, ncp.concession_approver_id, ncp.created_by),
          operator: await resolveActorLabel(connection, ncp.disposition_by, actorId),
        });
        return { ...result, path: 'inventory_inbound' };
      }

      // 过程/首件让步：走库存其它入库，不创建采购收货
      if (inspectionType === 'process' || inspectionType === 'first_article') {
        const InventoryService = require('../../InventoryService');
        const { CodeGenerators } = require('../../../utils/codeGenerator');
        const warehouseId = await InventoryService.getMaterialLocation(ncp.material_id, connection);
        if (!warehouseId) {
          throw new Error(`不合格品 ${ncp.ncp_no} 物料未配置默认仓库，不能让步入库`);
        }
        const inboundNo = await CodeGenerators.generateInboundCode(connection);
        const createdBy = firstValidUserId(actorId, ncp.created_by);
        const [matRows] = await connection.query(
          `SELECT unit_id FROM materials WHERE id = ? LIMIT 1`,
          [ncp.material_id]
        );
        const unitId = matRows[0]?.unit_id || null;
        const [inboundResult] = await connection.execute(
          `INSERT INTO inventory_inbound (
               inbound_no, inbound_type, reference_type, reference_id,
               location_id, inbound_date, status, operator, remark, created_by
             ) VALUES (?, 'other', 'ncp', ?, ?, NOW(), 'draft', ?, ?, ?)`,
          [
            inboundNo,
            ncp.id,
            warehouseId,
            await resolveActorLabel(null, ncp.disposition_by),
            `NCP ${ncp.ncp_no} 让步接收（${inspectionType}）`,
            createdBy,
          ]
        );
        await connection.execute(
          `INSERT INTO inventory_inbound_items (
               inbound_id, material_id, quantity, unit_id, location_id, batch_number, remark
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            inboundResult.insertId,
            ncp.material_id,
            quantity,
            unitId,
            warehouseId,
            ncp.batch_no || null,
            `NCP ${ncp.ncp_no} use_as_is`,
          ]
        );
        logger.info(`NCP use-as-is (internal) created inventory inbound draft: ${inboundNo}`);
        return { inbound_no: inboundNo, path: 'inventory_inbound' };
      }

      const PurchaseReceiptReleaseService = require('../PurchaseReceiptReleaseService');
      const { CodeGenerators } = require('../../../utils/codeGenerator');
      const { RECEIPT_STATUS } = require('../../../constants/purchaseConstants');
      const {
        lineAmount,
        normalizeTaxRate,
        taxAmount,
        roundMoney,
      } = require('../../../utils/money');
      const release = await PurchaseReceiptReleaseService.prepareConcession(connection, {
        ncpId: ncp.id,
        quantity,
      });
      const { order, orderItem, inspection: sourceInspection, ncp: approvedNcp } = release;
      const createdBy = firstValidUserId(
        actorId,
        approvedNcp.concession_approver_id,
        approvedNcp.created_by
      );
      if (!createdBy) throw new Error(`不合格品 ${ncp.ncp_no} 缺少可追溯责任人`);

      const InventoryService = require('../../InventoryService');
      const warehouseId = await InventoryService.getMaterialLocation(
        release.materialId,
        connection
      );
      const [[warehouse]] = await connection.query(
        'SELECT id, name FROM locations WHERE id = ? AND status = 1 AND deleted_at IS NULL',
        [warehouseId]
      );
      if (!warehouse) throw new Error(`不合格品 ${ncp.ncp_no} 的物料未配置有效仓库`);
      const [[material]] = await connection.query(
        'SELECT code, name, specs, unit_id FROM materials WHERE id = ? AND deleted_at IS NULL',
        [release.materialId]
      );
      if (!material || !order.supplier_name || !sourceInspection.batch_no) {
        throw new Error(`不合格品 ${ncp.ncp_no} 缺少物料、供应商或检验批次信息`);
      }
      const receiptNo = await CodeGenerators.generateReceiptCode(connection);
      const operator = await resolveActorLabel(connection, approvedNcp.disposition_by, createdBy);
      const taxRate = normalizeTaxRate(orderItem.tax_rate, 0);
      const subtotal = lineAmount(release.quantity, orderItem.price);
      const tax = taxAmount(subtotal, taxRate);
      const total = roundMoney(subtotal + tax);
      const remarks = `批准让步接收 - 不合格品 ${approvedNcp.ncp_no}`;
      const [receiptResult] = await connection.query(
        `INSERT INTO purchase_receipts (
           receipt_no, order_id, order_no, supplier_id, supplier_name,
           warehouse_id, warehouse_name, receipt_date, operator, remarks, status,
           from_inspection, inspection_id, created_by, total_amount, total_tax_amount
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptNo,
          order.id,
          order.order_no,
          order.supplier_id,
          order.supplier_name,
          warehouse.id,
          warehouse.name,
          new Date().toISOString().slice(0, 10),
          operator,
          remarks,
          RECEIPT_STATUS.INSPECTED,
          1,
          sourceInspection.id,
          createdBy,
          total,
          tax,
        ]
      );
      const receiptId = receiptResult.insertId;
      await connection.query(
        `INSERT INTO purchase_receipt_items (
           receipt_id, order_item_id, material_id, material_code, material_name,
           specification, unit, unit_id, ordered_quantity, quantity, received_quantity,
           qualified_quantity, batch_number, price, tax_rate, amount_excluding_tax,
           tax_amount, total_amount, remarks, from_inspection
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptId,
          orderItem.id,
          release.materialId,
          material.code,
          material.name,
          orderItem.specification || material.specs || '',
          orderItem.unit || approvedNcp.unit,
          orderItem.unit_id || material.unit_id,
          orderItem.quantity,
          release.quantity,
          release.quantity,
          release.quantity,
          sourceInspection.batch_no,
          orderItem.price,
          taxRate,
          subtotal,
          tax,
          total,
          remarks,
          1,
        ]
      );
      // The generation link is release evidence, so linking is mandatory and
      // transactional. A best-effort traceability link cannot authorize stock.
      const DocumentLinkService = require('../DocumentLinkService');
      await DocumentLinkService.createLink(
        {
          source_type: 'nonconforming_product',
          source_id: approvedNcp.id,
          source_code: approvedNcp.ncp_no,
          target_type: 'purchase_receipt',
          target_id: receiptId,
          target_code: receiptNo,
          link_type: 'generate',
          created_by: createdBy,
        },
        connection
      );
      await DocumentLinkService.createLink(
        {
          source_type: 'quality_inspection',
          source_id: sourceInspection.id,
          source_code: sourceInspection.inspection_no,
          target_type: 'purchase_receipt',
          target_id: receiptId,
          target_code: receiptNo,
          link_type: 'reference',
          created_by: createdBy,
        },
        connection
      );
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
         VALUES (?, 'auto_receipt', ?, ?)`,
        [
          approvedNcp.id,
          `创建已批准特采收货单 ${receiptNo}，放行数量 ${release.quantity}`,
          operator,
        ]
      );
      return { receiptNo, receiptId };
    } catch (error) {
      logger.error('处理让步接收失败:', error);
      throw error;
    }
  },

  /**
   * 处理退货 - 自动创建采购退货单
   */
  async handleReturn(ncp, quantity, connection) {
    try {
      logger.info(`Processing NCP return disposition: ncpNo=${ncp.ncp_no}, quantity=${quantity}`);

      // ✅ 如果物料名称为空，从物料表获取
      let materialName = ncp.material_name;
      let materialCode = ncp.material_code;
      if (!materialName && ncp.material_id) {
        const [materialRows] = await connection.query(
          'SELECT code, name FROM materials WHERE id = ? AND deleted_at IS NULL',
          [ncp.material_id]
        );
        if (materialRows.length > 0) {
          materialName = materialRows[0].name;
          materialCode = materialCode || materialRows[0].code;
          logger.info(
            `Material information resolved for NCP return: materialCode=${materialCode}, materialName=${materialName}`
          );
        }
      }

      if (!materialName) {
        throw new Error(`不合格品 ${ncp.ncp_no} 缺少物料名称，不能生成采购退货单`);
      }

      // 生成退货单号 - 使用配置化的前缀
      const date = new Date();
      const dateStr = date.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const prefix = `${businessConfig.documentPrefix.RETURN}${dateStr}`; // 使用配置的退货单前缀

      const [maxNoResult] = await connection.query(
        `SELECT MAX(CAST(SUBSTRING(return_no, ?) AS UNSIGNED)) AS max_seq
           FROM purchase_returns WHERE return_no LIKE ? FOR UPDATE`,
        [prefix.length + 1, `${prefix}%`]
      );

      const sequence = (maxNoResult[0]?.max_seq || 0) + 1;

      const returnNo = `${prefix}${String(sequence).padStart(3, '0')}`;

      // 查询检验单信息以获取供应商和仓库信息
      let inspection = {
        supplier_id: ncp.supplier_id || null,
        supplier_name: ncp.supplier_name || null,
        reference_id: null,
        order_no: null,
      };

      if (ncp.inspection_id) {
        const [inspectionRows] = await connection.query(
          `SELECT qi.*,
                    r.id as receipt_id,
                    r.receipt_no,
                    r.order_id as purchase_order_id,
                    po.order_no,
                    po.supplier_id,
                    s.name as supplier_name
             FROM quality_inspections qi
             LEFT JOIN purchase_receipts r ON qi.reference_id = r.id AND qi.inspection_type = 'incoming'
             LEFT JOIN purchase_orders po ON r.order_id = po.id
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             WHERE qi.id = ?`,
          [ncp.inspection_id]
        );
        if (inspectionRows.length > 0) {
          inspection = inspectionRows[0];
          // 回补未指派的供应商属性
          inspection.supplier_id = inspection.supplier_id || ncp.supplier_id;
          inspection.supplier_name = inspection.supplier_name || ncp.supplier_name || null;
          // 正确映射原始单据属性
          inspection.reference_id = inspection.purchase_order_id; // purchase_order_id 的兼容映射
        } else {
          throw new Error(
            `不合格品 ${ncp.ncp_no} 关联的检验单 ${ncp.inspection_id} 不存在，不能继续生成采购退货单`
          );
        }
      } else {
        logger.info(`不合格品 ${ncp.ncp_no} 无检验单关联, 执行无源退货建单`);
        // 🌟 核心修复: 如果不合格品有批号，直接向库存台账查询它的“出生证明（原生身份证）”
        if (ncp.batch_no) {
          try {
            const [originRows] = await connection.query(
              `
                SELECT
                  receipt_id,
                  receipt_no,
                  purchase_order_id as order_id,
                  purchase_order_no as order_no,
                  supplier_id,
                  supplier_name
                FROM v_batch_stock
                WHERE batch_number = ?
                LIMIT 1
              `,
              [ncp.batch_no]
            );

            if (originRows.length > 0) {
              const origin = originRows[0];
              inspection.supplier_id = origin.supplier_id || ncp.supplier_id;
              inspection.supplier_name = origin.supplier_name || ncp.supplier_name || null;
              inspection.reference_id = origin.order_id; // purchase_order_id
              inspection.order_no = origin.order_no;
              inspection.receipt_id = origin.receipt_id;
              inspection.receipt_no = origin.receipt_no;

              logger.info(
                `NCP return source resolved from batch: batchNo=${ncp.batch_no}, receiptNo=${origin.receipt_no}, orderNo=${origin.order_no}`
              );
            } else {
              throw new Error(
                `无法根据批次 ${ncp.batch_no} 的库存流水找到最初的采购入库单，不能生成采购退货单`
              );
            }
          } catch (traceErr) {
            logger.error(`批次血缘反查采购来源报错:`, traceErr);
            throw traceErr;
          }
        }
      }

      if (!inspection.supplier_id) {
        throw new Error(`不合格品 ${ncp.ncp_no} 缺少供应商信息，不能生成采购退货单`);
      }
      if (!inspection.supplier_name) {
        throw new Error(`不合格品 ${ncp.ncp_no} 缺少供应商名称，不能生成采购退货单`);
      }

      // 🔥 修复：优先从 NCP 关联的入库单获取不良品实际存放的库位（如隔离区），
      // 而不是从物料基础表获取默认仓库（零部件库）
      let returnWarehouseId = null;

      // 方式1: 通过检验单 → 入库单链路查询实际入库库位
      if (ncp.inspection_id) {
        const [inboundLocationRows] = await connection.query(
          `SELECT ii.location_id, l.name as location_name
             FROM quality_inspections qi
             JOIN inventory_inbound ii ON qi.id = ii.inspection_id
             JOIN locations l ON ii.location_id = l.id
             WHERE qi.id = ? AND ii.inbound_type = 'defective_return'
             LIMIT 1`,
          [ncp.inspection_id]
        );
        if (inboundLocationRows.length > 0) {
          returnWarehouseId = inboundLocationRows[0].location_id;
          logger.info(
            `NCP return warehouse resolved from inspection inbound: warehouseId=${returnWarehouseId}, warehouseName=${inboundLocationRows[0].location_name}`
          );
        }
      }

      // 方式2: 通过库存台账查询该物料实际有库存的不良品库位
      if (!returnWarehouseId && ncp.material_id) {
        const [ledgerLocationRows] = await connection.query(
          `SELECT il.location_id, l.name as location_name, SUM(il.quantity) as qty
             FROM inventory_ledger il
             JOIN locations l ON il.location_id = l.id
             WHERE il.material_id = ? AND il.transaction_type = 'defective_return'
             GROUP BY il.location_id, l.name
             HAVING SUM(il.quantity) > 0
             ORDER BY qty DESC
             LIMIT 1`,
          [ncp.material_id]
        );
        if (ledgerLocationRows.length > 0) {
          returnWarehouseId = ledgerLocationRows[0].location_id;
          logger.info(
            `NCP return warehouse resolved from inventory ledger: warehouseId=${returnWarehouseId}, warehouseName=${ledgerLocationRows[0].location_name}`
          );
        }
      }

      if (!returnWarehouseId) {
        throw new Error(`不合格品 ${ncp.ncp_no} 未找到实际不良品库存库位，不能生成采购退货单`);
      }

      const [warehouseRows] = await connection.query(
        'SELECT id, name FROM locations WHERE id = ? AND deleted_at IS NULL',
        [returnWarehouseId]
      );

      if (warehouseRows.length === 0) {
        throw new Error('退货出库的仓库不存在，请检查仓库设置');
      }

      const warehouse = warehouseRows[0];

      const createdBy = firstValidUserId(ncp.created_by, inspection.inspector_id);
      if (!createdBy) {
        throw new Error(`不合格品 ${ncp.ncp_no} 缺少可追溯责任人，不能生成采购退货单`);
      }

      const operator = await resolveActorLabel(
        connection,
        createdBy,
        ncp.disposition_by,
        ncp.created_by
      );

      logger.info(
        `Creating purchase return from NCP: ncpNo=${ncp.ncp_no}, operator=${operator}, sourceUser=${ncp.created_by || 'n/a'}`
      );

      // 创建采购退货单(写入purchase_returns表)
      const [returnResult] = await connection.query(
        `INSERT INTO purchase_returns (
            return_no, receipt_id, receipt_no, source_type, supplier_id, supplier_name,
            warehouse_id, warehouse_name, return_date, reason, total_amount,
            operator, remarks, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          returnNo,
          inspection.receipt_id || null, // receipt_id - 通过检验单或批次追溯得到的入库单ID
          inspection.receipt_no || null, // receipt_no
          'ncp_return', // source_type - NCP不合格品自动创建的退货
          inspection.supplier_id,
          inspection.supplier_name,
          warehouse.id,
          warehouse.name,
          new Date().toISOString().slice(0, 10),
          ncp.disposition_reason || '质量不合格',
          parseFloat(ncp.handling_cost) || 0, // total_amount - 使用处理成本作为退货金额
          operator, // ✅ 使用实际操作人而不是硬编码'system'
          `不合格品退货 - ${ncp.ncp_no} ${ncp.inspection_no ? '- 检验单: ' + ncp.inspection_no : ''}`,
          'draft', // ✅ 改为draft状态,与手动创建保持一致
          createdBy,
        ]
      );

      const returnId = returnResult.insertId;

      // 创建退货单明细(写入purchase_return_items表)
      await connection.query(
        `INSERT INTO purchase_return_items (
            return_id, material_id, material_code, material_name,
            quantity, return_quantity, price, return_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          returnId,
          ncp.material_id,
          materialCode, // ✅ 使用处理后的物料编码
          materialName, // ✅ 使用处理后的物料名称
          quantity,
          quantity, // return_quantity
          quantity > 0 ? (parseFloat(ncp.handling_cost) || 0) / quantity : 0, // price - 单价 = 总成本 / 数量
          `不合格品 - ${ncp.ncp_no}`,
        ]
      );

      logger.info(
        `✅ 已创建采购退货单: ${returnNo}, 供应商: ${inspection.supplier_name}, 数量: ${quantity}`
      );

      // 注：退货数据已统一存储在 purchase_returns + purchase_return_items 表中
      // supplier_returns 表已废弃，不再冗余写入

      // 记录操作日志
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
           VALUES (?, 'auto_return', ?, ?)`,
        [
          ncp.id,
          `自动创建采购退货单 ${returnNo}`,
          await resolveActorLabel(connection, ncp.disposition_by, ncp.created_by),
        ]
      );

      await QualityIntegrationService.linkNcpToDocument(
        ncp,
        'purchase_return',
        returnId,
        returnNo,
        connection
      );
      if (inspection.receipt_id) {
        await QualityIntegrationService.linkDocumentToDocument(
          {
            type: 'purchase_receipt',
            id: inspection.receipt_id,
            code: inspection.receipt_no,
          },
          {
            type: 'purchase_return',
            id: returnId,
            code: returnNo,
          },
          connection
        );
      }

      // 发送通知给采购部门
      try {
        await NotificationService.notifyByPermissions(
          ['purchase:returns'],
          {
            type: 'purchase_return',
            title: '采购退货通知',
            content: `退货单 ${returnNo} 已自动创建。供应商: ${inspection.supplier_name}，物料: ${materialName}，退货数量: ${quantity}，原因: ${ncp.disposition_reason || '质量不合格'}。请及时跟进处理。`,
            link: '/purchase/returns',
            linkParams: { id: returnId },
            priority: 1,
            sourceType: 'purchase_return',
            sourceId: returnId,
          },
          { dedupeByDay: true }
        );
        logger.info(`Purchase return notification sent: returnNo=${returnNo}`);
      } catch (notifyError) {
        const DLQService = require('../DLQService');
        await DLQService.recordSideEffectFailure(
          'NonconformingProduct:purchaseReturnNotification',
          { ncpId: ncp.id, returnNo, returnId },
          notifyError
        );
      }

      return { returnNo, returnId };
    } catch (error) {
      logger.error('处理退货失败:', error);
      throw error;
    }
  },

  /**
   * 处理报废 - 自动创建报废记录
   */
  async handleScrap(ncp, quantity, connection) {
    try {
      logger.info(`Processing NCP scrap disposition: ncpNo=${ncp.ncp_no}, quantity=${quantity}`);

      // 生成报废单号 - 使用配置化的前缀
      const date = new Date();
      const dateStr = date.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const prefix = `${businessConfig.documentPrefix.SCRAP}${dateStr}`;

      const [maxNoResult] = await connection.query(
        `SELECT MAX(CAST(SUBSTRING(scrap_no, ?) AS UNSIGNED)) AS max_seq
           FROM scrap_records WHERE scrap_no LIKE ? FOR UPDATE`,
        [prefix.length + 1, `${prefix}%`]
      );

      const sequence = (maxNoResult[0]?.max_seq || 0) + 1;

      const scrapNo = `${prefix}${String(sequence).padStart(3, '0')}`;

      // 注：scrap_records 表应在数据库迁移脚本中创建，不在事务中动态建表

      // 创建报废记录
      const [scrapResult] = await connection.query(
        `INSERT INTO scrap_records (
            scrap_no, ncp_id, ncp_no, material_id, material_code, material_name,
            quantity, scrap_reason, scrap_date, scrap_cost, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          scrapNo,
          ncp.id,
          ncp.ncp_no,
          ncp.material_id,
          ncp.material_code,
          ncp.material_name,
          quantity,
          ncp.disposition_reason || '质量不合格',
          new Date().toISOString().slice(0, 10),
          ncp.handling_cost || 0,
          'pending',
          await resolveActorLabel(connection, ncp.disposition_by, ncp.created_by),
        ]
      );
      const scrapId = scrapResult.insertId;

      logger.info(`Scrap record created from NCP: scrapNo=${scrapNo}, quantity=${quantity}`);

      // 记录操作日志
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
           VALUES (?, 'auto_scrap', ?, ?)`,
        [
          ncp.id,
          `自动创建报废记录 ${scrapNo}`,
          await resolveActorLabel(connection, ncp.disposition_by, ncp.created_by),
        ]
      );

      await QualityIntegrationService.linkNcpToDocument(
        ncp,
        'scrap_record',
        scrapId,
        scrapNo,
        connection
      );

      return { scrapNo, scrapId };
    } catch (error) {
      logger.error('处理报废失败:', error);
      throw error;
    }
  },

  /**
   * 处理返工 - 自动创建返工任务
   */
  async handleRework(ncp, quantity, connection) {
    try {
      logger.info(`Processing NCP rework disposition: ncpNo=${ncp.ncp_no}, quantity=${quantity}`);

      // 使用编码引擎生成返工单号
      const CodeGenSvc = require('../CodeGeneratorService');
      const reworkNo = await CodeGenSvc.nextCode('rework_task', connection);

      // 注：rework_tasks 表应在数据库迁移脚本中创建，不在事务中动态建表

      // 创建返工任务
      const [reworkResult] = await connection.query(
        `INSERT INTO rework_tasks (
            rework_no, ncp_id, ncp_no, material_id, material_code, material_name,
            quantity, rework_reason, rework_instructions, planned_date, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reworkNo,
          ncp.id,
          ncp.ncp_no,
          ncp.material_id,
          ncp.material_code,
          ncp.material_name,
          quantity,
          ncp.disposition_reason || '质量不合格',
          ncp.defect_description || '请根据缺陷描述进行返工',
          new Date().toISOString().slice(0, 10),
          'pending',
          await resolveActorLabel(connection, ncp.disposition_by, ncp.created_by),
        ]
      );
      const reworkId = reworkResult.insertId;

      logger.info(`Rework task created from NCP: reworkNo=${reworkNo}, quantity=${quantity}`);

      // 记录操作日志
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
           VALUES (?, 'auto_rework', ?, ?)`,
        [
          ncp.id,
          `自动创建返工任务 ${reworkNo}`,
          await resolveActorLabel(connection, ncp.disposition_by, ncp.created_by),
        ]
      );

      await QualityIntegrationService.linkNcpToDocument(
        ncp,
        'rework_task',
        reworkId,
        reworkNo,
        connection
      );

      return { reworkNo, reworkId };
    } catch (error) {
      logger.error('处理返工失败:', error);
      throw error;
    }
  },

  /**
   * 🔁 处理换货
   * 换货流程:
   * 1. 创建供应商退货单(退回不合格品)
   * 2. 在采购订单中标记待换货数量
   * 3. 等待供应商发货合格品
   *
   * @param {Object} ncp - 不合格品记录
   * @param {Number} quantity - 换货数量
   * @param {Object} connection - 数据库连接
   */
  async handleReplacement(ncp, quantity, connection) {
    try {
      logger.info(`🔁 处理换货: ${ncp.ncp_no}, 数量: ${quantity}`);

      // 1. 先创建退货单(退回不合格品)
      const returnResult = await this.handleReturn(ncp, quantity, connection);

      // 2. 查找原始采购订单 (兼容无单据模式)
      const orderItems = [];
      if (ncp.inspection_no) {
        const [rows] = await connection.query(
          `SELECT poi.*, po.order_no, po.supplier_id, po.supplier_name
             FROM purchase_order_items poi
             JOIN purchase_orders po ON poi.order_id = po.id
             WHERE poi.material_id = ? AND po.order_no = (
               SELECT reference_no FROM quality_inspections WHERE inspection_no = ?
             )`,
          [ncp.material_id, ncp.inspection_no]
        );
        orderItems.push(...rows);
      }

      const orderItem = orderItems[0] || {
        order_no: null,
        supplier_id: ncp.supplier_id || null,
        supplier_name: ncp.supplier_name || null,
      };

      if (!orderItem.supplier_id || !orderItem.supplier_name) {
        throw new Error(`不合格品 ${ncp.ncp_no} 缺少供应商信息，不能生成换货单`);
      }

      // 注：replacement_orders 表应在数据库迁移脚本中创建，不在事务中动态建表

      // 4. 生成换货单号 - 使用配置化的前缀
      const date = new Date();
      const dateStr = date.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const prefix = `${businessConfig.documentPrefix.REPLACEMENT}${dateStr}`;

      const [maxNoResult] = await connection.query(
        `SELECT MAX(CAST(SUBSTRING(replacement_no, ?) AS UNSIGNED)) AS max_seq
           FROM replacement_orders WHERE replacement_no LIKE ? FOR UPDATE`,
        [prefix.length + 1, `${prefix}%`]
      );

      const sequence = (maxNoResult[0]?.max_seq || 0) + 1;

      const replacementNo = `${prefix}${String(sequence).padStart(3, '0')}`;

      // 5. 创建换货记录
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 7); // 预计7天后到货

      const [replacementResult] = await connection.query(
        `INSERT INTO replacement_orders (
            replacement_no, ncp_id, ncp_no, return_no, purchase_order_no,
            supplier_id, supplier_name, material_id, material_code, material_name,
            quantity, replacement_reason, expected_date, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          replacementNo,
          ncp.id,
          ncp.ncp_no,
          returnResult.returnNo,
          orderItem.order_no,
          orderItem.supplier_id,
          orderItem.supplier_name,
          ncp.material_id,
          ncp.material_code,
          ncp.material_name,
          quantity,
          ncp.disposition_reason || '质量不合格,要求换货',
          expectedDate.toISOString().slice(0, 10),
          'pending',
          await resolveActorLabel(connection, ncp.disposition_by, ncp.created_by),
        ]
      );
      const replacementId = replacementResult.insertId;

      logger.info(
        `✅ 已创建换货单: ${replacementNo}, 退货单: ${returnResult.returnNo}, 数量: ${quantity}`
      );

      // 6. 记录操作日志
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
           VALUES (?, 'auto_replacement', ?, ?)`,
        [
          ncp.id,
          `自动创建换货单 ${replacementNo},退货单 ${returnResult.returnNo}`,
          await resolveActorLabel(connection, ncp.disposition_by, ncp.created_by),
        ]
      );

      await QualityIntegrationService.linkNcpToDocument(
        ncp,
        'replacement_order',
        replacementId,
        replacementNo,
        connection
      );
      if (returnResult.returnId) {
        await QualityIntegrationService.linkDocumentToDocument(
          {
            type: 'purchase_return',
            id: returnResult.returnId,
            code: returnResult.returnNo,
          },
          {
            type: 'replacement_order',
            id: replacementId,
            code: replacementNo,
          },
          connection
        );
      }

      return {
        replacementId,
        replacementNo,
        returnNo: returnResult.returnNo,
        expectedDate: expectedDate.toISOString().slice(0, 10),
      };
    } catch (error) {
      logger.error('处理换货失败:', error);
      throw error;
    }
  },
};
