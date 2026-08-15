const { inventoryInboundMap, inventoryInboundItemMap } = require('../../src/utils/inventory/inventoryFieldMap');

describe('inventoryInboundMap.fromApi', () => {
  test('同时接受 camel 和车间提交的 snake 字段', () => {
    const snake = inventoryInboundMap.fromApi({
      inbound_date: '2026-08-14',
      inbound_type: 'production_return',
      location_id: 12,
      status: 'draft',
      operator: '徐海英',
      reference_type: 'production_task',
      reference_id: 88,
      reference_no: 'RW-1',
      items: [{ material_id: 3, quantity: 2, unit_id: 1, location_id: 12 }],
    });
    expect(snake.inbound_date).toBe('2026-08-14');
    expect(snake.inbound_type).toBe('production_return');
    expect(snake.location_id).toBe(12);
    expect(snake.reference_id).toBe(88);
    expect(snake.items[0].material_id).toBe(3);

    const camel = inventoryInboundMap.fromApi({
      inboundDate: '2026-08-14',
      inboundType: 'production_return',
      locationId: 12,
      status: 'draft',
      operator: '徐海英',
      referenceType: 'production_task',
      referenceId: 88,
      items: [{ materialId: 3, quantity: 2, unitId: 1, locationId: 12 }],
    });
    expect(camel.location_id).toBe(12);
    expect(camel.items[0].material_id).toBe(3);
  });
});
