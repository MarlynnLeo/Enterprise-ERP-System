const amount = value => {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) {
    throw new Error('报表金额不完整，请重新加载')
  }
  return Number(value)
}

const flattenRows = (rows, level = 1) => {
  if (!Array.isArray(rows)) throw new Error('报表明细不完整，请重新加载')
  return rows.flatMap(row => [{
    id: row.id ?? row.code,
    accountCode: row.code,
    accountName: row.name,
    amount: amount(row.amount),
    level,
    isTotal: Boolean(row.isCalculated),
  }, ...flattenRows(row.children ?? [], level + 1)])
}

export const normalizeBalanceSheet = data => {
  if (!data?.summary) throw new Error('资产负债表数据不完整，请重新加载')
  return {
    summary: {
      totalAssets: amount(data.summary.assetsTotal),
      totalLiabilities: amount(data.summary.liabilitiesTotal),
      totalEquity: amount(data.summary.equityTotal),
      isBalanced: data.summary.isBalanced,
      balanceDifference: data.summary.balanceDifference == null ? null : amount(data.summary.balanceDifference),
    },
    sections: ['assets', 'liabilities', 'equity'].map(key => {
      const group = data[key]
      if (!group) throw new Error('资产负债表科目不完整，请重新加载')
      return { title: group.title, items: flattenRows(group.items), total: amount(group.totalAmount) }
    }),
  }
}

export const normalizeIncomeStatement = data => {
  if (!Array.isArray(data) || !data.some(row => row.code === 'NET_INCOME')) {
    throw new Error('利润表数据不完整，请重新加载')
  }
  const total = code => {
    const row = data.find(item => item.code === code)
    // The report omits revenue/cost groups only when their total and all details are zero.
    return row ? amount(row.amount) : 0
  }
  return {
    summary: {
      totalRevenue: total('INCOME'),
      totalCost: -total('COST') || 0,
      netProfit: total('NET_INCOME'),
    },
    sections: data.map(row => ({
      title: row.name,
      items: flattenRows(row.children ?? []),
      total: amount(row.amount),
    })),
  }
}
