const EQUIPMENT_STATUSES = Object.freeze([
  'normal',
  'idle',
  'maintenance',
  'repair',
  'scrapped',
  'offline',
]);

function normalizeEquipmentStatus(status) {
  const value = String(status ?? '')
    .trim()
    .toLowerCase();
  return { online: 'normal', running: 'normal', error: 'repair', fault: 'repair' }[value] || value;
}

function normalizeMaintenanceType(type) {
  const value = String(type ?? '').trim();
  return (
    {
      日常保养: 'routine',
      常规维护: 'routine',
      日常维护: 'routine',
      定期保养: 'preventive',
      预防维护: 'preventive',
      定期维护: 'preventive',
      故障维修: 'corrective',
      纠正维护: 'corrective',
    }[value] || value
  );
}

function normalizeInspectionResult(result) {
  const value = String(result ?? '')
    .trim()
    .toLowerCase();
  return { normal: 'pass', passed: 'pass', abnormal: 'fail', failed: 'fail' }[value] || value;
}

module.exports = {
  EQUIPMENT_STATUSES,
  normalizeEquipmentStatus,
  normalizeMaintenanceType,
  normalizeInspectionResult,
};
