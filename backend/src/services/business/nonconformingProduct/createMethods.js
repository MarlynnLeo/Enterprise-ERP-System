/**
 * NonconformingProductService — create methods (mixin)
 * @module nonconformingProduct/createMethods
 */

const runtime = require('./runtime');
const {
  NonconformingProduct,
  logger,
  firstValidUserId,
  AUTO_DISPOSITION_RULES,
  AUTO_DISPOSITION_CONFIG,
} = runtime;


module.exports = {
  /**
     * Create NCP from inspection
     */
    async createFromInspection(inspectionId, ncpData) {
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
    },

  /**
     * Auto create NCP when inspection completed with unqualified items
     * 增强版:根据检验类型和供应商信息自动判断责任方和严重程度
     */
    async autoCreateFromInspection(inspection, externalConnection = null) {
      try {
        if (!inspection.unqualified_quantity || inspection.unqualified_quantity <= 0) {
          return null;
        }
  
        const db = require('../../config/db');
        const client = externalConnection || db.pool;
  
        // 幂等校验：防止同一检验单重复创建 NCP（双路径触发保护）
        if (inspection.id) {
          const [existing] = await client.query(
            'SELECT id, ncp_no FROM nonconforming_products WHERE inspection_id = ? AND deleted_at IS NULL',
            [inspection.id]
          );
          if (existing.length > 0) {
            logger.info(
              `NCP already exists for inspection; duplicate creation skipped: ncpNo=${existing[0].ncp_no}, inspectionNo=${inspection.inspection_no}`
            );
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
          inspection.inspection_type === 'final' ||
          inspection.inspection_type === 'first_article'
        ) {
          // 过程检验/首件检验/成品检验 -> 内部责任
          responsibleParty = 'internal';
        }
  
        // 🔍 智能判断严重程度
        let severity = 'minor';
        const unqualifiedRate =
          Number(inspection.quantity) > 0
            ? (Number(inspection.unqualified_quantity || 0) / Number(inspection.quantity)) * 100
            : 0;
  
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
          first_article: '首件检验',
          final: '成品检验',
        };
        const inspectionTypeCN =
          inspectionTypeMap[inspection.inspection_type] || inspection.inspection_type;
  
        // 获取物料编码
        let materialCode = inspection.product_code;
        if (inspection.material_id) {
          const [materialRows] = await client.query('SELECT code FROM materials WHERE id = ? AND deleted_at IS NULL', [
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
  
        const createdBy = firstValidUserId(inspection.inspector_id);
        if (!createdBy) {
          throw new Error(`检验单 ${inspection.inspection_no || inspection.id} 缺少检验员用户ID，不能自动创建不合格品单`);
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
          created_by: createdBy,
        };
  
        const result = await NonconformingProduct.create(data, externalConnection);
  
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
        if (AUTO_DISPOSITION_CONFIG.enable && !externalConnection) {
          try {
            const autoRule = await this.autoDisposition(result.id, inspection);
            if (autoRule) {
              logger.info(`🤖 Auto disposition rule applied: ${autoRule.name}`);
            }
          } catch (autoError) {
            logger.error('Auto disposition failed:', autoError);
            const DLQService = require('./DLQService');
            await DLQService.recordSideEffectFailure(
              'NonconformingProduct:autoDisposition',
              { ncpId: result.id, inspectionId: inspection.id },
              autoError
            );
          }
        }
  
        return result;
      } catch (error) {
        logger.error('Failed to auto-create NCP:', error);
        throw error;
      }
    },

  /**
     * 🤖 自动处理决策 (基于规则引擎)
     * 根据检验类型、严重程度、不合格率等自动判断处理方式
     */
    async autoDisposition(ncpId, inspection) {
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
        const unqualifiedRate =
          Number(inspection.quantity) > 0
            ? (Number(inspection.unqualified_quantity || 0) / Number(inspection.quantity)) * 100
            : 0;
  
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
        throw error;
      }
    },
};
