# ERP Finance Core Audit

Generated at: 2026-05-30T08:18:57.045Z

Overall result: PASS

| Area | Result | Count |
| --- | --- | --- |
| Finance route permissions | PASS | 0 unprotected |
| Registered permission codes | PASS | 0 missing |
| Finance data integrity | PASS | 0 failed |

## Integrity Rules

| Rule | Severity | Result | Count |
| --- | --- | --- | --- |
| `gl.entries_have_items` | critical | PASS | 0 |
| `gl.posted_entries_balanced` | critical | PASS | 0 |
| `gl.entry_items_have_accounts` | critical | PASS | 0 |
| `gl.posted_flag_matches_status` | high | PASS | 0 |
| `gl.reversal_links_valid` | high | PASS | 0 |
| `gl.closed_period_no_drafts` | critical | PASS | 0 |
| `ar.invoice_total_matches_items` | critical | PASS | 0 |
| `ap.invoice_total_matches_items` | critical | PASS | 0 |
| `ar.receipt_total_matches_items` | critical | PASS | 0 |
| `ap.payment_total_matches_items` | critical | PASS | 0 |
| `ar.invoice_balance_matches_receipts` | critical | PASS | 0 |
| `ap.invoice_balance_matches_payments` | critical | PASS | 0 |
| `cash.gl_links_exist` | critical | PASS | 0 |
| `document_links.finance_vouchers_exist` | critical | PASS | 0 |
| `tax.gl_links_exist` | critical | PASS | 0 |
