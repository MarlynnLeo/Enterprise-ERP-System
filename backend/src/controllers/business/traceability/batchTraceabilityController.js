/**
 * 批次追溯控制器
 * 提供批次追溯查询接口，支持正向和反向追溯查询
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const BatchManagementService = require('../../../services/business/BatchManagementService');
const FIFOOutboundService = require('../../../services/business/FIFOOutboundService');
const InventoryTraceabilityService = require('../../../services/business/InventoryTraceabilityService');
const ProductSalesTraceabilityService = require('../../../services/business/ProductSalesTraceabilityService');
const db = require('../../../config/db');
const ExcelJS = require('exceljs');

const toRows = (result) => (Array.isArray(result.rows) ? result.rows : (result.rows ? [result.rows] : []));

const getBatchDetailsData = async (materialCode, batchNumber) => {
  const batchQuery = `
    SELECT 
      il.location_id,
      il.material_id,
      il.batch_number,
      SUM(il.quantity) as current_quantity,
      SUM(CASE WHEN il.quantity > 0 THEN il.quantity ELSE 0 END) as original_quantity,
      MIN(il.created_at) as created_at,
      m.code as material_code, 
      m.name as material_name, 
      u.name as unit, 
      NULL as supplier_name,
      'active' as status
    FROM inventory_ledger il
    LEFT JOIN materials m ON il.material_id = m.id
    LEFT JOIN units u ON m.unit_id = u.id
    WHERE m.code = ? AND il.batch_number = ?
    GROUP BY il.location_id, il.material_id, il.batch_number, m.code, m.name, u.name
    LIMIT 1
  `;
  const batchRows = toRows(await db.query(batchQuery, [materialCode, batchNumber]));

  if (batchRows.length === 0) {
    return null;
  }

  const transactionQuery = `
    SELECT il.*, l.name as location_name
    FROM inventory_ledger il
    LEFT JOIN locations l ON il.location_id = l.id
    WHERE il.material_id = (SELECT id FROM materials WHERE code = ?)
      AND il.batch_number = ?
    ORDER BY il.created_at ASC
  `;
  const transactionRows = toRows(await db.query(transactionQuery, [materialCode, batchNumber]));

  return {
    batch_info: batchRows[0],
    transaction_history: transactionRows,
  };
};

const batchTraceabilityController = {
  /**
   * 统一追溯查询接口 - 自动识别物料类型
   */
  async getUnifiedTraceability(req, res) {
    try {
      const { materialCode, batchNumber } = req.query;

      if (!materialCode) {
        return ResponseHandler.error(res, '物料编码不能为空', 'BAD_REQUEST', 400);
      }

      // 单表架构：统一查询 traceability 表（原材料/成品均在此表中）
      if (!batchNumber) {
        return ResponseHandler.error(res, '请提供批次号查询追溯', 'BAD_REQUEST', 400);
      }

      // 查询原材料批次信息
      const batchQuery = `
        SELECT
          il.material_id,
          il.batch_number,
          SUM(il.quantity) as current_quantity,
          SUM(CASE WHEN il.quantity > 0 THEN il.quantity ELSE 0 END) as original_quantity,
          MIN(il.created_at) as created_at,
          m.code as material_code,
          m.name as material_name,
          m.specs as specification,
          u.name as unit,
          (SELECT COALESCE(NULLIF(il2.supplier_name, ''), s.name) 
           FROM inventory_ledger il2 
           LEFT JOIN suppliers s ON il2.supplier_id = s.id
           WHERE il2.material_id = il.material_id AND il2.batch_number = il.batch_number 
             AND il2.quantity > 0
           ORDER BY il2.created_at ASC LIMIT 1) as supplier_name,
          'active' as status
        FROM inventory_ledger il
        LEFT JOIN materials m ON il.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE m.code = ? AND il.batch_number = ?
        GROUP BY il.material_id, il.batch_number, m.code, m.name, m.specs, u.name
        LIMIT 1
      `;

      const batchResult = await db.query(batchQuery, [materialCode, batchNumber]);

      // 由于 db.query 底层拦截器有可能会将 len=1 的数组直接解压为对象
      const safeBatchRows = Array.isArray(batchResult.rows)
        ? batchResult.rows
        : (batchResult.rows ? [batchResult.rows] : []);


      if (safeBatchRows.length === 0) {
        return ResponseHandler.error(res, '未找到该批次信息', 'NOT_FOUND', 404);
      }

      const batchInfo = safeBatchRows[0];

      // 查询该批次的流水记录
      const transactionQuery = `
        SELECT
          il.*,
          l.name as location_name
        FROM inventory_ledger il
        LEFT JOIN locations l ON il.location_id = l.id
        WHERE il.material_id = (SELECT id FROM materials WHERE code = ?)
          AND il.batch_number = ?
        ORDER BY il.created_at ASC
      `;

      const transactionResult = await db.query(transactionQuery, [materialCode, batchNumber]);
      const safeTransactionRows = Array.isArray(transactionResult.rows)
        ? transactionResult.rows
        : (transactionResult.rows ? [transactionResult.rows] : []);


      // ✅ 将同一 reference_no+transaction_type 的多条台账合并，防止 FIFO 跨批次出库显示多条
      const mergedTransactions = [];
      const txMap = new Map();
      for (const tx of safeTransactionRows) {
        const key = `${tx.reference_no || ''}__${tx.transaction_type}`;
        if (txMap.has(key)) {
          const existing = txMap.get(key);
          existing.quantity = parseFloat(existing.quantity) + parseFloat(tx.quantity);
        } else {
          const clone = { ...tx };
          clone.quantity = parseFloat(tx.quantity);
          txMap.set(key, clone);
          mergedTransactions.push(clone);
        }
      }

      const responseData = {
        type: 'material',
        batch_info: {
          material_code: batchInfo.material_code,
          material_name: batchInfo.material_name,
          batch_number: batchInfo.batch_number,
          specification: batchInfo.specification,
          original_quantity: batchInfo.original_quantity,
          current_quantity: batchInfo.current_quantity,
          receipt_date: batchInfo.created_at,
          supplier_name: batchInfo.supplier_name,
          status: batchInfo.status || 'active',
          unit: batchInfo.unit,
        },
        transaction_history: mergedTransactions,
      };


      // 智能探测物料类型并扩展全链路数据
      try {
        const materialTypeResult = await db.query(
          `SELECT material_type FROM materials WHERE code = ?`,
          [materialCode]
        );
        const matType = materialTypeResult.rows?.[0]?.material_type || 'material';
        responseData.isProduct = matType === 'product';
        responseData.type = matType;

        if (matType === 'material' || matType === 'raw_material') {
          // 原材料：正向追溯查询生产去向及最终客户
          const traceChainResult = await db.pool.execute(
            `
            SELECT 
              m2.code as product_code,
              m2.name as product_name,
              m2.specs as product_specification,
              br.child_batch_number as product_batch,
              target_vbs.receipt_date as production_date,
              pst.customer_name,
              pst.outbound_no,
              pst.allocated_quantity,
              pst.delivery_date,
              pst.created_at as sales_created_at,
              br.consumed_quantity
            FROM batch_relationships br
            LEFT JOIN v_batch_stock target_vbs ON br.child_batch_number = target_vbs.batch_number  
            LEFT JOIN materials m2 ON target_vbs.material_id = m2.id
            LEFT JOIN product_sales_traceability pst ON br.child_batch_number = pst.product_batch_number
            WHERE br.parent_batch_number = ? AND br.relationship_type = 'consume'
            ORDER BY target_vbs.receipt_date ASC, pst.created_at ASC
            `,
            [batchNumber]
          );

          const traceRecords = traceChainResult[0] || [];
          if (traceRecords.length > 0) {
            responseData.steps = traceRecords.map(r => ({
              step_type: r.customer_name ? 'SALES_OUT' : 'PRODUCTION_IN',
              reference_no: r.outbound_no || r.product_batch,
              remarks: r.customer_name || '生产耗用',
              quantity: r.allocated_quantity || r.consumed_quantity,
              created_at: r.sales_created_at || r.delivery_date || r.production_date,
              product_name: r.product_name,
              product_code: r.product_code,
              product_specification: r.product_specification
            }));
          }
        }
        else if (matType === 'product') {
          // 成品：调用反向追溯查询使用的材料及后续销售情况
          const fullTraceResult = await ProductSalesTraceabilityService.getProductFullTraceability(materialCode, batchNumber);

          if (fullTraceResult.success && fullTraceResult.data) {
            responseData.product_code = materialCode;
            responseData.production_materials = fullTraceResult.data.raw_materials || [];
            responseData.steps = (fullTraceResult.data.sales_records || []).map(r => ({
              step_type: 'SALES_OUT',
              reference_no: r.outbound_no,
              remarks: r.customer_name,
              quantity: r.allocated_quantity,
              created_at: r.sales_created_at || r.delivery_date
            }));
          }
        }
      } catch (extErr) {
        logger.warn('全链路数据扩展失败，将仅返回基础批次流水:', extErr);
      }

      // 不管是原料还是成品，尝试查询它是否有 BOM 配方（它可能是一个半成品）
      try {
        const [bomMasters] = await db.pool.execute(
          `SELECT id FROM bom_masters 
           WHERE product_id = (SELECT id FROM materials WHERE code = ?)
           ORDER BY CASE WHEN approved_by IS NOT NULL THEN 0 ELSE 1 END, created_at DESC 
           LIMIT 1`,
          [materialCode]
        );

        if (bomMasters.length > 0) {
          const bomId = bomMasters[0].id;

          // ✅ 正确做法：先查该成品批次实际消耗的原料批次（来自 batch_relationships 或生产领料台账）
          //
          // batch_relationships 表记录了"哪个成品批次是由哪些原料批次消耗而来的"
          // 这才是本次追溯的真实原料消耗链路

          // 步骤1：从 batch_relationships 查本批产品实际使用的原料批次
          const [actualConsumed] = await db.pool.execute(
            `SELECT DISTINCT
               m.code  as raw_material_code,
               m.name  as raw_material_name,
               m.specs as specification,
               u.name  as unit,
               br.consumed_quantity,
               br.parent_batch_number as raw_material_batch,
               -- 从台账找该原料批次对应的供应商（正向入库那条记录）
               (SELECT COALESCE(NULLIF(il_s.supplier_name, ''), s_s.name)
                FROM inventory_ledger il_s
                LEFT JOIN suppliers s_s ON il_s.supplier_id = s_s.id
                WHERE il_s.material_id = m.id
                  AND il_s.batch_number = br.parent_batch_number
                  AND il_s.quantity > 0
                ORDER BY il_s.created_at ASC
                LIMIT 1) as supplier_name,
               -- 从台账找该原料批次最早入库时间（即真实采购时间）
               (SELECT il_dt.created_at
                FROM inventory_ledger il_dt
                WHERE il_dt.material_id = m.id
                  AND il_dt.batch_number = br.parent_batch_number
                  AND il_dt.quantity > 0
                ORDER BY il_dt.created_at ASC
                LIMIT 1) as purchase_date
             FROM batch_relationships br
             JOIN materials m ON m.code = br.parent_material_code
             LEFT JOIN units u ON m.unit_id = u.id
             WHERE br.child_batch_number = ?
               AND br.relationship_type = 'consume'
             ORDER BY m.code`,
            [batchNumber]
          );

          if (actualConsumed.length > 0) {
            // 情况A：有真实消耗记录，直接使用（最准确）
            responseData.bom_components = actualConsumed;
          } else {
            // 情况B：batch_relationships 中没有记录（生产时未做系统领料，无法精确追溯）
            // 降级策略：展示 BOM 配方结构，同时为每个原料查询
            //   该成品入库时间【之前】最近的采购批次/供应商/采购时间
            //   这比 NULL 更有参考价值，且不会出现"未来才进的货"的错误信息

            // 先取成品批次的入库时间（用于截止时间）
            const [batchInbTime] = await db.pool.execute(
              `SELECT created_at as inbound_time
               FROM inventory_ledger
               WHERE batch_number = ? AND quantity > 0
               ORDER BY created_at ASC LIMIT 1`,
              [batchNumber]
            );
            const inboundCutoff = batchInbTime.length > 0
              ? batchInbTime[0].inbound_time
              : new Date();

            const [bomDetails] = await db.pool.execute(
              `SELECT 
                 m.code as raw_material_code,
                 m.name as raw_material_name,
                 m.specs as specification,
                 u.name as unit,
                 bd.quantity as consumed_quantity,
                 -- 取该成品入库时间之前，该原料最近一次的采购批次号
                 (SELECT il_b.batch_number
                  FROM inventory_ledger il_b
                  WHERE il_b.material_id = m.id
                    AND il_b.quantity > 0
                    AND il_b.batch_number IS NOT NULL AND il_b.batch_number != ''
                    AND il_b.created_at <= ?
                  ORDER BY il_b.created_at DESC
                  LIMIT 1) as raw_material_batch,
                 -- 取该成品入库时间之前，该原料最近一次采购入库的供应商
                 (SELECT COALESCE(NULLIF(il_s.supplier_name,''), s.name)
                  FROM inventory_ledger il_s
                  LEFT JOIN suppliers s ON il_s.supplier_id = s.id
                  WHERE il_s.material_id = m.id
                    AND il_s.quantity > 0
                    AND il_s.created_at <= ?
                  ORDER BY il_s.created_at DESC
                  LIMIT 1) as supplier_name,
                 -- 取该成品入库时间之前，该原料最近一次采购入库的时间
                 (SELECT il_d.created_at
                  FROM inventory_ledger il_d
                  WHERE il_d.material_id = m.id
                    AND il_d.quantity > 0
                    AND il_d.created_at <= ?
                  ORDER BY il_d.created_at DESC
                  LIMIT 1) as purchase_date
               FROM bom_details bd
               LEFT JOIN materials m ON bd.material_id = m.id
               LEFT JOIN units u ON m.unit_id = u.id
               WHERE bd.bom_id = ?`,
              [inboundCutoff, inboundCutoff, inboundCutoff, bomId]
            );
            responseData.bom_components = bomDetails;
            logger.info(
              `批次 ${batchNumber} 无实际领料记录，展示 BOM 配方（含截止 ${inboundCutoff} 前最近采购批次）`
            );
          }

        }
      } catch (bomErr) {
        logger.warn('获取BOM清单失败:', bomErr);
      }


      ResponseHandler.success(res, responseData, '批次追溯查询成功');
    } catch (error) {
      logger.error('统一追溯查询失败:', error);
      ResponseHandler.error(res, '统一追溯查询失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取批次追溯链路
   */
  async getBatchTraceabilityChain(req, res) {
    try {
      const { materialCode, batchNumber, direction = 'forward' } = req.query;

      if (!materialCode || !batchNumber) {
        return ResponseHandler.error(res, '物料编码和批次号不能为空', 'BAD_REQUEST', 400);
      }

      if (!['forward', 'backward'].includes(direction)) {
        return ResponseHandler.error(res, '追溯方向只能是 forward 或 backward', 'BAD_REQUEST', 400);
      }

      const traceabilityChain = await InventoryTraceabilityService.getBatchTraceabilityChain(
        materialCode,
        batchNumber,
        direction
      );

      ResponseHandler.success(res, traceabilityChain, '操作成功');
    } catch (error) {
      logger.error('获取批次追溯链路失败:', error);
      ResponseHandler.error(res, '获取批次追溯链路失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取批次详细信息 (通过路径参数)
   */
  async getBatchDetailsByPath(req, res) {
    try {
      const { materialCode, batchNumber } = req.params;

      if (!materialCode || !batchNumber) {
        return ResponseHandler.error(res, '物料编码和批次号不能为空', 'BAD_REQUEST', 400);
      }

      const batchDetails = await getBatchDetailsData(materialCode, batchNumber);
      if (!batchDetails) {
        return res.status(404).json({ success: false, message: `未找到批次: ${materialCode} - ${batchNumber}` });
      }
      ResponseHandler.success(res, batchDetails, '操作成功');
    } catch (error) {
      logger.error('获取批次详细信息失败:', error);
      ResponseHandler.error(res, '获取批次详细信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取批次详细信息 (通过查询参数)
   */
  async getBatchDetails(req, res) {
    try {
      const { materialCode, batchNumber } = req.query;

      if (!materialCode || !batchNumber) {
        return ResponseHandler.error(res, '物料编码和批次号不能为空', 'BAD_REQUEST', 400);
      }

      const batchDetails = await getBatchDetailsData(materialCode, batchNumber);
      if (!batchDetails) {
        return res.status(404).json({ success: false, message: `未找到批次: ${materialCode} - ${batchNumber}` });
      }

      res.json({
        success: true,
        data: batchDetails,
      });
    } catch (error) {
      logger.error('获取批次详细信息失败:', error);
      ResponseHandler.error(res, '获取批次详细信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取FIFO出库预览
   */
  async getFIFOOutboundPreview(req, res) {
    try {
      const { materialId, requiredQuantity } = req.query;

      if (!materialId || !requiredQuantity) {
        return ResponseHandler.error(res, '物料ID和需要数量不能为空', 'BAD_REQUEST', 400);
      }

      const preview = await FIFOOutboundService.getFIFOOutboundPreview(
        parseInt(materialId),
        parseFloat(requiredQuantity)
      );

      ResponseHandler.success(res, preview, '操作成功');
    } catch (error) {
      logger.error('获取FIFO出库预览失败:', error);
      ResponseHandler.error(res, '获取FIFO出库预览失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 批量获取FIFO出库预览
   */
  async getBatchFIFOOutboundPreview(req, res) {
    try {
      const { materials } = req.body;

      if (!materials || !Array.isArray(materials) || materials.length === 0) {
        return ResponseHandler.error(res, '物料列表不能为空', 'BAD_REQUEST', 400);
      }

      // 验证物料数据格式
      for (const material of materials) {
        if (!material.material_id || !material.required_quantity) {
          return ResponseHandler.error(
            res,
            '每个物料必须包含 material_id 和 required_quantity',
            'BAD_REQUEST',
            400
          );
        }
      }

      const preview = await FIFOOutboundService.getBatchFIFOOutboundPreview(materials);

      ResponseHandler.success(res, preview, '操作成功');
    } catch (error) {
      logger.error('批量获取FIFO出库预览失败:', error);
      ResponseHandler.error(res, '批量获取FIFO出库预览失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 检查库存可用性
   */
  async checkInventoryAvailability(req, res) {
    try {
      const { materials } = req.body;

      if (!materials || !Array.isArray(materials) || materials.length === 0) {
        return ResponseHandler.error(res, '物料列表不能为空', 'BAD_REQUEST', 400);
      }

      const availability = await FIFOOutboundService.checkInventoryAvailability(materials);

      ResponseHandler.success(res, availability, '操作成功');
    } catch (error) {
      logger.error('检查库存可用性失败:', error);
      ResponseHandler.error(res, '检查库存可用性失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取批次老化报告
   */
  async getBatchAgingReport(req, res) {
    try {
      const { materialId, daysThreshold = 30 } = req.query;

      if (!materialId) {
        return ResponseHandler.error(res, '物料ID不能为空', 'BAD_REQUEST', 400);
      }

      const report = await FIFOOutboundService.getBatchAgingReport(
        parseInt(materialId),
        parseInt(daysThreshold)
      );

      ResponseHandler.success(res, report, '操作成功');
    } catch (error) {
      logger.error('获取批次老化报告失败:', error);
      ResponseHandler.error(res, '获取批次老化报告失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 执行生产出库
   */
  async processProductionOutbound(req, res) {
    try {
      const outboundData = req.body;

      // 验证必要字段
      if (
        !outboundData.production_task_id ||
        !outboundData.materials ||
        !Array.isArray(outboundData.materials)
      ) {
        return ResponseHandler.error(res, '生产任务ID和物料列表不能为空', 'BAD_REQUEST', 400);
      }

      const result = await FIFOOutboundService.processProductionOutbound(outboundData);

      ResponseHandler.success(res, result, '生产出库处理成功');
    } catch (error) {
      logger.error('生产出库处理失败:', error);
      ResponseHandler.error(res, '生产出库处理失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 执行销售出库
   */
  async processSalesOutbound(req, res) {
    try {
      const outboundData = req.body;

      // 验证必要字段
      if (
        !outboundData.sales_order_id ||
        !outboundData.products ||
        !Array.isArray(outboundData.products)
      ) {
        return ResponseHandler.error(res, '销售订单ID和产品列表不能为空', 'BAD_REQUEST', 400);
      }

      const result = await FIFOOutboundService.processSalesOutbound(outboundData);

      ResponseHandler.success(res, result, '销售出库处理成功');
    } catch (error) {
      logger.error('销售出库处理失败:', error);
      ResponseHandler.error(res, '销售出库处理失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 处理采购入库
   */
  async handlePurchaseReceipt(req, res) {
    try {
      const receiptData = req.body;

      // 验证必要字段
      if (!receiptData.receipt_id || !receiptData.items || !Array.isArray(receiptData.items)) {
        return ResponseHandler.error(res, '入库单ID和物料项目不能为空', 'BAD_REQUEST', 400);
      }

      const result = await InventoryTraceabilityService.handlePurchaseReceipt(receiptData);

      ResponseHandler.success(res, result, '采购入库处理成功');
    } catch (error) {
      logger.error('采购入库处理失败:', error);
      ResponseHandler.error(res, '采购入库处理失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 处理生产入库
   */
  async handleProductionInbound(req, res) {
    try {
      const productionData = req.body;

      // 验证必要字段
      if (
        !productionData.production_task_id ||
        !productionData.product_code ||
        !productionData.consumed_materials
      ) {
        return ResponseHandler.error(
          res,
          '生产任务ID、产品编码和消耗物料不能为空',
          'BAD_REQUEST',
          400
        );
      }

      const result = await InventoryTraceabilityService.handleProductionInbound(productionData);

      ResponseHandler.success(res, result, '生产入库处理成功');
    } catch (error) {
      logger.error('生产入库处理失败:', error);
      ResponseHandler.error(res, '生产入库处理失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 批次预留
   */
  async reserveBatch(req, res) {
    try {
      const reserveData = req.body;

      // 验证必要字段
      if (!reserveData.material_id || !reserveData.required_quantity) {
        return ResponseHandler.error(res, '物料ID和需要数量不能为空', 'BAD_REQUEST', 400);
      }

      const result = await BatchManagementService.reserveBatch(reserveData);

      ResponseHandler.success(res, result, '批次预留成功');
    } catch (error) {
      logger.error('批次预留失败:', error);
      ResponseHandler.error(res, '批次预留失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 导出批次追溯报告
   */
  async exportTraceabilityReport(req, res) {
    try {
      const { materialCode, batchNumber, direction = 'forward' } = req.query;

      if (!materialCode || !batchNumber) {
        return ResponseHandler.error(res, '物料编码和批次号不能为空', 'BAD_REQUEST', 400);
      }

      // 获取批次详情
      const batches = await BatchManagementService.getBatchByMaterialAndBatch(
        materialCode,
        batchNumber
      );
      if (!batches || batches.length === 0) {
        return res.status(404).json({
          success: false,
          message: `未找到批次: ${materialCode} - ${batchNumber}`,
        });
      }
      const batch = batches[0];

      // 获取追溯链路
      const traceabilityChain = await InventoryTraceabilityService.getBatchTraceabilityChain(
        materialCode,
        batchNumber,
        direction
      );

      // 获取流转历史 (✅ 单表架构: 使用 inventory_ledger)
      const transactionQuery = `
        SELECT
          transaction_type, quantity, unit_id, before_quantity, after_quantity,
          reference_type, reference_no, operator, remark as remarks, 
          DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as formatted_date
        FROM inventory_ledger
        WHERE batch_number = ?
        ORDER BY created_at DESC
      `;
      const transactionResult = await db.query(transactionQuery, [batchNumber]);
      const transactions = transactionResult.rows || transactionResult[0] || [];

      // 创建Excel工作簿
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('批次追溯报告');

      // 设置列宽
      worksheet.columns = [
        { width: 15 },
        { width: 20 },
        { width: 20 },
        { width: 15 },
        { width: 15 },
      ];

      // 添加标题
      worksheet.mergeCells('A1:E1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = '批次追溯报告';
      titleCell.font = { size: 16, bold: true };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 30;

      // 添加批次基本信息
      let currentRow = 3;
      worksheet.addRow(['批次基本信息']).font = { bold: true, size: 12 };
      currentRow++;

      worksheet.addRow(['物料编码', batch.material_code || '-']);
      worksheet.addRow(['物料名称', batch.material_name || '-']);
      worksheet.addRow(['批次号', batch.batch_number || '-']);
      worksheet.addRow(['当前库存', `${batch.current_quantity || 0} ${batch.unit || ''}`]);
      worksheet.addRow(['可用库存', `${batch.available_quantity || 0} ${batch.unit || ''}`]);
      worksheet.addRow(['供应商', batch.supplier_name || '-']);
      worksheet.addRow([
        '入库时间',
        batch.receipt_date ? new Date(batch.receipt_date).toLocaleString('zh-CN') : '-',
      ]);
      worksheet.addRow(['仓库位置', `${batch.warehouse_name || '-'} - ${batch.location || '-'}`]);
      worksheet.addRow(['状态', batch.status || '-']);
      currentRow += 9;

      // 添加追溯链路
      currentRow += 2;
      worksheet.addRow([`${direction === 'forward' ? '正向' : '反向'}追溯链路`]).font = {
        bold: true,
        size: 12,
      };
      currentRow++;

      if (
        traceabilityChain &&
        traceabilityChain.traceability_chain &&
        traceabilityChain.traceability_chain.length > 0
      ) {
        worksheet.addRow(['关系类型', '物料编码', '批次号', '消耗数量', '产出数量']);
        worksheet.getRow(currentRow).font = { bold: true };
        currentRow++;

        traceabilityChain.traceability_chain.forEach((item) => {
          const relationshipText =
            {
              consume: '消耗',
              produce: '生产',
              transform: '转换',
              assemble: '组装',
            }[item.relationship_type] || item.relationship_type;

          const targetBatch = direction === 'forward' ? item.child_batch : item.parent_batch;

          worksheet.addRow([
            relationshipText,
            targetBatch?.material_code || '-',
            targetBatch?.batch_number || '-',
            item.consumed_quantity || 0,
            item.produced_quantity || 0,
          ]);
          currentRow++;
        });
      } else {
        worksheet.addRow(['暂无追溯链路数据']);
        currentRow++;
      }

      // 添加流转历史
      currentRow += 2;
      worksheet.addRow(['批次流转历史']).font = { bold: true, size: 12 };
      currentRow++;

      if (transactions && transactions.length > 0) {
        worksheet.addRow(['交易类型', '数量', '变更前', '变更后', '操作员', '交易时间']);
        worksheet.getRow(currentRow).font = { bold: true };
        currentRow++;

        transactions.forEach((trans) => {
          const typeText =
            {
              in: '入库',
              out: '出库',
              transfer: '转移',
              adjust: '调整',
              reserve: '预留',
              unreserve: '取消预留',
            }[trans.transaction_type] || trans.transaction_type;

          worksheet.addRow([
            typeText,
            `${trans.quantity || 0} ${trans.unit || ''}`,
            trans.before_quantity || 0,
            trans.after_quantity || 0,
            trans.operator || '-',
            trans.formatted_date || '-',
          ]);
          currentRow++;
        });
      } else {
        worksheet.addRow(['暂无流转历史数据']);
        currentRow++;
      }

      // 设置响应头
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent('batch_traceability_' + batchNumber + '_' + Date.now() + '.xlsx')}`
      );

      // 写入响应
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出追溯报告失败:', error);
      ResponseHandler.error(res, '导出追溯报告失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取最新批次列表(用于快速查询)
   */
  async getLatestBatches(req, res) {
    try {
      const { limit = 10 } = req.query;

      const safeLimit = parseInt(limit, 10) || 10;

      // 使用 v_batch_stock 统一获取
      const query = `
        SELECT
          m.code as material_code,
          vbs.batch_number,
          vbs.receipt_date as created_at,
          IF(m.material_type = 'product', 'product', 'material') as type
        FROM v_batch_stock vbs
        LEFT JOIN materials m ON vbs.material_id = m.id
        WHERE vbs.batch_number IS NOT NULL AND vbs.batch_number != ''
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
      `;

      const result = await db.query(query);

      ResponseHandler.success(res, result.rows || [], '获取最新批次成功');
    } catch (error) {
      logger.error('获取最新批次失败:', error);
      ResponseHandler.error(res, '获取最新批次失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = batchTraceabilityController;
