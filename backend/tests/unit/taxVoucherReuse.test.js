jest.mock('../../src/config/db', () => ({pool:{getConnection:jest.fn()}}));
jest.mock('../../src/utils/logger', () => ({logger:{info:jest.fn(),warn:jest.fn(),error:jest.fn()}}));
jest.mock('../../src/models/finance', () => ({createEntry:jest.fn()}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({tryAutoLink:jest.fn()}));
jest.mock('../../src/config/accountingConfig', () => ({accountingConfig:{loadFromDatabase:jest.fn(),getAccountCode:jest.fn()}}));

const TaxAccountingService=require('../../src/services/business/TaxAccountingService');
const finance=require('../../src/models/finance');
const links=require('../../src/services/business/DocumentLinkService');

describe('tax certification reuses VAT already posted by business vouchers',()=>{
  let connection;
  beforeEach(()=>{jest.clearAllMocks();connection={execute:jest.fn(),commit:jest.fn(),rollback:jest.fn(),release:jest.fn()};});
  afterEach(()=>jest.restoreAllMocks());
  test.each([
    ['销项','sales_outbound','generateOutputTaxEntry'],
    ['进项','purchase_receipt','generateInputTaxEntry'],
  ])('%s certification links existing VAT without posting it again',async(type,source,method)=>{
    connection.execute.mockResolvedValueOnce([[{id:10,entry_number:'GL10',invoice_tax:13,posted_tax:13,linked_tax:13}]])
      .mockResolvedValue([{affectedRows:1}]);
    jest.spyOn(TaxAccountingService,'resolveTaxAccountId').mockResolvedValue(20);
    jest.spyOn(TaxAccountingService,'generateEntryNumber').mockResolvedValue('VAT');
    jest.spyOn(TaxAccountingService,'getCurrentPeriodId').mockResolvedValue(1);
    const result=await TaxAccountingService[method]({id:3,invoice_type:type,invoice_date:'2026-09-16',invoice_number:'TAX3',related_document_type:source,related_document_id:5,amount_excluding_tax:100,tax_amount:13,total_amount:113},8,connection);
    expect(result).toMatchObject({entryId:10,reused:true,sharedBusinessVoucher:true});
    expect(finance.createEntry).not.toHaveBeenCalled();
    expect(links.tryAutoLink).toHaveBeenCalledWith('tax_invoice',3,'TAX3','finance_voucher',10,'GL10',8,connection);
    expect(connection.commit).not.toHaveBeenCalled();
  });
  test('merged voucher is reused only when its VAT equals all linked invoices',async()=>{
    connection.execute.mockResolvedValueOnce([[{id:11,entry_number:'MERGED',invoice_tax:13,posted_tax:39,linked_tax:39}]]).mockResolvedValue([{affectedRows:1}]);
    const invoice={id:1,invoice_type:'销项',related_document_type:'sales_outbound',related_document_id:2};
    await expect(TaxAccountingService.reuseLinkedTaxVoucher(connection,invoice,20,{taxAmount:13},8)).resolves.toMatchObject({entryId:11,reused:true});
  });
  test('a voucher missing VAT cannot masquerade as existing tax evidence',async()=>{
    connection.execute.mockResolvedValue([[{id:11,entry_number:'NO-VAT',invoice_tax:13,posted_tax:0,linked_tax:13}]]);
    await expect(TaxAccountingService.reuseLinkedTaxVoucher(connection,{id:1,invoice_type:'进项',related_document_type:'purchase_receipt',related_document_id:2},20,{taxAmount:13},8)).resolves.toBeNull();
    expect(links.tryAutoLink).not.toHaveBeenCalled();
  });
});
