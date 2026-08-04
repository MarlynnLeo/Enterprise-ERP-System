const { RESPONSIBILITY_CODES } = require('../constants/notification');

const events = [
  {
    event_type: 'PRODUCTION_TASK_COMPLETED',
    label: '生产任务完工',
    variables: ['taskId', 'taskCode', 'productName', 'isFullComplete'],
    category: '生产管理',
    default_title: '生产任务完工',
    default_content: '生产任务 ${taskCode} 已完工，请安排后续检验和入库。',
    default_link: '/production/task',
    source_path: 'taskId',
  },
  {
    event_type: 'PURCHASE_RECEIPT_COMPLETED',
    label: '采购收货入库',
    variables: ['receiptId', 'receiptNo', 'supplierName'],
    category: '采购管理',
    default_title: '采购收货入库',
    default_content: '收货单 ${receiptNo} 已完成入库，请及时安排来料检验。',
    default_link: '/purchase/receipts',
    source_path: 'receiptId',
  },
  {
    event_type: 'SALES_OUTBOUND_COMPLETED',
    label: '销售出库完成',
    variables: ['outboundId', 'outboundNo', 'customerName'],
    category: '销售管理',
    default_title: '销售出库完成',
    default_content: '出库单 ${outboundNo} 已完成出库。',
    default_link: '/sales/outbound',
    source_path: 'outboundData.id',
  },
  {
    event_type: 'SALES_RETURN_COMPLETED',
    label: '销售退货完成',
    variables: ['returnId', 'returnNo', 'customerName'],
    category: '销售管理',
    default_title: '销售退货完成',
    default_content: '退货单 ${returnNo} 处理完成，退货物料已入库。',
    default_link: '/sales/returns',
    source_path: 'returnId',
  },
  {
    event_type: 'PURCHASE_RETURN_COMPLETED',
    label: '采购退货完成',
    variables: ['returnId', 'returnNo', 'supplierName'],
    category: '采购管理',
    default_title: '采购退货完成',
    default_content: '采购退货单 ${returnNo} 处理完成。',
    default_link: '/purchase/returns',
    source_path: 'returnId',
  },
  {
    event_type: 'ANOMALY_REPORTED',
    label: '装配异常上报',
    variables: ['anomalyId', 'code', 'title', 'category', 'severity', 'reporterName', 'location'],
    category: '生产管理',
    default_title: '装配异常上报',
    default_content: '异常 ${code}：${title}，严重程度 ${severity}，请及时处理。',
    default_link: '/production/anomaly-reports',
    source_path: 'anomalyId',
  },
  {
    event_type: 'ASSEMBLY_ALL_STEPS_COMPLETED',
    label: '装配工序全部完成',
    variables: ['taskId', 'taskCode', 'productName'],
    category: '生产管理',
    default_title: '装配工序全部完成',
    default_content: '生产任务 ${taskCode} 的装配工序已全部完成。',
    default_link: '/production/assembly',
    source_path: 'taskId',
  },
  {
    event_type: 'FINANCE_AR_INVOICE_OVERDUE',
    label: '应收发票逾期',
    variables: ['invoiceId', 'invoiceNumber', 'overdueDays', 'customerName', 'balanceAmount', 'dueDate'],
    category: '财务管理',
    responsibility_code: RESPONSIBILITY_CODES.FINANCE,
    default_title: '应收发票逾期提醒',
    default_content: '应收发票 ${invoiceNumber} 已逾期 ${overdueDays} 天，客户：${customerName}，余额：¥${balanceAmount}。',
    default_link: '/finance/ar/invoices',
    source_path: 'invoiceId',
  },
  {
    event_type: 'FINANCE_AP_INVOICE_OVERDUE',
    label: '应付发票逾期',
    variables: ['invoiceId', 'invoiceNumber', 'overdueDays', 'supplierName', 'balanceAmount', 'dueDate'],
    category: '财务管理',
    responsibility_code: RESPONSIBILITY_CODES.FINANCE,
    default_title: '应付发票逾期提醒',
    default_content: '应付发票 ${invoiceNumber} 已逾期 ${overdueDays} 天，供应商：${supplierName}，余额：¥${balanceAmount}。',
    default_link: '/finance/ap/invoices',
    source_path: 'invoiceId',
  },
  {
    event_type: 'FINANCE_AUTOMATION_COMPLETED',
    label: '财务自动化任务完成',
    variables: ['title', 'message', 'taskName', 'period', 'sourceId'],
    category: '财务管理',
    responsibility_code: RESPONSIBILITY_CODES.FINANCE,
    default_title: '${title}',
    default_content: '${message}',
    default_link: '/finance/settings?tab=automation',
    source_path: 'sourceId',
  },
  {
    event_type: 'FINANCE_AUTOMATION_FAILED',
    label: '财务自动化任务失败',
    variables: ['title', 'message', 'taskName', 'period', 'sourceId'],
    category: '财务管理',
    responsibility_code: RESPONSIBILITY_CODES.FINANCE,
    default_title: '${title}',
    default_content: '${message}',
    default_link: '/finance/settings?tab=automation',
    source_path: 'sourceId',
  },
].map((event) => Object.freeze(event));

const EVENTS_BY_TYPE = new Map(events.map((event) => [event.event_type, event]));
const EVENT_TYPES = Object.freeze(Object.fromEntries(events.map((event) => [event.event_type, event.event_type])));

function getEvent(eventType) {
  return EVENTS_BY_TYPE.get(eventType) || null;
}

function getEvents() {
  return events;
}

function getSubscribableEventTypes() {
  return events.map((event) => event.event_type);
}

function getEventsByResponsibility(code) {
  return events.filter((event) => event.responsibility_code === code);
}

function getValueByPath(payload, path) {
  return String(path || '').split('.').reduce((value, key) => value?.[key], payload);
}

function getSourceId(eventType, payload) {
  const event = getEvent(eventType);
  return event ? getValueByPath(payload, event.source_path) : payload?.sourceId || payload?.id || null;
}

module.exports = {
  EVENT_TYPES,
  getEvent,
  getEvents,
  getSubscribableEventTypes,
  getEventsByResponsibility,
  getSourceId,
};
