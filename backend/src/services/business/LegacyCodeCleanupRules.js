const legacyCleanupCandidates = [
  {
    path: 'frontend/src/constants/purchaseConstants.js',
    replacement: 'frontend/src/constants/systemConstants.js purchase_status dictionary helpers for status labels/options',
    reason: 'Purchase status display options should come from business_types instead of a static frontend map.',
  },
  {
    path: 'backend/src/constants/systemConstants.js',
    replacement: 'backend/src/constants/statusRegistry.js plus business_types dictionary groups',
    reason: 'Backend status transitions should be registered in statusRegistry while user-facing labels come from the dictionary table.',
  },
];

module.exports = {
  legacyCleanupCandidates,
};
