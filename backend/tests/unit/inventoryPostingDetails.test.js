jest.mock('../../src/config/db', () => ({ pool: {} }));

const InventoryPostingService = require('../../src/services/InventoryPostingService');

describe('InventoryPostingService.get posting details', () => {
  test('joins materials, units, and locations to return material details on lines', async () => {
    const mockDocument = {
      id: 1,
      posting_no: 'PST-20261013-0001',
      source_type: 'inbound',
      source_id: 10,
      source_no: 'IN-10',
      finance_status: 'pending',
    };
    const mockLines = [
      {
        id: 101,
        posting_document_id: 1,
        line_no: 1,
        material_id: 14897,
        material_code: '3011011032',
        material_name: '带胶热缩管',
        material_specs: 'HRF-MD5 ZC黑色Φ8 1卷100米',
        unit_id: 6,
        unit_name: '米',
        location_id: 1,
        location_name: '零部件库',
        signed_quantity: 200,
        unit_cost: 0.88495,
        total_value: 176.99,
      },
    ];
    const mockEvents = [
      {
        id: 1,
        posting_document_id: 1,
        event_type: 'created',
      },
    ];

    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[mockDocument]])
        .mockResolvedValueOnce([mockLines])
        .mockResolvedValueOnce([mockEvents]),
    };

    const result = await InventoryPostingService.get(1, connection);

    expect(result).toMatchObject({
      id: 1,
      posting_no: 'PST-20261013-0001',
      lines: mockLines,
      events: mockEvents,
    });
    expect(result.lines[0].material_code).toBe('3011011032');
    expect(result.lines[0].material_name).toBe('带胶热缩管');
    expect(result.lines[0].material_specs).toBe('HRF-MD5 ZC黑色Φ8 1卷100米');
    expect(result.lines[0].unit_name).toBe('米');
    expect(result.lines[0].location_name).toBe('零部件库');

    const lineQuerySql = connection.execute.mock.calls[1][0];
    expect(lineQuerySql).toContain('LEFT JOIN materials m ON l.material_id = m.id');
    expect(lineQuerySql).toContain('LEFT JOIN units u ON COALESCE(l.unit_id, m.unit_id) = u.id');
    expect(lineQuerySql).toContain('LEFT JOIN locations loc ON l.location_id = loc.id');
    expect(lineQuerySql).toContain('m.code AS material_code');
    expect(lineQuerySql).toContain('m.name AS material_name');
    expect(lineQuerySql).toContain('m.specs AS material_specs');
    expect(lineQuerySql).not.toContain('SELECT * FROM inventory_posting_lines');
  });

  test('throws 404 when document does not exist', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValueOnce([[]]),
    };

    await expect(InventoryPostingService.get(99999, connection)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});
