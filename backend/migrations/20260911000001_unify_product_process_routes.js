'use strict';

// Keep legacy tables as an archive; all new writes use templates and task processes.
exports.config = { transaction: false };

async function addColumn(knex, table, column, definition) {
  if (!(await knex.schema.hasColumn(table, column))) {
    await knex.schema.alterTable(table, definition);
  }
}

async function addIndex(knex, table, name, sql) {
  const [rows] = await knex.raw('SHOW INDEX FROM ?? WHERE Key_name = ?', [table, name]);
  if (!rows.length) await knex.raw(sql);
}

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return JSON.parse(value);
};

exports.up = async function up(knex) {
  await addColumn(knex, 'process_templates', 'version', t => t.string('version', 50).nullable());
  await addColumn(knex, 'process_templates', 'published_at', t => t.dateTime('published_at').nullable());
  await addColumn(knex, 'process_templates', 'source_template_id', t => t.integer('source_template_id').nullable());
  await addColumn(knex, 'process_templates', 'legacy_route_id', t => t.integer('legacy_route_id').nullable().unique());
  await addColumn(knex, 'process_template_details', 'step_code', t => t.string('step_code', 50).nullable());
  await addColumn(knex, 'process_template_details', 'station_id', t => t.integer('station_id').nullable());
  await addColumn(knex, 'process_template_details', 'sop_content', t => t.text('sop_content').nullable());
  await addColumn(knex, 'process_template_details', 'sop_images', t => t.json('sop_images').nullable());
  await addColumn(knex, 'process_template_details', 'materials', t => t.json('materials').nullable());
  await addColumn(knex, 'process_template_details', 'legacy_route_step_id', t => t.integer('legacy_route_step_id').nullable().unique());
  await knex.raw('ALTER TABLE process_template_details MODIFY standard_hours DECIMAL(14,6) NOT NULL DEFAULT 0');
  await knex.raw('ALTER TABLE production_processes MODIFY standard_hours DECIMAL(14,6) NULL DEFAULT 0');
  await knex.raw('ALTER TABLE production_reports MODIFY work_hours DECIMAL(14,6) NOT NULL DEFAULT 0');
  await addColumn(knex, 'production_tasks', 'process_template_id', t => t.integer('process_template_id').nullable().index());
  await addColumn(knex, 'production_tasks', 'process_template_version', t => t.string('process_template_version', 50).nullable());
  await addColumn(knex, 'production_tasks', 'process_snapshot_at', t => t.dateTime('process_snapshot_at').nullable());
  await addColumn(knex, 'production_processes', 'template_detail_id', t => t.integer('template_detail_id').nullable().index());
  await addColumn(knex, 'production_processes', 'station_id', t => t.integer('station_id').nullable().index());
  await addColumn(knex, 'production_processes', 'operator_id', t => t.integer('operator_id').nullable());
  await addColumn(knex, 'production_processes', 'process_snapshot', t => t.json('process_snapshot').nullable());
  await addColumn(knex, 'production_processes', 'legacy_assembly_step_id', t => t.integer('legacy_assembly_step_id').nullable().unique());

  await knex.transaction(async trx => {
    const templates = await trx('process_templates').orderBy('created_at', 'desc').orderBy('id', 'desc');
    const activeProducts = new Set();
    for (const row of templates) {
      const patch = {};
      if (!row.version) patch.version = `V1-${row.id}`;
      if (Number(row.status) === 1 && !row.deleted_at) {
        if (!row.published_at) patch.published_at = row.created_at || trx.fn.now();
        if (row.product_id && activeProducts.has(row.product_id)) patch.status = 0;
        else if (row.product_id) activeProducts.add(row.product_id);
      }
      if (Object.keys(patch).length) await trx('process_templates').where({ id: row.id }).update(patch);
    }

    const legacyRoutes = await trx('process_routes').orderBy('id');
    for (const route of legacyRoutes) {
      let target = await trx('process_templates').where({ legacy_route_id: route.id }).first();
      if (!target) {
        let version = route.version || `legacy-${route.id}`;
        if (await trx('process_templates').where({ product_id: route.product_id, version }).first()) version = `${version}-R${route.id}`;
        const active = route.is_active && !route.deleted_at && !activeProducts.has(route.product_id);
        const [id] = await trx('process_templates').insert({
          code: `ROUTE-LEGACY-${route.id}`, name: route.name, product_id: route.product_id,
          version, status: active ? 1 : 0, published_at: route.is_active ? route.created_at : null,
          legacy_route_id: route.id, created_at: route.created_at, deleted_at: route.deleted_at,
        });
        target = { id };
        if (active) activeProducts.add(route.product_id);
      }
      for (const step of await trx('process_route_steps').where({ route_id: route.id }).orderBy('sequence')) {
        if (await trx('process_template_details').where({ legacy_route_step_id: step.id }).first()) continue;
        const materials = await trx('process_step_materials').where({ step_id: step.id }).select('material_id', 'quantity', 'is_scan_required');
        await trx('process_template_details').insert({
          template_id: target.id, name: step.step_name, order_num: step.sequence,
          standard_hours: Number(step.standard_minutes || 0) / 60,
          step_code: step.step_code, station_id: step.station_id, description: step.description,
          sop_content: step.sop_content, sop_images: JSON.stringify(asArray(step.sop_images)),
          materials: JSON.stringify(materials), legacy_route_step_id: step.id,
        });
      }
    }

    // Existing execution records keep their own names, times and standards.
    for (const step of await trx('assembly_task_steps').orderBy('id')) {
      if (await trx('production_processes').where({ legacy_assembly_step_id: step.id }).first()) continue;
      const task = await trx('production_tasks').where({ id: step.task_id }).first();
      const detail = await trx('process_template_details').where({ legacy_route_step_id: step.route_step_id }).first();
      if (!task || !detail) throw new Error(`装配工序 ${step.id} 缺少任务或工艺来源，迁移已停止`);
      const existing = await trx('production_processes').where({ task_id: step.task_id }).first();
      if (existing && !existing.legacy_assembly_step_id) throw new Error(`任务 ${step.task_id} 同时包含两套执行记录，请先核对后再迁移`);
      await trx('production_processes').insert({
        task_id: step.task_id, process_name: step.step_name, sequence: step.sequence, quantity: task.quantity,
        status: step.status === 'skipped' ? 'cancelled' : step.status,
        progress: ['completed', 'skipped'].includes(step.status) ? 100 : 0,
        standard_hours: detail.standard_hours, template_detail_id: detail.id, station_id: step.station_id,
        operator_id: step.operator_id, actual_start_time: step.started_at, actual_end_time: step.completed_at,
        remarks: step.remark, legacy_assembly_step_id: step.id,
        process_snapshot: JSON.stringify({ ...detail, name: step.step_name, order_num: step.sequence,
          materials: asArray(detail.materials), sop_images: asArray(detail.sop_images), instruction_docs: asArray(detail.instruction_docs) }),
      });
      const template = await trx('process_templates').where({ id: detail.template_id }).first();
      await trx('production_tasks').where({ id: task.id }).update({ process_template_id: template.id, process_template_version: template.version });
    }
    await trx.raw(`UPDATE production_processes SET process_snapshot = JSON_OBJECT(
      'name', process_name, 'order_num', sequence, 'standard_hours', COALESCE(standard_hours, 0),
      'description', COALESCE(description, ''), 'instruction_docs', JSON_ARRAY(),
      'sop_images', JSON_ARRAY(), 'materials', JSON_ARRAY()) WHERE process_snapshot IS NULL`);
    await trx.raw('UPDATE production_tasks SET process_snapshot_at = COALESCE(created_at, NOW()) WHERE process_snapshot_at IS NULL');

    const canonical = await trx('menus').where({ path: '/basedata/process-templates' }).first();
    const legacy = await trx('menus').where({ path: '/production/process-routes' }).first();
    if (canonical) {
      await trx('menus').where({ id: canonical.id }).update({ name: '产品工艺路线' });
      if (legacy && await trx.schema.hasTable('role_menus')) {
        for (const row of await trx('role_menus').where({ menu_id: legacy.id })) {
          if (!(await trx('role_menus').where({ role_id: row.role_id, menu_id: canonical.id }).first())) {
            await trx('role_menus').insert({ role_id: row.role_id, menu_id: canonical.id });
          }
        }
      }
    }
    if (legacy) await trx('menus').where({ id: legacy.id }).update({ visible: 0 });
  });

  await addIndex(knex, 'process_templates', 'uq_product_process_version', 'CREATE UNIQUE INDEX uq_product_process_version ON process_templates(product_id, version)');
  if (!(await knex.schema.hasColumn('process_templates', 'active_product_id'))) {
    await knex.raw('ALTER TABLE process_templates ADD active_product_id INT GENERATED ALWAYS AS (CASE WHEN status = 1 AND deleted_at IS NULL THEN product_id ELSE NULL END) STORED');
  }
  await addIndex(knex, 'process_templates', 'uq_product_active_process', 'CREATE UNIQUE INDEX uq_product_active_process ON process_templates(active_product_id)');
};

exports.down = async function down() {
  throw new Error('产品工艺合并保留了历史快照，请使用迁移前备份恢复，禁止自动删除历史工序');
};
