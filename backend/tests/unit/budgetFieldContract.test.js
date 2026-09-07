const {
  toBudgetApi, toBudgetDetailApi, fromBudgetApi, fromBudgetDetailApi,
} = require('../../src/utils/finance/glFieldMap');

describe('budget API descriptions and available amounts', () => {
  it('preserves budget and line descriptions on the write and read boundaries', () => {
    const budget = fromBudgetApi({ budgetName: 'Annual equipment', description: 'Main explanation' });
    const detail = fromBudgetDetailApi({ accountId: 4, budgetAmount: 100, description: 'Line explanation' });
    expect(budget.description).toBe('Main explanation');
    expect(detail.description).toBe('Line explanation');
    expect(toBudgetApi({ ...budget, details: [detail] })).toMatchObject({
      description: 'Main explanation', details: [{ description: 'Line explanation' }],
    });
  });

  it('returns the remaining balance and approver supplied by the budget model', () => {
    expect(toBudgetApi({
      total_amount: '100.00', used_amount: '35.00', remaining_amount: '65.00', approver_name: 'Finance reviewer',
    })).toMatchObject({ totalAmount: 100, usedAmount: 35, remainingAmount: 65, approverName: 'Finance reviewer' });
  });

  it('derives missing available amounts from total and used amounts including overspend', () => {
    expect(toBudgetApi({ totalAmount: 100, usedAmount: 120 }).remainingAmount).toBe(-20);
    expect(toBudgetDetailApi({ budgetAmount: 100, usedAmount: 25 }).remainingAmount).toBe(75);
  });

  it('keeps zero remaining amounts and explicitly cleared descriptions', () => {
    expect(toBudgetApi({ total_amount: 100, used_amount: 0, remaining_amount: 0 }).remainingAmount).toBe(0);
    expect(fromBudgetApi({ description: '' }).description).toBe('');
    expect(fromBudgetDetailApi({ description: '' }).description).toBe('');
  });

  it('preserves an explicitly cleared department instead of dropping it or using a legacy value', () => {
    expect(fromBudgetApi({ departmentId: null, department_id: 9 }).department_id).toBeNull();
    expect(fromBudgetDetailApi({ departmentId: null, department_id: 9 }).department_id).toBeNull();
  });
});
