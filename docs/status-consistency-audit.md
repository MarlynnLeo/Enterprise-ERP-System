# ERP Status Consistency Audit

Generated at: 2026-05-30T08:19:21.536Z

Overall result: PASS

| Domain | Table | Result | Unknown Values | Canonical Values |
| --- | --- | --- | --- | --- |
| `salesOrder` | `sales_orders` | PASS | 0 | `draft, pending, confirmed, in_production, in_procurement, ready_to_ship, shortage, partial_shipped, shipped, delivered, completed, cancelled` |
| `salesExchange` | `sales_exchanges` | PASS | 0 | `pending, processing, completed, rejected` |
| `purchaseOrder` | `purchase_orders` | PASS | 0 | `draft, pending, confirmed, approved, received, inspecting, inspected, warehousing, partial_received, completed, cancelled` |
| `purchaseRequisition` | `purchase_requisitions` | PASS | 0 | `draft, submitted, approved, rejected, completed, cancelled` |
| `purchaseReceipt` | `purchase_receipts` | PASS | 0 | `draft, confirmed, inspecting, completed, cancelled` |
| `inventoryInbound` | `inventory_inbound` | PASS | 0 | `draft, confirmed, completed, cancelled` |
| `inventoryOutbound` | `inventory_outbound` | PASS | 0 | `draft, confirmed, partial_completed, completed, reversed, cancelled` |
| `inventoryTransfer` | `inventory_transfers` | PASS | 0 | `draft, pending, approved, in_transit, completed, cancelled, rejected` |
| `inventoryCheck` | `inventory_checks` | PASS | 0 | `draft, in_progress, pending, completed, cancelled` |
| `productionPlan` | `production_plans` | PASS | 0 | `draft, allocated, material_issuing, preparing, material_issued, in_progress, paused, inspection, warehousing, completed, cancelled` |
| `productionTask` | `production_tasks` | PASS | 0 | `pending, allocated, material_issuing, preparing, material_issued, material_partial_issued, in_progress, paused, inspection, warehousing, completed, cancelled` |
| `productionProcess` | `production_processes` | PASS | 0 | `pending, in_progress, warehousing, completed, cancelled` |
| `eightDReport` | `eight_d_reports` | PASS | 0 | `draft, in_progress, review, completed, closed` |
| `financeInvoice` | `ar_invoices` | PASS | 0 | `draft, confirmed, partial_paid, overdue, paid, cancelled` |
| `financeInvoice` | `ap_invoices` | PASS | 0 | `draft, confirmed, partial_paid, overdue, paid, cancelled` |
| `glEntry` | `gl_entries` | PASS | 0 | `draft, posted, reversed` |
| `financePeriod` | `gl_periods` | PASS | 0 | `open, closed, locked` |
