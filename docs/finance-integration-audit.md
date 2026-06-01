# ERP Finance Integration Audit

Generated at: 2026-05-30T08:18:57.122Z

Overall result: PASS

| Area | Result | Count |
| --- | --- | --- |
| Integration rules | PASS | 0 failed |

## Rules

| Rule | Severity | Result | Count |
| --- | --- | --- | --- |
| `purchase.receipts_generate_ap_invoice` | critical | PASS | 0 |
| `purchase.ap_invoice_has_finance_voucher` | critical | PASS | 0 |
| `purchase.receipts_generate_input_tax_invoice` | high | PASS | 0 |
| `sales.outbound_orders_generate_ar_invoice` | critical | PASS | 0 |
| `sales.ar_invoice_has_finance_voucher` | critical | PASS | 0 |
| `sales.outbound_generates_cost_voucher` | critical | PASS | 0 |
| `sales.outbound_generates_output_tax_invoice` | high | PASS | 0 |
| `production.completed_tasks_have_material_voucher` | critical | PASS | 0 |
| `production.completed_tasks_have_labor_voucher` | critical | PASS | 0 |
| `production.completed_tasks_have_overhead_voucher` | critical | PASS | 0 |
| `production.completed_tasks_have_completion_voucher` | critical | PASS | 0 |
| `production.voucher_document_type_clean` | high | PASS | 0 |
| `integration.source_links_valid` | critical | PASS | 0 |
| `integration.document_links_targets_exist` | critical | PASS | 0 |
| `integration.gl_entries_balanced` | critical | PASS | 0 |
| `cash.ar_receipts_have_valid_voucher` | critical | PASS | 0 |
| `cash.ap_payments_have_valid_voucher` | critical | PASS | 0 |
| `cash.bank_transaction_gl_links_valid` | critical | PASS | 0 |
| `expense.paid_expenses_have_bank_and_voucher` | critical | PASS | 0 |
| `asset.impairments_have_voucher` | critical | PASS | 0 |
| `cash.cash_transactions_have_voucher` | critical | PASS | 0 |
| `returns.completed_returns_have_credit_notes` | high | PASS | 0 |
| `outsourced.completed_documents_have_vouchers` | critical | PASS | 0 |
| `tax.accounting_documents_have_vouchers` | critical | PASS | 0 |
| `integration.no_duplicate_active_gl_document` | high | PASS | 0 |
