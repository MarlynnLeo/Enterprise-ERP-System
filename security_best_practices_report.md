# ERP 全站安全与权限最终审计报告

审计日期：2026-09-01  
项目：`F:\ERP`  
范围：Node.js/Express 后端、Vue 3 PC、Vue 3 Mobile、数据库迁移、认证与权限、菜单与角色、关键业务接口、依赖、构建和临时代码治理。

## 结论

本轮已完成代码审计、权限数据核验、整改和回归验证。当前代码级权限模型已统一为：

- `permissions` 是权限码注册表唯一事实源。
- `role_permissions` 是普通角色接口鉴权唯一事实源。
- `role_menus` 只负责导航可见性，不再作为接口权限回退来源。
- 超级管理员只由受保护字段 `roles.is_super_admin=1` 判定。
- 权限表、角色权限表缺失或查询失败时均 fail closed，不自动扩大权限。

本地数据库实测 27 个角色、811 个启用权限：受管角色权限缺口 0，普通角色 `lookup:read` 缺口 0，超级管理员权限缺口 0。生产就绪审计发现 339 条受保护路由，缺认证 0、缺权限 0、静态 guard 问题 0、未注册权限 0。

当前没有发现仍未处理的直接路由漏鉴权、权限回退扩大、超级管理员判定分裂或已确认的临时诊断代码。代码和本地数据已经达到进入生产验收的条件，但不能替代真实生产环境的网络、密钥、数据库授权、备份恢复和跨角色业务验收。

## 已完成整改

### 1. 权限单一事实源与失败关闭

- 删除 `role_permissions -> role_menus` 的运行时回退链。
- 删除角色详情、权限审计快照和系统控制器中从菜单反推接口权限的兼容路径。
- 删除 `permissions -> menus` 的权限注册表回退。
- 空 `role_permissions` 保持为空；SSOT 表缺失时不再静默返回菜单权限。
- 权限诊断工具也只统计 `role_permissions`，查询失败直接报错，不再用菜单权限生成误导性结果。
- 生产就绪审计新增静态规则，阻止上述回退重新进入代码。

主要实现：

- `backend/src/services/PermissionService.js`
- `backend/src/services/PermissionRegistry.js`
- `backend/src/models/role.js`
- `backend/src/models/system.js`
- `backend/src/services/PermissionChangeService.js`
- `backend/src/controllers/system/systemController.js`
- `backend/scripts/audit-production-readiness.js`

### 2. 角色权限同步统一

- mysql2 与 Knex 两条角色同步路径使用同一套角色画像和补充权限计算。
- 受管角色保留公共权限、精确权限，并获得画像前缀允许的所有启用权限。
- 自定义角色在菜单权限同步时保留明确的公共查找权限 `lookup:read`。
- 超级管理员持久化全部启用权限和菜单，并在受管角色同步完成后最后刷新，避免同步过程新增权限导致遗漏。
- 修复新建角色在裁剪结果为空时错误恢复原始、未裁剪菜单列表的问题。

主要实现：

- `backend/src/authorization/roleAccessProfiles.js`
- `backend/src/authorization/superAdmin.js`
- `backend/src/services/PermissionRegistry.js`
- `backend/src/services/RoleAccessService.js`
- `backend/src/models/system.js`

数据修复迁移：

- `20260901000001_reactivate_canonical_print_permissions.js`
- `20260901000002_resync_role_permission_ssot.js`
- `20260901000003_resync_super_admin_permissions.js`

### 3. 公共查找接口和最小数据暴露

- 查找类接口统一要求显式 `lookup:read`，不再借用历史 `dashboard` 权限。
- `/system/users/list` 仅返回查找所需字段，不再返回邮箱、电话和状态。
- 前端公共选项加载继续通过统一查找权限工作，避免业务模块为了下拉框被迫获得系统管理权限。

主要实现：

- `backend/src/authorization/lookupPermissions.js`
- `backend/src/controllers/system/systemController.js`
- `frontend/src/utils/optionLoaders.js`

### 4. 密码策略一致性

- 后端通用校验器统一为 12-128 字符。
- PC 的中、英、韩提示同步为至少 12 字符，避免界面提示与后端策略不一致。
- 既有密码安全服务仍负责复杂度、bcrypt 字节上限、历史密码和常见密码检查。

主要实现：

- `backend/src/utils/validator.js`
- `backend/src/utils/passwordSecurity.js`
- `frontend/src/locales/zhCN.js`
- `frontend/src/locales/en.js`
- `frontend/src/locales/ko.js`

### 5. 冗余与临时代码治理

已删除确认无生产用途的公开诊断页、临时数据库/数据排查脚本、临时部署诊断脚本和 Playwright 输出目录。根项目移除了仅供临时排查使用的 `mysql/mysql2` 依赖，`/output/` 已加入忽略规则。

本轮未删除三个未跟踪的业务 `.docx` 文件，也未回退工作区中已有的其他业务改动。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 数据库角色权限矩阵 | 27 角色、811 启用权限；受管角色缺口 0；`lookup:read` 缺口 0；超管缺口 0 |
| Production readiness + DB | 339 权限路由；缺认证 0；缺权限 0；静态问题 0；未注册权限 0 |
| Backend Jest | 113 suites 通过、2 跳过；780 tests 通过、2 跳过 |
| 权限专项 Jest | 53 tests 通过 |
| PC Vitest | 15 files、69 tests 通过 |
| Mobile Vitest | 3 files、10 tests 通过 |
| PC / Mobile production build | 均通过 |
| 根 lint 与约束检查 | 通过；704 文件双字段检查 0；AppDialog 和主题 token 检查通过 |
| 模块完整性 | 49 capabilities、11 modules；缺口 0 |
| 旧代码候选审计 | 0 candidates |
| Mobile auth 审计 | 0 issues |
| 迁移完整性 | 259 个迁移校验通过；无待执行迁移 |
| npm audit | root、backend、frontend、mobile 均为 0 |

## 仍需生产验收

1. 行级 DataScope 当前按产品决定停用，所有角色为 `ALL`。这不是未修复的代码缺陷，但意味着当前安全边界是功能/动作权限，不提供部门、库位或本人维度的数据隔离。若要恢复，必须先重建组织和业务对象归属数据，再设计迁移和真实账号矩阵，不能只打开开关。
2. 验证 TLS 终止、可信代理 CIDR、防火墙和后端端口不可旁路；确认 Cookie 的 Secure、HttpOnly、SameSite 与实际跨域拓扑一致。
3. JWT、CSRF、数据库、Redis、备份和第三方密钥应由生产密钥系统注入并完成轮换，仓库历史中曾出现的凭据必须在外部系统失效。
4. 应用数据库账号必须最小授权，迁移、运行和备份账号应分离；用生产实际 GRANT 结果验收。
5. 在隔离环境完成一次加密备份恢复演练，并验证恢复后账务、库存和权限数据一致。
6. 用真实普通角色执行列表、详情、创建、审批、导出、批量、文件下载和 Socket 撤权的跨角色、跨部门回归。自动化覆盖不能替代实际岗位验收。
7. 两项现有 Jest 跳过用例需要在发布清单中保持可见，避免被误认为全量场景均已执行。

## 发布判定

代码侧权限闭环、静态检查、测试、构建、迁移和依赖门禁均已通过。完成上述生产环境验收并留存证据后，方可给出正式上线批准。
