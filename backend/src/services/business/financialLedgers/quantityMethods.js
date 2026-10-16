'use strict';

const Decimal = require('decimal.js').clone({ precision: 32 });
const { getInventoryTransactionTypeText } = require('../../../constants/systemConstants');

const MAX_ROWS = 10000;
const ZERO = new Decimal(0);

function reportError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function decimal(value) {
  const result = new Decimal(value ?? 0);
  if (!result.isFinite()) throw reportError('库存台账存在无效数量或金额，请核对原始记录');
  return result;
}

function amount(value) {
  return value === null ? null : decimal(value).toDecimalPlaces(6).toNumber();
}

function addAmount(left, right) {
  return left === null || right === null ? null : decimal(left).plus(right);
}

function groupKey(row) {
  // A missing historical unit is deliberately separate from today's material unit.
  return `${row.material_id}:${row.unit_id ?? 'unknown'}`;
}

function monthSequence(startDate, endDate) {
  const result = [];
  let year = Number(startDate.slice(0, 4));
  let month = Number(startDate.slice(5, 7));
  const endMonth = endDate.slice(0, 7);
  while (`${year}-${String(month).padStart(2, '0')}` <= endMonth) {
    if (result.length >= 120) throw reportError('数量金额明细账查询期间过长，请缩小期间');
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    if (++month > 12) {
      year += 1;
      month = 1;
    }
  }
  return result;
}

function emptyTotals() {
  return { debit: ZERO, credit: ZERO, debitQuantity: ZERO, creditQuantity: ZERO };
}

function addTotals(total, movement) {
  total.debit = addAmount(total.debit, movement.debit);
  total.credit = addAmount(total.credit, movement.credit);
  total.debitQuantity = total.debitQuantity.plus(movement.debitQuantity);
  total.creditQuantity = total.creditQuantity.plus(movement.creditQuantity);
}

function movementTotals(event) {
  const quantity = decimal(event.quantity);
  const value = event.signed_amount == null ? null : decimal(event.signed_amount);
  const debitSide = value === null ? quantity.gte(0) : value.gte(0);
  return {
    debit: debitSide ? (value === null ? null : value.abs()) : ZERO,
    credit: debitSide ? ZERO : value === null ? null : value.abs(),
    debitQuantity: quantity.gt(0) ? quantity : ZERO,
    creditQuantity: quantity.lt(0) ? quantity.abs() : ZERO,
  };
}

function unitPrice(value, quantity) {
  return value === null || decimal(quantity).isZero() ? null : amount(decimal(value).div(quantity));
}

function buildRow(group, values, totals = emptyTotals()) {
  return {
    rowType: values.rowType,
    date: values.date || '',
    period: values.period,
    voucherNumber: values.voucherNumber || '',
    description: values.description,
    accountCode: '',
    accountName: '',
    materialId: group.materialId,
    materialCode: group.materialCode,
    materialName: group.materialName,
    unitId: group.unitId,
    unit: group.unit,
    groupKey: group.key,
    debit: amount(totals.debit),
    credit: amount(totals.credit),
    debitQuantity: amount(totals.debitQuantity),
    creditQuantity: amount(totals.creditQuantity),
    debitUnitPrice: unitPrice(totals.debit, totals.debitQuantity),
    creditUnitPrice: unitPrice(totals.credit, totals.creditQuantity),
    balance: group.balance === null ? null : amount(group.balance.abs()),
    direction:
      group.balance === null
        ? ''
        : group.balance.isZero()
          ? '平'
          : group.balance.gt(0)
            ? '借'
            : '贷',
    balanceQuantity: amount(group.quantity),
    balanceUnitPrice: unitPrice(group.balance, group.quantity),
    ...(values.ledgerId ? { ledgerId: values.ledgerId } : {}),
    ...(values.postingDocumentId ? { postingDocumentId: values.postingDocumentId } : {}),
  };
}

/**
 * Source amounts are frozen values, never materials.cost_price. Adjustments are
 * separate dated events so a correction in October cannot rewrite September.
 * Inventory reversals remain in the ledger as the original plus its opposite;
 * filtering a reversed document out would remove only half of that audit trail.
 */
function eventSource(filters, opening) {
  const params = [];
  function conditions(dateExpression) {
    const fragments = ['il.location_id IS NOT NULL'];
    if (opening) {
      fragments.push(`${dateExpression} < ?`);
      params.push(filters.startDate);
    } else {
      fragments.push(`${dateExpression} >= ?`, `${dateExpression} <= ?`);
      params.push(filters.startDate, filters.endDate);
    }
    if (filters.materialId) {
      fragments.push('il.material_id = ?');
      params.push(filters.materialId);
    }
    return fragments.join(' AND ');
  }
  const ledgerDate = 'COALESCE(il.transaction_date, DATE(il.created_at))';
  const ledgerWhere = conditions(ledgerDate);
  const adjustmentWhere = conditions('DATE(va.created_at)');
  return {
    params,
    sql: `
      SELECT il.id AS event_id, il.id AS ledger_id, 'movement' AS event_type,
             DATE_FORMAT(${ledgerDate}, '%Y-%m-%d') AS date,
             il.material_id, il.unit_id, il.quantity,
             CASE
               WHEN COALESCE(il.total_value, pl.posted_value) IS NOT NULL THEN
                 CASE WHEN il.quantity < 0
                      THEN -ABS(COALESCE(il.total_value, pl.posted_value))
                      ELSE ABS(COALESCE(il.total_value, pl.posted_value)) END
               WHEN il.unit_cost IS NOT NULL THEN il.quantity * il.unit_cost
               ELSE NULL
             END AS signed_amount,
             CASE WHEN il.total_value IS NULL AND pl.posted_value IS NULL
                        AND il.unit_cost IS NOT NULL THEN 1 ELSE 0 END AS derived_value,
             il.posting_document_id, il.reference_no,
             COALESCE(NULLIF(il.remark, ''), il.transaction_type) COLLATE utf8mb4_unicode_ci AS description
        FROM inventory_ledger il
        LEFT JOIN inventory_posting_lines pl
          ON pl.id = il.posting_line_id AND pl.posting_document_id = il.posting_document_id
       WHERE ${ledgerWhere}
      UNION ALL
      SELECT va.id AS event_id, il.id AS ledger_id, 'adjustment' AS event_type,
             DATE_FORMAT(va.created_at, '%Y-%m-%d') AS date,
             il.material_id, il.unit_id, 0 AS quantity, va.value_delta AS signed_amount,
             0 AS derived_value,
             COALESCE(va.posting_document_id, il.posting_document_id) AS posting_document_id,
             il.reference_no, CONCAT('估值调整：', va.reason) COLLATE utf8mb4_unicode_ci AS description
        FROM inventory_valuation_adjustments va
        JOIN inventory_ledger il ON il.id = va.ledger_id
       WHERE ${adjustmentWhere}`,
  };
}

function createGroup(row) {
  return {
    key: groupKey(row),
    materialId: row.material_id,
    materialCode: row.material_code || '',
    materialName: row.material_name || `物料 #${row.material_id}`,
    unitId: row.unit_id ?? null,
    unit: row.unit_name || '单位未记录',
    quantity: ZERO,
    balance: ZERO,
    openingBalance: ZERO,
    openingQuantity: ZERO,
    ytd: emptyTotals(),
    entries: [],
  };
}

function buildQuantityRows(openings, entries, filters) {
  if (openings.length > MAX_ROWS || entries.length > MAX_ROWS) {
    throw reportError('数量金额明细账超过 10000 条，请缩小期间或选择具体物料');
  }
  const groups = new Map();
  let missingValuationCount = 0;
  let derivedValuationCount = 0;
  for (const row of openings) {
    const group = createGroup(row);
    group.quantity = decimal(row.opening_quantity);
    group.openingQuantity = group.quantity;
    group.balance = Number(row.missing_count) > 0 ? null : decimal(row.opening_value);
    group.openingBalance = group.balance;
    group.ytd = {
      debit: Number(row.ytd_missing_debit) > 0 ? null : decimal(row.ytd_debit),
      credit: Number(row.ytd_missing_credit) > 0 ? null : decimal(row.ytd_credit),
      debitQuantity: decimal(row.ytd_debit_quantity),
      creditQuantity: decimal(row.ytd_credit_quantity),
    };
    missingValuationCount += Number(row.missing_count || 0);
    derivedValuationCount += Number(row.derived_count || 0);
    groups.set(group.key, group);
  }
  for (const event of entries) {
    const key = groupKey(event);
    if (!groups.has(key)) groups.set(key, createGroup(event));
    groups.get(key).entries.push(event);
    if (event.signed_amount == null) missingValuationCount += 1;
    derivedValuationCount += Number(event.derived_value || 0);
  }

  const periods = monthSequence(filters.startDate, filters.endDate);
  const rows = [];
  const totals = emptyTotals();
  let openingBalance = ZERO;
  let closingBalance = ZERO;
  const quantityTotals = [];
  let zeroQuantityValueCount = 0;
  const orderedGroups = [...groups.values()].sort(
    (a, b) => a.materialCode.localeCompare(b.materialCode) || a.key.localeCompare(b.key)
  );
  for (const group of orderedGroups) {
    // The database orders events, but also keep this helper deterministic for callers/tests.
    group.entries.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        Number(a.ledger_id) - Number(b.ledger_id) ||
        (a.event_type === b.event_type
          ? Number(a.event_id) - Number(b.event_id)
          : a.event_type === 'movement'
            ? -1
            : 1)
    );
    openingBalance = addAmount(openingBalance, group.openingBalance);
    rows.push(buildRow(group, { rowType: 'opening', period: periods[0], description: '期初余额' }));
    let cursor = 0;
    let currentYear = filters.startDate.slice(0, 4);
    const groupTotals = emptyTotals();
    for (const period of periods) {
      if (period.slice(0, 4) !== currentYear) {
        group.ytd = emptyTotals();
        currentYear = period.slice(0, 4);
      }
      const monthTotal = emptyTotals();
      while (cursor < group.entries.length && group.entries[cursor].date.slice(0, 7) === period) {
        const event = group.entries[cursor++];
        const movement = movementTotals(event);
        group.quantity = group.quantity.plus(event.quantity);
        group.balance = addAmount(
          group.balance,
          event.signed_amount == null ? null : event.signed_amount
        );
        addTotals(monthTotal, movement);
        addTotals(group.ytd, movement);
        addTotals(totals, movement);
        addTotals(groupTotals, movement);
        rows.push(
          buildRow(
            group,
            {
              rowType: 'entry',
              date: event.date,
              period,
              voucherNumber: event.posting_no || event.reference_no || '',
              description: getInventoryTransactionTypeText(event.description) || '库存变动',
              ledgerId: event.ledger_id,
              postingDocumentId: event.posting_document_id,
            },
            movement
          )
        );
      }
      rows.push(
        buildRow(
          group,
          { rowType: 'subtotal', period, description: `${period} 本期合计` },
          monthTotal
        )
      );
      rows.push(
        buildRow(
          group,
          { rowType: 'cumulative', period, description: `${period} 本年累计` },
          group.ytd
        )
      );
      if (rows.length > MAX_ROWS) {
        throw reportError('数量金额明细账超过 10000 条，请缩小期间或选择具体物料');
      }
    }
    if (group.quantity.isZero() && group.balance !== null && !group.balance.isZero()) {
      zeroQuantityValueCount += 1;
    }
    closingBalance = addAmount(closingBalance, group.balance);
    quantityTotals.push({
      materialId: group.materialId,
      materialCode: group.materialCode,
      materialName: group.materialName,
      unitId: group.unitId,
      unit: group.unit,
      openingQuantity: amount(group.openingQuantity),
      debitQuantity: amount(groupTotals.debitQuantity),
      creditQuantity: amount(groupTotals.creditQuantity),
      closingQuantity: amount(group.quantity),
      closingBalance: amount(group.balance),
    });
  }
  const warnings = [
    '本表按已过账库存流水与估值调整编制，来源单号栏显示库存过账号或来源单号；库存记录未保存可靠的总账科目关联，暂不支持按科目筛选。',
    '数量和单价按物料、台账原始计量单位分别计算；估值调整按记录日期列示，不改写此前期间。',
  ];
  if (missingValuationCount) {
    warnings.push(
      `${missingValuationCount} 条历史记录缺少入账金额及有效冻结成本，相关金额、余额和单价显示为空，请核对原始单据。`
    );
  }
  if (derivedValuationCount) {
    warnings.push(
      `${derivedValuationCount} 条历史记录未保存入账金额，使用该笔台账的冻结单价乘数量计算。`
    );
  }
  if (orderedGroups.some((group) => group.unitId === null)) {
    warnings.push('部分历史流水未记录计量单位，已单独分组，未按当前物料单位换算。');
  }
  if (zeroQuantityValueCount) {
    warnings.push(
      `${zeroQuantityValueCount} 个物料及单位分组数量为零但仍有金额余额，结存单价留空，请核对估值记录。`
    );
  }
  return {
    rows,
    summary: {
      openingBalance: amount(openingBalance),
      totalDebit: amount(totals.debit),
      totalCredit: amount(totals.credit),
      closingBalance: amount(closingBalance),
      groupCount: groups.size,
      entryCount: entries.length,
      missingValuationCount,
      quantityTotals,
    },
    warnings,
  };
}

async function getQuantityLedger(connection, filters, _context = {}) {
  if (filters.accountId) {
    throw reportError('数量金额明细账尚无可靠的库存与总账科目关联，请清空科目筛选后按物料查询');
  }
  let selectedMaterial = null;
  if (filters.materialId) {
    const [materials] = await connection.execute(
      'SELECT id, code, name FROM materials WHERE id = ? LIMIT 1',
      [filters.materialId]
    );
    selectedMaterial = materials[0];
    if (!selectedMaterial) throw reportError('所选物料不存在，请重新选择物料');
  }
  const before = eventSource(filters, true);
  const yearStart = filters.yearStartDate || `${filters.startDate.slice(0, 4)}-01-01`;
  const [openings] = await connection.execute(
    `SELECT q.material_id, q.unit_id, m.code AS material_code, m.name AS material_name,
            u.name AS unit_name,
            SUM(q.quantity) AS opening_quantity, SUM(q.signed_amount) AS opening_value,
            SUM(q.signed_amount IS NULL) AS missing_count, SUM(q.derived_value) AS derived_count,
            SUM(CASE WHEN q.date >= ? AND q.signed_amount > 0 THEN q.signed_amount ELSE 0 END) AS ytd_debit,
            SUM(CASE WHEN q.date >= ? AND q.signed_amount < 0 THEN -q.signed_amount ELSE 0 END) AS ytd_credit,
            SUM(CASE WHEN q.date >= ? AND q.quantity > 0 THEN q.quantity ELSE 0 END) AS ytd_debit_quantity,
            SUM(CASE WHEN q.date >= ? AND q.quantity < 0 THEN -q.quantity ELSE 0 END) AS ytd_credit_quantity,
            SUM(q.date >= ? AND q.signed_amount IS NULL AND q.quantity >= 0) AS ytd_missing_debit,
            SUM(q.date >= ? AND q.signed_amount IS NULL AND q.quantity < 0) AS ytd_missing_credit
       FROM (${before.sql}) q
       LEFT JOIN materials m ON m.id = q.material_id
       LEFT JOIN units u ON u.id = q.unit_id
      GROUP BY q.material_id, q.unit_id, m.code, m.name, u.name
      ORDER BY q.material_id, q.unit_id LIMIT ${MAX_ROWS + 1}`,
    [...Array(6).fill(yearStart), ...before.params]
  );
  if (openings.length > MAX_ROWS) {
    throw reportError('数量金额明细账超过 10000 个分组，请选择具体物料');
  }
  const current = eventSource(filters, false);
  const [entries] = await connection.execute(
    `SELECT q.*, m.code AS material_code, m.name AS material_name,
            u.name AS unit_name, pd.posting_no
       FROM (${current.sql}) q
       LEFT JOIN materials m ON m.id = q.material_id
       LEFT JOIN units u ON u.id = q.unit_id
       LEFT JOIN inventory_posting_documents pd ON pd.id = q.posting_document_id
      ORDER BY q.date, q.ledger_id, q.event_type DESC, q.event_id LIMIT ${MAX_ROWS + 1}`,
    current.params
  );
  const result = buildQuantityRows(openings, entries, filters);
  return {
    ...result,
    filters: {
      ...filters,
      accountFilterSupported: false,
      accountName: '库存台账（按物料）',
      materialName: selectedMaterial ? selectedMaterial.name : '全部物料',
    },
    source: '已过账库存台账及估值调整；金额为本位币；来源单号栏为库存过账号或来源单号',
  };
}

module.exports = { getQuantityLedger, buildQuantityRows, eventSource };
