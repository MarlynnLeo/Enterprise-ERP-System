/**
 * 密码安全策略工具
 */

const logger = require('./logger');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

class PasswordSecurity {
  constructor() {
    // 密码策略配置
    this.config = {
      minLength: 8,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
      maxAttempts: 5, // 最大登录尝试次数（超过后锁定账户）
      lockoutDuration: 15 * 60 * 1000, // 15分钟
      passwordHistory: 5, // 记住最近5个密码
      passwordExpiry: 90 * 24 * 60 * 60 * 1000, // 90天过期
    };
  }

  /**
   * 验证密码强度
   */
  validatePasswordStrength(password) {
    const errors = [];

    // 长度检查
    if (password.length < this.config.minLength) {
      errors.push(`密码长度不能少于${this.config.minLength}位`);
    }

    if (password.length > this.config.maxLength) {
      errors.push(`密码长度不能超过${this.config.maxLength}位`);
    }

    // 大写字母检查
    if (this.config.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('密码必须包含至少一个大写字母');
    }

    // 小写字母检查
    if (this.config.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('密码必须包含至少一个小写字母');
    }

    // 数字检查
    if (this.config.requireNumbers && !/\d/.test(password)) {
      errors.push('密码必须包含至少一个数字');
    }

    // 特殊字符检查
    if (this.config.requireSpecialChars) {
      const specialCharRegex = new RegExp(
        `[${this.config.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`
      );
      if (!specialCharRegex.test(password)) {
        errors.push('密码必须包含至少一个特殊字符');
      }
    }

    // 常见弱密码检查
    const weakPasswords = [
      'password',
      '123456',
      '123456789',
      'qwerty',
      'abc123',
      'password123',
      'admin',
      'root',
      '111111',
      '000000',
    ];

    if (weakPasswords.includes(password.toLowerCase())) {
      errors.push('不能使用常见的弱密码');
    }

    // 重复字符检查
    if (/(.)\1{2,}/.test(password)) {
      errors.push('密码不能包含连续重复的字符');
    }

    return {
      isValid: errors.length === 0,
      errors,
      strength: this.calculatePasswordStrength(password),
    };
  }

  /**
   * 计算密码强度
   */
  calculatePasswordStrength(password) {
    let score = 0;

    // 长度加分
    score += Math.min(password.length * 2, 20);

    // 字符类型加分
    if (/[a-z]/.test(password)) score += 5;
    if (/[A-Z]/.test(password)) score += 5;
    if (/\d/.test(password)) score += 5;
    if (/[^a-zA-Z0-9]/.test(password)) score += 10;

    // 复杂度加分
    const uniqueChars = new Set(password).size;
    score += uniqueChars * 2;

    // 模式扣分
    if (/(.)\1{1,}/.test(password)) score -= 10;
    if (/123|abc|qwe/i.test(password)) score -= 10;

    // 强度等级
    if (score < 30) return { level: 'weak', score, text: '弱' };
    if (score < 60) return { level: 'medium', score, text: '中等' };
    if (score < 90) return { level: 'strong', score, text: '强' };
    return { level: 'very_strong', score, text: '很强' };
  }

  /**
   * 生成安全密码
   */
  generateSecurePassword(length = 12) {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = this.config.specialChars;

    let password = '';
    const charset = lowercase + uppercase + numbers + special;

    // 确保包含各种字符类型
    password += this.getRandomChar(uppercase);
    password += this.getRandomChar(lowercase);
    password += this.getRandomChar(numbers);
    password += this.getRandomChar(special);

    // 填充剩余长度
    for (let i = password.length; i < length; i++) {
      password += this.getRandomChar(charset);
    }

    const chars = password.split('');
    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  /**
   * 获取随机字符
   */
  getRandomChar(charset) {
    const randomIndex = crypto.randomInt(0, charset.length);
    return charset[randomIndex];
  }

  /**
   * 加密密码
   */
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * 验证密码
   */
  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  /**
   * 生成密码重置令牌
   */
  generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 检查密码是否过期
   */
  isPasswordExpired(lastChangeDate) {
    if (!lastChangeDate) return true;

    const now = new Date();
    const changeDate = new Date(lastChangeDate);
    const timeDiff = now.getTime() - changeDate.getTime();

    return timeDiff > this.config.passwordExpiry;
  }

  /**
   * 检查密码历史
   */
  async checkPasswordHistory(userId, newPassword, connection) {
    try {
      const [history] = await connection.execute(
        `SELECT password_hash FROM password_history 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [userId, this.config.passwordHistory]
      );

      for (const record of history) {
        if (await this.verifyPassword(newPassword, record.password_hash)) {
          return false; // 密码已使用过
        }
      }

      return true; // 密码未使用过
    } catch (error) {
      logger.error('检查密码历史失败:', error);
      return true; // 出错时允许使用
    }
  }

  /**
   * 保存密码历史
   */
  async savePasswordHistory(userId, passwordHash, connection) {
    try {
      // 保存新密码
      await connection.execute(
        'INSERT INTO password_history (user_id, password_hash, created_at) VALUES (?, ?, NOW())',
        [userId, passwordHash]
      );

      // 清理旧密码历史
      await connection.execute(
        `DELETE FROM password_history 
         WHERE user_id = ? 
         AND id NOT IN (
           SELECT id FROM (
             SELECT id FROM password_history 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ?
           ) t
         )`,
        [userId, userId, this.config.passwordHistory]
      );
    } catch (error) {
      logger.error('保存密码历史失败:', error);
    }
  }

  /**
   * 记录登录失败
   */
  async recordLoginFailure(username, ip, connection) {
    try {
      await connection.execute(
        'INSERT INTO login_attempts (username, ip_address, success, created_at) VALUES (?, ?, 0, NOW())',
        [username, ip]
      );
    } catch (error) {
      logger.error('记录登录失败失败:', error);
    }
  }

  /**
   * 检查账户是否被锁定
   */
  async isAccountLocked(username, connection) {
    try {
      const [attempts] = await connection.execute(
        `SELECT COUNT(*) as count 
         FROM login_attempts 
         WHERE username = ? 
         AND success = 0 
         AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)`,
        [username, this.config.lockoutDuration / 1000]
      );

      return attempts[0].count >= this.config.maxAttempts;
    } catch (error) {
      logger.error('检查账户锁定状态失败:', error);
      return false;
    }
  }

  /**
   * 清除登录失败记录
   */
  async clearLoginFailures(username, connection) {
    try {
      await connection.execute(
        'UPDATE login_attempts SET success = 1 WHERE username = ? AND success = 0',
        [username]
      );
    } catch (error) {
      logger.error('清除登录失败记录失败:', error);
    }
  }
}

module.exports = new PasswordSecurity();
