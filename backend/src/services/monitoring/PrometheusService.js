/**
 * Prometheus 监控服务
 * @description 集成 Prometheus 性能监控
 * @date 2025-12-30
 */

const client = require('prom-client');
const logger = require('../../utils/logger');

class PrometheusService {
  constructor() {
    // 创建注册表
    this.register = new client.Registry();

    // 添加默认指标（CPU、内存等）
    if (process.env.NODE_ENV !== 'test') {
      client.collectDefaultMetrics({
        register: this.register,
        prefix: 'erp_',
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
      });
    }

    // 自定义指标
    this.initCustomMetrics();

    logger.info('✅ Prometheus 监控服务已初始化');
  }

  /**
   * 初始化自定义指标
   */
  initCustomMetrics() {
    // HTTP 请求总数
    this.httpRequestsTotal = new client.Counter({
      name: 'erp_http_requests_total',
      help: 'HTTP 请求总数',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register],
    });

    // HTTP 请求持续时间
    this.httpRequestDuration = new client.Histogram({
      name: 'erp_http_request_duration_seconds',
      help: 'HTTP 请求持续时间（秒）',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register],
    });

    // 数据库查询总数
    this.dbQueriesTotal = new client.Counter({
      name: 'erp_db_queries_total',
      help: '数据库查询总数',
      labelNames: ['operation', 'table'],
      registers: [this.register],
    });

    // 数据库查询持续时间
    this.dbQueryDuration = new client.Histogram({
      name: 'erp_db_query_duration_seconds',
      help: '数据库查询持续时间（秒）',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register],
    });

    // 缓存命中率
    this.cacheHits = new client.Counter({
      name: 'erp_cache_hits_total',
      help: '缓存命中总数',
      labelNames: ['cache_type'],
      registers: [this.register],
    });

    this.cacheMisses = new client.Counter({
      name: 'erp_cache_misses_total',
      help: '缓存未命中总数',
      labelNames: ['cache_type'],
      registers: [this.register],
    });

    // 业务指标
    this.businessOperations = new client.Counter({
      name: 'erp_business_operations_total',
      help: '业务操作总数',
      labelNames: ['operation_type', 'status'],
      registers: [this.register],
    });

    // 当前在线用户数
    this.activeUsers = new client.Gauge({
      name: 'erp_active_users',
      help: '当前在线用户数',
      registers: [this.register],
    });

    // 错误总数
    this.errorsTotal = new client.Counter({
      name: 'erp_errors_total',
      help: '错误总数',
      labelNames: ['error_type', 'error_code'],
      registers: [this.register],
    });
  }

  /**
   * 记录 HTTP 请求
   */
  recordHttpRequest(method, route, statusCode, duration) {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode });
    this.httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
  }

  /**
   * 记录数据库查询
   */
  recordDbQuery(operation, table, duration) {
    this.dbQueriesTotal.inc({ operation, table });
    this.dbQueryDuration.observe({ operation, table }, duration);
  }

  /**
   * 记录缓存命中
   */
  recordCacheHit(cacheType) {
    this.cacheHits.inc({ cache_type: cacheType });
  }

  /**
   * 记录缓存未命中
   */
  recordCacheMiss(cacheType) {
    this.cacheMisses.inc({ cache_type: cacheType });
  }

  /**
   * 记录业务操作
   */
  recordBusinessOperation(operationType, status) {
    this.businessOperations.inc({ operation_type: operationType, status });
  }

  /**
   * 设置在线用户数
   */
  setActiveUsers(count) {
    this.activeUsers.set(count);
  }

  /**
   * 记录错误
   */
  recordError(errorType, errorCode) {
    this.errorsTotal.inc({ error_type: errorType, error_code: errorCode });
  }

  /**
   * 获取指标数据
   */
  async getMetrics() {
    return this.register.metrics();
  }

  /**
   * 获取指标内容类型
   */
  getContentType() {
    return this.register.contentType;
  }
}

// 创建单例
const prometheusService = new PrometheusService();

module.exports = prometheusService;
