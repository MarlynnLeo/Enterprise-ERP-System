'use strict';

const dayjs = require('dayjs');
const { serializeAuditPayload } = require('../../utils/auditSanitizer');

const definitions = {
  maintenance: {
    table: 'equipment_maintenance',
    statusField: 'status',
    transitions: { pending: ['in_progress'], in_progress: ['completed'], completed: [] },
  },
  failure: {
    table: 'equipment_failure',
    statusField: 'repair_status',
    transitions: {
      reported: ['diagnosing', 'repairing'],
      diagnosing: ['repairing', 'unresolved'],
      repairing: ['resolved', 'unresolved'],
      unresolved: ['diagnosing', 'repairing'],
      resolved: [],
    },
  },
};

function reject(message, httpStatus = 400, errorCode = 'VALIDATION_ERROR') {
  throw Object.assign(new Error(message), { httpStatus, errorCode });
}

function textField(value, label, maxLength = 65535, required = false) {
  if (value != null && typeof value !== 'string') reject(`${label}必须是文本`);
  const text = String(value ?? '').trim();
  if (required && !text) reject(`请填写${label}`);
  if (text.length > maxLength) reject(`${label}最多${maxLength}个字符`);
  return text || null;
}

function amount(value, label) {
  if (value == null || value === '') return null;
  if (!['number', 'string'].includes(typeof value)) reject(`${label}必须是有效数字`);
  if (typeof value === 'string' && !/^\d+(\.\d{1,2})?$/.test(value.trim()))
    reject(`${label}必须为非负数字，最多两位小数`);
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > 99999999.99 ||
    Math.abs(parsed * 100 - Math.round(parsed * 100)) > 0.000001
  ) {
    reject(`${label}必须为非负数字，最多两位小数`);
  }
  return parsed;
}

function dateOnly(value, label) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ||
    !dayjs(value).isValid() ||
    dayjs(value).format('YYYY-MM-DD') !== value
  )
    reject(`${label}无效`);
  return value;
}

function dateTime(value, label) {
  if (!(value instanceof Date) && typeof value !== 'string') reject(`${label}无效`);
  if (typeof value === 'string') dateOnly(value.slice(0, 10), label);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) reject(`${label}无效`);
  return parsed;
}

function changesFor(kind, record, body) {
  const definition = definitions[kind];
  const previousStatus = record[definition.statusField];
  const nextStatus = body[definition.statusField] || body.status;
  if (body.expected_status && body.expected_status !== previousStatus) {
    reject('记录状态已变化，请刷新后重试', 409, 'CONFLICT');
  }
  if (!definition.transitions[previousStatus]?.includes(nextStatus)) {
    reject('当前状态不允许此操作，请刷新记录', 409, 'CONFLICT');
  }

  const changes = { [definition.statusField]: nextStatus };
  if (kind === 'maintenance') {
    changes.maintenance_staff = textField(
      body.maintenance_staff ?? body.maintenance_person ?? record.maintenance_staff,
      '执行人',
      50,
      true
    );
    for (const field of ['parts_replaced', 'remarks']) {
      if (Object.hasOwn(body, field))
        changes[field] = textField(body[field], field === 'remarks' ? '执行结果' : '更换备件');
    }
    if (Object.hasOwn(body, 'cost')) changes.cost = amount(body.cost, '保养费用');
    if (Object.hasOwn(body, 'next_maintenance_date')) {
      changes.next_maintenance_date = body.next_maintenance_date
        ? dateOnly(body.next_maintenance_date, '下次保养日期')
        : null;
    }
    if (nextStatus === 'completed') {
      changes.remarks = textField(body.remarks, '执行结果', 65535, true);
      changes.completed_date = dateOnly(
        body.completed_date || dayjs().format('YYYY-MM-DD'),
        '完成日期'
      );
      if (
        changes.completed_date < dayjs(record.maintenance_date).format('YYYY-MM-DD') ||
        changes.completed_date > dayjs().format('YYYY-MM-DD')
      ) {
        reject('完成日期不能早于保养日期或晚于今天');
      }
      const nextDate = Object.hasOwn(changes, 'next_maintenance_date')
        ? changes.next_maintenance_date
        : record.next_maintenance_date;
      if (nextDate && dayjs(nextDate).format('YYYY-MM-DD') < changes.completed_date)
        reject('下次保养日期不能早于完成日期');
    }
  } else {
    changes.resolved_by = textField(body.resolved_by ?? record.resolved_by, '维修人', 50, true);
    for (const field of ['resolution', 'remarks']) {
      if (Object.hasOwn(body, field))
        changes[field] = textField(body[field], field === 'resolution' ? '维修结果' : '备注');
    }
    for (const [field, label] of [
      ['downtime_hours', '停机时长'],
      ['repair_cost', '维修费用'],
    ]) {
      if (Object.hasOwn(body, field)) changes[field] = amount(body[field], label);
    }
    if (['resolved', 'unresolved'].includes(nextStatus)) {
      changes.resolution = textField(body.resolution, '维修结果', 65535, true);
    }
    if (nextStatus === 'resolved') {
      changes.resolved_date = body.resolved_date
        ? dateTime(body.resolved_date, '修复时间')
        : new Date();
      if (
        !Number.isFinite(changes.resolved_date.getTime()) ||
        changes.resolved_date < new Date(record.failure_date) ||
        changes.resolved_date.getTime() > Date.now() + 60000
      ) {
        reject('修复时间不能早于故障时间或晚于当前时间');
      }
      changes.downtime_hours = amount(body.downtime_hours ?? record.downtime_hours, '停机时长');
      changes.repair_cost = amount(body.repair_cost ?? record.repair_cost, '维修费用');
      if (changes.downtime_hours === null || changes.repair_cost === null)
        reject('请填写停机时长和维修费用，无费用可填0');
    } else {
      changes.resolved_date = null;
    }
  }
  return changes;
}

// Historical completed records use the same evidence checks as a live transition.
function prepareCreation(kind, body) {
  const definition = definitions[kind];
  const status = body[definition.statusField];
  if (!Object.hasOwn(definition.transitions, status)) reject('无效的记录状态');
  const initial = kind === 'maintenance' ? 'pending' : 'reported';
  const normalized = { ...body };
  delete normalized.expected_status;
  if (kind === 'maintenance') {
    dateOnly(body.maintenance_date, '保养日期');
    if (body.next_maintenance_date) dateOnly(body.next_maintenance_date, '下次保养日期');
    if (body.next_maintenance_date === '') normalized.next_maintenance_date = null;
    if (body.cost !== undefined) normalized.cost = amount(body.cost, '保养费用');
    if (status === 'completed' && !body.completed_date) reject('补录已完成保养时请填写完成日期');
    if (status !== 'completed' && body.completed_date) reject('未完成保养不能填写完成日期');
    if (body.maintenance_staff || body.maintenance_person)
      textField(body.maintenance_staff || body.maintenance_person, '执行人', 50);
  } else {
    normalized.failure_date = dateTime(body.failure_date, '故障时间');
    if (normalized.failure_date.getTime() > Date.now() + 60000) reject('故障时间不能晚于当前时间');
    for (const [field, label] of [
      ['repair_cost', '维修费用'],
      ['downtime_hours', '停机时长'],
    ]) {
      if (body[field] !== undefined) normalized[field] = amount(body[field], label);
    }
    if (status !== 'resolved' && body.resolved_date) reject('未解决故障不能填写修复时间');
    if (status === 'resolved' && !body.resolved_date) reject('补录已解决故障时请填写修复时间');
    if (body.resolved_by) textField(body.resolved_by, '维修人', 50);
  }
  if (status === initial) return normalized;
  const previousStatus =
    kind === 'maintenance'
      ? status === 'completed'
        ? 'in_progress'
        : 'pending'
      : ['resolved', 'unresolved'].includes(status)
        ? 'repairing'
        : 'reported';
  return {
    ...normalized,
    ...changesFor(kind, { ...normalized, [definition.statusField]: previousStatus }, normalized),
  };
}

function assertCanStart(equipment, status) {
  if (
    equipment.status === 'scrapped' &&
    ['in_progress', 'diagnosing', 'repairing'].includes(status)
  ) {
    reject('报废设备不能开始保养或维修', 409, 'CONFLICT');
  }
}

async function auditRecord(connection, kind, id, oldValue, newValue, req) {
  await connection.query(
    `INSERT INTO audit_logs (user_id, username, module, action, method, path, entity_type, entity_id, old_value, new_value, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user?.id || req.user?.userId || null,
      req.user?.username || req.user?.real_name || null,
      'production',
      oldValue ? 'update' : 'create',
      req.method || (oldValue ? 'PUT' : 'POST'),
      req.originalUrl || null,
      definitions[kind].table,
      String(id),
      serializeAuditPayload(oldValue),
      serializeAuditPayload(newValue),
      req.ip || null,
      req.headers?.['user-agent'] || null,
    ]
  );
}

async function updateRecord(connection, kind, id, body, req) {
  const definition = definitions[kind];
  if (!definition || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) reject('无效的记录编号');
  const operatorId = req.user?.id || req.user?.userId;
  if (!operatorId) reject('请先登录', 401, 'UNAUTHORIZED');
  const { table, statusField } = definition;
  // Equipment is the aggregate lock shared with record creation and archival.
  const [references] = await connection.query(`SELECT equipment_id FROM ${table} WHERE id = ?`, [
    id,
  ]);
  if (!references.length) reject('记录不存在', 404, 'NOT_FOUND');
  const [equipment] = await connection.query(
    'SELECT id, status FROM equipment WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
    [references[0].equipment_id]
  );
  if (!equipment.length) reject('设备不存在或已归档', 404, 'NOT_FOUND');
  const [records] = await connection.query(
    `SELECT * FROM ${table} WHERE id = ? AND equipment_id = ? FOR UPDATE`,
    [id, equipment[0].id]
  );
  if (!records.length) reject('记录不存在', 404, 'NOT_FOUND');
  const record = records[0];
  const changes = changesFor(kind, record, body);
  assertCanStart(equipment[0], changes[statusField]);
  const [result] = await connection.query(
    `UPDATE ${table} SET ${Object.keys(changes)
      .map((field) => `${field} = ?`)
      .join(', ')}, updated_at = NOW() WHERE id = ? AND ${statusField} = ?`,
    [...Object.values(changes), id, record[statusField]]
  );
  if (result.affectedRows !== 1) reject('记录已被其他人处理，请刷新后重试', 409, 'CONFLICT');
  // Audit shares the transaction: no successful transition without its actor,
  // timestamp and before/after evidence. Do not revive the equipment master.
  await auditRecord(connection, kind, id, record, { ...record, ...changes }, req);
  return { ...record, ...changes };
}

module.exports = { updateRecord, prepareCreation, auditRecord, assertCanStart };
