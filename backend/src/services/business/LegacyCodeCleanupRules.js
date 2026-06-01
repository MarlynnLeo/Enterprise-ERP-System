/**
 * Legacy cleanup candidates.
 *
 * These entries are deliberately explicit. A file is safe to remove only when:
 * - it is listed here with a replacement or reason,
 * - the legacy audit cannot find active references,
 * - the relevant closure/status/data consistency tests pass.
 */

const legacyCleanupCandidates = [
  {
    path: 'backend/src/models/inventory.js',
    replacement: 'backend/src/services/InventoryService.js',
    reason: 'Legacy monolithic inventory model replaced by inventory services and controllers.',
  },
  {
    path: 'backend/src/services/business/InventoryCheckService.js',
    replacement: 'backend/src/controllers/business/inventory/inventoryCheckController.js',
    reason: 'Inventory check lifecycle now lives in the unified inventory check controller path.',
  },
  {
    path: 'backend/src/models/quality/eightDReport.js',
    replacement: 'backend/src/controllers/business/quality/eightDReportController.js',
    reason: '8D state machine and NCP linkage are controller/service based.',
  },
  {
    path: 'backend/src/services/business/ProductionTraceabilityService.js',
    replacement: 'backend/src/controllers/business/traceability/batchTraceabilityController.js',
    reason: 'Traceability now uses the unified batch/product traceability controllers.',
  },
  {
    path: 'backend/src/services/business/QualityService.js',
    replacement: 'backend/src/services/business/QualityIntegrationService.js',
    reason: 'Quality integration services now own quality-to-inventory links.',
  },
  {
    path: 'backend/src/services/PrintTemplateService.js',
    replacement: 'backend/src/controllers/common/printController.js',
    reason: 'Print handling was consolidated into common print controller/service paths.',
  },
  {
    path: 'backend/src/middleware/unifiedValidation.js',
    replacement: 'backend/src/middleware/inputValidation.js',
    reason: 'Input validation is centralized through the active validation middleware.',
  },
  {
    path: 'backend/src/middleware/dataPermission.js',
    replacement: 'backend/src/middleware/requirePermission.js',
    reason: 'Permission checks are routed through requirePermission and object access services.',
  },
  {
    path: 'backend/src/config/swagger.js',
    replacement: 'backend/src/routes',
    reason: 'Swagger config is not part of the active application route closure.',
  },
  {
    path: 'backend/src/config/validationConfig.js',
    replacement: 'backend/src/middleware/inputValidation.js',
    reason: 'Validation config is no longer the active validation entrypoint.',
  },
  {
    path: 'frontend/src/utils/request.js',
    replacement: 'frontend/src/services/axiosInstance.js',
    reason: 'Frontend API calls use the unified axios instance.',
  },
  {
    path: 'frontend/src/utils/apiAdapter.js',
    replacement: 'frontend/src/services/api.js',
    reason: 'API normalization is handled by current services and response parser utilities.',
  },
  {
    path: 'frontend/src/composables/usePurchaseOrder.js',
    replacement: 'frontend/src/views/purchase/composables/usePurchaseOrderActions.js',
    reason: 'Purchase order workflow composables were split into focused modules.',
  },
  {
    path: 'frontend/src/views/purchase/PurchaseOrderForm.vue',
    replacement: 'frontend/src/views/purchase/composables/usePurchaseOrderForm.js',
    reason: 'Purchase form behavior moved into composable and page-level components.',
  },
  {
    path: 'frontend/src/views/quality/components/FullChainTraceability.vue',
    replacement: 'frontend/src/views/quality/components/UnifiedTraceability.vue',
    reason: 'Traceability UI consolidated into UnifiedTraceability.',
  },
  {
    path: 'mobile/src/assets/styles/main.scss',
    replacement: 'mobile/src/assets/styles/index.scss',
    reason: 'Mobile styles use the indexed style entrypoint.',
  },
];

module.exports = {
  legacyCleanupCandidates,
};
