'use strict';

const Decimal = require('decimal.js');

// This allowlist intentionally excludes amounts, FX evidence, accounts, status,
// approvals and source IDs. Historical monetary evidence is never reconstructed.
const REPAIR_FIELDS = Object.freeze([
  'department_id',
  'customer_id',
  'supplier_id',
  'employee_source',
  'invoice_number',
  'settlement_method',
  'quantity',
  'unit_name',
  'unit_price',
]);
const SOURCE_TABLES = Object.freeze({
  ar_invoice: 'ar_invoices',
  ap_invoice: 'ap_invoices',
  ar_receipt: 'ar_receipts',
  ap_payment: 'ap_payments',
  salary: 'hr_salary_records',
});
const blank = (value) => value == null || (typeof value === 'string' && !value.trim());
const id = (value) => Number(value) || null;
const uniqueIds = (values) => [...new Set(values.map(id).filter(Boolean))];
const mapById = (rows = []) => new Map(rows.map((row) => [id(row.id), row]));

function decimal(value) {
  if (blank(value)) return null;
  try {
    const amount = new Decimal(value);
    return amount.isFinite() ? amount : null;
  } catch {
    return null;
  }
}

function singleInvoiceMaterial(rows, units) {
  if (!rows.length) return { reason: 'missing_invoice_items' };
  const first = rows[0];
  const material = id(first.material_id ?? first.product_id);
  const price = decimal(first.unit_price);
  const unit = (row) => row.unit_name?.trim() || units.get(id(row.unit_id))?.name || null;
  const firstUnit = unit(first);
  if (!material || !price || price.lt(0)) return { reason: 'missing_material_or_unit_price' };
  let quantity = new Decimal(0);
  for (const row of rows) {
    const rowQuantity = decimal(row.quantity);
    if (
      id(row.material_id ?? row.product_id) !== material ||
      !decimal(row.unit_price)?.eq(price) ||
      unit(row) !== firstUnit ||
      id(row.unit_id) !== id(first.unit_id) ||
      !rowQuantity ||
      rowQuantity.lte(0)
    ) {
      return { reason: 'mixed_invoice_items' };
    }
    quantity = quantity.plus(rowQuantity);
  }
  if (
    quantity.decimalPlaces() > 6 ||
    price.decimalPlaces() > 6 ||
    quantity.gte('1000000000000') ||
    price.gte('1000000000000')
  ) {
    return { reason: 'source_precision_out_of_range' };
  }
  return { quantity: quantity.toFixed(6), unit_price: price.toFixed(6), unit_name: firstUnit };
}

function historicalInvoiceItems(data, kind, invoice, rows, units) {
  const isPurchase = kind === 'ap_invoice' && invoice.source_type === 'purchase_receipt';
  const isSale = kind === 'ar_invoice' && invoice.source_type === 'sales_outbound';
  if (!isPurchase && !isSale) return rows;
  const headers = isPurchase ? data.purchaseReceipts : data.salesOutbounds;
  const sourceItems = isPurchase ? data.purchaseReceiptItems : data.salesOutboundItems;
  const partyField = isPurchase ? 'supplier_id' : 'customer_id';
  const headersMatched = (headers || []).filter(
    (row) => id(row.id) === id(invoice.source_id) && id(row[partyField]) === id(invoice[partyField])
  );
  if (headersMatched.length !== 1) return rows;
  return rows.map((row) => {
    if (!blank(row.unit_name) || row.unit_id) return row;
    const matches = (sourceItems || []).filter((source) => {
      const sourceQuantity = isPurchase
        ? (source.qualified_quantity ?? source.received_quantity ?? source.quantity)
        : source.quantity;
      return (
        id(source[isPurchase ? 'receipt_id' : 'outbound_id']) === id(invoice.source_id) &&
        id(source.material_id ?? source.product_id) === id(row.material_id ?? row.product_id) &&
        decimal(sourceQuantity)?.eq(decimal(row.quantity) || -1) &&
        (blank(source.price) || decimal(source.price)?.eq(decimal(row.unit_price) || -1))
      );
    });
    if (matches.length !== 1) return row;
    const source = matches[0];
    const unitName =
      source.unit_name?.trim() || source.unit?.trim() || units.get(id(source.unit_id))?.name;
    // The source document's saved unit identity is evidence. Today's material
    // default unit is intentionally never queried for a historical repair.
    return unitName ? { ...row, unit_id: source.unit_id ?? null, unit_name: unitName } : row;
  });
}

function planVoucherMetadataRepair(data) {
  const changes = [];
  const unresolved = [];
  const unresolvedKeys = new Set();
  const sources = Object.fromEntries(
    Object.keys(SOURCE_TABLES).map((kind) => [kind, mapById(data.sources?.[kind])])
  );
  const costCenters = mapById(data.costCenters);
  const departments = mapById(data.departments);
  const employees = mapById(data.hrEmployees);
  const units = mapById(data.units);
  const parties = { customer_id: mapById(data.customers), supplier_id: mapById(data.suppliers) };
  const linesByEntry = new Map();
  for (const line of data.items || []) {
    if (!linesByEntry.has(id(line.entry_id))) linesByEntry.set(id(line.entry_id), []);
    linesByEntry.get(id(line.entry_id)).push(line);
  }
  const note = (entry, line, reason) => {
    const key = `${entry.id}:${line?.id || 0}:${reason}`;
    if (unresolvedKeys.has(key)) return;
    unresolvedKeys.add(key);
    unresolved.push({ entryId: id(entry.id), lineId: id(line?.id), reason });
  };

  for (const entry of data.entries || []) {
    const lines = linesByEntry.get(id(entry.id)) || [];
    const candidates = new Map();
    let sourceConflict = false;
    const add = (kind, sourceId, evidence) => {
      if (!SOURCE_TABLES[kind]) return;
      const row = sources[kind].get(id(sourceId));
      if (!row) {
        sourceConflict = true;
        note(entry, null, 'dangling_source_reference');
        return;
      }
      const key = `${kind}:${row.id}`;
      const existing = candidates.get(key);
      candidates.set(key, {
        kind,
        row,
        evidence: [...new Set([...(existing?.evidence || []), evidence])],
      });
    };
    for (const link of data.links || []) {
      if (link.target_type === 'finance_voucher' && id(link.target_id) === id(entry.id))
        add(link.source_type, link.source_id, 'document_links');
      if (link.source_type === 'finance_voucher' && id(link.source_id) === id(entry.id))
        add(link.target_type, link.target_id, 'document_links');
    }
    if (SOURCE_TABLES[entry.transaction_type] && entry.transaction_id) {
      add(entry.transaction_type, entry.transaction_id, 'transaction_type+transaction_id');
    }
    for (const [kind, rows] of Object.entries(sources)) {
      for (const row of rows.values()) {
        if (id(row.gl_entry_id) === id(entry.id)) add(kind, row.id, 'source.gl_entry_id');
      }
    }
    const fallbackKinds =
      entry.document_type === 'invoice'
        ? ['ar_invoice', 'ap_invoice']
        : entry.document_type === 'collection'
          ? ['ar_receipt']
          : entry.document_type === 'payment'
            ? ['ap_payment']
            : [];
    const numbered = [];
    if (!blank(entry.document_number)) {
      for (const kind of fallbackKinds) {
        const column = kind.endsWith('invoice')
          ? 'invoice_number'
          : kind === 'ar_receipt'
            ? 'receipt_number'
            : 'payment_number';
        for (const row of sources[kind].values()) {
          if (row[column] === entry.document_number) numbered.push({ kind, row });
        }
      }
    }
    if (!candidates.size && !sourceConflict && numbered.length === 1) {
      const { kind, row } = numbered[0];
      const date = row.invoice_date || row.receipt_date || row.payment_date;
      if (String(date || '').slice(0, 10) === String(entry.entry_date).slice(0, 10)) {
        add(kind, row.id, 'unique_typed_document_number+source_date');
      } else note(entry, null, 'typed_source_date_mismatch');
    } else if (
      numbered.length > 1 ||
      (numbered.length === 1 &&
        candidates.size &&
        !candidates.has(`${numbered[0].kind}:${numbered[0].row.id}`))
    ) {
      sourceConflict = true;
      note(entry, null, 'conflicting_source_identity');
    }
    const documents = sourceConflict ? [] : [...candidates.values()];
    const lineSources = new Map();
    for (const line of lines) {
      if (documents.length === 1) lineSources.set(id(line.id), documents[0]);
      else if (!blank(line.invoice_number)) {
        const matches = documents.filter(
          (source) =>
            source.kind.endsWith('invoice') && source.row.invoice_number === line.invoice_number
        );
        if (matches.length === 1) lineSources.set(id(line.id), matches[0]);
      }
    }
    for (const line of lines) {
      const patch = {};
      const provenance = {};
      const fill = (field, value, evidence) => {
        if (blank(line[field]) && !blank(value)) {
          patch[field] = value;
          provenance[field] = evidence;
        }
      };
      const center = costCenters.get(id(line.cost_center_id));
      if (center?.department_id && departments.has(id(center.department_id))) {
        fill('department_id', id(center.department_id), `cost_centers:${center.id}.department_id`);
      }
      const source = lineSources.get(id(line.id));
      if (!source) {
        note(
          entry,
          line,
          documents.length > 1 ? 'multiple_source_documents' : 'no_verified_source'
        );
      } else {
        const { kind, row } = source;
        const evidence = `${kind}:${row.id} via ${source.evidence.join('+')}`;
        const partyField = kind.startsWith('ar_')
          ? 'customer_id'
          : kind.startsWith('ap_')
            ? 'supplier_id'
            : null;
        const partyConflict =
          partyField && !blank(line[partyField]) && id(line[partyField]) !== id(row[partyField]);
        const invoiceConflict =
          kind.endsWith('invoice') &&
          !blank(line.invoice_number) &&
          line.invoice_number !== row.invoice_number;
        if (partyConflict || invoiceConflict) {
          note(entry, line, 'existing_source_metadata_conflict');
        } else if (kind.endsWith('invoice')) {
          fill('invoice_number', row.invoice_number, evidence);
          if (partyField && parties[partyField].has(id(row[partyField])))
            fill(partyField, id(row[partyField]), evidence);
          else if (partyField && blank(line[partyField])) note(entry, line, 'missing_party_master');
          const group = lines.filter((candidate) => lineSources.get(id(candidate.id)) === source);
          const net =
            decimal(row.amount_excluding_tax) ||
            (decimal(row.tax_amount)?.isZero() || blank(row.tax_amount)
              ? decimal(row.total_amount)
              : null);
          const candidatesForQuantity = group.filter((candidate) => {
            const rate = decimal(candidate.exchange_rate);
            const currency = candidate.currency_code || 'CNY';
            if (
              !net ||
              !rate ||
              rate.lte(0) ||
              currency !== (row.currency_code || 'CNY') ||
              !rate.eq(decimal(row.exchange_rate) || 1)
            )
              return false;
            const amount =
              kind === 'ar_invoice'
                ? decimal(candidate.credit_amount)
                : decimal(candidate.debit_amount);
            const opposite =
              kind === 'ar_invoice'
                ? decimal(candidate.debit_amount)
                : decimal(candidate.credit_amount);
            return (
              amount?.gt(0) &&
              (!opposite || opposite.isZero()) &&
              amount.eq(net.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
            );
          });
          if (
            candidatesForQuantity.length === 1 &&
            id(candidatesForQuantity[0].id) === id(line.id)
          ) {
            const invoiceItems = (data.invoiceItems?.[kind] || []).filter(
              (item) => id(item.invoice_id) === id(row.id)
            );
            const material = singleInvoiceMaterial(
              historicalInvoiceItems(data, kind, row, invoiceItems, units),
              units
            );
            if (material.reason) note(entry, line, material.reason);
            else {
              for (const field of ['quantity', 'unit_name', 'unit_price'])
                fill(
                  field,
                  material[field],
                  `${kind}_items:${row.id}${field === 'unit_name' && row.source_type && row.source_id ? `; verified ${row.source_type}:${row.source_id} unit snapshot` : ''}`
                );
              if (!material.unit_name && blank(line.unit_name))
                note(entry, line, 'missing_historical_unit_snapshot');
            }
          } else if (blank(line.quantity) && candidatesForQuantity.length !== 1)
            note(entry, line, 'quantity_line_not_unique');
        } else if (kind === 'salary') {
          if (
            entry.transaction_type === 'salary' &&
            id(entry.transaction_id) === id(row.id) &&
            id(line.employee_id) === id(row.employee_id) &&
            employees.has(id(row.employee_id)) &&
            (!row.gl_entry_id || id(row.gl_entry_id) === id(entry.id))
          ) {
            fill('employee_source', 'hr', evidence);
          } else note(entry, line, 'salary_employee_identity_not_verified');
        } else {
          if (partyField && parties[partyField].has(id(row[partyField])))
            fill(partyField, id(row[partyField]), evidence);
          else if (partyField && blank(line[partyField])) note(entry, line, 'missing_party_master');
          fill('settlement_method', row.payment_method, evidence);
          const settlements = (data.settlementItems?.[kind] || []).filter(
            (item) => id(item[kind === 'ar_receipt' ? 'receipt_id' : 'payment_id']) === id(row.id)
          );
          const invoiceIds = uniqueIds(settlements.map((item) => item.invoice_id));
          const invoiceKind = kind === 'ar_receipt' ? 'ar_invoice' : 'ap_invoice';
          if (invoiceIds.length === 1) {
            const invoice = sources[invoiceKind].get(invoiceIds[0]);
            if (invoice && id(invoice[partyField]) === id(row[partyField]))
              fill(
                'invoice_number',
                invoice.invoice_number,
                `${evidence}; ${invoiceKind}:${invoice.id}`
              );
            else note(entry, line, 'settlement_invoice_identity_not_verified');
          } else
            note(
              entry,
              line,
              invoiceIds.length ? 'multiple_settlement_invoices' : 'missing_settlement_invoice'
            );
        }
      }
      if (Object.keys(patch).length)
        changes.push({ entryId: id(entry.id), lineId: id(line.id), patch, provenance });
    }
  }
  const fields = {};
  for (const change of changes)
    for (const field of Object.keys(change.patch)) fields[field] = (fields[field] || 0) + 1;
  const unresolvedReasons = {};
  for (const row of unresolved)
    unresolvedReasons[row.reason] = (unresolvedReasons[row.reason] || 0) + 1;
  return {
    scannedEntries: (data.entries || []).length,
    scannedLines: (data.items || []).length,
    repairableEntries: new Set(changes.map((change) => change.entryId)).size,
    repairableLines: changes.length,
    fields,
    unresolvedReasons,
    changes,
    unresolved,
  };
}

async function runVoucherMetadataRepair(
  connection,
  { apply = false, entryIds = [], limit = 5000, expectedDatabase } = {}
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000)
    throw new Error('limit must be between 1 and 100000');
  if (
    !Array.isArray(entryIds) ||
    entryIds.some((value) => !Number.isSafeInteger(Number(value)) || Number(value) <= 0)
  )
    throw new Error('entryIds must be positive integers');
  const [[identity]] = await connection.query('SELECT DATABASE() AS name');
  if (expectedDatabase && identity.name !== expectedDatabase)
    throw new Error('Connected database differs from the selected database');
  const [columns] = await connection.query(
    'SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()'
  );
  const schema = new Map();
  for (const row of columns) {
    const table = row.table_name ?? row.TABLE_NAME;
    if (!schema.has(table)) schema.set(table, new Set());
    schema.get(table).add(row.column_name ?? row.COLUMN_NAME);
  }
  const missingSchemaColumns = REPAIR_FIELDS.filter(
    (field) => !schema.get('gl_entry_items')?.has(field)
  );
  if (apply && missingSchemaColumns.length)
    throw new Error(`Run voucher metadata migration first: ${missingSchemaColumns.join(', ')}`);
  const lock = apply ? ' LOCK IN SHARE MODE' : '';
  const read = async (table, where = '1=1', params = []) => {
    if (!schema.has(table)) return [];
    const [rows] = await connection.query(`SELECT * FROM ${table} WHERE ${where}${lock}`, params);
    return rows;
  };
  const readIds = (table, field, values) => {
    const ids = uniqueIds(values);
    return ids.length ? read(table, `${field} IN (${ids.map(() => '?').join(',')})`, ids) : [];
  };
  try {
    await connection.query(apply ? 'START TRANSACTION' : 'START TRANSACTION READ ONLY');
    const ids = uniqueIds(entryIds);
    const [entries] = await connection.query(
      `SELECT * FROM gl_entries${ids.length ? ` WHERE id IN (${ids.map(() => '?').join(',')})` : ''} ORDER BY id LIMIT ${limit}${apply ? ' FOR UPDATE' : ''}`,
      ids
    );
    const entryKeys = entries.map((entry) => id(entry.id));
    const items = await readIds('gl_entry_items', 'entry_id', entryKeys);
    const links = entryKeys.length
      ? await read(
          'document_links',
          `(target_type = 'finance_voucher' AND target_id IN (${entryKeys.map(() => '?').join(',')})) OR (source_type = 'finance_voucher' AND source_id IN (${entryKeys.map(() => '?').join(',')}))`,
          [...entryKeys, ...entryKeys]
        )
      : [];
    const sources = {};
    for (const [kind, table] of Object.entries(SOURCE_TABLES)) {
      const sourceIds = uniqueIds([
        ...links.filter((link) => link.source_type === kind).map((link) => link.source_id),
        ...links.filter((link) => link.target_type === kind).map((link) => link.target_id),
        ...entries
          .filter((entry) => entry.transaction_type === kind)
          .map((entry) => entry.transaction_id),
      ]);
      const sourceNumbers =
        kind === 'salary'
          ? []
          : entries
              .filter(
                (entry) =>
                  entry.document_type ===
                  (kind.endsWith('invoice')
                    ? 'invoice'
                    : kind === 'ar_receipt'
                      ? 'collection'
                      : 'payment')
              )
              .map((entry) => entry.document_number)
              .filter((value) => !blank(value));
      const conditions = [],
        params = [];
      if (sourceIds.length) {
        conditions.push(`id IN (${sourceIds.map(() => '?').join(',')})`);
        params.push(...sourceIds);
      }
      if (sourceNumbers.length) {
        const field = kind.endsWith('invoice')
          ? 'invoice_number'
          : kind === 'ar_receipt'
            ? 'receipt_number'
            : 'payment_number';
        conditions.push(`${field} IN (${sourceNumbers.map(() => '?').join(',')})`);
        params.push(...sourceNumbers);
      }
      if (entryKeys.length && schema.get(table)?.has('gl_entry_id')) {
        conditions.push(`gl_entry_id IN (${entryKeys.map(() => '?').join(',')})`);
        params.push(...entryKeys);
      }
      sources[kind] = conditions.length
        ? await read(table, `(${conditions.join(' OR ')})`, params)
        : [];
    }
    const settlementItems = {};
    for (const kind of ['ar_receipt', 'ap_payment']) {
      const field = kind === 'ar_receipt' ? 'receipt_id' : 'payment_id';
      settlementItems[kind] = await readIds(
        `${kind}_items`,
        field,
        sources[kind].map((source) => source.id)
      );
      const invoiceKind = kind === 'ar_receipt' ? 'ar_invoice' : 'ap_invoice';
      const invoices = await readIds(
        SOURCE_TABLES[invoiceKind],
        'id',
        settlementItems[kind].map((item) => item.invoice_id)
      );
      sources[invoiceKind] = [...mapById([...sources[invoiceKind], ...invoices]).values()];
    }
    const invoiceItems = {};
    for (const kind of ['ar_invoice', 'ap_invoice'])
      invoiceItems[kind] = await readIds(
        `${kind}_items`,
        'invoice_id',
        sources[kind].map((source) => source.id)
      );
    const purchaseReceipts = await readIds(
      'purchase_receipts',
      'id',
      sources.ap_invoice
        .filter((source) => source.source_type === 'purchase_receipt')
        .map((source) => source.source_id)
    );
    const purchaseReceiptItems = await readIds(
      'purchase_receipt_items',
      'receipt_id',
      purchaseReceipts.map((source) => source.id)
    );
    const salesOutbounds = await readIds(
      'sales_outbound',
      'id',
      sources.ar_invoice
        .filter((source) => source.source_type === 'sales_outbound')
        .map((source) => source.source_id)
    );
    const salesOutboundItems = await readIds(
      'sales_outbound_items',
      'outbound_id',
      salesOutbounds.map((source) => source.id)
    );
    const costCenters = await readIds(
      'cost_centers',
      'id',
      items.map((item) => item.cost_center_id)
    );
    const departments = await readIds(
      'departments',
      'id',
      costCenters.map((center) => center.department_id)
    );
    const hrEmployees = await readIds(
      'hr_employees',
      'id',
      sources.salary.map((salary) => salary.employee_id)
    );
    const units = await readIds(
      'units',
      'id',
      [...Object.values(invoiceItems).flat(), ...purchaseReceiptItems, ...salesOutboundItems].map(
        (item) => item.unit_id
      )
    );
    const customers = await readIds(
      'customers',
      'id',
      [...sources.ar_invoice, ...sources.ar_receipt].map((source) => source.customer_id)
    );
    const suppliers = await readIds(
      'suppliers',
      'id',
      [...sources.ap_invoice, ...sources.ap_payment].map((source) => source.supplier_id)
    );
    const report = planVoucherMetadataRepair({
      entries,
      items,
      links,
      sources,
      settlementItems,
      invoiceItems,
      costCenters,
      departments,
      hrEmployees,
      units,
      customers,
      suppliers,
      purchaseReceipts,
      purchaseReceiptItems,
      salesOutbounds,
      salesOutboundItems,
    });
    let updatedLines = 0;
    if (apply) {
      for (const change of report.changes) {
        const fields = Object.keys(change.patch);
        if (fields.some((field) => !REPAIR_FIELDS.includes(field)))
          throw new Error('Non-metadata repair field rejected');
        const [result] = await connection.query(
          `UPDATE gl_entry_items SET ${fields.map((field) => `\`${field}\` = ?`).join(', ')}, updated_at = updated_at WHERE id = ? AND entry_id = ? AND ${fields.map((field) => `(\`${field}\` IS NULL OR CAST(\`${field}\` AS CHAR) REGEXP '^[[:space:]]*$')`).join(' AND ')}`,
          [...fields.map((field) => change.patch[field]), change.lineId, change.entryId]
        );
        if (result.affectedRows !== 1)
          throw new Error(
            `Concurrent metadata change detected on voucher line ${change.lineId}; repair rolled back`
          );
        updatedLines++;
      }
      await connection.commit();
    } else await connection.rollback();
    return {
      mode: apply ? 'applied' : 'dry-run',
      database: identity.name,
      limit,
      reachedLimit: entries.length === limit,
      missingSchemaColumns,
      updatedLines,
      ...report,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

module.exports = { REPAIR_FIELDS, planVoucherMetadataRepair, runVoucherMetadataRepair };
