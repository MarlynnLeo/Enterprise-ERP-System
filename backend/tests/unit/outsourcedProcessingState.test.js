const {
  PROCESSING_STATUS_TRANSITIONS,
} = require('../../src/controllers/outsourced/processingController');

describe('outsourced processing state machine', () => {
  test('does not allow a confirmed processing order to be completed manually', () => {
    expect(PROCESSING_STATUS_TRANSITIONS.confirmed.has('completed')).toBe(false);
  });

  test('keeps confirmation and cancellation as explicit user transitions', () => {
    expect(PROCESSING_STATUS_TRANSITIONS.pending.has('confirmed')).toBe(true);
    expect(PROCESSING_STATUS_TRANSITIONS.pending.has('cancelled')).toBe(true);
    expect(PROCESSING_STATUS_TRANSITIONS.confirmed.has('cancelled')).toBe(true);
  });
});
