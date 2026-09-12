const ProductProcessTaskService = require('./ProductProcessTaskService');

async function createDefaultProductionProcess(connection, taskId) {
  const result = await ProductProcessTaskService.initializeTask(connection, taskId);
  return result.processIds[0] || null;
}

async function createProductionProcessIfNeeded(connection, taskId, taskStatus) {
  if (!['material_issued', 'material_partial_issued'].includes(taskStatus)) return null;
  return createDefaultProductionProcess(connection, taskId);
}

module.exports = { createDefaultProductionProcess, createProductionProcessIfNeeded };
