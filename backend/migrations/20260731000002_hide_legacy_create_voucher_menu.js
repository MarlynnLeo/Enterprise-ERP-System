/**
 * 隐藏历史「新增凭证」全屏菜单（id=925）
 * 录入已并入会计凭证列表对话框
 */

async function applyMenuHide(knex, hide) {
  if (!(await knex.schema.hasTable('menus'))) return;

  const cols = await knex('menus').columnInfo();
  const patch = {};
  if (cols.updated_at) patch.updated_at = knex.fn.now();
  if (cols.status) patch.status = hide ? 0 : 1;
  if (cols.visible !== undefined) patch.visible = hide ? 0 : 1;
  if (cols.is_visible !== undefined) patch.is_visible = hide ? 0 : 1;
  if (cols.deleted_at) patch.deleted_at = hide ? knex.fn.now() : null;

  if (Object.keys(patch).length === 0) return;

  await knex('menus')
    .where((qb) => {
      qb.where({ id: 925 }).orWhere({ path: '/finance/gl/entries/create' });
    })
    .update(patch);
}

exports.up = async function up(knex) {
  await applyMenuHide(knex, true);
};

exports.down = async function down(knex) {
  await applyMenuHide(knex, false);
};
