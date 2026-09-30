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

## 识别范围

按浏览器 User-Agent 识别 Android、iPhone、iPad 等移动设备。手机开启「桌面版网站」或 iPad 使用桌面 UA 时可能显示电脑端，切换模式后应刷新整个页面。

电脑和手机端的业务路径不完全一致，建议分享域名首页；网关不会将电脑端专属深层路径翻译成手机端路径。
