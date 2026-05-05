afterAll(async () => {
  try {
    const cacheService = require('../src/services/cacheService');
    cacheService.clear();
  } catch {
    // Cache service may not be loaded in every test environment.
  }

  try {
    const poolFactory = require('../src/database/ConnectionPoolFactory');
    await poolFactory.closeAll();
  } catch {
    // Ignore teardown errors so failed cleanup does not mask test assertions.
  }

  try {
    const sequelizePath = require.resolve('../src/config/sequelize');
    if (require.cache[sequelizePath]) {
      const sequelize = require('../src/config/sequelize');
      await sequelize.close();
    }
  } catch {
    // Sequelize may not have been initialized in every test environment.
  }

  try {
    const { closeRedis } = require('../src/config/redisClient');
    await closeRedis();
  } catch {
    // Redis may be disabled in tests.
  }
});
