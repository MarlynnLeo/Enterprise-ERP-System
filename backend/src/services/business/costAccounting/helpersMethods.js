/**
 * CostAccountingService — helpers methods (mixin)
 * Attached via Object.assign so `this` resolves to CostAccountingService.
 * @module services/business/costAccounting/helpersMethods
 */

const {
  BusinessError,
  businessConfig,
  toLocalDateString,
  resolveActorUserId,
  GLService,
  Precision,
  financeConfig,
} = require('./runtime');

module.exports = {
  normalizeInventoryCostingMethod(method = this.COSTING_METHOD.WEIGHTED_AVERAGE) {
      const normalizedKey = String(method || this.COSTING_METHOD.WEIGHTED_AVERAGE)
        .trim()
        .toLowerCase();
      const normalizedMethod = this.INVENTORY_COSTING_METHOD_ALIASES[normalizedKey];
      if (!normalizedMethod) {
        throw new BusinessError(
          `不支持的库存成本重算方法: ${method}`,
          null,
          'INVALID_COSTING_METHOD',
          400
        );
      }
      return normalizedMethod;
    },

  moneyToCents(value) {
      const amount = Number.parseFloat(value);
      if (!Number.isFinite(amount)) return 0;
      return Math.round(amount * 100);
    },

  toDateOnly(value) {
      if (!value) return null;
      return toLocalDateString(value);
    },

  toNumber(value, fallback = 0) {
      const number = Number.parseFloat(value);
      return Number.isFinite(number) ? number : fallback;
    },

  parseJsonArray(value) {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },

  getMovementUnitCost(row, quantity) {
      const explicitPrice = this.toNumber(row.price, 0);
      if (explicitPrice > 0) return explicitPrice;
  
      const totalAmount = this.toNumber(row.total_amount, 0);
      if (totalAmount > 0 && Math.abs(quantity) > 0) {
        return totalAmount / Math.abs(quantity);
      }
  
      return this.toNumber(row.cost_price, 0);
    },

  allocateOutboundRowToTasks(row, taskMap, tasksByPlan, planTotalMap) {
      const targetTaskIds = new Set(taskMap.keys());
      const itemQuantity = this.toNumber(
        row.actual_quantity === null || row.actual_quantity === undefined
          ? row.quantity
          : row.actual_quantity,
        0
      );
  
      if (itemQuantity === 0) return [];
  
      const directTaskId =
        row.production_task_id ||
        (row.reference_type === 'production_task' ? row.reference_id : null);
      if (directTaskId && targetTaskIds.has(Number(directTaskId))) {
        return [{ taskId: Number(directTaskId), quantity: itemQuantity }];
      }
  
      if (row.reference_type === 'batch_production_tasks') {
        const sourceTasks = this.parseJsonArray(row.source_tasks);
        const allocations = [];
        for (const sourceTask of sourceTasks) {
          const taskId = Number(
            sourceTask.task_id || sourceTask.taskId || sourceTask.id || sourceTask.production_task_id
          );
          if (!targetTaskIds.has(taskId)) continue;
          const sourceQuantity = this.toNumber(
            sourceTask.actual_quantity ?? sourceTask.actualQuantity ?? sourceTask.quantity,
            0
          );
          if (sourceQuantity > 0) {
            allocations.push({ taskId, quantity: sourceQuantity });
          }
        }
  
        if (allocations.length > 0) return allocations;
  
        const sourceTaskIds = this.parseJsonArray(row.source_task_ids)
          .map((id) => Number(id))
          .filter((id) => targetTaskIds.has(id));
        if (sourceTaskIds.length === 0) return [];
  
        const fallbackQuantity = itemQuantity / sourceTaskIds.length;
        return sourceTaskIds.map((taskId) => ({ taskId, quantity: fallbackQuantity }));
      }
  
      if (row.reference_type === 'production_plan' && row.reference_id) {
        const planId = Number(row.reference_id);
        const planTasks = tasksByPlan.get(planId) || [];
        const planTotalQuantity =
          planTotalMap.get(planId) ||
          planTasks.reduce((sum, task) => sum + this.toNumber(task.quantity, 0), 0);
        if (planTotalQuantity <= 0) return [];
  
        return planTasks
          .map((task) => ({
            taskId: Number(task.id),
            quantity: itemQuantity * (this.toNumber(task.quantity, 0) / planTotalQuantity),
          }))
          .filter((allocation) => allocation.quantity > 0);
      }
  
      return [];
    },

  async collectTaskMaterialMovements(connection, taskIds, options = {}) {
      const normalizedTaskIds = [...new Set((taskIds || []).map((id) => Number(id)).filter(Boolean))];
      if (normalizedTaskIds.length === 0) return [];
  
      const taskPh = normalizedTaskIds.map(() => '?').join(',');
      const [taskRows] = await connection.execute(
        `SELECT id, plan_id, quantity
         FROM production_tasks
         WHERE id IN (${taskPh})`,
        normalizedTaskIds
      );
      const taskMap = new Map(taskRows.map((task) => [Number(task.id), task]));
      const tasksByPlan = new Map();
      for (const task of taskRows) {
        if (!task.plan_id) continue;
        const planId = Number(task.plan_id);
        if (!tasksByPlan.has(planId)) tasksByPlan.set(planId, []);
        tasksByPlan.get(planId).push(task);
      }
  
      const planIds = [...tasksByPlan.keys()];
      const planTotalMap = new Map();
      if (planIds.length > 0) {
        const planPh = planIds.map(() => '?').join(',');
        const [planTotals] = await connection.execute(
          `SELECT plan_id, COALESCE(SUM(quantity), 0) as total_quantity
           FROM production_tasks
           WHERE plan_id IN (${planPh}) AND status <> 'cancelled'
           GROUP BY plan_id`,
          planIds
        );
        for (const row of planTotals) {
          planTotalMap.set(Number(row.plan_id), this.toNumber(row.total_quantity, 0));
        }
      }
  
      const relationParams = [];
      const relationConditions = [
        `io.production_task_id IN (${taskPh})`,
        `(io.reference_type = 'production_task' AND io.reference_id IN (${taskPh}))`,
      ];
      relationParams.push(...normalizedTaskIds, ...normalizedTaskIds);
  
      if (planIds.length > 0) {
        const planPh = planIds.map(() => '?').join(',');
        relationConditions.push(`(io.reference_type = 'production_plan' AND io.reference_id IN (${planPh}))`);
        relationParams.push(...planIds);
      }
  
      relationConditions.push(
        `(
          io.reference_type = 'batch_production_tasks'
          AND io.source_task_ids IS NOT NULL
          AND JSON_VALID(io.source_task_ids)
          AND (${normalizedTaskIds.map(() => 'JSON_CONTAINS(io.source_task_ids, CAST(? AS JSON))').join(' OR ')})
        )`
      );
      relationParams.push(...normalizedTaskIds.map((id) => String(id)));
  
      const queryParams = ['completed', 'partial_completed'];
      let dateFilter = '';
      if (options.cutoffDate) {
        dateFilter = 'AND COALESCE(io.outbound_date, DATE(io.created_at)) <= ?';
        queryParams.push(options.cutoffDate);
      }
  
      const [outboundRows] = await connection.execute(
        `SELECT
            io.id as document_id,
            io.outbound_no as document_no,
            COALESCE(io.outbound_date, DATE(io.created_at)) as movement_date,
            io.reference_type,
            io.reference_id,
            io.production_task_id,
            io.source_task_ids,
            ioi.id as item_id,
            ioi.material_id,
            ioi.quantity,
            ioi.actual_quantity,
            ioi.price,
            ioi.total_amount,
            ioi.source_tasks,
            m.name as material_name,
            m.code as material_code,
            m.product_category_id as category,
            m.cost_price
         FROM inventory_outbound io
         JOIN inventory_outbound_items ioi ON ioi.outbound_id = io.id
         JOIN materials m ON ioi.material_id = m.id
         WHERE io.status IN (?, ?)
           ${dateFilter}
           AND (${relationConditions.join(' OR ')})
         ORDER BY COALESCE(io.outbound_date, DATE(io.created_at)), io.id, ioi.id`,
        [...queryParams, ...relationParams]
      );
  
      const movements = [];
      for (const row of outboundRows) {
        const allocations = this.allocateOutboundRowToTasks(row, taskMap, tasksByPlan, planTotalMap);
        for (const allocation of allocations) {
          const unitCost = this.getMovementUnitCost(row, allocation.quantity);
          movements.push({
            taskId: allocation.taskId,
            movementType: 'issue',
            documentId: row.document_id,
            id: row.item_id,
            documentNo: row.document_no,
            movementDate: row.movement_date,
            itemId: row.item_id,
            materialId: row.material_id,
            materialCode: row.material_code,
            materialName: row.material_name,
            category: row.category,
            quantity: allocation.quantity,
            unitCost,
            totalCost: allocation.quantity * unitCost,
            batchNumber: null,
          });
        }
      }
  
      const inboundRelationParams = [];
      const inboundRelationConditions = [`(ii.reference_type = 'production_task' AND ii.reference_id IN (${taskPh}))`];
      inboundRelationParams.push(...normalizedTaskIds);
      if (planIds.length > 0) {
        const planPh = planIds.map(() => '?').join(',');
        inboundRelationConditions.push(`(ii.reference_type = 'production_plan' AND ii.reference_id IN (${planPh}))`);
        inboundRelationParams.push(...planIds);
      }
  
      const inboundParams = ['confirmed', 'completed'];
      let inboundDateFilter = '';
      if (options.cutoffDate) {
        inboundDateFilter = 'AND COALESCE(ii.inbound_date, DATE(ii.created_at)) <= ?';
        inboundParams.push(options.cutoffDate);
      }
  
      const [returnRows] = await connection.execute(
        `SELECT
            ii.id as document_id,
            ii.inbound_no as document_no,
            COALESCE(ii.inbound_date, DATE(ii.created_at)) as movement_date,
            ii.reference_type,
            ii.reference_id,
            iii.id as item_id,
            iii.material_id,
            iii.quantity,
            NULL as actual_quantity,
            NULL as price,
            NULL as total_amount,
            NULL as source_tasks,
            m.name as material_name,
            m.code as material_code,
            m.product_category_id as category,
            m.cost_price
         FROM inventory_inbound ii
         JOIN inventory_inbound_items iii ON iii.inbound_id = ii.id
         JOIN materials m ON iii.material_id = m.id
         WHERE ii.inbound_type = 'production_return'
           AND ii.status IN (?, ?)
           ${inboundDateFilter}
           AND (${inboundRelationConditions.join(' OR ')})
         ORDER BY COALESCE(ii.inbound_date, DATE(ii.created_at)), ii.id, iii.id`,
        [...inboundParams, ...inboundRelationParams]
      );
  
      for (const row of returnRows) {
        const allocations = this.allocateOutboundRowToTasks(row, taskMap, tasksByPlan, planTotalMap);
        for (const allocation of allocations) {
          const unitCost = this.getMovementUnitCost(row, allocation.quantity);
          const quantity = -allocation.quantity;
          movements.push({
            taskId: allocation.taskId,
            movementType: 'return',
            documentId: row.document_id,
            id: row.item_id,
            documentNo: row.document_no,
            movementDate: row.movement_date,
            itemId: row.item_id,
            materialId: row.material_id,
            materialCode: row.material_code,
            materialName: row.material_name,
            category: row.category,
            quantity,
            unitCost,
            totalCost: quantity * unitCost,
            batchNumber: null,
          });
        }
      }
  
      return movements;
    },

  sumMaterialMovementsByTask(movements = []) {
      const result = new Map();
      for (const movement of movements) {
        const current = result.get(movement.taskId) || 0;
        result.set(movement.taskId, Precision.round2(current + this.toNumber(movement.totalCost, 0)));
      }
      return result;
    },

  isExpectedWIPVoucher(items, totalWIP, wipAccountId, productionCostAccountId) {
      const targetCents = this.moneyToCents(totalWIP);
      if (targetCents <= 0) {
        return false;
      }
  
      let wipDebitCents = 0;
      let productionCreditCents = 0;
      let unexpectedLineCount = 0;
  
      for (const item of items) {
        const accountId = Number(item.account_id);
        const debitCents = this.moneyToCents(item.debit_amount);
        const creditCents = this.moneyToCents(item.credit_amount);
  
        if (accountId === Number(wipAccountId) && debitCents === targetCents && creditCents === 0) {
          wipDebitCents += debitCents;
        } else if (
          accountId === Number(productionCostAccountId) &&
          creditCents === targetCents &&
          debitCents === 0
        ) {
          productionCreditCents += creditCents;
        } else {
          unexpectedLineCount += 1;
        }
      }
  
      return (
        items.length === 2 &&
        unexpectedLineCount === 0 &&
        wipDebitCents === targetCents &&
        productionCreditCents === targetCents
      );
    },

  getGLItemCompareKey(item) {
      return [
        Number(item.account_id),
        this.moneyToCents(item.debit_amount),
        this.moneyToCents(item.credit_amount),
        item.cost_center_id === undefined || item.cost_center_id === null
          ? ''
          : Number(item.cost_center_id),
      ].join('|');
    },

  areGLItemsExpected(existingItems, expectedItems) {
      if (existingItems.length !== expectedItems.length) return false;
      const expectedCounts = new Map();
      for (const item of expectedItems) {
        const key = this.getGLItemCompareKey(item);
        expectedCounts.set(key, (expectedCounts.get(key) || 0) + 1);
      }
  
      for (const item of existingItems) {
        const key = this.getGLItemCompareKey(item);
        const count = expectedCounts.get(key) || 0;
        if (count <= 0) return false;
        if (count === 1) {
          expectedCounts.delete(key);
        } else {
          expectedCounts.set(key, count - 1);
        }
      }
  
      return expectedCounts.size === 0;
    },

  async releaseExistingWIPVoucherIfNeeded(
      connection,
      periodId,
      entryDate,
      totalWIP,
      wipAccountId,
      productionCostAccountId
    ) {
      const [entries] = await connection.execute(
        `SELECT id, entry_number, document_type, document_number, transaction_type, transaction_id,
                is_posted, COALESCE(is_reversed, 0) as is_reversed
           FROM gl_entries
          WHERE period_id = ?
            AND COALESCE(is_reversed, 0) = 0
            AND (
              document_type = '期末WIP结转'
              OR transaction_type = '期末WIP结转'
              OR document_number = ?
            )
          FOR UPDATE`,
        [periodId, `WIP-${periodId}`]
      );
  
      if (entries.length === 0) {
        return null;
      }
  
      for (const entry of entries) {
        const [items] = await connection.execute(
          'SELECT id, entry_id, line_number, account_id, debit_amount, credit_amount, description, cost_center_id, project_id, created_at, updated_at, currency_code, exchange_rate, customer_id, supplier_id, employee_id FROM gl_entry_items WHERE entry_id = ? ORDER BY line_number, id FOR UPDATE',
          [entry.id]
        );
  
        if (this.isExpectedWIPVoucher(items, totalWIP, wipAccountId, productionCostAccountId)) {
          return {
            reused: true,
            entryId: entry.id,
            entryNumber: entry.entry_number,
          };
        }
  
        if (Number(entry.is_posted) === 1 || entry.is_posted === true) {
          const reversalEntryId = await GLService.createEntry(
            {
              entry_date: entryDate,
              posting_date: entryDate,
              period_id: periodId,
              document_type: '期末WIP结转冲销',
              document_number: `R-WIP-${periodId}-${entry.id}`.slice(0, 50),
              description: `自动冲销无效WIP凭证 ${entry.entry_number || entry.id}`,
              transaction_type: '期末WIP结转冲销',
              transaction_id: entry.id,
              created_by: await resolveActorUserId(connection),
              status: 'posted',
              is_posted: 1,
            },
            items.map((item) => ({
              account_id: item.account_id,
              debit_amount: item.credit_amount,
              credit_amount: item.debit_amount,
              currency_code: item.currency_code || financeConfig.get('invoice.defaultCurrency', 'CNY'),
              exchange_rate: item.exchange_rate || 1,
              cost_center_id: item.cost_center_id || null,
              description: `自动冲销无效WIP凭证明细: ${item.description || ''}`,
            })),
            connection
          );
  
          await connection.execute(
            `UPDATE gl_entries
                SET is_reversed = 1,
                    reversal_entry_id = ?,
                    status = 'reversed',
                    transaction_type = CONCAT(COALESCE(transaction_type, '期末WIP结转'), '_REVERSED'),
                    transaction_id = NULL
              WHERE id = ?`,
            [reversalEntryId, entry.id]
          );
  
          const logActor = await resolveActorUserId(connection);
          await connection.execute(
            `INSERT INTO operation_logs (module, operation, username, request_data, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [
              'finance',
              'repair_invalid_wip_voucher',
              String(logActor),
              JSON.stringify({ periodId, entryId: entry.id, reversalEntryId, actorId: logActor }),
            ]
          );
        } else {
          await connection.execute('DELETE FROM gl_entry_items WHERE entry_id = ?', [entry.id]);
          await connection.execute('DELETE FROM gl_entries WHERE id = ?', [entry.id]);
        }
      }
  
      return { repaired: true, repairedCount: entries.length };
    },

  normalizeClassificationValue(value) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    },

  getNormalizedSet(values = []) {
      return new Set(
        values
          .map((value) => this.normalizeClassificationValue(value))
          .filter(Boolean)
      );
    },

  matchesClassificationToken(value, tokens) {
      const normalizedValue = this.normalizeClassificationValue(value);
      if (!normalizedValue) return false;
      return tokens.some((token) => normalizedValue === token || normalizedValue.includes(token));
    },

  classifyWIPProduct(task = {}) {
      const classificationConfig = businessConfig.cost?.classification || {};
      const categoryCodes = this.getNormalizedSet(classificationConfig.semiFinishedCategoryCodes || []);
      const categoryNames = Array.from(
        this.getNormalizedSet(classificationConfig.semiFinishedCategoryNames || [])
      );
      const materialTypes = Array.from(
        this.getNormalizedSet(classificationConfig.semiFinishedMaterialTypes || [])
      );
  
      const codeFields = [
        ['product_category_code', task.product_category_code],
        ['category_code', task.category_code],
      ];
      for (const [source, value] of codeFields) {
        const normalizedValue = this.normalizeClassificationValue(value);
        if (normalizedValue && categoryCodes.has(normalizedValue)) {
          return { isSemiFinished: true, type: 'semi_finished', source };
        }
      }
  
      const nameFields = [
        ['product_category_name', task.product_category_name],
        ['category_name', task.category_name],
      ];
      for (const [source, value] of nameFields) {
        if (this.matchesClassificationToken(value, categoryNames)) {
          return { isSemiFinished: true, type: 'semi_finished', source };
        }
      }
  
      if (this.matchesClassificationToken(task.material_type, materialTypes)) {
        return { isSemiFinished: true, type: 'semi_finished', source: 'material_type' };
      }
  
      const productCode = String(task.product_code || '').trim().toLowerCase();
      const codePrefixes = classificationConfig.semiFinishedProductCodePrefixes || [];
      for (const prefix of codePrefixes) {
        const normalizedPrefix = String(prefix || '').trim().toLowerCase();
        if (normalizedPrefix && productCode.startsWith(normalizedPrefix)) {
          return {
            isSemiFinished: true,
            type: 'semi_finished',
            source: 'configured_product_code_prefix',
          };
        }
      }
  
      return { isSemiFinished: false, type: 'finished', source: 'default_finished' };
    },
};
