/**
 * Explicit cleanup candidates for legacy paths that remain during migration.
 *
 * The list is intentionally declarative so closure audits can verify every
 * known legacy surface has a documented replacement before removal.
 */

const legacyCleanupCandidates = [];

module.exports = {
  legacyCleanupCandidates,
};
