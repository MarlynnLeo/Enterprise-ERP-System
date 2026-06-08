const { auditDataConsistency } = require('./audit-shared');

auditDataConsistency().catch(error => {
  console.error(error);
  process.exit(1);
});
