# Backend production image
FROM node:22-alpine

WORKDIR /app

# Native dependencies are required by some npm packages during install.
RUN apk add --no-cache python3 make g++ tzdata

COPY package*.json ./

RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --omit=dev --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 && \
    npm cache clean --force

COPY src/ ./src/
COPY migrations/ ./migrations/
COPY seeds/ ./seeds/
COPY scripts/ ./scripts/
COPY knexfile.js ./

RUN mkdir -p uploads logs backups

ENV TZ=Asia/Shanghai

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 -G nodejs && \
    chown -R nodeuser:nodejs /app
USER nodeuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

CMD ["node", "--expose-gc", "src/index.js"]
