'use strict';

/**
 * 20260927000012_import_aql_25_sampling_plan.js
 * @description 导入 AQL 2.5 方案，保留历史标准 ID 和其他 AQL 等级。
 */

const AQL_25_PLAN_ITEMS = [
  {
    code: 'GB2828-2.5-A',
    name: 'GB/T 2828.1 (II) AQL2.5 - 2~8 (字码A)',
    batch_min: 2,
    batch_max: 8,
    sample_size: 5,
    aql_level: 2.5,
    accept_limit: 0,
    reject_limit: 1,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-B',
    name: 'GB/T 2828.1 (II) AQL2.5 - 9~15 (字码B)',
    batch_min: 9,
    batch_max: 15,
    sample_size: 5,
    aql_level: 2.5,
    accept_limit: 0,
    reject_limit: 1,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-C',
    name: 'GB/T 2828.1 (II) AQL2.5 - 16~25 (字码C)',
    batch_min: 16,
    batch_max: 25,
    sample_size: 5,
    aql_level: 2.5,
    accept_limit: 0,
    reject_limit: 1,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-D',
    name: 'GB/T 2828.1 (II) AQL2.5 - 26~50 (字码D)',
    batch_min: 26,
    batch_max: 50,
    sample_size: 5,
    aql_level: 2.5,
    accept_limit: 0,
    reject_limit: 1,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-E',
    name: 'GB/T 2828.1 (II) AQL2.5 - 51~90 (字码E)',
    batch_min: 51,
    batch_max: 90,
    sample_size: 20,
    aql_level: 2.5,
    accept_limit: 1,
    reject_limit: 2,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-F',
    name: 'GB/T 2828.1 (II) AQL2.5 - 91~150 (字码F)',
    batch_min: 91,
    batch_max: 150,
    sample_size: 20,
    aql_level: 2.5,
    accept_limit: 1,
    reject_limit: 2,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-G',
    name: 'GB/T 2828.1 (II) AQL2.5 - 151~280 (字码G)',
    batch_min: 151,
    batch_max: 280,
    sample_size: 32,
    aql_level: 2.5,
    accept_limit: 2,
    reject_limit: 3,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-H',
    name: 'GB/T 2828.1 (II) AQL2.5 - 281~500 (字码H)',
    batch_min: 281,
    batch_max: 500,
    sample_size: 50,
    aql_level: 2.5,
    accept_limit: 3,
    reject_limit: 4,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-J',
    name: 'GB/T 2828.1 (II) AQL2.5 - 501~1200 (字码J)',
    batch_min: 501,
    batch_max: 1200,
    sample_size: 80,
    aql_level: 2.5,
    accept_limit: 4,
    reject_limit: 5,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-K',
    name: 'GB/T 2828.1 (II) AQL2.5 - 1201~3200 (字码K)',
    batch_min: 1201,
    batch_max: 3200,
    sample_size: 125,
    aql_level: 2.5,
    accept_limit: 5,
    reject_limit: 6,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-L',
    name: 'GB/T 2828.1 (II) AQL2.5 - 3201~10000 (字码L)',
    batch_min: 3201,
    batch_max: 10000,
    sample_size: 200,
    aql_level: 2.5,
    accept_limit: 7,
    reject_limit: 8,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-M',
    name: 'GB/T 2828.1 (II) AQL2.5 - 10001~35000 (字码M)',
    batch_min: 10001,
    batch_max: 35000,
    sample_size: 315,
    aql_level: 2.5,
    accept_limit: 10,
    reject_limit: 11,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-N',
    name: 'GB/T 2828.1 (II) AQL2.5 - 35001~150000 (字码N)',
    batch_min: 35001,
    batch_max: 150000,
    sample_size: 500,
    aql_level: 2.5,
    accept_limit: 14,
    reject_limit: 15,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-P',
    name: 'GB/T 2828.1 (II) AQL2.5 - 150001~500000 (字码P)',
    batch_min: 150001,
    batch_max: 500000,
    sample_size: 800,
    aql_level: 2.5,
    accept_limit: 21,
    reject_limit: 22,
    status: 'active',
  },
  {
    code: 'GB2828-2.5-Q',
    name: 'GB/T 2828.1 (II) AQL2.5 - 500001及以上 (字码Q)',
    batch_min: 500001,
    batch_max: 99999999,
    sample_size: 800,
    aql_level: 2.5,
    accept_limit: 21,
    reject_limit: 22,
    status: 'active',
  },
];

exports.AQL_25_PLAN_ITEMS = AQL_25_PLAN_ITEMS;

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('quality_aql_standards'))) return;

  await knex.transaction(async (trx) => {
    // Retire only overlapping AQL 2.5 rules. Historical inspections keep their
    // references; no other AQL level is changed or deleted.
    await trx('quality_aql_standards')
      .where({ aql_level: 2.5, status: 'active' })
      .whereNotIn(
        'code',
        AQL_25_PLAN_ITEMS.map((item) => item.code)
      )
      .where('batch_min', '<=', 99999999)
      .where('batch_max', '>=', 2)
      .update({ status: 'inactive', updated_at: trx.fn.now() });

    const now = new Date();
    const rowsToInsert = AQL_25_PLAN_ITEMS.map((item) => ({
      ...item,
      created_at: now,
      updated_at: now,
    }));

    await trx('quality_aql_standards')
      .insert(rowsToInsert)
      .onConflict('code')
      .merge([
        'name',
        'batch_min',
        'batch_max',
        'sample_size',
        'aql_level',
        'accept_limit',
        'reject_limit',
        'status',
        'updated_at',
      ]);
  });
};

// Imported rules may already be referenced by inspection evidence.
exports.down = async function down() {};
