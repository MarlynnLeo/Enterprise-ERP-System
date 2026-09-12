const BusinessError = require('./BusinessError');

const jsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

function validateDefinition(data, publishing = false) {
  const fail = (message) => { throw new BusinessError(message, null, 'INVALID_PROCESS_ROUTE', 400); };
  if (!String(data.name || '').trim() || String(data.name).length > 100) fail('工艺名称不能为空且最多100个字');
  if (!Number.isInteger(Number(data.product_id)) || Number(data.product_id) <= 0) fail('请选择有效的关联产品');
  if (!String(data.version || '').trim() || String(data.version).length > 50) fail('版本不能为空且最多50个字符');
  if (!Array.isArray(data.details)) fail('工序必须为数组');
  const orders = new Set();
  const codes = new Set();
  let totalHours = 0;
  for (const [index, step] of data.details.entries()) {
    const prefix = `第${index + 1}道工序`;
    if (!step || typeof step !== 'object' || Array.isArray(step)) fail(`${prefix}格式无效`);
    if (!String(step.name || '').trim() || String(step.name).length > 100) fail(`${prefix}名称不能为空且最多100个字`);
    const order = Number(step.order_num);
    if (!Number.isInteger(order) || order < 1 || orders.has(order)) fail('工序顺序必须是互不重复的正整数');
    orders.add(order);
    const code = String(step.step_code || '').trim().toLowerCase();
    if (code.length > 50 || (code && codes.has(code))) fail('工序编号不能重复且最多50个字符');
    if (code) codes.add(code);
    const hours = Number(step.standard_hours);
    if (step.standard_hours == null || step.standard_hours === '' || !Number.isFinite(hours) || hours < 0 || hours >= 1000000) fail(`${prefix}标准工时必须为有效的非负数`);
    const storedHours = Number(hours.toFixed(6));
    if ((hours > 0 && storedHours === 0) || storedHours >= 1000000) fail(`${prefix}标准工时最多支持6位小数`);
    step.standard_hours = storedHours;
    totalHours += storedHours;
    if (step.station_id != null && (!Number.isInteger(Number(step.station_id)) || Number(step.station_id) <= 0)) fail(`${prefix}工位无效`);
    for (const key of ['materials', 'sop_images', 'instruction_docs']) {
      if (step[key] != null && !Array.isArray(step[key])) fail(`${prefix}${key}必须为数组`);
    }
    const materials = new Set();
    for (const mat of step.materials || []) {
      if (!mat || typeof mat !== 'object' || Array.isArray(mat)) fail(`${prefix}物料格式无效`);
      const id = Number(mat.material_id);
      if (!Number.isInteger(id) || id <= 0 || materials.has(id)) fail(`${prefix}物料无效或重复`);
      materials.add(id);
      if (!Number.isFinite(Number(mat.quantity)) || Number(mat.quantity) <= 0) fail(`${prefix}单件物料用量必须大于0`);
      if (mat.is_scan_required != null && ![true, false, 0, 1].includes(mat.is_scan_required)) fail(`${prefix}扫码要求无效`);
    }
  }
  if (publishing && (!data.details.length || totalHours <= 0)) fail('启用前请至少配置一道工序，并填写大于0的单件总标准工时');
  return totalHours;
}

function snapshotStep(step) {
  return {
    name: step.name,
    order_num: Number(step.order_num),
    standard_hours: Number(step.standard_hours) || 0,
    step_code: step.step_code || '',
    department: step.department || '',
    station_id: step.station_id || null,
    description: step.description || '',
    remark: step.remark || '',
    instruction_docs: jsonArray(step.instruction_docs),
    sop_content: step.sop_content || '',
    sop_images: jsonArray(step.sop_images),
    materials: jsonArray(step.materials),
  };
}

module.exports = { jsonArray, validateDefinition, snapshotStep };
