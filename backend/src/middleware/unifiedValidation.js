/**
 * 统一输入验证中间件
 * 提供标准化的输入验证、清理和转换功能
 */

const { ErrorFactory } = require('./unifiedErrorHandler');

// 验证规则类型
const ValidationTypes = {
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  EMAIL: 'email',
  PASSWORD: 'password',
  DATE: 'date',
  ARRAY: 'array',
  OBJECT: 'object',
  ENUM: 'enum',
  FILE: 'file',
};

// 预定义的验证规则
const ValidationRules = {
  // 用户相关
  username: {
    type: ValidationTypes.STRING,
    required: true,
    minLength: 3,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9_-]+$/,
    message: '用户名只能包含字母、数字、下划线和连字符',
  },

  email: {
    type: ValidationTypes.EMAIL,
    required: true,
    maxLength: 254,
  },

  password: {
    type: ValidationTypes.PASSWORD,
    required: true,
    minLength: 6,
    maxLength: 128,
  },

  // 分页相关
  page: {
    type: ValidationTypes.INTEGER,
    required: false,
    min: 1,
    default: 1,
  },

  pageSize: {
    type: ValidationTypes.INTEGER,
    required: false,
    min: 1,
    max: 100,
    default: 20,
  },

  // 通用字段
  id: {
    type: ValidationTypes.INTEGER,
    required: true,
    min: 1,
  },

  name: {
    type: ValidationTypes.STRING,
    required: true,
    minLength: 1,
    maxLength: 100,
    trim: true,
  },

  description: {
    type: ValidationTypes.STRING,
    required: false,
    maxLength: 500,
    trim: true,
  },

  status: {
    type: ValidationTypes.ENUM,
    required: false,
    values: ['active', 'inactive', 'pending', 'completed', 'cancelled'],
  },

  // 数量和金额
  quantity: {
    type: ValidationTypes.NUMBER,
    required: true,
    min: 0,
  },

  price: {
    type: ValidationTypes.NUMBER,
    required: true,
    min: 0,
    precision: 2,
  },

  // 日期
  startDate: {
    type: ValidationTypes.DATE,
    required: false,
  },

  endDate: {
    type: ValidationTypes.DATE,
    required: false,
  },
};

// 数据清理工具
class DataSanitizer {
  static sanitizeString(value, options = {}) {
    if (typeof value !== 'string') return value;

    let sanitized = value;

    // 去除首尾空格
    if (options.trim !== false) {
      sanitized = sanitized.trim();
    }

    // 转换为小写
    if (options.toLowerCase) {
      sanitized = sanitized.toLowerCase();
    }

    // 转换为大写
    if (options.toUpperCase) {
      sanitized = sanitized.toUpperCase();
    }

    // 移除HTML标签
    if (options.stripHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    // 移除特殊字符
    if (options.alphanumericOnly) {
      sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, '');
    }

    return sanitized;
  }

  static sanitizeNumber(value, options = {}) {
    const num = Number(value);
    if (isNaN(num)) return null;

    if (options.precision !== undefined) {
      return Number(num.toFixed(options.precision));
    }

    return num;
  }

  static sanitizeArray(value, options = {}) {
    if (!Array.isArray(value)) return null;

    let sanitized = value;

    // 移除重复项
    if (options.unique) {
      sanitized = [...new Set(sanitized)];
    }

    // 过滤空值
    if (options.filterEmpty) {
      sanitized = sanitized.filter((item) => item !== null && item !== undefined && item !== '');
    }

    return sanitized;
  }
}

// 验证器类
class UnifiedValidator {
  constructor(data, rules, options = {}) {
    this.data = data;
    this.rules = rules;
    this.options = options;
    this.errors = {};
    this.sanitizedData = {};
  }

  validate() {
    for (const [field, rule] of Object.entries(this.rules)) {
      try {
        this.validateField(field, rule);
      } catch (error) {
        this.errors[field] = error.message;
      }
    }

    return {
      isValid: Object.keys(this.errors).length === 0,
      errors: this.errors,
      data: this.sanitizedData,
    };
  }

  validateField(field, rule) {
    const value = this.data[field];

    // 检查必填字段
    if (rule.required && (value === undefined || value === null || value === '')) {
      throw new Error(rule.message || `${field} 是必填字段`);
    }

    // 如果字段不是必填且值为空，使用默认值
    if (!rule.required && (value === undefined || value === null || value === '')) {
      if (rule.default !== undefined) {
        this.sanitizedData[field] = rule.default;
      }
      return;
    }

    // 根据类型进行验证
    switch (rule.type) {
      case ValidationTypes.STRING:
        this.validateString(field, value, rule);
        break;
      case ValidationTypes.NUMBER:
      case ValidationTypes.INTEGER:
        this.validateNumber(field, value, rule);
        break;
      case ValidationTypes.BOOLEAN:
        this.validateBoolean(field, value, rule);
        break;
      case ValidationTypes.EMAIL:
        this.validateEmail(field, value, rule);
        break;
      case ValidationTypes.PASSWORD:
        this.validatePassword(field, value, rule);
        break;
      case ValidationTypes.DATE:
        this.validateDate(field, value, rule);
        break;
      case ValidationTypes.ARRAY:
        this.validateArray(field, value, rule);
        break;
      case ValidationTypes.ENUM:
        this.validateEnum(field, value, rule);
        break;
      default:
        this.sanitizedData[field] = value;
    }
  }

  validateString(field, value, rule) {
    if (typeof value !== 'string') {
      throw new Error(`${field} 必须是字符串`);
    }

    const sanitized = DataSanitizer.sanitizeString(value, rule);

    if (rule.minLength && sanitized.length < rule.minLength) {
      throw new Error(`${field} 长度不能少于 ${rule.minLength} 个字符`);
    }

    if (rule.maxLength && sanitized.length > rule.maxLength) {
      throw new Error(`${field} 长度不能超过 ${rule.maxLength} 个字符`);
    }

    if (rule.pattern && !rule.pattern.test(sanitized)) {
      throw new Error(rule.message || `${field} 格式不正确`);
    }

    this.sanitizedData[field] = sanitized;
  }

  validateNumber(field, value, rule) {
    const sanitized = DataSanitizer.sanitizeNumber(value, rule);

    if (sanitized === null) {
      throw new Error(`${field} 必须是有效的数字`);
    }

    if (rule.type === ValidationTypes.INTEGER && !Number.isInteger(sanitized)) {
      throw new Error(`${field} 必须是整数`);
    }

    if (rule.min !== undefined && sanitized < rule.min) {
      throw new Error(`${field} 不能小于 ${rule.min}`);
    }

    if (rule.max !== undefined && sanitized > rule.max) {
      throw new Error(`${field} 不能大于 ${rule.max}`);
    }

    this.sanitizedData[field] = sanitized;
  }

  validateBoolean(field, value) {
    if (typeof value === 'boolean') {
      this.sanitizedData[field] = value;
    } else if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1') {
        this.sanitizedData[field] = true;
      } else if (lower === 'false' || lower === '0') {
        this.sanitizedData[field] = false;
      } else {
        throw new Error(`${field} 必须是布尔值`);
      }
    } else {
      throw new Error(`${field} 必须是布尔值`);
    }
  }

  validateEmail(field, value, rule) {
    if (typeof value !== 'string') {
      throw new Error(`${field} 必须是字符串`);
    }

    const sanitized = DataSanitizer.sanitizeString(value, { trim: true, toLowerCase: true });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(sanitized)) {
      throw new Error(`${field} 格式不正确`);
    }

    if (rule.maxLength && sanitized.length > rule.maxLength) {
      throw new Error(`${field} 长度不能超过 ${rule.maxLength} 个字符`);
    }

    this.sanitizedData[field] = sanitized;
  }

  validatePassword(field, value, rule) {
    if (typeof value !== 'string') {
      throw new Error(`${field} 必须是字符串`);
    }

    if (rule.minLength && value.length < rule.minLength) {
      throw new Error(`${field} 长度不能少于 ${rule.minLength} 个字符`);
    }

    if (rule.maxLength && value.length > rule.maxLength) {
      throw new Error(`${field} 长度不能超过 ${rule.maxLength} 个字符`);
    }

    // 密码强度验证
    if (rule.requireUppercase && !/[A-Z]/.test(value)) {
      throw new Error(`${field} 必须包含大写字母`);
    }

    if (rule.requireLowercase && !/[a-z]/.test(value)) {
      throw new Error(`${field} 必须包含小写字母`);
    }

    if (rule.requireNumbers && !/\d/.test(value)) {
      throw new Error(`${field} 必须包含数字`);
    }

    if (rule.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(value)) {
      throw new Error(`${field} 必须包含特殊字符`);
    }

    this.sanitizedData[field] = value; // 密码不进行清理
  }

  validateDate(field, value, rule) {
    const date = new Date(value);

    if (isNaN(date.getTime())) {
      throw new Error(`${field} 必须是有效的日期`);
    }

    if (rule.minDate && date < new Date(rule.minDate)) {
      throw new Error(`${field} 不能早于 ${rule.minDate}`);
    }

    if (rule.maxDate && date > new Date(rule.maxDate)) {
      throw new Error(`${field} 不能晚于 ${rule.maxDate}`);
    }

    this.sanitizedData[field] = date.toISOString();
  }

  validateArray(field, value, rule) {
    const sanitized = DataSanitizer.sanitizeArray(value, rule);

    if (sanitized === null) {
      throw new Error(`${field} 必须是数组`);
    }

    if (rule.minLength && sanitized.length < rule.minLength) {
      throw new Error(`${field} 至少需要 ${rule.minLength} 个元素`);
    }

    if (rule.maxLength && sanitized.length > rule.maxLength) {
      throw new Error(`${field} 最多只能有 ${rule.maxLength} 个元素`);
    }

    this.sanitizedData[field] = sanitized;
  }

  validateEnum(field, value, rule) {
    if (!rule.values || !rule.values.includes(value)) {
      throw new Error(`${field} 必须是以下值之一: ${rule.values.join(', ')}`);
    }

    this.sanitizedData[field] = value;
  }
}

// 验证中间件工厂
function createValidationMiddleware(schema) {
  return (req, res, next) => {
    const validator = new UnifiedValidator({ ...req.body, ...req.query, ...req.params }, schema);

    const result = validator.validate();

    if (!result.isValid) {
      const error = ErrorFactory.validation('输入验证失败', result.errors);
      return next(error);
    }

    // 将清理后的数据分别赋值回原位置
    Object.keys(result.data).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        req.body[key] = result.data[key];
      } else if (Object.prototype.hasOwnProperty.call(req.query, key)) {
        req.query[key] = result.data[key];
      } else if (Object.prototype.hasOwnProperty.call(req.params, key)) {
        req.params[key] = result.data[key];
      }
    });

    next();
  };
}

module.exports = {
  ValidationTypes,
  ValidationRules,
  DataSanitizer,
  UnifiedValidator,
  createValidationMiddleware,
};
