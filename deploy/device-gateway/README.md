# e.kacon.ai 内网同域名电脑/手机自动分流

`e.kacon.ai` 的 A 记录直接解析到 `192.168.1.251`，仅供内网使用，不使用 Cloudflare Tunnel。浏览器访问域名后由 Nginx 根据设备分流，地址栏保持同一个域名。

```text
e.kacon.ai → 192.168.1.251:80（或已有 HTTPS 的 443）
                → 18083 分流网关
                    ├─ 电脑 → 192.168.1.251:18081
                    └─ 手机 → 192.168.1.251:18082
```

**A 记录只能指定 IP，不能指定端口。** `http://e.kacon.ai/` 使用 80，`https://e.kacon.ai/` 使用 443；必须将现有域名站点的反向代理指向 18083。直接验证网关时可访问 `http://192.168.1.251:18083/`。若 DNS 托管在 Cloudflare，内网 A 记录应使用「仅 DNS」（灰云）。

## 1. 启动网关

将本目录的 `docker-compose.yml`、`nginx.conf` 一起部署到服务器独立目录，例如 `/opt/kacon-device-gateway/`。服务器须先有正常运行的完整 ERP（后端、电脑端、手机端）；本目录只提供分流网关，不能替代 ERP 全量部署。

```sh
docker compose run --rm --no-deps gateway nginx -t
docker compose up -d
docker compose ps
```

网关使用 18083，不依赖 ERP 容器 IP。独立 Compose 项目名为 `kacon-device-gateway`，不要添加 `kacon-erp` 前缀，否则会与 ERP 发布脚本的容器审计范围冲突。健康检查只验证网关进程，18081 和 18082 的实际页面也要验证。

## 2. 接入现有域名入口

先查看 80/443 端口的现有服务，保留原站点和证书配置，只修改 `e.kacon.ai` 站点的反向代理目标为 `http://192.168.1.251:18083`。不要用这个网关抢占现有 80/443 端口或替换其它域名站点。

本服务器现有入口由 1Panel OpenResty 管理，已核实容器内 `/usr/local/openresty/nginx/conf/conf.d/erp.conf` 在 80 端口同时服务 `erp.kacon.ai` 和 `e.kacon.ai`，并包含 `/www/sites/erp/proxy/root.conf`，原代理目标为 `127.0.0.1:18081`。不要直接把共享站点的所有请求都改为 18083；应仅将 `e.kacon.ai` 分流。修改前确认文件对应的宿主机挂载路径，在持久化配置中备份并更新。

在 `http` 上下文加载的新文件 `/usr/local/openresty/nginx/conf/conf.d/kacon-device-route.conf` 中添加：

```nginx
map $host $kacon_device_origin {
    default http://127.0.0.1:18081;
    e.kacon.ai http://127.0.0.1:18083;
}
```

然后将 `/www/sites/erp/proxy/root.conf` 中原有 `proxy_pass http://127.0.0.1:18081;` 改为 `proxy_pass $kacon_device_origin;`，保留其它站点配置，并确认最外层设置 `proxy_set_header X-Forwarded-Proto $scheme;`。这样 `erp.kacon.ai` 仍直达电脑端，只有 `e.kacon.ai` 进入分流网关。执行 OpenResty 配置测试成功后再重载。

若另建仅服务 `e.kacon.ai` 的独立 Nginx/OpenResty 站点，可参考以下 `location`（不要整段替换当前共享站点）。HTTPS 使用站点原有的有效证书和监听配置；HTTP 内网访问不要求新增证书。

```nginx
location / {
    proxy_pass http://192.168.1.251:18083;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_cache off;
}
```

最外层入口应覆盖 `X-Forwarded-Proto` 为真实访问协议；网关和 ERP 前端继续传递该协议。网关统一返回 `Cache-Control: no-store`，避免同一 URL 的电脑和手机页面被缓存混用。

生产环境 `ALLOWED_ORIGINS` 应包含实际入口，例如 `http://e.kacon.ai`；启用 HTTPS 时同时加入 `https://e.kacon.ai`，保留其它已有值。需要通过 IP 加端口登录时，也加入对应完整来源（例如 `http://192.168.1.251:18083`）。内网 HTTP 登录使用 `COOKIE_SECURE=auto`，后端会按请求协议设置 Cookie；生产环境不能设为 `false`。更改环境变量后须重新创建后端容器使其生效。

## 3. 验证与回退

```sh
curl -fsS -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' http://192.168.1.251:18083/ -o /tmp/erp-pc.html
curl -fsS -A 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile' http://192.168.1.251:18083/ -o /tmp/erp-mobile.html
curl -fsSI -H 'Host: e.kacon.ai' http://192.168.1.251/
```

分别与 18081、18082 的入口 HTML 比对；随后在电脑、手机上访问实际域名，确认地址不变、页面正确，并验证登录、查询、表单、图片和实时连接。实际使用 HTTPS 时也检查 HTTPS 入口。

回退分流时，将 `/www/sites/erp/proxy/root.conf` 的代理目标恢复到原有 `http://127.0.0.1:18081`，测试 OpenResty 配置后重载；变量不再被引用后可移除新增的 `kacon-device-route.conf`。确认恢复后，可在网关目录执行 `docker compose down`。完整 ERP 的版本回退按全量部署流程执行。

## 4. HTTPS 证书自动续期

`e.kacon.ai` 使用浏览器信任的 Let's Encrypt 证书，通过 Cloudflare DNS 的 TXT 记录验证域名。即使 A 记录指向内网 IP，也能签发和续期；不需要公网开放 80/443。Cloudflare Origin CA 证书用于 Cloudflare 与源站之间，不能替代这个直接供内网浏览器使用的证书。

服务器续期状态目录为 `/opt/1panel/docker/compose/KACON-ERP/.tls-e-kacon`，由具有 Docker 权限的部署账号 `guiyi` 管理，目录权限为 700：

- `cloudflare.ini`：仅包含 Cloudflare DNS API Token，权限 600，所有者必须是运行续期脚本的账号。令牌只授予 `kacon.ai` 区域的 DNS 编辑权限；该权限已验证可完成区域查询和 DNS 验证，无需额外授予区域读取权限。
- `config`、`work`、`logs`：Certbot 状态；容器中对应 `/data/config`、`/data/work`、`/data/logs`。
- `renew-e-kacon-cert.sh`：由本目录同名脚本复制，权限 700，放在 TLS 状态目录中，独立于 ERP 应用文件发布。
- `renew-cron.log`：计划执行日志；不要把凭据、私钥或整个 TLS 状态目录提交到代码仓库或发布包。

凭据文件格式如下，真实令牌通过安全渠道写入服务器文件，不写入脚本、命令参数或聊天：

```ini
dns_cloudflare_api_token = YOUR_SCOPED_TOKEN
```

首次配置时应将已有 `e.kacon.ai` 证书续期参数从手工 DNS 验证迁移至 Cloudflare 插件，并通过测试。下面命令应以 `guiyi` 执行；使用与续期脚本一致、已拉取的官方镜像摘要。执行前获取 ERP 的 `.deploy.lock`，避免与全量发布或续期同时运行。

```sh
TLS_STATE=/opt/1panel/docker/compose/KACON-ERP/.tls-e-kacon
CERTBOT_IMAGE=certbot/dns-cloudflare@sha256:c45edb002b883da1a1235abb205dff474a7a1a459d878e8d5fdc7f9d83073aea
(
  flock -w 1800 9 || exit 23
  docker run --rm --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$TLS_STATE,dst=/data" "$CERTBOT_IMAGE" \
    reconfigure --cert-name e.kacon.ai --non-interactive \
    --config-dir /data/config --work-dir /data/work --logs-dir /data/logs \
    --dns-cloudflare --dns-cloudflare-credentials /data/cloudflare.ini \
    --dns-cloudflare-propagation-seconds 60
) 9>/opt/1panel/docker/compose/KACON-ERP/.deploy.lock
"$TLS_STATE/renew-e-kacon-cert.sh" --dry-run
"$TLS_STATE/renew-e-kacon-cert.sh" --deploy-only
```

将每天两次的任务加入 `guiyi` 的原有 crontab，保留已有任务。下面时刻按服务器的 cron 时区解释；安装时确认服务器时区和实际执行时间：

```cron
17 5,17 * * * /opt/1panel/docker/compose/KACON-ERP/.tls-e-kacon/renew-e-kacon-cert.sh >> /opt/1panel/docker/compose/KACON-ERP/.tls-e-kacon/renew-cron.log 2>&1
```

默认执行只在 Certbot 判定证书需要续期时申请新证书。脚本验证证书链受信任、域名正确、私钥匹配后，替换 OpenResty 容器 `1Panel-openresty-8q3a` 中 `/www/sites/erp/ssl/e.kacon.ai` 的证书，测试配置并平滑重载，随后用真实 HTTPS 连接验证服务中的证书序列号。仅保留上一对证书；部署失败时自动恢复，新签发的证书留在 Certbot 状态目录供下次重试。证书未变时也会验证 HTTPS 可用性。`--dry-run` 仅测试 Let's Encrypt 测试环境中的续期，不安装测试证书，也不重载生产入口。

续期和完整 ERP 发布共用 `/opt/1panel/docker/compose/KACON-ERP/.deploy.lock`。续期容器使用独立名称 `e-kacon-cert-renew-*`，不会落入 ERP 发布的容器审计范围。遇到错误先查看 `renew-cron.log` 和 `logs/letsencrypt.log`；排除网络、令牌权限或 DNS 问题后可直接重新执行脚本。计划任务记录错误，但不主动发送外部通知。

## 识别范围

按浏览器 User-Agent 识别 Android、iPhone、iPad 等移动设备。手机开启「桌面版网站」或 iPad 使用桌面 UA 时可能显示电脑端，切换模式后应刷新整个页面。

电脑和手机端的业务路径不完全一致，建议分享域名首页；网关不会将电脑端专属深层路径翻译成手机端路径。
