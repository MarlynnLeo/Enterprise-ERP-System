/**
 * InspectionTemplateController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { logger } = require('../../../utils/logger');
const { parsePagination } = require('../../../utils/safePagination');

const db = require('../../../models');
const { Op } = require('sequelize');
const { generateTemplateCode } = require('../../../utils/codeGenerator');
const InspectionTemplateResolver = require('../../../services/business/InspectionTemplateResolverService');

class InspectionTemplateController {
  constructor() {
    [
      'getTemplates',
      'getTemplate',
      'createTemplate',
      'updateTemplate',
      'updateTemplateStatus',
      'copyTemplate',
      'deleteTemplate',
      'getReusableItems',
      'createReusableItem',
    ].forEach((method) => {
      this[method] = this[method].bind(this);
    });
  }

  normalizeBoolean(value) {
    return InspectionTemplateResolver.normalizeBoolean(value);
  }

  parseMaterialId(value) {
    return InspectionTemplateResolver.parseMaterialId(value);
  }

  buildMaterialMatchCondition(materialId, includeGeneral) {
    const matchMaterial = [
      { material_type: materialId },
      db.sequelize.where(
        db.sequelize.fn(
          'JSON_CONTAINS',
          db.sequelize.col('material_types'),
          JSON.stringify(materialId)
        ),
        1
      ),
    ];

    if (includeGeneral) {
      matchMaterial.push({ is_general: true });
    }

    return { [Op.or]: matchMaterial };
  }

  buildMaterialMatchOrder(materialId) {
    const jsonCandidate = InspectionTemplateResolver.buildJsonContainsCandidate(materialId);
    return [
      [
        db.sequelize.literal(
          `CASE WHEN material_type = ${materialId} OR JSON_CONTAINS(material_types, '${jsonCandidate}') THEN 0 WHEN is_general = 1 THEN 1 ELSE 2 END`
        ),
        'ASC',
      ],
      ['is_default', 'DESC'],
      ['priority', 'ASC'],
      ['id', 'DESC'],
    ];
  }

  normalizeMaterialIds(value) {
    return InspectionTemplateResolver.normalizeMaterialIds(value);
  }

  normalizePriority(value) {
    return InspectionTemplateResolver.normalizePriority(value);
  }

  normalizeItemValue(value) {
    return value === undefined || value === null || value === '' ? null : String(value);
  }

  buildInspectionItemPayload(item = {}) {
    const type = item.type || 'other';
    const isDimension = type === 'dimension';

    return {
      item_name: String(item.item_name || '').trim(),
      standard: String(item.standard || '').trim(),
      type,
      is_critical: item.is_critical === true || item.is_critical === 1 || item.is_critical === '1',
      dimension_value: isDimension ? item.dimension_value ?? null : null,
      tolerance_upper: isDimension ? item.tolerance_upper ?? null : null,
      tolerance_lower: isDimension ? item.tolerance_lower ?? null : null,
    };
  }

  isSameInspectionItem(existingItem, payload) {
    return (
      String(existingItem.item_name || '') === payload.item_name &&
      String(existingItem.standard || '') === payload.standard &&
      String(existingItem.type || 'other') === payload.type &&
      (existingItem.is_critical === true || existingItem.is_critical === 1) === payload.is_critical &&
      this.normalizeItemValue(existingItem.dimension_value) === this.normalizeItemValue(payload.dimension_value) &&
      this.normalizeItemValue(existingItem.tolerance_upper) === this.normalizeItemValue(payload.tolerance_upper) &&
      this.normalizeItemValue(existingItem.tolerance_lower) === this.normalizeItemValue(payload.tolerance_lower)
    );
  }

  async resolveTemplateItemId(item, transaction) {
    const payload = this.buildInspectionItemPayload(item);
    const sourceItemId = item.reuseItemId || item.id || null;

    if (sourceItemId) {
      const sourceItem = await db.InspectionItem.findByPk(sourceItemId, { transaction });
      if (sourceItem && this.isSameInspectionItem(sourceItem, payload)) {
        return sourceItem.id;
      }
    }

    const existingItem = await db.InspectionItem.findOne({
      where: payload,
      transaction,
    });
    if (existingItem) {
      return existingItem.id;
    }

    const newItem = await db.InspectionItem.create(payload, { transaction });
    return newItem.id;
  }

  async assertNoOtherActiveGeneralTemplate(inspectionType, templateId, transaction = null) {
    const [rows] = await db.sequelize.query(
      `SELECT id, template_name
       FROM inspection_templates
       WHERE inspection_type = ?
         AND status = 'active'
         AND is_general = 1
         AND id <> ?
       LIMIT 1`,
      { replacements: [inspectionType, templateId || 0], transaction }
    );

    if (rows.length > 0) {
      throw InspectionTemplateResolver.createValidationError(
        `同一检验类型只能启用一个通用兜底模板；请先停用当前通用模板「${rows[0].template_name}」`
      );
    }
  }

  async enforceDefaultGeneralTemplate(inspectionType, templateId, transaction = null) {
    await db.InspectionTemplate.update(
      { is_default: false },
      {
        where: {
          inspection_type: inspectionType,
          is_general: true,
          id: { [Op.ne]: templateId },
        },
        transaction,
      }
    );
  }

  async ensureDefaultGeneralTemplateForType(inspectionType, transaction = null) {
    const [currentDefaults] = await db.sequelize.query(
      `SELECT it.id
       FROM inspection_templates it
       WHERE it.inspection_type = ?
         AND it.status = 'active'
         AND it.is_general = 1
         AND it.is_default = 1
         AND EXISTS (
           SELECT 1
           FROM template_item_mappings tim
           WHERE tim.template_id = it.id
         )
       ORDER BY it.priority ASC, it.id DESC
       LIMIT 1`,
      { replacements: [inspectionType], transaction }
    );

    if (currentDefaults.length > 0) return currentDefaults[0];

    const [candidates] = await db.sequelize.query(
      `SELECT it.id
       FROM inspection_templates it
       WHERE it.inspection_type = ?
         AND it.status = 'active'
         AND it.is_general = 1
         AND EXISTS (
           SELECT 1
           FROM template_item_mappings tim
           WHERE tim.template_id = it.id
         )
       ORDER BY it.priority ASC, it.id DESC
       LIMIT 1`,
      { replacements: [inspectionType], transaction }
    );

    if (candidates.length === 0) return null;

    await this.enforceDefaultGeneralTemplate(inspectionType, candidates[0].id, transaction);
    await db.InspectionTemplate.update(
      { is_default: true },
      { where: { id: candidates[0].id }, transaction }
    );

    return candidates[0];
  }

  async countTemplateReferences(templateId, transaction = null) {
    const referenceQueries = [
      {
        table: 'quality_inspections',
        label: '检验单',
        sql: 'SELECT COUNT(*) AS count FROM quality_inspections WHERE template_id = ? AND deleted_at IS NULL',
      },
      {
        table: 'first_article_rules',
        label: '首检规则',
        sql: 'SELECT COUNT(*) AS count FROM first_article_rules WHERE template_id = ?',
      },
      {
        table: 'process_inspection_rules',
        label: '过程检验规则',
        sql: 'SELECT COUNT(*) AS count FROM process_inspection_rules WHERE template_id = ?',
      },
    ];

    const references = [];
    for (const query of referenceQueries) {
      const [tableRows] = await db.sequelize.query(`SHOW TABLES LIKE '${query.table}'`, { transaction });
      if (tableRows.length === 0) continue;

      const [rows] = await db.sequelize.query(query.sql, {
        replacements: [templateId],
        transaction,
      });
      const count = Number(rows[0]?.count || 0);
      if (count > 0) {
        references.push({ label: query.label, count });
      }
    }

    return references;
  }

  // 获取模板列表
  async getTemplates(req, res) {
    try {
      // HTTP 查询只认 camel；兼容历史 snake query
      const q = req.query || {};
      const page = q.page ?? 1;
      const pageSize = q.pageSize ?? 20;
      const keyword = q.keyword;
      const inspection_type = q.inspectionType ?? q.inspection_type;
      const status = q.status;
      const material_type = q.materialType ?? q.material_type;
      const is_general = q.isGeneral ?? q.is_general;
      const include_general = q.includeGeneral ?? q.include_general;

      const pagination = parsePagination(page, pageSize, { defaultPageSize: 20, maxPageSize: 100 });

      const where = {};
      const andConditions = [];
      if (keyword) {
        andConditions.push({ [Op.or]: [
          { template_code: { [Op.like]: `%${keyword}%` } },
          { template_name: { [Op.like]: `%${keyword}%` } },
        ] });
      }
      if (inspection_type) where.inspection_type = inspection_type;
      if (status) where.status = status;

      const materialId = this.parseMaterialId(material_type);
      if (Number.isNaN(materialId)) {
        return ResponseHandler.error(res, '物料ID格式不正确', 'VALIDATION_ERROR', 400);
      }

      // 物料匹配逻辑：支持查询指定物料的专属模板 + 通用模板
      if (materialId) {
        andConditions.push(
          this.buildMaterialMatchCondition(
            materialId,
            include_general === 'true' || include_general === true
          )
        );
      }

      // ✅ 添加: 支持查询通用模板
      if (is_general !== undefined && is_general !== null && is_general !== '') {
        // 将字符串 'true'/'false' 转换为布尔值
        where.is_general = this.normalizeBoolean(is_general);
      }

      if (andConditions.length > 0) {
        where[Op.and] = andConditions;
      }

      // 准备关联查询条件
      const includeOptions = [
        {
          model: db.InspectionItem,
          through: { attributes: [] },
          as: 'InspectionItems',
        },
      ];

      const { count, rows } = await db.InspectionTemplate.findAndCountAll({
        where,
        include: includeOptions,
        distinct: true,
        limit: pagination.limit,
        offset: pagination.offset,
        order: materialId ? this.buildMaterialMatchOrder(materialId) : [['created_at', 'DESC']],
      });

      // ✅ 优化: 预加载物料信息，避免前端反复请求和闪烁
      const materialIds = new Set();
      const plainRows = rows.map((r) => r.toJSON());

      plainRows.forEach((row) => {
        if (row.material_type) {
          materialIds.add(row.material_type);
        }
        if (row.material_types) {
          try {
            const types =
              typeof row.material_types === 'string'
                ? JSON.parse(row.material_types)
                : row.material_types;
            if (Array.isArray(types)) {
              types.forEach((id) => materialIds.add(id));
            }
          } catch {
            // ignore parse error
          }
        }
      });

      if (materialIds.size > 0) {
        const [materials] = await db.sequelize.query(
          'SELECT id, code, name, specs FROM materials WHERE id IN (?)',
          {
            replacements: [Array.from(materialIds)],
          }
        );

        const materialMap = {};
        materials.forEach((m) => {
          materialMap[m.id] = m;
        });

        // 将物料信息附加到行数据中
        plainRows.forEach((row) => {
          // 处理单个物料
          if (row.material_type && materialMap[row.material_type]) {
            row.material_code = materialMap[row.material_type].code;
            row.material_name = materialMap[row.material_type].name;
            row.material_specs = materialMap[row.material_type].specs;
          }

          // 处理多个物料 - 附加详细列表供前端使用
          const rowMaterialIds = [];
          if (row.material_type) rowMaterialIds.push(row.material_type);

          if (row.material_types) {
            try {
              const types =
                typeof row.material_types === 'string'
                  ? JSON.parse(row.material_types)
                  : row.material_types;
              if (Array.isArray(types)) {
                types.forEach((id) => {
                  if (!rowMaterialIds.includes(id)) rowMaterialIds.push(id);
                });
              }
            } catch (e) { logger.warn('解析 material_types 失败:', e.message); }
          }

          if (rowMaterialIds.length > 0) {
            row.material_details = rowMaterialIds.map((id) => materialMap[id]).filter(Boolean);
          }
        });
      }

      ResponseHandler.paginated(
        res,
        plainRows,
        count,
        pagination.page,
        pagination.pageSize,
        '获取检验模板列表成功'
      );
    } catch (error) {
      logger.error('获取模板列表失败:', error);
      ResponseHandler.error(res, '获取模板列表失败', 'SERVER_ERROR', 500, error);
    }
  }

  // 获取模板详情
  async getTemplate(req, res) {
    try {
      const { id } = req.params;

      // 使用更详细的关联查询以确保能够获取所有检验项
      const template = await db.InspectionTemplate.findByPk(id, {
        include: [
          {
            model: db.InspectionItem,
            through: { attributes: [] }, // 不包含中间表的属性
            as: 'InspectionItems',
          },
        ],
      });

      if (!template) {
        return ResponseHandler.error(res, '模板不存在', 'NOT_FOUND', 404);
      }

      // 将Items属性复制到items属性，以便前端可以统一访问
      const responseData = template.toJSON();
      if (responseData.InspectionItems && !responseData.items) {
        responseData.items = responseData.InspectionItems;
      }

      // ✅ 优化: 预加载物料信息，避免前端编辑时只显示ID
      const materialIds = new Set();
      if (responseData.material_type) {
        materialIds.add(responseData.material_type);
      }
      if (responseData.material_types) {
        try {
          const types =
            typeof responseData.material_types === 'string'
              ? JSON.parse(responseData.material_types)
              : responseData.material_types;
          if (Array.isArray(types)) {
            types.forEach((id) => materialIds.add(id));
          }
        } catch {
          // ignore parse error
        }
      }

      if (materialIds.size > 0) {
        const [materials] = await db.sequelize.query(
          'SELECT id, code, name, specs FROM materials WHERE id IN (?)',
          {
            replacements: [Array.from(materialIds)],
          }
        );

        const materialMap = {};
        materials.forEach((m) => {
          materialMap[m.id] = m;
        });

        // 处理单个物料
        if (responseData.material_type && materialMap[responseData.material_type]) {
          responseData.material_code = materialMap[responseData.material_type].code;
          responseData.material_name = materialMap[responseData.material_type].name;
          responseData.material_specs = materialMap[responseData.material_type].specs;
        }

        // 处理多个物料 - 附加详细列表供前端使用
        const rowMaterialIds = [];
        if (responseData.material_type) rowMaterialIds.push(responseData.material_type);

        if (responseData.material_types) {
          try {
            const types =
              typeof responseData.material_types === 'string'
                ? JSON.parse(responseData.material_types)
                : responseData.material_types;
            if (Array.isArray(types)) {
              types.forEach((id) => {
                if (!rowMaterialIds.includes(id)) rowMaterialIds.push(id);
              });
            }
          } catch (e) { logger.warn('解析 material_types 失败:', e.message); }
        }

        if (rowMaterialIds.length > 0) {
          responseData.material_details = rowMaterialIds
            .map((id) => materialMap[id])
            .filter(Boolean);
        }
      }

      ResponseHandler.success(res, responseData, '获取模板详情成功');
    } catch (error) {
      logger.error('获取模板详情失败:', error);
      ResponseHandler.error(res, '获取模板详情失败', 'SERVER_ERROR', 500, error);
    }
  }

  // 创建模板
  async createTemplate(req, res) {
    const t = await db.sequelize.transaction();

    try {
      const {
        template_name,
        inspection_type,
        version,
        description,
        items,
      } = mapKeysToSnake(req.body || {});

      // 检查用户认证
      if (!req.user) {
        await t.rollback();
        return ResponseHandler.error(res, '用户未认证', 'UNAUTHORIZED', 401);
      }

      const normalizedDefinition = InspectionTemplateResolver.normalizeTemplateDefinition(req.body);
      InspectionTemplateResolver.validateTemplateDefinition(req.body, normalizedDefinition);

      // 生成模板编号 格式：IT+日期+序号
      const template_code = await generateTemplateCode('IT', db);

      // 处理物料类型
      const isGeneralTemplate = normalizedDefinition.isGeneral;
      const isDefaultTemplate = normalizedDefinition.isDefault;

      // 创建模板
      const template = await db.InspectionTemplate.create(
        {
          template_code,
          template_name,
          inspection_type,
          material_type: normalizedDefinition.materialType,
          material_types: normalizedDefinition.materialTypes,
          version,
          description,
          is_general: isGeneralTemplate,
          is_default: isDefaultTemplate,
          priority: normalizedDefinition.priority,
          is_aql: normalizedDefinition.isAql,
          aql_level: normalizedDefinition.aqlLevel,
          status: 'inactive',
          created_by: req.user?.id || 0,
        },
        { transaction: t }
      );

      // 创建/或复用检验项目
      const mappingPromises = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemId = await this.resolveTemplateItemId(item, t);

        // 创建模板-项目关联
        mappingPromises.push(
          db.TemplateItemMapping.create(
            {
              template_id: template.id,
              item_id: itemId,
              sort_order: i,
            },
            { transaction: t }
          )
        );
      }

      await Promise.all(mappingPromises);

      await t.commit();

      ResponseHandler.success(res, template, '模板创建成功');
    } catch (error) {
      await t.rollback();
      logger.error('创建模板失败:', error);
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
      const message = statusCode === 400 ? error.message : `创建模板失败: ${error.message}`;
      ResponseHandler.error(res, message, errorCode, statusCode, error);
    }
  }

  // 更新模板
  async updateTemplate(req, res) {
    const t = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        template_name,
        inspection_type,
        version,
        description,
        items,
      } = mapKeysToSnake(req.body || {});

      const existingTemplate = await db.InspectionTemplate.findByPk(id, { transaction: t });
      if (!existingTemplate) {
        await t.rollback();
        return ResponseHandler.error(res, '模板不存在', 'NOT_FOUND', 404);
      }

      const normalizedDefinition = InspectionTemplateResolver.normalizeTemplateDefinition(req.body);
      InspectionTemplateResolver.validateTemplateDefinition(req.body, normalizedDefinition);

      // 处理物料类型
      const isGeneralTemplate = normalizedDefinition.isGeneral;
      let isDefaultTemplate = normalizedDefinition.isDefault;

      // 更新模板基本信息
      if (existingTemplate.status === 'active' && isGeneralTemplate) {
        await this.assertNoOtherActiveGeneralTemplate(inspection_type, id, t);
        isDefaultTemplate = true;
        await this.enforceDefaultGeneralTemplate(inspection_type, id, t);
      }

      await db.InspectionTemplate.update(
        {
          template_name,
          inspection_type,
          material_type: normalizedDefinition.materialType,
          material_types: normalizedDefinition.materialTypes,
          version,
          description,
          is_general: isGeneralTemplate,
          is_default: isDefaultTemplate,
          priority: normalizedDefinition.priority,
          is_aql: normalizedDefinition.isAql,
          aql_level: normalizedDefinition.aqlLevel,
        },
        {
          where: { id },
          transaction: t,
        }
      );

      // 删除旧的检验项目关联
      await db.TemplateItemMapping.destroy({
        where: { template_id: id },
        transaction: t,
      });

      // 创建/或复用检验项目
      const mappingPromises = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemId = await this.resolveTemplateItemId(item, t);

        // 创建模板-项目关联
        mappingPromises.push(
          db.TemplateItemMapping.create(
            {
              template_id: id,
              item_id: itemId,
              sort_order: i,
            },
            { transaction: t }
          )
        );
      }

      await Promise.all(mappingPromises);

      if (
        existingTemplate.status === 'active' &&
        existingTemplate.is_general &&
        existingTemplate.is_default &&
        (!isGeneralTemplate || !isDefaultTemplate || existingTemplate.inspection_type !== inspection_type)
      ) {
        await this.ensureDefaultGeneralTemplateForType(existingTemplate.inspection_type, t);
      }

      if (existingTemplate.status === 'active') {
        await this.ensureDefaultGeneralTemplateForType(inspection_type, t);
      }

      await t.commit();

      ResponseHandler.success(res, null, '模板更新成功');
    } catch (error) {
      await t.rollback();
      logger.error('更新模板失败:', error);
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
      const message = statusCode === 400 ? error.message : '更新模板失败';
      ResponseHandler.error(res, message, errorCode, statusCode, error);
    }
  }

  // 更新模板状态
  async updateTemplateStatus(req, res) {
    const t = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { status } = req.body;
      const validStatuses = ['active', 'inactive', 'draft'];

      if (!validStatuses.includes(status)) {
        await t.rollback();
        return ResponseHandler.error(res, '模板状态无效', 'VALIDATION_ERROR', 400);
      }

      const template = await db.InspectionTemplate.findByPk(id, { transaction: t });
      if (!template) {
        await t.rollback();
        return ResponseHandler.error(res, '模板不存在', 'NOT_FOUND', 404);
      }

      if (status === 'active') {
        const itemCount = await db.TemplateItemMapping.count({
          where: { template_id: id },
          transaction: t,
        });
        if (itemCount === 0) {
          await t.rollback();
          return ResponseHandler.error(res, '模板没有检验项目，不能启用', 'VALIDATION_ERROR', 400);
        }
        if (template.is_general) {
          await this.assertNoOtherActiveGeneralTemplate(template.inspection_type, template.id, t);
          await this.enforceDefaultGeneralTemplate(template.inspection_type, template.id, t);
        }
      }

      const updatePayload = { status };
      if (template.is_general) {
        updatePayload.is_default = status === 'active';
      }

      await db.InspectionTemplate.update(updatePayload, { where: { id }, transaction: t });

      if (template.is_general) {
        await this.ensureDefaultGeneralTemplateForType(template.inspection_type, t);
      }

      await t.commit();

      ResponseHandler.success(res, null, '模板状态更新成功');
    } catch (error) {
      await t.rollback();
      logger.error('更新模板状态失败:', error);
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
      const message = statusCode === 400 ? error.message : '更新模板状态失败';
      ResponseHandler.error(res, message, errorCode, statusCode, error);
    }
  }

  // 复制模板
  async copyTemplate(req, res) {
    const t = await db.sequelize.transaction();

    try {
      const { id } = req.params;

      // 获取原模板信息
      const originalTemplate = await db.InspectionTemplate.findByPk(id, {
        include: [
          {
            model: db.InspectionItem,
            through: { attributes: [] },
            as: 'InspectionItems',
          },
        ],
      });

      if (!originalTemplate) {
        return ResponseHandler.error(res, '模板不存在', 'NOT_FOUND', 404);
      }

      // 生成新的模板编号
      const template_code = await generateTemplateCode('IT', db);

      // 创建新模板
      const newTemplate = await db.InspectionTemplate.create(
        {
          template_code,
          template_name: `${originalTemplate.template_name} - 副本`,
          inspection_type: originalTemplate.inspection_type,
          material_type: originalTemplate.material_type,
          material_types: originalTemplate.material_types, // 保留多物料关联
          is_general: originalTemplate.is_general || false, // 保留通用模板标记
          is_default: false,
          priority: originalTemplate.priority || 100,
          is_aql: originalTemplate.is_aql || false,
          aql_level: originalTemplate.aql_level || null,
          version: originalTemplate.version,
          description: originalTemplate.description,
          status: 'draft',
          created_by: req.user?.id || 0,
        },
        { transaction: t }
      );

      // 复制检验项目
      const createdItems = await Promise.all(
        originalTemplate.InspectionItems.map((item) =>
          db.InspectionItem.create(
            {
              item_name: item.item_name,
              standard: item.standard,
              type: item.type,
              is_critical: item.is_critical,
              dimension_value: item.dimension_value,
              tolerance_upper: item.tolerance_upper,
              tolerance_lower: item.tolerance_lower,
            },
            { transaction: t }
          )
        )
      );

      // 创建新的模板-项目关联
      await Promise.all(
        createdItems.map((item, index) =>
          db.TemplateItemMapping.create(
            {
              template_id: newTemplate.id,
              item_id: item.id,
              sort_order: index,
            },
            { transaction: t }
          )
        )
      );

      await t.commit();

      ResponseHandler.success(res, newTemplate, '模板复制成功');
    } catch (error) {
      await t.rollback();
      logger.error('复制模板失败:', error);
      ResponseHandler.error(res, '复制模板失败', 'SERVER_ERROR', 500, error);
    }
  }

  // 删除模板
  async deleteTemplate(req, res) {
    const t = await db.sequelize.transaction();

    try {
      const { id } = req.params;

      const template = await db.InspectionTemplate.findByPk(id, { transaction: t });
      if (!template) {
        await t.rollback();
        return ResponseHandler.error(res, '模板不存在', 'NOT_FOUND', 404);
      }

      const references = await this.countTemplateReferences(id, t);
      if (references.length > 0) {
        await t.rollback();
        const details = references.map((ref) => `${ref.label}${ref.count}条`).join('、');
        return ResponseHandler.error(
          res,
          `该模板已被${details}引用，不能删除；请停用旧模板并复制新版本`,
          'VALIDATION_ERROR',
          400
        );
      }

      // 删除模板-项目关联
      await db.TemplateItemMapping.destroy({
        where: { template_id: id },
        transaction: t,
      });

      // 删除模板
      await db.InspectionTemplate.destroy({
        where: { id },
        transaction: t,
      });

      if (template.is_general && template.is_default && template.status === 'active') {
        await this.ensureDefaultGeneralTemplateForType(template.inspection_type, t);
      }

      await t.commit();

      ResponseHandler.success(res, null, '模板删除成功');
    } catch (error) {
      await t.rollback();
      logger.error('删除模板失败:', error);
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
      const message = statusCode === 400 ? error.message : '删除模板失败';
      ResponseHandler.error(res, message, errorCode, statusCode, error);
    }
  }

  // 获取可复用的检验项目列表
  async getReusableItems(req, res) {
    try {
      const { keyword, type } = req.query;

      // 构建查询条件
      const where = {};

      if (keyword) {
        where[Op.or] = [
          { item_name: { [Op.like]: `%${keyword}%` } },
          { standard: { [Op.like]: `%${keyword}%` } },
        ];
      }

      if (type) {
        where.type = type;
      }

      // 查询检验项目
      const items = await db.InspectionItem.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit: 100, // 限制结果数量
      });

      ResponseHandler.success(res, items, '操作成功');
    } catch (error) {
      logger.error('获取可复用检验项目失败:', error);
      ResponseHandler.error(res, '获取可复用检验项目失败', 'SERVER_ERROR', 500, error);
    }
  }

  // 创建可复用的检验标准项目
  async createReusableItem(req, res) {
    try {
      const body = mapKeysToSnake(req.body || {});
      const { item_name, standard, type, is_critical, dimension_value, tolerance_upper, tolerance_lower } = body;

      // 验证必填字段
      if (!item_name || !standard || !type) {
        return ResponseHandler.error(
          res,
          '检验项目名称、检验标准和检验类型不能为空',
          'VALIDATION_ERROR',
          400
        );
      }

      // 检查是否已存在相同的检验项目
      const existingItem = await db.InspectionItem.findOne({
        where: {
          item_name,
          standard,
          type,
        },
      });

      if (existingItem) {
        return ResponseHandler.success(res, existingItem, '该检验标准已存在');
      }

      // 创建新的检验项目
      const newItem = await db.InspectionItem.create({
        item_name,
        standard,
        type,
        is_critical: is_critical || false,
        dimension_value,
        tolerance_upper,
        tolerance_lower,
      });

      ResponseHandler.success(res, newItem, '检验标准创建成功');
    } catch (error) {
      logger.error('创建检验标准失败:', error);
      ResponseHandler.error(res, '创建检验标准失败', 'SERVER_ERROR', 500, error);
    }
  }
}

module.exports = new InspectionTemplateController();
