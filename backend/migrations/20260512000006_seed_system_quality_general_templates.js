const DEFAULT_USER_ID = 0;

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

async function ensureSystemTemplate(knex, config) {
  const existing = await knex('inspection_templates')
    .where({ template_code: config.template_code })
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
    is_aql: 1,
    aql_level: '1.0',
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
  const hasTemplates = await knex.schema.hasTable('inspection_templates');
  const hasItems = await knex.schema.hasTable('inspection_items');
  const hasMappings = await knex.schema.hasTable('template_item_mappings');
  if (!hasTemplates || !hasItems || !hasMappings) return;

  await ensureSystemTemplate(knex, {
    template_code: 'IT-SYS-INCOMING',
    template_name: '系统来料检验通用模板',
    inspection_type: 'incoming',
    description: '系统兜底模板。物料有专用模板时优先使用专用模板。',
    items: [
      { item_name: '外观检查', standard: '表面无破损、变形、污染、锈蚀，标识清晰完整。', type: 'visual', is_critical: true },
      { item_name: '规格型号核对', standard: '物料编码、名称、规格型号、批次号与采购/收货信息一致。', type: 'other', is_critical: true },
      { item_name: '数量与包装检查', standard: '数量、包装方式、最小包装标识与来料单据一致。', type: 'other', is_critical: false },
      { item_name: '关键尺寸抽检', standard: '关键尺寸符合图纸、样品、采购技术协议或检验规范要求。', type: 'dimension', is_critical: false },
      { item_name: '功能/适配性确认', standard: '按来料检验规范完成必要功能、装配适配性或试用确认。', type: 'function', is_critical: false },
    ],
  });

  await ensureSystemTemplate(knex, {
    template_code: 'IT-SYS-FINAL',
    template_name: '系统成品检验通用模板',
    inspection_type: 'final',
    description: '系统兜底模板。产品有专用模板时优先使用专用模板。',
    items: [
      { item_name: '外观检查', standard: '产品外观无划伤、变形、污渍、缺件，铭牌、标签、包装标识完整。', type: 'visual', is_critical: true },
      { item_name: '规格型号核对', standard: '产品型号、批次号、数量、配置与生产任务和客户要求一致。', type: 'other', is_critical: true },
      { item_name: '关键尺寸检查', standard: '关键尺寸符合图纸、BOM、工艺规范和客户技术要求。', type: 'dimension', is_critical: false },
      { item_name: '功能性能检查', standard: '按成品检验规范完成通电、装配、性能、参数或出厂功能确认。', type: 'performance', is_critical: true },
      { item_name: '安全检查', standard: '安全标识、防护、绝缘、接地或相关安全要求符合出厂标准。', type: 'safety', is_critical: true },
      { item_name: '包装与随附资料', standard: '包装、防护、合格证、说明书、附件等出货资料完整。', type: 'other', is_critical: false },
    ],
  });
};

exports.down = async function down() {
  await Promise.resolve();
};
