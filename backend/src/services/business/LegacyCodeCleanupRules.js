/**
 * Explicit cleanup candidates for legacy paths that remain during migration.
 *
 * The list is intentionally declarative so closure audits can verify every
 * known legacy surface has a documented replacement before removal.
 */

const legacyCleanupCandidates = [
  {
    path: 'backend/database/migrations',
    replacement: 'backend/migrations',
    reason: 'Knex startup migrations are sourced from the canonical migrations directory.',
  },
  {
    path: 'backend/src/services/cacheService.js',
    replacement: 'backend/src/services/cache/CacheManager.js',
    reason: 'The cache manager owns Redis/memory selection and lifecycle management.',
  },
  {
    path: 'frontend/src/services/api.js',
    replacement: 'frontend/src/api/index.js',
    reason: 'The service entry is retained as a compatibility shim for older imports.',
  },
  {
    path: 'mobile/src/services/api.js',
    replacement: 'mobile/src/api/index.js',
    reason: 'Mobile API access should converge on the canonical API module structure.',
  },
];

module.exports = {
  legacyCleanupCandidates,
};
