/**
 * Ensures the quality inspections required when a production task starts.
 * The service is intentionally transaction-aware so task and process entry
 * points create the same records and remain idempotent.
 */

const QualityInspection = require('../../models/qualityInspection');
const InspectionTemplateResolver = require('./InspectionTemplateResolverService');
const { generateBatchNo } = require('./TaskLifecycleService');
const { logger } = require('../../utils/logger');

const FALLBACK_ITEMS = Object.freeze({
  first_article: Object.freeze([
    {
      item_name: '外观检查',
      standard: '产品外观无破损、变形、污染，标识清晰完整。',
      type: 'visual',
      is_critical: true,
    },
    {
      item_name: '规格型号核对',
      standard: '产品型号、规格、批次与生产任务一致。',
      type: 'other',
      is_critical: true,
    },
    {
      item_name: '首件尺寸检查',
      standard: '首件关键尺寸符合图纸、样品或工艺规范要求。',
      type: 'dimension',
      is_critical: false,
    },
    {
      item_name: '功能/装配确认',
      standard: '首件功能、装配适配性及工艺要求确认合格。',
      type: 'function',
      is_critical: false,
    },
  ]),
  process: Object.freeze([
    {
      item_name: '过程外观检查',
      standard: '生产过程中的产品外观、状态和标识符合工艺要求。',
      type: 'visual',
      is_critical: true,
    },
    {
      item_name: '过程尺寸检查',
      standard: '过程抽检的关键尺寸符合图纸和工艺规范要求。',
      type: 'dimension',
      is_critical: false,
    },
    {
      item_name: '过程功能确认',
      standard: '过程功能、装配及关键工艺参数符合要求。',
      type: 'function',
      is_critical: false,
    },
  ]),
  final: Object.freeze([
    {
      item_name: '成品外观检查',
      standard: '产品外观无明显缺陷，标识和包装完整。',
      type: 'visual',
      is_critical: true,
    },
    {
      item_name: '成品规格核对',
      standard: '产品型号、批次、数量与生产任务一致。',
      type: 'other',
      is_critical: true,
    },
    {
      item_name: '成品功能确认',
      standard: '产品功能和性能符合出厂要求。',
      type: 'performance',
      is_critical: true,
    },
  ]),
});

const cloneItems = (items) => items.map((item) => ({ ...item }));

async function resolveTemplateData(connection, inspectionType, productId, explicitTemplateId) {
  try {
    const template = await InspectionTemplateResolver.findMatchingTemplate(
      connection,
      inspectionType,
      productId,
      explicitTemplateId,
      { strictExplicit: false }
    );

    if (template) {
      const items = await InspectionTemplateResolver.getTemplateItems(connection, template.id);
      if (items.length > 0) return { templateId: template.id, items };
    }
  } catch (error) {
    // A missing or stale template must not prevent the task from entering production.
    logger.warn(`[生产质检] ${inspectionType} 模板解析失败，使用内置检验项目: ${error.message}`);
  }

  return {
    templateId: null,
    items: cloneItems(FALLBACK_ITEMS[inspectionType] || []),
  };
}

async function getTask(connection, taskId) {
  const [rows] = await connection.query(
    `SELECT pt.id, pt.code, pt.product_id, pt.quantity, pt.created_by,
            m.code AS product_code, m.name AS product_name,
            m.unit_id, u.name AS unit_name
     FROM production_tasks pt
     LEFT JOIN materials m ON m.id = pt.product_id
     LEFT JOIN units u ON u.id = m.unit_id
     WHERE pt.id = ? AND pt.deleted_at IS NULL
     FOR UPDATE`,
    [taskId]
  );

  if (rows.length === 0) throw new Error(`生产任务不存在: ${taskId}`);
  return rows[0];
}

async function findExisting(connection, taskId, inspectionType) {
  const [rows] = await connection.query(
    `SELECT id, inspection_no
     FROM quality_inspections
     WHERE inspection_type = ?
       AND (task_id = ? OR (reference_id = ? AND task_id IS NULL))
       AND deleted_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [inspectionType, taskId, taskId]
  );
  return rows[0] || null;
}

async function ensureTaskQualityInspections(connection, taskId) {
  if (!connection) throw new Error('ensureTaskQualityInspections 必须在事务中调用');

  const task = await getTask(connection, taskId);
  const quantity = Number(task.quantity) || 0;
  const batchNo = await generateBatchNo(task.code, connection);
  const result = { firstArticle: null, process: null };

  const existingFirstArticle = await findExisting(connection, taskId, 'first_article');
  if (existingFirstArticle) {
    result.firstArticle = { created: false, inspectionId: existingFirstArticle.id };
  } else {
    const [rules] = await connection.query(
      `SELECT first_article_qty, full_inspection_threshold, template_id
       FROM first_article_rules
       WHERE product_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [task.product_id]
    );
    const rule = rules[0] || {
      first_article_qty: 5,
      full_inspection_threshold: 5,
      template_id: null,
    };
    const fullInspection = quantity < Number(rule.full_inspection_threshold || 5);
    const firstArticleQty = fullInspection
      ? quantity
      : Math.min(
          quantity || Number(rule.first_article_qty) || 5,
          Number(rule.first_article_qty) || 5
        );
    const templateData = await resolveTemplateData(
      connection,
      'first_article',
      task.product_id,
      rule.template_id
    );

    const created = await QualityInspection.createInspection(
      {
        inspection_type: 'first_article',
        task_id: taskId,
        reference_id: taskId,
        reference_no: task.code,
        product_id: task.product_id,
        product_code: task.product_code || '',
        product_name: task.product_name || '',
        batch_no: batchNo,
        quantity: firstArticleQty,
        unit: task.unit_name || '个',
        unit_id: task.unit_id || null,
        planned_date: new Date(),
        status: 'pending',
        is_first_article: true,
        first_article_qty: firstArticleQty,
        is_full_inspection: fullInspection,
        first_article_result: 'pending',
        production_can_continue: false,
        template_id: templateData.templateId,
        items: templateData.items,
        note: fullInspection
          ? '生产任务开始时自动创建（全数首检）'
          : '生产任务开始时自动创建（抽样首检）',
      },
      connection
    );
    result.firstArticle = { created: true, inspectionId: created.id };
  }

  const existingProcess = await findExisting(connection, taskId, 'process');
  if (existingProcess) {
    result.process = { created: false, inspectionId: existingProcess.id };
  } else {
    const [rules] = await connection.query(
      `SELECT process_id, sample_rate, template_id
       FROM process_inspection_rules
       WHERE is_enabled = 1 AND (product_id = ? OR product_id IS NULL)
       ORDER BY product_id DESC, id DESC
       LIMIT 1`,
      [task.product_id]
    );
    const rule = rules[0] || { process_id: null, sample_rate: 100, template_id: null };
    if (rules.length === 0) {
      logger.warn(`[生产质检] 任务 ${taskId} 未配置过程检验规则，使用默认全检比例创建过程检验单`);
    }
    const [processRows] = await connection.query(
      `SELECT id, process_name
       FROM production_processes
       WHERE task_id = ?
       ORDER BY sequence ASC, id ASC
       LIMIT 1`,
      [taskId]
    );
    const process = processRows[0] || {};
    const sampleRate = Number(rule.sample_rate) || 100;
    const sampleQty = Math.max(1, Math.ceil(quantity * (sampleRate / 100)));
    const templateData = await resolveTemplateData(
      connection,
      'process',
      task.product_id,
      rule.template_id
    );

    const created = await QualityInspection.createInspection(
      {
        inspection_type: 'process',
        task_id: taskId,
        reference_id: taskId,
        reference_no: task.code,
        product_id: task.product_id,
        product_code: task.product_code || '',
        product_name: task.product_name || '',
        process_id: process.id || rule.process_id || null,
        process_name: process.process_name || '生产过程',
        batch_no: batchNo,
        quantity: sampleQty,
        unit: task.unit_name || '个',
        unit_id: task.unit_id || null,
        planned_date: new Date(),
        status: 'pending',
        template_id: templateData.templateId,
        items: templateData.items,
        note: `生产任务开始时自动创建（抽样比例 ${sampleRate}%）`,
      },
      connection
    );
    result.process = { created: true, inspectionId: created.id };
  }

  return result;
}

module.exports = {
  FALLBACK_ITEMS,
  resolveTemplateData,
  ensureTaskQualityInspections,
};
