# ERP 全站功能与代码审计

日期：2026-09-28（Asia/Taipei）

基线：`94853f52bb7a447c323b6b3b38303f5e03e4f3b3` 加当前工作区未提交修改。
方式：全仓结构/契约扫描、分模块关键调用链审阅、隔离缺陷复现、现有测试、两端构建、迁移校验与依赖检查。

## 结论

确认 **13 项问题：8 项 P1、5 项 P2**。P1 表示主要业务受阻、金额/成本错误或重要服务不可用；P2 表示特定流程或场景错误。审计当时尚未修复；2026-09-29已完成代码修复及回归，详见[修复记录](REPAIR_REPORT_2026-09-29.md)。下文保留审计时的发现与证据。

现有自动化检查总体通过，但没有覆盖多项实际失败路径，不能据此判断全站业务可用。建议优先修复业务状态与金额问题，再处理客户端契约和实时连接。

此次“全站”指后端、PC、移动端和工程配置均纳入范围，**不代表每行代码、每个 API 参数组合、每个角色和页面都已实际验收**。未连接业务数据库，未执行生产写操作或逐页浏览器验收；真实库存/财务影响需在独立测试账套进一步验证。

## 确认问题清单

| 编号 | 优先级 | 问题与影响 | 主要位置 | 证据 |
| --- | --- | --- | --- | --- |
| B1 | P1 | 已完成返工可重新改成进行中并再次完成，重复生成复检与质量成本 | [reworkTaskController.js](backend/src/controllers/business/quality/reworkTaskController.js#L531) 531–535 | 真实函数的内存复现 |
| B2 | P1 | 采购退货、销售换货完成后被财务驳回，无有效重提入口，业务已完成但过账未完成 | [purchaseReturnController.js](backend/src/controllers/business/purchase/purchaseReturnController.js#L725) 725–740；[salesExchangeController.js](backend/src/controllers/business/sales/salesExchangeController.js#L493) 493–499 | 两条审计线交叉核查 |
| B3 | P1 | 委外到货10、合格8，确认后把实收到货覆盖为8；财务驳回重提时检验数量10与到货8不符，必然失败 | [processingController.js](backend/src/controllers/outsourced/processingController.js#L2588) 2588–2593 | 真实函数的内存复现 |
| B4 | P1 | 销售换货退回未传原出库成本，按当前物料成本入库，存货/成本冲回错误 | [salesExchangeController.js](backend/src/controllers/business/sales/salesExchangeController.js#L665) 665–681 | 库存成本调用链核查 |
| FIN-01 | P1 | 资产减值和拆分的箭头函数使用错误的 this，合法请求抛 TypeError 并回滚 | [assets.js](backend/src/models/assets.js#L2061) 2061、2409、2425 | 实际模块 mock 复现 |
| FIN-02 | P1 | 标准成本冻结读取 costPrice，而查询返回 cost_price，错误使用备用价或漏掉物料 | [costCalculationController.js](backend/src/controllers/business/finance/costCalculationController.js#L726) 726–732 | 实际控制器 mock 复现 |
| FIN-03 | P2 | UI 可选择年数总和法，但服务端实际按直线法试算和计提 | [assets.js](backend/src/models/assets.js#L153) 153–160 | 真实计算函数验证 |
| C1 | P1 | ECN 页面调用不存在的 getDetail/submitApproval/changeStatus，详情、编辑及状态操作失败 | [ECNManagement.vue](frontend/src/views/baseData/ECNManagement.vue#L419) 419、458、469 | 页面/API/后端路由契约核查 |
| C2 | P2 | 移动银行交易转入/转出筛选误用对账字段和业务状态参数，结果为空 | [BankTransactions.vue](mobile/src/views/finance/BankTransactions.vue#L27) 27–43 | 通用列表与请求参数核查 |
| C3 | P2 | 移动银行交易使用 is_reconciled，而接口返回 isReconciled，已对账显示未对账 | [BankTransactionDetail.vue](mobile/src/views/finance/BankTransactionDetail.vue#L16) 16–17 | 真实字段转换函数验证 |
| C4 | P2 | 移动付款发票选择器只拿第一页20条，无搜索分页且包含不可支付状态 | [CreateAPPayment.vue](mobile/src/views/finance/CreateAPPayment.vue#L104) 104–110 | 页面及 AP 分页/状态契约核查 |
| SYS-01 | P1 | 未认证握手占用的 Socket.IO 配额不释放；25次后无存活连接仍拒绝第26次连接 | [socket/index.js](backend/src/socket/index.js#L150) 150–158、350–354 | 本机真实 Socket.IO 隔离复现 |
| SYS-02 | P2 | 后端按 Nginx 代理 IP 限制25个连接，多用户共用额度 | [socket/index.js](backend/src/socket/index.js#L24) 24–34；frontend/nginx.conf 67–78 | 默认部署拓扑与代码核查 |

详细触发条件、影响、修复建议及局限见分报告：

- [采购、销售、库存、生产与质量](backend/reports/audit-business-2026-09-28.md)
- [财务、人事、设备与工作流](backend/reports/audit-finance-hr-2026-09-28.md)
- [PC 与移动端](frontend/reports/audit-clients-2026-09-28.md)
- [公共服务与工程](backend/reports/audit-platform-2026-09-28.md)

## 本轮验证结果

| 检查 | 结果与边界 |
| --- | --- |
| 后端单元测试 | 170套、1,241项通过；显式将 DB_HOST/DB_PORT 指向不可用的本地端口，避免访问业务库 |
| PC 单元/组件测试 | 86文件、606项通过 |
| 移动端单元/组件测试 | 20文件、128项通过 |
| 发布回归 | 33项通过；使用隔离命令替身，不调用真实 Docker 或部署服务器 |
| 去重测试总数 | **2,008项通过**；不重复累计 PC prebuild 38项和财务专项91项 |
| 全站 lint | 根 npm run lint 通过；包括三端 ESLint、字段/弹窗/主题/仓库规则。PC已有 output/sidebar-followup-audit-20260928/ProductionDepartments.test.js:38 存在1项 unused response 警告；移动端无警告。审计产物移出客户端目录后，原两端 npm lint 再次通过 |
| 后端 format:check | 通过 |
| PC 构建 | prebuild、production build、postbuild通过 |
| 移动端构建 | production build通过 |
| 迁移完整性 | 310份文件校验通过；本轮未在空库执行迁移 |
| 依赖审计 | 根、后端、PC、移动四份 npm audit 均为0个已知漏洞 |
| API 扫描 | 827个字面量地址、56个顶层挂载，未匹配数0；只检查顶层挂载，无法识别 ECN 这类方法名错误 |
| 功能/状态结构扫描 | 11个模块49项能力、26个状态域通过结构规则；不等同实际功能闭环通过 |

发布回归首次9通过/24失败：Windows 默认 python3 指向系统应用别名，命令替身未正常运行。设置 `ERP_TEST_PYTHON=D:/transfer/hermes-agent/venv/Scripts/python.exe` 后33项全部通过，未把首次环境故障记作发布逻辑缺陷。第二轮日志：`backend/reports/audit-release-python-2026-09-28.log`。

后端原始测试摘要：`backend/reports/audit-unit-2026-09-28.json`；其余检查日志按 `audit-*-2026-09-28` 命名，放在各端 reports 下。reports 为本地产物目录，通常被 Git 忽略；交付或归档时需一起保存分报告和证据，不能只保存本总报告。

两端审计构建产物保存于 `backend/reports/client-builds/frontend` 和 `backend/reports/client-builds/mobile`，避免进入客户端 ESLint 扫描范围；原有 dist 和 frontend/output 未覆盖。

## 覆盖矩阵及尚未验证部分

| 范围 | 本轮工作 | 尚未完成的验证 |
| --- | --- | --- |
| 基础数据 / ECN | 页面 API 方法契约、路由与操作链 | 真实角色逐项操作、复杂BOM变更 |
| 采购 / 销售 / 库存 / 委外 | 收退换货、数量校验、状态重提、成本与过账调用链 | MySQL事务/锁竞争、历史库存和原出库成本实账 |
| 生产 / 质量 | 返工终态、复检、质量成本，生产入库等关键路径 | 排程与高并发报工、完整订单到入库 UAT |
| 财务 / 资产 / 预算 | 标准成本、资产折旧/减值/拆分、AR/AP、GL与期间、预算事务关键路径 | 真实凭证平衡、期间结转、历史账套与外部财税银行集成 |
| 人事 / 设备 / 工作流 | 工资计算、设备CRUD事务、审批联动及已有单测 | 外部考勤同步、真实多角色审批和设备接入 |
| 系统 / 公共服务 | 登录认证、权限与会话撤销、文件访问入口、实时连接、发布检查 | 全角色授权矩阵、浏览器上传/导入导出、备份实际恢复演练 |
| PC / 移动 | 源码扫描、现有组件测试、构建、部分页面字段与操作契约 | 逐页浏览器验收、扫码/打印硬件、移动触屏与主题视觉验收 |

源码枚举：51个后端路由文件、128个控制器、190个服务、219个PC Vue页面、161个移动Vue页面。目录里的组合函数等辅助文件不计入页面数。

明确停用的行级数据范围和强制改密视为现有产品策略，不列为缺陷。没有发现的模块不等于已经证明无缺陷。

## 建议修复顺序

1. 修复 B1–B4、FIN-01/02，补充状态重放、财务驳回重提、成本不等于售价、资产合法请求的回归；在独立 MySQL 账套核对数量、库存台账、凭证。
2. 修复 C1 与 SYS-01/02，验证 ECN 全状态链，以及匿名失败/正常连接/多用户反代场景。
3. 修复 FIN-03、C2–C4，补齐折旧方法、已对账数据、超过20张发票的端到端场景。
4. 修复后再做逐角色、逐页面和完整订单到财务的验收。当前报告是问题清单与验证记录，不是上线批准或无缺陷证明。
