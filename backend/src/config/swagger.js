/**
 * Swagger API 文档配置
 * @description 配置 Swagger 自动生成 API 文档
 * @author 系统
 * @date 2025-08-28
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const defaultPort = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === 'production';
const normalizeApiBaseUrl = (url) => {
  const normalized = String(url || '').replace(/\/+$/, '');
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
};
const swaggerApiBaseUrl = normalizeApiBaseUrl(
  process.env.SWAGGER_API_BASE_URL ||
  process.env.API_BASE_URL ||
  (isProduction ? '/api' : `http://localhost:${defaultPort}/api`)
);
const swaggerProductionApiBaseUrl = process.env.SWAGGER_PRODUCTION_API_BASE_URL
  ? normalizeApiBaseUrl(process.env.SWAGGER_PRODUCTION_API_BASE_URL)
  : '';
const swaggerServers = [
  {
    url: swaggerApiBaseUrl,
    description: isProduction ? '当前环境' : '开发环境',
  },
];

if (swaggerProductionApiBaseUrl) {
  swaggerServers.push({
    url: swaggerProductionApiBaseUrl,
    description: '生产环境',
  });
}

// Swagger 配置选项
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ERP系统 API 文档',
      version: '1.0.0',
      description: '工厂管理系统 RESTful API 接口文档',
      contact: {
        name: 'API 支持',
        email: 'support@erp-system.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: swaggerServers,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT 认证令牌',
        },
      },
      schemas: {
        // 通用响应格式
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: '请求是否成功',
            },
            code: {
              type: 'integer',
              description: '响应代码',
            },
            message: {
              type: 'string',
              description: '响应消息',
            },
            data: {
              description: '响应数据',
            },
          },
        },

        // 错误响应格式
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            code: {
              type: 'integer',
              description: '错误代码',
            },
            message: {
              type: 'string',
              description: '错误消息',
            },
            details: {
              type: 'string',
              description: '错误详情',
            },
          },
        },

        // 分页响应格式
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'array',
              items: {},
            },
            pagination: {
              type: 'object',
              properties: {
                page: {
                  type: 'integer',
                  description: '当前页码',
                },
                limit: {
                  type: 'integer',
                  description: '每页数量',
                },
                total: {
                  type: 'integer',
                  description: '总记录数',
                },
                totalPages: {
                  type: 'integer',
                  description: '总页数',
                },
              },
            },
          },
        },

        // 用户模型
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: '用户ID',
            },
            username: {
              type: 'string',
              description: '用户名',
            },
            real_name: {
              type: 'string',
              description: '真实姓名',
            },
            email: {
              type: 'string',
              format: 'email',
              description: '邮箱',
            },
            phone: {
              type: 'string',
              description: '电话',
            },
            role: {
              type: 'string',
              enum: ['admin', 'manager', 'user'],
              description: '角色',
            },
            status: {
              type: 'integer',
              enum: [0, 1],
              description: '状态：0-禁用，1-启用',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: '创建时间',
            },
          },
        },

        // 物料模型
        Material: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: '物料ID',
            },
            code: {
              type: 'string',
              description: '物料编码',
            },
            name: {
              type: 'string',
              description: '物料名称',
            },
            category_id: {
              type: 'integer',
              description: '分类ID',
            },
            unit_id: {
              type: 'integer',
              description: '单位ID',
            },
            specs: {
              type: 'string',
              description: '规格',
            },
            status: {
              type: 'integer',
              enum: [0, 1],
              description: '状态：0-禁用，1-启用',
            },
          },
        },

        // 库存模型
        Inventory: {
          type: 'object',
          properties: {
            material_id: {
              type: 'integer',
              description: '物料ID',
            },
            location_id: {
              type: 'integer',
              description: '库位ID',
            },
            quantity: {
              type: 'number',
              format: 'decimal',
              description: '库存数量',
            },
            batch_number: {
              type: 'string',
              description: '批次号',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.js', './src/routes/**/*.js'],
};

// 生成 Swagger 规范
const specs = swaggerJsdoc(options);

// 自定义 Swagger UI 配置
const swaggerUiOptions = {
  explorer: true,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
  },
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info { margin: 20px 0 }
    .swagger-ui .scheme-container { margin: 20px 0 }
  `,
  customSiteTitle: 'ERP系统 API 文档',
};

module.exports = {
  specs,
  swaggerUi,
  swaggerUiOptions,
};
