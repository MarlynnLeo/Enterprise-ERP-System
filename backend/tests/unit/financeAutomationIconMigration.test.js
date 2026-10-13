const fs = require('fs');
const path = require('path');
const migration = require('../../migrations/20261012000002_fix_finance_automation_menu_icon');

describe('reconstructed finance automation icon migration', () => {
  test('limits the correction to canonical automation menus with a different or missing icon', async () => {
    const filter = { whereNull: jest.fn().mockReturnThis(), orWhere: jest.fn().mockReturnThis() };
    const query = {
      where: jest.fn(function (arg) {
        if (typeof arg === 'function') arg.call(filter);
        return this;
      }),
      whereIn: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
    };
    const knex = jest.fn().mockReturnValue(query);
    knex.fn = { now: jest.fn().mockReturnValue('now') };

    await migration.up(knex);

    expect(knex).toHaveBeenCalledWith('menus');
    expect(query.where).toHaveBeenCalledWith('permission', 'finance:automation:view');
    expect(query.where).toHaveBeenCalledWith('type', 1);
    expect(query.whereIn).toHaveBeenCalledWith('path', [
      '/finance/automation',
      '/finance/settings?tab=automation',
    ]);
    expect(filter.whereNull).toHaveBeenCalledWith('icon');
    expect(filter.orWhere).toHaveBeenCalledWith('icon', '<>', 'icon-robot');
    expect(query.update).toHaveBeenCalledWith({ icon: 'icon-robot', updated_at: 'now' });
  });

  test('keeps an icon supported by the frontend permission definition and renderer', () => {
    const root = path.resolve(__dirname, '../../..');
    const definitions = fs.readFileSync(
      path.join(root, 'frontend/src/utils/permissions/financePerms.js'),
      'utf8'
    );
    const icons = fs.readFileSync(path.join(root, 'frontend/src/utils/menuIcons.js'), 'utf8');
    expect(definitions).toMatch(
      /permission:\s*'finance:automation:view'[\s\S]{0,300}icon:\s*'icon-robot'|icon:\s*'icon-robot'[\s\S]{0,300}permission:\s*'finance:automation:view'/
    );
    expect(icons).toMatch(/'icon-robot':\s*ChatDotRound/);
  });

  test('rollback preserves menu customization when the previous icon is unknown', async () => {
    const knex = jest.fn();
    await migration.down(knex);
    expect(knex).not.toHaveBeenCalled();
  });
});
