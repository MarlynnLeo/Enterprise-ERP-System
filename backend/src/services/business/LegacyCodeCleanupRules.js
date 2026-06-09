const legacyCleanupCandidates = [
  {
    path: 'backend/src/services/cacheService.js',
    replacement: 'backend/src/services/cache/CacheManager.js',
    reason: 'Legacy cache facade was replaced by the centralized cache manager.',
  },
  {
    path: 'frontend/src/services/api.js',
    replacement: 'frontend/src/services/axiosInstance.js',
    reason: 'Frontend API calls should use the shared axios instance instead of the old service singleton.',
  },
  {
    path: 'mobile/src/services/api.js',
    replacement: 'mobile/src/api/index.js',
    reason: 'Mobile API calls were consolidated under the mobile API module.',
  },
];

module.exports = {
  legacyCleanupCandidates,
};
