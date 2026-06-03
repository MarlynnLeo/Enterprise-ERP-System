/* global describe, expect, jest, test */

const {
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
});
