# AI 一角焕新 · 比赛网页部署方案

> 目标：给评委一个可直接打开的 HTTPS 链接，移动端优先；评委不需要安装软件、
> clone 仓库或配置密钥。
>
> 当前状态：**代码侧部署改造已完成并通过生产烟测，实施基线为
> `51f54c8`；待推送 GitHub，然后购买服务器并由 Zeabur 完成首次 Docker 构建。**
>
> 最近核对：2026-07-26

## 1. 已确定的部署结论

本项目采用以下固定方案，不再让执行者临时选择架构：

| 项目 | 决定 |
| --- | --- |
| 产品入口 | `apps/douyin-demo/douyin-static-demo` |
| 部署形态 | 一个 Docker 服务同时提供静态前端和 `/api` |
| 公网入口 | 一个 Zeabur HTTPS 域名，前后端同源 |
| 运行时 | Node.js 24；Docker 使用 Debian slim 系镜像 |
| AI | 服务端调用火山方舟 Agent Plan / Seedream |
| 3D | 旧 3D/试搭与 Hunyuan 链路已从项目移除 |
| 数据 | SQLite 与私有媒体统一放在 `/app/data` |
| 扩容 | 比赛期只允许单实例，避免 SQLite 多实例写入冲突 |
| 安全 | 访问口令会话、AI 接口限流、总开关、请求体限制 |
| 故障兜底 | Provider 不可用时给出明确状态并保留固定演示路径 |

选择“前后端同一个服务、同一个域名”的原因：

1. Zeabur 的 Git 服务只公开一个 Web 端口；
2. 前端不需要维护另一个 API 域名；
3. 浏览器请求天然同源，不需要长期开放 `CORS_ORIGINS=*`；
4. 一个链接最符合比赛评审体验；
5. SQLite、上传素材和服务端签名 URL 的边界更容易控制。

## 2. 2026 年 Zeabur 的实际情况

Zeabur 的共享集群已经弃用，新项目不能再创建到共享集群。新账号创建项目时，
需要：

1. 选择已有 Server；
2. 从 Zeabur 购买 Server；
3. 绑定自己已有的外部 Server。

因此控制台出现“购买新服务器”和 AWS、GCP、Hetzner、Linode、
Digital Ocean、Aliyun、Tencent 等供应商选项是正常现象，不是操作错误。

需要特别注意：

- 购买 Server 是**按月固定价格**，不是旧方案所写的免费共享 trial；
- 购买后默认自动续费，比赛结束后要明确决定保留还是取消；
- 任何结账动作必须先看清月费，并由项目所有者确认；
- 不要为了“先占位置”提前购买，服务器不会解决当前代码的公网安全门槛。

官方参考：

- [共享集群已弃用](https://zeabur.com/docs/en-US/server/shared-cluster)
- [创建项目](https://zeabur.com/docs/zh-CN/deploy/create/create-project)
- [购买服务器与计费](https://zeabur.com/docs/zh-CN/server/purchase)

## 3. 服务器选择规则

只有在第 4 节的代码门槛完成到允许首次 Zeabur 构建时才购买。

推荐顺序：

1. `Tencent`，地区选择 **Hong Kong**；
2. 如果 Tencent 没有香港方案，选择 `Aliyun` 的 **Hong Kong**；
3. 如果两者均无香港方案或月费超预算，停止购买，重新比较其他平台；
4. 不选择中国大陆地区作为本次默认方案，避免域名备案和临时公网访问限制；
5. 不选择 GPU，本项目云端不运行本地大模型。

最低规格：

| 资源 | 要求 |
| --- | --- |
| CPU | 1 vCPU 起 |
| 内存 | 2 GB 起 |
| 磁盘 | 20 GB 起 |
| 网络 | 必须有公网 HTTPS 域名与正常出站访问 |
| GPU | 不需要 |

同地区、同规格时选择月费更低、出站流量更充足的方案。不要为了性能购买
4 核、8 GB 或 GPU；真实生成发生在火山方舟，服务器主要运行 Node、SQLite 和
静态文件。

## 4. 购买服务器前必须通过的门槛

当前实现状态：

| Gate | 状态 | 证据 |
| --- | --- | --- |
| A 开发基线 | 已完成 | 分支 `agent/update-30h-team-plan`，实施基线 `51f54c8`，209 项唯一测试通过 |
| B 正式入口 | 已完成 | 单端口 `/` 已返回抖音版首页 |
| C 公网安全 | 已完成 | 口令页、401、Cookie、AI 总开关自动测试与烟测通过 |
| D 单端口 | 已完成 | 公网配置临时端口健康、登录、首页均通过 |
| E Docker/持久化 | 部分完成 | Dockerfile/路径/SQLite 烟测通过；本机无 Docker CLI，镜像由 Zeabur 首次构建验证 |

### Gate A：开发基线稳定

- 后端并行任务已经完成并形成明确 Commit SHA；
- 工作区不再存在来源不明的未提交业务改动；
- 前后端共同使用同一版 OpenAPI / Schema；
- `npm.cmd run check` 全部通过。

验收：记录准备部署的 Branch、Commit SHA 和测试数量。

### Gate B：正式前端入口冻结

- `/` 打开 `apps/douyin-demo/douyin-static-demo/index.html`；
- `renewal.html`、`me.html` 及静态资源均可访问；
- 页面请求统一走相对路径 `/api/...`；
- 不把旧 `apps/web` 误当成比赛首页。

验收：本地生产模式打开 `/`，手机尺寸下走完主流程。

### Gate C：公网安全能力完成

当前后端仍固定使用 `demo-user-001`，共享口令保护比赛入口但不是多用户身份隔离。
已经实现：

- 访问口令由后端校验，成功后发放短期 HttpOnly 会话 Cookie；
- AI 生成接口按会话和来源 IP 限流；
- 设置全局 AI 调用开关和并发上限；
- 上传、生成、搜索等高成本接口继续限制请求体；
- API Key、访问口令、Cookie 签名密钥仅放部署平台环境变量；
- 未配置访问保护时，程序必须继续拒绝监听公网地址。

验收：未登录访问高成本 API 得到 401；超限得到 429；密钥不出现在前端、
日志、Git 历史和 Docker 镜像中。

### Gate D：单端口生产运行完成

- 后端读取部署平台注入的 `PORT`；
- 生产环境监听 `0.0.0.0`，但只在 Gate C 配置完整时允许；
- `/api/*` 走现有 API；
- 前端历史目录中的五个 `/api/*.js` 浏览器模块只按精确白名单作为静态资源提供，
  不能让宽泛静态规则覆盖真实 API；
- 其余路径安全地提供正式静态前端；
- 防止 `../` 等目录穿越；
- 未知页面返回明确 404，不能泄露服务器目录。

验收：一个本地端口同时通过 `/` 和 `/api/health`。

### Gate E：Docker 与持久化完成

- 根目录存在经过验证的 `Dockerfile` 和 `.dockerignore`；
- Docker 运行 Node.js 24；
- `/app/data` 存放 SQLite、WAL 和私有媒体；
- 数据目录作为 Zeabur Volume 持久化；
- 容器重启后资产、方案和私有媒体仍可读取；
- `.env`、`.env.local`、本地数据库、日志和测试产物不进入镜像。

验收：Zeabur 首次构建成功后创建测试数据，重启服务并确认数据仍存在。当前 Windows
开发机未安装 Docker CLI，不能把“Dockerfile 已存在”误写为“本地镜像已经构建”。

Gate A 已形成部署 Commit，可以进入第 5 节；Gate E 的镜像构建和 Volume 重启验证
在 Zeabur 首次部署中完成，失败则不绑定最终评审链接。

## 5. Zeabur 控制台操作

### 5.1 购买服务器

1. 左侧进入“项目”，点击“创建项目”；
2. 如果进入“购买新服务器”，保持“标准”，不要选择 GPU；
3. 先点 `Tencent`；
4. 在第二步筛选 `Hong Kong`；
5. 选择满足“1 vCPU、2 GB 内存、20 GB 磁盘”的最低价方案；
6. 截图或记录城市、配置、出站流量和月费；
7. **在确认购买页面先停下，由项目所有者确认月费后再付款**；
8. 如果没有香港方案，返回供应商选择，改看 `Aliyun`；
9. 付款后等待 Server 状态变为 `Running`；
10. 在该 Server 上创建项目，项目名建议 `ai-corner-renewal-demo`。

购买前不要选择：

- GPU；
- 中国大陆地域；
- 高于 2 vCPU / 4 GB 的方案；
- 不清楚月费和自动续费规则的方案。

### 5.2 连接 GitHub 仓库

1. 进入新项目；
2. 点击“部署新服务”；
3. 选择 Git / GitHub；
4. 授权 Zeabur 读取项目仓库；
5. 选择经过 Gate A 验证的仓库与分支；
6. 核对部署 Commit SHA，不要直接假定是 `main` 最新提交；
7. 让 Zeabur 使用仓库根目录的 `Dockerfile` 构建。

### 5.3 挂载持久卷

在服务的 Volume 设置中挂载：

```text
/app/data
```

说明：挂载 Volume 后，服务发布/重启会有短暂中断，不能零停机滚动切换；比赛低流量
单实例可以接受。重要演示数据仍需单独备份。

### 5.4 配置环境变量

实际变量名必须以最终代码和 `.env.example` 为准。核心值如下：

```dotenv
AI_BACKEND_MODE=live
ROOM_ANALYZER_PROVIDER=agent_plan
AGENT_PLAN_BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3
AGENT_PLAN_API_KEY=<只在 Zeabur 页面粘贴，绝不提交>
AGENT_PLAN_TEXT_MODEL=doubao-seed-2.0-lite
AGENT_PLAN_IMAGE_MODEL=doubao-seedream-5.0-lite
AGENT_PLAN_DISCOVERY_TIMEOUT_MS=45000
AGENT_PLAN_DISCOVERY_RESPONSE_LIMIT_BYTES=524288
DATA_DIRECTORY=/app/data
DATABASE_PATH=/app/data/ai-corner-renewal.sqlite
PRIVATE_MEDIA_DIRECTORY=/app/data/private-media
```

上线安全改造完成后还应配置：

```dotenv
DEMO_ACCESS_CODE=<单独生成的比赛访问口令>
SESSION_SIGNING_SECRET=<至少 32 字节随机值>
SESSION_TTL_SECONDS=14400
TRUST_PROXY=true
AUTH_ATTEMPTS_PER_WINDOW=10
AUTH_WINDOW_SECONDS=900
API_REQUESTS_PER_MINUTE=240
AI_REQUESTS_PER_MINUTE=12
AI_MAX_CONCURRENT=2
AI_REQUESTS_ENABLED=true
```

注意：

- `AI_BACKEND_MODE` 当前合法值是 `demo / auto / live`，不能写 `agent_plan`；
- `ROOM_ANALYZER_PROVIDER` 才填写 `agent_plan`；
- 不配置 `HUNYUAN_*`；
- 不把 `CORS_ORIGINS` 设置成 `*`；
- 同域部署时使用准确域名，或按最终实现保持同源策略；
- Key 和访问口令不要发到聊天、截图或 GitHub。

### 5.5 生成域名

1. 在服务 Networking / Domain 页面生成 `.zeabur.app` 域名；
2. 如需允许独立前端来源，将 `CORS_ORIGINS` 设置为准确 HTTPS 地址；单域部署不
   使用 `*`；
3. 重新部署；
4. 记录域名、Branch、Commit SHA 和部署时间。

## 6. 上线验收

必须用手机流量或与开发机不同的网络完成，不只测本机 Wi-Fi。

### 基础验收

1. `https://<domain>/` 打开正式抖音版首页；
2. `https://<domain>/api/health` 返回健康 JSON；
3. HTTPS 证书正常；
4. 未输入访问口令不能调用 AI；
5. 登录后刷新页面，会话在约定时间内有效；
6. 前端控制台没有 CORS、404 或混合内容错误。

### 主流程验收

1. 进入焕新页；
2. 选择灵感、空间和约束；
3. 发起真实分析与生成；
4. 得到主效果图；
5. 运行商品发现，确认页面显示“视觉 Agent”工作说明、真实热点和检索需求；
6. 保存方案；
7. 查看相关设计和实施清单；
8. 重启服务后重新读取保存内容；
9. 上传并删除一张测试图，确认旧签名 URL 失效。

### 故障验收

1. 暂时关闭真实 Provider，页面不能无限转圈；
2. 超时必须给出可理解的提示和重试入口；
3. 连续触发限流后返回 429，不能继续消耗模型；
4. AI 总开关关闭后，静态演示路径仍能打开；
5. 日志不能打印 API Key、访问口令或图片二进制。

## 7. 比赛交付物

最终至少准备：

- 公网 HTTPS 链接；
- 访问口令；
- 60～90 秒备用录屏；
- 一套固定演示输入和预期结果；
- 部署 Commit SHA；
- 本地源码备份；
- 火山方舟消费提醒；
- Zeabur 服务器月费、续费日和比赛后处理日期。

建议在提交说明中写：

```text
在线体验：https://<domain>
建议使用手机浏览器打开。
AI 生成通常需要一定等待时间；若现场网络异常，可查看备用演示视频。
```

## 8. 回滚与比赛后处理

### 发布失败

1. 不删除原持久卷；
2. 回滚到最近一次通过上线验收的 Commit；
3. 检查 `/api/health`、首页和一条固定演示路径；
4. 确认恢复后再继续开发。

### 比赛结束

1. 关闭 AI 实时调用或撤销旧 API Key；
2. 导出需要保留的 SQLite 与私有媒体；
3. 删除不需要的评委上传数据；
4. 决定保留或取消 Zeabur Server 自动续费；
5. 记录最终部署版本和数据处理结果。

## 9. 当前下一步

现在应当：

1. 审查当前差异并形成明确部署 Commit SHA；
2. 推送经过检查的生产分支到 GitHub；
3. 购买已确认的 Tencent Hong Kong 2 vCPU / 2 GB / 40 GB、US$6/月 Server；
4. 连接 GitHub，先填写安全变量与 Demo 模式变量；
5. 让 Zeabur 完成首次 Docker 构建；
6. 挂载 `/app/data` 后做重启持久化验证；
7. 再填写真实 Agent Plan Key，完成一条真实生成并提交评审链接。

当前不应当：

- 随便选择一个供应商并付款；
- 把本地 API Key 提交到仓库；
- 未配置访问口令与签名密钥就尝试公网启动；
- 使用 `CORS_ORIGINS=*`；
- 把旧 `apps/web` 部署成比赛首页；
- 跳过首次 Zeabur 构建日志和 Volume 重启验证。
