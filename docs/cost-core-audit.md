# ERP Cost Core Audit

Generated at: 2026-05-30T08:19:08.638Z

Overall result: PASS

| Area | Result | Count |
| --- | --- | --- |
| Cost route permissions | PASS | 0 unprotected |
| Amount middleware | PASS | 0 missing |
| Sensitive permission registry | PASS | 0 missing |
| Cost data integrity | PASS | 0 failed |

## Integrity Rules

| Rule | Severity | Result | Count |
| --- | --- | --- | --- |
| `purchase.order_item_amounts_match_quantity_price` | critical | PASS | 0 |
| `purchase.order_header_matches_items` | critical | PASS | 0 |
| `purchase.receipt_item_amounts_match_quantity_price` | critical | PASS | 0 |
| `purchase.receipt_item_price_matches_order` | critical | PASS | 0 |
| `purchase.receipt_header_matches_items` | critical | PASS | 0 |
| `purchase.receipts_have_inventory_value` | critical | PASS | 0 |
| `inventory.ledger_value_matches_quantity_cost` | critical | PASS | 0 |
| `inventory.purchase_receipt_ledger_matches_receipt_price` | critical | PASS | 0 |
| `production.actual_cost_formula` | critical | PASS | 0 |
| `production.costs_nonnegative` | critical | PASS | 0 |
| `standard_cost.active_rows_are_positive` | critical | PASS | 0 |
| `standard_cost.active_flag_matches_status` | high | PASS | 0 |
| `standard_cost.no_duplicate_active_element` | high | PASS | 0 |
| `variance.amounts_match_components` | critical | PASS | 0 |
| `cost_activity.amounts_nonnegative` | high | PASS | 0 |
| `cost_center.parent_exists` | high | PASS | 0 |
