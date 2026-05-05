# KACON-ERP 移动端

基于 Vue 3 + Vite + Vant 的企业资源管理系统移动端应用。

## 📋 功能特性

- ✅ 扫码功能（二维码/条形码）
- ✅ 库存管理（入库、出库、盘点）
- ✅ 生产管理（生产计划、生产任务）
- ✅ 采购管理（采购订单、采购收货）
- ✅ 销售管理（销售订单、销售出库）
- ✅ 质量管理（来料检验）
- ✅ PWA 支持（可添加到主屏幕）
- ✅ 全屏模式（iOS/Android）
- ✅ 离线缓存

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0

### 安装依赖

```bash
cd mobile
npm install
```

### 环境配置

1. 复制环境变量示例文件：

```bash
cp .env.example .env
```

2. 修改 `.env` 文件中的配置：

```env
# API 基础 URL（必须配置）
VITE_APP_API_BASE_URL=http://127.0.0.1:8080

# 开发服务器端口
VITE_DEV_PORT=3001
```

### 开发模式

```bash
npm run dev
```

访问: `http://localhost:3001`

### 生产构建

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 📱 移动端访问

### 局域网访问

1. 确保手机和电脑在同一局域网
2. 启动开发服务器：`npm run dev`
3. 手机浏览器访问：`http://[电脑IP]:3001`

### 添加到主屏幕

#### iOS (Safari)

1. 打开应用网址
2. 点击底部分享按钮
3. 选择"添加到主屏幕"
4. 点击"添加"

#### Android (Chrome)

1. 打开应用网址
2. 点击右上角菜单
3. 选择"添加到主屏幕"
4. 点击"添加"

## 🛠️ 技术栈

- **框架**: Vue 3 (Composition API)
- **构建工具**: Vite 6
- **UI 组件库**: Vant 4
- **状态管理**: Pinia
- **路由**: Vue Router 4
- **HTTP 客户端**: Axios
- **扫码**: @zxing/library
- **日期处理**: dayjs

## 📂 项目结构

```
mobile/
├── public/              # 静态资源
├── src/
│   ├── assets/         # 资源文件（样式、图片等）
│   ├── components/     # 公共组件
│   ├── composables/    # 组合式函数
│   ├── config/         # 配置文件
│   ├── constants/      # 常量定义
│   ├── router/         # 路由配置
│   ├── services/       # API 服务
│   ├── stores/         # 状态管理
│   ├── utils/          # 工具函数
│   ├── views/          # 页面组件
│   ├── App.vue         # 根组件
│   └── main.js         # 入口文件
├── .env                # 环境变量（本地）
├── .env.development    # 开发环境变量
├── .env.production     # 生产环境变量
├── .env.example        # 环境变量示例
├── index.html          # HTML 模板
├── package.json        # 项目配置
└── vite.config.js      # Vite 配置
```

## 🔧 配置说明

### API 配置

在 `src/config/app.js` 中配置 API 相关参数：

- `baseURL`: API 基础地址（从环境变量读取）
- `timeout`: 请求超时时间
- `retry`: 重试配置

### 功能开关

在 `src/config/app.js` 中的 `FEATURE_FLAGS` 配置功能开关：

- `qrScanner`: 扫码功能
- `pushNotifications`: 推送通知
- `camera`: 摄像头
- `fileUpload`: 文件上传

## 📝 开发规范

- 使用 Composition API
- 组件命名采用 PascalCase
- 文件命名采用 kebab-case
- 使用 ESLint 进行代码检查
- 提交前运行 `npm run lint`

## 🐛 常见问题

### 1. 环境变量未生效

确保：
- `.env` 文件存在
- 环境变量以 `VITE_` 开头
- 修改后重启开发服务器

### 2. API 请求失败

检查：
- `VITE_APP_API_BASE_URL` 配置是否正确
- 后端服务是否启动
- 网络连接是否正常

### 3. 扫码功能无法使用

确保：
- 使用 HTTPS 或 localhost
- 浏览器已授权摄像头权限
- 设备支持摄像头

## 📄 许可证

Copyright © 2025 KACON
