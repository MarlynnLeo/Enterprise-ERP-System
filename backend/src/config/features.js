/**
 * 功能开关配置
 * 用于控制可选功能的启用/禁用
 */

module.exports = {
  // 追溯功能开关（已优化性能,使用异步处理）
  ENABLE_TRACEABILITY: false, // 禁用旧追溯系统,避免重复记录

  // 追溯链路服务开关（推荐使用）
  ENABLE_TRACEABILITY_CHAIN: true, // ✅ 启用新追溯链路服务

  // BOM版本追踪（需要数据库迁移后启用）
  ENABLE_BOM_TRACKING: false,

  // 诊断模式
  DEBUG_MODE: process.env.DEBUG_MODE === 'true' || false,
};
