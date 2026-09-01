'use strict';

// A private module token prevents HTTP callers or ordinary business code from
// invoking the formal ledger writer without going through InventoryPostingService.
const INTERNAL_POSTING_TOKEN = Symbol('inventory-formal-posting');

module.exports = { INTERNAL_POSTING_TOKEN };
