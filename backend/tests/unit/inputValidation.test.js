/* global describe, expect, jest, test */

const {
  detectSQLInjection,
  sanitizeHTML,
  validateAndSanitizeInput,
} = require('../../src/middleware/inputValidation');

const createRequest = (path, body) => ({
  originalUrl: path,
  path,
  body,
  query: {},
  params: {},
  is: jest.fn(() => false),
});

const createResponse = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('inputValidation middleware', () => {
  test('preserves technical communication rich text while escaping ordinary fields', () => {
    const req = createRequest('/api/system/technical-communications', {
      title: '<b>Unsafe title</b>',
      content: '<p>Hello <strong>ERP</strong></p>',
      solution: '<ol><li>Fix</li></ol>',
      description: '<p>Root cause</p>',
    });
    const next = jest.fn();

    validateAndSanitizeInput(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.title).toBe(sanitizeHTML('<b>Unsafe title</b>'));
    expect(req.body.content).toBe('<p>Hello <strong>ERP</strong></p>');
    expect(req.body.solution).toBe('<ol><li>Fix</li></ol>');
    expect(req.body.description).toBe('<p>Root cause</p>');
  });

  test('preserves print template html fields, including nested objects', () => {
    const req = createRequest('/api/print/templates', {
      template: {
        header_html: '<header>ACME</header>',
        body_html: '<main>{{items}}</main>',
        label: '<b>Template name</b>',
      },
    });
    const next = jest.fn();

    validateAndSanitizeInput(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.template.header_html).toBe('<header>ACME</header>');
    expect(req.body.template.body_html).toBe('<main>{{items}}</main>');
    expect(req.body.template.label).toBe(sanitizeHTML('<b>Template name</b>'));
  });

  test('continues escaping description on ordinary routes', () => {
    const req = createRequest('/api/base-data/materials', {
      description: '<img src=x onerror=alert(1)>',
    });
    const next = jest.fn();

    validateAndSanitizeInput(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.description).toBe(sanitizeHTML('<img src=x onerror=alert(1)>'));
  });

  test('allows 8D narrative fields to contain quoted business prose', () => {
    const req = createRequest('/api/quality/eight-d-reports', {
      d8_lessons_learned: "体系维度：将寿命验证从'可选项目'升级为'强制门径'；流程维度：完善DFMEA复盘。",
    });
    const res = createResponse();
    const next = jest.fn();

    detectSQLInjection(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('still blocks high-risk SQL patterns in 8D narrative fields', () => {
    const req = createRequest('/api/quality/eight-d-reports', {
      d8_lessons_learned: '复盘内容 UNION SELECT password FROM users',
    });
    const res = createResponse();
    const next = jest.fn();

    detectSQLInjection(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'SUSPICIOUS_INPUT' }));
  });

  test('allows standard identifiers in AQL levels, including legacy escaped values', () => {
    for (const aqlLevel of ['GB/T 2828.1 II', 'GB&#x2F;T 2828.1 II']) {
      const req = createRequest('/api/quality/templates/76', { aqlLevel });
      const res = createResponse();
      const next = jest.fn();

      detectSQLInjection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    }
  });

  test('preserves AQL standard identifiers during sanitization', () => {
    const req = createRequest('/api/quality/templates/76', {
      aqlLevel: 'GB/T 2828.1 II',
    });
    const next = jest.fn();

    validateAndSanitizeInput(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.aqlLevel).toBe('GB/T 2828.1 II');
  });

  test('still blocks high-risk SQL patterns in AQL levels', () => {
    const req = createRequest('/api/quality/templates/76', {
      aqlLevel: '1; DROP TABLE users',
    });
    const res = createResponse();
    const next = jest.fn();

    detectSQLInjection(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'SUSPICIOUS_INPUT' }));
  });

  test('allows browser diagnostics on the client error reporting route', () => {
    const req = createRequest('/api/system/client-errors', {
      type: 'vue_error',
      message: "Cannot read properties of undefined (reading 'querySelectorAll')",
      stack: 'Evaluating a string as JavaScript violates the Content Security Policy directive',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      url: 'http://192.168.1.251:18081/',
    });
    const res = createResponse();
    const next = jest.fn();

    detectSQLInjection(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
