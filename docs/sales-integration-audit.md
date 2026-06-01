# ERP Sales Integration Audit

Generated at: 2026-05-30T08:19:08.749Z

Overall result: PASS

| Area | Result | Count |
| --- | --- | --- |
| Sales integration rules | PASS | 0 failed |

## Rules

| Rule | Severity | Result | Count |
| --- | --- | --- | --- |
| `sales.document_numbers_unique` | critical | PASS | 0 |
| `sales.headers_reference_existing_customers` | critical | PASS | 0 |
| `sales.quotation_items_valid` | critical | PASS | 0 |
| `sales.quotation_headers_match_items` | high | PASS | 0 |
| `sales.orders_reference_valid_quotations` | high | PASS | 0 |
| `sales.orders_have_valid_items_and_amounts` | critical | PASS | 0 |
| `sales.order_headers_match_items` | critical | PASS | 0 |
| `sales.outbound_references_valid_orders` | critical | PASS | 0 |
| `sales.outbound_items_valid_and_within_order` | critical | PASS | 0 |
| `sales.outbound_headers_match_items` | critical | PASS | 0 |
| `sales.completed_outbound_has_inventory_ledger` | critical | PASS | 0 |
| `sales.order_status_matches_shipping` | high | PASS | 0 |
| `sales.returns_valid_and_within_shipped` | critical | PASS | 0 |
| `sales.completed_returns_have_inventory_ledger` | critical | PASS | 0 |
| `sales.exchanges_valid_and_balanced` | high | PASS | 0 |
| `sales.completed_exchanges_have_inventory_ledger` | critical | PASS | 0 |
| `sales.ar_documents_consistent` | critical | PASS | 0 |
| `sales.document_links_resolve` | high | PASS | 0 |
