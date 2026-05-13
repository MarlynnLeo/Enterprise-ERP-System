function budgetDepartmentExpression(budgetAlias = 'b', detailAlias = 'bd') {
  return `COALESCE(${detailAlias}.department_id, ${budgetAlias}.department_id)`;
}

function budgetDepartmentPredicate(budgetAlias = 'b', detailAlias = 'bd', costCenterAlias = 'cc_budget') {
  const departmentExpr = budgetDepartmentExpression(budgetAlias, detailAlias);
  return `(
                ${departmentExpr} IS NULL
                OR gei.cost_center_id = ${departmentExpr}
                OR ${costCenterAlias}.department_id = ${departmentExpr}
              )`;
}

function budgetDetailActualAmountSql({
  budgetAlias = 'b',
  detailAlias = 'bd',
  costCenterAlias = 'cc_budget',
} = {}) {
  return `COALESCE(
            (
              SELECT SUM(COALESCE(gei.debit_amount, 0) - COALESCE(gei.credit_amount, 0))
              FROM gl_entry_items gei
              JOIN gl_entries ge ON gei.entry_id = ge.id
              LEFT JOIN cost_centers ${costCenterAlias} ON ${costCenterAlias}.id = gei.cost_center_id
              WHERE gei.account_id = ${detailAlias}.account_id
                AND ge.entry_date BETWEEN ${budgetAlias}.start_date AND ${budgetAlias}.end_date
                AND ge.is_posted = 1
                AND ${budgetDepartmentPredicate(budgetAlias, detailAlias, costCenterAlias)}
            ), 0
          )`;
}

function budgetTotalActualAmountSql({
  budgetAlias = 'b',
  detailAlias = 'bd_usage',
  costCenterAlias = 'cc_budget_usage',
} = {}) {
  return `COALESCE(
            (
              SELECT SUM(COALESCE(gei.debit_amount, 0) - COALESCE(gei.credit_amount, 0))
              FROM budget_details ${detailAlias}
              JOIN gl_entry_items gei ON gei.account_id = ${detailAlias}.account_id
              JOIN gl_entries ge ON gei.entry_id = ge.id
              LEFT JOIN cost_centers ${costCenterAlias} ON ${costCenterAlias}.id = gei.cost_center_id
              WHERE ${detailAlias}.budget_id = ${budgetAlias}.id
                AND ge.entry_date BETWEEN ${budgetAlias}.start_date AND ${budgetAlias}.end_date
                AND ge.is_posted = 1
                AND ${budgetDepartmentPredicate(budgetAlias, detailAlias, costCenterAlias)}
            ), 0
          )`;
}

module.exports = {
  budgetDepartmentExpression,
  budgetDetailActualAmountSql,
  budgetTotalActualAmountSql,
};
