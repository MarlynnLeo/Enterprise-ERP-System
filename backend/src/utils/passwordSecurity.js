/**
 * 密码安全策略工具
 */

const { logger } = require('./logger');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PASSWORD_POLICY } = require('../config/security');

const COMMON_PASSWORDS = new Set([
  '123456',
  '12345678',
  '123456789',
  '123456789012',
  'password',
  'password123',
  'admin',
  'admin123',
  'qwerty',
  'qwerty123',
  'letmein',
  'welcome',
  'welcome123',
]);

class PasswordSecurity {
  constructor() {
    this.config = {
      ...PASSWORD_POLICY,
      passwordExpiry: PASSWORD_POLICY.passwordExpiryDays * 24 * 60 * 60 * 1000,
    };
  }

  /**
   * 验证密码强度
   */
  validatePasswordStrength(password) {
    const errors = [];

    if (typeof password !== 'string') {
      return {
        isValid: false,
        errors: ['密码格式无效'],
        strength: this.calculatePasswordStrength(''),
      };
    }

    const value = password;
    const normalized = value.normalize('NFKC').toLowerCase();
    const compact = normalized.replace(/[\s_-]+/g, '');

    if (!value.trim()) {
      errors.push('密码不能为空');
    }
    if (value.length < this.config.minLength) {
      errors.push(`密码长度不能少于${this.config.minLength}个字符`);
    }
    if (value.length > this.config.maxLength) {
      errors.push(`密码长度不能超过${this.config.maxLength}个字符`);
    }
    if (Buffer.byteLength(value, 'utf8') > this.config.maxBcryptBytes) {
      errors.push(`密码 UTF-8 长度不能超过${this.config.maxBcryptBytes}字节`);
    }
    if (new Set(Array.from(value)).size < this.config.minUniqueChars) {
      errors.push(`密码至少需要${this.config.minUniqueChars}个不同字符`);
    }
    if (COMMON_PASSWORDS.has(normalized) || COMMON_PASSWORDS.has(compact)) {
      errors.push('密码过于常见，请使用不易猜测的密码短语');
    }

    return {
      isValid: errors.length === 0,
      errors,
      strength: this.calculatePasswordStrength(value),
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
  generateSecurePassword(length = this.config.minLength) {
    const targetLength = Math.max(Number(length) || 0, this.config.minLength);
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
    for (let i = password.length; i < targetLength; i++) {
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
    const validation = this.validatePasswordStrength(password);
    if (!validation.isValid) {
      const error = new Error(`密码不符合安全要求: ${validation.errors.join(', ')}`);
      error.code = 'WEAK_PASSWORD';
      throw error;
    }
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * 验证密码
   */
  async verifyPassword(password, hashedPassword) {
    if (typeof password !== 'string' || typeof hashedPassword !== 'string') return false;
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
  isPasswordExpired(lastChangeDate, expiresAt) {
    if (this.config.passwordExpiryDays <= 0) return false;

    // 如果显式设置了到期时间
    if (expiresAt !== undefined && expiresAt !== null) {
      const deadline = new Date(expiresAt);
      return Number.isNaN(deadline.getTime()) || Date.now() >= deadline.getTime();
    }

    // 如果没有记录修改时间，默认不视为过期（避免初始化/未迁移数据账号被误拦截）
    if (!lastChangeDate) return false;

    const changeDate = new Date(lastChangeDate);
    if (Number.isNaN(changeDate.getTime())) return false;
    return Date.now() - changeDate.getTime() >= this.config.passwordExpiry;
  }

  isPasswordChangeRequired(user) {
    if (!user || typeof user !== 'object') return false;
    const forced = [true, 1, '1'].includes(user.force_password_change);
    if (forced) return true;
    return this.isPasswordExpired(user.password_changed_at, user.password_expires_at);
  }

  /**
   * 检查密码历史
   */
  async checkPasswordHistory(userId, newPassword, connection) {
    const historyLimit = Number(this.config.passwordHistory);
    if (!Number.isInteger(historyLimit) || historyLimit <= 0) return true;

    try {
      const [history] = await connection.execute(
        `SELECT password_hash FROM password_history
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ${historyLimit}`,
        [userId]
      );

      for (const record of history) {
        if (await this.verifyPassword(newPassword, record.password_hash)) {
          return false; // 密码已使用过
        }
      }

      return true; // 密码未使用过
    } catch (error) {
      logger.error('检查密码历史失败:', error);
      throw error;
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
      throw error;
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
