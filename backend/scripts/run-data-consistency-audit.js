const { auditDataConsistency } = require('./audit-shared');

auditDataConsistency().then(() => {
  process.exit(process.exitCode || 0);
}).catch(error => {
  console.error(error);
  process.exit(1);
});
