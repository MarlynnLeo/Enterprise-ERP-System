const {
  assertShopFloorOutbound,
  assertShopFloorInbound,
} = require('../../src/authorization/shopFloorMaterialRequest');

describe('shopFloorMaterialRequest', () => {
  test('仓库出库权不受补料类型限制', () => {
    const payload = { outboundType: 'bom_issue', productionTaskId: 1, status: 'confirmed' };
    assertShopFloorOutbound({ userPermissions: ['inventory:outbound:create'] }, payload);
    expect(payload.status).toBe('confirmed');
  });

  test('车间只能用补料/换料草稿出库', () => {
    expect(() =>
      assertShopFloorOutbound(
        { userPermissions: ['production:supplement:create'] },
        { outboundType: 'bom_issue', productionTaskId: 1 }
      )
    ).toThrow(/补料或换料/);

    const payload = {
      outboundType: 'supplement',
      productionTaskId: 9,
      status: 'confirmed',
    };
    assertShopFloorOutbound({ userPermissions: ['production:supplement:create'] }, payload);
    expect(payload.status).toBe('draft');
  });

  test('车间换料退回必须挂任务', () => {
    expect(() =>
      assertShopFloorInbound(
        { userPermissions: ['production:exchange:create'] },
        { inbound_type: 'production_return', reference_type: 'purchase_order', reference_id: 1 }
      )
    ).toThrow(/关联生产任务/);
  });
});
