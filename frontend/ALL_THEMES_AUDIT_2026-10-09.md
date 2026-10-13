# 全部 PC 主题一致性审计与修复

日期：2026-10-09。

已完成 10 套 PC 主题的共享样式审计，修复本轮确认的卡片、间距、分页、表单状态、局部面板和文字对比度问题。30 个代表页面 × 10 套主题的 300 组浏览器检查、120 项交互检查均通过；保留各主题原有配色、圆角和布局密度。

## 审计范围

主题覆盖：默认、科技、商务、活力、自然、深色、Premium Editorial、专业、KACON 品牌、经典。

源码范围延续[经典主题路由清单](/F:/ERP/frontend/output/classic-audit-20261008/inventory-agent.json)：8 个业务模块、140 条路由映射、138 个不同页面源文件；本轮继续检查共享样式、各主题覆盖规则和页面内局部样式，并补充仪表盘组件。浏览器实际执行的是下列 30 个代表页面及 10 套主题的首页，未将全部 140 条路由逐一与 10 套主题组合运行。

| 模块 | 本轮浏览器矩阵中的路由 |
| --- | --- |
| 生产，3 页 | `/production/plan`、`/production/work-stations`、`/production/equipment-monitoring` |
| 基础数据，2 页 | `/basedata/materials`、`/basedata/boms` |
| 质量，7 页 | `/quality/replacement-orders`、`/quality/rework-tasks`、`/quality/scrap-records`、`/quality/nonconforming`、`/quality/aql-standards`、`/quality/gauges`、`/quality/8d-reports` |
| 采购，2 页 | `/purchase/history`、`/purchase/orders` |
| 销售，1 页 | `/sales/orders` |
| 库存，1 页 | `/inventory/stock` |
| 财务，9 页 | `/finance/assets/cip`、`/finance/settings`、`/finance/cash/reconciliation`、`/finance/tax/invoices`、`/finance/budget/ai`、`/finance/assets/detail/95001`、`/finance/expenses`、`/finance/gl/opening-balances`、`/finance/gl/period-closing` |
| 系统，5 页 | `/system/notifications`、`/system/backup`、`/system/permissions`、`/system/users`、`/system/technical-communication` |

## 已修复的问题

用户最初指出的生产计划与物料管理页面，原本都存在数据卡片。经典主题旧规则根据表格是否直接放在卡片内，给出了不同的内边距，导致部分页面看起来没有背景卡片。前一轮已修复经典主题；本轮将同类结构的统一规则扩展到全部 PC 主题。

| 问题与影响 | 本轮修复 |
| --- | --- |
| 旧列表使用 `table-card`、`box-card`、`list-card`，背景与标准 `data-card` 不同 | 将这些 Element Plus 卡片别名接入同一数据表面、圆角与内距规则；覆盖质量等旧页面，同时保留自绘布局容器。 |
| 查询区与数据区留白各自定义，部分布局同时使用根 `gap` 和子区块 `margin` | 以共享区块间距控制页面节奏；在建工程等页面的双重间距由 32px 恢复为 16px，经典保持 8px；内部网格和栅格间距保留。 |
| 查询卡嵌套在另一张卡片里，出现多层边框和重复留白 | 内层查询卡作为工具栏显示，保留高级筛选；设备监控、不合格品、8D、AQL、量检具等使用同一规则。 |
| 分页容器别名、直接分页及 `background` 模式外观不同 | 统一底栏分隔线、外距、内距和对齐；统一页码按钮间距，恢复禁用背景；窄屏可横向滚动。采购历史分页保持在可视高度内。 |
| 部分主题直接强制输入框边框、阴影、底色，压过组件的聚焦、禁用和校验状态 | 用组件主题变量统一输入框、下拉框和日期控件，恢复 Element Plus 原生状态规则；保留组合输入框接缝。 |
| 控件宽度工具类被组件后加载的样式覆盖，工位管理下拉框塌缩 | 14 个宽度工具类通过变量与明确的组件选择器稳定生效；普通主题保留 160px/120px，经典保留 160px/160px。 |
| 财务设置、预算分析的页签、面板和控件存在局部固定样式 | 接入共享页签与面板规则，移除重复表面、固定圆角和局部输入阴影，保留页面业务布局。 |
| 商务、专业主题的侧栏字标填色不正确，自然主题选中菜单对比度偏低 | 清除字标的透明渐变填色，让侧栏文字变量生效；自然主题选中菜单改为白字并调整背景覆层。 |
| 深色主题的表格签名仍用深色文字，未配置签名的区域未随主题变化 | 表格签名与空态使用主题颜色；用于打印效果的白纸预览保留白底深色字，空白提示在白底上的对比度为 4.83。 |
| 签名预设按钮挤在同一个输入框尾部，文字互相遮挡 | 移到输入框下方独立按钮组，使用小号按钮、8px 间距和自动换行，保留点击填入行为。 |
| 经典仪表盘部分排名、待办和状态文字对比度不足 | 调整文字前景色并保留语义背景；高优先级徽标对比度 4.41 → 5.91，取消状态 4.29 → 5.75。 |

## 保留的主题差异

以下为生产计划页面的实测值。统一同类组件的规则，同时保留每套主题的设计参数；经典查询卡仍使用 `8px 12px` 的紧凑内距。

| 主题 | 主题键 | 数据卡圆角 | 数据卡内距 | 输入框圆角 | 页面区块间距 |
| --- | --- | --- | --- | --- | --- |
| 默认 | `default` | 16px | 20px | 12px | 16px |
| 科技 | `tech` | 8px | 20px | 4px | 16px |
| 商务 | `business` | 6px | 20px | 4px | 16px |
| 活力 | `vibrant` | 12px | 20px | 12px | 16px |
| 自然 | `nature` | 14px | 20px | 10px | 16px |
| 深色 | `dark` | 12px | 20px | 8px | 16px |
| Premium Editorial | `premium` | 8px | 20px | 8px | 16px |
| 专业 | `professional` | 6px | 20px | 4px | 16px |
| KACON 品牌 | `kacon` | 8px | 24px | 8px | 16px |
| 经典 | `workspace` | 4px | 10px 12px | 2px | 8px |

## 验证结果

| 检查 | 结果与边界 |
| --- | --- |
| 页面矩阵 | 1440×1000 下 300 个不重复组合，指定的卡片、圆角、内距、区块间距、控件宽度和分页规则无违规；未捕获 JS 异常、错误提示及页面横向溢出均为 0。修改前保存了 120 个组合的基线。 |
| 交互 | 物料页每主题 12 项，共 120/120 通过：主题切换与刷新保持、高级筛选、聚焦、禁用、输入/下拉校验边框、空列表、重置、分页及运行异常检查；包含 1024×768 的筛选和弹窗布局。 |
| 最终首页与表格复核 | 10 套主题的侧栏字标与首页正常；经典使用经典布局，其余使用共享布局。生产计划在 1024×768 横向滚动后，固定操作列可见，页面没有横向溢出。 |
| 用户签名专项 | 10 套主题均通过：表格签名、白纸提示及匹配文字对比度检查；空态背景随主题变化；4 个快捷按钮无重叠、未超出容器，点击可填入代号。白纸提示最低 4.83，匹配文字最低 4.63。 |
| 主题与查询组件测试 | 5 个测试文件、79 项通过，包含新增的跨主题输入状态约束。 |
| 生产构建 | `npm run build` 通过；包含构建前 13 个文件、138 项检查，以及菜单、操作列和构建产物校验。上述测试集合有交集，不合并为独立用例总数。 |
| 主题静态检查 | 10 套主题的 61 个核心 token 无缺失；主题 token、组件状态和字体引用检查通过；修改文件的 `git diff --check` 通过。 |

最终收尾修改后，重新执行了生产构建与用户签名专项检查。矩阵采集与截图会结束有限动画，避免切换主题时的过渡值影响计算样式比较；这不属于动画性能测试。

本机 Node 26 运行 Vitest/构建前检查时，临时使用 `NODE_OPTIONS=--no-experimental-webstorage`，避免原生 localStorage 与 jsdom 冲突。未更改持久环境配置。

## 静态提示与验证限制

样式统一性脚本的最终结果为 **0 项高、0 项中、1 项低级提示**。低级提示是 7 个文件中的 70 处十六进制颜色值，涉及 CSS 备用值、固定白纸与墨色、仅在经典主题加载的仪表盘语义配色。这是继续维护的源码提示，不代表 70 个已确认视觉缺陷；本轮已修复其中实际影响深色主题和文字对比度的部分。

浏览器使用本地开发页面及浏览器内模拟 API 数据，涵盖有数据、空列表、禁用与校验状态。本次验证界面外观和交互布局，不代表真实后端、实际权限或业务写入流程验收。1024px 检查集中在物料筛选/弹窗和生产计划表格；未对全部路由、隐藏页签、自定义主色组合或移动端主题逐一验收，也未进行完整可访问性认证。

## 修改与证据

本轮在现有工作区修改共享样式、主题覆盖、财务设置/预算页、用户签名区和经典仪表盘的少量颜色，保留已有业务修改。核心源文件包括：

- [共享页面布局](/F:/ERP/frontend/src/assets/common-styles.css)、[控件宽度工具类](/F:/ERP/frontend/src/assets/ui-utilities.css)、[统计卡片](/F:/ERP/frontend/src/assets/stat-cards.css)。
- [共享主题组件](/F:/ERP/frontend/src/assets/themes/pc/theme-components.css)及默认、科技、活力、自然、Premium、专业、KACON、经典主题的局部覆盖。
- [财务设置](/F:/ERP/frontend/src/views/finance/settings/FinanceSettings.vue)、[预算分析](/F:/ERP/frontend/src/views/finance/budget/BudgetAI.vue)、[用户管理](/F:/ERP/frontend/src/views/system/Users.vue)。
- [经典待办](/F:/ERP/frontend/src/views/dashboard/components/classic/DashboardTodoList.vue)、[在线排行](/F:/ERP/frontend/src/views/dashboard/components/classic/OnlineTimeRanking.vue)、[生产计划摘要](/F:/ERP/frontend/src/views/dashboard/components/classic/ProductionPlanTable.vue)。
- [主题样式约束测试](/F:/ERP/frontend/tests/theme-css-guards.test.js)。

可复核的记录：

- [300 组矩阵汇总](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/matrix-summary.json)、[明细](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/matrix-after.json)、[120 组修改前基线](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/matrix-before.json)。
- [120 项交互结果](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/interactions.json)、[首页与窄屏表格复核](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/final-smoke.json)、[签名专项结果](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/users-signature-smoke.json)。
- [主题测试日志](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/theme-tests-final.log)、[最终构建日志](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/build-final.log)。
- [主题静态结果](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/theme-audit-final.json)、[样式统一性静态结果](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/ui-ssot-audit-final.log)。
- [商务主题生产计划](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/final-business-plan.png)、[自然主题生产计划](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/final-nature-plan.png)、[专业主题生产计划](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/final-professional-plan.png)。
- [经典首页](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/dashboard-workspace.png)、[深色签名预览与按钮组](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/signature-premium-blank-preview.png)、[自然主题签名预览](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009/signature-nature-preview.png)。

完整浏览器脚本、各主题截图及本轮修改前的源码副本位于 [all-themes-audit-20261009](/F:/ERP/frontend/output/playwright/all-themes-audit-20261009)。
