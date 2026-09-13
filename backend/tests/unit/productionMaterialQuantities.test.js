jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
  pool: { query: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/BomExplosionService', () => ({
  explodeBom: jest.fn(),
}));

const db = require('../../src/config/db');
const BomExplosionService = require('../../src/services/BomExplosionService');
const ExcessIssueService = require('../../src/services/business/ExcessIssueService');
const {
  calculateMaterialRequirementsWithStock,
} = require('../../src/services/business/MaterialCalculationService');

const reportedMaterials = [
  [16269, 0.6, 0.6000000000000001],
  [17096, 1.2, 1.2000000000000002],
  [16496, 0.6, 0.6000000000000001],
  [16497, 2.4, 2.4000000000000004],
];

function mockIssueQuantities({
  planQuantities = Object.fromEntries(reportedMaterials.map(([id, quantity]) => [id, quantity])),
  issuedQuantity = 0,
  taskQuantity = 6,
  planQuantity = 6,
  bomUnitUsage = 0,
} = {}) {
  db.query.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM production_tasks pt')) {
      return {
        rows: [
          {
            id: 1,
            product_id: 9079,
            quantity: taskQuantity,
            plan_id: 2,
            plan_quantity: planQuantity,
            plan_bom_id: 3,
          },
        ],
      };
    }
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
      return {
        rows: ['required_quantity', 'gross_required_quantity'].map((COLUMN_NAME) => ({
          COLUMN_NAME,
        })),
      };
    }
    if (sql.includes('FROM production_plan_materials ppm')) {
      return { rows: [{ plan_issue_quantity: planQuantities[params[1]] ?? null }] };
    }
    if (sql.includes('FROM bom_details')) {
      return { rows: [{ unit_usage: bomUnitUsage }] };
    }
    if (sql.includes('FROM inventory_outbound io')) {
      return { rows: [{ total: issuedQuantity }] };
    }
    throw new Error(`Unexpected quantity query: ${sql}`);
  });
}

beforeEach(() => jest.resetAllMocks());

describe('production issue quantity validation', () => {
  test('accepts all four reported materials without an excess confirmation', async () => {
    mockIssueQuantities();
    const result = await ExcessIssueService.checkBatchExcess(
      1,
      reportedMaterials.map(([materialId, , quantity]) => ({ materialId, quantity }))
    );
    expect(result).toEqual([]);
  });

  test('accepts a partial issue whose decimal sum exactly meets the plan', async () => {
    mockIssueQuantities({ planQuantities: { 16269: 0.3 }, issuedQuantity: 0.1 });
    const result = await ExcessIssueService.checkExcessIssue(1, 16269, 0.2);
    expect(result).toMatchObject({
      isExcess: false,
      planQty: 0.3,
      issuedQty: 0.1,
      remainingQty: 0.2,
      excessQty: 0,
    });
  });

  test('scales the plan requirement for a partial production task', async () => {
    mockIssueQuantities({ planQuantities: { 16269: 1.8 }, planQuantity: 3, taskQuantity: 1 });
    const result = await ExcessIssueService.checkExcessIssue(1, 16269, 0.6000000000000001);
    expect(result).toMatchObject({ isExcess: false, planQty: 0.6, excessQty: 0 });
  });

  test('uses the BOM requirement when no plan material exists', async () => {
    mockIssueQuantities({ planQuantities: {}, bomUnitUsage: 0.1 });
    const result = await ExcessIssueService.checkExcessIssue(1, 16269, 0.6);
    expect(result).toMatchObject({ isExcess: false, planQty: 0.6, remainingQty: 0.6 });
  });

  test('still reports a real excess at six decimal places', async () => {
    mockIssueQuantities();
    const result = await ExcessIssueService.checkExcessIssue(1, 16269, 0.600001);
    expect(result).toMatchObject({ isExcess: true, planQty: 0.6, excessQty: 0.000001 });
    expect(result.message).toBe('计划 0.6，已发 0，本次 0.600001，将超额 0.000001');
  });

  test('formats real excess quantities without exposing floating point tails', async () => {
    mockIssueQuantities({ issuedQuantity: 0.1 });
    const result = await ExcessIssueService.checkExcessIssue(1, 17096, 1.2000000000000002);
    expect(result).toMatchObject({
      isExcess: true,
      planQty: 1.2,
      issuedQty: 0.1,
      remainingQty: 1.1,
      excessQty: 0.1,
    });
    expect(result.message).toBe('计划 1.2，已发 0.1，本次 1.2，将超额 0.1');
  });

  test('still treats materials outside the plan and BOM as excess', async () => {
    mockIssueQuantities({ planQuantities: {} });
    const result = await ExcessIssueService.checkExcessIssue(1, 16269, 0.6000000000000001);
    expect(result).toMatchObject({ isExcess: true, planQty: 0, excessQty: 0.6 });
    expect(result.message).toBe('非BOM/计划物料（计划需求为0），本次申领 0.6 将全部视为超额');
  });
});

describe('production material requirement output', () => {
  test('returns clean issue quantities while preserving meaningful fractional consumption', async () => {
    const quantities = [
      ...reportedMaterials,
      [18000, 0.000001, 0.000001],
      [18001, 0.123456, 0.123456],
    ];
    const explosion = quantities.map(([materialId]) => ({
      material_id: materialId,
      material_code: `M-${materialId}`,
      material_name: '生产物料',
      level: 1,
      is_leaf: true,
    }));
    BomExplosionService.explodeBom
      .mockResolvedValueOnce(explosion)
      .mockImplementationOnce(async (_productId, _bomId, _quantity, _useCache, { netReqMap }) => {
        for (const [materialId, , quantity] of quantities) {
          netReqMap.set(materialId, {
            requiredQuantity: quantity,
            issueQuantity: quantity,
            shortageQuantity: 0,
            grossRequiredQuantity: quantity,
            level: 1,
          });
        }
        return explosion;
      });
    db.pool.query
      .mockResolvedValueOnce([[{ COLUMN_NAME: 'issue_quantity' }]])
      .mockResolvedValueOnce([
        quantities.map(([materialId]) => ({
          material_id: materialId,
          stock_quantity: 2.4000000000000004,
          available_quantity: 1.2000000000000002,
        })),
      ]);

    const result = await calculateMaterialRequirementsWithStock(9079, 3, 6);
    expect(result).toHaveLength(quantities.length);
    for (const [materialId, expectedQuantity] of quantities) {
      expect(result.find((item) => item.materialId === materialId)).toMatchObject({
        requiredQuantity: expectedQuantity,
        plannedQuantity: expectedQuantity,
        issueQuantity: expectedQuantity,
        shortageQuantity: 0,
        grossRequiredQuantity: expectedQuantity,
        stockQuantity: 2.4,
        availableQuantity: 1.2,
      });
    }
  });
});
