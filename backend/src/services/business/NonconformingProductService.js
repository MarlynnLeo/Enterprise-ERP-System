const NonconformingProduct = require('../../models/nonconformingProduct');
const { logger } = require('../../utils/logger');
const businessConfig = require('../../config/businessConfig');

// 从统一配置获取状态常量
const STATUS = {
  NCP: businessConfig.status.ncp,
};

/**
 * 不合格品自动处理规则配置
 * 可以根据企业实际情况调整这些规则
 */
const AUTO_DISPOSITION_RULES = {
  // 规则1: 来料检验 + 致命缺陷 -> 自动退货
  incoming_critical: {
    inspection_type: 'incoming',
    severity: 'critical',
    disposition: 'return',
    reason: '来料检验发现致命缺陷,自动判定为退货处理',
  },
  // 规则2: 来料检验 + 严重缺陷 + 不合格率>30% -> 自动退货
  incoming_major_high_rate: {
    inspection_type: 'incoming',
    severity: 'major',
    min_unqualified_rate: 30,
    disposition: 'return',
    reason: '来料检验发现严重缺陷且不合格率超过30%,自动判定为退货处理',
  },
  // 规则3: 过程检验 + 轻微缺陷 -> 自动返工
  process_minor: {
    inspection_type: 'process',
    severity: 'minor',
    disposition: 'rework',
    reason: '过程检验发现轻微缺陷,自动判定为返工处理',
  },
  // 规则4: 成品检验 + 致命缺陷 -> 自动报废
  final_critical: {
    inspection_type: 'final',
    severity: 'critical',
    disposition: 'scrap',
    reason: '成品检验发现致命缺陷,自动判定为报废处理',
  },
};

/**
 * 自动处理决策配置
 * enable: 是否启用自动处理决策
 * auto_complete: 是否自动完成处理(跳过人工确认)
 */
const AUTO_DISPOSITION_CONFIG = {
  enable: false, // 默认关闭,需要手动开启
  auto_complete: false, // 默认不自动完成,需要人工确认
  notify_users: true, // 是否通知相关人员
};

class NonconformingProductService {
  /**
   * Create NCP from inspection
   */
  static async createFromInspection(inspectionId, ncpData) {
    try {
      // Get inspection details with material info
      const db = require('../../config/db');
      const [inspectionRows] = await db.pool.query(
        `
        SELECT qi.*, m.code as material_code_from_table
        FROM quality_inspections qi
        LEFT JOIN materials m ON qi.material_id = m.id
        WHERE qi.id = ?
      `,
        [inspectionId]
      );

      if (!inspectionRows || inspectionRows.length === 0) {
        throw new Error('Inspection not found');
      }

      const inspection = inspectionRows[0];

      // Prepare NCP data - 优先使用materials表的code字段
      const data = {
        inspection_id: inspection.id,
        inspection_no: inspection.inspection_no,
        material_id: inspection.material_id || inspection.product_id,
        material_code: inspection.material_code_from_table || inspection.product_code,
        material_name: inspection.product_name,
        batch_no: inspection.batch_no,
        quantity: ncpData.quantity || inspection.unqualified_quantity,
        unit: inspection.unit,
        defect_type: ncpData.defect_type,
        defect_description: ncpData.defect_description,
        severity: ncpData.severity || 'minor',
        supplier_id: ncpData.supplier_id,
        supplier_name: ncpData.supplier_name,
        current_location: ncpData.current_location || 'Inspection Area',
        isolation_area: ncpData.isolation_area,
        responsible_party: ncpData.responsible_party || 'supplier',
        note: ncpData.note,
        created_by: ncpData.created_by,
      };

      return await NonconformingProduct.create(data);
    } catch (error) {
      logger.error('Failed to create NCP from inspection:', error);
      throw error;
    }
  }

  /**
   * Auto create NCP when inspection completed with unqualified items
   * 增强版:根据检验类型和供应商信息自动判断责任方和严重程度
   */
  static async autoCreateFromInspection(inspection) {
    try {
      if (!inspection.unqualified_quantity || inspection.unqualified_quantity <= 0) {
        return null;
      }

      // 幂等校验：防止同一检验单重复创建 NCP（双路径触发保护）
      if (inspection.id) {
        const db = require('../../config/db');
        const [existing] = await db.pool.query(
          'SELECT id, ncp_no FROM nonconforming_products WHERE inspection_id = ?',
          [inspection.id]
        );
        if (existing.length > 0) {
          logger.info(`⏭️ NCP ${existing[0].ncp_no} 已存在于检验单 ${inspection.inspection_no}，跳过重复创建`);
          return { id: existing[0].id, ncp_no: existing[0].ncp_no, skipped: true };
        }
      }

      // 🔍 智能判断责任方
      let responsibleParty = 'unknown';
      if (inspection.inspection_type === 'incoming') {
        // 来料检验 -> 供应商责任
        responsibleParty = 'supplier';
      } else if (
        inspection.inspection_type === 'process' ||
        inspection.inspection_type === 'final'
      ) {
        // 过程检验/成品检验 -> 内部责任
        responsibleParty = 'internal';
      }

      // 🔍 智能判断严重程度
      let severity = 'minor';
      const unqualifiedRate = (inspection.unqualified_quantity / inspection.quantity) * 100;

      if (unqualifiedRate >= 50) {
        severity = 'critical'; // 不合格率 >= 50% -> 致命
      } else if (unqualifiedRate >= 20) {
        severity = 'major'; // 不合格率 >= 20% -> 严重
      } else {
        severity = 'minor'; // 不合格率 < 20% -> 轻微
      }

      // 🔍 智能设置隔离区域
      let isolationArea = null;
      if (severity === 'critical' || severity === 'major') {
        isolationArea = '隔离区'; // 严重问题需要隔离
      }

      // 🌐 检验类型中文映射
      const inspectionTypeMap = {
        incoming: '来料检验',
        process: '过程检验',
        final: '成品检验',
      };
      const inspectionTypeCN =
        inspectionTypeMap[inspection.inspection_type] || inspection.inspection_type;

      // 获取物料编码
      const db = require('../../config/db');
      let materialCode = inspection.product_code;
      if (inspection.material_id) {
        const [materialRows] = await db.pool.query('SELECT code FROM materials WHERE id = ?', [
          inspection.material_id,
        ]);
        if (materialRows && materialRows.length > 0) {
          materialCode = materialRows[0].code;
        }
      }

      // Extract detailed defect information from inspection items if available
      let defectDetails = [];
      if (inspection.items && Array.isArray(inspection.items)) {
        const failedItems = inspection.items.filter(item => 
          item.result === 'failed' || item.result === 'NG' || item.result === '不合格'
        );
        if (failedItems.length > 0) {
          defectDetails = failedItems.map(item => {
            const itemName = item.item_name || item.name || '未知检验项';
            const actualVal = item.actual_value ? `(实测:${item.actual_value})` : '';
            return `${itemName}${actualVal}`;
          });
        }
      }

      let defectDescription = `由${inspectionTypeCN}自动创建，不合格率: ${unqualifiedRate.toFixed(2)}%`;
      if (defectDetails.length > 0) {
        defectDescription += `\n具体不良项: ${defectDetails.join(', ')}`;
      }

      const data = {
        inspection_id: inspection.id,
        inspection_no: inspection.inspection_no,
        material_id: inspection.material_id || inspection.product_id,
        material_code: materialCode,
        material_name: inspection.product_name,
        batch_no: inspection.batch_no,
        quantity: inspection.unqualified_quantity,
        unit: inspection.unit,
        defect_description: defectDescription,
        severity: severity,
        supplier_id: inspection.supplier_id || null,
        current_location: '检验区',
        isolation_area: isolationArea,
        responsible_party: responsibleParty,
        created_by: 'system',
      };

      const result = await NonconformingProduct.create(data);

      logger.info(
        `✅ Auto-created NCP ${result.ncp_no} for inspection ${inspection.inspection_no}`,
        {
          inspection_type: inspection.inspection_type,
          unqualified_quantity: inspection.unqualified_quantity,
          total_quantity: inspection.quantity,
          unqualified_rate: `${unqualifiedRate.toFixed(2)}%`,
          severity: severity,
          responsible_party: responsibleParty,
          isolation_required: !!isolationArea,
        }
      );

      // 🤖 尝试自动处理决策
      if (AUTO_DISPOSITION_CONFIG.enable) {
        try {
          const autoRule = await this.autoDisposition(result.id, inspection);
          if (autoRule) {
            logger.info(`🤖 Auto disposition rule applied: ${autoRule.name}`);
          }
        } catch (autoError) {
          logger.error('Auto disposition failed:', autoError);
          // 不影响NCP创建
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to auto-create NCP:', error);
      // Don't throw error, just log it
      return null;
    }
  }

  /**
   * 🤖 自动处理决策 (基于规则引擎)
   * 根据检验类型、严重程度、不合格率等自动判断处理方式
   */
  static async autoDisposition(ncpId, inspection) {
    try {
      if (!AUTO_DISPOSITION_CONFIG.enable) {
        logger.info('Auto disposition is disabled');
        return null;
      }

      const ncp = await NonconformingProduct.getById(ncpId);
      if (!ncp) {
        throw new Error('NCP not found');
      }

      // 计算不合格率
      const unqualifiedRate = (inspection.unqualified_quantity / inspection.quantity) * 100;

      // 匹配规则
      let matchedRule = null;
      for (const [ruleName, rule] of Object.entries(AUTO_DISPOSITION_RULES)) {
        let matched = true;

        // 检查检验类型
        if (rule.inspection_type && rule.inspection_type !== inspection.inspection_type) {
          matched = false;
        }

        // 检查严重程度
        if (rule.severity && rule.severity !== ncp.severity) {
          matched = false;
        }

        // 检查不合格率
        if (rule.min_unqualified_rate && unqualifiedRate < rule.min_unqualified_rate) {
          matched = false;
        }

        if (matched) {
          matchedRule = { name: ruleName, ...rule };
          break;
        }
      }

      if (!matchedRule) {
        logger.info(`No auto disposition rule matched for NCP ${ncp.ncp_no}`);
        return null;
      }

      // 应用规则
      const dispositionData = {
        disposition: matchedRule.disposition,
        disposition_reason: matchedRule.reason,
        disposition_by: 'auto-system',
        responsible_party: ncp.responsible_party,
      };

      await NonconformingProduct.updateDisposition(ncpId, dispositionData);

      logger.info(`🤖 Auto disposition applied for NCP ${ncp.ncp_no}`, {
        rule: matchedRule.name,
        disposition: matchedRule.disposition,
        reason: matchedRule.reason,
      });

      // 如果配置了自动完成,则直接完成处理
      if (AUTO_DISPOSITION_CONFIG.auto_complete) {
        await this.completeHandling(ncpId, {
          handled_quantity: ncp.quantity,
          handling_cost: 0,
          note: `Auto-completed by rule: ${matchedRule.name}`,
          updated_by: 'auto-system',
        });
        logger.info(`🤖 Auto completed handling for NCP ${ncp.ncp_no}`);
      }

      return matchedRule;
    } catch (error) {
      logger.error('Failed to auto disposition:', error);
      // Don't throw error, just log it
      return null;
    }
  }

  /**
   * Process disposition
   */
  static async processDisposition(ncpId, dispositionData) {
    try {
      const db = require('../../config/db');
      const ncp = await NonconformingProduct.getById(ncpId);
      if (!ncp) {
        throw new Error('NCP not found');
      }

      if (ncp.status === STATUS.NCP.COMPLETED || ncp.status === STATUS.NCP.CLOSED) {
        throw new Error('NCP already completed or closed');
      }

      await NonconformingProduct.updateDisposition(ncpId, dispositionData);

      logger.info(`Processed disposition for NCP ${ncp.ncp_no}: ${dispositionData.disposition}`);
      return true;
    } catch (error) {
      logger.error('Failed to process disposition:', error);
      throw error;
    }
  }

  /**
   * Complete NCP handling
   * 完成不合格品处理,并根据处理方式自动执行后续流程
   */
  static async completeHandling(ncpId, completionData) {
    const db = require('../../config/db');
    let connection;

    try {
      const ncp = await NonconformingProduct.getById(ncpId);
      if (!ncp) {
        throw new Error('NCP not found');
      }

      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const updateData = {
        handled_quantity: completionData.handled_quantity || ncp.quantity,
        handling_cost: completionData.handling_cost || 0,
        status: 'completed',
        note: completionData.note || ncp.note,
        updated_by: completionData.updated_by,
      };

      await NonconformingProduct.update(ncpId, updateData);

      logger.info(`✅ Completed handling for NCP ${ncp.ncp_no}, disposition: ${ncp.disposition}`);

      // 🚀 根据处理方式自动执行后续流程
      // 将最新的 handling_cost 注入到 ncp 快照中，以便后续处理函数使用
      ncp.handling_cost = updateData.handling_cost;
      try {
        switch (ncp.disposition) {
          case 'use_as_is':
            // 让步接收 - 自动创建入库单(入库到物料默认仓库)
            await this.handleUseAsIs(ncp, updateData.handled_quantity, connection);
            break;

          case 'return':
            // 退货 - 自动创建供应商退货单
            await this.handleReturn(ncp, updateData.handled_quantity, connection);
            break;

          case 'replacement':
            // 换货 - 自动创建退货单和待收货记录
            await this.handleReplacement(ncp, updateData.handled_quantity, connection);
            break;

          case 'scrap':
            // 报废 - 自动创建报废记录
            await this.handleScrap(ncp, updateData.handled_quantity, connection);
            break;

          case 'rework':
            // 返工 - 自动创建返工任务
            await this.handleRework(ncp, updateData.handled_quantity, connection);
            break;

          default:
            logger.info(`No automatic action for disposition: ${ncp.disposition}`);
        }
      } catch (autoError) {
        logger.error(`自动处理流程失败 (${ncp.disposition}):`, autoError);
        // 不影响NCP完成,只记录错误
      }

      await connection.commit();
      return true;
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error('Failed to complete handling:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * 处理让步接收 - 自动创建入库单(入库到物料默认仓库)
   */
  static async handleUseAsIs(ncp, quantity, connection) {
    try {
      logger.info(`🔄 处理让步接收: ${ncp.ncp_no}, 数量: ${quantity}`);

      // 生成入库单号 - 使用配置化的前缀
      const date = new Date();
      const dateStr = date.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const prefix = `${businessConfig.documentPrefix.RECEIPT}${dateStr}`;

      const [maxNoResult] = await connection.query(
        'SELECT MAX(receipt_no) as max_no FROM purchase_receipts WHERE receipt_no LIKE ?',
        [`${prefix}%`]
      );

      let sequence = 1;
      if (maxNoResult[0].max_no) {
        sequence = parseInt(maxNoResult[0].max_no.slice(-3)) + 1;
      }

      const receiptNo = `${prefix}${String(sequence).padStart(3, '0')}`;

      // 查询检验单信息以获取采购订单和供应商信息
      let inspection = { reference_id: null, reference_no: null, supplier_id: ncp.supplier_id || null, supplier_name: ncp.supplier_name || null };
      
      if (ncp.inspection_id) {
        const [inspectionRows] = await connection.query(
          `SELECT qi.*, po.supplier_id, s.name as supplier_name
           FROM quality_inspections qi
           LEFT JOIN purchase_orders po ON qi.reference_id = po.id
           LEFT JOIN suppliers s ON po.supplier_id = s.id
           WHERE qi.id = ?`,
          [ncp.inspection_id]
        );
        if (inspectionRows.length > 0) {
          inspection = inspectionRows[0];
        } else {
          logger.warn(`检验单ID ${ncp.inspection_id} 不存在, 尝试降级处理`);
        }
      } else {
        logger.info(`该不合格品 ${ncp.ncp_no} 无检验单关联, 执行无源让步接收建单`);
      }

      // 溯源原采购订单明细以获取价格、单位和规格
      let orderItemInfo = { price: 0, unit_id: null, specification: '' };
      if (inspection.reference_id && ncp.material_id) {
        const [poiRows] = await connection.query(
          `SELECT price, unit_id, specification 
           FROM purchase_order_items 
           WHERE order_id = ? AND material_id = ? LIMIT 1`,
          [inspection.reference_id, ncp.material_id]
        );
        if (poiRows.length > 0) {
          orderItemInfo = poiRows[0];
          logger.info(`✅ [让步接收溯源] 查找到原采购明细, 单价: ${orderItemInfo.price}, 单位: ${orderItemInfo.unit_id}`);
        } else {
          logger.warn(`⚠️ [让步接收溯源] 未在订单 ${inspection.reference_id} 中找到物料 ${ncp.material_id} 的明细`);
        }
      }

      // 🔄 通过统一服务获取物料的默认仓库
      const InventoryService = require('../InventoryService');
      const warehouseId = await InventoryService.getMaterialLocation(ncp.material_id, connection);

      // 获取仓库名称
      const [warehouseRows] = await connection.query(
        'SELECT name FROM locations WHERE id = ?',
        [warehouseId]
      );
      const warehouseName = warehouseRows.length > 0 ? warehouseRows[0].name : '物料默认仓库';
      logger.info(`✅ 使用物料默认仓库: ${warehouseName} (ID: ${warehouseId})`);

      // 创建采购入库单
      const [receiptResult] = await connection.query(
        `INSERT INTO purchase_receipts (
          receipt_no, order_id, order_no, supplier_id, supplier_name,
          warehouse_id, warehouse_name, receipt_date, operator, remarks, status,
          from_inspection, inspection_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptNo,
          inspection.reference_id,
          inspection.reference_no,
          inspection.supplier_id,
          inspection.supplier_name,
          warehouseId,
          warehouseName,
          new Date().toISOString().slice(0, 10),
          'system',
          `让步接收 - 来自不合格品 ${ncp.ncp_no}`,
          'draft', // 创建为草稿,需要人工审核
          1,
          ncp.inspection_id,
        ]
      );

      const receiptId = receiptResult.insertId;

      // 创建入库单明细
      await connection.query(
        `INSERT INTO purchase_receipt_items (
          receipt_id, material_id, material_code, material_name,
          specification, unit_id, ordered_quantity, quantity, received_quantity,
          qualified_quantity, batch_number, price, remarks, from_inspection
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptId,
          ncp.material_id,
          ncp.material_code,
          ncp.material_name,
          orderItemInfo.specification || '', // specification
          orderItemInfo.unit_id || null, // unit_id
          quantity,
          quantity,
          quantity,
          quantity, // ✅ 修复: 让步接收的物料应该入库,qualified_quantity = quantity
          ncp.batch_no || `PUR-${ncp.ncp_no}`,
          orderItemInfo.price || 0, // ✅ 修复: 使用原采购价入库，解决自动结转时财务金额异常的问题
          `让步接受 - ${ncp.ncp_no}`,
          1,
        ]
      );

      logger.info(
        `✅ 已创建让步接受入库单: ${receiptNo}, 数量: ${quantity}, 仓库: ${warehouseName}`
      );

      // 记录操作日志
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
         VALUES (?, 'auto_receipt', ?, 'system')`,
        [ncp.id, `自动创建让步接受入库单 ${receiptNo} (仓库: ${warehouseName})`]
      );

      return { receiptNo, receiptId };
    } catch (error) {
      logger.error('处理让步接收失败:', error);
      throw error;
    }
  }

  /**
   * 处理退货 - 自动创建采购退货单
   */
  static async handleReturn(ncp, quantity, connection) {
    try {
      logger.info(`🔄 处理退货: ${ncp.ncp_no}, 数量: ${quantity}`);

      // ✅ 如果物料名称为空，从物料表获取
      let materialName = ncp.material_name;
      let materialCode = ncp.material_code;
      if (!materialName && ncp.material_id) {
        const [materialRows] = await connection.query(
          'SELECT code, name FROM materials WHERE id = ?',
          [ncp.material_id]
        );
        if (materialRows.length > 0) {
          materialName = materialRows[0].name;
          materialCode = materialCode || materialRows[0].code;
          logger.info(`✅ 从物料表获取物料信息: ${materialCode} - ${materialName}`);
        }
      }

      // 如果还是没有物料名称，使用默认值
      if (!materialName) {
        materialName = `物料ID:${ncp.material_id}`;
        logger.warn(`⚠️ 无法获取物料名称，使用默认值: ${materialName}`);
      }

      // 生成退货单号 - 使用配置化的前缀
      const date = new Date();
      const dateStr = date.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const prefix = `${businessConfig.documentPrefix.RETURN}${dateStr}`; // 使用配置的退货单前缀

      const [maxNoResult] = await connection.query(
        'SELECT MAX(return_no) as max_no FROM purchase_returns WHERE return_no LIKE ?',
        [`${prefix}%`]
      );

      let sequence = 1;
      if (maxNoResult[0] && maxNoResult[0].max_no) {
        sequence = parseInt(maxNoResult[0].max_no.slice(-3)) + 1;
      }

      const returnNo = `${prefix}${String(sequence).padStart(3, '0')}`;

      // 查询检验单信息以获取供应商和仓库信息
      let inspection = { 
        supplier_id: ncp.supplier_id || null, 
        supplier_name: ncp.supplier_name || '未知供应商',
        reference_id: null,
        order_no: null
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
          inspection.supplier_name = inspection.supplier_name || ncp.supplier_name || '未知供应商';
          // 正确映射原始单据属性
          inspection.reference_id = inspection.purchase_order_id; // purchase_order_id 的兼容映射
          inspection.receipt_id = inspection.receipt_id;
          inspection.receipt_no = inspection.receipt_no;
        } else {
          logger.warn(`检验单ID ${ncp.inspection_id} 不存在, 尝试降级处理退货`);
        }
      } else {
        logger.info(`不合格品 ${ncp.ncp_no} 无检验单关联, 执行无源退货建单`);
        // 🌟 核心修复: 如果不合格品有批号，直接向库存台账查询它的“出生证明（原生身份证）”
        if (ncp.batch_no) {
          try {
            const [originRows] = await connection.query(`
              SELECT 
                receipt_id,
                receipt_no,
                purchase_order_id as order_id,
                purchase_order_no as order_no,
                supplier_name
              FROM v_batch_stock
              WHERE batch_number = ?
              LIMIT 1
            `, [ncp.batch_no]);
            
            if (originRows.length > 0) {
              const origin = originRows[0];
              inspection.supplier_id = origin.supplier_id || ncp.supplier_id;
              inspection.supplier_name = origin.supplier_name || ncp.supplier_name || '未知供应商';
              inspection.reference_id = origin.order_id; // purchase_order_id
              inspection.order_no = origin.order_no;
              inspection.receipt_id = origin.receipt_id;
              inspection.receipt_no = origin.receipt_no;
              
              logger.info(`✅ [血缘追溯建单] 根据批次 ${ncp.batch_no} 成功反查到原始入库单: ${origin.receipt_no}, 采购单: ${origin.order_no}`);
            } else {
              logger.warn(`⚠️ 无法根据批次 ${ncp.batch_no} 的库存流水找到最初的采购入库单`);
            }
          } catch(traceErr) {
            logger.error(`批次血缘反查采购来源报错:`, traceErr);
          }
        }
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
          logger.info(`✅ [退货库位] 从检验单关联的不良品入库单获取到实际库位: ${inboundLocationRows[0].location_name} (ID: ${returnWarehouseId})`);
        }
      }

      // 方式2: 通过库存台账查询该物料实际有库存的非默认库位（兜底）
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
          logger.info(`✅ [退货库位] 从库存台账反查到不良品存放位置: ${ledgerLocationRows[0].location_name} (ID: ${returnWarehouseId})`);
        }
      }

      // 方式3: 最终兜底 - 使用物料的默认仓库（仅适用于没有走隔离区的普通退货）
      if (!returnWarehouseId) {
        const InventoryService = require('../InventoryService');
        returnWarehouseId = await InventoryService.getMaterialLocation(ncp.material_id, connection);
        logger.info(`ℹ️ [退货库位] 未找到不良品专属库位，兜底使用物料默认仓库 (ID: ${returnWarehouseId})`);
      }

      const [warehouseRows] = await connection.query(
        'SELECT id, name FROM locations WHERE id = ?',
        [returnWarehouseId]
      );

      if (warehouseRows.length === 0) {
        throw new Error('退货出库的仓库不存在，请检查仓库设置');
      }

      const warehouse = warehouseRows[0];

      // ✅ 获取操作人信息(优先使用不合格品的创建人)
      let operator = 'system';
      if (ncp.created_by) {
        // 查询创建人的真实姓名
        const [userRows] = await connection.query(
          'SELECT real_name, username FROM users WHERE username = ? OR real_name = ? LIMIT 1',
          [ncp.created_by, ncp.created_by]
        );
        if (userRows.length > 0) {
          operator = userRows[0].real_name || userRows[0].username || ncp.created_by;
        } else {
          operator = ncp.created_by;
        }
      }

      logger.info(`✅ 自动创建退货单 - 操作人: ${operator} (来源: ${ncp.created_by || 'system'})`);

      // 创建采购退货单(写入purchase_returns表)
      const [returnResult] = await connection.query(
        `INSERT INTO purchase_returns (
          return_no, receipt_id, receipt_no, source_type, supplier_id, supplier_name,
          warehouse_id, warehouse_name, return_date, reason, total_amount,
          operator, remarks, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          quantity > 0 ? ((parseFloat(ncp.handling_cost) || 0) / quantity) : 0, // price - 单价 = 总成本 / 数量
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
         VALUES (?, 'auto_return', ?, 'system')`,
        [ncp.id, `自动创建采购退货单 ${returnNo}`]
      );

      // 发送通知给采购部门
      try {
        await connection.query(
          `INSERT INTO notifications (title, content, type, priority, created_at)
           VALUES (?, ?, 'purchase_return', 1, NOW())`,
          [
            '采购退货通知',
            `退货单 ${returnNo} 已自动创建。供应商: ${inspection.supplier_name}，物料: ${materialName}，退货数量: ${quantity}，原因: ${ncp.disposition_reason || '质量不合格'}。请及时跟进处理。`,
          ]
        );
        logger.info(`📧 退货通知已发送给采购部门，退货单: ${returnNo}`);
      } catch (notifyError) {
        // 通知失败不影响主流程
        logger.error('发送退货通知失败:', notifyError);
      }

      return { returnNo, returnId };
    } catch (error) {
      logger.error('处理退货失败:', error);
      throw error;
    }
  }

  /**
   * 处理报废 - 自动创建报废记录
   */
  static async handleScrap(ncp, quantity, connection) {
    try {
      logger.info(`🔄 处理报废: ${ncp.ncp_no}, 数量: ${quantity}`);

      // 生成报废单号 - 使用配置化的前缀
      const date = new Date();
      const dateStr = date.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const prefix = `${businessConfig.documentPrefix.SCRAP}${dateStr}`;

      const [maxNoResult] = await connection.query(
        'SELECT MAX(scrap_no) as max_no FROM scrap_records WHERE scrap_no LIKE ?',
        [`${prefix}%`]
      );

      let sequence = 1;
      if (maxNoResult[0] && maxNoResult[0].max_no) {
        sequence = parseInt(maxNoResult[0].max_no.slice(-3)) + 1;
      }

      const scrapNo = `${prefix}${String(sequence).padStart(3, '0')}`;

      // 注：scrap_records 表应在数据库迁移脚本中创建，不在事务中动态建表

      // 创建报废记录
      await connection.query(
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
          'system',
        ]
      );

      logger.info(`✅ 已创建报废记录: ${scrapNo}, 数量: ${quantity}`);

      // 记录操作日志
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
         VALUES (?, 'auto_scrap', ?, 'system')`,
        [ncp.id, `自动创建报废记录 ${scrapNo}`]
      );

      return { scrapNo };
    } catch (error) {
      logger.error('处理报废失败:', error);
      throw error;
    }
  }

  /**
   * 处理返工 - 自动创建返工任务
   */
  static async handleRework(ncp, quantity, connection) {
    try {
      logger.info(`🔄 处理返工: ${ncp.ncp_no}, 数量: ${quantity}`);

      // 生成返工单号 - 使用配置化的前缀
      const date = new Date();
      const dateStr = date.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const prefix = `${businessConfig.documentPrefix.REWORK}${dateStr}`;

      const [maxNoResult] = await connection.query(
        'SELECT MAX(rework_no) as max_no FROM rework_tasks WHERE rework_no LIKE ?',
        [`${prefix}%`]
      );

      let sequence = 1;
      if (maxNoResult[0] && maxNoResult[0].max_no) {
        sequence = parseInt(maxNoResult[0].max_no.slice(-3)) + 1;
      }

      const reworkNo = `${prefix}${String(sequence).padStart(3, '0')}`;

      // 注：rework_tasks 表应在数据库迁移脚本中创建，不在事务中动态建表

      // 创建返工任务
      await connection.query(
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
          'system',
        ]
      );

      logger.info(`✅ 已创建返工任务: ${reworkNo}, 数量: ${quantity}`);

      // 记录操作日志
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
         VALUES (?, 'auto_rework', ?, 'system')`,
        [ncp.id, `自动创建返工任务 ${reworkNo}`]
      );

      return { reworkNo };
    } catch (error) {
      logger.error('处理返工失败:', error);
      throw error;
    }
  }

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
  static async handleReplacement(ncp, quantity, connection) {
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

      if (orderItems.length === 0) {
        logger.warn(`未找到采购订单项(无检验单或订单不存在), 使用NCP自身的供应商数据生成换货单`);
      }

      // 健壮性处理: 当无检验单/原始订单时, 使用NCP自带的供应商数据
      const orderItem = orderItems[0] || {
        order_no: null,
        supplier_id: ncp.supplier_id || null,
        supplier_name: ncp.supplier_name || '未知供应商'
      };

      // 注：replacement_orders 表应在数据库迁移脚本中创建，不在事务中动态建表

      // 4. 生成换货单号 - 使用配置化的前缀
      const date = new Date();
      const dateStr = date.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const prefix = `${businessConfig.documentPrefix.REPLACEMENT}${dateStr}`;

      const [maxNoResult] = await connection.query(
        'SELECT MAX(replacement_no) as max_no FROM replacement_orders WHERE replacement_no LIKE ?',
        [`${prefix}%`]
      );

      let sequence = 1;
      if (maxNoResult[0] && maxNoResult[0].max_no) {
        sequence = parseInt(maxNoResult[0].max_no.slice(-3)) + 1;
      }

      const replacementNo = `${prefix}${String(sequence).padStart(3, '0')}`;

      // 5. 创建换货记录
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 7); // 预计7天后到货

      await connection.query(
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
          'system',
        ]
      );

      logger.info(
        `✅ 已创建换货单: ${replacementNo}, 退货单: ${returnResult.returnNo}, 数量: ${quantity}`
      );

      // 6. 记录操作日志
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
         VALUES (?, 'auto_replacement', ?, 'system')`,
        [ncp.id, `自动创建换货单 ${replacementNo},退货单 ${returnResult.returnNo}`]
      );

      return {
        replacementNo,
        returnNo: returnResult.returnNo,
        expectedDate: expectedDate.toISOString().slice(0, 10),
      };
    } catch (error) {
      logger.error('处理换货失败:', error);
      throw error;
    }
  }

  /**
   * Get NCP list with filters
   */
  static async getList(params) {
    try {
      return await NonconformingProduct.getList(params);
    } catch (error) {
      logger.error('Failed to get NCP list:', error);
      throw error;
    }
  }

  /**
   * 获取自动处理配置
   */
  static getAutoDispositionConfig() {
    return {
      ...AUTO_DISPOSITION_CONFIG,
      rules: Object.keys(AUTO_DISPOSITION_RULES).map((key) => ({
        name: key,
        ...AUTO_DISPOSITION_RULES[key],
      })),
    };
  }

  /**
   * 更新自动处理配置
   */
  static updateAutoDispositionConfig(config) {
    if (config.enable !== undefined) {
      AUTO_DISPOSITION_CONFIG.enable = config.enable;
    }
    if (config.auto_complete !== undefined) {
      AUTO_DISPOSITION_CONFIG.auto_complete = config.auto_complete;
    }
    if (config.notify_users !== undefined) {
      AUTO_DISPOSITION_CONFIG.notify_users = config.notify_users;
    }

    logger.info('🔧 Auto disposition config updated:', AUTO_DISPOSITION_CONFIG);
    return AUTO_DISPOSITION_CONFIG;
  }

  /**
   * Get NCP details
   */
  static async getDetails(ncpId) {
    try {
      const ncp = await NonconformingProduct.getById(ncpId);
      if (!ncp) {
        throw new Error('NCP not found');
      }

      const actions = await NonconformingProduct.getActions(ncpId);

      return {
        ...ncp,
        actions,
      };
    } catch (error) {
      logger.error('Failed to get NCP details:', error);
      throw error;
    }
  }
  /**
   * 申请特采 (让步接收)
   */
  static async applyConcession(ncpId, { reason, applicant }) {
    try {
      const ncp = await NonconformingProduct.getById(ncpId);
      if (!ncp) throw new Error('NCP not found');

      if (ncp.status === STATUS.NCP.COMPLETED || ncp.status === STATUS.NCP.CLOSED) {
        throw new Error('该单据已完结，无法申请特采');
      }

      const db = require('../../config/db');
      await db.pool.query(
        `UPDATE nonconforming_products 
         SET concession_status = 'pending', 
             concession_reason = ?,
             disposition = 'use_as_is'
         WHERE id = ?`,
        [reason, ncpId]
      );

      // 记录操作日志
      await db.pool.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
         VALUES (?, 'evaluate', ?, ?)`,
        [ncpId, `申请特采，理由: ${reason}`, applicant]
      );

      logger.info(`Concession applied for NCP ${ncp.ncp_no} by ${applicant}`);
      return true;
    } catch (error) {
      logger.error('Failed to apply concession:', error);
      throw error;
    }
  }

  /**
   * 审批特采
   */
  static async approveConcession(ncpId, { status, approverId, approverName }) {
    const db = require('../../config/db');
    let connection;
    try {
      const ncp = await NonconformingProduct.getById(ncpId);
      if (!ncp) throw new Error('NCP not found');
      if (ncp.concession_status !== 'pending') throw new Error('该单据非特采待审状态');

      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const approvalDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

      await connection.query(
        `UPDATE nonconforming_products 
         SET concession_status = ?, 
             concession_approver_id = ?, 
             concession_approval_date = ?
         WHERE id = ?`,
        [status, approverId, approvalDate, ncpId]
      );

      let actionDesc = `驳回特采申请`;
      if (status === 'approved') {
        actionDesc = `批准特采申请`;

        // 关键业务逻辑：特采批准后，自动触发“让步接收(use_as_is)”的入库流转逻辑
        ncp.disposition = 'use_as_is';
        await this.handleUseAsIs(ncp, ncp.quantity, connection);

        // 并将该不合格品标记为已完成
        await connection.query(
          `UPDATE nonconforming_products 
           SET status = 'completed', handled_quantity = quantity, 
               disposition = 'use_as_is', updated_by = ? 
           WHERE id = ?`,
          [approverName, ncpId]
        );
      }

      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
         VALUES (?, 'evaluate', ?, ?)`,
        [ncpId, actionDesc, approverName]
      );

      await connection.commit();
      logger.info(`Concession ${status} for NCP ${ncp.ncp_no} by ${approverName}`);
      return true;
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error('Failed to approve concession:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }
}

module.exports = NonconformingProductService;
