# Frontend production image
FROM node:22-alpine AS builder

WORKDIR /app

ARG APP_BUILD_ID
ENV APP_BUILD_ID=$APP_BUILD_ID

COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY . .

RUN npm run build
RUN node scripts/validate-menu-implementation.mjs --dist dist

FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
