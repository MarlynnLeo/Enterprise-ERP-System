/**
 * en.js
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 2.0.0
 */

export default {
  // Common
  common: {
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    reset: 'Reset',
    submit: 'Submit',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    loading: 'Loading...',
    noData: 'No Data',
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info',
    yes: 'Yes',
    no: 'No',
    close: 'Close',
    refresh: 'Refresh',
    export: 'Export',
    import: 'Import',
    print: 'Print',
    view: 'View',
    detail: 'Detail',
    status: 'Status',
    action: 'Action',
    remark: 'Remark',
    createTime: 'Create Time',
    updateTime: 'Update Time',
    operator: 'Operator',
    total: 'Total',
    select: 'Select',
    selectAll: 'Select All',
    clear: 'Clear',
    completed: 'Completed',
    pending: 'Pending',
    type: 'Type',
    title: 'Title',
    deadline: 'Deadline',
    handle: 'Handle',
    initiated: 'Initiated',
    received: 'Received',
    initiator: 'Initiator',
    initiateTime: 'Initiate Time',
    drawingNo: 'Drawing No.',
    defaultLocation: 'Default Location',
    minStock: 'Min Stock',
    maxStock: 'Max Stock',
    referencePrice: 'Reference Price',
    currency: 'CNY',
    adjust: 'Adjust',
    enable: 'Enable',
    disable: 'Disable',
    all: 'All',
    query: 'Query',
    expand: 'Expand',
    collapse: 'Collapse',
    approve: 'Approve',
    reject: 'Reject',
    draft: 'Draft',
    inProgress: 'In Progress',
    review: 'Review',
    archive: 'Archive',
    avatarEffect: 'Avatar Effect',
    expandCollapseSidebar: 'Toggle Sidebar',
    themeSettings: 'Theme Settings',
    notificationCenter: 'Notifications',
    userMenu: 'User Menu'
  },

  // Navigation Menu
  menu: {
    dashboard: 'Dashboard',

    // Data Overview
    dataOverview: 'Data Overview',
    productionBoard: 'Production Board',
    inventoryBoard: 'Inventory Board',
    salesBoard: 'Sales Board',
    financeBoard: 'Finance Board',
    qualityBoard: 'Quality Board',
    purchaseBoard: 'Purchase Board',

    // Production Management
    production: 'Production',
    productionPlan: 'Production Plan',
    productionTask: 'Production Task',
    productionProcess: 'Production Process',
    productionReport: 'Production Report',
    equipmentMonitoring: 'Equipment Monitoring',
    materialShortage: 'Material Shortage',
    materialReadiness: 'Material Readiness',
    mrpPlanning: 'MRP Planning',
    productionDataView: 'Production Dashboard',
    productionGantt: 'Scheduling Gantt Chart',
    productionCalendar: 'Production Calendar',
    productionAnomaly: 'Anomaly Reports',
    workStations: 'Work Stations',
    processRoutes: 'Process Routes',
    assemblyBoard: 'Assembly Board',

    // Base Data
    baseData: 'Base Data',
    materials: 'Materials',
    boms: 'BOM Management',
    customers: 'Customers',
    suppliers: 'Suppliers',
    categories: 'Categories',
    units: 'Units',
    locations: 'Locations',
    processTemplates: 'Process Templates',
    productCategories: 'Product Categories',
    ecnManagement: 'ECN Management',

    // Inventory Management
    inventory: 'Inventory',
    stock: 'Stock Query',
    inbound: 'Inbound',
    outbound: 'Outbound',
    transfer: 'Transfer',
    check: 'Stock Check',
    inventoryReport: 'Inventory Report',
    transaction: 'Transaction Report',
    manualTransaction: 'Manual Transaction',
    yearEnd: 'Year-End Inventory',

    // Purchase Management
    purchase: 'Purchase',
    requisitions: 'Purchase Requisitions',
    orders: 'Purchase Orders',
    receipts: 'Purchase Receipts',
    returns: 'Purchase Returns',
    processing: 'Outsourcing',
    processingReceipts: 'Outsourcing Receipts',
    purchaseHistory: 'Purchase History',

    // Sales Management
    sales: 'Sales',
    salesOrders: 'Sales Orders',
    salesOutbound: 'Sales Outbound',
    salesReturns: 'Sales Returns',
    exchanges: 'Sales Exchanges',
    quotations: 'Quotation Statistics',
    packingLists: 'Packing Lists',
    deliveryStats: 'Delivery Statistics',
    contracts: 'Contract Management',

    // Finance Management
    finance: 'Finance',
    accounts: 'Chart of Accounts',
    entries: 'Journal Entries',
    periods: 'Accounting Periods',
    openingBalances: 'Opening Balances',
    trialBalance: 'Trial Balance',
    periodClosing: 'Period Closing',
    arInvoices: 'Sales Invoice',
    receiptsManagement: 'Receipt Records',
    arSettlement: 'AR Settlement',
    arAging: 'AR Aging',
    apInvoices: 'Purchase Invoice',
    payments: 'Payment Records',
    apSettlement: 'AP Settlement',
    apThreeWayMatch: 'Three-Way Match',
    apAging: 'AP Aging',
    assets: 'Fixed Assets',
    assetCategories: 'Asset Categories',
    depreciation: 'Depreciation',
    assetCIP: 'Construction in Progress',
    assetInventory: 'Asset Inventory',
    assetReports: 'Asset Reports',
    cashierManagement: 'Cashier Management',
    bankAccounts: 'Bank Accounts',
    bankTransactions: 'Bank Transactions',
    cashTransactions: 'Cash Transactions',
    transactions: 'Transactions',
    reconciliation: 'Bank Reconciliation',
    balanceSheet: 'Balance Sheet',
    incomeStatement: 'Income Statement',
    cashFlow: 'Cashier Report',
    standardCashFlow: 'Standard Cash Flow Statement',
    financeAutomation: 'Finance Automation',
    taxManagement: 'Tax Management',
    taxInvoices: 'Tax Invoices',
    taxReturns: 'Tax Returns',
    taxAccountConfig: 'Tax Account Config',
    budgetManagement: 'Budget Management',
    budgetList: 'Budget List',
    budgetExecution: 'Budget Execution',
    budgetAI: 'AI Budgeting',
    costAccounting: 'Cost Accounting',
    costDashboard: 'Cost Dashboard',
    standardCost: 'Standard Cost',
    actualCost: 'Actual Cost',
    costVariance: 'Cost Variance',
    costSettings: 'Cost Settings',
    costCenter: 'Cost Center',
    costLedger: 'Cost Ledger',
    profitability: 'Profitability Analysis',
    activityBasedCosting: 'Activity-Based Costing',
    productPricing: 'Product Pricing',
    expenses: 'Expense Management',
    expenseCategories: 'Expense Categories',
    financeSettings: 'Finance Settings',
    exchangeRates: 'Exchange Rates',

    // Quality Management
    quality: 'Quality',
    incoming: 'Incoming Inspection',
    processInspection: 'Process Inspection',
    firstArticle: 'First Article Inspection',
    final: 'Final Inspection',
    templates: 'Inspection Templates',
    traceability: 'Traceability',
    nonconforming: 'Nonconforming Products',
    eightDReport: '8D Report',
    aqlStandards: 'AQL Standards',
    replacementOrders: 'Replacement Orders',
    reworkTasks: 'Rework Tasks',
    scrapRecords: 'Scrap Records',
    qualityStatistics: 'Quality Statistics',
    gaugeManagement: 'Gauge Management',
    spcControlChart: 'SPC Control Chart',
    supplierQuality: 'Supplier Quality Scorecard',

    // Equipment Management
    equipment: 'Equipment',
    equipmentList: 'Equipment List',
    maintenance: 'Maintenance',
    inspection: 'Inspection',
    equipmentStatus: 'Equipment Status',

    // Human Resources
    hr: 'Human Resources',
    employees: 'Employees',
    attendance: 'Attendance',
    salary: 'Salary',
    performance: 'Performance',

    // System Management
    system: 'System',
    users: 'Users',
    departments: 'Departments',
    permissions: 'Permissions',
    print: 'Print Settings',
    notifications: 'Notifications',
    notificationRules: 'Notification Rules',
    technicalCommunication: 'Technical Communication',
    workflow: 'Workflow Management',
    codingRules: 'Coding Rules',
    documents: 'Document Management',
    businessAlerts: 'Business Alerts',
    businessTypes: 'Business Types',

    backup: 'Backup'
  },

  // User Related
  user: {
    profile: 'Profile',
    settings: 'Settings',
    logout: 'Logout',
    login: 'Login',
    username: 'Username',
    password: 'Password',
    email: 'Email',
    phone: 'Phone',
    role: 'Role',
    department: 'Department',
    avatar: 'Avatar',
    name: 'Name',
    realName: 'Real Name',
    nickname: 'Nickname',
    gender: 'Gender',
    birthday: 'Birthday',
    address: 'Address',
    bio: 'Bio',
    changePassword: 'Change Password',
    oldPassword: 'Old Password',
    newPassword: 'New Password',
    confirmPassword: 'Confirm Password'
  },

  // Language Settings
  language: {
    title: 'Language Settings',
    chinese: '中文',
    english: 'English',
    korean: '한국어',
    switchSuccess: 'Language switched successfully',
    current: 'Current Language'
  },

  // System Title
  system: {
    title: 'KACON',
    welcome: 'Welcome',
    version: 'Version',
    copyright: 'Copyright'
  },

  // Form Validation
  validation: {
    required: 'This field is required',
    email: 'Please enter a valid email address',
    phone: 'Please enter a valid phone number',
    password: 'Password must be at least 12 characters',
    confirmPassword: 'Passwords do not match',
    minLength: 'Minimum {min} characters required',
    maxLength: 'Maximum {max} characters allowed',
    number: 'Please enter a number',
    positive: 'Please enter a positive number',
    integer: 'Please enter an integer'
  },

  // Messages
  message: {
    saveSuccess: 'Saved successfully',
    saveFailed: 'Save failed',
    deleteSuccess: 'Deleted successfully',
    deleteFailed: 'Delete failed',
    updateSuccess: 'Updated successfully',
    updateFailed: 'Update failed',
    createSuccess: 'Created successfully',
    createFailed: 'Create failed',
    loginSuccess: 'Login successful',
    loginFailed: 'Login failed',
    logoutSuccess: 'Logout successful',
    networkError: 'Network error, please try again later',
    serverError: 'Server error',
    permissionDenied: 'Permission denied',
    dataNotFound: 'Data not found',
    operationConfirm: 'Are you sure you want to perform this operation?',
    deleteConfirm: 'Are you sure you want to delete? This action cannot be undone',
    unsavedChanges: 'You have unsaved changes, are you sure you want to leave?',
    loadFailed: 'Failed to load',
    syncSuccess: 'Sync completed',
    syncFailed: 'Sync failed',
    exportSuccess: 'Export successful',
    exportFailed: 'Export failed',
    resetSuccess: 'Reset successful',
    resetFailed: 'Reset failed',
    menuLoadFailed: 'Menu loading failed, please refresh and try again'
  },

  // Page titles and content
  page: {
    // Dashboard
    dashboard: {
      title: 'Dashboard',
      managedUsers: 'Managed Users',
      todoItems: 'Todo Items',
      warningItems: 'Warning Items',
      documentCount: 'Document Count',
      workOverview: 'Work Overview',
      personalInfo: 'Personal Info',
      quickActions: 'Quick Actions',
      recentActivities: 'Recent Activities',
      systemStatus: 'System Status',
      dataStatistics: 'Data Statistics'
    },

    // Login page
    login: {
      title: 'Login',
      username: 'Username',
      password: 'Password',
      rememberMe: 'Remember Me',
      forgotPassword: 'Forgot Password?',
      loginButton: 'Login',
      welcomeBack: 'Welcome Back',
      pleaseLogin: 'Please login to your account'
    },

    // User profile
    profile: {
      title: 'Profile',
      basicInfo: 'Basic Information',
      avatar: 'Avatar',
      username: 'Username',
      realName: 'Real Name',
      email: 'Email',
      phone: 'Phone',
      department: 'Department',
      role: 'Role',
      lastLogin: 'Last Login',
      changePassword: 'Change Password',
      oldPassword: 'Old Password',
      newPassword: 'New Password',
      confirmPassword: 'Confirm Password'
    },

    // Base Data Management
    baseData: {
      // Materials Management
      materials: {
        title: 'Materials Management',
        add: 'Add Material',
        keywordSearch: 'Keyword Search',
        keywordPlaceholder: 'Material Code/Name/Specification',
        category: 'Material Category',
        categoryPlaceholder: 'Please select category',
        statusPlaceholder: 'Please select status',
        enabled: 'Enabled',
        disabled: 'Disabled',
        query: 'Query',
        reset: 'Reset',
        export: 'Export',
        import: 'Import',
        totalCount: 'Total Count',
        enabledCount: 'Enabled Count',
        disabledCount: 'Disabled Count',
        lowStockCount: 'Low Stock Count',
        code: 'Material Code',
        name: 'Material Name',
        specification: 'Specification',
        unit: 'Unit',
        price: 'Price',
        stock: 'Stock',
        safetyStock: 'Safety Stock',
        supplier: 'Supplier',
        lastUpdate: 'Last Update'
      },

      // Customer Management
      customers: {
        title: 'Customer Management',
        add: 'Add Customer',
        customerCode: 'Customer Code',
        customerName: 'Customer Name',
        customerCodePlaceholder: 'Enter customer code',
        customerNamePlaceholder: 'Enter customer name',
        contact: 'Contact',
        phone: 'Phone',
        address: 'Address',
        level: 'Customer Level',
        creditLimit: 'Credit Limit',
        totalCustomers: 'Total Customers',
        activeCustomers: 'Active Status',
        inactiveCustomers: 'Inactive Status'
      },

      // Supplier Management
      suppliers: {
        title: 'Supplier Management',
        add: 'Add Supplier',
        supplierCode: 'Supplier Code',
        supplierName: 'Supplier Name',
        supplierCodePlaceholder: 'Enter supplier code',
        supplierNamePlaceholder: 'Enter supplier name',
        contact: 'Contact',
        phone: 'Phone',
        address: 'Address',
        level: 'Supplier Level',
        paymentTerms: 'Payment Terms',
        totalSuppliers: 'Total Suppliers',
        activeSuppliers: 'Active Status',
        inactiveSuppliers: 'Inactive Status'
      }
    },

    // Inventory Management
    inventory: {
      title: 'Inventory Management',
      stock: {
        title: 'Stock Query',
        materialCode: 'Material Code',
        materialName: 'Material Name',
        materialSearchPlaceholder: 'Search materials',
        currentStock: 'Current Stock',
        availableStock: 'Available Stock',
        reservedStock: 'Reserved Stock',
        location: 'Location',
        lastUpdate: 'Last Update',
        stockAdjustment: 'Stock Adjustment'
      },
      inbound: {
        title: 'Inbound Management',
        add: 'Add Inbound',
        inboundNo: 'Inbound No.',
        inboundType: 'Inbound Type',
        supplier: 'Supplier',
        inboundDate: 'Inbound Date',
        totalAmount: 'Total Amount'
      },
      outbound: {
        title: 'Outbound Management',
        add: 'Add Outbound',
        outboundNo: 'Outbound No.',
        outboundType: 'Outbound Type',
        customer: 'Customer',
        outboundDate: 'Outbound Date',
        totalAmount: 'Total Amount'
      }
    },

    // Purchase Management
    purchase: {
      title: 'Purchase Management',
      orders: {
        title: 'Purchase Orders',
        add: 'Add Order',
        orderNo: 'Order No.',
        orderNoPlaceholder: 'Enter order number',
        supplier: 'Supplier',
        supplierPlaceholder: 'Select supplier',
        orderDate: 'Order Date',
        deliveryDate: 'Delivery Date',
        totalAmount: 'Order Amount',
        status: 'Order Status'
      },
      requisitions: {
        title: 'Purchase Requisitions',
        add: 'Add Requisition',
        requisitionNo: 'Requisition No.',
        applicant: 'Applicant',
        applyDate: 'Apply Date',
        urgency: 'Urgency',
        reason: 'Apply Reason'
      }
    },

    // Sales Management
    sales: {
      title: 'Sales Management',
      orders: {
        title: 'Sales Orders',
        add: 'Add Order',
        orderNo: 'Order No.',
        customer: 'Customer',
        orderDate: 'Order Date',
        deliveryDate: 'Delivery Date',
        totalAmount: 'Order Amount',
        status: 'Order Status',
        orderNoCustomer: 'Order No./Customer',
        orderNoCustomerPlaceholder: 'Order No./Customer Name'
      }
    },

    // Production Management
    production: {
      title: 'Production Management',
      plan: {
        title: 'Production Plan',
        add: 'Add Plan',
        planNo: 'Plan No.',
        productName: 'Product Name',
        planQuantity: 'Plan Quantity',
        startDate: 'Start Date',
        endDate: 'End Date',
        status: 'Plan Status'
      },
      task: {
        title: 'Production Task',
        add: 'Add Task',
        taskNo: 'Task No.',
        workOrder: 'Work Order',
        operator: 'Operator',
        startTime: 'Start Time',
        endTime: 'End Time',
        status: 'Task Status'
      },
      gantt: {
        title: 'Scheduling Gantt Chart',
        subtitle: 'View task scheduling, delays and date issues by production group',
        productionGroup: 'Production Group',
        tasks: 'Tasks',
        active: 'Active',
        overdue: 'Overdue',
        dateIssue: 'Date Issue',
        source: 'Source',
        noTasks: 'No scheduled tasks in selected date range',
        goToSchedule: 'Go to Production Task Scheduling',
        taskSchedule: 'Task Schedule',
        quantity: 'Quantity',
        startTime: 'Start',
        endTime: 'End',
        plan: 'Plan',
        deliveryDate: 'Delivery',
        alreadyOverdue: 'Overdue',
        endBeforeStart: 'End date is before start date'
      }
    },

    // Quality Management
    quality: {
      title: 'Quality Management',
      eightD: {
        title: '8D Problem Solving Report',
        add: 'Add 8D Report',
        reportNo: 'Report No.',
        reportTitle: 'Title',
        ncpNo: 'Related NCP',
        materialName: 'Material Name',
        initiatedBy: 'Initiated By',
        owner: 'Owner',
        priority: 'Priority',
        currentPhase: 'Current Phase',
        progress: 'Progress',
        targetCloseDate: 'Target Close Date',
        allReports: 'All Reports',
        inProgress: 'In Progress',
        pendingReview: 'Pending Review',
        completed: 'Completed',
        critical: 'Critical',
        filing: 'Filing',
        firstReview: 'First Review',
        rectification: 'Rectification',
        closingReview: 'Closing Review',
        summary: 'Summary',
        complete: 'Complete',
        submitFirstReview: 'Submit for Review',
        submitClosing: 'Submit for Closing',
        aiGenerate: 'AI-Assisted Generation',
        exportPdf: 'Export PDF',
        auditLog: '8D Lifecycle Audit Trail'
      }
    },

    // Human Resources
    hr: {
      employees: {
        title: 'Employee Records & Salary Base Settings',
        syncDingtalk: 'Sync from DingTalk',
        manualAdd: 'Add Manually',
        employeeNo: 'Employee No.',
        name: 'Name',
        department: 'Department',
        insuranceType: 'Insurance Type',
        baseSalary: 'Base Salary',
        splitBaseSalary: 'Split Tax Base',
        positionAllowance: 'Position Allowance',
        housingAllowance: 'Housing Allowance',
        mealAllowance: 'Meal Allowance',
        overtimeRate: 'Overtime Rate',
        employmentStatus: 'Employment Status',
        active: 'Active',
        left: 'Resigned',
        salaryBase: 'Salary Base',
        subsidySettings: 'Subsidy Settings',
        basicInfo: 'Basic Information'
      }
    },

    // System Management
    systemMgmt: {
      codingRules: {
        title: 'Coding Rules Management',
        subtitle: 'Configure automatic numbering rules for business documents, supporting prefix, date and serial number combinations',
        addRule: 'Add Rule',
        businessType: 'Business Type',
        ruleName: 'Rule Name',
        codeRule: 'Code Rule',
        resetCycle: 'Reset Cycle',
        nextNumber: 'Next Number',
        description: 'Description',
        prefix: 'Prefix',
        dateFormat: 'Date Format',
        separator: 'Separator',
        sequenceLength: 'Sequence Length',
        initialValue: 'Initial Value',
        step: 'Step',
        preview: 'Code Preview',
        noReset: 'No Reset',
        daily: 'Daily',
        monthly: 'Monthly',
        yearly: 'Yearly',
        sequenceDetail: 'Sequence Detail',
        periodKey: 'Period Key',
        currentValue: 'Current Value',
        resetAllSequences: 'Reset All Sequences'
      }
    }
  }
}
