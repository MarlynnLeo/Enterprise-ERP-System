/**
 * finance.js
 * @description 财务模型 - 统一导出入口（re-export）
 *              原文件已按功能域拆分至 models/finance/ 目录:
 *                - helpers.js     — 公共辅助函数
 *                - accounts.js    — 总账科目相关方法
 *                - entries.js     — 会计分录相关方法
 *                - periods.js     — 会计期间相关方法
 *                - trialBalance.js — 试算平衡表相关方法
 *                - closing.js     — 期末结转相关方法
 *                - init.js        — 系统初始化方法
 * @date 2025-08-27
 * @version 2.0.0
 */

module.exports = require('./finance/index');
