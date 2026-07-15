/**
 * P0 回归：预留 active 过滤 + 取消释放 + 冲销财务补偿服务存在性
 */

jest.mock('../../src/config/db', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/services/cache/CacheManager', () => ({
  delete: jest.fn(),
  deleteByPrefix: jest.fn(),
}));

const InventoryService = require('../../src/services/InventoryService');
const { pool } = require('../../src/config/db');
const {
  INVENTORY_OUTBOUND_TRANSITIONS,
  isValidTransition,
} = require('../../src/constants/statusRegistry');

describe('P0 reservation + status registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getReservedQuantity 仅统计 active', async () => {
    pool.execute.mockResolvedValueOnce([[{ reserved: 12 }]]);
    const qty = await InventoryService.getReservedQuantity(1, 2);
    expect(qty).toBe(12);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringMatching(/status\s*=\s*'active'/i),
      [1, 2]
    );
  });

  test('库存出库 completed → reversed 在注册表合法', () => {
    expect(INVENTORY_OUTBOUND_TRANSITIONS.completed).toContain('reversed');
    expect(isValidTransition('inventoryOutbound', 'completed', 'reversed')).toBe(true);
  });

  test('销售出库 completed → reversed 在注册表合法', () => {
    expect(isValidTransition('salesOutbound', 'completed', 'reversed')).toBe(true);
  });
});

describe('SalesOutboundReversalService', () => {
  test('模块可加载', () => {
    const svc = require('../../src/services/business/SalesOutboundReversalService');
    expect(typeof svc.compensateFinance).toBe('function');
    expect(typeof svc.reverseCostEntries).toBe('function');
  });
});
