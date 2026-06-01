# Legacy Code Cleanup Audit

Generated at: 2026-05-30T08:20:16.499Z

| Path | Status | References | Replacement |
| --- | --- | --- | --- |
| `backend/src/models/inventory.js` | already_removed | 0 | `backend/src/services/InventoryService.js` |
| `backend/src/services/business/InventoryCheckService.js` | already_removed | 0 | `backend/src/controllers/business/inventory/inventoryCheckController.js` |
| `backend/src/models/quality/eightDReport.js` | already_removed | 0 | `backend/src/controllers/business/quality/eightDReportController.js` |
| `backend/src/services/business/ProductionTraceabilityService.js` | already_removed | 0 | `backend/src/controllers/business/traceability/batchTraceabilityController.js` |
| `backend/src/services/business/QualityService.js` | already_removed | 0 | `backend/src/services/business/QualityIntegrationService.js` |
| `backend/src/services/PrintTemplateService.js` | already_removed | 0 | `backend/src/controllers/common/printController.js` |
| `backend/src/middleware/unifiedValidation.js` | already_removed | 0 | `backend/src/middleware/inputValidation.js` |
| `backend/src/middleware/dataPermission.js` | already_removed | 0 | `backend/src/middleware/requirePermission.js` |
| `backend/src/config/swagger.js` | already_removed | 0 | `backend/src/routes` |
| `backend/src/config/validationConfig.js` | already_removed | 0 | `backend/src/middleware/inputValidation.js` |
| `frontend/src/utils/request.js` | already_removed | 0 | `frontend/src/services/axiosInstance.js` |
| `frontend/src/utils/apiAdapter.js` | already_removed | 0 | `frontend/src/services/api.js` |
| `frontend/src/composables/usePurchaseOrder.js` | already_removed | 0 | `frontend/src/views/purchase/composables/usePurchaseOrderActions.js` |
| `frontend/src/views/purchase/PurchaseOrderForm.vue` | already_removed | 0 | `frontend/src/views/purchase/composables/usePurchaseOrderForm.js` |
| `frontend/src/views/quality/components/FullChainTraceability.vue` | already_removed | 0 | `frontend/src/views/quality/components/UnifiedTraceability.vue` |
| `mobile/src/assets/styles/main.scss` | already_removed | 0 | `mobile/src/assets/styles/index.scss` |
