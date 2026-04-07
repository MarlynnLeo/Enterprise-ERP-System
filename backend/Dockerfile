# 后端 Dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装构建依赖（某些npm包需要编译工具）
RUN apk add --no-cache python3 make g++

# 复制 package 文件先安装依赖（利用Docker缓存层）
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production && npm cache clean --force

# 复制源代码
COPY src/ ./src/
COPY migrations/ ./migrations/
COPY seeds/ ./seeds/
COPY knexfile.js ./

# 创建上传和日志目录
RUN mkdir -p uploads logs

# 设置时区
RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai

# 非 root 用户运行
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 -G nodejs && \
    chown -R nodeuser:nodejs /app
USER nodeuser

EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/ping || exit 1

CMD ["node", "--expose-gc", "src/index.js"]
