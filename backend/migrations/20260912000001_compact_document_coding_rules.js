/**
 * 统一为两位年份、三位递增流水号，保留各业务前缀、日期组成及重置周期。
 * 仅修改规则；已有单据编号和 coding_sequences 的周期键、当前值继续沿用。
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('coding_rules'))) return;

  await knex('coding_rules').update({
    date_format: knex.raw("REPLACE(COALESCE(date_format, ''), 'YYYY', 'YY')"),
    separator: '',
    sequence_length: 3,
    initial_value: 1,
    step: 1,
  });

  await knex.raw(`
    ALTER TABLE coding_rules
      ALTER COLUMN date_format SET DEFAULT 'YYMMDD',
      ALTER COLUMN \`separator\` SET DEFAULT '',
      ALTER COLUMN sequence_length SET DEFAULT 3,
      ALTER COLUMN reset_cycle SET DEFAULT 'daily'
  `);
};

exports.down = async function down() {
  // 保留已经用于分配单据编号的规则；格式调整应通过新的迁移或编码规则页面完成。
};

// MySQL ALTER TABLE 会隐式提交；数据更新本身为一条原子且可重复执行的语句。
exports.config = { transaction: false };
