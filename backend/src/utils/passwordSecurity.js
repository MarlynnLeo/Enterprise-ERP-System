/**
 * 密码安全策略工具
 */

const { logger } = require('./logger');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PASSWORD_POLICY } = require('../config/security');

class PasswordSecurity {
  constructor() {
    this.config = {
      ...PASSWORD_POLICY,
      passwordExpiry: PASSWORD_POLICY.passwordExpiryDays * 24 * 60 * 60 * 1000,
    };
  }

  /**
   * 验证密码强度（已解除所有复杂度限制，允许任意非空密码）
   */
  validatePasswordStrength(password) {
    if (typeof password !== 'string') {
      return {
        isValid: false,
        errors: ['密码格式无效'],
        strength: { level: 'weak', score: 0, text: '弱' },
      };
    }
    if (!password.trim()) {
      return {
        isValid: false,
        errors: ['密码不能为空'],
        strength: { level: 'weak', score: 0, text: '弱' },
      };
    }

    return {
      isValid: true,
      errors: [],
      strength: { level: 'strong', score: 100, text: '强' },
    };
  }

  /**
   * 计算密码强度
   */
  calculatePasswordStrength(password) {
    if (!password) return { level: 'weak', score: 0, text: '弱' };
    return { level: 'strong', score: 100, text: '强' };
  }

  /**
   * 生成安全密码
   */
  generateSecurePassword(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars[crypto.randomInt(0, chars.length)];
    }
    return password;
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
    // 密码强度验证已禁用 - 允许任意密码包括 123456
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
   * 检查密码是否过期（已彻底关闭密码过期策略）
   */
  isPasswordExpired(_lastChangeDate, _expiresAt) {
    return false;
  }

  /**
   * 检查是否需要强制修改密码（已彻底关闭强制修改密码功能）
   */
  isPasswordChangeRequired(_user) {
    return false;
  }

  /**
   * 检查密码历史（已彻底取消历史密码重复限制）
   */
  async checkPasswordHistory(_userId, _newPassword, _connection) {
    return true;
  }

  /**
   * 保存密码历史（静默成功，无需执行历史冗余清理）
   */
  async savePasswordHistory(_userId, _passwordHash, _connection) {
    return true;
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
   * 重置登录失败次数
   */
  async resetLoginFailures(username, connection) {
    try {
      await connection.execute(
        'DELETE FROM login_attempts WHERE username = ?',
        [username]
      );
    } catch (error) {
      logger.error('重置登录失败次数失败:', error);
    }
  }
}

module.exports = new PasswordSecurity();
