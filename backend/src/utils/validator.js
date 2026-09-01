/**
 * 通用数据验证工具
 */

class Validator {
  constructor() {
    this.errors = [];
  }

  /**
   * 重置错误信息
   */
  reset() {
    this.errors = [];
    return this;
  }

  /**
   * 检查是否有错误
   */
  hasErrors() {
    return this.errors.length > 0;
  }

  /**
   * 获取错误信息
   */
  getErrors() {
    return this.errors;
  }

  /**
   * 获取第一个错误信息
   */
  getFirstError() {
    return this.errors.length > 0 ? this.errors[0] : null;
  }

  /**
   * 添加错误信息
   */
  addError(field, message) {
    this.errors.push({ field, message });
    return this;
  }

  /**
   * 必填验证
   */
  required(value, field, message = null) {
    if (value === null || value === undefined || value === '') {
      this.addError(field, message || `${field} 是必填项`);
    }
    return this;
  }

  /**
   * 字符串长度验证
   */
  length(value, field, min = 0, max = null, message = null) {
    if (value && typeof value === 'string') {
      if (value.length < min) {
        this.addError(field, message || `${field} 长度不能少于 ${min} 个字符`);
      }
      if (max && value.length > max) {
        this.addError(field, message || `${field} 长度不能超过 ${max} 个字符`);
      }
    }
    return this;
  }

  /**
   * 数字验证
   */
  numeric(value, field, message = null) {
    if (value !== null && value !== undefined && value !== '') {
      if (isNaN(Number(value))) {
        this.addError(field, message || `${field} 必须是数字`);
      }
    }
    return this;
  }

  /**
   * 数字范围验证
   */
  range(value, field, min = null, max = null, message = null) {
    if (value !== null && value !== undefined && value !== '') {
      const num = Number(value);
      if (!isNaN(num)) {
        if (min !== null && num < min) {
          this.addError(field, message || `${field} 不能小于 ${min}`);
        }
        if (max !== null && num > max) {
          this.addError(field, message || `${field} 不能大于 ${max}`);
        }
      }
    }
    return this;
  }

  /**
   * 邮箱验证
   */
  email(value, field, message = null) {
    if (value && typeof value === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        this.addError(field, message || `${field} 格式不正确`);
      }
    }
    return this;
  }

  /**
   * 手机号验证
   */
  phone(value, field, message = null) {
    if (value && typeof value === 'string') {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(value)) {
        this.addError(field, message || `${field} 格式不正确`);
      }
    }
    return this;
  }

  /**
   * 日期验证
   */
  date(value, field, message = null) {
    if (value) {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        this.addError(field, message || `${field} 日期格式不正确`);
      }
    }
    return this;
  }

  /**
   * 枚举值验证
   */
  enum(value, field, allowedValues, message = null) {
    if (value !== null && value !== undefined && value !== '') {
      if (!allowedValues.includes(value)) {
        this.addError(field, message || `${field} 值不在允许范围内`);
      }
    }
    return this;
  }

  /**
   * 数组验证
   */
  array(value, field, minLength = 0, maxLength = null, message = null) {
    if (value !== null && value !== undefined) {
      if (!Array.isArray(value)) {
        this.addError(field, message || `${field} 必须是数组`);
      } else {
        if (value.length < minLength) {
          this.addError(field, message || `${field} 至少需要 ${minLength} 个元素`);
        }
        if (maxLength && value.length > maxLength) {
          this.addError(field, message || `${field} 最多只能有 ${maxLength} 个元素`);
        }
      }
    }
    return this;
  }

  /**
   * 自定义验证
   */
  custom(value, field, validator, message = null) {
    try {
      const result = validator(value);
      if (!result) {
        this.addError(field, message || `${field} 验证失败`);
      }
    } catch (error) {
      this.addError(field, message || `${field} 验证出错: ${error.message}`);
    }
    return this;
  }
}

/**
 * 常用验证规则
 */
const ValidationRules = {
  // 销售订单验证
  salesOrder: {
    customer_id: { required: true, numeric: true },
    order_date: { required: true, date: true },
    delivery_date: { date: true },
    total_amount: { required: true, numeric: true, min: 0 },
    status: { required: true, enum: ['draft', 'pending', 'confirmed', 'completed', 'cancelled'] },
  },

  // 采购订单验证
  purchaseOrder: {
    supplier_id: { required: true, numeric: true },
    order_date: { required: true, date: true },
    expected_date: { date: true },
    total_amount: { required: true, numeric: true, min: 0 },
    status: { required: true, enum: ['draft', 'pending', 'approved', 'completed', 'cancelled'] },
  },

  // 生产任务验证
  productionTask: {
    plan_id: { required: true, numeric: true },
    product_id: { required: true, numeric: true },
    quantity: { required: true, numeric: true, min: 1 },
    start_date: { required: true, date: true },
    end_date: { required: true, date: true },
  },

  // 库存验证
  inventory: {
    material_id: { required: true, numeric: true },
    location_id: { required: true, numeric: true },
    quantity: { required: true, numeric: true, min: 0 },
    unit_id: { required: true, numeric: true },
  },

  // 用户验证
  user: {
    username: { required: true, length: { min: 2, max: 50 } },
    email: { required: true, email: true },
    phone: { phone: true },
    password: { required: true, length: { min: 12, max: 128 } },
  },
};

/**
 * 验证数据
 */
function validateData(data, rules, customMessages = {}) {
  const validator = new Validator();

  Object.keys(rules).forEach((field) => {
    const rule = rules[field];
    const value = data[field];
    const fieldName = customMessages[field] || field;

    // 必填验证
    if (rule.required) {
      validator.required(value, fieldName);
    }

    // 如果值为空且不是必填，跳过其他验证
    if ((value === null || value === undefined || value === '') && !rule.required) {
      return;
    }

    // 长度验证
    if (rule.length) {
      validator.length(value, fieldName, rule.length.min, rule.length.max);
    }

    // 数字验证
    if (rule.numeric) {
      validator.numeric(value, fieldName);
    }

    // 范围验证
    if (rule.min !== undefined || rule.max !== undefined) {
      validator.range(value, fieldName, rule.min, rule.max);
    }

    // 邮箱验证
    if (rule.email) {
      validator.email(value, fieldName);
    }

    // 手机号验证
    if (rule.phone) {
      validator.phone(value, fieldName);
    }

    // 日期验证
    if (rule.date) {
      validator.date(value, fieldName);
    }

    // 枚举验证
    if (rule.enum) {
      validator.enum(value, fieldName, rule.enum);
    }

    // 数组验证
    if (rule.array) {
      validator.array(value, fieldName, rule.array.min, rule.array.max);
    }

    // 自定义验证
    if (rule.custom) {
      validator.custom(value, fieldName, rule.custom);
    }
  });

  return validator;
}

/**
 * 清理数据 - 移除undefined和null值
 */
function cleanData(data, options = {}) {
  const { removeNull = true, removeUndefined = true, removeEmpty = false } = options;
  const cleaned = {};

  Object.keys(data).forEach((key) => {
    const value = data[key];

    if (removeUndefined && value === undefined) return;
    if (removeNull && value === null) return;
    if (removeEmpty && value === '') return;

    cleaned[key] = value;
  });

  return cleaned;
}

/**
 * 中间件：验证请求数据
 */
function validateMiddleware(rules, customMessages = {}) {
  return (req, res, next) => {
    const validator = validateData(req.body, rules, customMessages);

    if (validator.hasErrors()) {
      return res.status(400).json({
        error: '数据验证失败',
        details: validator.getErrors(),
      });
    }

    // 清理数据
    req.body = cleanData(req.body);
    next();
  };
}

module.exports = {
  Validator,
  ValidationRules,
  validateData,
  cleanData,
  validateMiddleware,
};
