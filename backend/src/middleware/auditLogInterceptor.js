/**
 * auditLogInterceptor.js
 * @description HTTP拦截切面，自动记录关键业务接口的黑匣子审计日志
 */

const AuditLogService = require('../services/system/AuditLogService');

// ✅ 安全修复: 审计日志脱敏 — 过滤敏感字段避免密码/Token 记入日志
const SENSITIVE_FIELDS = ['password', 'currentPassword', 'newPassword', 'confirmPassword', 'token', 'accessToken', 'refreshToken', 'secret', 'apiKey', 'api_key'];
const maskSensitiveData = (data) => {
  if (!data || typeof data !== 'object') return data;
  const masked = Array.isArray(data) ? [...data] : { ...data };
  for (const key of Object.keys(masked)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      masked[key] = '***REDACTED***';
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }
  return masked;
};

const auditLogInterceptor = async (req, res, next) => {
  // 只拦截具有副作用的 HTTP 动作
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
    return next();
  }

  // 避免过度记录普通查询或登录行为
  if (req.originalUrl.includes('/login') || req.originalUrl.includes('/auth') || req.method === 'GET') {
    return next();
  }

  const moduleName = req.baseUrl ? req.baseUrl.split('/').pop() : 'UNKNOWN';
  let targetTable = moduleName; // 近似表名

  // 记录原有的 res.send 拦截以便在请求完毕后统一写入审计日志
  const originalSend = res.send;
  
  // 代理 res.send
  res.send = function (data) {
    res.send = originalSend;

    // 如果业务请求成功，则发起异步写入审计日志不阻塞响应
    if (res.statusCode >= 200 && res.statusCode < 300) {
      let action = 'UNKNOWN';
      if (req.method === 'POST') action = 'CREATE';
      if (req.method === 'PUT') action = 'UPDATE';
      if (req.method === 'DELETE') action = 'DELETE';
      
      let targetId = req.params?.id || req.body?.id || 'N/A';
      // 有些路由以数组批量传入
      if (req.body?.ids && Array.isArray(req.body.ids)) {
        targetId = req.body.ids.join(',');
      }

      const operator = req.user ? { id: req.user.id, name: req.user.name || req.user.username } : { id: 'SYS', name: '系统操作' };

      AuditLogService.log({
        operator_id: String(operator.id),
        operator_name: String(operator.name),
        action,
        module: moduleName,
        target_table: targetTable,
        target_id: String(targetId),
        new_payload: req.method !== 'DELETE' ? maskSensitiveData(req.body) : null,
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.headers['user-agent'],
        remarks: `由 ${req.method} ${req.originalUrl} 触发`
      }).catch(err => {
        // 静默，服务层已处理并打印
      });
    }

    return res.send(data);
  };

  next();
};

module.exports = auditLogInterceptor;
