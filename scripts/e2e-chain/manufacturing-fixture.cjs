'use strict';

const assert = require('node:assert/strict');

/** Creates only master data for the isolated, newly-created chain materials. */
async function prepareManufacturingFixture(db, fixture) {
  const [[database]] = await db.query('SELECT DATABASE() AS name');
  assert.match(database.name, /(?:audit|test).*chain/i, '制造测试主数据只能创建于独立测试库');
  const prefix = fixture.prefix || fixture.materials.internal.code.replace(/-FG$/, '');
  const unitId = fixture.unit.id;
  const product = fixture.materials.internal;
  const raw = fixture.materials.raw;
  const semi = fixture.materials.semi;
  const actorId = fixture.actors?.business?.id || fixture.actorId || 1;
  await db.beginTransaction();
  try {
    const [parent] = await db.execute(
      'INSERT INTO departments (name, code, status, remark) VALUES (?, ?, 1, ?)',
      [`${prefix}生产部`, `${prefix}-PD`, '隔离全链路测试主数据']
    );
    const [group] = await db.execute(
      'INSERT INTO departments (parent_id, name, code, status, remark) VALUES (?, ?, ?, 1, ?)',
      [parent.insertId, `${prefix}装配组`, `${prefix}-PG`, '隔离全链路测试主数据']
    );
    const groupName = `${prefix}装配组`;
    const products = [product, semi].filter(Boolean);
    const boms = {};
    const processes = {};
    const qualityTemplates = {};
    for (const material of products) {
      // The runner has just created these dedicated materials; never update a pre-existing product.
      assert.ok(material.code.startsWith(prefix), '只允许补充本次新物料的生产组');
      await db.execute('UPDATE materials SET production_group_id = ? WHERE id = ? AND code = ?',
        [group.insertId, material.id, material.code]);
      const [bom] = await db.execute(
        "INSERT INTO bom_masters (product_id, version, status, remark, created_by) VALUES (?, 'E2E1', 1, ?, 'chain-fixture')",
        [material.id, `${prefix} 测试BOM`]
      );
      boms[material.id] = bom.insertId;
      const perUnit = material.id === product.id ? 2 : 3;
      await db.execute(
        'INSERT INTO bom_details (bom_id, material_id, quantity, unit_id, remark) VALUES (?, ?, ?, ?, ?)',
        [bom.insertId, raw.id, perUnit, unitId, `${prefix} 原料需求`]
      );
      const [route] = await db.execute(
        "INSERT INTO process_templates (code, name, product_id, version, description, status, published_at) VALUES (?, ?, ?, 'E2E1', ?, 1, NOW())",
        [`${material.code}-RT`, `${material.name}工艺`, material.id, '两道工序真实报工验证']
      );
      processes[material.id] = { id: route.insertId, steps: [] };
      for (const [index, name] of ['备料加工', '组装验证'].entries()) {
        const [step] = await db.execute(
          'INSERT INTO process_template_details (template_id, order_num, name, description, standard_hours, department, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [route.insertId, index + 1, `${prefix}${name}`, '按测试工艺执行', 0.1 * (index + 1), groupName, prefix]
        );
        processes[material.id].steps.push({ id: step.insertId, name: `${prefix}${name}`, hours: 0.1 * (index + 1) });
      }
      const [inspectionItem] = await db.execute(
        "INSERT INTO inspection_items (item_name, standard, type, is_critical) VALUES (?, '无破损，装配及功能正常', 'function', 1)",
        [`${prefix}功能与装配`]
      );
      qualityTemplates[material.id] = {};
      for (const type of ['first_article', 'process', 'final']) {
        const [template] = await db.execute(
          `INSERT INTO inspection_templates
           (template_code, template_name, inspection_type, material_type, material_types,
            is_general, is_default, priority, version, description, status, is_aql, created_by)
           VALUES (?, ?, ?, ?, ?, 0, 0, 1, 'E2E1', ?, 'active', 0, ?)`,
          [`${material.code}-${type}`, `${material.name} ${type}`, type, material.id,
            JSON.stringify([material.id]), `${prefix}逐项实测模板`, actorId]
        );
        await db.execute('INSERT INTO template_item_mappings (template_id, item_id, sort_order) VALUES (?, ?, 1)',
          [template.insertId, inspectionItem.insertId]);
        qualityTemplates[material.id][type] = template.insertId;
      }
      await db.execute(
        'INSERT INTO first_article_rules (product_id, first_article_qty, full_inspection_threshold, template_id, is_mandatory, note) VALUES (?, 1, 1, ?, 1, ?)',
        [material.id, qualityTemplates[material.id].first_article, prefix]
      );
      await db.execute(
        'INSERT INTO process_inspection_rules (product_id, inspection_interval, sample_rate, punch_interval, template_id, is_enabled, note) VALUES (?, 1, 100, 1, ?, 1, ?)',
        [material.id, qualityTemplates[material.id].process, prefix]
      );
    }
    await db.commit();
    fixture.manufacturing = { group: { id: group.insertId, name: groupName }, boms, processes, qualityTemplates, rawPerUnit: 2 };
    return fixture.manufacturing;
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

async function prepareIncomingFixture(db, fixture) {
  const [[database]] = await db.query('SELECT DATABASE() AS name');
  assert.match(database.name, /(?:audit|test).*chain/i);
  const [[method]] = await db.query("SELECT id FROM inspection_methods WHERE code = 'full' AND status = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1");
  assert.ok(method, '测试账套缺少全检方式');
  const result = {};
  await db.beginTransaction();
  try {
    for (const key of ['raw', 'external']) {
      const material = fixture.materials[key];
      assert.ok(material.code.startsWith(fixture.prefix));
      const templateCode = `${material.code}-incoming`;
      let [[template]] = await db.execute('SELECT id FROM inspection_templates WHERE template_code = ?', [templateCode]);
      if (!template) {
        const [item] = await db.execute(
          "INSERT INTO inspection_items (item_name, standard, type, is_critical, method) VALUES (?, '外观完好、型号标识正确、数量相符', 'visual', 1, '外观目视')",
          [`${fixture.prefix}来料外观目视`]);
        const [created] = await db.execute(
          `INSERT INTO inspection_templates
           (template_code, template_name, inspection_type, material_type, material_types,
            is_general, is_default, priority, version, description, status, is_aql, created_by)
           VALUES (?, ?, 'incoming', ?, ?, 0, 0, 1, 'E2E1', '隔离全链路来料全检', 'active', 0, ?)`,
          [templateCode, `${material.name} 来料检验`, material.id, JSON.stringify([material.id]), fixture.actors.business.id]);
        await db.execute('INSERT INTO template_item_mappings (template_id, item_id, sort_order) VALUES (?, ?, 1)', [created.insertId, item.insertId]);
        template = { id: created.insertId };
      }
      await db.execute('UPDATE materials SET inspection_method_id = ? WHERE id = ? AND code = ?', [method.id, material.id, material.code]);
      result[key] = { materialId: material.id, templateId: template.id, inspectionMethodId: method.id };
    }
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

module.exports = { prepareManufacturingFixture, prepareIncomingFixture };
