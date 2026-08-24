const {
  PROCESSING_STATUS_TRANSITIONS,
  RECEIPT_STATUS_TRANSITIONS,
  classifyStatusUpdateError,
} = require('../../src/controllers/outsourced/processingController');
const {
  getStatusValues,
  isValidTransition,
} = require('../../src/constants/statusRegistry');

describe('outsourced processing state machine', () => {
  test('does not allow a confirmed processing order to be completed manually', () => {
    expect(PROCESSING_STATUS_TRANSITIONS.confirmed.has('completed')).toBe(false);
  });

  test('keeps confirmation and cancellation as explicit user transitions', () => {
    expect(PROCESSING_STATUS_TRANSITIONS.pending.has('confirmed')).toBe(true);
    expect(PROCESSING_STATUS_TRANSITIONS.pending.has('cancelled')).toBe(true);
    expect(PROCESSING_STATUS_TRANSITIONS.confirmed.has('cancelled')).toBe(true);
  });

  test('defines the complete outsourced processing lifecycle in the status registry', () => {
    expect(getStatusValues('outsourcedProcessing')).toEqual(
      expect.arrayContaining(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'])
    );
    expect(isValidTransition('outsourcedProcessing', 'confirmed', 'in_progress')).toBe(true);
    expect(PROCESSING_STATUS_TRANSITIONS.confirmed.has('in_progress')).toBe(true);
    expect(PROCESSING_STATUS_TRANSITIONS.in_progress.has('cancelled')).toBe(true);
  });

  test('keeps receipt transitions aligned with the registry', () => {
    expect(RECEIPT_STATUS_TRANSITIONS.pending.has('confirmed')).toBe(true);
    expect(isValidTransition('outsourcedReceipt', 'confirmed', 'completed')).toBe(true);
  });

  test('returns an actionable business response for insufficient stock', () => {
    expect(classifyStatusUpdateError(new Error('库存不足: 当前库存 0, 需要 1'), '更新失败')).toEqual({
      message: '库存不足: 当前库存 0, 需要 1',
      errorCode: 'INSUFFICIENT_STOCK',
      statusCode: 400,
    });
  });
});
