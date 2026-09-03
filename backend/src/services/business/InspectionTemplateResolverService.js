const VALID_INSPECTION_TYPES = new Set(['incoming', 'process', 'final', 'first_article']);

class InspectionTemplateResolverService {
  static normalizeBoolean(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  static parsePositiveInteger(value) {
    if (value === undefined || value === null || value === '') return null;
    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : NaN;
  }

  static parseMaterialId(value) {
    return this.parsePositiveInteger(value);
  }

  static normalizePriority(value) {
    const priority = Number(value);
    if (!Number.isSafeInteger(priority) || priority < 1) return 100;
    return Math.min(priority, 999);
  }

  static normalizeTemplateCode(value) {
    return String(value ?? '').trim();
  }

  static validateTemplateCode(value, { required = true } = {}) {
    const templateCode = this.normalizeTemplateCode(value);

    if (required && !templateCode) {
      throw this.createValidationError('模板编号不能为空');
    }
    if (templateCode.length > 50) {
      throw this.createValidationError('模板编号不能超过50个字符');
    }

    return templateCode;
  }

  static normalizeMaterialIds(value) {
    let rawValue = value;
    if (typeof rawValue === 'string' && rawValue.trim().startsWith('[')) {
      try {
        rawValue = JSON.parse(rawValue);
      } catch {
        rawValue = [];
      }
    }

    if (!Array.isArray(rawValue)) return [];

    return [...new Set(
      rawValue
        .map((id) => this.parseMaterialId(id))
        .filter((id) => id && !Number.isNaN(id))
    )];
  }

  static getInspectionMaterialId(inspection) {
    const materialId = inspection?.material_id || inspection?.product_id || null;
    const normalized = Number(materialId);
    return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
  }

  static normalizeInspectionType(inspectionType) {
    return VALID_INSPECTION_TYPES.has(inspectionType) ? inspectionType : null;
  }

  static buildJsonContainsCandidate(materialId) {
    const normalized = this.parseMaterialId(materialId);
    return normalized && !Number.isNaN(normalized) ? JSON.stringify(normalized) : null;
  }

  static createValidationError(message, code = 'VALIDATION_ERROR') {
    const error = new Error(message);
    error.code = code;
    error.statusCode = 400;
    return error;
  }

  static normalizeTemplateDefinition(payload = {}) {
    const isGeneral = this.normalizeBoolean(payload.is_general);
    const materialIds = this.normalizeMaterialIds(payload.material_types);
    const singleMaterialId = this.parseMaterialId(payload.material_type);

    if (!isGeneral && singleMaterialId && !Number.isNaN(singleMaterialId)) {
      materialIds.unshift(singleMaterialId);
    }

    const uniqueMaterialIds = [...new Set(materialIds)];
    const isAql = this.normalizeBoolean(payload.is_aql);

    return {
      isGeneral,
      isDefault: isGeneral && this.normalizeBoolean(payload.is_default),
      priority: this.normalizePriority(payload.priority),
      isAql,
      aqlLevel: isAql ? payload.aql_level || null : null,
      materialType: !isGeneral && uniqueMaterialIds.length > 0 ? uniqueMaterialIds[0] : null,
      materialTypes: !isGeneral && uniqueMaterialIds.length > 0 ? uniqueMaterialIds : null,
      invalidMaterialType: Number.isNaN(singleMaterialId),
    };
  }

  static validateTemplateDefinition(payload = {}, normalized = this.normalizeTemplateDefinition(payload)) {
    const errors = [];

    if (!String(payload.template_name || '').trim()) {
      errors.push('模板名称不能为空');
    }
    if (!this.normalizeInspectionType(payload.inspection_type)) {
      errors.push('检验类型无效');
    }
    if (!String(payload.version || '').trim()) {
      errors.push('版本号不能为空');
    }
    if (normalized.invalidMaterialType) {
      errors.push('物料ID格式不正确');
    }
    if (!normalized.isGeneral && (!normalized.materialTypes || normalized.materialTypes.length === 0)) {
      errors.push('非通用模板必须选择至少一个适用物料');
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      errors.push('模板必须至少配置一个检验项目');
    } else {
      payload.items.forEach((item, index) => {
        const itemName = String(item?.item_name || item?.itemName || '').trim();
        if (!itemName) {
          errors.push(`第${index + 1}个检验项目名称不能为空`);
        }
        if (!String(item?.standard || '').trim()) {
          errors.push(`第${index + 1}个检验标准不能为空`);
        }
      });
    }

    if (errors.length > 0) {
      throw this.createValidationError(errors.join('；'));
    }
  }

  static async findMatchingTemplate(connection, inspectionType, materialId, explicitTemplateId = null, options = {}) {
    const normalizedType = this.normalizeInspectionType(inspectionType);
    if (!normalizedType) {
      throw this.createValidationError('检验类型无效');
    }

    const normalizedMaterialId = this.parseMaterialId(materialId);
    if (Number.isNaN(normalizedMaterialId)) {
      throw this.createValidationError('物料ID格式不正确');
    }

    const normalizedTemplateId = this.parsePositiveInteger(explicitTemplateId);
    if (Number.isNaN(normalizedTemplateId)) {
      throw this.createValidationError('检验模板ID格式不正确', 'INVALID_INSPECTION_TEMPLATE');
    }

    const materialCandidate = this.buildJsonContainsCandidate(normalizedMaterialId);

    if (normalizedTemplateId) {
      const [explicitRows] = await connection.query(
        `SELECT it.id, it.template_name, it.is_general, it.is_default, it.priority, it.is_aql, it.aql_level
         FROM inspection_templates it
         WHERE it.id = ?
           AND it.status = 'active'
           AND it.inspection_type = ?
           AND EXISTS (
             SELECT 1
             FROM template_item_mappings tim
             WHERE tim.template_id = it.id
           )
           AND (
             it.is_general = 1
             OR (
               ? IS NOT NULL
               AND (
                 it.material_type = ?
                 OR JSON_CONTAINS(it.material_types, ?)
               )
             )
           )
         LIMIT 1`,
        [
          normalizedTemplateId,
          normalizedType,
          normalizedMaterialId,
          normalizedMaterialId,
          materialCandidate,
        ]
      );

      if (explicitRows.length > 0) return explicitRows[0];

      if (options.strictExplicit !== false) {
        throw this.createValidationError(
          '指定的检验模板不存在、未启用、无检验项目，或不适用于当前物料',
          'INVALID_INSPECTION_TEMPLATE'
        );
      }
    }

    const [matchedTemplates] = await connection.query(
      `SELECT it.id, it.template_name, it.is_general, it.is_default, it.priority, it.is_aql, it.aql_level
       FROM inspection_templates it
       WHERE it.status = 'active'
         AND it.inspection_type = ?
         AND EXISTS (
           SELECT 1
           FROM template_item_mappings tim
           WHERE tim.template_id = it.id
         )
         AND (
           it.is_general = 1
           OR (
             ? IS NOT NULL
             AND (
               it.material_type = ?
               OR JSON_CONTAINS(it.material_types, ?)
             )
           )
         )
       ORDER BY
         CASE
           WHEN ? IS NOT NULL AND (it.material_type = ? OR JSON_CONTAINS(it.material_types, ?)) THEN 0
           WHEN it.is_general = 1 THEN 1
           ELSE 2
         END,
         it.is_default DESC,
         it.priority ASC,
         it.id DESC
       LIMIT 1`,
      [
        normalizedType,
        normalizedMaterialId,
        normalizedMaterialId,
        materialCandidate,
        normalizedMaterialId,
        normalizedMaterialId,
        materialCandidate,
      ]
    );

    return matchedTemplates[0] || null;
  }

  static async getTemplateItems(connection, templateId) {
    const normalizedTemplateId = this.parsePositiveInteger(templateId);
    if (!normalizedTemplateId || Number.isNaN(normalizedTemplateId)) return [];

    const [templateItems] = await connection.query(
      `SELECT ii.item_name, ii.standard, ii.method, ii.type, ii.is_critical,
              ii.dimension_value, ii.tolerance_upper, ii.tolerance_lower
       FROM template_item_mappings tim
       JOIN inspection_items ii ON tim.item_id = ii.id
       WHERE tim.template_id = ?
       ORDER BY tim.sort_order, tim.id`,
      [normalizedTemplateId]
    );

    return templateItems.map((item) => ({
      item_name: item.item_name,
      itemName: item.item_name,
      standard: item.standard,
      method: item.method,
      inspectionMethod: item.method,
      inspection_method: item.method,
      type: item.type,
      is_critical: item.is_critical,
      isCritical: item.is_critical,
      dimension_value: item.dimension_value,
      dimensionValue: item.dimension_value,
      tolerance_upper: item.tolerance_upper,
      toleranceUpper: item.tolerance_upper,
      tolerance_lower: item.tolerance_lower,
      toleranceLower: item.tolerance_lower,
    }));
  }

  /**
   * 按模板-项目关联表保存的顺序重排 Sequelize 关联结果。
   * belongsToMany 查询本身不保证关联项目顺序。
   */
  static orderTemplateItems(items = [], mappingRows = []) {
    if (!Array.isArray(items) || !Array.isArray(mappingRows)) return [];

    const itemById = new Map(items.map((item) => [String(item.id), item]));
    return [...mappingRows]
      .sort((left, right) => {
        const orderDiff = Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0);
        return orderDiff || Number(left.id ?? 0) - Number(right.id ?? 0);
      })
      .map((mapping) => itemById.get(String(mapping.item_id)))
      .filter(Boolean);
  }
}

module.exports = InspectionTemplateResolverService;
