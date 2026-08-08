const { mapKeysToCamel, mapKeysToSnake } = require('../../src/utils/fieldMap');

describe('fieldMap mapKeysToCamel / mapKeysToSnake', () => {
  it('converts snake_case keys to camelCase recursively', () => {
    const input = {
      user_id: 1,
      real_name: 'Ada',
      items: [{ unit_price: 12.5, material_code: 'M1' }],
    };
    expect(mapKeysToCamel(input)).toEqual({
      userId: 1,
      realName: 'Ada',
      items: [{ unitPrice: 12.5, materialCode: 'M1' }],
    });
  });

  it('breaks circular references without stack overflow', () => {
    const node = { user_id: 9, title: 't' };
    node.self = node;
    const result = mapKeysToCamel(node);
    expect(result.userId).toBe(9);
    expect(result.title).toBe('t');
    expect(result.self).toBeNull();
  });

  it('plain-serializes Sequelize-like models via toJSON', () => {
    const modelLike = {
      dataValues: { user_id: 3, real_name: 'Bob' },
      _modelOptions: {},
      isNewRecord: false,
      toJSON() {
        return this.dataValues;
      },
    };
    expect(mapKeysToCamel(modelLike)).toEqual({ userId: 3, realName: 'Bob' });
  });

  it('converts camelCase keys to snake_case', () => {
    expect(mapKeysToSnake({ userId: 2, unitPrice: 1 })).toEqual({
      user_id: 2,
      unit_price: 1,
    });
  });
});
