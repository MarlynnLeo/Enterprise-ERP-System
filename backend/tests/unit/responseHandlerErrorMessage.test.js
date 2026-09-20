/* global describe, expect, test */

const { normalizeResponseErrorMessage } = require('../../src/utils/responseHandler');
const { ResponseHandler } = require('../../src/utils/responseHandler');

describe('统一错误提示脱敏', () => {
  test.each([
    ['生产任务不存在: 17238', '生产任务不存在'],
    ['采购订单 1024 不存在', '采购订单不存在'],
    ['检验单 88 不存在，无法创建采购入库单', '检验单不存在，无法创建采购入库单'],
    ['采购入库单 77 没有明细，不能完成入库', '采购入库单没有明细，不能完成入库'],
    ['银行账户ID 9 不存在', '银行账户不存在'],
    ['BOM ID 6 中没有物料明细，不能生成生产计划物料需求', 'BOM中没有物料明细，不能生成生产计划物料需求'],
  ])('不向用户返回内部 ID：%s', (message, expected) => {
    expect(normalizeResponseErrorMessage(message, 'VALIDATION_ERROR', 400)).toBe(expected);
  });

  test('物料失效提示保留物料编码', () => {
    expect(normalizeResponseErrorMessage(
      '申请单中的物料编码“3006004012_del_17238”已不存在或已停用，请编辑申请单后重新选择有效物料。',
      'VALIDATION_ERROR',
      400
    )).toBe('申请单中的物料编码“3006004012_del_17238”已不存在或已停用，请编辑申请单后重新选择有效物料。');
  });

  test.each([
    ['无效的资产ID', '请选择有效的资产'],
    ['客户ID不能为空', '请选择客户'],
    ['生产任务ID无效或超过批量上限(100)', '请选择有效的生产任务，且一次最多处理100条'],
    ['更新失败: Invalid SQL column', '提交内容有误，请检查后重试'],
    ['No permission to change this purchase order', '您没有权限执行此操作'],
  ])('统一转换技术字段或英文异常：%s', (message, expected) => {
    expect(normalizeResponseErrorMessage(message, 'VALIDATION_ERROR', 400)).toBe(expected);
  });

  test('成功响应中的批量失败明细也不返回英文或内部 ID', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    ResponseHandler.success(response, {
      failures: [{ id: 17238, message: 'purchase order 17238 not found' }],
      errorList: [{ error: '无效的资产ID' }],
    });
    const payload = response.json.mock.calls[0][0];
    expect(payload.data.failures[0].message).toBe('采购订单不存在或已被删除');
    expect(payload.data.errorList[0].error).toBe('请选择有效的资产');
  });

  test('成功响应中的字符串错误列表也统一转换为中文', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    ResponseHandler.success(response, {
      errors: [
        'purchase order 17238 not found',
        'Invalid request path',
        '生产任务不存在: 17238',
      ],
    });
    const payload = response.json.mock.calls[0][0];
    expect(payload.data.errors).toEqual([
      '采购订单不存在或已被删除',
      '请求路径无效，请检查后重试',
      '生产任务不存在',
    ]);
  });

  test('不会把普通 results/checks 字符串误判为错误明细', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    ResponseHandler.success(response, {
      results: ['操作成功', '库存已更新'],
      checks: ['数量校验通过'],
    });
    const payload = response.json.mock.calls[0][0];
    expect(payload.data.results).toEqual(['操作成功', '库存已更新']);
    expect(payload.data.checks).toEqual(['数量校验通过']);
  });

  test('带操作上下文的旧采购申请错误也不回显数字 ID', () => {
    expect(normalizeResponseErrorMessage(
      '更新状态失败：请购物料不存在或已停用：17238',
      'VALIDATION_ERROR',
      400
    )).toBe('更新状态失败：申请单中的失效物料已不存在或已停用，请编辑申请单后重新选择有效物料。');
  });

  test('业务单号属于用户可识别信息，应保留在提示中', () => {
    expect(normalizeResponseErrorMessage(
      '该委外加工单已有待处理入库单 WWRK260825005，请直接编辑该单据',
      'VALIDATION_ERROR',
      400
    )).toBe('该委外加工单已有待处理入库单 WWRK260825005，请直接编辑该单据');
  });
});
