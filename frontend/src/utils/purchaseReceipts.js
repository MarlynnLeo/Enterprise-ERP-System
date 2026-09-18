// Receipt edits must keep the source line and receipt line identities intact.
export const normalizePurchaseReceiptPayload = (data) => {
  if (!data.orderId) throw new Error('缺少必要的orderId字段');
  if (!data.receiptDate) throw new Error('缺少必要的receiptDate字段');
  const warehouseId = Number(data.warehouseId);
  if (!Number.isSafeInteger(warehouseId) || warehouseId <= 0) throw new Error('请选择有效仓库');
  if (!Array.isArray(data.items) || !data.items.length) throw new Error('收货单必须包含物料明细');

  const optionalNumber = (value) => value == null || value === '' ? undefined : Number(value);
  const defined = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
  return defined({
    orderId: Number(data.orderId),
    supplierId: optionalNumber(data.supplierId),
    receiptDate: data.receiptDate,
    warehouseId,
    receiver: data.receiver,
    operator: data.receiver ?? data.operator,
    inspectionId: data.inspectionId || null,
    fromInspection: Boolean(data.fromInspection),
    remarks: data.remarks,
    items: data.items.map((item) => defined({
      id: optionalNumber(item.id),
      orderItemId: optionalNumber(item.orderItemId),
      materialId: Number(item.materialId),
      unitId: optionalNumber(item.unitId),
      orderedQuantity: optionalNumber(item.orderedQuantity),
      receivedQuantity: optionalNumber(item.receivedQuantity ?? item.quantity),
      qualifiedQuantity: optionalNumber(item.qualifiedQuantity),
      // An absent or masked price means "use the source price", not a zero price.
      price: optionalNumber(item.price ?? item.unitPrice),
      taxRate: optionalNumber(item.taxRate),
      batchNumber: item.batchNumber ?? item.batchNo,
      remarks: item.remarks ?? '',
    })),
  });
};
