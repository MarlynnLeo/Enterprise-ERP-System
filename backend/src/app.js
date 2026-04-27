/**
 * app.js
 * @description 应用程序主配置文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const cors = require('cors');
// body-parser 已弃用，使用 Express 内置的 json()/urlencoded()
const helmet = require('helmet');
const compression = require('compression'); // API响应压缩
const cookieParser = require('cookie-parser');
const { ResponseHandler } = require('./utils/responseHandler');

const app = express();

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
const locationsRoutes = require('./routes/locations');
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
const mrpRoutes = require('./routes/business/mrpRoutes');
const enhancedModulesRoutes = require('./routes/business/enhancedModulesRoutes');

// 模型导入已移除 — 原 createPurchaseTablesIfNotExist / createFinanceTablesIfNotExist 已为空操作
// 表结构由 Knex 迁移文件统一管理

// 导入错误处理中间件
const {
  unifiedErrorHandler,
  notFoundHandler,
  handleUncaughtException,
  handleUnhandledRejection,
} = require('./middleware/unifiedErrorHandler');
const logger = require('./utils/logger'); // console.log 已全部替换，现在启用

// 导入 CSRF 保护中间件
const {
  conditionalCsrfProtection,
  csrfErrorHandler,
  getCsrfToken: getCsrfTokenEnhanced,
} = require('./middleware/csrfEnhanced');

// 导入 Swagger 配置
const { specs, swaggerUi, swaggerUiOptions } = require('./config/swagger');

// 导入安全配置

// 导入 Prometheus 监控
const prometheusService = require('./services/monitoring/PrometheusService');
const prometheusMiddleware = require('./middleware/prometheusMiddleware');

// 设置全局异常处理
handleUncaughtException();
handleUnhandledRejection();

// 配置CORS - 更安全的配置
const corsOptions = {
  origin: function (origin, callback) {
    const isProd = process.env.NODE_ENV === 'production';

    // 获取允许的源列表
    const raw = process.env.ALLOWED_ORIGINS || '';
    const allowedOrigins = raw
      ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      : [];

    // 开发环境默认允许的本地地址
    const devOrigins = [
      'http://localhost:3000',
      'http://localhost:3100',
      'http://localhost:3101',
      'http://localhost:3102',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3100',
      'http://127.0.0.1:3101',
      'http://127.0.0.1:3102',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      // HTTPS（移动端 Vite 使用 basicSsl 插件）
      'https://localhost:3100',
      'https://localhost:3101',
      'https://localhost:3102',
      'https://127.0.0.1:3100',
      'https://127.0.0.1:3101',
      'https://127.0.0.1:3102',
    ];

    // 开发环境：允许所有局域网IP
    if (!isProd) {
      if (!origin) return callback(null, true); // 同源请求

      // 允许 localhost 和 127.0.0.1
      if (devOrigins.includes(origin) || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // 允许局域网IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      const ipPattern = /^(http|https):\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/;
      if (ipPattern.test(origin)) {
        return callback(null, true);
      }

      logger.warn(`开发环境拒绝未授权的CORS请求: ${origin}`);
      return callback(new Error(`开发环境未授权的来源: ${origin}`));
    }

    // 生产环境：严格检查
    if (allowedOrigins.length === 0) {
      logger.error('生产环境未配置 ALLOWED_ORIGINS 环境变量');
      return callback(new Error('CORS配置错误'));
    }

    // 允许没有origin的请求（如移动应用、服务器到服务器、curl测试）
    // ✅ 安全增强：生产环境下记录这类请求以便安全审计
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        // [A-1 修复] origin 回调中无 req 变量，仅记录无 Origin 事实
        logger.info('CORS: 允许无 Origin 请求 (可能是服务端调用或健康检查)');
      }
      return callback(null, true);
    }

    // 精确匹配白名单
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    logger.warn(`生产环境拒绝未授权的CORS请求: ${origin}`);
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true, // 允许携带Cookie
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
  exposedHeaders: ['X-CSRF-Token', 'X-Request-ID'],
  maxAge: 86400, // 24小时
};

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
    crossOriginEmbedderPolicy: false, // 允许跨域资源
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

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

// 2. Cookie解析器（用于JWT Cookie）
app.use(cookieParser());

// 3. CORS配置
app.use(cors(corsOptions));

// 4. Body解析器（使用 Express 内置方法，替代已弃用的 body-parser）
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. 速率限制 - 使用统一配置
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');

// 应用全局速率限制
if (process.env.ENABLE_RATE_LIMIT !== 'false') {
  app.use('/api/', apiLimiter);
}

// 6. 登录限制已在路由注册处处理，或此处单独处理
// 注意：如果在路由注册前 app.use('/api/auth/login', authLimiter) 会生效
app.use('/api/auth/login', authLimiter);

// 7. 输入验证和清理中间件（在处理请求体之后）
const { validateAndSanitizeInput, detectSQLInjection } = require('./middleware/inputValidation');
const { pathTraversalDetection, xssDetection } = require('./middleware/securityEnhanced');
if (process.env.ENABLE_INPUT_SANITIZATION !== 'false') {
  app.use(validateAndSanitizeInput);
  app.use(detectSQLInjection);
  // ✅ 安全修复: 挂载路径遍历和XSS检测中间件（此前已实现但未启用）
  app.use(pathTraversalDetection);
  app.use(xssDetection);
  logger.info('✅ 输入验证、SQL注入检测、路径遍历检测和XSS检测已启用');
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
const path = require('path');

// ✅ 修复: 定义 uploadsAuth / metricsAuth（此前未定义导致 ReferenceError 崩溃）
const { authenticateToken: uploadsAuth } = require('./middleware/authEnhanced');
const metricsAuth = uploadsAuth; // metrics 端点复用同一认证中间件

// 公开可访问的上传目录（头像等登录前需要加载的资源）
const PUBLIC_UPLOAD_DIRS = ['/avatars', '/public', '/logos'];

app.use('/uploads', (req, res, next) => {
  // 安全检查：禁止路径遍历（如 ../）
  const requestedPath = path.normalize(req.path);
  if (requestedPath.includes('..')) {
    return res.status(403).json({ success: false, message: '禁止访问' });
  }

  // 公开目录无需认证（解决登录页面加载头像时401循环）
  const isPublicDir = PUBLIC_UPLOAD_DIRS.some(dir => requestedPath.startsWith(dir));
  if (isPublicDir) {
    return next();
  }

  // 非公开目录需要认证（保护合同、发票、BOM附件等敏感文件）
  return uploadsAuth(req, res, next);
}, express.static('uploads'));

// 在线时长追踪中间件
const onlineTimeTracker = require('./middleware/onlineTimeTracker');
app.use(onlineTimeTracker.createMiddleware());

// ✅ Prometheus 监控中间件（记录所有 HTTP 请求）
app.use(prometheusMiddleware);

// Prometheus 指标端点 - 仅允许内网IP或已认证用户访问
app.get('/metrics', (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || '';
  const isInternalIp = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|::1|::ffff:127\.)/.test(ip);
  if (isInternalIp) {
    return next();
  }
  // 非内网IP需要认证
  return metricsAuth(req, res, next);
}, async (_, res) => {
  try {
    res.set('Content-Type', prometheusService.getContentType());
    const metrics = await prometheusService.getMetrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error.message);
  }
});

// 健康检查端点
app.get('/api/ping', (_, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'MES Backend is running',
  });
});

// 启用CSRF保护（条件性）
if (process.env.ENABLE_CSRF !== 'false') {
  app.use(conditionalCsrfProtection);
}

// CSRF Token 获取端点
app.get('/api/csrf-token', getCsrfTokenEnhanced);

app.get('/api/health', async (_, res) => {
  // [A-2 修复] 真实探测数据库状态，而非硬编码
  let dbStatus = 'disconnected';
  try {
    await require('./config/db').pool.execute('SELECT 1');
    dbStatus = 'connected';
  } catch (err) {
    logger.error('健康检查: 数据库连接失败', err.message);
  }

  const isHealthy = dbStatus === 'connected';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: dbStatus,
  });
});

// 性能统计端点（已移至 /api/monitoring 路由）

// 路由注册
// ✅ API 版本控制 — /api/v1/* 映射到 /api/*（向前兼容）
// 现有 /api/ 路径继续工作，新客户端建议使用 /api/v1/ 前缀
const v1Router = express.Router();
app.use('/api/v1', v1Router);

// 公开路由（无需认证）- 必须在其他路由之前注册
app.use('/api/public', publicRoutes);
v1Router.use('/public', publicRoutes);

// ✅ 挂载全域操作黑匣子拦截器 (拦截带副作用的POST/PUT/DELETE)
const auditLogInterceptor = require('./middleware/auditLogInterceptor');
app.use('/api/*', auditLogInterceptor);

// 注册各个模块的路由（登录接口限流已在上方配置）
// app.use('/api/auth/login', loginLimiter); // 已移除，改用 authLimiter// 注册业务路由
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/base-data', baseDataRoutes); // 注意连字符
app.use('/api/baseData', baseDataRoutes); // 别名：兼容前端使用的驼峰命名
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/quality', qualityRoutes);
app.use('/api/quality', qualityAdvancedRoutes); // 量具/SPC/供应商质量计分卡
app.use('/api/production', productionRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/finance-enhancement', financeEnhancementRoutes); // ✅ 注册新的财务增强路由
app.use('/api/equipment', equipmentRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/print', printRoutes);
app.use('/api/user-activities', require('./routes/userActivityRoutes'));
app.use('/api/health', healthRoutes);
app.use('/api/equipment-monitoring', equipmentMonitoringRoutes);
app.use('/api/finance/automation', financeAutomationRoutes);
app.use('/api/finance/tax', taxRoutes);
app.use('/api/finance/budgets', budgetRoutes);
app.use('/api/finance/cost-centers', costCenterRoutes);
app.use('/api/finance/cost-ledger', costLedgerRoutes);
app.use('/api/finance/activity-cost', activityCostRoutes);
app.use('/api/cost-ledger', costLedgerRoutes); // 将原 costRoutes 重命名或映射
app.use('/api/metal-prices', metalPricesRoutes); // 金属价格监控
app.use('/api/hr', hrRoutes); // HR及薪酬模块
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/batch-traceability', batchTraceabilityRoutes);
app.use('/api/traceability-monitor', traceabilityMonitorRoutes);

app.use('/api/notifications', notificationRoutes);
app.use('/api/technical-communications', technicalCommunicationRoutes);
app.use('/api/nonconforming-products', nonconformingProductRoutes);
app.use('/api/replacement-orders', replacementOrderRoutes);
app.use('/api/rework-tasks', reworkTaskRoutes);
app.use('/api/scrap-records', scrapRecordRoutes);
app.use('/api/eight-d-reports', eightDReportRoutes);
app.use('/api/quality-statistics', qualityStatisticsRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/todos', todoRoutes); // 待办事项路由
app.use('/api/common', commonRoutes); // 通用接口（枚举等）
app.use('/api/chat', chatRoutes); // 即时通讯
app.use('/api/dingtalk', require('./routes/integrations/dingtalkRoutes')); // 钉钉集成
app.use('/api/workflow', workflowRoutes); // 审批工作流
app.use('/api/contracts', contractRoutes); // 合同管理
app.use('/api/mrp', mrpRoutes); // MRP物料需求计划
app.use('/api/enhanced', enhancedModulesRoutes); // 编码规则/单据关联/汇率/绩效/ECN/文档/告警

// ✅ API v1 版本路由别名 — 将所有核心模块同时挂载到 /api/v1/ 下
// 新客户端建议使用 /api/v1/ 前缀，未来破坏性变更将通过 /api/v2/ 发布
const v1Modules = {
  '/auth': authRoutes, '/system': systemRoutes,
  '/base-data': baseDataRoutes, '/baseData': baseDataRoutes,
  '/inventory': inventoryRoutes, '/purchase': purchaseRoutes,
  '/sales': salesRoutes, '/quality': qualityRoutes,
  '/production': productionRoutes, '/finance': financeRoutes,
  '/finance-enhancement': financeEnhancementRoutes,
  '/equipment': equipmentRoutes, '/locations': locationsRoutes,
  '/todos': todoRoutes, '/common': commonRoutes,
};
Object.entries(v1Modules).forEach(([path, router]) => v1Router.use(path, router));

// 数据库表结构由 Knex 迁移文件 (migrations/) 统一管理
// 启动时由 index.js 中 knex.migrate.latest() 自动执行
// 原 createPurchaseTablesIfNotExist / createFinanceTablesIfNotExist / addDingtalkFields 已移除

// API 文档路由 - 生产环境禁止访问，非生产环境需要认证
if (process.env.NODE_ENV !== 'production') {
  // Swagger 文档增加 HTTP Basic Auth 认证保护
  const swaggerAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="API Docs"');
      return res.status(401).send('需要认证才能访问 API 文档');
    }

    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [user, pass] = credentials.split(':');
    const validUser = process.env.SWAGGER_USER;
    const validPass = process.env.SWAGGER_PASSWORD;

    // ✅ 安全修复：强制要求环境变量配置，不再提供默认凭据
    if (!validUser || !validPass) {
      logger.warn('Swagger 文档认证未配置环境变量 SWAGGER_USER/SWAGGER_PASSWORD，拒绝访问');
      res.setHeader('WWW-Authenticate', 'Basic realm="API Docs"');
      return res.status(401).send('API 文档认证未配置，请联系管理员');
    }

    if (user === validUser && pass === validPass) {
      return next();
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="API Docs"');
    return res.status(401).send('认证失败');
  };
  app.use('/api-docs', swaggerAuth, swaggerUi.serve, swaggerUi.setup(specs, swaggerUiOptions));
} else {
  app.use('/api-docs', (_, res) => {
    res.status(404).json({ success: false, message: '文档不可用' });
  });
}

// 根路径
app.get('/', (_, res) => {
  res.send('工厂管理系统API服务正在运行');
});

// 使用统一的错误处理中间件
app.use(csrfErrorHandler); // CSRF错误处理必须在其他错误处理之前
app.use(notFoundHandler);
app.use(unifiedErrorHandler);

// ✅ 初始化缓存管理器（支持 Redis 和内存缓存自动切换）
const cacheManager = require('./services/cache/CacheManager');
setTimeout(async () => {
  try {
    await cacheManager.initialize();
  } catch (error) {
    logger.warn('⚠️ 缓存管理器初始化失败（不影响启动）:', error.message);
  }
}, 1000);

// ✅ 启动并挂载各领域事件订阅者 (Domain Event Subscribers)
require('./events/subscribers/FinanceSubscriber');

// 启动财务自动化定时任务
const ScheduledTaskService = require('./services/business/ScheduledTaskService');
setTimeout(() => {
  try {
    ScheduledTaskService.startAllTasks();
  } catch (error) {
    logger.warn('⚠️ 财务自动化定时任务启动失败:', error.message);
  }
}, 5000);

// 启动逾期检查调度器
const { initScheduler } = require('./services/scheduler');
setTimeout(() => {
  try {
    initScheduler();
    logger.info('✅ 逾期检查调度器已启动');
  } catch (error) {
    logger.error('逾期检查调度器启动失败:', error);
  }
}, 6000);

module.exports = app;
