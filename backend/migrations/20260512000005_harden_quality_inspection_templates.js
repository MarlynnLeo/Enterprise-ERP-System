const DEFAULT_USER_ID = 0;

async function ensureTemplateAqlColumns(knex) {
  const hasTemplates = await knex.schema.hasTable('inspection_templates');
  if (!hasTemplates) return false;

  const hasIsAql = await knex.schema.hasColumn('inspection_templates', 'is_aql');
  const hasAqlLevel = await knex.schema.hasColumn('inspection_templates', 'aql_level');

  if (!hasIsAql || !hasAqlLevel) {
    await knex.schema.alterTable('inspection_templates', (table) => {
      if (!hasIsAql) {
        table.boolean('is_aql').notNullable().defaultTo(false).after('status').comment('是否启用AQL抽样');
      }
      if (!hasAqlLevel) {
        table.string('aql_level', 20).nullable().after('is_aql').comment('默认AQL等级');
      }
    });
  }

  return true;
}

async function normalizeOrphanActiveTemplates(knex) {
  await knex('inspection_templates')
    .where({ status: 'active' })
    .where((builder) => {
      builder.whereNull('material_type').orWhere('material_type', 0);
    })
    .where((builder) => {
      builder.whereNull('material_types').orWhereRaw('JSON_LENGTH(material_types) = 0');
    })
    .update({
      is_general: 1,
      updated_at: knex.fn.now(),
    });
}

async function findOrCreateInspectionItem(knex, item) {
  const existing = await knex('inspection_items')
    .where({
      item_name: item.item_name,
      standard: item.standard,
      type: item.type,
    })
    .first('id');

  if (existing) return existing.id;

  const [id] = await knex('inspection_items').insert({
    item_name: item.item_name,
    standard: item.standard,
    type: item.type,
    is_critical: item.is_critical ? 1 : 0,
    dimension_value: item.dimension_value ?? null,
    tolerance_upper: item.tolerance_upper ?? null,
    tolerance_lower: item.tolerance_lower ?? null,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  return id;
}

async function ensureGeneralTemplate(knex, config) {
  const existing = await knex('inspection_templates')
    .where({
      inspection_type: config.inspection_type,
      is_general: 1,
      status: 'active',
    })
    .first('id');

  if (existing) return existing.id;

  const [templateId] = await knex('inspection_templates').insert({
    template_code: config.template_code,
    template_name: config.template_name,
    inspection_type: config.inspection_type,
    material_type: null,
    material_types: null,
    is_general: 1,
    version: '1.0',
    description: config.description,
    status: 'active',
    is_aql: config.is_aql ? 1 : 0,
    aql_level: config.aql_level || null,
    created_by: DEFAULT_USER_ID,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  for (let index = 0; index < config.items.length; index += 1) {
    const itemId = await findOrCreateInspectionItem(knex, config.items[index]);
    await knex('template_item_mappings').insert({
      template_id: templateId,
      item_id: itemId,
      sort_order: index,
      created_at: knex.fn.now(),
    });
  }

  return templateId;
}

exports.up = async function up(knex) {
  const hasTemplates = await ensureTemplateAqlColumns(knex);
  const hasItems = await knex.schema.hasTable('inspection_items');
  const hasMappings = await knex.schema.hasTable('template_item_mappings');
  if (!hasTemplates || !hasItems || !hasMappings) return;

  await normalizeOrphanActiveTemplates(knex);

  await ensureGeneralTemplate(knex, {
    template_code: 'IT-GEN-INCOMING',
    template_name: '来料检验通用模板',
    inspection_type: 'incoming',
    description: '适用于未维护专用模板的来料检验单，产品专用模板优先。',
    is_aql: true,
    aql_level: '1.0',
    items: [
      { item_name: '外观检查', standard: '表面无破损、变形、污染、锈蚀，标识清晰完整。', type: 'visual', is_critical: true },
      { item_name: '规格型号核对', standard: '物料编码、规格型号、批次号与采购/收货信息一致。', type: 'other', is_critical: true },
      { item_name: '尺寸抽检', standard: '关键尺寸符合图纸、样品或采购技术要求。', type: 'dimension', is_critical: false },
      { item_name: '功能确认', standard: '按来料检验规范完成必要功能或装配适配性确认。', type: 'function', is_critical: false },
    ],
  });

  await ensureGeneralTemplate(knex, {
    template_code: 'IT-GEN-FINAL',
    template_name: '成品检验通用模板',
    inspection_type: 'final',
    description: '适用于未维护专用模板的成品检验单，产品专用模板优先。',
    is_aql: true,
    aql_level: '1.0',
    items: [
      { item_name: '外观检查', standard: '产品外观无明显缺陷，铭牌、标签、包装标识完整。', type: 'visual', is_critical: true },
      { item_name: '规格型号核对', standard: '产品型号、批次号、数量与生产任务和客户要求一致。', type: 'other', is_critical: true },
      { item_name: '关键尺寸检查', standard: '关键尺寸符合图纸、BOM和工艺规范要求。', type: 'dimension', is_critical: false },
      { item_name: '功能性能检查', standard: '按成品检验规范完成通电、装配、性能或出厂功能确认。', type: 'performance', is_critical: true },
      { item_name: '安全检查', standard: '安全标识、防护、绝缘或相关安全要求符合出厂标准。', type: 'safety', is_critical: true },
    ],
  });
};

exports.down = async function down() {
  await Promise.resolve();
};
