# 前端驱动的业务链验收

本目录延续 2026-10-17 的隔离验收环境：使用同一张销售订单，经过自制与外购分流、生产缺料请购、采购收货与质检、独立财审、工序报工、成品入库、两批销售发货、应收应付与收付款。正常业务动作通过浏览器操作页面；SQL 用于读回核对，负向接口请求用于验证越权、超额和重复操作。

## 当前环境

- 数据库：`erp_purchase_audit_test_20261017_chain`，与后端日常配置的业务库分开。配置拒绝指向日常业务库。
- 专用 API：`http://127.0.0.1:3510`；桌面端：`http://127.0.0.1:3511`；移动端：`http://127.0.0.1:3512`。
- 账号、测试物料与单据检查点位于 `output/playwright/full-chain/fixture.private.json` 和 `chain.json`，不得提交账号文件或浏览器 trace。
- 使用已安装的 Node.js、Chrome、Playwright 和各子项目依赖。找不到 Playwright 时可用 `CHAIN_PLAYWRIGHT_MODULE` 指向已安装模块。

以下 PowerShell 命令分别在不同终端运行。不要停止 3000/3001 上的日常服务。

```powershell
# 仓库根目录：启动隔离 API（关闭定时任务、DLQ自动重试、Redis）
node scripts/e2e-chain/start-backend.cjs
```

```powershell
# frontend 目录
$env:VITE_API_TARGET='http://127.0.0.1:3510'
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3511 --strictPort
```

```powershell
# mobile 目录：e2e 模式使用 HTTP，显式覆盖 .env 的 API 地址
$env:VITE_API_TARGET='http://127.0.0.1:3510'
$env:VITE_APP_API_BASE_URL='/api'
$env:VITE_DEV_PORT='3512'
$env:VITE_DEV_HOST='127.0.0.1'
node node_modules/vite/bin/vite.js --mode e2e --host 127.0.0.1 --port 3512 --strictPort
```

## 从已有检查点继续

在仓库根目录执行：

```powershell
node scripts/e2e-chain/continue.cjs
# 或指定从某段开始，继续到财务：
node scripts/e2e-chain/continue.cjs manufacturing
node scripts/e2e-chain/continue.cjs delivery
node scripts/e2e-chain/continue.cjs finance
# 完整链首次通过后，验证整链重入不增加单据、不改变库存和银行余额：
node scripts/e2e-chain/verify-resume.cjs
```

每段先核对真实数据库状态再操作，已完成付款会核对付款明细、银行流水和凭证，不重新付款。任一断言或页面操作失败会返回非零退出码，停止后续阶段并保存截图、ARIA、网络记录和结果。

也可独立运行 `purchase-run.cjs`、`run-manufacturing.cjs`、`run-delivery.cjs`、`run-finance.cjs`。同一时刻只允许一个业务链脚本写 `chain.json`。财务只接受明确的销售出库 ID，不能把生产领料的 `chain.outbound` 当作销售出库。

这些入口用于恢复已经建立的隔离测试链。`prepare-fixture.cjs` 等主数据脚本用于准备新的隔离验收环境，不能代替数据库初始化，也不要对现有检查点重新执行。`run.cjs sales` 会创建新订单，只能在新测试链中使用。

## 页面与脚本验证

```powershell
node scripts/e2e-chain/page-smoke.cjs
node scripts/e2e-chain/page-smoke.cjs /finance/cash/bank-transactions
$env:CHAIN_MOBILE='1'
node scripts/e2e-chain/mobile-pages.cjs
node scripts/e2e-chain/mobile-finance-read.cjs
Remove-Item Env:CHAIN_MOBILE
node --test scripts/e2e-chain/finance-resume.test.cjs
```

桌面页面检查统计去重的静态路由，检测空白、错误响应、脚本异常和登录/权限错误跳转。移动检查按页面内容、加载/空态和横向溢出判定。它们只证明页面可加载，不能代替按钮流程验收；需要动态 ID 的详情页、所有按钮组合和其他业务分支也不会因页面通过而自动视为通过。

关账阶段执行预检查并保存实际 `canClose` 和阻断项，不执行期间关账。实际检测到的阻断会在报告中保留。测试脚本不会自动部署、提交代码或修改日常运行服务。
