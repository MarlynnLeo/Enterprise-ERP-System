# 创慧运行 (chuyx) ERP · 100% 免费开源制造一体化平台 (无阉割版)

> 💡 **真正 100% 免费开源 · 全功能零阉割 · 生产级落地**  
> 拒绝市面上“伪开源社区版阉割核心功能、强制高价购买商业版”的套路！创慧运行面向广大离散与流程制造企业，**全量开放**销售、采购、多级 BOM 递归展开、APS 生产排程、工位扫码报工、批次追溯、智能仓储与**业财一体借贷平衡凭证**等全套源码，无任何商业保留，支持企业私有化免费商用！

> 🌐 **官方网站**：[https://chuyx.com](https://chuyx.com)  
> 🚀 **在线演示**：[http://erp.chuyx.com](http://erp.chuyx.com)  
> 💡 **演示凭证**：超级管理员 `admin` / 密码 `123456`（涵盖全业务模块与全权限）  
> 💡 **备用体验**：体验账号 `demo` / 密码 `123456`  
> 📦 **开源仓库**：[Enterprise-ERP-System](https://github.com/MarlynnLeo/Enterprise-ERP-System)  
> 💬 **技术交流与商务咨询**：QQ `510076394` ｜ 邮箱 `510076394@qq.com`  
> 🛡️ **开源承诺**：100% 免费开源 · 零功能阉割 · 零软件许可费 · 不限账号数 · 不限并发 · 永久免费商用

---

## 🌟 开源承诺：拒绝假开源，100% 零阉割交付

制造业软件的数字化转型痛点在于高昂的试错成本与技术壁垒。很多号称“开源”的系统实际只是引流工具，关键功能全部阉割。**创慧运行 (chuyx) 郑重承诺：**

| 对比维度 | 市面常见“伪开源”社区版 | 创慧运行 (chuyx) 100% 免费开源 |
| --- | --- | --- |
| **源码开放度** | 仅开放基础表单，核心业务逻辑闭源或混淆 | **100% 完整开放前后端全量源码**，无暗桩无后门 |
| **业财一体化** | ❌ 核心总账、应收应付凭证被阉割，强制买商业版 | ✅ **全量开放** 采购、销售、出入库事务与总账凭证自动平衡 |
| **生产排程与报工** | ❌ 阉割多级 BOM 展开、工位扫码与 APS 调度 | ✅ **全量开放** 多级 BOM 递归、工序工单与现场移动端扫码 |
| **账号与并发限制** | ❌ 限制 3~5 个客户端，增加点位按人头收取数千元 | ✅ **彻底解除限制**，不限用户数、不限并发终端、不限账套 |
| **部署与数据主权** | ❌ 强制依赖公有云 SaaS，按年续费捆绑 | ✅ **支持纯内网物理隔离部署**，Docker 一键拉起，数据 100% 归属企业 |
| **商业使用权限** | ❌ 商业使用受限或随时更改开源协议 | ✅ **开放免费商用**，支持企业自主二次开发与定制扩展 |

---

## 项目简介

创慧运行 (chuyx) ERP 以工厂真实业务流程为主线，把订单、物料、生产、质检、出入库、应收应付与总账凭证串联成闭环，减少多系统切换和手工对账。

系统采用前后端分离架构：

| 端 | 技术栈 | 说明 |
| --- | --- | --- |
| 后端 API | Node.js · Express · Knex · MySQL · Redis | 业务接口、权限、工作流、财务与库存事务（100% 开放） |
| PC 前端 | Vue 3 · Vite · Element Plus · Pinia · ECharts | 管理端完整业务操作界面（100% 开放） |
| 移动端 | Vue 3 · Vite · 轻量业务页面 | 车间现场/移动场景扫码与处理（100% 开放） |
| 部署 | Docker Compose · Nginx · 1Panel | 前后端与 Redis 统一容器编排，开箱即用 |

---

## 核心业务模块（全功能零阉割）

- **基础数据中心**：物料主数据、多计量单位换算、供应商/客户档案、仓库库位规划、自动编码规则引擎【全开放】
- **销售全链路**：报价单、销售订单、发货装箱、销售出库、退货/换货管理、客户对账单【全开放】
- **采购与供应链**：物料请购、采购订单、到货质检、采购入库、采购退货、外协加工全流程【全开放】
- **生产制造 (MES/APS)**：多级 BOM 递归展开、生产计划、工序任务派发、现场扫码报工、齐套分析与生产进度看板【全开放】
- **智能库存 (WMS)**：采购入库、生产领料/退料、成品入库、调拨盘点、批次追踪、库存台账与年度结存【全开放】
- **全面质量 (QMS)**：来料检验 (IQC)、过程巡检 (IPQC)、成品检验 (FQC)、不合格品评审处置、SPC 统计分析【全开放】
- **业财一体财务**：总账凭证、应收/应付账款、收付款结算、税票核销、存货核算成本结转、固定资产、预算管理【全开放】
- **人事行政**：组织架构、员工档案、考勤打卡、薪资核算【全开放】
- **设备生命周期**：设备台账、点检保养计划、故障报修维修、运行状态监控【全开放】
- **系统核心支撑**：RBAC 按钮级角色权限体系、可视化审批流引擎、自动化通知治理、定时数据备份、全站操作审计【全开放】
- **移动端车间协同**：移动端车间作业，支持手机/工业 PDA 扫码入库、领料与工序报工【全开放】

---

## 仓库结构

```text
.
├── backend/                 # 后端 API 服务
│   ├── migrations/          # 数据库迁移
│   ├── seeds/               # 初始化数据
│   ├── src/                 # 业务源码
│   └── tests/               # 单元 / 集成测试
├── frontend/                # PC 管理端
├── mobile/                  # 移动端
├── scripts/                 # 部署与工具脚本
├── docker-compose.yml       # 容器编排
└── .env.docker.example      # 生产环境变量模板
```

---

## 功能亮点

- **业财一体**：采购收货、销售出库、库存事务与应收/应付、税票、总账联动
- **库存台账闭环**：出入库统一走库存服务，支持批次、追溯与年度结存
- **权限与审批**：菜单/按钮级权限 + 数据范围 + 工作流审批
- **通知治理**：可配置通知规则与责任路由，减少误推与漏推
- **安全登录**：JWT + Cookie、CSRF、登录锁定、输入校验与限流
- **多主题 / 多语言**：PC 端支持主题切换，界面文案支持中/英/韩
- **可运维**：迁移完整性校验、健康检查、备份保留策略、容器健康探针

---

## 在线入口与演示说明

| 环境 / 平台 | 访问地址 | 说明 / 默认凭据 |
| --- | --- | --- |
| **官方网站** | [https://chuyx.com](https://chuyx.com) | 创慧运行官方主页与产品全景 |
| **公网演示 PC 端** | [http://erp.chuyx.com](http://erp.chuyx.com) | 管理员：`admin` / 密码：`123456`<br>备用体验：`demo` / 密码：`123456` |
| **内网开发 PC 端** | `http://192.168.1.251:18081` | 局域网开发环境前端服务 |
| **内网移动端** | `http://192.168.1.251:18082` | 车间现场与移动端作业端 |
| **后端直连（内网）** | `http://192.168.1.251:18080` | 后端服务 API 直连接口 |

> 建议不要在同一浏览器会话中混用内网 HTTP 与公网 HTTPS，以免 Cookie 状态冲突。

---

## 快速开始（本地开发）

### 1. 环境要求

- Node.js 20.19+ 或 22.12+（推荐 22 LTS）
- MySQL 8+
- Redis 7+（可按环境关闭，但生产建议开启）
- npm

### 2. 克隆项目

```bash
git clone https://github.com/MarlynnLeo/Enterprise-ERP-System.git
cd Enterprise-ERP-System
```

### 3. 配置后端

```bash
cd backend
cp .env.example .env   # 若无 example，可参考仓库根目录 .env.docker.example
npm install
npm run migrate
npm run seed           # 首次初始化账号与基础数据
npm run dev
```

后端默认端口：`8080`

### 4. 启动 PC 前端

```bash
cd frontend
npm install
npm run dev
```

### 5. 启动移动端（可选）

```bash
cd mobile
npm install
npm run dev
```

---

## Docker / 生产部署

仓库提供统一 Compose 项目名：`kacon-erp`

主要服务：

| 服务 | 宿主机端口 | 说明 |
| --- | --- | --- |
| backend | 18080 | API 服务 |
| frontend | 18081 | PC 前端（Nginx 反代 /api） |
| mobile | 18082 | 移动端 |
| redis | 内部 | 缓存 / 会话 / 限流支撑 |

### 1. 准备环境变量

```bash
cp .env.docker.example .env
# 编辑 .env，至少配置：
# DB_* / JWT_* / CSRF_SECRET / REDIS_PASSWORD / ALLOWED_ORIGINS / PUBLIC_API_BASE_URL
```

### 2. 生产发布

生产 Compose 只引用带发布号的镜像，不包含 `build:` 配置。不要在服务器目录执行
`docker compose build` 或 1Panel 的“重建”操作，否则会绕过发布校验。统一使用：

```powershell
$env:DEPLOY_SERVER_HOST='192.168.1.251'
$env:DEPLOY_SERVER_USER='guiyi'
$env:DEPLOY_SSH_KEY_PATH="$env:USERPROFILE\.ssh\id_ed25519_deploy"
node scripts/deploy_to_server.js --dry-run
node scripts/deploy_to_server.js
```

部署归档只从 Git 提交生成，构建期间的工作区修改不会混入发布。默认要求发布目录干净；
若工作区还有其他未完成工作，可以明确使用 `--ref=<已审核提交>`，只发布该提交。
`--allow-dirty` 和服务器直接源码构建入口已停用。

只修复桌面前端时，使用限定范围的发布：

```powershell
node scripts/deploy_to_server.js --frontend-only --ref=<已审核提交>
```

此模式只更新前端与发布工具，保留后端和移动端的运行镜像，不执行数据库迁移。
前端版本通过 `ERP_FRONTEND_RELEASE_TAG` 固定；完整发布会同时更新该值与
`ERP_RELEASE_TAG`。发布清单的 `services` 记录本次更新范围，`serviceImages`
记录三个应用服务的实际镜像及 ID，因此单独发布前端后可明确追溯每个服务的版本。
不要手动将不同服务的标签统一成旧值。

每次发布会校验归档 SHA-256、服务器当前版本与 Git 祖先关系；旧提交、分叉提交、
并发发布和预检后服务器版本发生变化的发布会被拒绝。同一发布号的镜像只构建一次，
再次执行会复用已校验镜像。前端构建必须通过菜单、列宽和缓存恢复的回归测试。

两端镜像会将 Nginx 静态目录设为 `755`、文件设为 `644`，防止发布归档在
`umask 077` 下解压后，`public` 图片因保留 `600` 权限而返回 403。前端候选检查
使用 `nginx` 用户读取静态资源，健康检查同时访问默认头像框图片；部署目录与
环境文件继续使用原有受限权限。

所有候选镜像验证通过后才切换源码和发布标签。切换过程中的迁移、容器启动、健康检查
或版本核验失败，会恢复上一次源码、环境文件、发布清单和原镜像，并记录失败阶段。
数据库迁移仍遵循向前兼容规则，不自动逆向迁移业务数据。
完整发布会在切换前核对数据库迁移历史；数据库存在提交中缺失的迁移时直接拒绝，
不修改在线源码或重启服务。应先将对应业务迁移及其代码审计提交，再进行完整发布。

含不可逆迁移或新数据库结构与旧后端不兼容时，必须使用维护发布：

```powershell
node scripts/deploy_to_server.js --maintenance --ref=<已审核提交>
```

执行前先停写并验证数据库加密备份可用。`--maintenance` 仅适用于完整发布，
不能与 `--frontend-only` 同用。候选镜像和迁移历史预检、源码备份完成后，发布工具
停止后端并确认停止，再切换源码和环境文件；迁移命令运行前记录 `migrationStarted`。
维护模式通过独立 `docker run` 执行迁移预检和迁移，复用后端已解析的环境、网络和数据卷，
不会通过 Compose 启动已停止的服务；迁移前后均核验原后端保持停止。
迁移开始前失败仍可恢复旧发布。迁移开始后，任何失败都再次停止后端，禁止自动恢复旧镜像，
并将 `.last-deployment.json` 状态记为 `forward-recovery-required`。
此时保留新源码、环境文件、候选目录、归档、候选及正式发布镜像，以及
`.deploy-backups/<运行号>/` 的旧源码、旧环境、`candidate-env` 和 `candidate-manifest.json`。
应保持后端停止，修复新版本并核对迁移状态后进行前向恢复；不要直接启动旧后端或使用普通发布模式重试。
维护发布成功后会正常启动服务并执行健康、版本及镜像核验。此选项不代替数据库备份，
也不会自动逆向迁移或恢复数据库。

服务器状态文件：

- `.deployed-release.json`：已成功发布的 Git 提交、源码指纹和构建号。
- `.last-deployment.json`：最近一次发布的结果、失败阶段和恢复结果。
- `.deploy-backups/<运行号>/`：失败后保留的恢复资料，目录仅部署用户可读。

GitHub CD 只发布明确版本的镜像，不再写入会被较慢旧流水线覆盖的 `latest` 标签。
HTML 和版本清单禁止缓存，带哈希的资源继续长期缓存。

### 3. 执行迁移

```bash
docker compose run -T --rm --no-deps backend npm run migrations:verify
docker compose run -T --rm --no-deps backend npm run migrate
```

### 4. 健康检查

```bash
curl http://127.0.0.1:18081/api/health
```

正常响应示例：

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected"
}
```

1Panel 的正式项目目录固定为：

```text
/opt/1panel/docker/compose/KACON-ERP
```

`scripts/deploy_1panel.sh` 只保留停用提示，不能再从服务器上的旧源码重建镜像。
重启服务应保持当前 `ERP_RELEASE_TAG`；更新代码统一使用本地 Git 快照发布入口。

发布工具回归测试：`npm run test:release`。它在临时目录中模拟失败与恢复，不连接业务服务。
Windows 可通过 `ERP_TEST_PYTHON` 指定 Python 3 可执行文件，`ERP_TEST_BASH` 指定 Git Bash。

---

## 常用命令

### 后端

```bash
cd backend
npm run lint                 # 代码检查
npm test                     # 单元 / 集成测试
npm run migrate              # 执行数据库迁移
npm run migrations:verify    # 校验迁移完整性
npm run bootstrap:verify     # 校验启动基础状态
```

### 前端 / 移动端

```bash
cd frontend && npm run build
cd mobile && npm run build
```

### 仓库根目录

```bash
npm run lint                 # 后端 + 前端 + 移动端联合检查
npm run build:frontend
npm run build:mobile
```

---

## 配置说明（关键项）

| 变量 | 说明 |
| --- | --- |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL 连接 |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | 登录令牌密钥 |
| `CSRF_SECRET` | CSRF 防护密钥 |
| `REDIS_PASSWORD` | Redis 密码 |
| `ALLOWED_ORIGINS` | 允许的前端来源（CORS） |
| `PUBLIC_API_BASE_URL` | 对外 API 根地址 |
| `COOKIE_SECURE` | Cookie Secure 策略，生产可设 `auto` |
| `COOKIE_SAME_SITE` | Cookie SameSite，建议 `lax` |
| `DEFAULT_ADMIN_PASSWORD` | 初始管理员密码（仅首次种子） |

完整模板见：[`.env.docker.example`](.env.docker.example)

---

## 开发约定

1. **数据库变更必须走 migrations**，并保持 `checksums.json` 同步
2. **库存数量变更统一经库存服务**，避免直接插入台账旁路
3. **财务凭证金额、借贷必须平衡**，合并凭证需与业务价税合计一致
4. **权限校验前后端双重控制**：接口鉴权 + 菜单/按钮显隐
5. **生产部署前执行检查**：lint、format:check、tests、migrations:verify、build；CI 同时检查后端格式
6. **生成的审计 JSON 写入各端 `reports/`**，不提交一次性改写脚本或历史生成结果；`npm run check:repository` 检查脚本入口与遗留产物

---

## 测试

先运行仓库静态检查与发布事务回归：

```bash
npm run lint
npm run test:release
```

发布事务回归使用隔离命令替身，需要 Bash 和 Python 3；Windows 可通过
`ERP_TEST_BASH`、`ERP_TEST_PYTHON` 指定解释器路径。

后端测试基于 Jest。数据库集成测试必须先配置专用测试库（如 `erp_test`）并完成迁移、种子初始化，连接配置不得指向实际业务库：

```bash
cd backend
npm test
```

仅运行后端单元测试：

```bash
cd backend
node node_modules/jest/bin/jest.js --runInBand --testPathPattern=tests/unit
```

PC 前端测试（移动端在 `mobile` 目录执行相同命令）：

```bash
cd frontend
npm test
```

---

## 路线图（持续完善）

- [x] 采购 / 销售 / 生产 / 库存主链路
- [x] 财务应收应付、总账、成本与税务基础能力
- [x] 通知治理、权限与审批闭环
- [x] Docker / 1Panel 一体化部署
- [ ] 更细粒度的经营驾驶舱与 AI 辅助分析
- [ ] 更完善的移动端现场作业覆盖
- [ ] 多组织 / 多账套能力增强

---

## 贡献与反馈

欢迎提交 Issue 与 Pull Request。

1. Fork 本仓库
2. 新建功能分支：`git checkout -b feature/your-feature`
3. 提交变更：`git commit -m "feat: your feature"`
4. 推送分支并创建 PR

---

## 许可证与开源声明

创慧运行 (chuyx) ERP 遵循开放源码协议。
- **100% 免费开源**：企业可自由用于内部信息化治理、二次开发与生产运营。
- **零额外费用**：绝无“商业版、专业版、授权许可费、并发年费”等任何套路。
- **全功能交付**：仓库即全部，所见即所得。

---

## 维护信息与商务咨询

- **项目名称**：创慧运行 (chuyx) ERP / Enterprise ERP System (100% 免费开源零阉割版)
- **官方网站**：[https://chuyx.com](https://chuyx.com)
- **在线体验**：[http://erp.chuyx.com](http://erp.chuyx.com)（管理员：`admin` / 密码：`123456`）
- **技术交流 / 商务咨询**：QQ `510076394` ｜ 邮箱 `510076394@qq.com`
- **Compose 项目名**：`kacon-erp`
- **默认管理端端口**：`18081`
- **默认 API 端口**：`18080`

如需私有化部署协助、定制二次开发、企业业务手册或技术交流，欢迎通过上述联系方式沟通或在仓库 Issue 中发起讨论。
