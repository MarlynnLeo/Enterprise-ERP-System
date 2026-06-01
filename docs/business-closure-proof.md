# ERP Business Closure Proof

This file is generated from executable registries in `backend/src/constants` and `backend/src/services/business`.
It proves which business loops exist, which status machines govern them, and which data consistency rules must stay green.

## Closure Loops

### Procure to Pay

- Id: `procureToPay`
- Purpose: Purchase demand becomes payable liability and cash payment.
- Start: `purchaseRequisition`
- End: `glEntry`

| Step | Object | Status Domain | Required Fields |
| --- | --- | --- | --- |
| 1 | `purchaseRequisition` | `purchaseRequisition` | `id`, `status` |
| 2 | `purchaseOrder` | `purchaseOrder` | `id`, `order_no`, `status` |
| 3 | `purchaseReceipt` | `purchaseReceipt` | `id`, `receipt_no`, `status` |
| 4 | `inventoryInbound` | `inventoryInbound` | `id`, `status` |
| 5 | `financeInvoice` | `financeInvoice` | `id`, `status`, `total_amount`, `balance_amount` |
| 6 | `glEntry` | `glEntry` | `id`, `status` |

Invariants:
- Approved requisitions that generated purchase orders cannot be edited as drafts.
- Completed receipts must have inbound ledger evidence.
- Confirmed invoices must create balanced GL evidence.
- Paid invoices must have payment and balance evidence.
### Order to Cash

- Id: `orderToCash`
- Purpose: Customer demand becomes shipment, receivable, cash receipt, and GL evidence.
- Start: `salesQuotation`
- End: `glEntry`

| Step | Object | Status Domain | Required Fields |
| --- | --- | --- | --- |
| 1 | `salesQuotation` | - | `id`, `status` |
| 2 | `salesOrder` | `salesOrder` | `id`, `order_no`, `status` |
| 3 | `inventoryOutbound` | `inventoryOutbound` | `id`, `status` |
| 4 | `financeInvoice` | `financeInvoice` | `id`, `status`, `total_amount`, `balance_amount` |
| 5 | `glEntry` | `glEntry` | `id`, `status` |

Invariants:
- Completed sales outbound documents must have inventory ledger evidence.
- Shipped sales orders must not exceed ordered quantities after returns.
- Confirmed receivables must create balanced GL evidence.
- Receipts must reduce AR balance and create bank/cash evidence.
### Plan to Produce

- Id: `planToProduce`
- Purpose: Planned demand becomes issued materials, reported work, quality result, and finished goods.
- Start: `productionPlan`
- End: `inventoryInbound`

| Step | Object | Status Domain | Required Fields |
| --- | --- | --- | --- |
| 1 | `productionPlan` | `productionPlan` | `id`, `status`, `quantity` |
| 2 | `productionTask` | `productionTask` | `id`, `status`, `quantity` |
| 3 | `inventoryOutbound` | `inventoryOutbound` | `id`, `status` |
| 4 | `productionProcess` | `productionProcess` | `id`, `status` |
| 5 | `productionReport` | - | `id`, `completed_quantity` |
| 6 | `qualityInspection` | - | `id`, `status` |
| 7 | `inventoryInbound` | `inventoryInbound` | `id`, `status` |

Invariants:
- Material issue completion must be backed by outbound ledger evidence.
- Reported quantities must not exceed planned quantities without explicit excess issue flow.
- Finished goods inbound must be linked to production or quality evidence.
### Inventory Control

- Id: `inventoryControl`
- Purpose: All quantity movements are ledger-backed and reversible only by controlled documents.
- Start: `inventoryInbound`
- End: `inventoryLedger`

| Step | Object | Status Domain | Required Fields |
| --- | --- | --- | --- |
| 1 | `inventoryInbound` | `inventoryInbound` | `id`, `status` |
| 2 | `inventoryOutbound` | `inventoryOutbound` | `id`, `status` |
| 3 | `inventoryTransfer` | `inventoryTransfer` | `id`, `status` |
| 4 | `inventoryCheck` | `inventoryCheck` | `id`, `status` |
| 5 | `inventoryLedger` | - | `id`, `material_id`, `quantity`, `transaction_type` |

Invariants:
- Completed movement documents must have ledger entries.
- Terminal movement documents cannot be edited or deleted.
- Stock balance must equal ledger aggregation by material/location/batch.
### Quality Closed Loop

- Id: `qualityClosedLoop`
- Purpose: Quality defects are contained, dispositioned, corrected, and closed with traceability.
- Start: `qualityInspection`
- End: `eightDReport`

| Step | Object | Status Domain | Required Fields |
| --- | --- | --- | --- |
| 1 | `qualityInspection` | - | `id`, `status` |
| 2 | `nonconformingProduct` | - | `id`, `status` |
| 3 | `reworkTask` | - | `id`, `status` |
| 4 | `replacementOrder` | - | `id`, `status` |
| 5 | `scrapRecord` | - | `id`, `status` |
| 6 | `eightDReport` | `eightDReport` | `id`, `status`, `current_phase` |

Invariants:
- NCP terminal quantity must be fully dispositioned.
- 8D reports linked to NCP cannot close before linked NCP closure.
- Rework, scrap, and replacement records must preserve source inspection traceability.
### Record to Report

- Id: `recordToReport`
- Purpose: Sub-ledger and manual events become posted GL, period close, and reports.
- Start: `glEntry`
- End: `financialReport`

| Step | Object | Status Domain | Required Fields |
| --- | --- | --- | --- |
| 1 | `glEntry` | `glEntry` | `id`, `status` |
| 2 | `glEntryItem` | - | `entry_id`, `account_id`, `debit_amount`, `credit_amount` |
| 3 | `financePeriod` | `financePeriod` | `id`, `status` |
| 4 | `financialReport` | - | `period_id` |

Invariants:
- Posted GL entries must be balanced.
- Closed periods reject new business documents dated inside the closed range.
- Reversed entries must preserve the original entry and create a reversing entry.

## Unified Status Registry

### salesOrder

- Table: `sales_orders`
- Status column: `status`
- Terminal: `completed`, `cancelled`
- Values: `draft`, `pending`, `confirmed`, `in_production`, `in_procurement`, `ready_to_ship`, `shortage`, `partial_shipped`, `shipped`, `delivered`, `completed`, `cancelled`

| From | To |
| --- | --- |
| `draft` | `pending`, `confirmed`, `in_production`, `in_procurement`, `ready_to_ship`, `shortage`, `cancelled` |
| `pending` | `confirmed`, `cancelled` |
| `confirmed` | `in_production`, `in_procurement`, `ready_to_ship`, `shortage`, `cancelled` |
| `in_production` | `ready_to_ship`, `partial_shipped`, `shipped`, `cancelled` |
| `in_procurement` | `ready_to_ship`, `shortage`, `cancelled` |
| `ready_to_ship` | `partial_shipped`, `shipped`, `cancelled` |
| `shortage` | `in_production`, `in_procurement`, `ready_to_ship`, `cancelled` |
| `partial_shipped` | `shipped`, `completed` |
| `shipped` | `delivered`, `completed` |
| `delivered` | `completed` |
| `completed` | terminal |
| `cancelled` | terminal |
### salesExchange

- Table: `sales_exchanges`
- Status column: `status`
- Terminal: `completed`, `rejected`
- Values: `pending`, `processing`, `completed`, `rejected`

| From | To |
| --- | --- |
| `pending` | `processing`, `rejected` |
| `processing` | `completed`, `rejected` |
| `completed` | terminal |
| `rejected` | terminal |
### purchaseOrder

- Table: `purchase_orders`
- Status column: `status`
- Terminal: `completed`, `cancelled`
- Values: `draft`, `pending`, `confirmed`, `approved`, `received`, `inspecting`, `inspected`, `warehousing`, `partial_received`, `completed`, `cancelled`

| From | To |
| --- | --- |
| `draft` | `pending`, `cancelled` |
| `pending` | `confirmed`, `approved`, `draft`, `cancelled` |
| `confirmed` | `received`, `partial_received`, `cancelled` |
| `approved` | `received`, `partial_received`, `cancelled` |
| `received` | `partial_received`, `inspecting`, `cancelled` |
| `inspecting` | `inspected`, `cancelled` |
| `inspected` | `warehousing`, `cancelled` |
| `warehousing` | `completed`, `cancelled` |
| `partial_received` | `received`, `inspecting`, `cancelled` |
| `completed` | terminal |
| `cancelled` | terminal |
### purchaseRequisition

- Table: `purchase_requisitions`
- Status column: `status`
- Terminal: `completed`, `cancelled`
- Values: `draft`, `submitted`, `approved`, `rejected`, `completed`, `cancelled`

| From | To |
| --- | --- |
| `draft` | `submitted`, `cancelled` |
| `submitted` | `approved`, `rejected`, `cancelled` |
| `approved` | `completed`, `cancelled` |
| `rejected` | `draft` |
| `completed` | terminal |
| `cancelled` | terminal |
### purchaseReceipt

- Table: `purchase_receipts`
- Status column: `status`
- Terminal: `completed`, `cancelled`
- Values: `draft`, `confirmed`, `inspecting`, `completed`, `cancelled`

| From | To |
| --- | --- |
| `draft` | `confirmed`, `cancelled` |
| `confirmed` | `inspecting`, `completed`, `cancelled` |
| `inspecting` | `completed`, `cancelled` |
| `completed` | terminal |
| `cancelled` | terminal |
### inventoryInbound

- Table: `inventory_inbound`
- Status column: `status`
- Terminal: `completed`, `cancelled`
- Values: `draft`, `confirmed`, `completed`, `cancelled`

| From | To |
| --- | --- |
| `draft` | `confirmed`, `cancelled` |
| `confirmed` | `completed`, `cancelled` |
| `completed` | terminal |
| `cancelled` | terminal |
### inventoryOutbound

- Table: `inventory_outbound`
- Status column: `status`
- Terminal: `completed`, `reversed`, `cancelled`
- Values: `draft`, `confirmed`, `partial_completed`, `completed`, `reversed`, `cancelled`

| From | To |
| --- | --- |
| `draft` | `confirmed`, `cancelled` |
| `confirmed` | `completed`, `partial_completed`, `cancelled` |
| `partial_completed` | `completed` |
| `completed` | terminal |
| `reversed` | terminal |
| `cancelled` | terminal |
### inventoryTransfer

- Table: `inventory_transfers`
- Status column: `status`
- Terminal: `completed`, `cancelled`
- Values: `draft`, `pending`, `approved`, `in_transit`, `completed`, `cancelled`, `rejected`

| From | To |
| --- | --- |
| `draft` | `pending`, `cancelled` |
| `pending` | `approved`, `rejected`, `cancelled` |
| `approved` | `in_transit`, `cancelled` |
| `in_transit` | `completed`, `cancelled` |
| `completed` | terminal |
| `cancelled` | terminal |
| `rejected` | `draft` |
### inventoryCheck

- Table: `inventory_checks`
- Status column: `status`
- Terminal: `completed`, `cancelled`
- Values: `draft`, `in_progress`, `pending`, `completed`, `cancelled`

| From | To |
| --- | --- |
| `draft` | `in_progress`, `cancelled` |
| `in_progress` | `pending`, `completed`, `cancelled` |
| `pending` | `completed`, `cancelled` |
| `completed` | terminal |
| `cancelled` | terminal |
### productionPlan

- Table: `production_plans`
- Status column: `status`
- Terminal: `completed`, `cancelled`
- Values: `draft`, `allocated`, `material_issuing`, `preparing`, `material_issued`, `in_progress`, `paused`, `inspection`, `warehousing`, `completed`, `cancelled`

| From | To |
| --- | --- |
| `draft` | `allocated`, `material_issuing`, `cancelled` |
| `allocated` | `material_issuing`, `cancelled` |
| `material_issuing` | `preparing`, `material_issued`, `cancelled` |
| `preparing` | `material_issued`, `in_progress`, `cancelled` |
| `material_issued` | `in_progress`, `cancelled` |
| `in_progress` | `inspection`, `paused`, `cancelled` |
| `paused` | `in_progress`, `cancelled` |
| `inspection` | `warehousing`, `cancelled` |
| `warehousing` | `completed` |
| `completed` | terminal |
| `cancelled` | terminal |
### productionTask

- Table: `production_tasks`
- Status column: `status`
- Terminal: `completed`, `cancelled`
- Values: `pending`, `allocated`, `material_issuing`, `preparing`, `material_issued`, `material_partial_issued`, `in_progress`, `paused`, `inspection`, `warehousing`, `completed`, `cancelled`

| From | To |
| --- | --- |
| `pending` | `allocated`, `material_issuing`, `cancelled` |
| `allocated` | `material_issuing`, `cancelled` |
| `material_issuing` | `preparing`, `material_issued`, `cancelled` |
| `preparing` | `material_issued`, `material_partial_issued`, `in_progress`, `cancelled` |
| `material_issued` | `in_progress`, `cancelled` |
| `material_partial_issued` | `in_progress`, `cancelled` |
| `in_progress` | `inspection`, `paused`, `cancelled` |
| `paused` | `in_progress`, `cancelled` |
| `inspection` | `in_progress`, `warehousing`, `cancelled` |
| `warehousing` | `completed` |
| `completed` | terminal |
| `cancelled` | terminal |
### productionProcess

- Table: `production_processes`
- Status column: `status`
- Terminal: `completed`, `cancelled`
- Values: `pending`, `in_progress`, `warehousing`, `completed`, `cancelled`

| From | To |
| --- | --- |
| `pending` | `in_progress`, `cancelled` |
| `in_progress` | `warehousing`, `completed`, `cancelled` |
| `warehousing` | `completed` |
| `completed` | terminal |
| `cancelled` | terminal |
### eightDReport

- Table: `eight_d_reports`
- Status column: `status`
- Terminal: `closed`
- Values: `draft`, `in_progress`, `review`, `completed`, `closed`

| From | To |
| --- | --- |
| `draft` | `in_progress`, `review` |
| `in_progress` | `review`, `completed` |
| `review` | `in_progress`, `completed` |
| `completed` | `closed` |
| `closed` | terminal |
### financeInvoice

- Table: `ar_invoices/ap_invoices`
- Status column: `status`
- Terminal: `paid`, `cancelled`
- Values: `draft`, `confirmed`, `partial_paid`, `overdue`, `paid`, `cancelled`

| From | To |
| --- | --- |
| `draft` | `confirmed`, `cancelled` |
| `confirmed` | `partial_paid`, `paid`, `overdue`, `cancelled` |
| `partial_paid` | `paid`, `overdue` |
| `overdue` | `partial_paid`, `paid` |
| `paid` | terminal |
| `cancelled` | terminal |
### glEntry

- Table: `gl_entries`
- Status column: `status`
- Terminal: `reversed`
- Values: `draft`, `posted`, `reversed`

| From | To |
| --- | --- |
| `draft` | `posted` |
| `posted` | `reversed` |
| `reversed` | terminal |
### financePeriod

- Table: `gl_periods`
- Status column: `status`
- Terminal: `locked`
- Values: `open`, `closed`, `locked`

| From | To |
| --- | --- |
| `open` | `closed`, `locked` |
| `closed` | `open`, `locked` |
| `locked` | terminal |

## Data Consistency Rules

| Rule | Severity | Closure | Description |
| --- | --- | --- | --- |
| `gl.posted_entries_balanced` | critical | `recordToReport` | Posted GL entries must balance debit and credit. |
| `inventory.completed_inbound_has_ledger` | critical | `inventoryControl` | Completed inbound documents must have inventory ledger entries. |
| `inventory.completed_outbound_has_ledger` | critical | `inventoryControl` | Completed outbound documents must have inventory ledger entries. |
| `purchase.completed_orders_not_over_received` | high | `procureToPay` | Purchase order received quantities must not exceed ordered quantities. |
| `sales.shipped_orders_not_over_shipped` | high | `orderToCash` | Sales order shipped quantities must not exceed ordered quantities. |
| `production.reports_not_over_task_quantity` | high | `planToProduce` | Production report quantities must not exceed task quantity. |
| `finance.ap_invoice_balance_matches_payments` | critical | `procureToPay` | AP invoice balance must equal total minus approved payments. |
| `finance.ar_invoice_balance_matches_receipts` | critical | `orderToCash` | AR invoice balance must equal total minus approved receipts. |
| `quality.closed_8d_has_closed_phase` | high | `qualityClosedLoop` | Closed 8D reports must have a closed phase. |
