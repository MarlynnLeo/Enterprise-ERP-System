# ERP Cash Settlement Audit

Generated at: 2026-05-30T08:19:08.513Z

Summary: 19/20 rules passed, 1 non-blocking warnings.

| Rule | Severity | Result | Count | Blocking |
| --- | --- | --- | ---: | --- |
| ar.receipts_positive_amount | critical | PASS | 0 | Yes |
| ap.payments_positive_amount | critical | PASS | 0 | Yes |
| ar.receipt_header_matches_items | critical | PASS | 0 | Yes |
| ap.payment_header_matches_items | critical | PASS | 0 | Yes |
| ar.invoice_paid_balance_matches_receipts | critical | PASS | 0 | Yes |
| ap.invoice_paid_balance_matches_payments | critical | PASS | 0 | Yes |
| ar.bank_backed_receipts_have_bank_transaction | critical | PASS | 0 | Yes |
| ap.bank_backed_payments_have_bank_transaction | critical | PASS | 0 | Yes |
| ar.receipts_have_finance_voucher | critical | PASS | 0 | Yes |
| ap.payments_have_finance_voucher | critical | PASS | 0 | Yes |
| bank.business_transactions_have_gl_entry | high | PASS | 0 | Yes |
| bank.account_balance_matches_approved_transactions | critical | PASS | 0 | Yes |
| bank.approved_transactions_have_posted_gl_entry | critical | PASS | 0 | Yes |
| bank.closed_period_transactions_are_reconciled | warning | WARN | 17 | No |
| bank.reconciliation_matches_have_consistent_status | high | PASS | 0 | Yes |
| bank.reconciliation_match_amount_direction_consistent | critical | PASS | 0 | Yes |
| bank.statement_items_do_not_duplicate_imported_rows | medium | PASS | 0 | Yes |
| bank.statement_item_import_account_consistent | high | PASS | 0 | Yes |
| bank.matched_statement_items_have_matches | high | PASS | 0 | Yes |
| bank.reconciled_transactions_have_statement_match | medium | PASS | 0 | Yes |

## Non-Blocking Warnings

### bank.closed_period_transactions_are_reconciled

Legacy closed accounting periods should not contain approved bank transactions that remain unreconciled with bank statement evidence. Report only; future period closing is blocked by PeriodEndService.

Sample rows:

```json
[
  {
    "id": 204,
    "transaction_number": "EXP-PAY-11",
    "bank_account_id": 7,
    "transaction_date": "2026-02-02",
    "amount": 3214,
    "period_name": "2026年2月"
  },
  {
    "id": 70,
    "transaction_number": "AR-RC-1770168483782",
    "bank_account_id": 7,
    "transaction_date": "2026-02-04",
    "amount": 44.07,
    "period_name": "2026年2月"
  },
  {
    "id": 71,
    "transaction_number": "AR-RC-1770168483782-VOID",
    "bank_account_id": 7,
    "transaction_date": "2026-02-04",
    "amount": 44.07,
    "period_name": "2026年2月"
  },
  {
    "id": 72,
    "transaction_number": "PAY-1770169215262",
    "bank_account_id": 7,
    "transaction_date": "2026-02-04",
    "amount": 10000,
    "period_name": "2026年2月"
  },
  {
    "id": 73,
    "transaction_number": "AR-RC-1770169275404",
    "bank_account_id": 7,
    "transaction_date": "2026-02-04",
    "amount": 44.07,
    "period_name": "2026年2月"
  },
  {
    "id": 74,
    "transaction_number": "PAY-1770169215262-VOID",
    "bank_account_id": 7,
    "transaction_date": "2026-02-04",
    "amount": 10000,
    "period_name": "2026年2月"
  },
  {
    "id": 78,
    "transaction_number": "AR-RC-1772092928605",
    "bank_account_id": 7,
    "transaction_date": "2026-02-26",
    "amount": 39,
    "period_name": "2026年2月"
  },
  {
    "id": 79,
    "transaction_number": "PAY-1772092928642",
    "bank_account_id": 7,
    "transaction_date": "2026-02-26",
    "amount": 50,
    "period_name": "2026年2月"
  },
  {
    "id": 80,
    "transaction_number": "AR-RC-1772093021639",
    "bank_account_id": 7,
    "transaction_date": "2026-02-26",
    "amount": 39,
    "period_name": "2026年2月"
  },
  {
    "id": 81,
    "transaction_number": "PAY-1772093021672",
    "bank_account_id": 7,
    "transaction_date": "2026-02-26",
    "amount": 50,
    "period_name": "2026年2月"
  }
]
```
