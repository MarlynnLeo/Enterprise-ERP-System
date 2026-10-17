const { assertAccountCanBeDeactivated } = require('../../src/models/finance/helpers');
const financeController = require('../../src/controllers/business/finance/financeController');
const financeModel = require('../../src/models/finance');
const BusinessError = require('../../src/utils/BusinessError');

describe('会计科目状态更新与停用校验', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('assertAccountCanBeDeactivated 当存在期初余额时抛出 BusinessError (400) 并指出期初余额金额', async () => {
    const fakeConnection = {
      execute: jest.fn().mockResolvedValue([
        [{ opening_amount: 159.27, entry_line_count: 0 }],
      ]),
    };

    await expect(assertAccountCanBeDeactivated(fakeConnection, 2987)).rejects.toThrow(
      '该科目存在期初余额（159.27），无法禁用；如需禁用请先在“期初余额”中清零'
    );

    try {
      await assertAccountCanBeDeactivated(fakeConnection, 2987);
    } catch (err) {
      expect(err).toBeInstanceOf(BusinessError);
      expect(err.httpStatus).toBe(400);
      expect(err.errorCode).toBe('ACCOUNT_HAS_ACTIVITY');
    }
  });

  test('assertAccountCanBeDeactivated 当存在分录历史时抛出 BusinessError (400) 并指出凭证笔数', async () => {
    const fakeConnection = {
      execute: jest.fn().mockResolvedValue([
        [{ opening_amount: 0, entry_line_count: 5 }],
      ]),
    };

    await expect(assertAccountCanBeDeactivated(fakeConnection, 1001)).rejects.toThrow(
      '该科目已有凭证记录（5笔），无法禁用'
    );
  });

  test('assertAccountCanBeDeactivated 无余额和分录时正常通过', async () => {
    const fakeConnection = {
      execute: jest.fn().mockResolvedValue([
        [{ opening_amount: 0, entry_line_count: 0 }],
      ]),
    };

    await expect(assertAccountCanBeDeactivated(fakeConnection, 9999)).resolves.toBeUndefined();
  });

  test('toggleAccountStatus 遇到 BusinessError 时返回 HTTP 400 与具体业务原因', async () => {
    jest.spyOn(financeModel, 'getAccountById').mockResolvedValue({
      id: 2987,
      account_code: '100201',
      account_name: '工行资本金账户',
      is_active: 1,
    });

    jest.spyOn(financeModel, 'updateAccountStatus').mockRejectedValue(
      new BusinessError('存在期初余额或凭证历史的科目不能停用', null, 'ACCOUNT_HAS_ACTIVITY', 400)
    );

    const req = {
      params: { id: '2987' },
      body: { is_active: false },
    };

    const res = {
      statusCode: null,
      responseData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.responseData = data;
        return this;
      },
    };

    await financeController.toggleAccountStatus(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.responseData.success).toBe(false);
    expect(res.responseData.message).toBe('存在期初余额或凭证历史的科目不能停用');
    expect(res.responseData.code).toBe('ACCOUNT_HAS_ACTIVITY');
  });

  test('createAccount 当父级科目已停用时抛出 BusinessError (400)', async () => {
    const db = require('../../src/config/db');
    jest.spyOn(db.pool, 'execute').mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, is_active FROM gl_accounts WHERE id = ?')) {
        return [[{ id: 100, is_active: 0 }]];
      }
      return [[]];
    });

    const accountsModel = require('../../src/models/finance/accounts');
    await expect(
      accountsModel.createAccount({
        account_code: '100101',
        account_name: '库存现金子科目',
        account_type: '资产',
        parent_id: 100,
        is_debit: 1,
      })
    ).rejects.toThrow('所选父级会计科目已停用，不能在其下添加子科目');
  });
});
