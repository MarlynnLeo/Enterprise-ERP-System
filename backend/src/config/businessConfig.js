/**
 * businessConfig.js
 * @description 业务配置文件 - 集中管理业务相关的配置项
 * @date 2025-11-12
 * @version 1.0.0
 */

module.exports = {
  /**
   * 仓库配置
   */
  warehouse: {
    // 次品仓库关键词
    defectKeywords: ['次品', '降级', 'defect', '不良品'],

    // 成品仓库关键词
    finishedGoodsKeywords: ['成品', 'finished', 'product'],

    // 原料仓库关键词
    materialKeywords: ['原料', 'material', 'raw'],

    // 收货区关键词
    receiptKeywords: ['收货', 'receiving', 'inbound'],

    // 默认仓库ID（从环境变量获取，如果未设置则使用1）
    defaultWarehouseId: parseInt(process.env.DEFAULT_WAREHOUSE_ID) || 1,

    // 仓库类型
    types: {
      NORMAL: 'normal', // 正常仓库
      DEFECT: 'defect', // 次品仓库
      QUARANTINE: 'quarantine', // 隔离仓库
      SCRAP: 'scrap', // 报废仓库
    },
  },

  /**
   * 状态配置
   */
  status: {
    // 出库单状态
    outbound: {
      DRAFT: 'draft',
      CONFIRMED: 'confirmed',
      PARTIAL_COMPLETED: 'partial_completed',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    },

    // 入库单状态
    inbound: {
      DRAFT: 'draft',
      CONFIRMED: 'confirmed',
      PARTIAL_COMPLETED: 'partial_completed',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    },

    // 检验单状态
    inspection: {
      PENDING: 'pending',
      IN_PROGRESS: 'in_progress',
      PASSED: 'passed',
      FAILED: 'failed',
      PARTIAL: 'partial',
      COMPLETED: 'completed',
    },

    // 不合格品状态
    ncp: {
      PENDING: 'pending',
      PROCESSING: 'processing',
      IN_PROGRESS: 'in_progress',
      COMPLETED: 'completed',
      CLOSED: 'closed',
      CANCELLED: 'cancelled',
    },

    // 返工任务状态
    rework: {
      DRAFT: 'draft',
      PENDING: 'pending',
      IN_PROGRESS: 'in_progress',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    },

    // 报废记录状态
    scrap: {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    },

    // 换货单状态
    replacement: {
      DRAFT: 'draft',
      PENDING: 'pending',
      PARTIAL: 'partial',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    },

    // 8D报告状态
    eightD: {
      DRAFT: 'draft',
      IN_PROGRESS: 'in_progress',
      REVIEW: 'review',
      COMPLETED: 'completed',
      CLOSED: 'closed',
    },

    // 首检结果状态
    firstArticle: {
      PASSED: 'passed',
      FAILED: 'failed',
      CONDITIONAL: 'conditional',
    },

    // 采购收货状态
    receipt: {
      DRAFT: 'draft',
      CONFIRMED: 'confirmed',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    },

    // 生产任务状态
    productionTask: {
      PENDING: 'pending',
      ALLOCATED: 'allocated',
      PREPARING: 'preparing',
      MATERIAL_ISSUING: 'material_issuing',
      MATERIAL_PARTIAL_ISSUED: 'material_partial_issued',
      MATERIAL_ISSUED: 'material_issued',
      IN_PROGRESS: 'in_progress',
      PAUSED: 'paused',
      INSPECTION: 'inspection',
      WAREHOUSING: 'warehousing',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    },

    // 生产计划状态
    productionPlan: {
      DRAFT: 'draft',
      PREPARING: 'preparing',
      MATERIAL_ISSUED: 'material_issued',
      IN_PROGRESS: 'in_progress',
      INSPECTION: 'inspection',
      WAREHOUSING: 'warehousing',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    },

    // 审批状态
    approval: {
      DRAFT: 'draft',
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      CANCELLED: 'cancelled',
    },

    // 调拨单状态
    transfer: {
      DRAFT: 'draft',
      PENDING: 'pending',
      APPROVED: 'approved',
      IN_TRANSIT: 'in_transit',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    },
  },

  /**
   * 不合格品处置方式
   */
  ncpDisposition: {
    USE_AS_IS: 'use_as_is', // 让步接收
    RETURN: 'return', // 退货
    SCRAP: 'scrap', // 报废
    REWORK: 'rework', // 返工
  },

  /**
   * 单据编号前缀
   */
  documentPrefix: {
    OUTBOUND: 'OUT', // 出库单
    INBOUND: 'IN', // 入库单
    INSPECTION: 'QI', // 检验单 (QI-来料, QP-过程, QF-成品)
    NCP: 'NCP', // 不合格品
    RECEIPT: 'GR', // 收货单
    RETURN: 'PR', // 退货单
    SCRAP: 'SCR', // 报废单
    REWORK: 'RWK', // 返工单
    REPLACEMENT: 'RPL', // 换货单
  },

  /**
   * 性能优化配置
   */
  performance: {
    // 是否启用异步成本核算
    asyncCostCalculation: true,

    // 是否启用异步追溯记录
    asyncTraceability: true,

    // 批量操作的批次大小
    batchSize: 100,

    // 数据库连接池配置
    pool: {
      min: 2,
      max: 10,
      acquireTimeout: 30000,
    },
  },

  /**
   * 业务规则配置
   */
  businessRules: {
    // 是否允许负库存
    allowNegativeInventory: true,

    // 是否自动创建不合格品记录
    autoCreateNcp: true,

    // 是否自动创建检验单
    autoCreateInspection: true,

    // 不合格品自动处置
    ncpAutoDisposition: {
      enabled: false, // 默认关闭自动处置
      autoComplete: false,
    },

    // FIFO出库
    fifoOutbound: {
      enabled: true,
      applyToProduction: true, // 生产出库使用FIFO
      applyToSales: false, // 销售出库不使用FIFO
    },
  },

  /**
   * 日志配置
   */
  logging: {
    // 业务日志级别
    level: 'info',

    // 是否记录详细的SQL日志
    logSql: false,

    // 是否记录性能日志
    logPerformance: true,
  },
};
