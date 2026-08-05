# KACON ERP · 企业资源管理系统

面向制造企业的一体化 ERP / MES 业务平台，覆盖采购、销售、生产、库存、质量、财务、人事与系统管理，支持 PC 端与移动端协同使用。

> 仓库地址：[Enterprise-ERP-System](https://github.com/MarlynnLeo/Enterprise-ERP-System)

---

## 项目简介

KACON ERP 以工厂真实业务流程为主线，把订单、物料、生产、质检、出入库、应收应付与总账凭证串联成闭环，减少多系统切换和手工对账。

系统采用前后端分离架构：

| 端 | 技术栈 | 说明 |
| --- | --- | --- |
| 后端 API | Node.js · Express · Knex · MySQL · Redis | 业务接口、权限、工作流、财务与库存事务 |
| PC 前端 | Vue 3 · Vite · Element Plus · Pinia · ECharts | 管理端完整业务操作界面 |
| 移动端 | Vue 3 · Vite · 轻量业务页面 | 现场/移动场景查询与处理 |
| 部署 | Docker Compose · Nginx · 1Panel | 前后端与 Redis 统一容器编排 |

---

## 核心业务模块

- **基础数据**：物料、供应商、客户、单位、仓库库位、编码规则
- **销售管理**：报价、销售订单、装箱、出库、退货/换货
- **采购管理**：请购、采购订单、收货、退货、外协加工
- **生产管理**：生产计划、任务、工序、报工、齐套与进度跟踪
- **库存管理**：入库、出库、调拨、盘点、库存台账、年度结存
- **质量管理**：来料/过程/成品检验、不良品、SPC、追溯
- **财务管理**：总账、应收应付、收付款、税务、成本、资产、预算
- **人事行政**：员工、考勤、薪资
- **设备管理**：设备台账、点检保养、运行监控
- **系统管理**：用户角色权限、审批流、通知规则、备份、操作审计

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

## 在线入口（示例）

| 环境 | 地址 |
| --- | --- |
| 公网 PC | https://erp.kacon.ai |
| 内网 PC | http://192.168.1.251:18081 |
| 内网移动端 | http://192.168.1.251:18082 |
| 后端直连（内网） | http://192.168.1.251:18080 |

> 建议不要在同一浏览器会话中混用内网 HTTP 与公网 HTTPS，以免 Cookie 状态冲突。

---

## 快速开始（本地开发）

### 1. 环境要求

- Node.js 20+（推荐 22）
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

### 2. 构建并启动

```bash
docker compose build --pull backend frontend mobile
docker compose up -d
```

### 3. 执行迁移

```bash
docker compose run -T --rm backend npm run migrations:verify
docker compose run -T --rm backend npm run migrate
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

1Panel 场景可参考 `scripts/deploy_1panel.sh`，项目目录通常为：

```text
/opt/1panel/docker/compose/KACON-ERP
```

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
5. **生产部署前建议至少执行**：lint、tests、migrations:verify、build

---

## 测试

后端测试基于 Jest，默认使用独立测试库（如 `erp_test`），不会直接写生产库：

```bash
cd backend
npm test
```

前端测试：

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

## 许可证

当前仓库 `package.json` 标记为 `ISC`。如需改为企业内部专有许可，请在发布前更新 LICENSE 与 README 声明。

---

## 维护信息

- **项目名称**：KACON ERP / Enterprise ERP System
- **Compose 项目**：`kacon-erp`
- **默认管理端端口**：`18081`
- **默认 API 端口**：`18080`

如需部署协助、业务手册或二次开发，可在仓库 Issue 中说明场景与环境信息。
