'use strict';

// The operation must own rollback/release and contain only transactional database
// effects. Never retry individual statements in a transaction MySQL has aborted.
module.exports = async function retryDeadlockedTransaction(operation, { attempts = 3 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code !== 'ER_LOCK_DEADLOCK' || attempt + 1 >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
};
