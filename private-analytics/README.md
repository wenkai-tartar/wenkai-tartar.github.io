# 私有访问日志

采集 Worker 和 D1 数据库已部署，网站端点已配置。GitHub Pages 发布这次改动后开始记录，不会补录以前的访问。

网页外观不变。后台存储每次页面加载的 IP、国家代码、地区、城市、估算经纬度、访客时区、服务器收到请求的 UTC 时间和页面路径。没有位置数据的字段为 NULL。IP 位置不是实际住址，无法得到街道或门牌；VPN、代理和移动网络会影响准确性。

## 部署一次

当前账号已部署完成，不需要重新创建数据库。以后只更新采集代码时，在本目录运行 `npx wrangler@latest deploy`。

以下步骤供迁移到新账号时使用：

```bash
cd private-analytics
npx wrangler@latest login --scopes account:read user:read workers:write workers_scripts:write d1:write
npx wrangler@latest d1 create wenkai-private-visits
```

把输出的数据库 ID 填入 `wrangler.toml` 的 `database_id`，保留绑定名 `DB`（如 CLI 自动添加了绑定，请合并而非保留两份）。然后运行：

```bash
npx wrangler@latest d1 execute wenkai-private-visits --remote --file=schema.sql
npx wrangler@latest deploy
```

把部署输出的 HTTPS Worker 地址加上 `/collect`，填写到根目录 `_config.yml` 的 `private_visit_endpoint`。通过现有 GitHub Pages 工作流发布网站后生效。生产构建才加载脚本，本地预览不记录。若更换网站域名，同时更新 `url`、`baseurl` 和 Worker 的 `SITE_ORIGIN`。

## 仅自己查看

登录 Cloudflare 后打开 [当前数据库控制台](https://dash.cloudflare.com/50c0c4d41c7dc1bc8cc71baa24fb3afd/workers/d1/databases/4b776fcb-9471-4df6-9ce9-d9c1d8baa9a1/console) 查询，或在本目录使用已登录的 Wrangler：

```bash
npx wrangler@latest d1 execute wenkai-private-visits --remote --command="SELECT * FROM visits ORDER BY visited_at DESC LIMIT 100;"
npx wrangler@latest d1 execute wenkai-private-visits --remote --command="SELECT * FROM visitors ORDER BY last_visit_at DESC LIMIT 100;"
```

`visits` 是逐条明细，`visitors` 是按 IP 汇总的访问次数和首次/末次时间。北京时间可用 `datetime(visited_at, '+8 hours')` 显示。未来版面可从这些表读取数据；公开展示时另做脱敏，不要公开原始 IP。

采集接口只允许写入，没有公开读取接口。只有具有此 Cloudflare 账号数据库权限的人能查询。账号密码和 API token 不要放进前端或 Git 仓库；数据库 ID 和采集地址不是密码。`private-analytics/` 已从 Jekyll 输出中排除，真实日志不进入 GitHub Pages 或 Git 仓库。

备份请导出到已忽略的本地目录：

```bash
mkdir -p exports
npx wrangler@latest d1 export wenkai-private-visits --remote --output=exports/visits.sql
```

## 统计口径与限制

- 每次加载一个页面计 1 次，包括刷新和自己的访问；同一次事件重复上报不会重复计数。不等于独立人数或访问会话。
- 不使用 cookie 或持久访客 ID。多人可能共用 IP，同一个人也可能更换 IP。
- 不收集页面查询参数、片段、来源链接，也不请求浏览器精确位置权限。
- 浏览器屏蔽脚本、网络失败、后台页面未显示、服务配额耗尽都会导致漏记；不执行 JavaScript 的机器人不会被记录。GitHub Pages 方案无法保证记录每一个 HTTP 访问。
- `Origin` 校验可阻挡其他网站的浏览器请求，但不是身份认证，外部脚本可伪造上报。关注 Cloudflare 配额；出现滥用时可增加速率限制。
- 数据默认持续保存，按需在数据库控制台删除/导出。备份同样包含原始 IP，请私下保存。

官方参考：[D1 部署](https://developers.cloudflare.com/d1/get-started/)、[IP 估算地理信息](https://developers.cloudflare.com/workers/runtime-apis/request/)。

## 本地测试

在仓库根目录使用 Node.js 22.10 或以上版本：

```bash
node --experimental-sqlite --test private-analytics/worker.test.mjs
```

测试使用内存 SQLite，覆盖数据写入、重复事件去重、IP 汇总、拒绝公开查询、错误来源/无效负载、数据库异常和浏览器上报逻辑；不向 Cloudflare 写入真实数据。
