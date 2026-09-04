/* global beforeEach, describe, expect, jest, test */

const mockProductionInboundService = {
  createDraftFromIncomingInspection: jest.fn(),
};
const mockPurchaseOrderStatusService = {
  handleInspectionComplete: jest.fn(),
};
const mockPurchaseReceiptService = {
  autoCreateFromInspection: jest.fn(),
};
const mockNonconformingProductService = {
  autoCreateFromInspection: jest.fn(),
};

jest.mock('../../src/config/db', () => ({
  pool: {
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/services/business/InspectionTemplateResolverService', () => ({
  getInspectionMaterialId: jest.fn(() => null),
  findMatchingTemplate: jest.fn(async () => null),
  getTemplateItems: jest.fn(async () => []),
  createValidationError: jest.fn((message) => {
    const error = new Error(message);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    return error;
  }),
}));

jest.mock(
  '../../src/services/business/ProductionInboundService',
  () => mockProductionInboundService
);
jest.mock(
  '../../src/services/business/PurchaseOrderStatusService',
  () => mockPurchaseOrderStatusService
);
jest.mock('../../src/services/quality/PurchaseReceiptService', () => mockPurchaseReceiptService);
jest.mock(
  '../../src/services/business/NonconformingProductService',
  () => mockNonconformingProductService
);

const QualityInspection = require('../../src/models/qualityInspection');
const db = require('../../src/config/db');
const InspectionClosureService = require('../../src/services/quality/InspectionClosureService');
const {
  INSPECTION_SOURCE_TYPES,
  normalizeInspectionSourceType,
  resolveInspectionSourceType,
} = require('../../src/utils/quality/inspectionSource');

const buildInspectionPayload = (overrides = {}) => ({
  inspection_no: 'QI202609040099',
  inspection_type: 'incoming',
  reference_id: 13,
  reference_no: 'WWRK260903001',
  batch_no: 'OSP-WWRK260903001-1',
  quantity: 1,
  qualified_quantity: 1,
  unqualified_quantity: 0,
  unit: '个',
  planned_date: '2026-09-04',
  inspector_id: 8,
  inspector_name: 'GXX',
  status: 'passed',
  items: [
    {
      item_name: '外观',
      standard: '无明显缺陷',
      type: 'visual',
      result: 'passed',
    },
  ],
  ...overrides,
});

const createInsertConnection = () => ({
  query: jest.fn(async (sql) => {
    if (String(sql).includes('INSERT INTO quality_inspections')) {
      return [{ insertId: 24 }];
    }
    if (String(sql).includes('INSERT INTO quality_inspection_items')) {
      return [{ insertId: 2401 }];
    }
    throw new Error(`Unexpected query: ${String(sql)}`);
  }),
});

describe('quality inspection source routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProductionInboundService.createDraftFromIncomingInspection.mockResolvedValue({
      created: true,
    });
    mockPurchaseOrderStatusService.handleInspectionComplete.mockResolvedValue(undefined);
    mockPurchaseReceiptService.autoCreateFromInspection.mockResolvedValue({
      receiptId: 91,
      receiptNo: 'PR202609040001',
    });
    mockNonconformingProductService.autoCreateFromInspection.mockResolvedValue(undefined);
  });

  test('persists outsourced_receipt when creating an outsourced incoming inspection', async () => {
    const connection = createInsertConnection();

    const result = await QualityInspection.createInspection(
      buildInspectionPayload({ source_type: 'outsourced_receipt' }),
      connection
    );

    const insertCall = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO quality_inspections')
    );
    expect(insertCall[0]).toContain('source_type');
    expect(insertCall[1][2]).toBe(INSPECTION_SOURCE_TYPES.OUTSOURCED_RECEIPT);
    expect(result.source_type).toBe(INSPECTION_SOURCE_TYPES.OUTSOURCED_RECEIPT);
    expect(mockProductionInboundService.createDraftFromIncomingInspection).not.toHaveBeenCalled();
  });

  test('defaults ordinary incoming inspections to purchase_order and keeps purchase inbound behavior', async () => {
    const connection = createInsertConnection();
    const payload = buildInspectionPayload({
      source_type: undefined,
      reference_id: 56202,
      reference_no: 'PO202609040001',
    });

    const result = await QualityInspection.createInspection(payload, connection);

    const insertCall = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO quality_inspections')
    );
    expect(insertCall[1][2]).toBe(INSPECTION_SOURCE_TYPES.PURCHASE_ORDER);
    expect(result.source_type).toBe(INSPECTION_SOURCE_TYPES.PURCHASE_ORDER);
    expect(mockProductionInboundService.createDraftFromIncomingInspection).toHaveBeenCalledTimes(1);
  });

  test('does not create a purchase inventory draft when updating an outsourced inspection', async () => {
    const currentInspection = buildInspectionPayload({
      id: 24,
      source_type: 'outsourced_receipt',
      status: 'pending',
    });
    delete currentInspection.items;

    const connection = {
      query: jest.fn(async (sql) => {
        if (String(sql).includes('FROM quality_inspections')) {
          return [[currentInspection]];
        }
        throw new Error(`Unexpected query: ${String(sql)}`);
      }),
      execute: jest.fn(async (sql) => {
        if (String(sql).includes('INSERT INTO quality_inspection_items')) {
          return [{ insertId: 2402 }];
        }
        return [{ affectedRows: 1 }];
      }),
    };

    await QualityInspection.updateInspection(
      24,
      {
        status: 'passed',
        qualified_quantity: 1,
        unqualified_quantity: 0,
        items: buildInspectionPayload().items,
      },
      connection
    );

    expect(mockProductionInboundService.createDraftFromIncomingInspection).not.toHaveBeenCalled();
  });

  test('reconciles explicitly submitted inspection attachments without accepting foreign files', async () => {
    const currentInspection = buildInspectionPayload({
      id: 24,
      source_type: 'purchase_order',
      status: 'pending',
    });
    delete currentInspection.items;

    const connection = {
      query: jest.fn(async (sql) => {
        if (String(sql).includes('FROM quality_inspections')) return [[currentInspection]];
        throw new Error(`Unexpected query: ${String(sql)}`);
      }),
      execute: jest.fn(async (sql) => {
        if (String(sql).includes('SELECT id, file_url')) {
          return [[
            { id: 11, file_url: '/uploads/attachments/keep.jpg' },
            { id: 12, file_url: '/uploads/attachments/remove.jpg' },
          ]];
        }
        return [{ affectedRows: 1 }];
      }),
    };

    await QualityInspection.updateInspection(
      24,
      { attachments: [{ url: '/uploads/attachments/keep.jpg' }] },
      connection
    );

    const cleanupCall = connection.execute.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE file_access_records')
    );
    expect(cleanupCall).toBeTruthy();
    expect(cleanupCall[1]).toEqual([12, 24]);
  });

  test('rejects an attachment that is not already authorized for the inspection', async () => {
    const currentInspection = buildInspectionPayload({
      id: 24,
      source_type: 'purchase_order',
      status: 'pending',
    });
    delete currentInspection.items;

    const connection = {
      query: jest.fn(async (sql) => {
        if (String(sql).includes('FROM quality_inspections')) return [[currentInspection]];
        throw new Error(`Unexpected query: ${String(sql)}`);
      }),
      execute: jest.fn(async (sql) => {
        if (String(sql).includes('SELECT id, file_url')) {
          return [[{ id: 11, file_url: '/uploads/attachments/keep.jpg' }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };

    await expect(
      QualityInspection.updateInspection(
        24,
        { attachments: ['/uploads/attachments/foreign.pdf'] },
        connection
      )
    ).rejects.toThrow('检验附件未通过当前检验单授权校验');
  });

  test('soft-deletes quality attachment access records when deleting an inspection', async () => {
    const connection = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      execute: jest.fn(async (sql) => {
        if (String(sql).includes('SELECT id, status FROM quality_inspections')) {
          return [[{ id: 24, status: 'pending' }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    db.pool.getConnection.mockResolvedValue(connection);

    await expect(QualityInspection.deleteInspection(24)).resolves.toBe(true);

    const cleanupCall = connection.execute.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE file_access_records')
    );
    expect(cleanupCall).toBeTruthy();
    expect(cleanupCall[1]).toEqual([24]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  test('infers and persists a historical outsourced source from its receipt number', async () => {
    const connection = {
      query: jest
        .fn()
        .mockResolvedValueOnce([[{ id: 13 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const inspection = buildInspectionPayload({
      id: 24,
      source_type: null,
      status: 'pending',
    });

    const sourceType = await resolveInspectionSourceType(connection, inspection, {
      persist: true,
    });

    expect(sourceType).toBe(INSPECTION_SOURCE_TYPES.OUTSOURCED_RECEIPT);
    expect(connection.query.mock.calls[0][0]).toContain('outsourced_processing_receipts');
    expect(connection.query.mock.calls[1][0]).toContain('SET source_type = ?');
    expect(connection.query.mock.calls[1][1]).toEqual(['outsourced_receipt', 24]);
  });

  test('closure skips purchase order and purchase receipt services for a historical outsourced inspection', async () => {
    const connection = {
      query: jest
        .fn()
        .mockResolvedValueOnce([[{ id: 13 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    const result = await InspectionClosureService.closeIfTerminal(
      buildInspectionPayload({ id: 24, source_type: null, status: 'pending' }),
      {
        id: 24,
        status: 'passed',
        qualified_quantity: 1,
        unqualified_quantity: 0,
      },
      connection
    );

    expect(result).toEqual({});
    expect(mockPurchaseOrderStatusService.handleInspectionComplete).not.toHaveBeenCalled();
    expect(mockPurchaseReceiptService.autoCreateFromInspection).not.toHaveBeenCalled();
  });

  test('rejects an unknown explicit incoming source type', () => {
    expect(() => normalizeInspectionSourceType('incoming', 'mystery_source')).toThrow(
      '不支持的来料检验来源'
    );
  });
});
