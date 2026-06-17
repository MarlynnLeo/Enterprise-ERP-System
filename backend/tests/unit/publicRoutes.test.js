/* global describe, expect, jest, test */

jest.mock('../../src/controllers/public/productionBoardController', () => ({
  getProductionBoardData: jest.fn(),
  getProductionBoardStats: jest.fn(),
}));

jest.mock('../../src/middleware/authEnhanced', () => ({
  authenticateToken: (_req, _res, next) => next(),
}));

jest.mock('../../src/middleware/requirePermission', () => ({
  requirePermission: () => (_req, _res, next) => next(),
}));

const router = require('../../src/routes/public');

const getRoutes = () =>
  router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

describe('public routes', () => {
  test('registers both production board endpoints', () => {
    const routes = getRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/production-board', methods: ['get'] }),
        expect.objectContaining({ path: '/production-board/stats', methods: ['get'] }),
      ])
    );
    expect(routes.filter((route) => route.path === '/production-board')).toHaveLength(1);
  });
});
