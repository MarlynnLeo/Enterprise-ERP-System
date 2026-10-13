# 经典主题一致性审计与修复

日期：2026-10-08。经典主题对应 `data-theme="workspace"`。

已修复本轮确认的主要一致性问题。静态检查覆盖生产、采购、销售、库存、质量、财务、基础数据、系统管理 8 个模块的 140 条路由映射（138 个不同页面源文件）；浏览器复核 22 个代表页面，并检查经典仪表盘。

## 根因与修复

| 问题 | 典型页面 | 本次处理 |
| --- | --- | --- |
| 卡片留白取决于表格是否直接放在卡片内 | 生产计划、物料管理、BOM、权限设置 | 删除仅对直接表格清空内边距的规则。数据卡统一为白色背景、1px 边框、4px 圆角、10px 12px 内边距。 |
| 旧容器名称没有纳入紧凑间距 | 换货、返工、报废、通知 | 补齐 `table-card`、`filter-card` 等区块，统一 8px 区块间距。 |
| 根布局 gap 与卡片 margin 重复计算 | 在建工程、资产详情 | 根 gap 归零，由区块间距控制纵向节奏。 |
| 查询卡、外层筛选区、数据卡重复叠套 | 设备监控、不合格品、8D、AQL、量检具 | 卡内查询改为单层工具栏，去除重复背景、边框和留白；保留高级筛选交互。 |
| 分页底栏与按钮间距各自定义 | 采购订单、质量旧列表、发票、BOM、库存 | 兼容已有分页容器与直接分页控件，统一分隔线、上方间距、右对齐；清除 background 模式额外 margin，按钮间距统一由 gap 控制。 |
| 自建面板仍使用不同的圆角、阴影与内距 | 采购历史、财务设置、银行对账 | 接入经典主题的卡片表面与页签内距；采购历史按剩余高度分配表格空间，分页回到首屏内。 |
| 备份列表缺少数据卡片 | 数据备份 | 给现有表格补充标准 `el-card.data-card`，业务操作不变。 |
| 应用壳样式误中页面内部同名容器 | 资产详情 | 壳级主内容选择器限定到 `#workspace-page`。 |
| 控件尺寸仍受局部样式影响 | 工位管理、财务设置 | 修正下拉宽度塌缩；输入与选择器使用经典主题的 2px 圆角，保留组合输入的拼接边缘。 |

你举例的两个页面原本都有数据卡片。浏览器测量确认：修复前生产计划卡片 body 的内边距为 `0px`，物料页为 `10px 12px`；修复后两者均为 `10px 12px`。

## 验证结果

- 22 页浏览器检查：卡片与控件计算样式符合统一规则，未发现页面横向溢出或错误提示。
- 1024×768 与 1440×1000 视口检查：筛选区、数据卡、分页可操作；生产计划横向滚动后固定操作列可见。
- 11 项交互检查通过：菜单导航、高级筛选展开/收起、查询空列表、重置、分页大小切换、下一页、表单打开/取消、窄屏边界、表格横向滚动、采购历史分页可见性。
- 主题与查询组件相关测试：4 个文件、43 项通过；布局与导航相关检查：5 个文件、51 项通过。
- 生产构建通过，含构建前 13 个文件、138 项性能/运行时检查，以及菜单、操作列和构建产物校验。
- 主题静态审计、主题 token 检查、修改文件的差异格式检查通过。
- 默认/深色主题抽查：生产计划仍保持各自的 20px 卡片内距和主题背景；经典仪表盘布局正常。

本机 Node 26 的测试运行使用 `NODE_OPTIONS=--no-experimental-webstorage`，避免原生 localStorage 与 jsdom 冲突。

## 范围与证据

浏览器使用本地开发页面及浏览器内模拟数据：生产计划、物料包含列表数据，其他样例以空列表或默认状态为主。本轮验证的是视觉和交互布局，不代表真实业务数据、权限或后台流程验收。其他主题只做隔离抽查，没有全面审计。

主题样式修复限定在经典主题。备份页补充标准卡片属于共享结构修复，因此其他主题的备份页也会采用各自的卡片样式；应用壳选择器收窄同样是共享修复。

源码修改集中在以下 4 个文件，保留工作区原有修改：

- [经典主题样式](/F:/ERP/frontend/src/assets/themes/pc/workspace.css)
- [应用布局样式](/F:/ERP/frontend/src/views/layout.css)
- [经典主题布局样式](/F:/ERP/frontend/src/views/workspace-layout.css)
- [数据备份页面](/F:/ERP/frontend/src/views/system/Backup.vue)

可复核的截图与检查记录：

- [生产计划修复后](/F:/ERP/frontend/output/playwright/classic-audit-20261008/after-production-plan.png)
- [物料管理修复后](/F:/ERP/frontend/output/playwright/classic-audit-20261008/after-basedata-materials.png)
- [设备监控修复后](/F:/ERP/frontend/output/playwright/classic-audit-20261008/after-production-equipment-monitoring.png)
- [工位管理修复后](/F:/ERP/frontend/output/playwright/classic-audit-20261008/after-production-work-stations.png)
- [窄屏高级筛选](/F:/ERP/frontend/output/playwright/classic-audit-20261008/narrow-materials-advanced.png)
- [22 页浏览器检查记录](/F:/ERP/frontend/output/playwright/classic-audit-20261008/after-modules.json)
- [交互检查记录](/F:/ERP/frontend/output/playwright/classic-audit-20261008/interactions.json)
- [静态路由审计清单](/F:/ERP/frontend/output/classic-audit-20261008/inventory-agent.json)
