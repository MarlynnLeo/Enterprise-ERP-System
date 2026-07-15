/**
 * zhCN.js
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 2.0.0
 */

export default {
  // 通用
  common: {
    confirm: '确定',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    add: '添加',
    search: '搜索',
    reset: '重置',
    submit: '提交',
    back: '返回',
    next: '下一步',
    previous: '上一步',
    loading: '加载中...',
    noData: '暂无数据',
    success: '操作成功',
    error: '操作失败',
    warning: '警告',
    info: '提示',
    yes: '是',
    no: '否',
    close: '关闭',
    refresh: '刷新',
    export: '导出',
    import: '导入',
    print: '打印',
    view: '查看',
    detail: '详情',
    status: '状态',
    action: '操作',
    remark: '备注',
    createTime: '创建时间',
    updateTime: '更新时间',
    operator: '操作员',
    total: '总计',
    select: '选择',
    selectAll: '全选',
    clear: '清空',
    completed: '已完成',
    pending: '待处理',
    type: '类型',
    title: '标题',
    deadline: '截止时间',
    handle: '办理',
    initiated: '我发起',
    received: '我收到',
    initiator: '发起人',
    initiateTime: '发起时间',
    drawingNo: '图号',
    defaultLocation: '默认库位',
    minStock: '最小库存',
    maxStock: '最大库存',
    referencePrice: '参考价格',
    currency: '元',
    adjust: '调整',
    enable: '启用',
    disable: '停用',
    all: '全部',
    query: '查询',
    expand: '展开',
    collapse: '收起',
    approve: '审批',
    reject: '驳回',
    draft: '草稿',
    inProgress: '进行中',
    review: '审核',
    archive: '归档',
    avatarEffect: '头像特效',
    expandCollapseSidebar: '展开/收起侧边栏',
    themeSettings: '主题设置',
    notificationCenter: '通知中心',
    userMenu: '用户菜单'
  },

  // 导航菜单
  menu: {
    dashboard: '仪表盘',

    // 数据概览
    dataOverview: '数据概览',
    productionBoard: '生产看板',
    inventoryBoard: '库存看板',
    salesBoard: '销售看板',
    financeBoard: '财务看板',
    qualityBoard: '质量看板',
    purchaseBoard: '采购看板',

    // 生产管理
    production: '生产管理',
    productionPlan: '生产计划',
    productionTask: '生产任务',
    productionProcess: '生产过程',
    productionReport: '生产报工',
    equipmentMonitoring: '设备监控',
    materialShortage: '缺料统计',
    materialReadiness: '物料齐套检查',
    mrpPlanning: '生产需求',
    productionDataView: '生产数据看板',
    productionGantt: '排程甘特图',
    productionCalendar: '生产日历',
    productionAnomaly: '异常上报',
    workStations: '工位管理',
    processRoutes: '工序路线',
    assemblyBoard: '装配看板',

    // 基础数据
    baseData: '基础数据',
    materials: '物料管理',
    boms: 'BOM管理',
    customers: '客户管理',
    suppliers: '供应商管理',
    categories: '产品大类',
    units: '单位管理',
    locations: '库位管理',
    processTemplates: '工序模板',
    productCategories: '产品分类',
    ecnManagement: 'ECN变更管理',

    // 库存管理
    inventory: '库存管理',
    stock: '库存查询',
    inbound: '入库管理',
    outbound: '出库管理',
    transfer: '库存调拨',
    check: '库存盘点',
    inventoryReport: '库存报表',
    transaction: '流水报表',
    manualTransaction: '手工交易',
    yearEnd: '年终盘点',

    // 采购管理
    purchase: '采购管理',
    requisitions: '采购申请',
    orders: '采购订单',
    receipts: '采购入库',
    returns: '采购退货',
    processing: '外委加工',
    processingReceipts: '外委入库',
    purchaseHistory: '采购历史',

    // 销售管理
    sales: '销售管理',
    salesOrders: '销售订单',
    salesOutbound: '销售出库',
    salesReturns: '销售退货',
    exchanges: '销售换货',
    quotations: '报价单统计',
    packingLists: '装箱单',
    deliveryStats: '配送统计',
    contracts: '合同管理',

    // 财务管理
    finance: '财务管理',
    accounts: '会计科目',
    entries: '会计凭证',
    periods: '会计期间',
    openingBalances: '期初余额',
    trialBalance: '试算平衡表',
    periodClosing: '期末结账',
    arInvoices: '销售发票',
    receiptsManagement: '收款记录',
    arAging: '应收账龄',
    apInvoices: '采购发票',
    payments: '付款记录',
    apAging: '应付账龄',
    assets: '固定资产',
    assetCategories: '资产类别',
    depreciation: '折旧管理',
    assetCIP: '在建工程',
    assetInventory: '资产盘点',
    assetReports: '资产报表',
    cashierManagement: '出纳管理',
    bankAccounts: '银行账户',
    bankTransactions: '银行交易',
    cashTransactions: '现金交易',
    transactions: '交易记录',
    reconciliation: '银行对账',
    balanceSheet: '资产负债表',
    incomeStatement: '利润表',
    cashFlow: '出纳报表',
    standardCashFlow: '标准现金流量表',
    financeAutomation: '财务自动化',
    taxManagement: '税务管理',
    taxInvoices: '税务发票',
    taxReturns: '纳税申报',
    taxAccountConfig: '税务科目配置',
    budgetManagement: '预算管理',
    budgetList: '预算列表',
    budgetExecution: '预算执行',
    budgetAI: '智能预算',
    costAccounting: '成本核算',
    costDashboard: '成本总览',
    standardCost: '标准成本',
    actualCost: '实际成本',
    costVariance: '成本差异',
    costSettings: '成本设置',
    costCenter: '成本中心',
    costLedger: '成本分类账',
    profitability: '盈利分析',
    activityBasedCosting: '作业成本法',
    productPricing: '产品定价',
    expenses: '费用管理',
    expenseCategories: '费用类别',
    financeSettings: '财务设置',
    exchangeRates: '汇率管理',

    // 质量管理
    quality: '质量管理',
    incoming: '来料检验',
    processInspection: '过程检验',
    firstArticle: '首检管理',
    final: '成品检验',
    templates: '检验模板',
    traceability: '追溯管理',
    nonconforming: '不合格品',
    eightDReport: '8D报告',
    aqlStandards: 'AQL抽样标准',
    replacementOrders: '换货单管理',
    reworkTasks: '返工任务',
    scrapRecords: '报废记录',
    qualityStatistics: '质量统计',
    gaugeManagement: '量具管理',
    spcControlChart: 'SPC控制图',
    supplierQuality: '供应商质量计分卡',

    // 设备管理
    equipment: '设备管理',
    equipmentList: '设备台账',
    maintenance: '设备维护',
    inspection: '设备检修',
    equipmentStatus: '设备状态',

    // 人力资源
    hr: '人力资源',
    employees: '员工管理',
    attendance: '考勤管理',
    salary: '薪资管理',
    performance: '绩效考核',

    // 系统管理
    system: '系统管理',
    users: '用户管理',
    departments: '部门管理',
    permissions: '权限设置',
    print: '打印设置',
    notifications: '通知管理',
    notificationRules: '通知规则',
    technicalCommunication: '技术沟通',
    workflow: '工作流管理',
    codingRules: '编码规则',
    documents: '文档管理',
    businessAlerts: '业务预警',
    businessTypes: '业务类型',

    backup: '数据备份'
  },

  // 用户相关
  user: {
    profile: '个人信息',
    settings: '设置',
    logout: '退出登录',
    login: '登录',
    username: '用户名',
    password: '密码',
    email: '邮箱',
    phone: '手机号',
    role: '角色',
    department: '部门',
    avatar: '头像',
    name: '姓名',
    realName: '真实姓名',
    nickname: '昵称',
    gender: '性别',
    birthday: '生日',
    address: '地址',
    bio: '个人简介',
    changePassword: '修改密码',
    oldPassword: '原密码',
    newPassword: '新密码',
    confirmPassword: '确认密码'
  },

  // 语言设置
  language: {
    title: '语言设置',
    chinese: '中文',
    english: 'English',
    korean: '한국어',
    switchSuccess: '语言切换成功',
    current: '当前语言'
  },

  // 系统标题
  system: {
    title: 'KACON',
    welcome: '欢迎使用',
    version: '版本',
    copyright: '版权所有'
  },

  // 表单验证
  validation: {
    required: '此字段为必填项',
    email: '请输入有效的邮箱地址',
    phone: '请输入有效的手机号码',
    password: '密码长度至少6位',
    confirmPassword: '两次输入的密码不一致',
    minLength: '最少输入{min}个字符',
    maxLength: '最多输入{max}个字符',
    number: '请输入数字',
    positive: '请输入正数',
    integer: '请输入整数'
  },

  // 消息提示
  message: {
    saveSuccess: '保存成功',
    saveFailed: '保存失败',
    deleteSuccess: '删除成功',
    deleteFailed: '删除失败',
    updateSuccess: '更新成功',
    updateFailed: '更新失败',
    createSuccess: '创建成功',
    createFailed: '创建失败',
    loginSuccess: '登录成功',
    loginFailed: '登录失败',
    logoutSuccess: '退出成功',
    networkError: '网络错误，请稍后重试',
    serverError: '服务器错误',
    permissionDenied: '权限不足',
    dataNotFound: '数据不存在',
    operationConfirm: '确定要执行此操作吗？',
    deleteConfirm: '确定要删除吗？此操作不可恢复',
    unsavedChanges: '有未保存的更改，确定要离开吗？',
    loadFailed: '加载失败',
    syncSuccess: '同步完毕',
    syncFailed: '同步失败',
    exportSuccess: '导出成功',
    exportFailed: '导出失败',
    resetSuccess: '重置成功',
    resetFailed: '重置失败',
    menuLoadFailed: '菜单加载失败，请刷新后重试'
  },

  // 页面标题和内容
  page: {
    // 仪表盘
    dashboard: {
      title: '仪表盘',
      managedUsers: '管理人数',
      todoItems: '待办事项',
      warningItems: '预警事项',
      documentCount: '文档数量',
      workOverview: '工作概览',
      personalInfo: '个人信息',
      quickActions: '快捷操作',
      recentActivities: '最近活动',
      systemStatus: '系统状态',
      dataStatistics: '数据统计'
    },

    // 登录页面
    login: {
      title: '登录',
      username: '用户名',
      password: '密码',
      rememberMe: '记住我',
      forgotPassword: '忘记密码？',
      loginButton: '登录',
      welcomeBack: '欢迎回来',
      pleaseLogin: '请登录您的账户'
    },

    // 用户资料
    profile: {
      title: '个人资料',
      basicInfo: '基本信息',
      avatar: '头像',
      username: '用户名',
      realName: '真实姓名',
      email: '邮箱',
      phone: '电话',
      department: '部门',
      role: '角色',
      lastLogin: '最后登录',
      changePassword: '修改密码',
      oldPassword: '原密码',
      newPassword: '新密码',
      confirmPassword: '确认密码'
    },

    // 基础数据管理
    baseData: {
      // 物料管理
      materials: {
        title: '物料管理',
        add: '新增物料',
        keywordSearch: '关键字搜索',
        keywordPlaceholder: '物料编码/名称/规格型号',
        category: '物料分类',
        categoryPlaceholder: '请选择物料分类',
        statusPlaceholder: '请选择状态',
        enabled: '启用',
        disabled: '禁用',
        query: '查询',
        reset: '重置',
        export: '导出',
        import: '导入',
        totalCount: '总数量',
        enabledCount: '启用数量',
        disabledCount: '禁用数量',
        lowStockCount: '低库存数量',
        code: '物料编码',
        name: '物料名称',
        specification: '规格型号',
        unit: '单位',
        price: '单价',
        stock: '库存',
        safetyStock: '安全库存',
        supplier: '供应商',
        lastUpdate: '最后更新'
      },

      // 客户管理
      customers: {
        title: '客户管理',
        add: '新增客户',
        customerCode: '客户编码',
        customerName: '客户名称',
        customerCodePlaceholder: '请输入客户编码',
        customerNamePlaceholder: '请输入客户名称',
        contact: '联系人',
        phone: '联系电话',
        address: '地址',
        level: '客户等级',
        creditLimit: '信用额度',
        totalCustomers: '客户总数',
        activeCustomers: '启用状态',
        inactiveCustomers: '禁用状态'
      },

      // 供应商管理
      suppliers: {
        title: '供应商管理',
        add: '新增供应商',
        supplierCode: '供应商编码',
        supplierName: '供应商名称',
        supplierCodePlaceholder: '请输入供应商编码',
        supplierNamePlaceholder: '请输入供应商名称',
        contact: '联系人',
        phone: '联系电话',
        address: '地址',
        level: '供应商等级',
        paymentTerms: '付款条件',
        totalSuppliers: '供应商总数',
        activeSuppliers: '启用状态',
        inactiveSuppliers: '禁用状态'
      }
    },

    // 库存管理
    inventory: {
      title: '库存管理',
      stock: {
        title: '库存查询',
        materialCode: '物料编码',
        materialName: '物料名称',
        materialSearchPlaceholder: '搜索物料',
        currentStock: '当前库存',
        availableStock: '可用库存',
        reservedStock: '预留库存',
        location: '库位',
        lastUpdate: '最后更新',
        stockAdjustment: '库存调整'
      },
      inbound: {
        title: '入库管理',
        add: '新增入库',
        inboundNo: '入库单号',
        inboundType: '入库类型',
        supplier: '供应商',
        inboundDate: '入库日期',
        totalAmount: '总金额'
      },
      outbound: {
        title: '出库管理',
        add: '新增出库',
        outboundNo: '出库单号',
        outboundType: '出库类型',
        customer: '客户',
        outboundDate: '出库日期',
        totalAmount: '总金额'
      }
    },

    // 采购管理
    purchase: {
      title: '采购管理',
      orders: {
        title: '采购订单',
        add: '新增订单',
        orderNo: '订单号',
        orderNoPlaceholder: '请输入订单编号',
        supplier: '供应商',
        supplierPlaceholder: '请选择供应商',
        orderDate: '订单日期',
        deliveryDate: '交货日期',
        totalAmount: '订单金额',
        status: '订单状态'
      },
      requisitions: {
        title: '采购申请',
        add: '新增申请',
        requisitionNo: '申请单号',
        applicant: '申请人',
        applyDate: '申请日期',
        urgency: '紧急程度',
        reason: '申请原因'
      }
    },

    // 销售管理
    sales: {
      title: '销售管理',
      orders: {
        title: '销售订单',
        add: '新增订单',
        orderNo: '订单号',
        customer: '客户',
        orderDate: '订单日期',
        deliveryDate: '交货日期',
        totalAmount: '订单金额',
        status: '订单状态',
        orderNoCustomer: '订单编号/客户',
        orderNoCustomerPlaceholder: '订单编号/客户名称'
      }
    },

    // 生产管理
    production: {
      title: '生产管理',
      plan: {
        title: '生产计划',
        add: '新增计划',
        planNo: '计划编号',
        productName: '产品名称',
        planQuantity: '计划数量',
        startDate: '开始日期',
        endDate: '结束日期',
        status: '计划状态'
      },
      task: {
        title: '生产任务',
        add: '新增任务',
        taskNo: '任务编号',
        workOrder: '工单号',
        operator: '操作员',
        startTime: '开始时间',
        endTime: '结束时间',
        status: '任务状态'
      },
      gantt: {
        title: '排程甘特图',
        subtitle: '按生产组查看任务排程、延期和日期异常',
        productionGroup: '生产组',
        tasks: '任务',
        active: '在制',
        overdue: '逾期',
        dateIssue: '日期异常',
        source: '来源',
        noTasks: '所选时间范围内没有排程任务',
        goToSchedule: '前往生产任务排程',
        taskSchedule: '任务排程',
        quantity: '数量',
        startTime: '开始',
        endTime: '结束',
        plan: '计划',
        deliveryDate: '交期',
        alreadyOverdue: '已逾期',
        endBeforeStart: '计划结束早于开始'
      }
    },

    // 质量管理
    quality: {
      title: '质量管理',
      eightD: {
        title: '8D问题解决报告',
        add: '新增8D报告',
        reportNo: '报告编号',
        reportTitle: '标题',
        ncpNo: '关联NCP',
        materialName: '物料名称',
        initiatedBy: '发起人',
        owner: '主负责人',
        priority: '优先级',
        currentPhase: '当前阶段',
        progress: '进度',
        targetCloseDate: '目标关闭',
        allReports: '全部报告',
        inProgress: '进行中',
        pendingReview: '待审核',
        completed: '已完成',
        critical: '紧急',
        filing: '立案',
        firstReview: '初审',
        rectification: '整改',
        closingReview: '结案审核',
        summary: '总结',
        complete: '完成',
        submitFirstReview: '提交初审',
        submitClosing: '提交结案',
        aiGenerate: 'AI辅助生成',
        exportPdf: '导出 PDF',
        auditLog: '8D生命周期审计流转记录'
      }
    },

    // 人力资源
    hr: {
      employees: {
        title: '员工档案与薪酬基数设定',
        syncDingtalk: '钉钉通讯录全量拉取',
        manualAdd: '手动新增',
        employeeNo: '工号',
        name: '姓名',
        department: '部门',
        insuranceType: '社保类型',
        baseSalary: '基本工资',
        splitBaseSalary: '拆分报税基数',
        positionAllowance: '职位/外补',
        housingAllowance: '房补/交补',
        mealAllowance: '餐补',
        overtimeRate: '加班时薪',
        employmentStatus: '在职状态',
        active: '在职',
        left: '离职',
        salaryBase: '薪酬基数',
        subsidySettings: '补贴设定',
        basicInfo: '基本信息'
      }
    },

    // 系统管理
    systemMgmt: {
      codingRules: {
        title: '编码规则管理',
        subtitle: '配置各业务单据的自动编号规则，支持前缀、日期、流水号组合',
        addRule: '新增规则',
        businessType: '业务类型',
        ruleName: '规则名称',
        codeRule: '编码规则',
        resetCycle: '重置周期',
        nextNumber: '下一个编号',
        description: '说明',
        prefix: '前缀',
        dateFormat: '日期格式',
        separator: '分隔符',
        sequenceLength: '流水号位数',
        initialValue: '起始值',
        step: '步长',
        preview: '编号预览',
        noReset: '不重置',
        daily: '每日',
        monthly: '每月',
        yearly: '每年',
        sequenceDetail: '序列详情',
        periodKey: '周期键',
        currentValue: '当前值',
        resetAllSequences: '重置全部序列'
      }
    }
  }
}
