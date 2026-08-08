/**
 * WorkflowService — facade (singleton export)
 * Implementation split into ./workflow/*Methods.js
 * Public API unchanged: require returns the singleton instance.
 *
 * Modules:
 * - templateMethods: template CRUD & validation
 * - instanceMethods: start/approve/withdraw/query instances
 * - businessMethods: business-status hooks & approver assignment
 */

const templateMethods = require('./workflow/templateMethods');
const instanceMethods = require('./workflow/instanceMethods');
const businessMethods = require('./workflow/businessMethods');
const { BUSINESS_STATUS_MAP } = require('./workflow/runtime');

class WorkflowService {
  static BUSINESS_STATUS_MAP = BUSINESS_STATUS_MAP;
}

Object.assign(
  WorkflowService.prototype,
  templateMethods,
  instanceMethods,
  businessMethods
);

const workflowService = new WorkflowService();
workflowService.BUSINESS_STATUS_MAP = BUSINESS_STATUS_MAP;
module.exports = workflowService;
