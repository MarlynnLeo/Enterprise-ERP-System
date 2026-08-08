/**
 * NonconformingProductService — facade
 * Implementation split into ./nonconformingProduct/*Methods.js
 * Public API unchanged (Object.assign mixins).
 */

const createMethods = require('./nonconformingProduct/createMethods');
const dispositionMethods = require('./nonconformingProduct/dispositionMethods');
const queryMethods = require('./nonconformingProduct/queryMethods');
const concessionMethods = require('./nonconformingProduct/concessionMethods');

class NonconformingProductService {}

Object.assign(
  NonconformingProductService,
  createMethods,
  dispositionMethods,
  queryMethods,
  concessionMethods
);

module.exports = NonconformingProductService;
