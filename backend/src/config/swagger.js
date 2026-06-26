/**
 * swagger.js
 * @description Swagger/OpenAPI 文档配置
 * @date 2026-06-22
 *
 * 访问路径: GET /api-docs
 *
 * 路由注解规范:
 *   在路由文件中使用 JSDoc 注释添加 @swagger 注解。
 *   参考 routes/auth.js 中的示范注解。
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ERP 系统 API 文档',
      version: '1.0.0',
      description: '企业资源计划系统 RESTful API 接口文档',
      contact: {
        name: 'ERP 开发团队',
      },
    },
    servers: [
      {
        url: '/api',
        description: '主接口',
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
          description: 'JWT Cookie 认证',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Bearer Token 认证（兼容模式）',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            code: { type: 'string', example: 'SERVER_ERROR' },
            message: { type: 'string', example: '操作失败' },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            message: { type: 'string', example: '操作成功' },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                list: { type: 'array', items: {} },
                total: { type: 'integer', example: 100 },
                page: { type: 'integer', example: 1 },
                pageSize: { type: 'integer', example: 20 },
              },
            },
          },
        },
      },
    },
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  },
  // 扫描路由文件中的 @swagger 注解
  apis: [
    './src/routes/*.js',
    './src/routes/**/*.js',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
