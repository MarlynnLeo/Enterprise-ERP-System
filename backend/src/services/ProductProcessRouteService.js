/** Product process definitions. Both configuration APIs use this store. */
const { pool } = require('../config/db');
const crypto = require('crypto');
const BusinessError = require('../utils/BusinessError');
const FileAccessService = require('./FileAccessService');
const { jsonArray, validateDefinition } = require('../utils/productProcessDefinition');

const fail = (message, code = 'INVALID_PROCESS_ROUTE', status = 400) => {
  throw new BusinessError(message, null, code, status);
};

async function transaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') fail('该产品已存在相同版本或生效工艺，请刷新后重试', 'PROCESS_VERSION_CONFLICT', 409);
    throw error;
  } finally {
    connection.release();
  }
}

async function lockProduct(connection, productId) {
  const [rows] = await connection.query('SELECT id FROM materials WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [productId]);
  if (!rows.length) fail('关联产品不存在', 'PRODUCT_NOT_FOUND', 404);
}

async function lockRoute(connection, id, { productId = null, requireProduct = false } = {}) {
  const [refs] = await connection.query('SELECT product_id FROM process_templates WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!refs.length) fail('产品工艺不存在', 'PROCESS_ROUTE_NOT_FOUND', 404);
  const targetId = productId == null ? refs[0].product_id : productId;
  if (requireProduct && (!Number.isInteger(Number(targetId)) || Number(targetId) <= 0)) fail('请选择有效的关联产品');
  const productIds = [...new Set([refs[0].product_id, targetId].map(Number))].filter(id => id > 0).sort((a, b) => a - b);
  const [products] = productIds.length
    ? await connection.query('SELECT id, deleted_at FROM materials WHERE id IN (?) ORDER BY id FOR UPDATE', [productIds])
    : [[]];
  if (requireProduct && !products.some(row => Number(row.id) === Number(targetId) && !row.deleted_at)) {
    fail('关联产品不存在', 'PRODUCT_NOT_FOUND', 404);
  }
  // Product locks always precede definition locks, including draft edits and
  // publication. A locking read avoids a pre-wait repeatable-read snapshot.
  const current = await service.getById(id, connection, { lock: true });
  if (!current) fail('产品工艺不存在', 'PROCESS_ROUTE_NOT_FOUND', 404);
  if (Number(current.product_id) !== Number(refs[0].product_id)) {
    fail('工艺关联产品已变更，请刷新后重试', 'PROCESS_VERSION_CONFLICT', 409);
  }
  return current;
}

async function assertDraft(connection, current) {
  const [refs] = await connection.query('SELECT id FROM production_tasks WHERE process_template_id = ? LIMIT 1', [current.id]);
  if (current.published_at || Number(current.status) === 1 || refs.length) {
    fail('已发布或被任务引用的工艺不可修改，请复制为新版本', 'PROCESS_VERSION_IMMUTABLE', 409);
  }
}

const hydrateStep = step => ({ ...step,
  instruction_docs: jsonArray(step.instruction_docs),
  sop_images: jsonArray(step.sop_images), materials: jsonArray(step.materials),
});

async function normalizeInstructionDocs(connection, docs, templateId, userId, copiedUrls) {
  const normalized = [];
  for (const doc of docs || []) {
    const url = FileAccessService.normalizeUploadUrl(doc?.url);
    if (!url) fail('作业指导书文件路径无效', 'INVALID_FILE_REFERENCE');
    const [rows] = await connection.execute(
      `SELECT id, business_type, business_id, uploaded_by, deleted_at
       FROM file_access_records WHERE file_url = ? LIMIT 1 FOR UPDATE`, [url]
    );
    const record = rows[0];
    if (!record || record.deleted_at) fail('作业指导书未通过受控上传接口登记', 'FILE_ACCESS_RECORD_NOT_FOUND');
    if (record.business_type || record.business_id) {
      if (record.business_type !== 'process_template' ||
          (Number(record.business_id) !== Number(templateId) && !copiedUrls.has(url))) {
        fail('作业指导书已绑定到其他业务对象', 'FILE_ACCESS_BINDING_CONFLICT');
      }
    } else if (!userId || Number(record.uploaded_by) !== Number(userId)) {
      fail('只能绑定自己上传的作业指导书', 'FILE_OWNER_MISMATCH');
    } else {
      await connection.execute(
        "UPDATE file_access_records SET business_type = 'process_template', business_id = ?, updated_at = NOW() WHERE id = ?",
        [templateId, record.id]
      );
    }
    normalized.push({ name: String(doc.name || '作业指导书').slice(0, 255), url, upload_time: doc.upload_time || null });
  }
  return normalized;
}

async function retireRemovedInstructionDocs(connection, templateId, activeUrls) {
  const urls = [...new Set(activeUrls)];
  await connection.execute(
    `UPDATE file_access_records SET deleted_at = NOW(), updated_at = NOW()
     WHERE business_type = 'process_template' AND business_id = ? AND deleted_at IS NULL
     ${urls.length ? `AND file_url NOT IN (${urls.map(() => '?').join(',')})` : ''}
     AND NOT EXISTS (
       SELECT 1 FROM process_template_details d JOIN process_templates t ON t.id = d.template_id
       WHERE t.deleted_at IS NULL AND d.template_id <> ?
         AND (JSON_CONTAINS(d.instruction_docs, JSON_OBJECT('url', file_access_records.file_url))
           OR JSON_CONTAINS(d.sop_images, JSON_QUOTE(file_access_records.file_url)))
     )`,
    [templateId, ...urls, templateId]
  );
}

async function validateReferences(connection, data) {
  for (const step of data.details) {
    if (step.station_id) {
      const [rows] = await connection.query('SELECT id FROM work_stations WHERE id = ? AND is_active = 1', [step.station_id]);
      if (!rows.length) fail(`工序「${step.name}」的工位不存在或已停用`);
    }
    for (const material of step.materials || []) {
      const [rows] = await connection.query('SELECT id, code, name FROM materials WHERE id = ? AND deleted_at IS NULL', [material.material_id]);
      if (!rows.length) fail(`工序「${step.name}」的物料不存在`);
      material.material_code = rows[0].code;
      material.material_name = rows[0].name;
    }
  }
}

async function saveDetails(connection, id, data, userId) {
  const copiedUrls = new Set();
  if (data.source_template_id) {
    const source = await service.getById(data.source_template_id, connection, { lock: true });
    if (!source || Number(source.product_id) !== Number(data.product_id)) fail('来源工艺必须属于同一产品');
    for (const detail of source.details) {
      for (const doc of jsonArray(detail.instruction_docs)) copiedUrls.add(doc.url);
      for (const url of jsonArray(detail.sop_images)) copiedUrls.add(url);
    }
  }
  const activeUrls = [];
  await connection.query('DELETE FROM process_template_details WHERE template_id = ?', [id]);
  for (const step of data.details) {
    const docs = await normalizeInstructionDocs(connection, step.instruction_docs, id, userId, copiedUrls);
    activeUrls.push(...docs.map(doc => doc.url));
    const images = await normalizeInstructionDocs(connection,
      (step.sop_images || []).map(url => ({ url, name: 'SOP图片' })), id, userId, copiedUrls);
    activeUrls.push(...images.map(doc => doc.url));
    await connection.query(
      `INSERT INTO process_template_details
       (template_id, name, order_num, description, standard_hours, department, remark,
        instruction_docs, step_code, station_id, sop_content, sop_images, materials)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, step.name.trim(), Number(step.order_num), step.description || '', Number(step.standard_hours),
        step.department || '', step.remark || '', JSON.stringify(docs), step.step_code || null,
        step.station_id || null, step.sop_content || '', JSON.stringify(images.map(doc => doc.url)),
        JSON.stringify(step.materials || [])]
    );
  }
  await retireRemovedInstructionDocs(connection, id, activeUrls);
}

async function activate(connection, id, productId) {
  await connection.query('UPDATE process_templates SET status = 0 WHERE product_id = ? AND status = 1 AND id <> ?', [productId, id]);
  await connection.query('UPDATE process_templates SET status = 1, published_at = COALESCE(published_at, NOW()) WHERE id = ?', [id]);
}

const service = {
  async getMaterialOptions({ keyword = '', pageSize = 50 } = {}) {
    const size = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 100);
    const search = `%${String(keyword).trim()}%`;
    const [rows] = await pool.query(
      `SELECT id, code, name, specs, unit_id FROM materials
       WHERE deleted_at IS NULL AND status = 1 AND (code LIKE ? OR name LIKE ?)
       ORDER BY code LIMIT ?`, [search, search, size]
    );
    return rows;
  },

  async getAll(page = 1, pageSize = 10, filters = {}, connection = pool) {
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const size = pageSize == null ? null : Math.min(Math.max(parseInt(pageSize, 10) || 10, 1), 100);
    let where = 'WHERE pt.deleted_at IS NULL';
    const params = [];
    if (filters.name) {
      where += ' AND (pt.name LIKE ? OR pt.code LIKE ? OR m.name LIKE ? OR m.code LIKE ?)';
      params.push(...Array(4).fill(`%${filters.name}%`));
    }
    if (filters.productId) { where += ' AND pt.product_id = ?'; params.push(filters.productId); }
    if (filters.status !== undefined && filters.status !== '') { where += ' AND pt.status = ?'; params.push(filters.status); }
    const join = 'FROM process_templates pt LEFT JOIN materials m ON pt.product_id = m.id';
    const [[{ total }]] = await connection.query(`SELECT COUNT(*) AS total ${join} ${where}`, params);
    const [list] = await connection.query(
      `SELECT pt.*, m.code AS product_code, m.name AS product_name ${join} ${where}
       ORDER BY pt.created_at DESC, pt.id DESC ${size == null ? '' : 'LIMIT ? OFFSET ?'}`,
      size == null ? params : [...params, size, (safePage - 1) * size]
    );
    if (list.length) {
      const [details] = await connection.query(
        `SELECT d.*, ws.name AS station_name FROM process_template_details d
         LEFT JOIN work_stations ws ON ws.id = d.station_id WHERE d.template_id IN (?) ORDER BY d.order_num, d.id`,
        [list.map(row => row.id)]
      );
      for (const row of list) row.details = details.filter(detail => detail.template_id === row.id).map(hydrateStep);
    }
    return { list, total, page: safePage, pageSize: size == null ? list.length : size };
  },

  async getById(id, connection = pool, { lock = false } = {}) {
    const [rows] = await connection.query(
      `SELECT pt.*, m.code AS product_code, m.name AS product_name, m.specs AS product_specs
       FROM process_templates pt LEFT JOIN materials m ON m.id = pt.product_id
       WHERE pt.id = ? AND pt.deleted_at IS NULL ${lock ? 'FOR UPDATE' : ''}`, [id]
    );
    if (!rows.length) return null;
    const [details] = await connection.query(
      `SELECT d.*, ws.name AS station_name FROM process_template_details d
       LEFT JOIN work_stations ws ON ws.id = d.station_id WHERE d.template_id = ? ORDER BY d.order_num, d.id ${lock ? 'FOR UPDATE' : ''}`, [id]
    );
    return { ...rows[0], details: details.map(hydrateStep) };
  },

  async getByProductId(productId, connection = pool, { lock = false } = {}) {
    const [rows] = await connection.query(
      `SELECT id FROM process_templates WHERE product_id = ? AND status = 1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`, [productId]
    );
    return rows.length ? this.getById(rows[0].id, connection, { lock }) : null;
  },

  async create(input) {
    const data = { version: 'V1.0', details: [], status: 0, ...input };
    if (![0, 1].includes(Number(data.status))) fail('工艺状态无效');
    validateDefinition(data, Number(data.status) === 1);
    return transaction(async connection => {
      await lockProduct(connection, data.product_id);
      await validateReferences(connection, data);
      const code = data.code || `PR-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const [result] = await connection.query(
        `INSERT INTO process_templates (code, name, product_id, version, description, status, source_template_id)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [code, data.name.trim(), data.product_id, data.version.trim(), data.description || '', data.source_template_id || null]
      );
      await saveDetails(connection, result.insertId, data, data.created_by);
      if (Number(data.status) === 1) await activate(connection, result.insertId, data.product_id);
      return this.getById(result.insertId, connection);
    });
  },

  async update(id, input) {
    return transaction(async connection => {
      const current = await lockRoute(connection, id, { productId: input.product_id, requireProduct: true });
      await assertDraft(connection, current);
      const data = { ...current, ...input, source_template_id: current.source_template_id };
      validateDefinition(data);
      await validateReferences(connection, data);
      await connection.query(
        'UPDATE process_templates SET name = ?, product_id = ?, version = ?, description = ? WHERE id = ?',
        [data.name.trim(), data.product_id, data.version.trim(), data.description || '', id]
      );
      await saveDetails(connection, id, data, input.updated_by);
      return this.getById(id, connection);
    });
  },

  async updateStatus(id, status) {
    if (![0, 1].includes(Number(status)) || status == null || status === '') fail('工艺状态必须为0或1');
    return transaction(async connection => {
      const route = await lockRoute(connection, id, { requireProduct: Number(status) === 1 });
      if (Number(status) === 1) {
        validateDefinition(route, true);
        await validateReferences(connection, route);
        await activate(connection, id, route.product_id);
      } else {
        await connection.query('UPDATE process_templates SET status = 0 WHERE id = ?', [id]);
      }
      return this.getById(id, connection, { lock: true });
    });
  },

  async delete(id) {
    return transaction(async connection => {
      const current = await lockRoute(connection, id);
      await assertDraft(connection, current);
      const [copies] = await connection.query('SELECT id FROM process_templates WHERE source_template_id = ? AND deleted_at IS NULL LIMIT 1', [id]);
      if (copies.length) fail('该工艺已被其他版本引用，不能删除', 'PROCESS_VERSION_REFERENCED', 409);
      await retireRemovedInstructionDocs(connection, id, []);
      await connection.query('UPDATE process_templates SET deleted_at = NOW(), status = 0 WHERE id = ?', [id]);
      return true;
    });
  },
};

module.exports = service;
