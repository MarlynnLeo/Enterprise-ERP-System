jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/business/hr/salaryService', () => ({}));
jest.mock('../../src/services/business/hr/dingtalkSyncService', () => ({}));
jest.mock('../../src/utils/responseHandler', () => ({ ResponseHandler: {
  success: (res, data) => Object.assign(res, { status: 200, data }),
  error: (res, message, code, status) => Object.assign(res, { status, message, code }),
} }));
const ExcelJS = require('exceljs');
const { pool } = require('../../src/config/db');
const controller = require('../../src/controllers/business/hr/hrController');

let connection;
beforeEach(() => {
  connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn(async () => [{ affectedRows: 1 }]) };
  pool.getConnection.mockReset().mockResolvedValue(connection);
  pool.query.mockReset().mockResolvedValue([[{ id: 10, name: '张三', employee_no: 'E001' }, { id: 20, name: '张三', employee_no: 'E002' }]]);
});
async function upload(headers, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('月度考勤');
  sheet.addRow(headers); rows.forEach(row => sheet.addRow(row));
  const res = {};
  await controller.importAttendanceExcel({ file: { buffer: await workbook.xlsx.writeBuffer() }, body: { period: '2026-09' } }, res);
  return res;
}

test('distinct employee numbers preserve both employees even with identical names', async () => {
  const result = await upload(['工号', '姓名', '正常加班'], [['E001', '张三', 2], ['E002', '张三', 8]]);
  expect(result.status).toBe(200);
  expect(connection.query.mock.calls.map(([, params]) => [params[0], params[19]])).toEqual([[10, 2], [20, 8]]);
  expect(connection.commit).toHaveBeenCalledTimes(1);
});

test('specific overtime and absent headers retain all hours and separate day counts', async () => {
  const result = await upload(['工号', '姓名', '在职天数', '不在职天数', '正常加班', '周六加班', '周末加班'], [['E001', '张三', 20, 10, 2, 4, 6]]);
  expect(result.status).toBe(200);
  const values = connection.query.mock.calls[0][1];
  expect([values[3], values[4], values[13], values[14], values[15], values[19]]).toEqual([20, 10, 2, 4, 6, 12]);
});

test.each([
  [['姓名', '加班'], [['张三', 2]], '重名'],
  [['工号', '姓名'], [['MISSING', '张三']], '不存在'],
  [['工号', '姓名'], [['E001', '李四']], '不一致'],
  [['工号', '姓名'], [['E001', '张三'], ['E001', '张三']], '重复导入'],
  [['工号', '加班', '正常加班'], [['E001', 2, 3]], '重复'],
])('rejects ambiguous input before any write: %s', async (headers, rows, message) => {
  const result = await upload(headers, rows);
  expect(result.status).toBe(400);
  expect(result.message).toContain(message);
  expect(pool.getConnection).not.toHaveBeenCalled();
});

test('supports an employee-number-only sheet', async () => {
  const result = await upload(['工号', '加班'], [['E001', 3]]);
  expect(result.status).toBe(200);
  expect(connection.query.mock.calls[0][1][0]).toBe(10);
});
