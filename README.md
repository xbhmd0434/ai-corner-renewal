# AI 一角焕新

把短视频里的家居灵感，适配到我的真实空间。

AI 一角焕新是一个面向年轻租房和家居兴趣用户的空间适配产品原型。用户选择一段家居灵感、上传自己的书桌照片并补充预算和生活限制，系统生成可预览、可解释、可购买、可执行的一角焕新方案。

> 当前集成版本的主界面位于 `apps/douyin-demo`。推荐流、图片上传、空间解析与
> 确认、设计任务、生成进度、资产历史和方案详情已经接入资源化 `/api/v1` 与
> SQLite 持久化后端。兼容 AICard 页面、Agent Plan 空间理解与 Seedream 主方案
> 效果图仍保留在 `apps/web`，可通过独立命令运行。
> 商品库存、内容召回、候选方案效果图和预算调整后的效果图仍使用可重复的样例
> 数据，不代表已经接入抖音内部接口。
> 本项目不是抖音官方产品，也不宣称拥有任何平台私有数据。

## 在线体验范围

当前默认启动版本跑通：

```text
从推荐流进入焕新，或直接上传图片
→ 上传空间
→ 确认空间识别结果并封存版本
→ 设置预算与硬约束
→ 创建任务并查看生成进度
→ 查看前后效果、商品、步骤与校验
→ 从资产和方案历史重新打开
```

焕新界面采用单核心卡片：灵感、真实空间、生活约束、生成进度和结果都在同一
上下文中切换；“我的收藏”和“历史方案”使用底部抽屉，不再把用户带到独立后台页。
桌面端显示项目叙事与 430px 手机舞台，移动端直接占满视口。

主要特性：

- 三组可切换的家居灵感与结构化提取结果
- JPEG/PNG/WebP 上传、私有媒体存储、短时访问地址和空间版本确认
- 资产、不可变任务快照、异步运行、方案版本与重启后恢复
- 预算、租房、保留家具和宠物等约束
- 改造前后对比、商品清单、步骤和可信校验
- 结果中继续降低预算或更换风格，每次调整创建新的方案版本
- 推荐流“焕新”入口携带当前视频的最小灵感上下文
- 视频手动暂停后可进入“一角焕新”定帧框选，选择明确标注的视觉搜索候选，
  并把用户确认的商品保存为独立单品资产；真实视觉搜索与模型版本接口仍待后端实现
- 桌面端和移动端响应式体验
- 正式流水线先生成 LayoutPlan 和 ProductSlot，再由 Seedream 生成主效果图并
  通过服务端 RenderEvaluator 验收；结果进入私有媒体和 PlanVersion

## 本地运行

需要 Node.js 22.5 或更高版本（推荐 Node 24）。首次运行先安装依赖：

```bash
npm install
npm run check
npm run check:douyin-integration
npm start
```

打开 `http://127.0.0.1:8765/douyin-static-demo/index.html`；后端默认运行于
`http://127.0.0.1:8787`。如果默认端口已被占用，启动器会复用兼容后端并自动
选择空闲前端端口，请以终端打印地址为准。

`npm start` 会同时启动抖音前端、同源 API 代理和持久化后端。只启动新版静态
前端可使用 `npm run start:douyin-web`，只启动后端使用
`npm run start:backend`。旧兼容 AICard/Agent Plan 页面使用
`npm run start:classic`。旧 3D 试搭与 Prompt 实验台已经从项目移除，规划和生图
能力统一由正式焕新流水线拥有。
后端可独立验证：

```bash
npm run demo:backend
```

这条命令会完成 `health → generate(¥500) → revise(¥300)`，验证调整后的
商品组合、总价和校验报告一致。完整接口说明见
[`docs/backend-api.md`](docs/backend-api.md)。

本地后端会读取项目根目录下被 Git 忽略的 `.env` 和 `.env.local`，但操作系统/
部署平台环境变量优先。配置 Agent Plan 时只把专属 Key 放入 `.env.local`，然后
运行低消耗鉴权检查：

```bash
npm run check:agent-plan
npm run check:agent-plan-room
npm run check:agent-plan-image
```

第一条命令做低消耗文本鉴权；第二条验收真实多模态 RoomProfile；第三条完整验收
`RoomProfile → Seedream → 私有媒体读取`。三者都不输出 Key、图片 Base64、
完整提示词或供应方正文。真实空间理解与生图需把 `AI_BACKEND_MODE=auto` 和
`ROOM_ANALYZER_PROVIDER=agent_plan` 写入 `.env.local`；失败时仍返回同协议 Demo
fallback。

后端也支持私有媒体、三类资产、SpaceVersion、不可变 DesignRequest、异步
GenerationRun、PlanAsset/PlanVersion、预算/换风格调整、偏好和受控事件。直接以
300 元生成会得到 240 元可执行组合；刷新和重启后仍能读取任务与版本。真实灵感
解析、真实商品接口、候选方案按需生图和预算调整后重绘尚未接入。

完整 `/api/v1` 契约可从 `docs/openapi.yaml` 导入 Apifox/Postman，服务运行后也可
读取 `GET /api/openapi.json`。修改路由或 Schema 后运行
`npm run openapi:generate`，根检查会拒绝未同步的契约。

## 项目结构

```text
apps/douyin-demo/         默认产品前端、同源代理、前端测试与视频素材
apps/web/                 兼容 AICard 页面与共享静态素材
packages/contracts/       AICard v1、/api/v1 Schema、共享路由清单与 OpenAPI 生成器
packages/validation/      预算、安装、结构、尺寸、库存和安全规则
services/orchestrator/    SQLite Repository、领域服务、Workflow、HTTP API 与适配器
examples/                 固定 AICard、8 个输入夹具和一键示例
docs/product-spec.md      产品方案与比赛口径
docs/architecture.md      数据对象、模块边界与演进架构
docs/backend-api.md       后端接口、状态、配置和验证方式
docs/openapi.yaml         可导入 Apifox/Postman 的 OpenAPI 3.1 契约
docs/visual-search-api.md 视频框选、视觉搜索、商品确认、资产与模型版本拟议契约
docs/model-integration.md 模型/Agent/精细图像 API 接入边界
docs/team-roles.md        当前三人团队分工、Prompt/前端/产品并行规则
docs/ai-github-playbook.md 让 AI 完成日常 GitHub 协作的提示词
docs/public-release.md    从私有协作到公开发布的检查表
scripts/                  本地服务器、仓库校验与模型连通性检查
.github/                  Issue、PR 和 CI 配置
HANDOFF.md                可持续维护的工程交接文档
```

## 成熟度

- 抖音产品前端：可持久联调集成原型；上传、空间确认、设计任务、生成运行、资产
  和方案历史已接 `/api/v1`；视频框选与候选选择可演示，候选当前为明确标注的
  本地 Demo，确认后优先写入真实 ItemAsset。
- 兼容 Web：运行时 Live 集成原型；上传、`generate → revise(300)`、来源状态
  和错误提示已接 AICard API，保存仍只是本地摘要。
- 后端：可持久联调版；默认离线生成，资源、任务和方案可跨重启恢复。
- 公网交付：共享访问口令、会话 Cookie、限流、AI 总开关、单端口静态托管和
  Docker 已接入；仍需在目标平台填写密钥并完成线上验收。
- 尚未实现：真实内容商品、厘米级测量、持续视频理解、真实交易和硬装施工建议。

## 团队协作

项目当前由三人共同维护，按“产品与验收、前端体验与实现、后端生图 Prompt 与评测”
划分长期所有权。三条线可以并行，但用户路径、接口协议和发布候选必须共同冻结，
详见 [`docs/team-roles.md`](docs/team-roles.md)。

所有功能通过 Issue 描述验收标准，通过短分支和 Pull Request 合并。`main` 应始终保持可演示。

没有 GitHub 协作经验时，可以直接复制 [`docs/ai-github-playbook.md`](docs/ai-github-playbook.md) 中的提示词，让 AI 完成检查、建分支、修改、测试、提交和创建 PR。

## 开源与数据边界

代码采用 [MIT License](LICENSE)。演示图片和其他素材不自动适用代码许可证，详见 [ASSETS_LICENSE.md](ASSETS_LICENSE.md)。

公开仓库不会包含：

- 访问密钥、平台内部接口或真实用户数据
- 未经授权的达人视频、封面和 Workshop 资料
- 生产排序权重、真实商业数据和内部评测日志

当前页面先在浏览器压缩预览图片，点击生成后以 Data URL 发送给本地兼容接口，
仅用于当次 Agent Plan 空间理解，不通过这条兼容链路持久化。迁到
`/api/v1/media` 后，后端会清理元数据并写入非静态私有目录，以短时签名 URL 访问。
Agent Plan 地址固定为官方 `ark.cn-beijing.volces.com/api/plan/v3`，原图不进入
AICard、事件或日志；页面必须以 `LIVE / FALLBACK / DEMO` 如实标记调用来源。

安全问题请参阅 [SECURITY.md](SECURITY.md)，参与开发请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
