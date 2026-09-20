import { describe, expect, test } from 'vitest'
import { getApiErrorMessage } from '@/utils/errorHandler'

describe('getApiErrorMessage', () => {
  test('优先显示后端返回的中文提示', () => {
    expect(getApiErrorMessage({
      response: {
        status: 400,
        data: {
          message: '请购物料不存在或已停用：3006004012_del_17238',
          errorCode: 'VALIDATION_ERROR'
        }
      }
    })).toBe('申请单中的物料编码“3006004012_del_17238”已不存在或已停用，请编辑申请单后重新选择有效物料。')
  })

  test('后端只有错误代码时转换为中文提示', () => {
    expect(getApiErrorMessage({
      response: {
        status: 400,
        data: { errorCode: 'VALIDATION_ERROR' }
      }
    })).toBe('提交内容有误，请检查后重试')
  })

  test('历史采购申请错误只带物料编码时补充可执行提示', () => {
    expect(getApiErrorMessage({
      response: {
        status: 400,
        data: {
          message: '请购物料不存在或已停用：3006004012_del_17238',
          errorCode: 'VALIDATION_ERROR'
        }
      }
    })).toBe('申请单中的物料编码“3006004012_del_17238”已不存在或已停用，请编辑申请单后重新选择有效物料。')
  })

  test('英文业务异常转换为中文提示', () => {
    expect(getApiErrorMessage({
      response: {
        status: 404,
        data: { message: 'Version not found', errorCode: 'NOT_FOUND' }
      }
    })).toBe('成本版本不存在或已被删除')
  })

  test('不向用户展示技术错误代码', () => {
    expect(getApiErrorMessage({ code: 'ERR_NETWORK', message: 'ERR_NETWORK' }))
      .toBe('网络连接失败，请检查网络设置')
  })

  test('历史页面读取含内部 ID 的错误时只显示业务原因', () => {
    expect(getApiErrorMessage({ message: '生产任务不存在: 17238' }))
      .toBe('生产任务不存在')
  })

  test('旧采购申请只返回数字时不把内部 ID 当作物料编码', () => {
    expect(getApiErrorMessage({ message: '请购物料不存在或已停用：17238' }))
      .toBe('申请单中的失效物料已不存在或已停用，请编辑申请单后重新选择有效物料。')
  })

  test('旧页面拼接操作上下文时也不回显物料 ID', () => {
    expect(getApiErrorMessage({
      message: '更新状态失败：请购物料不存在或已停用：17238'
    })).toBe('更新状态失败：申请单中的失效物料已不存在或已停用，请编辑申请单后重新选择有效物料。')
  })

  test('业务单号属于用户可识别信息，应保留在提示中', () => {
    expect(getApiErrorMessage({
      message: '该委外加工单已有待处理入库单 WWRK260825005，请直接编辑该单据'
    })).toBe('该委外加工单已有待处理入库单 WWRK260825005，请直接编辑该单据')
  })
})
