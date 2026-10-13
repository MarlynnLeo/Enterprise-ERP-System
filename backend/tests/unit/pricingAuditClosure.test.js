jest.mock('../../src/config/db', () => ({ getConnection: jest.fn() }));
jest.mock('../../src/utils/dateUtils', () => ({ currentDateString: () => '2026-10-13' }));
jest.mock('../../src/services/AuditService', () => ({
  AuditService: { logFromRequest: jest.fn() },
  AuditAction: { UPDATE: 'update' },
  AuditModule: { PRICING: 'pricing' },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const db = require('../../src/config/db');
const controller = require('../../src/controllers/business/finance/pricingController');

const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

function pricingConnection({ cost = 10, sale = 20, adjustment = null } = {}) {
  const state = { price: sale, activePricingWrites: 0, effectiveDate: null };
  const connection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql, values = []) => {
      if (sql.includes('FROM user_pricing_settings')) return [[]];
      if (sql.startsWith('SELECT id FROM materials')) return [[{ id: 1 }]];
      if (sql.includes('SELECT MAX(version)')) return [[{ max_ver: 1 }]];
      if (sql.includes('UPDATE product_pricing')) {
        state.activePricingWrites += 1;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO product_pricing')) {
        state.effectiveDate = values[6];
        return [{ insertId: 2 }];
      }
      if (sql.includes('UPDATE materials SET price')) {
        state.price = values[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM bom_masters'))
        return [[{ id: 5, product_id: 1, version: 2, approved_by: 3 }]];
      if (sql.includes('FROM standard_costs') && !sql.includes('bom_details'))
        return [[{ standard_price: 0 }]];
      if (sql.includes('FROM bom_details')) {
        if (sql.includes('as current_price')) {
          // The old query asked the DB for sales price. Model the distinct fields
          // to exercise the cost-vs-sales case through the actual response path.
          const current = /m\.price as current_price/i.test(sql) ? sale : cost;
          return [
            [
              {
                id: 9,
                material_id: 42,
                quantity: 2,
                current_price: current,
                purchase_price: 10,
                sale_price: sale,
              },
            ],
          ];
        }
        return [[{ quantity: 2, unit_price: cost }]];
      }
      if (sql.includes('FROM bom_material_price_adjustments')) {
        return [
          adjustment === null ? [] : [{ material_id: 42, adjusted_price: adjustment, version: 1 }],
        ];
      }
      if (sql.includes('SELECT cost_price, created_at FROM product_pricing'))
        return [[{ cost_price: cost * 2 }]];
      throw new Error(`Unexpected pricing query: ${sql}`);
    }),
  };
  db.getConnection.mockResolvedValue(connection);
  return { state, connection };
}

beforeEach(() => jest.clearAllMocks());

test.each(['2026-11-01', '2026-02-30', 'not-a-date'])(
  'invalid or future pricing date %s cannot change current price',
  async (effectiveDate) => {
    const { state, connection } = pricingConnection();
    const res = response();
    await controller.createPricing(
      {
        user: { id: 42 },
        body: {
          productId: 1,
          costPrice: 10,
          suggestedPrice: 30,
          profitMargin: 66.67,
          effectiveDate,
        },
      },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(connection.query).not.toHaveBeenCalled();
    expect(state.price).toBe(20);
    expect(state.activePricingWrites).toBe(0);
  }
);

test.each(['2026-10-13', '2026-10-12', undefined])(
  'pricing effective %s updates the current material under its row lock',
  async (effectiveDate) => {
    const { state, connection } = pricingConnection();
    const res = response();
    await controller.createPricing(
      {
        user: { id: 42 },
        body: {
          productId: 1,
          costPrice: 10,
          suggestedPrice: 30,
          profitMargin: 66.67,
          effectiveDate,
        },
      },
      res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(state.price).toBe(30);
    expect(state.effectiveDate).toBe(effectiveDate || '2026-10-13');
    expect(connection.query).toHaveBeenCalledWith(
      'SELECT id FROM materials WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [1]
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
  }
);

test.each([10, 8])(
  'BOM calculation and preview agree for component cost %s and selling price 20',
  async (cost) => {
    const { connection } = pricingConnection({ cost });
    const calculated = response();
    const preview = response();
    const req = { params: { productId: '1' } };
    await controller.calculateBomCost(req, calculated);
    await controller.getBomDetails(req, preview);
    const calculatedData = calculated.json.mock.calls[0][0].data;
    const previewData = preview.json.mock.calls[0][0].data;
    expect(calculatedData.cost).toBe(cost * 2);
    expect(previewData.totalCost).toBe(calculatedData.cost);
    expect(previewData.costVariance).toBe(0);
    expect(previewData.details[0]).toMatchObject({
      originalPrice: cost,
      effectivePrice: cost,
      salePrice: 20,
    });
    const previewSql = connection.query.mock.calls.find(([sql]) =>
      sql.includes('as current_price')
    )[0];
    expect(previewSql).toMatch(/FROM standard_costs/);
    expect(previewSql).toMatch(/effective_date <= CURDATE\(\)/);
    expect(previewSql).toMatch(/expiry_date > CURDATE\(\)/);
    expect(previewSql).toMatch(/m\.cost_price, m\.price, 0/);
  }
);

test('an explicit BOM price adjustment overrides the cost without replacing its baseline', async () => {
  pricingConnection({ cost: 10, adjustment: 12 });
  const res = response();
  await controller.getBomDetails({ params: { productId: '1' } }, res);
  const data = res.json.mock.calls[0][0].data;
  expect(data.totalCost).toBe(24);
  expect(data.details[0]).toMatchObject({
    originalPrice: 10,
    adjustedPrice: 12,
    effectivePrice: 12,
    hasAdjustment: true,
  });
});
