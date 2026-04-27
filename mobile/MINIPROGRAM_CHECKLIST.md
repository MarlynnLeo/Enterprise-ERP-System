# mobile 转微信小程序检查清单

## 当前结论

`mobile` 现在是一个标准的 Vue 3 + Vite + Vant 移动 H5/PWA 项目，不是小程序工程，不能直接“打包成小程序”发布。

当前更像下面这两条路线二选一：

1. 快速上线路线：保留现有 H5，把它放进微信小程序 `web-view`
2. 正式改造路线：新建真正的小程序工程，逐页迁移 `mobile`

如果你的目标是“尽快能在微信里打开”，优先选第 1 条。
如果你的目标是“原生小程序体验、扫码/存储/路由完全按小程序规范跑”，优先选第 2 条。

## 代码现状判断

### 这不是小程序项目

- 构建命令仍然是 `vite` / `vite build`
- 依赖是 `vant`、`vue-router`、`html5-qrcode`、`socket.io-client`
- 没有发现 `uni-app`、`taro`、`mpx`、`pages.json`、`project.config.json`、`app.json` 等小程序工程文件

### 当前项目里与小程序冲突最明显的点

- 使用了网页路由：`createWebHistory`
- 大量使用 `window` / `document` / `navigator`
- 认证和主题依赖 `sessionStorage` / `localStorage`
- 扫码页依赖浏览器摄像头和 `html5-qrcode`
- 页面入口和 `index.html` 明显是 PWA/H5 方案，不是小程序页面配置
- Socket 连接依赖浏览器上下文

## 已确认的事实

- `mobile` 当前可以正常打出 H5 生产包
- 我已经本地执行过 `npm run build`
- 构建通过，没有阻塞性报错

## 你现在最先要确认的事

### 1. 你要的到底是哪种“小程序”

先定这件事，不然后面会走错方向：

- 如果只是想让客户或员工在微信里访问 ERP 移动端：用 `web-view`
- 如果你要的是微信原生能力、原生扫码、原生页面栈、审核更稳定：做真正的小程序

### 2. 你的后端是不是公网可访问

这是发布前最大的现实问题。

当前 `mobile` 开发态通过 Vite 代理转发 `/api`，而生产态依赖 `VITE_APP_API_BASE_URL`。如果你的后端现在还只是：

- `localhost`
- 局域网 IP
- 公司内网地址

那小程序发布后，外部用户通常是访问不到的。你至少要准备：

- 一个可从手机公网访问的 HTTPS 前端域名
- 一个可从手机公网访问的 HTTPS API 域名
- 如果保留实时消息，还要有可用的 WebSocket 地址

## 路线 A：最快落地，用小程序 `web-view` 包现有 H5

这是最适合你当前项目现状的方案。

### 你需要做的事

1. 先把 `mobile` 当成正式 H5 发布
2. 把 `mobile/dist` 部署到 HTTPS 域名
3. 确认后端接口也有 HTTPS 域名
4. 新建一个很薄的小程序壳子
5. 小程序首页只放一个 `web-view`，打开你的 H5 地址
6. 在微信公众平台完成域名相关配置
7. 补齐小程序基础资料、类目、隐私协议、图标、简介
8. 上传代码、提审、发布

### 这个方案的优点

- 改动最小
- 上线最快
- 现有 `mobile` 基本不用大改
- 后续 H5 更新也更快

### 这个方案的缺点

- 不算真正意义上的“把 mobile 编译成小程序”
- 某些原生能力体验一般
- 扫码、分享、页面返回栈、授权等能力后面大概率还要做桥接

### 这个方案最需要重点验证的页面

- 登录
- 首页导航
- 扫码页
- 文件上传
- 聊天 / 通知 / Socket
- 涉及浏览器存储恢复登录的页面

## 路线 B：做真正的小程序工程

如果你决定走这条路，我不建议在现有 `mobile` 目录里硬改。
更合理的做法是新建一个小程序项目，例如：

- `miniapp/` 使用 `uni-app`（更贴近你现在的 Vue 单文件组件写法）

### 你需要替换的内容

1. 路由体系
   现在的 `vue-router` 要换成小程序页面路由
2. UI 组件库
   `vant` 不能原样照搬成微信小程序页面
3. 存储方案
   `sessionStorage` / `localStorage` 要换成小程序存储 API
4. 网络层
   `axios` 可以继续封装思路，但底层通常改成小程序请求能力更稳
5. 扫码能力
   `html5-qrcode` 改成小程序原生扫码能力
6. 浏览器 DOM 操作
   `window` / `document` / `navigator` 相关逻辑都要重写
7. PWA 能力
   `manifest`、`serviceWorker`、iOS 全屏适配逻辑都应删除
8. Socket
   改为小程序兼容的连接方式并重新验证鉴权

### 真正需要迁移的优先级

不要一口气迁全量 ERP 页面，建议按业务优先级切：

1. 登录
2. 首页
3. 扫码
4. 库存
5. 采购
6. 生产
7. 通知 / 聊天
8. 其他后台管理页面

## 按当前代码看，真正的阻塞点

### 高优先级阻塞

- 不是小程序工程
- 浏览器 API 使用太多
- 扫码完全依赖 H5 摄像头方案
- 登录状态依赖网页存储
- 页面路由依赖浏览器 history

### 中优先级风险

- `Socket.IO` 连接在小程序环境要重新验证
- H5 样式和滚动逻辑里有很多针对 iOS Safari/PWA 的处理
- `index.html` 里有 PWA、Google Fonts、Service Worker 清理逻辑，这些都不是小程序入口模型

## 我对你项目的建议

如果你现在目标是“先发布，先能用”，建议这样排：

1. 先走 `web-view` 小程序壳
2. 优先验证登录、首页、库存、采购、生产、扫码
3. 如果扫码或聊天体验不行，再把这些高频页面逐步原生化

这比直接把整个 `mobile` 全量重构成小程序更稳，也更省时间。

## 下一步最合适的执行顺序

1. 确认你走路线 A 还是路线 B
2. 确认后端是否具备公网 HTTPS 访问条件
3. 列出首批必须进入小程序的页面
4. 决定扫码是先用 H5 方案验证，还是直接改小程序原生扫码

## 代码定位

可重点查看这些文件：

- `mobile/package.json`
- `mobile/vite.config.js`
- `mobile/index.html`
- `mobile/src/main.js`
- `mobile/src/router/index.js`
- `mobile/src/services/api.js`
- `mobile/src/stores/auth.js`
- `mobile/src/views/Scan.vue`
- `mobile/src/composables/useSocket.js`

