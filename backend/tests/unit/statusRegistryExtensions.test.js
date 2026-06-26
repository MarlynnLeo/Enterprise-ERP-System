/**
 * statusRegistry ECN/Performance 扩展测试
 * @description 验证新增的 ECN 和绩效评估状态定义的完整性和正确性
 */

const {
  STATUS_REGISTRY,
  ECN_STATUS,
  ECN_TRANSITIONS,
  PERFORMANCE_EVALUATION_STATUS,
  PERFORMANCE_EVALUATION_TRANSITIONS,
  PERFORMANCE_PERIOD_STATUS,
  getStatusValues,
  getAllowedTransitions,
  isKnownStatus,
  isTerminalStatus,
  isValidTransition,
  normalizeStatus,
} = require('../../src/constants/statusRegistry');

describe('ECN status registry', () => {
  test('ECN_STATUS contains all expected values', () => {
    expect(ECN_STATUS.DRAFT).toBe('draft');
    expect(ECN_STATUS.SUBMITTED).toBe('submitted');
    expect(ECN_STATUS.APPROVED).toBe('approved');
    expect(ECN_STATUS.REJECTED).toBe('rejected');
    expect(ECN_STATUS.CANCELLED).toBe('cancelled');
  });

  test('ECN domain is registered', () => {
    expect(STATUS_REGISTRY.ecn).toBeTruthy();
    expect(STATUS_REGISTRY.ecn.table).toBe('ecn_orders');
  });

  test('ECN transitions are valid', () => {
    const values = getStatusValues('ecn');
    expect(values).toContain('draft');
    expect(values).toContain('submitted');
    expect(values).toContain('approved');

    // draft -> submitted is valid
    expect(isValidTransition('ecn', 'draft', 'submitted')).toBe(true);
    // submitted -> approved is valid
    expect(isValidTransition('ecn', 'submitted', 'approved')).toBe(true);
    // approved is terminal
    expect(isTerminalStatus('ecn', 'approved')).toBe(true);
    expect(isTerminalStatus('ecn', 'cancelled')).toBe(true);
    // rejected can go back to draft
    expect(isValidTransition('ecn', 'rejected', 'draft')).toBe(true);
    // invalid transition
    expect(isValidTransition('ecn', 'approved', 'draft')).toBe(false);
  });

  test('ECN transitions have no dangling states', () => {
    for (const from of Object.keys(ECN_TRANSITIONS)) {
      expect(isKnownStatus('ecn', from)).toBe(true);
      for (const to of getAllowedTransitions('ecn', from)) {
        expect(isKnownStatus('ecn', to)).toBe(true);
      }
    }
  });
});

describe('Performance evaluation status registry', () => {
  test('PERFORMANCE_EVALUATION_STATUS contains all expected values', () => {
    expect(PERFORMANCE_EVALUATION_STATUS.DRAFT).toBe('draft');
    expect(PERFORMANCE_EVALUATION_STATUS.SELF_EVALUATION).toBe('self_evaluation');
    expect(PERFORMANCE_EVALUATION_STATUS.MANAGER_REVIEW).toBe('manager_review');
    expect(PERFORMANCE_EVALUATION_STATUS.COMPLETED).toBe('completed');
  });

  test('performanceEvaluation domain is registered', () => {
    expect(STATUS_REGISTRY.performanceEvaluation).toBeTruthy();
    expect(STATUS_REGISTRY.performanceEvaluation.table).toBe('performance_evaluations');
  });

  test('Performance evaluation transitions follow expected flow', () => {
    expect(isValidTransition('performanceEvaluation', 'draft', 'self_evaluation')).toBe(true);
    expect(isValidTransition('performanceEvaluation', 'self_evaluation', 'manager_review')).toBe(true);
    expect(isValidTransition('performanceEvaluation', 'manager_review', 'completed')).toBe(true);
    expect(isTerminalStatus('performanceEvaluation', 'completed')).toBe(true);
    // Skip states is not allowed
    expect(isValidTransition('performanceEvaluation', 'draft', 'completed')).toBe(false);
  });

  test('PERFORMANCE_PERIOD_STATUS contains expected values', () => {
    expect(PERFORMANCE_PERIOD_STATUS.DRAFT).toBe('draft');
    expect(PERFORMANCE_PERIOD_STATUS.ACTIVE).toBe('active');
    expect(PERFORMANCE_PERIOD_STATUS.CLOSED).toBe('closed');
  });
});

describe('normalizeStatus for new domains', () => {
  test('ECN normalizeStatus returns raw status when no alias', () => {
    expect(normalizeStatus('ecn', 'draft')).toBe('draft');
    expect(normalizeStatus('ecn', 'submitted')).toBe('submitted');
    expect(normalizeStatus('ecn', 'unknown')).toBe('unknown');
  });

  test('performanceEvaluation normalizeStatus returns raw status', () => {
    expect(normalizeStatus('performanceEvaluation', 'draft')).toBe('draft');
  });
});
