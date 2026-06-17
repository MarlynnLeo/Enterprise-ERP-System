const { BUSINESS_CLOSURES } = require('../../src/constants/businessClosureRegistry');
const {
  STATUS_REGISTRY,
  getStatusValues,
  getAllowedTransitions,
  isKnownStatus,
  isTerminalStatus,
} = require('../../src/constants/statusRegistry');
const { consistencyRules } = require('../../src/services/business/DataConsistencyRules');
const { legacyCleanupCandidates } = require('../../src/services/business/LegacyCodeCleanupRules');

describe('business closure registry', () => {
  test('every closure has an ordered start-to-end proof path', () => {
    expect(Object.keys(BUSINESS_CLOSURES).length).toBeGreaterThanOrEqual(6);

    for (const [, closure] of Object.entries(BUSINESS_CLOSURES)) {
      expect(closure.name).toBeTruthy();
      expect(closure.start).toBeTruthy();
      expect(closure.end).toBeTruthy();
      expect(Array.isArray(closure.steps)).toBe(true);
      expect(closure.steps.length).toBeGreaterThan(2);
      expect(closure.steps[0].object).toBe(closure.start);
      expect(closure.steps[closure.steps.length - 1].object).toBe(closure.end);
      expect(Array.isArray(closure.invariants)).toBe(true);
      expect(closure.invariants.length).toBeGreaterThan(0);

      for (const step of closure.steps) {
        expect(step.object).toBeTruthy();
        expect(Array.isArray(step.requiredFields)).toBe(true);
        expect(step.requiredFields.length).toBeGreaterThan(0);
        if (step.statusDomain) {
          expect(STATUS_REGISTRY[step.statusDomain]).toBeTruthy();
        }
      }
    }
  });

  test('status registry has no dangling transitions and all terminal states are terminal', () => {
    for (const [domain, definition] of Object.entries(STATUS_REGISTRY)) {
      const values = getStatusValues(domain);
      expect(values.length).toBeGreaterThan(0);

      for (const from of Object.keys(definition.transitions)) {
        expect(isKnownStatus(domain, from)).toBe(true);
        for (const to of getAllowedTransitions(domain, from)) {
          expect(isKnownStatus(domain, to)).toBe(true);
        }
      }

      for (const terminal of definition.terminal) {
        expect(isKnownStatus(domain, terminal)).toBe(true);
        expect(isTerminalStatus(domain, terminal)).toBe(true);
        expect(getAllowedTransitions(domain, terminal)).toEqual([]);
      }
    }
  });

  test('each closure is protected by at least one data consistency rule', () => {
    const closureIds = Object.keys(BUSINESS_CLOSURES);
    const rulesByClosure = new Map();
    for (const rule of consistencyRules) {
      rulesByClosure.set(rule.closure, (rulesByClosure.get(rule.closure) || 0) + 1);
    }

    for (const closureId of closureIds) {
      expect(rulesByClosure.get(closureId)).toBeGreaterThan(0);
    }
  });

  test('data consistency rules are executable and uniquely identified', () => {
    const ids = new Set();
    for (const rule of consistencyRules) {
      expect(rule.id).toMatch(/^[a-z0-9_.-]+$/);
      expect(ids.has(rule.id)).toBe(false);
      ids.add(rule.id);
      expect(['critical', 'high', 'medium', 'low']).toContain(rule.severity);
      expect(BUSINESS_CLOSURES[rule.closure]).toBeTruthy();
      expect(rule.description).toBeTruthy();
      expect(rule.sql).toMatch(/SELECT/i);
    }
  });

  test('legacy cleanup candidates are explicit and reference replacements', () => {
    const paths = new Set();

    for (const candidate of legacyCleanupCandidates) {
      expect(candidate.path).toMatch(/^(backend|frontend|mobile)\//);
      expect(paths.has(candidate.path)).toBe(false);
      paths.add(candidate.path);
      expect(candidate.replacement).toBeTruthy();
      expect(candidate.reason).toBeTruthy();
    }
  });
});
