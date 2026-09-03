/* global describe, test, expect */

const InspectionTemplateResolver = require('../../src/services/business/InspectionTemplateResolverService');

describe('InspectionTemplateResolver template code', () => {
  test('trims a manually entered template code', () => {
    expect(InspectionTemplateResolver.validateTemplateCode(' IT-SPRING-001 ')).toBe(
      'IT-SPRING-001'
    );
  });

  test('requires a template code for manual creation', () => {
    expect(() => InspectionTemplateResolver.validateTemplateCode('   ')).toThrow('模板编号不能为空');
  });

  test('rejects template codes longer than the database column', () => {
    expect(() => InspectionTemplateResolver.validateTemplateCode('A'.repeat(51))).toThrow(
      '模板编号不能超过50个字符'
    );
  });

  test('restores template item order from mapping sort_order', () => {
    const unorderedItems = [
      { id: 30, item_name: '第三项' },
      { id: 10, item_name: '第一项' },
      { id: 20, item_name: '第二项' },
    ];
    const mappings = [
      { item_id: 30, sort_order: 2 },
      { item_id: 10, sort_order: 0 },
      { item_id: 20, sort_order: 1 },
    ];

    expect(InspectionTemplateResolver.orderTemplateItems(unorderedItems, mappings).map((item) => item.id)).toEqual([
      10,
      20,
      30,
    ]);
  });
});
