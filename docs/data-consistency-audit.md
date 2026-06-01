# ERP Data Consistency Audit

Generated at: 2026-05-30T08:19:21.464Z

Overall result: PASS

| Rule | Severity | Closure | Result | Count |
| --- | --- | --- | --- | --- |
| `gl.posted_entries_balanced` | critical | `recordToReport` | PASS | 0 |
| `inventory.completed_inbound_has_ledger` | critical | `inventoryControl` | PASS | 0 |
| `inventory.completed_outbound_has_ledger` | critical | `inventoryControl` | PASS | 0 |
| `purchase.completed_orders_not_over_received` | high | `procureToPay` | PASS | 0 |
| `sales.shipped_orders_not_over_shipped` | high | `orderToCash` | PASS | 0 |
| `production.reports_not_over_task_quantity` | high | `planToProduce` | PASS | 0 |
| `finance.ap_invoice_balance_matches_payments` | critical | `procureToPay` | PASS | 0 |
| `finance.ar_invoice_balance_matches_receipts` | critical | `orderToCash` | PASS | 0 |
| `quality.closed_8d_has_closed_phase` | high | `qualityClosedLoop` | PASS | 0 |
