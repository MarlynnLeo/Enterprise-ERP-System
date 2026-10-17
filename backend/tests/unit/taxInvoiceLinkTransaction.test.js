jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/business/TaxAccountingService', () => ({}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ createLink: jest.fn(), deleteLinksByPair: jest.fn() }));
jest.mock('../../src/utils/responseHandler', () => ({ ResponseHandler: { success: jest.fn(), error: jest.fn() } }));
const db = require('../../src/config/db');
const links = require('../../src/services/business/DocumentLinkService');
const { ResponseHandler } = require('../../src/utils/responseHandler');
const controller = require('../../src/controllers/business/finance/taxController');

describe('tax identity HTTP boundaries', () => {
  let invoice;
  let connection;
  beforeEach(() => {
    jest.clearAllMocks();
    invoice = { id: 1, invoice_number: 'T1', invoice_type: '进项', status: '未认证', supplier_id: 3, related_document_type: 'ap_invoice', related_document_id: 8 };
    connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      execute: jest.fn(async (sql) => {
        if (sql.includes('FROM tax_invoices')) return [[invoice]];
        if (sql.includes('FROM ap_invoices')) return [[{ id: 9, supplier_id: 3 }]];
        return [{ affectedRows: 1 }];
      }),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    db.pool.execute.mockResolvedValue([[{ id: 9, document_number: 'AP9' }]]);
    links.createLink.mockReset();
  });

  test('forged source identity cannot be injected through manual tax creation', async () => {
    await controller.createTaxInvoice({ user: { id: 8 }, body: { relatedDocumentType: 'purchase_receipt', relatedDocumentId: 7 } }, {});
    expect(ResponseHandler.error).toHaveBeenCalledWith({}, expect.stringContaining('业务源单关联由系统生成'), 'VALIDATION_ERROR', 400);
    expect(db.pool.getConnection).not.toHaveBeenCalled();
    expect(db.pool.execute).not.toHaveBeenCalled();
  });

  test('source unlink refusal does not delete its relationship graph', async () => {
    invoice.related_document_type = 'purchase_receipt';
    await controller.unlinkTaxInvoice({ params: { id: '1' } }, {});
    expect(links.deleteLinksByPair).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(ResponseHandler.error).toHaveBeenCalled();
  });

  test('relationship graph failure rolls back invoice relinking with old graph deletion', async () => {
    links.createLink.mockRejectedValueOnce(new Error('graph failed'));
    await controller.linkTaxInvoice({ params: { id: '1' }, user: { id: 8 }, body: { documentType: 'ap_invoice', documentId: 9 } }, {});
    expect(links.deleteLinksByPair).toHaveBeenCalledWith(expect.objectContaining({ source_id: 8 }), connection);
    expect(links.createLink).toHaveBeenCalledWith(expect.objectContaining({ source_id: 9 }), connection);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
