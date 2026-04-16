/**
 * 状态映射常量 (恢复因 92ad05e 被误删的文件)
 */

export const getInboundStatusText = (status) => {
  const map = {
    draft: '草稿',
    confirmed: '已确认',
    completed: '已完成',
    cancelled: '已取消'
  };
  return map[status] || status || '未知';
};

export const getInboundStatusColor = (status) => {
  const map = {
    draft: 'default',
    confirmed: 'primary',
    completed: 'success',
    cancelled: 'danger'
  };
  return map[status] || 'default';
};

export const getInboundTypeText = (type) => {
  const map = {
    purchase: '采购入库',
    production: '生产入库',
    transfer: '调拨入库',
    return: '退货入库',
    other: '其他入库'
  };
  return map[type] || type || '入库';
};

export const getOutboundStatusText = (status) => {
  const map = {
    draft: '草稿',
    confirmed: '已确认',
    completed: '已完成',
    cancelled: '已取消'
  };
  return map[status] || status || '未知';
};

export const getOutboundStatusColor = (status) => {
  const map = {
    draft: 'default',
    confirmed: 'warning',
    completed: 'success',
    cancelled: 'danger'
  };
  return map[status] || 'default';
};

export const getOutboundTypeText = (type) => {
  const map = {
    sale: '销售出库',
    production: '生产领料',
    transfer: '调拨出库',
    other: '其他出库'
  };
  return map[type] || type || '出库';
};
