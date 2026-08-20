/**
 * app.js
 * @description 应用程序主配置文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const cors = require('cors');
const { createCorsOptions } = require('./config/cors');
// body-parser 已弃用，使用 Express 内置的 json()/urlencoded()
const helmet = require('helmet');
const compression = require('compression'); // API响应压缩
const cookieParser = require('cookie-parser');
const { ResponseHandler } = require('./utils/responseHandler');

const app = express();

// ==================== 信任代理配置 ====================
// Never trust an arbitrary number of proxy hops.  The deployment must list
// the actual reverse-proxy CIDRs; with no list, forwarded headers are ignored.
if (process.env.NODE_ENV === 'production') {
  const trustedProxyCidrs = String(process.env.TRUST_PROXY_CIDRS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.set('trust proxy', trustedProxyCidrs.length ? trustedProxyCidrs : false);
  if (!trustedProxyCidrs.length) {
    // Secure cookie mode remains forced in production; this warning makes a
    // missing edge trust-boundary configuration visible during deployment.
    // Do not silently fall back to trust-proxy=1.
    process.emitWarning('TRUST_PROXY_CIDRS is not configured; forwarded client headers are not trusted');
  }
}

// 导入路由
// 移除未使用的routes导入
const purchaseRoutes = require('./routes/purchaseRoutes');
const qualityRoutes = require('./routes/qualityRoutes');
const financeRoutes = require('./routes/financeRoutes');
const financeEnhancementRoutes = require('./routes/financeEnhancement');
const baseDataRoutes = require('./routes/baseData');
const inventoryRoutes = require('./routes/inventory');
const systemRoutes = require('./routes/system');
const authRoutes = require('./routes/auth');
// 业务模块路由
const productionRoutes = require('./routes/production');
const salesRoutes = require('./routes/sales');
const todoRoutes = require('./routes/todoRoutes');
const equipmentRoutes = require('./routes/equipmentRoutes');
const printRoutes = require('./routes/printRoutes');
const healthRoutes = require('./routes/health');
const equipmentMonitoringRoutes = require('./routes/equipmentMonitoring');
const financeAutomationRoutes = require('./routes/business/finance/financeAutomationRoutes');
const taxRoutes = require('./routes/business/finance/taxRoutes');
const budgetRoutes = require('./routes/business/finance/budgetRoutes');
const costCenterRoutes = require('./routes/business/finance/costCenterRoutes');
const costLedgerRoutes = require('./routes/business/finance/costLedgerRoutes');
const activityCostRoutes = require('./routes/business/finance/activityCostRoutes');
const metalPricesRoutes = require('./routes/business/metalPrices');
const monitoringRoutes = require('./routes/monitoring');
const batchTraceabilityRoutes = require('./routes/business/traceability/batchTraceabilityRoutes');
const traceabilityMonitorRoutes = require('./routes/business/traceability/traceabilityMonitorRoutes');
const publicRoutes = require('./routes/public');
const notificationRoutes = require('./routes/system/notificationRoutes');
const notificationRuleRoutes = require('./routes/system/notificationRuleRoutes');
const technicalCommunicationRoutes = require('./routes/system/technicalCommunicationRoutes');
const nonconformingProductRoutes = require('./routes/business/nonconformingProductRoutes');
const replacementOrderRoutes = require('./routes/business/replacementOrderRoutes');
const reworkTaskRoutes = require('./routes/business/reworkTaskRoutes');
const scrapRecordRoutes = require('./routes/business/scrapRecordRoutes');
const eightDReportRoutes = require('./routes/business/eightDReportRoutes');
const qualityAdvancedRoutes = require('./routes/business/qualityAdvancedRoutes');
const qualityStatisticsRoutes = require('./routes/business/qualityStatisticsRoutes');
const weatherRoutes = require('./routes/weather');
const commonRoutes = require('./routes/common');
const hrRoutes = require('./routes/hrRoutes');
const chatRoutes = require('./routes/chat');
const workflowRoutes = require('./routes/business/workflowRoutes');
const contractRoutes = require('./routes/business/contractRoutes');
const enhancedModulesRoutes = require('./routes/business/enhancedModulesRoutes');
const userActivityRoutes = require('./routes/userActivityRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const dingtalkRoutes = require('./routes/integrations/dingtalkRoutes');
const anomalyReportRoutes = require('./routes/business/anomalyReportRoutes');
const productionAssistRoutes = require('./routes/business/productionAssistRoutes');
const assemblyRoutes = require('./routes/business/assemblyRoutes');
const employeeSkillRoutes = require('./routes/business/employeeSkillRoutes');

// 表结构由 Knex 迁移文件统一管理

// 导入错误处理中间件
const {
  unifiedErrorHandler,
  notFoundHandler,
  handleUncaughtException,
  handleUnhandledRejection,
} = require('./middleware/unifiedErrorHandler');
const { logger } = require('./utils/logger');
const { isHttpsRequest } = require('./utils/cookieSecurity');
const DLQService = require('./services/business/DLQService');

// 导入 CSRF 保护中间件
const {
  conditionalCsrfProtection,
  csrfErrorHandler,
  getCsrfToken: getCsrfTokenEnhanced,
} = require('./middleware/csrfEnhanced');

// 导入安全配置

// 导入 Prometheus 监控
const prometheusService = require('./services/monitoring/PrometheusService');
const prometheusMiddleware = require('./middleware/prometheusMiddleware');

// 设置全局异常处理
handleUncaughtException();
handleUnhandledRejection();

const corsOptions = createCorsOptions();

// ==================== 安全中间件配置 ====================

// 1. Helmet - 设置安全HTTP头
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    // 生产环境启用 HSTS（仅 HTTPS 生效；开发 HTTP 不强制）
    hsts: false, // set per-request below for mixed HTTP/HTTPS entry points
    crossOriginEmbedderPolicy: false, // 允许跨域资源
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);


// Only advertise HSTS on actual HTTPS requests so internal HTTP entry points
// are not permanently upgraded by the browser.
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && isHttpsRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// 1.5 API响应压缩 - 显著减少响应体积
app.use(
  compression({
    level: 6, // 压缩级别 1-9，6是性能和压缩率的平衡点
    threshold: 1024, // 只压缩大于1KB的响应
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

// 2. 请求链路追踪 — 为每个请求注入 traceId
const traceIdMiddleware = require('./middleware/traceId');
app.use(traceIdMiddleware);

// 2.5. Cookie解析器（用于JWT Cookie）
app.use(cookieParser());

// 3. CORS配置
app.use(cors(corsOptions));

// 4. Body解析器（使用 Express 内置方法，替代已弃用的 body-parser）
app.use(express.json({ limit: '10mb' }));
// Older cached clients sent the JSON primitive `null` when refreshing a
// cookie-backed session. Express rejects primitives in strict JSON mode before
// the refresh route can read its HttpOnly cookie. Keep this compatibility path
// narrowly scoped; every other malformed body remains a client error.
app.use((err, req, _res, next) => {
  const isLegacyNullRefresh =
    err?.type === 'entity.parse.failed' &&
    req.method === 'POST' &&
    req.path === '/api/auth/refresh' &&
    String(err.body || '').trim() === 'null';

  if (isLegacyNullRefresh) {
    req.body = {};
    logger.info('Accepted legacy empty refresh body', { traceId: req.traceId });
    return next();
  }

  return next(err);
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. 速率限制 - 使用统一配置
if (process.env.ENABLE_RATE_LIMIT !== 'false') {
  const { apiLimiter, authLimiter, mfaLimiter } = require('./middleware/rateLimiter');

  app.use('/api/', apiLimiter);
  // 6. 登录限制已在路由注册处处理，或此处单独处理
  // 注意：如果在路由注册前 app.use('/api/auth/login', authLimiter) 会生效
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/mfa', mfaLimiter);
}

// 7. 输入验证和清理中间件（在处理请求体之后）
const { validateAndSanitizeInput, detectSQLInjection } = require('./middleware/inputValidation');
const { pathTraversalDetection, xssDetection } = require('./middleware/securityEnhanced');
if (process.env.ENABLE_INPUT_SANITIZATION !== 'false') {
  // ✅ 执行顺序优化: 先检测拒绝，后清理转义
  // 检测型中间件必须在清理型之前，否则数据被 escape 后检测永远不会触发
  app.use(pathTraversalDetection);
  app.use(detectSQLInjection);
  app.use(xssDetection);
  app.use(validateAndSanitizeInput);
  logger.info('Input security middleware enabled: path traversal, SQL injection, XSS, and sanitization');
}

// 添加响应格式化中间件
app.use((_, res, next) => {
  // 为响应对象添加格式化方法
  res.success = (data, message = '操作成功') => {
    return ResponseHandler.success(res, data, message);
  };

  res.error = (message = '操作失败', errorCode = 'ERROR', statusCode = 500) => {
    return ResponseHandler.error(res, message, errorCode, statusCode);
  };

  res.paginated = (list, total, page, pageSize, message = '查询成功') => {
    return ResponseHandler.paginated(res, list, total, page, pageSize, message);
  };

  next();
});

// 静态文件服务 - 分级访问控制
// ✅ 修复: 定义 uploadsAuth / metricsAuth（此前未定义导致 ReferenceError 崩溃）
const { authenticateToken: uploadsAuth } = require('./middleware/authEnhanced');
const metricsAuth = uploadsAuth; // metrics 端点复用同一认证中间件
const { requirePermission } = require('./middleware/requirePermission');
const { createUploadFileAccessMiddleware } = require('./middleware/uploadFileAccess');
const metricsPermission = requirePermission('system:monitor');

// 公开可访问的上传目录（头像等登录前需要加载的资源）
const PUBLIC_UPLOAD_DIRS = ['/avatars', '/public', '/logos'];
const UPLOADS_ROOT = path.resolve('uploads');
const uploadFileDownloadPermission = requirePermission('system:files:download');
const uploadDocumentPermission = requirePermission([
  'system:documents:view',
  'system:files:download',
]);

function normalizeUploadRequestPath(requestPath) {
  const rawPath = String(requestPath || '').replace(/\\/g, '/');
  return path.posix.normalize(`/${rawPath}`);
}

function decodeUploadRequestPath(requestPath) {
  try {
    return decodeURIComponent(String(requestPath || ''));
  } catch {
    return null;
  }
}

function isUploadPathInDir(requestedPath, dir) {
  return requestedPath === dir || requestedPath.startsWith(`${dir}/`);
}

function permissionForUploadPath(requestedPath) {
  if (isUploadPathInDir(requestedPath, '/documents')) {
    return uploadDocumentPermission;
  }
  return uploadFileDownloadPermission;
}

function getStaticUploadPath(filePath) {
  const relativePath = path.relative(UPLOADS_ROOT, filePath).replace(/\\/g, '/');
  return normalizeUploadRequestPath(relativePath);
}

function setUploadStaticHeaders(res, filePath) {
  const staticPath = getStaticUploadPath(filePath);
  const isPublicDir = PUBLIC_UPLOAD_DIRS.some((dir) => isUploadPathInDir(staticPath, dir));
  if (isPublicDir) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return;
  }
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
}
const uploadObjectAccessPermission = createUploadFileAccessMiddleware(permissionForUploadPath);

app.use(
  '/uploads',
  (req, res, next) => {
    // 安全检查：禁止路径遍历（如 ../）
    const decodedPath = decodeUploadRequestPath(req.path);
    if (decodedPath === null) {
      return ResponseHandler.error(res, 'Invalid file path', 'VALIDATION_ERROR', 400);
    }
    const rawPath = decodedPath.replace(/\\/g, '/');
    const requestedPath = normalizeUploadRequestPath(rawPath);
    if (rawPath.split('/').includes('..')) {
      return ResponseHandler.forbidden(res, '禁止访问');
    }

    // 公开目录无需认证（解决登录页面加载头像时401循环）
    const isPublicDir = PUBLIC_UPLOAD_DIRS.some((dir) => isUploadPathInDir(requestedPath, dir));
    if (isPublicDir) {
      return next();
    }

    // 非公开目录需要认证（保护合同、发票、BOM附件等敏感文件）
    req.uploadsRequestedPath = requestedPath;
    return uploadsAuth(req, res, () => uploadObjectAccessPermission(req, res, next));
  },
  express.static(UPLOADS_ROOT, {
    etag: true,
    lastModified: true,
    setHeaders: setUploadStaticHeaders,
  })
);

// 在线时长追踪中间件
const onlineTimeTracker = require('./middleware/onlineTimeTracker');
app.use(onlineTimeTracker.createMiddleware());

// ✅ Prometheus 监控中间件（记录所有 HTTP 请求）
app.use(prometheusMiddleware);

// Prometheus 指标端点：一律要求认证 + system:monitor（禁止仅凭内网 IP 免鉴权）
app.get(
  '/metrics',
  metricsAuth,
  metricsPermission,
  async (_, res) => {
    try {
      res.set('Content-Type', prometheusService.getContentType());
      const metrics = await prometheusService.getMetrics();
      res.end(metrics);
    } catch (error) {
      res.status(500).end(error.message);
    }
  }
);

// 健康检查端点（/api/* 与根路径别名并存，兼容 LB / K8s / 代理剥前缀）
const publicPingHandler = (_, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'KACON ERP Backend is running',
  });
};

const publicHealthHandler = async (_, res) => {
  // [A-2 修复] 真实探测数据库状态，而非硬编码
  let dbStatus = 'disconnected';
  try {
    await require('./config/db').pool.execute('SELECT 1');
    dbStatus = 'connected';
  } catch (err) {
    logger.error('健康检查: 数据库连接失败', err.message);
  }

  const isHealthy = dbStatus === 'connected';
  // Keep the public probe deliberately opaque.  Component/version details
  // belong to the authenticated /api/health/* monitoring endpoints.
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
  });
};

app.get('/api/ping', publicPingHandler);
app.get('/ping', publicPingHandler);
app.get('/api/health', publicHealthHandler);
app.get('/health', publicHealthHandler);

// CSRF Token 获取端点（须在 CSRF 校验中间件之前注册，且始终公开可访问）
app.get('/api/csrf-token', getCsrfTokenEnhanced);
// 兼容少数代理把 /api 剥掉后的访问
app.get('/csrf-token', getCsrfTokenEnhanced);

// 启用CSRF保护（条件性）
if (process.env.ENABLE_CSRF !== 'false') {
  app.use(conditionalCsrfProtection);
}

// 性能统计端点（已移至 /api/monitoring 路由）

// 路由注册
const apiRouteModules = [
  ['/auth', authRoutes],
  ['/system', systemRoutes],
  ['/base-data', baseDataRoutes],
  ['/inventory', inventoryRoutes],
  ['/purchase', purchaseRoutes],
  ['/sales', salesRoutes],
  ['/quality', qualityRoutes],
  ['/quality', qualityAdvancedRoutes],
  ['/production', productionRoutes],
  ['/finance/automation', financeAutomationRoutes],
  ['/finance', financeRoutes],
  ['/finance', financeEnhancementRoutes],
  ['/equipment', equipmentRoutes],
  ['/print', printRoutes],
  ['/user-activities', userActivityRoutes],
  ['/health', healthRoutes],
  ['/equipment-monitoring', equipmentMonitoringRoutes],
  ['/finance/tax', taxRoutes],
  ['/finance/budgets', budgetRoutes],
  ['/finance/cost-centers', costCenterRoutes],
  ['/finance/cost-ledger', costLedgerRoutes],
  ['/finance/activity-cost', activityCostRoutes],
  ['/metal-prices', metalPricesRoutes],
  ['/hr', hrRoutes],
  ['/monitoring', monitoringRoutes],
  ['/batch-traceability', batchTraceabilityRoutes],
  ['/traceability-monitor', traceabilityMonitorRoutes],
  ['/system/notifications', notificationRoutes],
  ['/system/notification-rules', notificationRuleRoutes],
  ['/system/technical-communications', technicalCommunicationRoutes],
  ['/quality/nonconforming-products', nonconformingProductRoutes],
  ['/quality/replacement-orders', replacementOrderRoutes],
  ['/quality/rework-tasks', reworkTaskRoutes],
  ['/quality/scrap-records', scrapRecordRoutes],
  ['/quality/eight-d-reports', eightDReportRoutes],
  ['/quality/statistics', qualityStatisticsRoutes],
  ['/weather', weatherRoutes],
  ['/upload', uploadRoutes],
  ['/todos', todoRoutes],
  ['/common', commonRoutes],
  ['/chat', chatRoutes],
  ['/dingtalk', dingtalkRoutes],
  ['/workflow', workflowRoutes],
  ['/contracts', contractRoutes],
  ['/enhanced', enhancedModulesRoutes],
  ['/production/anomaly-reports', anomalyReportRoutes],
  ['/production/assist', productionAssistRoutes],
  ['/production/assembly', assemblyRoutes],
  ['/hr/skills', employeeSkillRoutes],
];

const registerApiRouteModules = (router, prefix = '') => {
  apiRouteModules.forEach(([routePath, routeModule]) => {
    router.use(`${prefix}${routePath}`, routeModule);
  });
};

// ==================== API 文档 ====================
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const enableApiDocs =
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true';
if (enableApiDocs) {
  const apiDocsAccessControl =
    process.env.NODE_ENV === 'production' ? [uploadsAuth, metricsPermission] : [];
  app.use(
    '/api-docs',
    ...apiDocsAccessControl,
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'ERP API 文档',
    })
  );
}

// 公开路由（无需认证）- 必须在其他路由之前注册
app.use('/api/public', publicRoutes);

// ✅ 挂载全域操作黑匣子拦截器 (拦截带副作用的POST/PUT/DELETE)
const auditLogInterceptor = require('./middleware/auditLogInterceptor');
app.use('/api/*', auditLogInterceptor);

// 注册各个模块的路由（登录接口限流已在上方配置）
// app.use('/api/auth/login', loginLimiter); // 已移除，改用 authLimiter// 注册业务路由
registerApiRouteModules(app, '/api');
// /api/cost-ledger 已移除（与 /api/finance/cost-ledger 重复），统一使用 /api/finance/cost-ledger

// 数据库表结构由 Knex 迁移文件 (migrations/) 统一管理，启动时由 index.js 自动执行。

// 根路径
app.get('/', (_, res) => {
  res.send('工厂管理系统API服务正在运行');
});

// /api 索引（避免裸 GET /api 被记为 notFound 噪音）
app.get('/api', (_, res) => {
  res.json({
    success: true,
    message: 'KACON ERP API',
    health: '/api/health',
    ping: '/api/ping',
    docs: process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true' ? '/api-docs' : undefined,
    timestamp: new Date().toISOString(),
  });
});

// 浏览器默认探测资源：静默 204，避免刷 notFound 警告日志
// 前端实际图标为 /favicon.svg（由 Vite/nginx 提供）；API 服务本身无站点图标
app.get(['/favicon.ico', '/robots.txt'], (_req, res) => {
  res.status(204).end();
});

// 使用统一的错误处理中间件
app.use(csrfErrorHandler); // CSRF错误处理必须在其他错误处理之前
app.use(notFoundHandler);
app.use(unifiedErrorHandler);

const isTestRuntime = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;

if (!isTestRuntime) {
  // 缓存管理器由 index.js startServer() 统一初始化，此处不再重复

  // ✅ 启动并挂载各领域事件订阅者 (Domain Event Subscribers)
  require('./events/subscribers/FinanceSubscriber');
  require('./events/subscribers/NotificationSubscriber');
  require('./events/EventBus').enableCriticalListenerAudit();
  DLQService.startRetryWorker();

  // 启动财务自动化定时任务（DISABLE_CRON=true 时跳过）
  if (process.env.DISABLE_CRON !== 'true') {
    const ScheduledTaskService = require('./services/business/ScheduledTaskService');
    const scheduledTaskTimer = setTimeout(() => {
      try {
        ScheduledTaskService.startAllTasks();
      } catch (error) {
        logger.warn('Finance automation scheduled tasks failed to start:', error.message);
      }
    }, 5000);
    scheduledTaskTimer.unref?.();
  }
}

module.exports = app;
