const moneyNumber = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export const purchaseReturnLineAmount = (item) => {
  const price = moneyNumber(item.price ?? item.unitPrice);
  const quantity = moneyNumber(item.returnQuantity);
  const rate = moneyNumber(item.taxRate);
  if (price === null || quantity === null || rate === null) return null;
  const subtotal = roundMoney(price * quantity);
  const taxRate = rate > 1 ? rate / 100 : rate;
  return roundMoney(subtotal + roundMoney(subtotal * taxRate));
};

export const purchaseReturnTotal = (items) => {
  const amounts = items.filter(item => Number(item.returnQuantity) > 0).map(purchaseReturnLineAmount);
  return amounts.some(amount => amount === null) ? null : roundMoney(amounts.reduce((sum, amount) => sum + amount, 0));
};

export const buildPurchaseReturnItems = (receiptItems, existingItems = []) => receiptItems.map((item) => {
  const existing = existingItems.find(line => Number(line.receiptItemId) === Number(item.id));
  const receivedQuantity = Number(item.qualifiedQuantity ?? item.receivedQuantity ?? item.quantity ?? 0);
  const reserved = Number(item.returnedQuantity ?? 0);
  const ownQuantity = Number(existing?.returnQuantity ?? 0);
  return {
    receiptItemId: item.id,
    materialId: item.materialId,
    materialCode: item.materialCode ?? '',
    materialName: item.materialName ?? '',
    specification: item.specification ?? item.specs ?? '',
    unitId: item.unitId,
    unitName: item.unitName ?? item.unit ?? '',
    receivedQuantity,
    returnableQuantity: Math.max(0, receivedQuantity - reserved + ownQuantity),
    returnQuantity: ownQuantity,
    price: moneyNumber(item.price ?? item.unitPrice),
    taxRate: moneyNumber(item.taxRate),
    returnReason: existing?.returnReason ?? '',
  };
});
