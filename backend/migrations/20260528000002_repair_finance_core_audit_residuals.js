exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const holdingName = '历史未过账凭证暂存期间';
    let holdingPeriod = await trx('gl_periods').where({ period_name: holdingName }).first();
    if (!holdingPeriod) {
      const [holdingId] = await trx('gl_periods').insert({
        period_name: holdingName,
        start_date: '2999-01-01',
        end_date: '2999-12-31',
        is_closed: 0,
        is_adjusting: 1,
        fiscal_year: 2999,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
      holdingPeriod = { id: holdingId };
    }

    await trx.raw(
      `UPDATE gl_entries e
        JOIN gl_periods p ON p.id = e.period_id
         SET e.period_id = ?,
             e.voucher_word = COALESCE(NULLIF(e.voucher_word, ''), '记'),
             e.voucher_number = e.id
       WHERE COALESCE(p.is_closed, 0) = 1
         AND e.status = 'draft'`,
      [holdingPeriod.id]
    );

    const reversedEntries = await trx('gl_entries')
      .select(
        'id',
        'entry_number',
        'entry_date',
        'posting_date',
        'document_type',
        'document_number',
        'period_id',
        'description',
        'created_by',
        'approved_by',
        'voucher_word',
        'transaction_type',
        'transaction_id'
      )
      .where({ status: 'reversed' })
      .whereNull('reversal_entry_id');

    for (const entry of reversedEntries) {
      const existing = await trx('gl_entries')
        .where({ entry_number: `RV${entry.id}` })
        .first();

      let reversalEntryId = existing?.id;
      if (!reversalEntryId) {
        const [insertedId] = await trx('gl_entries').insert({
          entry_number: `RV${entry.id}`,
          entry_date: entry.posting_date || entry.entry_date,
          posting_date: entry.posting_date || entry.entry_date,
          document_type: entry.document_type || 'reversal',
          document_number: `RV-${entry.id}`,
          period_id: entry.period_id,
          is_posted: 1,
          is_reversed: 0,
          reversal_entry_id: null,
          description: `Auto reversal repair for ${entry.entry_number}`,
          created_by: entry.created_by || null,
          approved_by: entry.approved_by || null,
          voucher_word: 'RV',
          voucher_number: entry.id,
          status: 'posted',
          transaction_type: `${entry.transaction_type || 'GL'}_REVERSAL_REPAIR`.slice(0, 50),
          transaction_id: entry.transaction_id || null,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
        reversalEntryId = insertedId;

        const items = await trx('gl_entry_items')
          .where({ entry_id: entry.id })
          .orderBy([{ column: 'line_number' }, { column: 'id' }]);

        for (const item of items) {
          await trx('gl_entry_items').insert({
            entry_id: reversalEntryId,
            line_number: item.line_number,
            account_id: item.account_id,
            debit_amount: item.credit_amount,
            credit_amount: item.debit_amount,
            description: `Auto reversal repair for ${entry.entry_number}`,
            cost_center_id: item.cost_center_id || null,
            project_id: item.project_id || null,
            currency_code: item.currency_code || 'CNY',
            exchange_rate: item.exchange_rate || 1,
            customer_id: item.customer_id || null,
            supplier_id: item.supplier_id || null,
            employee_id: item.employee_id || null,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
        }
      }

      await trx('gl_entries')
        .where({ id: entry.id })
        .update({
          reversal_entry_id: reversalEntryId,
          is_reversed: 1,
          status: 'reversed',
          updated_at: trx.fn.now(),
        });
    }
  });
};

exports.down = async function down(knex) {
  await knex.transaction(async (trx) => {
    const repairedEntries = await trx('gl_entries')
      .select('id')
      .where('entry_number', 'like', 'RV%')
      .andWhere('transaction_type', 'like', '%_REVERSAL_REPAIR');

    const repairedIds = repairedEntries.map((entry) => entry.id);
    if (repairedIds.length > 0) {
      await trx('gl_entries')
        .whereIn('reversal_entry_id', repairedIds)
        .update({ reversal_entry_id: null, updated_at: trx.fn.now() });
      await trx('gl_entry_items').whereIn('entry_id', repairedIds).del();
      await trx('gl_entries').whereIn('id', repairedIds).del();
    }

    const holdingPeriod = await trx('gl_periods')
      .where({ period_name: '历史未过账凭证暂存期间' })
      .first();
    if (holdingPeriod) {
      await trx('gl_periods')
        .where({ id: holdingPeriod.id })
        .update({ is_adjusting: 1, is_closed: 0, updated_at: trx.fn.now() });
    }
  });
};
