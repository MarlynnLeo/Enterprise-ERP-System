const { toLocalDateString } = require('../dateUtils');

const METHOD_MAP = {
  直线法: 'straight_line',
  双倍余额递减法: 'double_declining',
  年数总和法: 'sum_of_years',
  工作量法: 'units_of_production',
  不计提: 'no_depreciation',
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

function monthIndex(date) {
  const [year, month] = toLocalDateString(date).split('-').map(Number);
  return year * 12 + month - 1;
}

function sumOfYearsMonthlyAmount(base, lifeMonths, usedMonths) {
  // 每个使用年度的权重依次递减；不足一年的尾期按实际月数分配。
  const years = Math.ceil(lifeMonths / 12);
  const fullYears = Math.floor(lifeMonths / 12);
  const totalWeight = (12 * fullYears * (2 * years - fullYears + 1)) / 2 + (lifeMonths % 12);
  const elapsedYears = Math.floor(usedMonths / 12);
  const annualWeight = years - elapsedYears;
  const previousWeight =
    (12 * elapsedYears * (2 * years - elapsedYears + 1)) / 2 + (usedMonths % 12) * annualWeight;
  // 用累计金额之差分配分币尾差，完整寿命的合计恰好等于可折旧原值。
  return (
    roundMoney((base * (previousWeight + annualWeight)) / totalWeight) -
    roundMoney((base * previousWeight) / totalWeight)
  );
}

function calculateDepreciationSnapshot(asset, depreciationMonthStart, alreadySubmitted = false) {
  const originalValue = Number(asset.acquisition_cost) || 0;
  const accumulatedDepreciation = Number(asset.accumulated_depreciation) || 0;
  const impairmentAmount = Number(asset.impairment_amount) || 0;
  const usefulLifeMonths = Math.max(Math.floor(Number(asset.useful_life) || 60), 1);
  const residualValue = Math.min(Math.max(Number(asset.salvage_value) || 0, 0), originalValue);
  const netValueBefore = roundMoney(
    Math.max(0, originalValue - accumulatedDepreciation - impairmentAmount)
  );
  // 保留已有购入当月起算口径；存在明确计提起始日期时使用该月份。
  const startDate = asset.depreciation_start_date || asset.acquisition_date;
  const usedMonths = startDate ? monthIndex(depreciationMonthStart) - monthIndex(startDate) : 0;
  const normalizedMethod = METHOD_MAP[asset.depreciation_method] || asset.depreciation_method;

  let depreciationAmount = 0;
  if (
    !alreadySubmitted &&
    normalizedMethod !== 'no_depreciation' &&
    netValueBefore > residualValue &&
    usedMonths >= 0 &&
    usedMonths < usefulLifeMonths
  ) {
    if (normalizedMethod === 'double_declining') {
      const remainingMonths = usefulLifeMonths - usedMonths;
      depreciationAmount =
        remainingMonths <= 24
          ? (netValueBefore - residualValue) / remainingMonths
          : (netValueBefore * 2) / usefulLifeMonths;
    } else if (normalizedMethod === 'sum_of_years') {
      depreciationAmount = sumOfYearsMonthlyAmount(
        originalValue - residualValue,
        usefulLifeMonths,
        usedMonths
      );
    } else {
      depreciationAmount = (originalValue - residualValue) / usefulLifeMonths;
    }
    depreciationAmount = Math.min(Math.max(depreciationAmount, 0), netValueBefore - residualValue);
  }

  depreciationAmount = roundMoney(depreciationAmount);
  return {
    originalValue: roundMoney(originalValue),
    netValueBefore,
    depreciationAmount,
    netValueAfter: roundMoney(Math.max(0, netValueBefore - depreciationAmount)),
    usedMonths,
    usefulLifeMonths,
    residualValue,
    normalizedMethod,
  };
}

module.exports = { calculateDepreciationSnapshot };
