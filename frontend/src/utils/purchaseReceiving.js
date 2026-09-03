/**
 * 构造采购到货接口的最小明细载荷。
 *
 * 采购订单详情可能包含被脱敏的价格、金额和税率字段，不能把整行订单
 * 明细直接回传到收货接口，否则会被价格变更权限检查误判为价格修改。
 */
export const normalizePurchaseReceivingItems = (items) => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const source = item && typeof item === 'object' ? item : {};
      return {
        materialId: source.materialId ?? source.material_id,
        receiveQuantity: source.receiveQuantity ?? source.receive_quantity ?? source.quantity,
      };
    })
    .filter((item) => {
      const materialId = Number(item.materialId);
      const receiveQuantity = Number(item.receiveQuantity);
      return (
        Number.isFinite(materialId) &&
        materialId > 0 &&
        Number.isFinite(receiveQuantity) &&
        receiveQuantity > 0
      );
    });
};
