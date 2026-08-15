/**
 * 车间补料/换料：只允许生成关联生产任务的草稿，不能当仓库发料用。
 */

const SHOP_OUTBOUND_TYPES = new Set(['supplement', 'exchange']);
const SHOP_INBOUND_TYPES = new Set([
  'defective_return',
  'production_return',
  'exchange_return',
]);

function hasCode(permissions, code) {
  if (!Array.isArray(permissions) || !code) return false;
  if (permissions.includes('*') || permissions.includes(code)) return true;
  return permissions.some((item) => item.endsWith(':*') && code.startsWith(item.slice(0, -1)));
}

function canCreateWarehouseOutbound(permissions) {
  return hasCode(permissions, 'inventory:outbound:create');
}

function canCreateWarehouseInbound(permissions) {
  return hasCode(permissions, 'inventory:inbound:create');
}

function canApplySupplement(permissions) {
  return (
    hasCode(permissions, 'production:supplement:create') ||
    hasCode(permissions, 'production:process:update')
  );
}

function canApplyExchange(permissions) {
  return (
    hasCode(permissions, 'production:exchange:create') ||
    hasCode(permissions, 'production:process:update')
  );
}

function assertShopFloorOutbound(req, payload) {
  const permissions = req.userPermissions || [];
  if (canCreateWarehouseOutbound(permissions)) return payload;

  const type = String(payload.outboundType || payload.outbound_type || '');
  const allowed =
    (type === 'supplement' && canApplySupplement(permissions)) ||
    (type === 'exchange' && canApplyExchange(permissions));
  if (!SHOP_OUTBOUND_TYPES.has(type) || !allowed) {
    const error = new Error('车间只能提交补料或换料申请草稿，不能直接发料出库');
    error.statusCode = 403;
    throw error;
  }
  if (!payload.productionTaskId) {
    const error = new Error('补料/换料必须关联生产任务');
    error.statusCode = 400;
    throw error;
  }
  payload.status = 'draft';
  return payload;
}

function assertShopFloorInbound(req, mapped) {
  const permissions = req.userPermissions || [];
  if (canCreateWarehouseInbound(permissions)) return mapped;

  const type = String(mapped.inbound_type || '');
  const allowed =
    SHOP_INBOUND_TYPES.has(type) &&
    (canApplySupplement(permissions) || canApplyExchange(permissions));
  if (!allowed) {
    const error = new Error('车间只能提交补料/换料退回草稿，不能直接办理入库');
    error.statusCode = 403;
    throw error;
  }
  if (mapped.reference_type !== 'production_task' || !mapped.reference_id) {
    const error = new Error('补料/换料退回必须关联生产任务');
    error.statusCode = 400;
    throw error;
  }
  mapped.status = 'draft';
  return mapped;
}

module.exports = {
  SHOP_OUTBOUND_TYPES,
  SHOP_INBOUND_TYPES,
  canCreateWarehouseOutbound,
  canCreateWarehouseInbound,
  canApplySupplement,
  canApplyExchange,
  assertShopFloorOutbound,
  assertShopFloorInbound,
};
