'use strict';

// Inputs are already grouped by currency in SQL. Never combine the monetary
// columns across currencies or invent a rate for legacy invoices.
function summarizeCurrencyGroups(rows) {
  const currencyTotals = rows
    .filter((row) => Number(row.invoiceCount) > 0)
    .map((row) => ({
      currencyCode: row.currencyCode,
      invoiceCount: Number(row.invoiceCount),
      totalAmount: Number(row.totalAmount || 0),
      paidAmount: Number(row.paidAmount || 0),
      balance: Number(row.balance || 0),
    }))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  const hasMixedCurrencies = currencyTotals.length > 1;
  const single = currencyTotals[0];
  return {
    amountBasis: 'original',
    currencyCode: hasMixedCurrencies ? null : single?.currencyCode || 'CNY',
    hasMixedCurrencies,
    invoiceCount: currencyTotals.reduce((sum, row) => sum + row.invoiceCount, 0),
    totalAmount: hasMixedCurrencies ? null : single?.totalAmount || 0,
    paidAmount: hasMixedCurrencies ? null : single?.paidAmount || 0,
    balance: hasMixedCurrencies ? null : single?.balance || 0,
    currencyTotals,
  };
}

function groupPartyCurrencySummaries(rows, party) {
  const parties = new Map();
  for (const row of rows) {
    const id = row[`${party}Id`];
    if (!parties.has(id)) parties.set(id, []);
    parties.get(id).push(row);
  }
  return (
    [...parties.values()]
      .map((group) => {
        const first = group[0];
        return {
          [`${party}Id`]: first[`${party}Id`],
          [`${party}Name`]: first[`${party}Name`],
          contactPerson: first.contactPerson,
          contactPhone: first.contactPhone,
          ...summarizeCurrencyGroups(group),
          lastInvoiceDate: group.reduce(
            (latest, row) =>
              !latest || row.lastInvoiceDate > latest ? row.lastInvoiceDate : latest,
            null
          ),
        };
      })
      .filter((row) => row.currencyTotals.some((currency) => currency.balance > 0))
      // Preserve descending balance order within one currency; currencies have no
      // meaningful shared amount order, so separate them before sorting amounts.
      .sort(
        (a, b) =>
          String(a.currencyCode || '\uffff').localeCompare(String(b.currencyCode || '\uffff')) ||
          (a.currencyCode ? b.balance - a.balance : 0) ||
          Number(a[`${party}Id`]) - Number(b[`${party}Id`])
      )
  );
}

module.exports = { summarizeCurrencyGroups, groupPartyCurrencySummaries };
