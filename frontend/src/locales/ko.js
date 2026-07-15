/**
 * ko.js
 * @description 전端界면组件文件
  * @date 2025-08-27
 * @version 2.0.0
 */

export default {
  // 공통
  common: {
    confirm: '확인',
    cancel: '취소',
    save: '저장',
    delete: '삭제',
    edit: '편집',
    add: '추가',
    search: '검색',
    reset: '재설정',
    submit: '제출',
    back: '뒤로',
    next: '다음',
    previous: '이전',
    loading: '로딩 중...',
    noData: '데이터 없음',
    success: '성공',
    error: '오류',
    warning: '경고',
    info: '정보',
    yes: '예',
    no: '아니오',
    close: '닫기',
    refresh: '새로고침',
    export: '내보내기',
    import: '가져오기',
    print: '인쇄',
    view: '보기',
    detail: '상세',
    status: '상태',
    action: '작업',
    remark: '비고',
    createTime: '생성 시간',
    updateTime: '수정 시간',
    operator: '운영자',
    total: '총계',
    select: '선택',
    selectAll: '전체 선택',
    clear: '지우기',
    completed: '완료됨',
    pending: '대기 중',
    type: '유형',
    title: '제목',
    deadline: '마감일',
    handle: '처리',
    initiated: '내가 시작함',
    received: '내가 받음',
    initiator: '시작자',
    initiateTime: '시작 시간',
    drawingNo: '도면 번호',
    defaultLocation: '기본 위치',
    minStock: '최소 재고',
    maxStock: '최대 재고',
    referencePrice: '참조 가격',
    currency: '원',
    adjust: '조정',
    enable: '활성화',
    disable: '비활성화',
    all: '전체',
    query: '조회',
    expand: '펼치기',
    collapse: '접기',
    approve: '승인',
    reject: '반려',
    draft: '초안',
    inProgress: '진행 중',
    review: '검토',
    archive: '보관',
    avatarEffect: '아바타 효과',
    expandCollapseSidebar: '사이드바 토글',
    themeSettings: '테마 설정',
    notificationCenter: '알림 센터',
    userMenu: '사용자 메뉴'
  },

  // 네비게이션 메뉴
  menu: {
    dashboard: '대시보드',

    // 데이터 개요
    dataOverview: '데이터 개요',
    productionBoard: '생산 대시보드',
    inventoryBoard: '재고 대시보드',
    salesBoard: '판매 대시보드',
    financeBoard: '재무 대시보드',
    qualityBoard: '품질 대시보드',
    purchaseBoard: '구매 대시보드',

    // 생산 관리
    production: '생산 관리',
    productionPlan: '생산 계획',
    productionTask: '생산 작업',
    productionProcess: '생산 공정',
    productionReport: '생산 보고',
    equipmentMonitoring: '설비 모니터링',
    materialShortage: '자재 부족 통계',
    materialReadiness: '자재 완비 검사',
    mrpPlanning: '생산 수요',
    productionDataView: '생산 데이터 대시보드',
    productionGantt: '일정 간트 차트',
    productionCalendar: '생산 캘린더',
    productionAnomaly: '이상 보고',
    workStations: '작업대 관리',
    processRoutes: '공정 경로',
    assemblyBoard: '조립 보드',

    // 기초 데이터
    baseData: '기초 데이터',
    materials: '자재 관리',
    boms: 'BOM 관리',
    customers: '고객 관리',
    suppliers: '공급업체 관리',
    categories: '카테고리 관리',
    units: '단위 관리',
    locations: '위치 관리',
    processTemplates: '공정 템플릿',
    productCategories: '제품 카테고리',
    ecnManagement: 'ECN 변경 관리',

    // 재고 관리
    inventory: '재고 관리',
    stock: '재고 조회',
    inbound: '입고 관리',
    outbound: '출고 관리',
    transfer: '재고 이동',
    check: '재고 실사',
    inventoryReport: '재고 보고서',
    transaction: '거래 보고서',
    manualTransaction: '수동 거래',
    yearEnd: '연말 재고 실사',

    // 구매 관리
    purchase: '구매 관리',
    requisitions: '구매 요청',
    orders: '구매 주문',
    receipts: '구매 입고',
    returns: '구매 반품',
    processing: '외주 가공',
    processingReceipts: '외주 입고',
    purchaseHistory: '구매 이력',

    // 판매 관리
    sales: '판매 관리',
    salesOrders: '판매 주문',
    salesOutbound: '판매 출고',
    salesReturns: '판매 반품',
    exchanges: '판매 교환',
    quotations: '견적서 통계',
    packingLists: '포장 명세서',
    deliveryStats: '배송 통계',
    contracts: '계약 관리',

    // 재무 관리
    finance: '재무 관리',
    accounts: '계정과목',
    entries: '회계 전표',
    periods: '회계 기간',
    openingBalances: '기초 잔액',
    trialBalance: '시산표',
    periodClosing: '기말 마감',
    arInvoices: '매출 청구서',
    receiptsManagement: '수금 기록',
    arAging: '매출채권 연령',
    apInvoices: '매입 청구서',
    payments: '지급 기록',
    apAging: '매입채무 연령',
    assets: '고정자산',
    assetCategories: '자산 카테고리',
    depreciation: '감가상각',
    assetCIP: '건설 중인 자산',
    assetInventory: '자산 실사',
    assetReports: '자산 보고서',
    cashierManagement: '출납 관리',
    bankAccounts: '은행 계좌',
    bankTransactions: '은행 거래',
    cashTransactions: '현금 거래',
    transactions: '거래 내역',
    reconciliation: '은행 대사',
    balanceSheet: '대차대조표',
    incomeStatement: '손익계산서',
    cashFlow: '출납보고서',
    standardCashFlow: '표준 현금흐름표',
    financeAutomation: '재무 자동화',
    taxManagement: '세무 관리',
    taxInvoices: '세금 계산서',
    taxReturns: '세금 신고',
    taxAccountConfig: '세무 계정 설정',
    budgetManagement: '예산 관리',
    budgetList: '예산 목록',
    budgetExecution: '예산 집행',
    budgetAI: 'AI 예산',
    costAccounting: '원가 회계',
    costDashboard: '원가 대시보드',
    standardCost: '표준 원가',
    actualCost: '실제 원가',
    costVariance: '원가 차이',
    costSettings: '원가 설정',
    costCenter: '원가 센터',
    costLedger: '원가 원장',
    profitability: '수익성 분석',
    activityBasedCosting: '활동기준 원가계산',
    productPricing: '제품 가격 책정',
    expenses: '비용 관리',
    expenseCategories: '비용 카테고리',
    financeSettings: '재무 설정',
    exchangeRates: '환율 관리',

    // 품질 관리
    quality: '품질 관리',
    incoming: '입고 검사',
    processInspection: '공정 검사',
    firstArticle: '초도품 검사',
    final: '최종 검사',
    templates: '검사 템플릿',
    traceability: '추적성 관리',
    nonconforming: '부적합품',
    eightDReport: '8D 보고서',
    aqlStandards: 'AQL 샘플링 기준',
    replacementOrders: '교환 주문',
    reworkTasks: '재작업 관리',
    scrapRecords: '폐기 기록',
    qualityStatistics: '품질 통계',
    gaugeManagement: '계측기 관리',
    spcControlChart: 'SPC 관리도',
    supplierQuality: '공급업체 품질 평가표',

    // 장비 관리
    equipment: '장비 관리',
    equipmentList: '장비 목록',
    maintenance: '유지보수',
    inspection: '점검',
    equipmentStatus: '장비 상태',

    // 인사 관리
    hr: '인사 관리',
    employees: '직원 관리',
    attendance: '출근 관리',
    salary: '급여 관리',
    performance: '성과 관리',

    // 시스템 관리
    system: '시스템 관리',
    users: '사용자 관리',
    departments: '부서 관리',
    permissions: '권한 관리',
    print: '인쇄 설정',
    notifications: '알림 관리',
    notificationRules: '알림 규칙',
    technicalCommunication: '기술 커뮤니케이션',
    workflow: '워크플로우 관리',
    codingRules: '코딩 규칙',
    documents: '문서 관리',
    businessAlerts: '업무 알림',
    businessTypes: '업무 유형',

    backup: '데이터 백업'
  },

  // 사용자 관련
  user: {
    profile: '프로필',
    settings: '설정',
    logout: '로그아웃',
    login: '로그인',
    username: '사용자명',
    password: '비밀번호',
    email: '이메일',
    phone: '전화번호',
    role: '역할',
    department: '부서',
    avatar: '아바타',
    name: '이름',
    realName: '실명',
    nickname: '닉네임',
    gender: '성별',
    birthday: '생일',
    address: '주소',
    bio: '자기소개',
    changePassword: '비밀번호 변경',
    oldPassword: '기존 비밀번호',
    newPassword: '새 비밀번호',
    confirmPassword: '비밀번호 확인'
  },

  // 언어 설정
  language: {
    title: '언어 설정',
    chinese: '中文',
    english: 'English',
    korean: '한국어',
    switchSuccess: '언어가 성공적으로 변경되었습니다',
    current: '현재 언어'
  },

  // 시스템 제목
  system: {
    title: 'KACON',
    welcome: '환영합니다',
    version: '버전',
    copyright: '저작권'
  },

  // 폼 검증
  validation: {
    required: '이 필드는 필수입니다',
    email: '유효한 이메일 주소를 입력하세요',
    phone: '유효한 전화번호를 입력하세요',
    password: '비밀번호는 최소 6자 이상이어야 합니다',
    confirmPassword: '비밀번호가 일치하지 않습니다',
    minLength: '최소 {min}자 이상 입력하세요',
    maxLength: '최대 {max}자까지 입력 가능합니다',
    number: '숫자를 입력하세요',
    positive: '양수를 입력하세요',
    integer: '정수를 입력하세요'
  },

  // 메시지
  message: {
    saveSuccess: '저장되었습니다',
    saveFailed: '저장에 실패했습니다',
    deleteSuccess: '삭제되었습니다',
    deleteFailed: '삭제에 실패했습니다',
    updateSuccess: '업데이트되었습니다',
    updateFailed: '업데이트에 실패했습니다',
    createSuccess: '생성되었습니다',
    createFailed: '생성에 실패했습니다',
    loginSuccess: '로그인되었습니다',
    loginFailed: '로그인에 실패했습니다',
    logoutSuccess: '로그아웃되었습니다',
    networkError: '네트워크 오류입니다. 나중에 다시 시도하세요',
    serverError: '서버 오류',
    permissionDenied: '권한이 없습니다',
    dataNotFound: '데이터를 찾을 수 없습니다',
    operationConfirm: '이 작업을 수행하시겠습니까?',
    deleteConfirm: '정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다',
    unsavedChanges: '저장되지 않은 변경사항이 있습니다. 정말 나가시겠습니까?',
    loadFailed: '로드에 실패했습니다',
    syncSuccess: '동기화가 완료되었습니다',
    syncFailed: '동기화에 실패했습니다',
    exportSuccess: '내보내기에 성공했습니다',
    exportFailed: '내보내기에 실패했습니다',
    resetSuccess: '재설정되었습니다',
    resetFailed: '재설정에 실패했습니다',
    menuLoadFailed: '메뉴 로딩에 실패했습니다. 새로고침 후 다시 시도하세요'
  },

  // 페이지 제목 및 내용
  page: {
    // 대시보드
    dashboard: {
      title: '대시보드',
      managedUsers: '관리 사용자',
      todoItems: '할 일 항목',
      warningItems: '경고 항목',
      documentCount: '문서 수',
      workOverview: '업무 개요',
      personalInfo: '개인 정보',
      quickActions: '빠른 작업',
      recentActivities: '최근 활동',
      systemStatus: '시스템 상태',
      dataStatistics: '데이터 통계'
    },

    // 로그인 페이지
    login: {
      title: '로그인',
      username: '사용자명',
      password: '비밀번호',
      rememberMe: '로그인 상태 유지',
      forgotPassword: '비밀번호를 잊으셨나요?',
      loginButton: '로그인',
      welcomeBack: '다시 오신 것을 환영합니다',
      pleaseLogin: '계정에 로그인해 주세요'
    },

    // 사용자 프로필
    profile: {
      title: '프로필',
      basicInfo: '기본 정보',
      avatar: '아바타',
      username: '사용자명',
      realName: '실명',
      email: '이메일',
      phone: '전화번호',
      department: '부서',
      role: '역할',
      lastLogin: '마지막 로그인',
      changePassword: '비밀번호 변경',
      oldPassword: '기존 비밀번호',
      newPassword: '새 비밀번호',
      confirmPassword: '비밀번호 확인'
    },

    // 기초 데이터 관리
    baseData: {
      // 자재 관리
      materials: {
        title: '자재 관리',
        add: '자재 추가',
        keywordSearch: '키워드 검색',
        keywordPlaceholder: '자재 코드/이름/사양',
        category: '자재 카테고리',
        categoryPlaceholder: '카테고리를 선택하세요',
        statusPlaceholder: '상태를 선택하세요',
        enabled: '활성화',
        disabled: '비활성화',
        query: '조회',
        reset: '재설정',
        export: '내보내기',
        import: '가져오기',
        totalCount: '총 수량',
        enabledCount: '활성화 수량',
        disabledCount: '비활성화 수량',
        lowStockCount: '낮은 재고 수량',
        code: '자재 코드',
        name: '자재 이름',
        specification: '사양',
        unit: '단위',
        price: '가격',
        stock: '재고',
        safetyStock: '안전 재고',
        supplier: '공급업체',
        lastUpdate: '마지막 업데이트'
      },

      // 고객 관리
      customers: {
        title: '고객 관리',
        add: '고객 추가',
        customerCode: '고객 코드',
        customerName: '고객 이름',
        customerCodePlaceholder: '고객 코드를 입력하세요',
        customerNamePlaceholder: '고객 이름을 입력하세요',
        contact: '연락처',
        phone: '전화번호',
        address: '주소',
        level: '고객 등급',
        creditLimit: '신용 한도',
        totalCustomers: '총 고객 수',
        activeCustomers: '활성 상태',
        inactiveCustomers: '비활성 상태'
      },

      // 공급업체 관리
      suppliers: {
        title: '공급업체 관리',
        add: '공급업체 추가',
        supplierCode: '공급업체 코드',
        supplierName: '공급업체 이름',
        supplierCodePlaceholder: '공급업체 코드를 입력하세요',
        supplierNamePlaceholder: '공급업체 이름을 입력하세요',
        contact: '연락처',
        phone: '전화번호',
        address: '주소',
        level: '공급업체 등급',
        paymentTerms: '결제 조건',
        totalSuppliers: '총 공급업체 수',
        activeSuppliers: '활성 상태',
        inactiveSuppliers: '비활성 상태'
      }
    },

    // 재고 관리
    inventory: {
      title: '재고 관리',
      stock: {
        title: '재고 조회',
        materialCode: '자재 코드',
        materialName: '자재 이름',
        materialSearchPlaceholder: '자재 검색',
        currentStock: '현재 재고',
        availableStock: '사용 가능 재고',
        reservedStock: '예약 재고',
        location: '위치',
        lastUpdate: '마지막 업데이트',
        stockAdjustment: '재고 조정'
      },
      inbound: {
        title: '입고 관리',
        add: '입고 추가',
        inboundNo: '입고 번호',
        inboundType: '입고 유형',
        supplier: '공급업체',
        inboundDate: '입고 날짜',
        totalAmount: '총 금액'
      },
      outbound: {
        title: '출고 관리',
        add: '출고 추가',
        outboundNo: '출고 번호',
        outboundType: '출고 유형',
        customer: '고객',
        outboundDate: '출고 날짜',
        totalAmount: '총 금액'
      }
    },

    // 구매 관리
    purchase: {
      title: '구매 관리',
      orders: {
        title: '구매 주문',
        add: '주문 추가',
        orderNo: '주문 번호',
        orderNoPlaceholder: '주문 번호를 입력하세요',
        supplier: '공급업체',
        supplierPlaceholder: '공급업체를 선택하세요',
        orderDate: '주문 날짜',
        deliveryDate: '배송 날짜',
        totalAmount: '주문 금액',
        status: '주문 상태'
      },
      requisitions: {
        title: '구매 요청',
        add: '요청 추가',
        requisitionNo: '요청 번호',
        applicant: '신청자',
        applyDate: '신청 날짜',
        urgency: '긴급도',
        reason: '신청 사유'
      }
    },

    // 판매 관리
    sales: {
      title: '판매 관리',
      orders: {
        title: '판매 주문',
        add: '주문 추가',
        orderNo: '주문 번호',
        customer: '고객',
        orderDate: '주문 날짜',
        deliveryDate: '배송 날짜',
        totalAmount: '주문 금액',
        status: '주문 상태',
        orderNoCustomer: '주문 번호/고객',
        orderNoCustomerPlaceholder: '주문 번호/고객 이름'
      }
    },

    // 생산 관리
    production: {
      title: '생산 관리',
      plan: {
        title: '생산 계획',
        add: '계획 추가',
        planNo: '계획 번호',
        productName: '제품 이름',
        planQuantity: '계획 수량',
        startDate: '시작 날짜',
        endDate: '종료 날짜',
        status: '계획 상태'
      },
      task: {
        title: '생산 작업',
        add: '작업 추가',
        taskNo: '작업 번호',
        workOrder: '작업 지시서',
        operator: '운영자',
        startTime: '시작 시간',
        endTime: '종료 시간',
        status: '작업 상태'
      },
      gantt: {
        title: '일정 간트 차트',
        subtitle: '생산 그룹별 작업 일정, 지연 및 날짜 이상 확인',
        productionGroup: '생산 그룹',
        tasks: '작업',
        active: '진행 중',
        overdue: '지연',
        dateIssue: '날짜 이상',
        source: '출처',
        noTasks: '선택한 날짜 범위에 예정된 작업이 없습니다',
        goToSchedule: '생산 작업 일정으로 이동',
        taskSchedule: '작업 일정',
        quantity: '수량',
        startTime: '시작',
        endTime: '종료',
        plan: '계획',
        deliveryDate: '납기일',
        alreadyOverdue: '지연됨',
        endBeforeStart: '종료일이 시작일보다 빠릅니다'
      }
    },

    // 품질 관리
    quality: {
      title: '품질 관리',
      eightD: {
        title: '8D 문제 해결 보고서',
        add: '8D 보고서 추가',
        reportNo: '보고서 번호',
        reportTitle: '제목',
        ncpNo: '관련 NCP',
        materialName: '자재명',
        initiatedBy: '발의자',
        owner: '담당자',
        priority: '우선순위',
        currentPhase: '현재 단계',
        progress: '진행률',
        targetCloseDate: '목표 종료일',
        allReports: '전체 보고서',
        inProgress: '진행 중',
        pendingReview: '검토 대기',
        completed: '완료',
        critical: '긴급',
        filing: '입안',
        firstReview: '초기 검토',
        rectification: '시정',
        closingReview: '종결 검토',
        summary: '요약',
        complete: '완료',
        submitFirstReview: '초기 검토 제출',
        submitClosing: '종결 제출',
        aiGenerate: 'AI 보조 생성',
        exportPdf: 'PDF 내보내기',
        auditLog: '8D 생명주기 감사 추적'
      }
    },

    // 인사 관리
    hr: {
      employees: {
        title: '직원 기록 및 급여 기준 설정',
        syncDingtalk: 'DingTalk에서 동기화',
        manualAdd: '수동 추가',
        employeeNo: '사번',
        name: '이름',
        department: '부서',
        insuranceType: '사회보험 유형',
        baseSalary: '기본급',
        splitBaseSalary: '분할 세금 기준',
        positionAllowance: '직위 수당',
        housingAllowance: '주거 수당',
        mealAllowance: '식비 수당',
        overtimeRate: '초과근무 시급',
        employmentStatus: '고용 상태',
        active: '재직',
        left: '퇴직',
        salaryBase: '급여 기준',
        subsidySettings: '수당 설정',
        basicInfo: '기본 정보'
      }
    },

    // 시스템 관리
    systemMgmt: {
      codingRules: {
        title: '코딩 규칙 관리',
        subtitle: '업무 문서의 자동 번호 매기기 규칙을 구성합니다. 접두사, 날짜 및 일련번호 조합을 지원합니다',
        addRule: '규칙 추가',
        businessType: '업무 유형',
        ruleName: '규칙 이름',
        codeRule: '코드 규칙',
        resetCycle: '재설정 주기',
        nextNumber: '다음 번호',
        description: '설명',
        prefix: '접두사',
        dateFormat: '날짜 형식',
        separator: '구분자',
        sequenceLength: '일련번호 자릿수',
        initialValue: '초기값',
        step: '증가분',
        preview: '코드 미리보기',
        noReset: '재설정 안 함',
        daily: '매일',
        monthly: '매월',
        yearly: '매년',
        sequenceDetail: '시퀀스 상세',
        periodKey: '기간 키',
        currentValue: '현재 값',
        resetAllSequences: '모든 시퀀스 재설정'
      }
    }
  }
}
